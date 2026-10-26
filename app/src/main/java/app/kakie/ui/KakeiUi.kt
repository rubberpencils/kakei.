package app.kakie.ui

import android.content.Intent
import android.view.HapticFeedbackConstants
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.ime
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TextField
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.FileProvider
import androidx.fragment.app.FragmentActivity
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import app.kakie.core.Draft
import app.kakie.core.Expense
import app.kakie.core.Group
import app.kakie.core.Person
import app.kakie.core.cardBills
import app.kakie.core.cashFlow
import app.kakie.core.cleanAmount
import app.kakie.core.cleanNumber
import app.kakie.core.cleanPhone
import app.kakie.core.detectSubs
import app.kakie.core.equalShares
import app.kakie.core.friendBalances
import app.kakie.core.groupDebts
import app.kakie.core.groupTotals
import app.kakie.core.inr
import app.kakie.core.memberNets
import app.kakie.core.money
import app.kakie.core.monthBounds
import app.kakie.core.monthName
import app.kakie.core.percentShares
import app.kakie.core.readMoney
import app.kakie.core.slugTag
import app.kakie.core.spendIn
import app.kakie.core.tagSpend
import app.kakie.core.uid
import app.kakie.core.whyYouPay
import app.kakie.core.youBalances
import app.kakie.data.KakeiModel
import com.android.billingclient.api.BillingClient
import com.android.billingclient.api.BillingFlowParams
import com.android.billingclient.api.PendingPurchasesParams
import com.android.billingclient.api.QueryProductDetailsParams
import java.io.File
import java.time.LocalDate
import java.time.LocalDateTime
import java.util.concurrent.Executors

private val bg = Color(0xFFF3EFE6)
private val fg = Color(0xFF16141A)
private val mut = Color(0xFF5C574E)
private val line = Color(0xFFD8D0C2)
private val sub = Color(0xFFFFFDF9)
private val brand = Color(0xFF653DE9)
private val pos = Color(0xFF1B7F45)
private val neg = Color(0xFFC4382F)
private val mono = FontFamily.Monospace

@Composable
fun KakeiRoot(model: KakeiModel, startRoute: String?) {
    val nav = rememberNavController()
    val start = if (model.book.entered) "home" else "onboarding"
    Box(Modifier.fillMaxSize().background(bg)) {
        NavHost(nav, start) {
            composable("onboarding") { Onboarding(model, nav) }
            composable("reset") { Reset(model, nav) }
            composable("home") { Shell(model, nav, "home") { Home(model, nav) } }
            composable("personal") { Shell(model, nav, "personal") { Personal(model, nav) } }
            composable("groups") { Shell(model, nav, "groups") { Groups(model, nav) } }
            composable("insights") { Shell(model, nav, "insights") { Insights(model) } }
            composable("profile") { Shell(model, nav, "profile") { Profile(model, nav) } }
            composable("add/{rail}") { Add(model, nav, it.arguments?.getString("rail") ?: "upi") }
            composable("add") { Add(model, nav, "upi") }
            composable("search") { Search(model, nav) }
            composable("review") { Review(model, nav) }
            composable("group/{id}") { GroupPage(model, nav, it.arguments?.getString("id") ?: "") }
            composable("settings/{id}") { GroupSettings(model, nav, it.arguments?.getString("id") ?: "") }
            composable("expense") { ExpenseForm(model, nav, null) }
            composable("expense/{id}") { ExpenseForm(model, nav, it.arguments?.getString("id")) }
            composable("split/{id}") { Split(model, nav, it.arguments?.getString("id") ?: "") }
            composable("quick") { QuickSplit(model, nav) }
            composable("settle/{id}") { Settle(model, nav, it.arguments?.getString("id") ?: "") }
            composable("person/{id}") { PersonPage(model, nav, it.arguments?.getString("id") ?: "") }
            composable("balances") { Balances(model, nav) }
            composable("card") { CardBill(model, nav) }
            composable("new-group") { NewGroup(model, nav) }
            composable("join") { Join(model, nav) }
            composable("developer") { Developer(model, nav) }
            composable("ask") { Ask(model, nav) }
            composable("pro") { Pro(model, nav) }
        }
        if (model.toast.isNotEmpty()) {
            Text(model.toast, color = sub, modifier = Modifier.align(Alignment.BottomCenter).navigationBarsPadding().padding(16.dp).background(fg, RoundedCornerShape(12.dp)).padding(12.dp).clickable { model.toast("") })
        }
        if (startRoute == "add") androidx.compose.runtime.LaunchedEffect(Unit) { if (model.book.entered) nav.navigate("add/cash") }
        if (startRoute == "review") androidx.compose.runtime.LaunchedEffect(Unit) { if (model.book.entered) nav.navigate("review") }
        if (model.book.lock && !model.unlocked) Lock(model)
    }
}

@Composable
private fun Shell(model: KakeiModel, nav: NavHostController, tab: String, body: @Composable () -> Unit) {
    Column(Modifier.fillMaxSize().statusBarsPadding()) {
        Box(Modifier.weight(1f)) { body() }
        Row(Modifier.fillMaxWidth().background(sub).border(1.dp, line).navigationBarsPadding(), horizontalArrangement = Arrangement.SpaceEvenly) {
            listOf("home" to "Home", "personal" to "Personal", "groups" to "Groups", "insights" to "Insights", "profile" to "Profile").forEach { (id, label) ->
                Text(label, color = if (tab == id) fg else mut, fontWeight = if (tab == id) FontWeight.Bold else FontWeight.Normal, modifier = Modifier.clickable { nav.navigate(id) { popUpTo("home") } }.padding(12.dp), fontSize = 12.sp)
            }
        }
        Text("+", color = Color.White, modifier = Modifier.align(Alignment.End).padding(16.dp).background(brand, RoundedCornerShape(28.dp)).clickable { nav.navigate("add") }.padding(horizontal = 18.dp, vertical = 10.dp))
    }
}

