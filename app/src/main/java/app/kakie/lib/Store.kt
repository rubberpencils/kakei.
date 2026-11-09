package app.kakie.lib

import android.os.Build
import android.util.AtomicFile
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import app.kakie.BuildConfig
import java.io.File
import java.time.Instant
import java.time.ZoneId
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.MainScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.decodeFromJsonElement
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

private val NOBODY = Person("me", "You", "YO")

private fun reachFromDevice(base: String): String {
    val emu = Build.FINGERPRINT.contains("generic") || Build.FINGERPRINT.contains("emulator") || Build.MODEL.contains("sdk")
    if (!emu) return base
    return base.replace("://localhost", "://10.0.2.2").replace("://127.0.0.1", "://10.0.2.2")
}

@Serializable
data class Local(
    val base: String = BuildConfig.API_URL,
    val token: String? = null,
    val you: Person = NOBODY,
    val phone: String = "",
    val people: List<Person> = emptyList(),
    val groups: List<Group> = emptyList(),
    val expenses: List<Expense> = emptyList(),
    val settlements: List<Settlement> = emptyList(),
    val tags: List<String> = TAGS,
    val budget: Double = 0.0,
    val history: List<MonthSnapshot> = emptyList(),
    val queue: List<Draft> = emptyList(),
    val seen: List<String> = emptyList(),
    val smsOn: Boolean = false,
    val outbox: List<Queued> = emptyList(),
    val syncedAt: Long? = null,
)

enum class SyncState { IDLE, SYNCING, OFFLINE }

private fun person(id: String, name: String, claimed: Boolean? = null, vpa: String? = null) = Person(id, name, initials(name), claimed, vpa)

// UPI IDs stay in memory only; the persisted cache is a plain file.
private fun withoutVpa(s: Local) = s.copy(
    you = s.you.copy(vpa = null),
    people = s.people.map { it.copy(vpa = null) },
    outbox = s.outbox.map { q -> if (q.op is MeSet && !q.op.vpa.isNullOrEmpty()) q.copy(op = q.op.copy(vpa = null)) else q },
)

private fun applyOp(s: Local, op: Op): Local = when (op) {
    is GroupUpsert -> {
        val p = op.group
        val found = s.groups.any { it.id == p.id }
        s.copy(
            groups = if (found) {
                s.groups.map {
                    if (it.id == p.id) it.copy(name = p.name, icon = p.icon, note = p.note, sample = p.sample ?: it.sample, simplify = p.simplify ?: it.simplify) else it
                }
            } else {
                listOf(Group(p.id, p.name, p.icon, emptyList(), p.note, owner = true, sample = p.sample, simplify = p.simplify)) + s.groups
            },
        )
    }
    is GroupDelete -> s.copy(
        groups = s.groups.filter { it.id != op.id },
        expenses = s.expenses.filter { it.groupId != op.id },
        settlements = s.settlements.filter { it.groupId != op.id },
    )
    is PersonAdd -> s.copy(
        people = if (s.people.any { it.id == op.person.id }) s.people else s.people + person(op.person.id, op.person.name),
        groups = s.groups.map { if (it.id == op.groupId && op.person.id !in it.memberIds) it.copy(memberIds = it.memberIds + op.person.id) else it },
    )
    is ExpenseUpsert -> s.copy(
        expenses = if (s.expenses.any { it.id == op.expense.id }) s.expenses.map { if (it.id == op.expense.id) op.expense else it } else listOf(op.expense) + s.expenses,
    )
    is ExpenseDelete -> s.copy(expenses = s.expenses.filter { it.id != op.id })
    is SettlementUpsert -> s.copy(
        settlements = if (s.settlements.any { it.id == op.settlement.id }) {
            s.settlements.map { if (it.id == op.settlement.id) op.settlement else it }
        } else {
            listOf(op.settlement) + s.settlements
        },
    )
    is SettlementDelete -> s.copy(settlements = s.settlements.filter { it.id != op.id })
    is PrefsSet -> s.copy(budget = op.prefs.budget ?: s.budget, tags = op.prefs.tags ?: s.tags, history = op.prefs.history ?: s.history)
    is MeSet -> s.copy(
        you = person(s.you.id, op.name ?: s.you.name, s.you.claimed, if (op.vpa == null) s.you.vpa else op.vpa.ifEmpty { null }),
    )
}

