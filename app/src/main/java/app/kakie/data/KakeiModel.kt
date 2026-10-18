package app.kakie.data

import android.app.Application
import android.graphics.pdf.PdfDocument
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import app.kakie.core.Draft
import app.kakie.core.Expense
import app.kakie.core.FormatRule
import app.kakie.core.Group
import app.kakie.core.Hit
import app.kakie.core.McpData
import app.kakie.core.MerchantRule
import app.kakie.core.Person
import app.kakie.core.Settlement
import app.kakie.core.dueRecurring
import app.kakie.core.equalShares
import app.kakie.core.handleMcp
import app.kakie.core.initials
import app.kakie.core.isRecentDupe
import app.kakie.core.localNoon
import app.kakie.core.openBackup
import app.kakie.core.parseSms
import app.kakie.core.parseWithRules
import app.kakie.core.sealBackup
import app.kakie.core.slugTag
import app.kakie.core.uid
import app.kakie.sms.LocalMcp
import app.kakie.sms.SmsInbox
import app.kakie.sms.SmsReceiver
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.time.LocalDate
import java.time.LocalDateTime

class KakeiModel(app: Application) : AndroidViewModel(app) {
    private val file = File(app.filesDir, "ledger.json")
    private val secure = EncryptedSharedPreferences.create(
        app,
        "kakei.secure",
        MasterKey.Builder(app).setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build(),
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
    )

    var book by mutableStateOf(bookFrom(file.takeIf { it.exists() }?.readText()))
        private set
    var toast by mutableStateOf("")
    var busy by mutableStateOf(false)
    var unlocked by mutableStateOf(!book.lock)

    init {
        LocalMcp.data = { mcpData() }
        refreshSms()
        if (book.devMcp && book.devToken.length >= 16) {
            try { LocalMcp.start(app, book.devPort, book.devToken, book.devLan) } catch (_: Exception) {}
        }
    }

    fun password(): String = secure.getString("kakei.backupPass", "").orEmpty()

    private fun savePass(pass: String) { secure.edit().putString("kakei.backupPass", pass).apply() }

    private fun edit(next: Book) {
        book = next
        file.writeText(next.toJson())
        val tags = JSONObject()
        next.rules.forEach { rule -> if (rule.tag != null) tags.put(rule.key, rule.tag) }
        SmsInbox.setTags(getApplication(), tags.toString())
        SmsInbox.setNotify(getApplication(), next.smsOn)
    }

    fun toast(text: String) { toast = text }

    fun skipLocal(name: String, budget: Double) {
        val you = Person(uid(), name.ifBlank { "You" }, initials(name.ifBlank { "You" }))
        edit(book.copy(entered = true, local = true, token = null, you = you, budget = budget, pro = false))
    }

    fun setServer(base: String) { edit(book.copy(base = base.trim().ifBlank { DEFAULT_API })) }

    fun signup(name: String, phone: String, password: String) = account("signup", name, phone, password)

    fun login(phone: String, password: String) = account("login", book.you.name, phone, password)

    private fun account(kind: String, name: String, phone: String, password: String) {
        busy = true
        viewModelScope.launch {
            val err = withContext(Dispatchers.IO) {
                try {
                    val body = JSONObject().put("phone", phone).put("password", password)
                    if (kind == "signup") body.put("name", name.ifBlank { "You" })
                    val res = apiCall(book.base, null, "POST", "/auth/$kind", body)
                    val token = res.optString("token")
                    val you = res.optJSONObject("you")
                    val person = Person(you?.optString("id") ?: uid(), you?.optString("name") ?: name, initials(you?.optString("name") ?: name))
                    savePass(password)
                    val empty = book.expenses.isEmpty() && book.groups.isEmpty()
                    var next = book.copy(entered = true, local = false, token = token, you = person, phone = phone, pro = res.optBoolean("pro"))
                    if (empty) {
                        try {
                            val backup = apiCall(next.base, token, "GET", "/backup")
                            val opened = openBackup(backup.getString("wrap"), backup.getString("blob"), password)
                            next = next.applyBackup(opened).copy(entered = true, local = false, token = token, you = person, phone = phone)
                        } catch (err: ApiError) {
                            if (err.status != 404) { /* a different password stays sealed */ }
                        } catch (_: Exception) {
                            edit(next)
                            return@withContext null
                        }
                    }
                    next = pull(next)
                    edit(next)
                    pushBackup(next, password)
                    null
                } catch (err: Exception) {
                    err.message ?: "Could not reach the server"
                }
            }
            busy = false
            if (err != null) toast = err
        }
    }