@Composable
private fun Page(title: String, nav: NavHostController?, content: @Composable () -> Unit) {
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(20.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            if (nav != null) Text("Back", color = brand, modifier = Modifier.clickable { nav.popBackStack() }.padding(end = 12.dp))
            Text(title, fontSize = 28.sp, fontWeight = FontWeight.ExtraBold, color = fg)
        }
        Spacer(Modifier.height(12.dp))
        content()
    }
}

@Composable
private fun Field(value: String, label: String, onChange: (String) -> Unit, password: Boolean = false, phone: Boolean = false, number: Boolean = false) {
    Text(label, color = mut, fontSize = 12.sp)
    TextField(
        value,
        { raw -> onChange(when { phone -> cleanPhone(raw); number -> cleanNumber(raw); else -> raw }) },
        modifier = Modifier.fillMaxWidth().padding(bottom = 8.dp),
        visualTransformation = if (password) PasswordVisualTransformation() else androidx.compose.ui.text.input.VisualTransformation.None,
        keyboardOptions = KeyboardOptions(keyboardType = when { phone -> KeyboardType.Phone; number -> KeyboardType.Number; password -> KeyboardType.Password; else -> KeyboardType.Text }),
        singleLine = true,
    )
}

@Composable
private fun Btn(label: String, onClick: () -> Unit) {
    val view = LocalView.current
    Text(label, color = Color.White, modifier = Modifier.fillMaxWidth().padding(vertical = 6.dp).background(brand, RoundedCornerShape(14.dp)).clickable { view.performHapticFeedback(HapticFeedbackConstants.CONFIRM); onClick() }.padding(14.dp), fontWeight = FontWeight.SemiBold)
}

@Composable
private fun swipeMod(onPrev: () -> Unit, onNext: () -> Unit): Modifier {
    var dx by remember { mutableFloatStateOf(0f) }
    return Modifier.pointerInput(onPrev, onNext) {
        detectHorizontalDragGestures(onDragEnd = {
            if (dx <= -56f) onNext() else if (dx >= 56f) onPrev()
            dx = 0f
        }, onHorizontalDrag = { _, drag -> dx += drag })
    }
}

@Composable
private fun Onboarding(model: KakeiModel, nav: NavHostController) {
    var name by remember { mutableStateOf("") }
    var phone by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var budget by remember { mutableStateOf("") }
    var server by remember { mutableStateOf(model.book.base) }
    var mode by remember { mutableStateOf("signup") }
    Page("Kakei", null) {
        Text("A ledger on this phone. Groups sync. The backup is sealed with your password.", color = mut)
        Field(name, "Name", { name = it })
        Field(budget, "Monthly budget", { budget = it }, number = true)
        Field(server, "Server", { server = it })
        TextButton(onClick = { model.setServer(server) }) { Text("Use this server") }
        if (mode == "login") {
            Field(phone, "Phone", { phone = it }, phone = true)
            Field(password, "Password", { password = it }, password = true)
            Btn("Log in") { model.setServer(server); model.login(phone, password) }
            TextButton(onClick = { nav.navigate("reset") }) { Text("Forgot password") }
            TextButton(onClick = { mode = "signup" }) { Text("Create an account") }
        } else {
            Field(phone, "Phone", { phone = it }, phone = true)
            Field(password, "Password", { password = it }, password = true)
            Btn("Create account") { model.setServer(server); model.signup(name, phone, password) }
            TextButton(onClick = { mode = "login" }) { Text("I already have an account") }
        }
        TextButton(onClick = { model.skipLocal(name, budget.toDoubleOrNull() ?: 0.0) }) { Text("Skip, keep it on this phone") }
        if (model.book.entered) androidx.compose.runtime.LaunchedEffect(model.book.token, model.book.local) { nav.navigate("home") { popUpTo("onboarding") { inclusive = true } } }
    }
}

@Composable
private fun Reset(model: KakeiModel, nav: NavHostController) {
    var phone by remember { mutableStateOf("") }
    var otp by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    Page("Reset password", nav) {
        Text("Signup does not need a code. A reset does.", color = mut)
        Field(phone, "Phone", { phone = it }, phone = true)
        Btn("Send code") { model.requestReset(phone) }
        Field(otp, "Code", { otp = it }, number = true)
        Field(password, "New password", { password = it }, password = true)
        Btn("Save password") { model.resetPassword(phone, otp, password) { nav.popBackStack() } }
    }
}