private fun enqueue(s: Local, ops: List<Op>): Local {
    var next = s
    for (op in ops) next = applyOp(next, op)
    return next.copy(outbox = next.outbox + ops.map { Queued(uid(), it) })
}

private fun rebase(s: Local, r: Remote): Local {
    var next = s.copy(
        you = person(r.you.id, r.you.name, null, r.you.vpa),
        phone = r.you.phone,
        people = r.people.map { person(it.id, it.name, it.claimed, it.vpa) },
        groups = r.groups,
        expenses = r.expenses,
        settlements = r.settlements,
        tags = r.prefs.tags ?: s.tags,
        budget = r.prefs.budget ?: 0.0,
        history = r.prefs.history ?: emptyList(),
        syncedAt = System.currentTimeMillis(),
    )
    for (q in s.outbox) next = applyOp(next, q.op)
    val due = dueRecurring(next.expenses)
    return if (due.isNotEmpty()) enqueue(next, due.map { ExpenseUpsert(it) }) else next
}

private fun draftFrom(sender: String, body: String, at: String, key: String): Draft? {
    val parsed = parseSms(sender, body) ?: return null
    return Draft(
        id = uid(), key = key, sender = sender, body = body, bank = parsed.bank, at = parsed.at ?: at, amount = parsed.amount,
        income = parsed.income, transfer = parsed.transfer, merchant = parsed.merchant, rail = parsed.rail, tag = parsed.tag, account = parsed.account,
    )
}

private fun addDrafts(s: Local, rows: List<InboxRow>): Pair<Local, Int> {
    val seen = LinkedHashSet(s.seen)
    val fresh = mutableListOf<Draft>()
    for (row in rows) {
        val key = "${row.sender}|${row.date}|${row.body.length}"
        if (!seen.add(key)) continue
        val d = Instant.ofEpochMilli(row.date).atZone(ZoneId.systemDefault()).toLocalDate()
        draftFrom(row.sender, row.body, localNoon(d.year, d.monthValue, d.dayOfMonth), key)?.let { fresh += it }
    }
    return s.copy(seen = seen.toList().takeLast(2000), queue = fresh + s.queue) to fresh.size
}

class Store(filesDir: File, private val device: Device) {
    private val scope = MainScope()
    private val file = AtomicFile(File(filesDir, "kakie.v2.json"))
    private val disk = Dispatchers.IO.limitedParallelism(1)

    var s by mutableStateOf(Local())
        private set
    var ready by mutableStateOf(false)
        private set
    var toast by mutableStateOf("")
        private set
    var sync by mutableStateOf(SyncState.IDLE)
        private set

    val signedIn get() = s.token != null
    val pending get() = s.outbox.size
    val hasSample get() = s.groups.any { it.sample == true } || s.expenses.any { it.sample } || s.queue.any { it.sample }

    private var toastJob: Job? = null
    private var busy = false
    private var again = false
    private var resumedOnce = false
    private var active = true