    fun resetPassword(phone: String, otp: String, password: String, done: () -> Unit) {
        viewModelScope.launch {
            val err = withContext(Dispatchers.IO) {
                try {
                    apiCall(book.base, null, "POST", "/auth/reset", JSONObject().put("phone", phone).put("otp", otp).put("password", password))
                    null
                } catch (err: Exception) { err.message }
            }
            if (err == null) done() else toast = err
        }
    }

    fun requestReset(phone: String) {
        viewModelScope.launch {
            val err = withContext(Dispatchers.IO) {
                try { apiCall(book.base, null, "POST", "/auth/otp", JSONObject().put("phone", phone).put("purpose", "reset")); null }
                catch (err: Exception) { err.message }
            }
            toast = err ?: "If that number has an account, a code is on its way"
        }
    }

    private fun pull(current: Book): Book {
        if (current.token.isNullOrBlank()) return current
        val remote = apiCall(current.base, current.token, "GET", "/sync")
        val people = remote.optJSONArray("people").toPeople()
        val groups = remote.optJSONArray("groups").toGroups()
        val groupExpenses = remote.optJSONArray("expenses").toExpenses()
        val settlements = remote.optJSONArray("settlements").toSettlements()
        val personal = current.expenses.filter { it.groupId == null }
        val settings = remote.optJSONObject("settings")?.optJSONObject("remoteMcp")
        return current.copy(
            pro = remote.optBoolean("pro", current.pro),
            people = people,
            groups = groups,
            expenses = personal + groupExpenses,
            settlements = settlements,
            remote = settings?.optBoolean("enabled") ?: current.remote,
            remoteId = settings?.optString("publicId") ?: current.remoteId,
            remoteToken = if (settings?.optString("publicId") == current.remoteId) current.remoteToken else "",
        )
    }

    fun syncNow() {
        if (!book.signedIn) return
        viewModelScope.launch {
            val err = withContext(Dispatchers.IO) {
                try {
                    flush(book)
                    edit(pull(book))
                    null
                } catch (err: Exception) { err.message }
            }
            if (err != null) toast = err
        }
    }

    private fun flush(current: Book) {
        if (current.outbox.isEmpty() || current.token.isNullOrBlank()) return
        val ops = JSONArray()
        current.outbox.forEach { ops.put(it) }
        apiCall(current.base, current.token, "POST", "/ops", JSONObject().put("ops", ops))
        edit(current.copy(outbox = emptyList()))
    }

    private fun queue(op: JSONObject, next: Book): Book {
        val expense = op.optJSONObject("expense")
        if (op.optString("type") == "expense.upsert" && expense?.isNull("groupId") != false && expense?.optString("groupId").isNullOrBlank()) {
            return next
        }
        return if (next.signedIn) next.copy(outbox = next.outbox + op) else next
    }

    fun addExpense(expense: Expense) {
        val tags = expense.tag?.let { slugTag(it) }?.takeIf { it.isNotEmpty() }
        var next = book.copy(expenses = listOf(expense) + book.expenses.filter { it.id != expense.id })
        if (tags != null && tags !in next.tags) next = next.copy(tags = next.tags + tags)
        val op = JSONObject().put("type", "expense.upsert").put("expense", expense.toJson())
        next = queue(op, next)
        edit(next)
        if (next.signedIn) viewModelScope.launch(Dispatchers.IO) { try { flush(book); pushBackup(book, password()) } catch (_: Exception) {} }
        else if (password().isNotEmpty()) viewModelScope.launch(Dispatchers.IO) { try { pushBackup(book, password()) } catch (_: Exception) {} }
    }

    fun deleteExpense(id: String) {
        val next = queue(JSONObject().put("type", "expense.delete").put("id", id), book.copy(expenses = book.expenses.filter { it.id != id }))
        edit(next)
    }

    fun saveGroup(group: Group, members: List<Person> = emptyList()) {
        val people = (book.people + members).distinctBy { it.id }
        val op = JSONObject().put("type", "group.upsert").put("group", JSONObject().put("id", group.id).put("name", group.name).put("icon", group.icon).put("note", group.note).put("kind", group.kind ?: "group"))
        var next = queue(op, book.copy(groups = listOf(group) + book.groups.filter { it.id != group.id }, people = people))
        members.forEach { person ->
            next = queue(JSONObject().put("type", "person.add").put("groupId", group.id).put("person", JSONObject().put("id", person.id).put("name", person.name)), next)
        }
        edit(next)
        if (next.signedIn) viewModelScope.launch(Dispatchers.IO) { try { flush(book) } catch (_: Exception) {} }
    }