@Composable
private fun Home(model: KakeiModel, nav: NavHostController) {
    val now = LocalDate.now()
    val bounds = monthBounds(now.year, now.monthValue)
    val spent = spendIn(model.book.expenses, model.book.settlements, model.book.you.id, bounds.first, bounds.second)
    val balances = youBalances(model.book.expenses, model.book.settlements, model.book.groups, model.book.you.id)
    Page("Home", null) {
        Text(monthName(now.monthValue), color = mut)
        Text("₹${inr(spent.total)}", fontSize = 40.sp, fontFamily = mono, fontWeight = FontWeight.Bold, color = fg)
        if (model.book.budget > 0) Text("of ₹${inr(model.book.budget)}", color = mut)
        if (spent.back > 0) Text("₹${inr(spent.back)} coming back", color = pos)
        Text("Search", color = brand, modifier = Modifier.clickable { nav.navigate("search") }.padding(vertical = 8.dp))
        if (model.book.queue.isNotEmpty()) Text("${model.book.queue.size} to review", color = brand, modifier = Modifier.clickable { nav.navigate("review") })
        balances.owed.forEach { row -> Text("${model.nameOf(row.id)} owes you ₹${inr(row.amount)}", modifier = Modifier.clickable { nav.navigate("person/${row.id}") }.padding(vertical = 4.dp)) }
        balances.owe.forEach { row -> Text("You owe ${model.nameOf(row.id)} ₹${inr(row.amount)}", color = neg, modifier = Modifier.clickable { nav.navigate("person/${row.id}") }.padding(vertical = 4.dp)) }
        Text("Balances", color = brand, modifier = Modifier.clickable { nav.navigate("balances") }.padding(top = 8.dp))
        cardBills(model.book.expenses, model.book.you.id).forEach { bill ->
            Text("Card ${bill.account ?: ""}  ₹${inr(bill.due)}", modifier = Modifier.clickable { nav.navigate("card") }.padding(vertical = 4.dp))
        }
    }
}

@Composable
private fun Personal(model: KakeiModel, nav: NavHostController) {
    Page("Personal", null) {
        model.book.expenses.filter { it.groupId == null }.forEach { e ->
            Row(Modifier.fillMaxWidth().clickable { nav.navigate("expense/${e.id}") }.padding(vertical = 8.dp), horizontalArrangement = Arrangement.SpaceBetween) {
                Column { Text(e.merchant, fontWeight = FontWeight.SemiBold); Text(e.tag ?: e.rail, color = mut, fontSize = 12.sp) }
                Text(money(e.amount), fontFamily = mono, color = if (e.income) pos else fg)
            }
        }
        if (model.book.expenses.none { it.groupId == null }) Text("Nothing here yet", color = mut)
    }
}

@Composable
private fun Add(model: KakeiModel, nav: NavHostController, railArg: String) {
    var amount by remember { mutableStateOf("") }
    var note by remember { mutableStateOf("") }
    var tag by remember { mutableStateOf("") }
    var rail by remember { mutableStateOf(railArg) }
    var repeat by remember { mutableStateOf("none") }
    var groupId by remember { mutableStateOf("") }
    val typing = WindowInsets.ime.getBottom(LocalDensity.current) > 0
    val view = LocalView.current
    Column(Modifier.fillMaxSize().statusBarsPadding().padding(20.dp)) {
        Text("Back", color = brand, modifier = Modifier.clickable { nav.popBackStack() })
        Text("₹${amount.ifBlank { "0" }}", fontSize = 48.sp, fontFamily = mono, modifier = Modifier.align(Alignment.CenterHorizontally).padding(vertical = 12.dp))
        Field(note, "Note", { note = it })
        Field(tag, "Tag", { tag = slugTag(it) })
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            listOf("upi", "debit", "credit", "neft", "imps", "cash").forEach { item ->
                Text(item, color = if (rail == item) Color.White else fg, modifier = Modifier.background(if (rail == item) brand else sub, RoundedCornerShape(8.dp)).clickable { rail = item }.padding(8.dp), fontSize = 12.sp)
            }
        }
        Row {
            listOf("none", "weekly", "monthly").forEach { item ->
                Text(item, modifier = Modifier.clickable { repeat = item }.padding(8.dp), color = if (repeat == item) brand else mut)
            }
        }
        model.book.groups.forEach { g -> Text(g.name, color = if (groupId == g.id) brand else fg, modifier = Modifier.clickable { groupId = if (groupId == g.id) "" else g.id }.padding(vertical = 4.dp)) }
        Spacer(Modifier.weight(1f))
        if (!typing) {
            val keys = listOf("1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "del")
            Column {
                keys.chunked(3).forEach { row ->
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceEvenly) {
                        row.forEach { key ->
                            Text(if (key == "del") "⌫" else key, fontSize = 22.sp, modifier = Modifier.clickable {
                                view.performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP)
                                amount = cleanAmount(if (key == "del") amount.dropLast(1) else amount + key)
                            }.padding(16.dp))
                        }
                    }
                }
            }
        }
        Btn("Save") {
            val value = amount.toDoubleOrNull() ?: return@Btn
            if (value <= 0) return@Btn
            val slug = slugTag(tag).ifEmpty { null }
            val members = model.book.groups.find { it.id == groupId }?.memberIds.orEmpty()
            val ids = if (groupId.isBlank()) emptyList() else listOf(model.book.you.id) + members
            val expense = Expense(
                id = uid(), merchant = note.ifBlank { "Cash" }, amount = value, at = LocalDateTime.now().toString().take(19),
                tag = slug, rail = rail, recurring = repeat.takeIf { it != "none" }, recurId = if (repeat == "none") null else uid(),
                groupId = groupId.ifBlank { null }, payerId = groupId.ifBlank { null }?.let { model.book.you.id },
                shares = if (ids.isEmpty()) null else equalShares(value, ids),
            )
            model.addExpense(expense)
            nav.popBackStack()
        }
    }
}