    init {
        scope.launch {
            val saved = withContext(disk) { runCatching { json.decodeFromString<Local>(file.readFully().decodeToString()) }.getOrNull() }
            s = if (saved != null) saved.copy(base = reachFromDevice(saved.base)) else Local(base = reachFromDevice(BuildConfig.API_URL))
            ready = true
        }
        scope.launch {
            snapshotFlow { s }.collectLatest { state ->
                if (!ready) return@collectLatest
                withContext(disk) {
                    val out = file.startWrite()
                    runCatching { out.write(json.encodeToString(withoutVpa(state)).toByteArray()) }
                        .onSuccess { file.finishWrite(out) }
                        .onFailure { file.failWrite(out) }
                }
            }
        }
        scope.launch {
            snapshotFlow { Triple(ready, s.token, s.outbox) }.collectLatest { (r, token, outbox) ->
                if (!r || token == null || outbox.isEmpty()) return@collectLatest
                delay(400)
                syncNow()
            }
        }
        scope.launch {
            snapshotFlow { if (ready) s.token else null }.distinctUntilChanged().collectLatest { token ->
                if (token == null) return@collectLatest
                syncNow()
                scan()
                // ponytail: 20s polling, fine for small groups. Switch to server-sent events if group edits must feel instant.
                while (true) {
                    delay(20_000)
                    if (active) syncNow()
                }
            }
        }
    }

    fun onResume() {
        active = true
        if (resumedOnce && ready && signedIn) {
            syncNow()
            scope.launch { scan() }
        }
        resumedOnce = true
    }

    fun onPause() {
        active = false
    }

    private suspend fun scan() {
        if (!s.smsOn) return
        val res = device.readSms(80, quiet = true)
        if (res.rows.isNotEmpty()) s = addDrafts(s, res.rows).first
    }

    fun flash(m: String) {
        toast = m
        toastJob?.cancel()
        toastJob = scope.launch {
            delay(2400)
            toast = ""
        }
    }

    private fun commit(vararg ops: Op) = commit(ops.toList())

    private fun commit(ops: List<Op>) {
        s = enqueue(s, ops)
    }

    private fun signOutLocal() {
        s = Local(base = s.base)
    }

    fun syncNow() {
        scope.launch { syncAwait() }
    }

    private suspend fun syncAwait() {
        val token = s.token ?: return
        val base = s.base
        if (busy) {
            again = true
            return
        }
        busy = true
        sync = SyncState.SYNCING
        try {
            val sent = s.outbox
            if (sent.isNotEmpty()) {
                val body = JsonObject(mapOf("ops" to JsonArray(sent.map { json.encodeToJsonElement(Op.serializer(), it.op) })))
                val res = call(base, token, "POST", "/ops", body)
                val bad = res.jsonObject["results"]?.jsonArray?.map { it.jsonObject }?.firstOrNull { it["ok"]?.jsonPrimitive?.booleanOrNull != true }
                bad?.get("error")?.jsonPrimitive?.contentOrNull?.let(::flash)
                val done = sent.map { it.qid }.toSet()
                s = s.copy(outbox = s.outbox.filter { it.qid !in done })
            }
            val remote = json.decodeFromJsonElement<Remote>(call(base, token, "GET", "/sync"))
            if (s.token == token) s = rebase(s, remote)
            sync = SyncState.IDLE
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            if (e is ApiError && e.status == 401) {
                signOutLocal()
                flash("Signed out. Log in again.")
            }
            sync = SyncState.OFFLINE
        } finally {
            busy = false
            if (again) {
                again = false
                syncNow()
            }
        }
    }

    private suspend fun authed(path: String, body: Map<String, String>): String? {
        val base = s.base
        return try {
            val res = call(base, null, "POST", path, JsonObject(body.mapValues { JsonPrimitive(it.value) })).jsonObject
            val token = res.getValue("token").jsonPrimitive.content
            val you = json.decodeFromJsonElement<RemoteYou>(res.getValue("you"))
            val x = s
            val keep = if (x.you.id == you.id) x else Local(queue = x.queue, seen = x.seen, smsOn = x.smsOn)
            s = keep.copy(base = base, token = token, you = person(you.id, you.name), phone = you.phone)
            null
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            e.message ?: "Something went wrong"
        }
    }

    suspend fun setBase(raw: String): String? {
        val base = cleanBase(raw)
        try {
            call(base, null, "GET", "/health")
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            return e.message ?: "Cannot reach that server"
        }
        s = s.copy(base = base)
        return null
    }

    suspend fun signUp(name: String, phone: String, password: String, vpa: String?) =
        authed("/auth/signup", buildMap {
            put("name", name)
            put("phone", phone)
            put("password", password)
            if (vpa != null) put("vpa", vpa)
        })