    fun settle(groupId: String, toId: String, amount: Double) {
        val row = Settlement(uid(), groupId, book.you.id, toId, amount, LocalDateTime.now().toString().take(19))
        val next = queue(JSONObject().put("type", "settlement.upsert").put("settlement", JSONObject().put("id", row.id).put("groupId", row.groupId).put("fromId", row.fromId).put("toId", row.toId).put("amount", row.amount).put("at", row.at)), book.copy(settlements = listOf(row) + book.settlements))
        edit(next)
    }

    fun join(code: String, done: (String?) -> Unit) {
        viewModelScope.launch {
            val err = withContext(Dispatchers.IO) {
                try {
                    apiCall(book.base, book.token, "POST", "/join", JSONObject().put("code", code.trim()))
                    edit(pull(book))
                    null
                } catch (err: Exception) { err.message ?: "Could not join" }
            }
            if (err == null) done(null) else toast = err
        }
    }

    fun setBudget(amount: Double) { edit(book.copy(budget = amount)) }

    fun setTagBudget(tag: String, amount: Double) {
        val slug = slugTag(tag)
        if (slug.isEmpty()) return
        val map = book.tagBudgets.toMutableMap()
        if (amount > 0) map[slug] = amount else map.remove(slug)
        var next = book.copy(tagBudgets = map)
        if (slug !in next.tags && amount > 0) next = next.copy(tags = next.tags + slug)
        edit(next)
    }

    fun setSms(on: Boolean) { edit(book.copy(smsOn = on)) }

    fun setLock(on: Boolean) { edit(book.copy(lock = on)); if (!on) unlocked = true }

    fun setDigest(on: Boolean) { edit(book.copy(digest = on)) }

    fun setAskOk(on: Boolean) { edit(book.copy(askOk = on)) }

    fun teach(draft: Draft, amountSlice: String?, merchantSlice: String?, tag: String?) {
        val formats = book.formats.toMutableList()
        if (amountSlice != null && merchantSlice != null) {
            val amountAt = app.kakie.core.spanContext(draft.body, amountSlice)
            val merchantAt = app.kakie.core.spanContext(draft.body, merchantSlice)
            if (amountAt != null && merchantAt != null) {
                formats.removeAll { it.sender == draft.sender }
                formats += FormatRule(draft.sender, amountAt.first, amountAt.second, merchantAt.first, merchantAt.second)
            }
        }
        val slug = slugTag(tag ?: draft.tag ?: "")
        val rules = book.rules.toMutableList()
        val key = (merchantSlice ?: draft.merchant).trim().lowercase()
        if (slug.isNotEmpty() && key.isNotEmpty()) {
            rules.removeAll { it.key == key }
            rules += MerchantRule(key, slug)
        }
        edit(book.copy(formats = formats, rules = rules))
    }

    fun fileDraft(draft: Draft, tag: String?) {
        if (draft.amount <= 0) return
        val slug = slugTag(tag ?: "") .ifEmpty { draft.tag }
        val expense = Expense(uid(), draft.merchant.ifBlank { "Payment" }, draft.amount, draft.at, slug, draft.rail, draft.income, draft.transfer, groupId = null, payerId = null, shares = null, bank = draft.bank, account = draft.account)
        edit(book.copy(queue = book.queue.filter { it.id != draft.id }))
        addExpense(expense)
    }

    fun dropDraft(id: String) { edit(book.copy(queue = book.queue.filter { it.id != id })) }