@Composable
private fun Search(model: KakeiModel, nav: NavHostController) {
    var q by remember { mutableStateOf("") }
    Page("Search", nav) {
        Field(q, "Merchant or tag", { q = it })
        model.book.expenses.filter { q.isBlank() || it.merchant.contains(q, true) || (it.tag ?: "").contains(q, true) }.forEach { e ->
            Text("${e.merchant}  ₹${inr(e.amount)}", modifier = Modifier.padding(vertical = 6.dp))
        }
    }
}

@Composable
private fun Review(model: KakeiModel, nav: NavHostController) {
    val draft = model.book.queue.firstOrNull()
    Page("Review", nav) {
        if (draft == null) Text("Nothing waiting", color = mut) else DraftCard(model, draft)
    }
}

@Composable
private fun DraftCard(model: KakeiModel, draft: Draft) {
    var amountChip by remember(draft.id) { mutableStateOf(draft.body.split(Regex("\\s+")).firstOrNull { readMoney(it) != null }) }
    var merchantChip by remember(draft.id) { mutableStateOf<String?>(null) }
    var tag by remember(draft.id) { mutableStateOf(draft.tag ?: "") }
    Text(draft.body, color = fg)
    Text("₹${inr(readMoney(amountChip ?: "") ?: draft.amount)}  ${merchantChip ?: draft.merchant}", fontFamily = mono, modifier = Modifier.padding(vertical = 8.dp))
    if (draft.amount <= 0) {
        Text("Tap the amount, then the merchant. Tap again to clear.", color = mut, fontSize = 12.sp)
        draft.body.split(Regex("\\s+")).filter { it.isNotBlank() }.forEach { word ->
            val on = word == amountChip || word == merchantChip
            Text(word, color = if (on) Color.White else fg, modifier = Modifier.padding(4.dp).background(if (on) brand else sub, RoundedCornerShape(8.dp)).clickable {
                when {
                    word == amountChip -> amountChip = null
                    word == merchantChip -> merchantChip = null
                    readMoney(word) != null && amountChip == null -> amountChip = word
                    merchantChip == null -> merchantChip = word
                }
            }.padding(8.dp))
        }
    }
    Field(tag, "Tag", { tag = slugTag(it) })
    Btn("Save") {
        model.teach(draft, amountChip, merchantChip, tag)
        val taught = app.kakie.core.parseWithRules(draft.sender, draft.body, model.book.formats, model.book.rules)
        val ready = if (draft.amount > 0) draft else draft.copy(amount = taught?.amount ?: readMoney(amountChip ?: "") ?: 0.0, merchant = merchantChip ?: taught?.merchant ?: draft.merchant, rail = taught?.rail ?: draft.rail)
        if (ready.amount > 0) model.fileDraft(ready, tag) else model.toast("Could not read an amount there")
    }
    TextButton(onClick = { model.dropDraft(draft.id) }) { Text("Not mine") }
}

@Composable
private fun Groups(model: KakeiModel, nav: NavHostController) {
    var mode by remember { mutableStateOf(0) }
    val modes = listOf("Groups", "Splits", "Friends")
    Column(Modifier.fillMaxSize().then(swipeMod({ mode = (mode + 2) % 3 }, { mode = (mode + 1) % 3 })).verticalScroll(rememberScrollState()).padding(20.dp)) {
        Text(modes[mode], fontSize = 28.sp, fontWeight = FontWeight.ExtraBold)
        Row { modes.forEachIndexed { i, label -> Text(label, color = if (i == mode) brand else mut, modifier = Modifier.clickable { mode = i }.padding(8.dp)) } }
        when (mode) {
            0 -> {
                val groups = model.book.groups.filter { it.kind != "split" }
                if (groups.isEmpty()) Text("No groups yet", color = mut)
                groups.forEach { g -> Text(g.name, modifier = Modifier.clickable { nav.navigate("group/${g.id}") }.padding(vertical = 8.dp), fontWeight = FontWeight.SemiBold) }
                Btn("Start a group") { nav.navigate("new-group") }
            }
            1 -> {
                model.book.groups.filter { it.kind == "split" }.forEach { g -> Text(g.name, modifier = Modifier.clickable { nav.navigate("group/${g.id}") }.padding(vertical = 8.dp)) }
                Btn("New quick split") { nav.navigate("quick") }
            }
            else -> {
                val friends = friendBalances(model.book.expenses, model.book.settlements, model.book.groups, model.book.you.id).filter { kotlin.math.abs(it.net) >= 0.005 }
                if (friends.isEmpty()) {
                    Text("No friends yet", color = mut)
                    Text("Share a group, or invite someone to a split.", color = mut)
                }
                friends.forEach { f -> Text("${model.nameOf(f.id)}  ${money(f.net, true)}", modifier = Modifier.clickable { nav.navigate("person/${f.id}") }.padding(vertical = 8.dp)) }
            }
        }
        Text("Join with a code", color = brand, modifier = Modifier.clickable { nav.navigate("join") }.padding(top = 8.dp))
    }
}