    suspend fun signIn(phone: String, password: String) = authed("/auth/login", mapOf("phone" to phone, "password" to password))

    fun signOut() {
        val base = s.base
        val token = s.token
        if (token != null) scope.launch { runCatching { call(base, token, "POST", "/auth/logout") } }
        signOutLocal()
    }

    fun setSmsOn(on: Boolean) {
        s = s.copy(smsOn = on)
    }

    fun setName(name: String) {
        val n = name.trim()
        if (n.isNotEmpty() && n != s.you.name) commit(MeSet(name = n))
    }

    fun setVpa(raw: String): String? {
        val vpa = if (raw.isNotBlank()) cleanVpa(raw) else null
        if (raw.isNotBlank() && vpa == null) return "Enter a UPI ID like name@bank"
        commit(MeSet(vpa = vpa ?: ""))
        flash(if (vpa != null) "UPI ID saved" else "UPI ID removed")
        return null
    }

    fun setBudget(n: Double) = commit(PrefsSet(Prefs(budget = n)))

    fun addTag(raw: String): String? {
        val tag = slugTag(raw)
        if (tag.isEmpty()) return null
        if (tag !in s.tags) commit(PrefsSet(Prefs(tags = s.tags + tag)))
        return tag
    }

    /** Saves [e] under a fresh id and returns it. */
    fun addExpense(e: Expense): String {
        val id = uid()
        val ops = mutableListOf<Op>(ExpenseUpsert(e.copy(id = id)))
        if (e.tag != null && e.tag !in s.tags) ops += PrefsSet(Prefs(tags = s.tags + e.tag))
        commit(ops)
        flash(if (e.recurring != null) "Saved. Repeats ${e.recurring}" else if (e.income) "Income saved" else "Expense saved")
        return id
    }

    fun updateExpense(e: Expense) = commit(ExpenseUpsert(e))

    fun removeExpense(id: String) = commit(ExpenseDelete(id))

    fun removeSettlement(id: String) = commit(SettlementDelete(id))

    fun confirmDraft(
        id: String,
        tag: String?,
        groupId: String? = null,
        reflect: Boolean? = null,
        shares: Map<String, Double>? = null,
        payerId: String? = null,
    ) {
        val x = s
        val d = x.queue.find { it.id == id } ?: return
        val group = groupId?.let { gid -> x.groups.find { it.id == gid } }
        val members = if (group != null) listOf(x.you.id) + group.memberIds else emptyList()
        val expense = Expense(
            id = uid(),
            merchant = d.merchant,
            amount = d.amount,
            at = d.at,
            tag = tag,
            rail = d.rail,
            income = d.income,
            transfer = d.transfer,
            groupId = group?.id,
            payerId = if (group != null) payerId ?: x.you.id else null,
            shares = if (group != null) shares ?: equalShares(d.amount, members) else null,
            reflect = if (group != null) reflect != false else true,
            bank = d.bank,
            account = d.account,
            sample = d.sample,
        )
        val ops = mutableListOf<Op>(ExpenseUpsert(expense))
        if (tag != null && tag !in x.tags) ops += PrefsSet(Prefs(tags = x.tags + tag))
        val next = enqueue(s, ops)
        s = next.copy(queue = next.queue.filter { it.id != id })
    }

    fun ignoreDraft(id: String) {
        s = s.copy(queue = s.queue.filter { it.id != id })
    }

    fun skipDraft(id: String) {
        val item = s.queue.find { it.id == id } ?: return
        s = s.copy(queue = s.queue.filter { it.id != id } + item)
    }

    fun settle(groupId: String, fromId: String, toId: String, amount: Double, method: String) {
        commit(SettlementUpsert(Settlement(uid(), groupId, fromId, toId, amount, nowIso(), method)))
        flash("Settlement recorded")
    }