    fun refreshSms() {
        val ctx = getApplication<Application>()
        val rows = SmsInbox.drain(ctx)
        val actions = SmsInbox.drainActions(ctx)
        var next = book
        val seen = next.seen.toMutableSet()
        val recent = next.recent.toMutableList()
        val fresh = mutableListOf<Draft>()
        for (row in rows) {
            val sender = row["sender"] as String
            val body = row["body"] as String
            val key = "$sender\n$body"
            if (!seen.add(key)) continue
            val date = java.util.Date((row["date"] as Long))
            val at = localNoon(date.year + 1900, date.month + 1, date.date)
            val parsed = parseWithRules(sender, body, next.formats, next.rules)
            val draft = if (parsed == null) {
                if (body.trim().length < 12) continue
                Draft(row["id"] as String, key, sender, "Bank", body, at, 0.0, false, false, "", "upi", null, null)
            } else Draft(row["id"] as String, key, sender, parsed.bank, body, parsed.at ?: at, parsed.amount, parsed.income, parsed.transfer, parsed.merchant, parsed.rail, parsed.tag, parsed.account)
            if (draft.amount > 0 && draft.merchant.isNotEmpty() && isRecentDupe(recent, draft.merchant, draft.amount, date.time)) continue
            if (draft.amount > 0 && draft.merchant.isNotEmpty()) recent += Hit(draft.merchant.lowercase(), draft.amount, date.time)
            fresh += draft
        }
        next = next.copy(seen = seen.toList().takeLast(2000), recent = recent.takeLast(50), queue = fresh + next.queue)
        for (action in actions) {
            if (action["kind"] == "drop") {
                next = next.copy(queue = next.queue.filter { it.id != action["id"] })
                continue
            }
            val draft = next.queue.find { it.id == action["id"] } ?: continue
            if (draft.amount <= 0) continue
            val tag = slugTag(action["tag"] ?: "").ifEmpty { draft.tag }
            val expense = Expense(uid(), draft.merchant.ifBlank { "Payment" }, draft.amount, draft.at, tag, draft.rail, draft.income, draft.transfer, bank = draft.bank, account = draft.account)
            next = next.copy(queue = next.queue.filter { it.id != draft.id }, expenses = listOf(expense) + next.expenses, tags = if (tag != null && tag !in next.tags) next.tags + tag else next.tags)
        }
        val due = dueRecurring(next.expenses, LocalDateTime.now().toString())
        if (due.isNotEmpty()) next = next.copy(expenses = due + next.expenses)
        edit(next)
    }

    fun showTestSms() {
        val ctx = getApplication<Application>()
        edit(book.copy(smsOn = true))
        val body = "Sent Rs.42.50\nTo Chai\nUPI"
        val id = SmsInbox.push(ctx, "VM-HDFCBK", body, System.currentTimeMillis())
        SmsReceiver.post(ctx, id, body)
        refreshSms()
    }

    fun loadSample() {
        val you = book.you.id
        val tail = you.take(8)
        fun id(key: String) = if (key == "you") you else "$key-$tail"
        fun person(key: String, name: String, initials: String) = Person(id(key), name, initials)
        val people = listOf(person("aarav", "Aarav Mehta", "AM"), person("meera", "Meera Iyer", "MI"), person("kabir", "Kabir Shah", "KS"), person("riya", "Riya Das", "RD"), person("ishaan", "Ishaan Bhatt", "IB"), person("tara", "Tara Kapoor", "TK"))
        fun group(key: String, name: String, icon: String, members: List<String>, note: String, kind: String = "group") = Group(id(key), name, icon, members.map { id(it) }, note, sample = true, kind = kind)
        val groups = listOf(
            group("goa", "Goa trip", "beach", listOf("aarav", "meera", "kabir"), "18-22 Sep"),
            group("flat", "Flat 402", "office-building", listOf("riya", "kabir"), "Shared home"),
            group("lunch", "Friday lunches", "silverware-fork-knife", listOf("aarav", "ishaan", "tara"), "Office"),
            group("cab", "Airport cab", "call-split", listOf("tara"), "", "split"),
        )
        fun solo(key: String, merchant: String, amount: Double, at: String, tag: String, rail: String, income: Boolean = false) =
            Expense(id(key), merchant, amount, at, tag, rail, income, sample = true)
        val expenses = listOf(
            solo("t1", "Third Wave Coffee", 320.0, localNoon(2026, 9, 28), "coffee", "upi"),
            solo("t7", "Acme Technologies", 85000.0, localNoon(2026, 9, 25), "salary", "neft", true),
            solo("t11", "Swiggy", 340.0, localNoon(2026, 9, 21), "food", "upi"),
            solo("g1", "Dinner at Thalassa", 4800.0, localNoon(2026, 9, 19), "food", "upi").copy(groupId = id("goa"), payerId = you, shares = equalShares(4800.0, listOf(you, id("aarav"), id("meera"), id("kabir")))),
            solo("c1", "Airport cab", 900.0, localNoon(2026, 9, 27), "transport", "upi").copy(groupId = id("cab"), payerId = you, shares = equalShares(900.0, listOf(you, id("tara")))),
        )
        val used = expenses.mapNotNull { it.tag }.distinct()
        val queue = listOf("Rs.1240.00 debited from A/c XX4521 on 02-10-26 to VPA swiggy@icici. UPI Ref 426781234.").mapNotNull { body ->
            val parsed = parseSms("VM-HDFCBK", body) ?: return@mapNotNull null
            Draft(id("q1"), "sample|q1", "VM-HDFCBK", parsed.bank, body, parsed.at ?: localNoon(2026, 10, 2), parsed.amount, parsed.income, parsed.transfer, parsed.merchant, parsed.rail, parsed.tag, parsed.account, true)
        }
        edit(book.copy(people = people, groups = groups, expenses = expenses + book.expenses.filter { !it.sample }, queue = queue + book.queue.filter { !it.sample }, tags = (book.tags + used).distinct(), budget = if (book.budget == 0.0) 60000.0 else book.budget))
    }