@Composable
private fun GroupPage(model: KakeiModel, nav: NavHostController, id: String) {
    val group = model.book.groups.find { it.id == id } ?: return
    var tab by remember { mutableStateOf(0) }
    val tabs = listOf("Activity", "Balances", "Totals")
    Page(group.name, nav) {
        Row(swipeMod({ tab = (tab + 2) % 3 }, { tab = (tab + 1) % 3 })) { tabs.forEachIndexed { i, label -> Text(label, color = if (i == tab) brand else mut, modifier = Modifier.clickable { tab = i }.padding(8.dp)) } }
        when (tab) {
            0 -> model.book.expenses.filter { it.groupId == id }.forEach { e -> Text("${e.merchant}  ₹${inr(e.amount)}", modifier = Modifier.padding(vertical = 6.dp)) }
            1 -> groupDebts(model.book.expenses, model.book.settlements, group).forEach { d -> Text("${model.nameOf(d.fromId)} pays ${model.nameOf(d.toId)} ₹${inr(d.amount)}") }
            else -> groupTotals(model.book.expenses, group, model.book.you.id).second.forEach { row -> Text("${model.nameOf(row.id)} paid ₹${inr(row.paid)} share ₹${inr(row.share)}") }
        }
        Btn("Add expense") { nav.navigate("expense") }
        Btn("Settle") { nav.navigate("settle/$id") }
        Text("Settings", color = brand, modifier = Modifier.clickable { nav.navigate("settings/$id") })
    }
}

@Composable
private fun GroupSettings(model: KakeiModel, nav: NavHostController, id: String) {
    val group = model.book.groups.find { it.id == id } ?: return
    Page(group.name, nav) {
        Text(group.note, color = mut)
        if (!group.code.isNullOrBlank()) Text("Invite code ${group.code}", fontFamily = mono)
        Text("Anyone with the link can read this group. The server can read shared expenses.", color = mut, fontSize = 12.sp)
        Text(if (group.simplify == false) "Simplifying is off" else "Simplifying is on", modifier = Modifier.clickable { model.saveGroup(group.copy(simplify = group.simplify == false)) }.padding(vertical = 8.dp))
    }
}

@Composable
private fun ExpenseForm(model: KakeiModel, nav: NavHostController, id: String?) {
    val existing = model.book.expenses.find { it.id == id }
    var merchant by remember { mutableStateOf(existing?.merchant ?: "") }
    var amount by remember { mutableStateOf(existing?.amount?.toString() ?: "") }
    var tag by remember { mutableStateOf(existing?.tag ?: "") }
    Page(if (id == null) "Expense" else merchant, nav) {
        Field(merchant, "Merchant", { merchant = it })
        Field(amount, "Amount", { amount = cleanAmount(it) })
        Field(tag, "Tag", { tag = slugTag(it) })
        Btn("Save") {
            val value = amount.toDoubleOrNull() ?: return@Btn
            model.addExpense((existing ?: Expense(uid(), merchant, value, LocalDateTime.now().toString().take(19))).copy(merchant = merchant.ifBlank { "Payment" }, amount = value, tag = slugTag(tag).ifEmpty { null }))
            nav.popBackStack()
        }
        if (existing != null) TextButton(onClick = { model.deleteExpense(existing.id); nav.popBackStack() }) { Text("Delete", color = neg) }
    }
}

@Composable
private fun Split(model: KakeiModel, nav: NavHostController, id: String) {
    val expense = model.book.expenses.find { it.id == id } ?: return
    val ids = listOf(model.book.you.id) + (model.book.groups.find { it.id == expense.groupId }?.memberIds ?: emptyList())
    var mode by remember { mutableStateOf("equal") }
    var percents by remember { mutableStateOf(ids.associateWith { 0.0 }.toMutableMap()) }
    Page(expense.merchant, nav) {
        Text("Equal, percent, or by item.", color = mut)
        Row { listOf("equal", "percent").forEach { label -> Text(label, color = if (mode == label) brand else mut, modifier = Modifier.clickable { mode = label }.padding(8.dp)) } }
        if (mode == "percent") ids.forEach { pid -> Field((percents[pid] ?: 0.0).toString(), model.nameOf(pid), { percents = percents.toMutableMap().also { m -> m[pid] = it.toDoubleOrNull() ?: 0.0 } }) }
        Btn("Save split") {
            val shares = if (mode == "equal") equalShares(expense.amount, ids) else percentShares(expense.amount, percents)
            model.addExpense(expense.copy(shares = shares, payerId = expense.payerId ?: model.book.you.id, groupId = expense.groupId))
            nav.popBackStack()
        }
    }
}

@Composable
private fun QuickSplit(model: KakeiModel, nav: NavHostController) {
    var name by remember { mutableStateOf("") }
    var merchant by remember { mutableStateOf("") }
    var amount by remember { mutableStateOf("") }
    Page("Quick split", nav) {
        Field(merchant, "What was it", { merchant = it })
        Field(amount, "Amount", { amount = cleanAmount(it) })
        Field(name, "Friend", { name = it })
        Btn("Save") {
            val value = amount.toDoubleOrNull() ?: return@Btn
            val friend = Person(uid(), name.ifBlank { "Friend" }, app.kakie.core.initials(name.ifBlank { "Friend" }))
            val group = Group(uid(), merchant.ifBlank { "Split" }, "call-split", listOf(friend.id), "", kind = "split")
            model.saveGroup(group, listOf(friend))
            model.addExpense(Expense(uid(), merchant.ifBlank { "Split" }, value, LocalDateTime.now().toString().take(19), groupId = group.id, payerId = model.book.you.id, shares = equalShares(value, listOf(model.book.you.id, friend.id)), rail = "cash"))
            nav.popBackStack()
        }
    }
}