    fun createGroup(name: String, memberNames: List<String>, icon: String = "account-group"): String {
        val id = uid()
        val ops = mutableListOf<Op>(GroupUpsert(GroupPatch(id, name.trim().ifEmpty { "Group" }, icon, "")))
        for (raw in memberNames) {
            val n = raw.trim()
            if (n.isNotEmpty()) ops += PersonAdd(id, NewPerson(uid(), n))
        }
        commit(ops)
        return id
    }

    fun updateGroup(id: String, name: String? = null, icon: String? = null, simplify: Boolean? = null) {
        val g = s.groups.find { it.id == id } ?: return
        val nextName = (name ?: g.name).trim().ifEmpty { g.name }
        val nextSimplify = simplify ?: g.simplify
        commit(GroupUpsert(GroupPatch(id, nextName, icon ?: g.icon, g.note, simplify = nextSimplify != false)))
    }

    fun addMember(groupId: String, name: String) {
        val n = name.trim()
        if (n.isNotEmpty()) commit(PersonAdd(groupId, NewPerson(uid(), n)))
    }

    fun deleteGroup(id: String) = commit(GroupDelete(id))

    suspend fun previewInvite(code: String): Result<Invite> = try {
        val path = "/invite/${encodeUriComponent(code.trim().uppercase())}"
        Result.success(json.decodeFromJsonElement<Invite>(call(s.base, s.token, "GET", path)))
    } catch (e: CancellationException) {
        throw e
    } catch (e: Exception) {
        Result.failure(Exception(e.message ?: "Could not open that invite"))
    }

    suspend fun joinGroup(code: String, claimId: String?): Result<String> = try {
        val body = JsonObject(mapOf("code" to JsonPrimitive(code.trim().uppercase()), "claimId" to JsonPrimitive(claimId)))
        val res = call(s.base, s.token, "POST", "/join", body).jsonObject
        syncAwait()
        Result.success(res.getValue("groupId").jsonPrimitive.content)
    } catch (e: CancellationException) {
        throw e
    } catch (e: Exception) {
        Result.failure(Exception(e.message ?: "Could not join"))
    }

    fun ingest(rows: List<InboxRow>): Int {
        val (next, added) = addDrafts(s, rows)
        s = next.copy(smsOn = true)
        return added
    }

    fun ingestText(body: String, sender: String = "Shortcuts"): Boolean {
        val key = "text|$sender|${body.take(80)}"
        if (key in s.seen) return s.queue.any { it.key == key }
        val draft = draftFrom(sender, body, nowIso(), key)
        s = s.copy(seen = s.seen + key, queue = if (draft != null) listOf(draft) + s.queue else s.queue)
        return draft != null
    }

    fun loadSample() {
        val x = s
        val data = sampleData(x.you.id)
        val ops = mutableListOf<Op>()
        for (g in data.groups) {
            ops += GroupUpsert(GroupPatch(g.id, g.name, g.icon, g.note, sample = true))
            for (pid in g.memberIds) {
                val p = data.people.first { it.id == pid }
                ops += PersonAdd(g.id, NewPerson(p.id, p.name))
            }
        }
        data.expenses.forEach { ops += ExpenseUpsert(it) }
        data.settlements.forEach { ops += SettlementUpsert(it) }
        ops += PrefsSet(Prefs(history = x.history.filter { !it.sample } + data.history, budget = if (x.budget != 0.0) null else data.budget))
        val next = enqueue(s, ops)
        s = next.copy(queue = next.queue.filter { !it.sample } + data.queue)
        flash("Sample data added")
    }

    fun clearSample() {
        val x = s
        val ops = x.groups.filter { it.sample == true && it.owner == true }.map { GroupDelete(it.id) } +
            x.expenses.filter { it.sample && it.groupId == null }.map { ExpenseDelete(it.id) } +
            PrefsSet(Prefs(history = x.history.filter { !it.sample }))
        val next = enqueue(s, ops)
        s = next.copy(queue = next.queue.filter { !it.sample })
        flash("Sample data cleared")
    }
}