    fun clearSample() {
        edit(book.copy(people = book.people.filter { person -> book.groups.none { it.sample && person.id in it.memberIds } }, groups = book.groups.filter { !it.sample }, expenses = book.expenses.filter { !it.sample }, settlements = book.settlements.filter { !it.sample }, queue = book.queue.filter { !it.sample }))
    }

    fun signOut() {
        val base = book.base
        edit(Book(base = base, entered = true, local = true, you = book.you, smsOn = book.smsOn, devPort = book.devPort))
        unlocked = true
    }

    fun downloadAccount(done: (String) -> Unit) {
        viewModelScope.launch {
            val text = withContext(Dispatchers.IO) {
                try { apiCall(book.base, book.token, "GET", "/account/export").toString(2) }
                catch (err: Exception) { err.message ?: "Could not download" }
            }
            done(text)
        }
    }

    fun deleteAccount(password: String, done: (String?) -> Unit) {
        viewModelScope.launch {
            val err = withContext(Dispatchers.IO) {
                try {
                    apiCall(book.base, book.token, "POST", "/account/delete", JSONObject().put("password", password))
                    null
                } catch (err: Exception) { err.message }
            }
            if (err == null) signOut()
            done(err)
        }
    }

    fun ask(question: String, done: (String) -> Unit) {
        if (!book.pro) { done("Pro is required"); return }
        viewModelScope.launch {
            val text = withContext(Dispatchers.IO) {
                try {
                    var history = JSONArray()
                    var answer = ""
                    for (i in 0 until 4) {
                        val body = JSONObject().put("consent", true).put("history", history)
                        if (i == 0) body.put("question", question)
                        val res = apiCall(book.base, book.token, "POST", "/ai/ask", body, 30_000)
                        history = res.optJSONArray("history") ?: history
                        if (res.optString("text").isNotBlank()) answer = res.optString("text")
                        val calls = res.optJSONArray("toolCalls") ?: JSONArray()
                        if (calls.length() == 0) break
                        val parts = JSONArray()
                        for (n in 0 until calls.length()) {
                            val call = calls.getJSONObject(n)
                            val ran = handleMcp(JSONObject().put("jsonrpc", "2.0").put("id", 1).put("method", "tools/call").put("params", JSONObject().put("name", call.optString("name")).put("arguments", call.optJSONObject("args") ?: JSONObject())).toString(), mcpData())
                            parts.put(JSONObject().put("functionResponse", JSONObject().put("name", call.optString("name")).put("response", JSONObject(ran.body))))
                        }
                        history.put(JSONObject().put("role", "user").put("parts", parts))
                    }
                    answer.ifBlank { "No answer" }
                } catch (err: Exception) { err.message ?: "Could not ask" }
            }
            edit(book.copy(askOk = true))
            done(text)
        }
    }

    fun confirmPlay(purchaseToken: String, productId: String, done: (String?) -> Unit) {
        viewModelScope.launch {
            val err = withContext(Dispatchers.IO) {
                try {
                    apiCall(book.base, book.token, "POST", "/billing/play", JSONObject().put("purchaseToken", purchaseToken).put("productId", productId))
                    edit(pull(book.copy(pro = true)))
                    null
                } catch (err: Exception) { err.message }
            }
            done(err)
        }
    }