@Composable
private fun Settle(model: KakeiModel, nav: NavHostController, id: String) {
    var amount by remember { mutableStateOf("") }
    val group = model.book.groups.find { it.id == id }
    var to by remember { mutableStateOf(group?.memberIds?.firstOrNull() ?: "") }
    Page("Settle", nav) {
        group?.memberIds?.forEach { pid -> Text(model.nameOf(pid), color = if (to == pid) brand else fg, modifier = Modifier.clickable { to = pid }.padding(vertical = 4.dp)) }
        Field(amount, "Amount", { amount = cleanAmount(it) })
        Btn("Record payment") {
            val value = amount.toDoubleOrNull() ?: return@Btn
            if (to.isNotBlank()) model.settle(id, to, value)
            nav.popBackStack()
        }
    }
}

@Composable
private fun PersonPage(model: KakeiModel, nav: NavHostController, id: String) {
    var filter by remember { mutableStateOf("all") }
    Page(model.nameOf(id), nav) {
        Row(swipeMod({ filter = if (filter == "all") "shared" else "all" }, { filter = if (filter == "all") "shared" else "all" })) {
            listOf("all", "shared").forEach { label -> Text(label, color = if (filter == label) brand else mut, modifier = Modifier.clickable { filter = label }.padding(8.dp)) }
        }
        val rows = model.book.expenses.filter { e ->
            val shared = e.shares?.containsKey(id) == true || e.payerId == id
            shared && (filter == "all" || e.groupId != null)
        }
        rows.forEach { e ->
            Text(e.merchant)
            whyYouPay(model.book.you.id, id, listOf(e), model.book.settlements, e.groupId).forEach { line ->
                Text("${line.label}  ₹${inr(line.amount)} ${line.direction}", color = mut, fontSize = 12.sp)
            }
        }
    }
}

@Composable
private fun Balances(model: KakeiModel, nav: NavHostController) {
    val rows = youBalances(model.book.expenses, model.book.settlements, model.book.groups, model.book.you.id)
    Page("Balances", nav) {
        Text("They owe you ₹${inr(rows.owedTotal)}", color = pos)
        rows.owed.forEach { row -> Text("${model.nameOf(row.id)}  ₹${inr(row.amount)}") }
        Text("You owe ₹${inr(rows.oweTotal)}", color = neg)
        rows.owe.forEach { row -> Text("${model.nameOf(row.id)}  ₹${inr(row.amount)}") }
    }
}

@Composable
private fun CardBill(model: KakeiModel, nav: NavHostController) {
    Page("Card bill", nav) {
        cardBills(model.book.expenses, model.book.you.id).forEach { bill ->
            Text("${bill.bank ?: "Card"} ${bill.account ?: ""}", fontWeight = FontWeight.Bold)
            Text("Due ₹${inr(bill.due)}", fontFamily = mono)
            bill.charges.forEach { e -> Text("${e.merchant}  ₹${inr(e.amount)}") }
        }
        if (cardBills(model.book.expenses, model.book.you.id).isEmpty()) Text("No card bill", color = mut)
    }
}

@Composable
private fun NewGroup(model: KakeiModel, nav: NavHostController) {
    var name by remember { mutableStateOf("") }
    var members by remember { mutableStateOf("") }
    Page("New group", nav) {
        Field(name, "Name", { name = it })
        Field(members, "Friends, comma separated", { members = it })
        Btn("Create") {
            val people = members.split(",").map { it.trim() }.filter { it.isNotEmpty() }.map { Person(uid(), it, app.kakie.core.initials(it)) }
            model.saveGroup(Group(uid(), name.ifBlank { "Group" }, "group", people.map { it.id }, "", kind = "group"), people)
            nav.popBackStack()
        }
    }
}

@Composable
private fun Join(model: KakeiModel, nav: NavHostController) {
    var code by remember { mutableStateOf("") }
    Page("Join", nav) {
        Field(code, "Code", { code = it })
        Btn("Join") { model.join(code) { nav.popBackStack() } }
    }
}

@Composable
private fun Insights(model: KakeiModel) {
    var cursor by remember { mutableStateOf(LocalDate.now().withDayOfMonth(1)) }
    var range by remember { mutableStateOf("month") }
    val bounds = if (range == "year") monthBounds(cursor.year, 1).first to "${cursor.year}-12-31" else monthBounds(cursor.year, cursor.monthValue)
    val flow = cashFlow(model.book.expenses, model.book.settlements, model.book.you.id, bounds.first, bounds.second)
    val shift = if (range != "custom") swipeMod({ cursor = if (range == "year") cursor.minusYears(1) else cursor.minusMonths(1) }, { cursor = if (range == "year") cursor.plusYears(1) else cursor.plusMonths(1) }) else Modifier
    Column(Modifier.fillMaxSize().then(shift).verticalScroll(rememberScrollState()).padding(20.dp)) {
        Text("Insights", fontSize = 28.sp, fontWeight = FontWeight.ExtraBold)
        Text(if (range == "year") cursor.year.toString() else monthName(cursor.monthValue), color = mut)
        Row { listOf("month", "year").forEach { label -> Text(label, color = if (range == label) brand else mut, modifier = Modifier.clickable { range = label }.padding(8.dp)) } }
        Text("₹${inr(flow.spent)}", fontSize = 36.sp, fontFamily = mono)
        flow.byDay.toList().sortedBy { it.first }.forEach { (day, value) ->
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.height(8.dp).fillMaxWidth((value / (flow.byDay.values.maxOrNull() ?: 1.0)).toFloat().coerceIn(0.05f, 1f)).background(brand))
                Text("  $day", fontSize = 11.sp, color = mut)
            }
        }
        detectSubs(model.book.expenses).forEach { (merchant, amount) -> Text("$merchant looks monthly, about ₹${inr(amount)}", color = mut) }
        model.book.tagBudgets.forEach { (tag, cap) ->
            val used = tagSpend(model.book.expenses, model.book.you.id, tag, bounds.first, bounds.second)
            Text("#$tag  ₹${inr(used)} / ₹${inr(cap)}", color = if (used > cap) neg else fg)
        }
    }
}

@Composable
private fun Profile(model: KakeiModel, nav: NavHostController) {
    val ctx = LocalContext.current
    var budget by remember { mutableStateOf(if (model.book.budget == 0.0) "" else model.book.budget.toString()) }
    var tag by remember { mutableStateOf("") }
    var tagAmount by remember { mutableStateOf("") }
    var erase by remember { mutableStateOf(false) }
    var password by remember { mutableStateOf("") }
    Page("Profile", null) {
        Row {
            Text(model.book.you.name, fontSize = 22.sp, fontWeight = FontWeight.Bold)
            if (model.book.signedIn && model.book.pro) Text("  Pro", color = brand, fontWeight = FontWeight.Bold)
        }
        Field(budget, "Budget", { budget = cleanNumber(it) })
        TextButton(onClick = { model.setBudget(budget.toDoubleOrNull() ?: 0.0) }) { Text("Save budget") }
        Text("Tag budgets", fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(top = 8.dp))
        model.book.tagBudgets.forEach { (key, value) -> Text("    #$key  ₹${inr(value)}", color = mut) }
        Field(tag, "Add a tag budget", { tag = slugTag(it) })
        Field(tagAmount, "Amount", { tagAmount = cleanNumber(it) })
        TextButton(onClick = { model.setTagBudget(tag, tagAmount.toDoubleOrNull() ?: 0.0); tag = ""; tagAmount = "" }) { Text("Save tag budget") }
        Text("Bank messages", fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(top = 12.dp))
        Text(if (model.book.smsOn) "On" else "Off", color = brand, modifier = Modifier.clickable { model.setSms(!model.book.smsOn) })
        TextButton(onClick = { model.showTestSms() }) { Text("Send a test notification") }
        TextButton(onClick = { model.refreshSms() }) { Text("Scan inbox") }
        TextButton(onClick = {
            val file = File(ctx.cacheDir, "export/kakei.csv").apply { parentFile?.mkdirs(); writeText(model.csv()) }
            val uri = FileProvider.getUriForFile(ctx, "app.kakie.files", file)
            ctx.startActivity(Intent(Intent.ACTION_SEND).setType("text/csv").putExtra(Intent.EXTRA_STREAM, uri).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION))
        }) { Text("Export CSV") }
        TextButton(onClick = {
            val file = File(ctx.cacheDir, "export/kakei.pdf").apply { parentFile?.mkdirs() }
            model.writePdf(file)
            val uri = FileProvider.getUriForFile(ctx, "app.kakie.files", file)
            ctx.startActivity(Intent(Intent.ACTION_SEND).setType("application/pdf").putExtra(Intent.EXTRA_STREAM, uri).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION))
        }) { Text("Export PDF") }
        Text(if (model.book.lock) "Lock is on" else "Lock is off", modifier = Modifier.clickable { model.setLock(!model.book.lock) }.padding(vertical = 8.dp))
        Text("Backup is sealed with your account password. Logging in on a new phone restores it. The server cannot read it.", color = mut, fontSize = 13.sp, modifier = Modifier.padding(vertical = 8.dp))
        if (model.book.signedIn) {
            TextButton(onClick = { nav.navigate("ask") }) { Text("Ask") }
            Text(if (model.book.digest) "Weekly digest on" else "Weekly digest off", modifier = Modifier.clickable { model.setDigest(!model.book.digest) })
            if (!model.book.pro) TextButton(onClick = { nav.navigate("pro") }) { Text("Kakei Pro") }
            TextButton(onClick = { model.downloadAccount { text -> model.toast(text.take(180)) } }) { Text("Download my data") }
            if (erase) {
                Field(password, "Password to erase the account", { password = it }, password = true)
                Btn("Erase everything") { model.deleteAccount(password) { err -> if (err != null) model.toast(err) } }
            } else TextButton(onClick = { erase = true }) { Text("Erase everything", color = neg) }
        }
        TextButton(onClick = { model.loadSample() }) { Text("Load sample data") }
        TextButton(onClick = { model.clearSample() }) { Text("Remove sample data") }
        TextButton(onClick = { nav.navigate("developer") }) { Text("Developer") }
        Text("On this phone, a shared group can be read by the server, a backup stays sealed, and remote MCP is off until you turn it on.", color = mut, fontSize = 12.sp, modifier = Modifier.padding(top = 8.dp))
        if (model.book.signedIn) TextButton(onClick = { model.signOut() }) { Text("Sign out") }
    }
}