    fun setLocalMcp(on: Boolean, lan: Boolean) {
        val token = book.devToken.ifBlank { uid() + uid() }
        edit(book.copy(devMcp = on, devLan = lan, devToken = token))
        val ctx = getApplication<Application>()
        if (on) try { LocalMcp.start(ctx, book.devPort, token, lan) } catch (err: Exception) { toast = err.message ?: "Port is busy" }
        else LocalMcp.stop(ctx)
    }

    fun createRemote(done: (String?) -> Unit) {
        viewModelScope.launch {
            val err = withContext(Dispatchers.IO) {
                try {
                    val res = apiCall(book.base, book.token, "POST", "/mcp/create", JSONObject().put("confirm", true))
                    edit(book.copy(remote = true, remoteId = res.optString("publicId"), remoteToken = res.optString("token")))
                    null
                } catch (err: Exception) { err.message }
            }
            done(err)
        }
    }

    fun setRemote(on: Boolean) {
        viewModelScope.launch(Dispatchers.IO) {
            try {
                apiCall(book.base, book.token, "POST", if (on) "/mcp/enable" else "/mcp/disable")
                edit(book.copy(remote = on))
            } catch (err: Exception) { toast = err.message ?: "Could not update" }
        }
    }

    fun regenerateRemote() {
        viewModelScope.launch(Dispatchers.IO) {
            try {
                val res = apiCall(book.base, book.token, "POST", "/mcp/regenerate")
                edit(book.copy(remoteId = res.optString("publicId", book.remoteId), remoteToken = res.optString("token")))
            } catch (err: Exception) { toast = err.message ?: "Could not replace the token" }
        }
    }

    fun csv(): String {
        val lines = mutableListOf("date,merchant,amount,tag,rail,group")
        for (e in book.expenses.sortedByDescending { it.at }) {
            lines += listOf(e.at.take(10), e.merchant, e.amount.toString(), e.tag ?: "", e.rail, e.groupId ?: "").joinToString(",")
        }
        return lines.joinToString("\n")
    }

    fun writePdf(file: File) {
        val doc = PdfDocument()
        val page = doc.startPage(PdfDocument.PageInfo.Builder(595, 842, 1).create())
        val paint = android.graphics.Paint().apply { textSize = 12f }
        page.canvas.drawText("Kakei", 40f, 40f, paint)
        book.expenses.take(40).forEachIndexed { i, e ->
            page.canvas.drawText("${e.at.take(10)}  ${e.merchant}  ${e.amount}", 40f, 70f + i * 18f, paint)
        }
        doc.finishPage(page)
        file.outputStream().use { doc.writeTo(it) }
        doc.close()
    }

    private fun pushBackup(current: Book, password: String) {
        if (!current.signedIn || !current.pro || password.isBlank()) return
        val (wrap, blob) = sealBackup(current.backupJson(), password)
        apiCall(current.base, current.token, "POST", "/backup", JSONObject().put("wrap", wrap).put("blob", blob))
    }

    private fun mcpData() = McpData(book.you, book.people, book.groups, book.expenses, book.settlements, book.budget, LocalDate.now().toString() + "T12:00:00")

    fun nameOf(id: String) = if (id == book.you.id) "You" else book.people.find { it.id == id }?.name ?: "Someone"
}

private fun JSONArray?.toPeople() = this?.let { (0 until length()).map { i -> getJSONObject(i) }.map { Person(it.optString("id"), it.optString("name"), initials(it.optString("name")), it.optBoolean("claimed")) } } ?: emptyList()
private fun JSONArray?.toGroups() = this?.let { (0 until length()).map { i -> getJSONObject(i) }.map { g -> Group(g.optString("id"), g.optString("name"), g.optString("icon"), g.optJSONArray("memberIds")?.let { a -> (0 until a.length()).map { a.optString(it) } } ?: emptyList(), g.optString("note"), g.optString("code").ifBlank { null }, g.optBoolean("owner"), g.optBoolean("sample"), if (g.has("simplify") && !g.isNull("simplify")) g.optBoolean("simplify") else null, g.optString("kind").ifBlank { null }) } } ?: emptyList()
private fun JSONArray?.toExpenses(): List<Expense> {
    if (this == null) return emptyList()
    return (0 until length()).map { bookFrom(JSONObject().put("expenses", JSONArray().put(getJSONObject(it))).toString()).expenses.first() }
}
private fun JSONArray?.toSettlements(): List<Settlement> {
    if (this == null) return emptyList()
    return (0 until length()).map { bookFrom(JSONObject().put("settlements", JSONArray().put(getJSONObject(it))).toString()).settlements.first() }
}