@Composable
private fun Developer(model: KakeiModel, nav: NavHostController) {
    Page("Developer", nav) {
        Text(if (model.book.devMcp) "On-phone MCP is on" else "On-phone MCP is off", modifier = Modifier.clickable { model.setLocalMcp(!model.book.devMcp, model.book.devLan) })
        Text(if (model.book.devLan) "LAN" else "This phone only", color = mut, modifier = Modifier.clickable { model.setLocalMcp(model.book.devMcp, !model.book.devLan) })
        if (model.book.devToken.isNotBlank()) {
            Text("http://127.0.0.1:${model.book.devPort}/mcp", fontFamily = mono, fontSize = 12.sp)
            Text(mcpJson("http://127.0.0.1:${model.book.devPort}/mcp", model.book.devToken), fontFamily = mono, fontSize = 11.sp)
        }
        if (model.book.signedIn && model.book.pro) {
            Text(if (model.book.remote) "Remote MCP is on" else "Remote MCP is off", modifier = Modifier.clickable { if (model.book.remoteId.isBlank()) model.createRemote { } else model.setRemote(!model.book.remote) }.padding(top = 12.dp))
            if (model.book.remoteToken.isNotBlank()) Text(mcpJson("${model.book.base.trimEnd('/')}/m/${model.book.remoteId}", model.book.remoteToken), fontFamily = mono, fontSize = 11.sp)
            else Text("Regenerate to copy a config with the bearer token.", color = mut)
            TextButton(onClick = { model.regenerateRemote() }) { Text("Regenerate") }
        }
    }
}

private fun mcpJson(url: String, token: String) = """{"mcpServers":{"kakei":{"url":"$url","headers":{"Authorization":"Bearer $token"}}}}"""

@Composable
private fun Ask(model: KakeiModel, nav: NavHostController) {
    var q by remember { mutableStateOf("") }
    var answer by remember { mutableStateOf("") }
    Page("Ask", nav) {
        if (!model.book.pro) Text("Ask is part of Pro.", color = mut)
        else {
            Text("The question goes out. The ledger stays here. Tools run on this phone.", color = mut, fontSize = 13.sp)
            Field(q, "Question", { q = it })
            Btn("Ask") { model.ask(q) { answer = it } }
            Text(answer, modifier = Modifier.padding(top = 8.dp))
        }
    }
}

@Composable
private fun Pro(model: KakeiModel, nav: NavHostController) {
    val activity = LocalContext.current as FragmentActivity
    Page("Pro", nav) {
        if (model.book.pro || !model.book.signedIn) Text(if (model.book.pro) "Pro is on for this account." else "A local ledger does not have a paywall.")
        else {
            Text("Backup, Ask, the weekly digest, and remote MCP.")
            val client = remember {
                BillingClient.newBuilder(activity)
                    .setListener { _, purchases ->
                        val mine = purchases?.firstOrNull { it.products.any { sku -> sku == "kakei_pro_monthly" || sku == "kakei_pro_yearly" } }
                        if (mine != null) model.confirmPlay(mine.purchaseToken, mine.products.first()) { err -> if (err != null) model.toast(err) }
                    }
                    .enablePendingPurchases(PendingPurchasesParams.newBuilder().enableOneTimeProducts().build())
                    .build()
            }
            androidx.compose.runtime.DisposableEffect(Unit) {
                client.startConnection(object : com.android.billingclient.api.BillingClientStateListener {
                    override fun onBillingSetupFinished(result: com.android.billingclient.api.BillingResult) {
                        if (result.responseCode != BillingClient.BillingResponseCode.OK) return
                        val params = QueryProductDetailsParams.newBuilder().setProductList(listOf("kakei_pro_monthly", "kakei_pro_yearly").map {
                            QueryProductDetailsParams.Product.newBuilder().setProductId(it).setProductType(BillingClient.ProductType.SUBS).build()
                        }).build()
                        client.queryProductDetailsAsync(params) { _, details ->
                            details.forEach { product ->
                                // The buttons below read the latest details from this list via the activity.
                                productDetails = details
                            }
                        }
                    }
                    override fun onBillingServiceDisconnected() {}
                })
                onDispose { client.endConnection() }
            }
            listOf("kakei_pro_monthly" to "Monthly", "kakei_pro_yearly" to "Yearly").forEach { (sku, label) ->
                Btn(label) {
                    val product = productDetails.find { it.productId == sku } ?: return@Btn
                    val offer = product.subscriptionOfferDetails?.firstOrNull() ?: return@Btn
                    val flow = BillingFlowParams.newBuilder().setProductDetailsParamsList(listOf(BillingFlowParams.ProductDetailsParams.newBuilder().setProductDetails(product).setOfferToken(offer.offerToken).build())).build()
                    client.launchBillingFlow(activity, flow)
                }
            }
        }
    }
}

private var productDetails: List<com.android.billingclient.api.ProductDetails> = emptyList()

@Composable
private fun Lock(model: KakeiModel) {
    val activity = LocalContext.current as FragmentActivity
    Box(Modifier.fillMaxSize().background(bg).padding(24.dp), contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text("Kakei is locked", fontSize = 28.sp, fontWeight = FontWeight.ExtraBold)
            Btn("Unlock") {
                val prompt = BiometricPrompt(activity, Executors.newSingleThreadExecutor(), object : BiometricPrompt.AuthenticationCallback() {
                    override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) { model.unlocked = true }
                })
                val info = BiometricPrompt.PromptInfo.Builder().setTitle("Unlock Kakei").setAllowedAuthenticators(
                    if (android.os.Build.VERSION.SDK_INT >= 30) BiometricManager.Authenticators.BIOMETRIC_STRONG or BiometricManager.Authenticators.DEVICE_CREDENTIAL
                    else BiometricManager.Authenticators.BIOMETRIC_WEAK,
                ).apply { if (android.os.Build.VERSION.SDK_INT < 30) setNegativeButtonText("Cancel") }.build()
                prompt.authenticate(info)
            }
        }
    }
}
