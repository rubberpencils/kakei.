package app.kakie.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import app.kakie.lib.Debt
import app.kakie.lib.Expense
import app.kakie.lib.Person
import app.kakie.lib.Settlement
import app.kakie.lib.groupDebts
import app.kakie.lib.groupTotals
import app.kakie.lib.inr
import app.kakie.lib.memberNets
import app.kakie.lib.pairDebts
import app.kakie.lib.personName
import app.kakie.lib.reroutes
import app.kakie.lib.youNet
import app.kakie.ui.Ask
import app.kakie.ui.Avatar
import app.kakie.ui.Back
import app.kakie.ui.ExpenseR
import app.kakie.ui.Fonts
import app.kakie.ui.GroupSettings
import app.kakie.ui.Icon
import app.kakie.ui.LocalInsets
import app.kakie.ui.LocalNav
import app.kakie.ui.LocalReduceMotion
import app.kakie.ui.LocalStore
import app.kakie.ui.PersonR
import app.kakie.ui.Segmented
import app.kakie.ui.Settle
import app.kakie.ui.SettleRow
import app.kakie.ui.Split
import app.kakie.ui.Txt
import app.kakie.ui.Word
import app.kakie.ui.ask
import app.kakie.ui.buzz
import app.kakie.ui.c
import app.kakie.ui.entering
import app.kakie.ui.fadeInDownE
import app.kakie.ui.fadeInE
import app.kakie.ui.press
import app.kakie.ui.shareText
import app.kakie.ui.tagColors
import app.kakie.ui.timeline
import kotlin.math.abs
import kotlin.math.min

private sealed interface Ev {
    val at: String

    data class Exp(val e: Expense) : Ev {
        override val at get() = e.at
    }

    data class Set(val s: Settlement) : Ev {
        override val at get() = s.at
    }
}

@Composable
fun GroupScreen(id: String) {
    val store = LocalStore.current
    val s = store.s
    val nav = LocalNav.current
    val insets = LocalInsets.current
    val reduce = LocalReduceMotion.current
    val context = LocalContext.current
    var tab by rememberSaveable { mutableStateOf("activity") }
    var how by rememberSaveable { mutableStateOf(false) }
    val group = s.groups.find { it.id == id }
    if (group == null) {
        Column(Modifier.fillMaxSize().background(c.bg).padding(start = 24.dp, end = 24.dp, bottom = 24.dp, top = insets.top + 8.dp)) {
            Back()
            Word("That group is gone", 24)
            Txt("It may have been deleted by its owner.", Fonts.body, 14, c.mut, Modifier.padding(top = 8.dp))
        }
        return
    }

    val you = s.you.id
    val simplified = group.simplify != false
    val pairs = pairDebts(s.expenses, s.settlements, group.id)
    val debts = groupDebts(s.expenses, s.settlements, group)
    val net = youNet(debts, you)
    val routes = if (simplified) reroutes(pairs, debts) else emptyList()
    val mine = debts.filter { it.fromId == you || it.toId == you }
    val nets = memberNets(pairs)
    val totals = groupTotals(s.expenses, group, you)
    fun name(pid: String) = personName(s.people, s.you, pid)
    fun inline(pid: String) = if (pid == you) "you" else name(pid)
    val members: List<Person> = listOf(s.you) + group.memberIds.map { pid -> s.people.find { it.id == pid } ?: Person(pid, "Someone", "?") }
    fun openPerson(pid: String) = nav.push(PersonR(pid))

    fun invite() {
        val code = group.code ?: return store.flash("The code appears once the group reaches the server")
        buzz()
        shareText(context, "Join \"${group.name}\" on kakie. with code $code\nkakie://join?code=$code")
    }

    fun removeSettlement(st: Settlement) = ask(
        Ask(
            "Remove this payment?",
            "${name(st.fromId)} paid ${inline(st.toId)} ₹${inr(st.amount)}. Removing it puts that amount back on the balances for everyone in ${group.name}.",
            "Remove payment",
            destructive = true,
        ) {
            store.removeSettlement(st.id)
            store.flash("Payment removed")
        },
    )

    val events = (s.expenses.filter { it.groupId == group.id }.map { Ev.Exp(it) } + s.settlements.filter { it.groupId == group.id }.map { Ev.Set(it) })
        .sortedByDescending { it.at }

    LazyColumn(
        Modifier.fillMaxSize().background(c.bg).padding(top = insets.top),
        contentPadding = PaddingValues(top = 4.dp, start = 24.dp, end = 24.dp, bottom = insets.bottom + 40.dp),
    ) {
        item(key = "head") {
            Column {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                    Back()
                    Box(Modifier.press { nav.push(GroupSettings(group.id)) }.size(44.dp), contentAlignment = Alignment.Center) { Icon("cog-outline", 22) }
                }
                Row(Modifier.padding(top = 4.dp), horizontalArrangement = Arrangement.spacedBy(14.dp), verticalAlignment = Alignment.CenterVertically) {
                    Box(Modifier.size(52.dp).background(c.sub, RoundedCornerShape(16.dp)), contentAlignment = Alignment.Center) { Icon(group.icon, 26) }
                    Column(Modifier.weight(1f)) {
                        Word(group.name, 26, lineHeight = 30)
                        Row(
                            Modifier.padding(top = 6.dp).press { nav.push(GroupSettings(group.id)) },
                            horizontalArrangement = Arrangement.spacedBy((-8).dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            members.take(5).forEach { p ->
                                Box(Modifier.border(2.dp, c.bg, RoundedCornerShape(10.dp)).padding(2.dp)) {
                                    Avatar(p.id, p.initials, 22, you = p.id == you)
                                }
                            }
                            Txt("${members.size} people", Fonts.body, 12.5, c.mut, Modifier.padding(start = 16.dp))
                        }
                    }
                }

                Column(Modifier.padding(top = 24.dp)) {
                    Txt(
                        when {
                            net.net > 0 -> "You are owed ₹${inr(net.net)}"
                            net.net < 0 -> "You owe ₹${inr(-net.net)}"
                            else -> "You are all settled up"
                        },
                        Fonts.semi, 17, if (net.net > 0) c.pos else if (net.net < 0) c.neg else c.fg,
                    )
                    mine.forEach { d ->
                        val other = if (d.toId == you) d.fromId else d.toId
                        val owedToYou = d.toId == you
                        val amtColor = if (owedToYou) c.pos else c.neg
                        Row(Modifier.fillMaxWidth().press { openPerson(other) }.padding(vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                            Txt(
                                buildAnnotatedString {
                                    append(if (owedToYou) "${name(other)} owes you " else "You owe ${name(other)} ")
                                    withStyle(SpanStyle(fontFamily = Fonts.semi, color = amtColor)) { append("₹${inr(d.amount)}") }
                                },
                                Fonts.body, 14, c.mut, Modifier.weight(1f),
                            )
                            Icon("chevron-right", 18, c.mut)
                        }
                    }
                }

                Row(Modifier.padding(top = 18.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    if (mine.isNotEmpty()) Action("Settle up", "handshake-outline", primary = true) { nav.push(Settle(group.id)) }
                    Action("Add expense", "plus", primary = mine.isEmpty()) { nav.push(Split(groupId = group.id)) }
                    Action("Invite", "account-plus-outline", iconOnly = true, onPress = ::invite)
                }

                Box(Modifier.padding(top = 26.dp)) {
                    Segmented(listOf("activity" to "Activity", "balances" to "Balances", "totals" to "Totals"), tab) { tab = it }
                }
            }
        }

        if (tab == "activity") {
            if (events.isEmpty()) {
                item(key = "empty") {
                    Column(Modifier.fillMaxWidth().padding(vertical = 36.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                        Icon("receipt-text-outline", 30, c.mut)
                        Txt("No expenses yet", Fonts.semi, 14, c.fg, Modifier.padding(top = 10.dp))
                        Txt("Add one, or send a bank SMS here from Review.", Fonts.body, 14, c.mut, Modifier.padding(top = 4.dp), align = TextAlign.Center)
                    }
                }
            } else {
                timeline(events, { it.at }) { ev ->
                    when (ev) {
                        is Ev.Set -> SettleRow(ev.s, you, ::name) { removeSettlement(ev.s) }
                        is Ev.Exp -> ExpenseRow(ev.e, you, ::name) { nav.push(ExpenseR(ev.e.id)) }
                    }
                }
            }
        } else {
            item(key = "tab-$tab") {
                key(tab) {
                    Column(Modifier.entering(fadeInE(180))) {
                        if (tab == "balances") {
                            Column(Modifier.padding(top = 20.dp)) {
                                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                                    Txt("Who pays whom", Fonts.displaySm, 17, c.fg)
                                    if (simplified) {
                                        Row(
                                            Modifier.height(24.dp).background(c.sub, RoundedCornerShape(12.dp)).padding(horizontal = 9.dp),
                                            horizontalArrangement = Arrangement.spacedBy(4.dp),
                                            verticalAlignment = Alignment.CenterVertically,
                                        ) {
                                            Icon("auto-fix", 13, c.mut)
                                            Txt("Simplified", Fonts.semi, 11.5, c.mut)
                                        }
                                    }
                                }
                                Txt(
                                    when {
                                        !simplified -> "Showing every debt between pairs. Turn on Simplify in group settings for fewer payments."
                                        pairs.size > debts.size -> "${debts.size} ${if (debts.size == 1) "payment" else "payments"} instead of ${pairs.size}."
                                        else -> "Already the fewest payments possible."
                                    },
                                    Fonts.body, 13, c.mut, Modifier.padding(top = 4.dp, bottom = 8.dp), lineHeight = 19,
                                )
                                debts.forEachIndexed { i, d ->
                                    Flow(d, i, you, members, reduce, routes.filter { it.fromId == d.fromId && it.toId == d.toId }.map { inline(it.viaId) })
                                }
                                if (debts.isEmpty()) Txt("Everyone is square.", Fonts.body, 14, c.mut, Modifier.padding(vertical = 8.dp))

                                if (simplified && pairs.size > debts.size) {
                                    Column(Modifier.padding(top = 12.dp).fillMaxWidth().background(c.sub, RoundedCornerShape(18.dp))) {
                                        Row(
                                            Modifier.fillMaxWidth().press {
                                                buzz()
                                                how = !how
                                            }.height(52.dp).padding(horizontal = 16.dp),
                                            horizontalArrangement = Arrangement.spacedBy(10.dp),
                                            verticalAlignment = Alignment.CenterVertically,
                                        ) {
                                            Icon("routes", 19, c.mut)
                                            Txt("How this was simplified", Fonts.semi, 14, c.fg, Modifier.weight(1f))
                                            Icon(if (how) "chevron-up" else "chevron-down", 20, c.mut)
                                        }
                                        if (how) {
                                            Column(Modifier.entering(if (reduce) null else fadeInE(200)).padding(start = 16.dp, end = 16.dp, bottom = 16.dp)) {
                                                Txt("What people owed, pair by pair", Fonts.semi, 12.5, c.mut, Modifier.padding(bottom = 6.dp))
                                                pairs.forEach { p ->
                                                    Row(Modifier.padding(vertical = 4.dp)) {
                                                        Txt("${name(p.fromId)} owed ${inline(p.toId)}", Fonts.body, 13.5, c.fg, Modifier.weight(1f), lines = 1)
                                                        Txt("₹${inr(p.amount)}", Fonts.semi, 13.5, c.fg)
                                                    }
                                                }
                                                if (routes.isNotEmpty()) Txt("What was rerouted", Fonts.semi, 12.5, c.mut, Modifier.padding(top = 14.dp, bottom = 6.dp))
                                                routes.forEach { r ->
                                                    Txt(
                                                        "${name(r.fromId)} owed ${inline(r.viaId)} ₹${inr(r.amount)}, and ${inline(r.viaId)} owed ${inline(r.toId)}. So that money goes straight to ${inline(r.toId)}.",
                                                        Fonts.body, 13.5, c.fg, Modifier.padding(vertical = 3.dp), lineHeight = 20,
                                                    )
                                                }
                                                val saved = pairs.size - debts.size
                                                Txt(
                                                    "Each person still pays or gets back exactly the same total. Only the route changes, so ${if (saved == 1) "one payment is" else "$saved payments are"} saved.",
                                                    Fonts.body, 13, c.mut, Modifier.padding(top = 10.dp), lineHeight = 19,
                                                )
                                            }
                                        }
                                    }
                                }

                                Txt("Everyone", Fonts.displaySm, 17, c.fg, Modifier.padding(top = 32.dp, bottom = 4.dp))
                                members.forEach { p ->
                                    val v = nets[p.id] ?: 0.0
                                    Row(
                                        Modifier.fillMaxWidth().press { openPerson(p.id) }.padding(vertical = 10.dp),
                                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                                        verticalAlignment = Alignment.CenterVertically,
                                    ) {
                                        Avatar(p.id, p.initials, you = p.id == you)
                                        Column(Modifier.weight(1f)) {
                                            Txt(if (p.id == you) "You" else p.name, Fonts.medium, 15, c.fg)
                                            Txt(
                                                if (v > 0.5) "gets back ₹${inr(v)}" else if (v < -0.5) "owes ₹${inr(-v)}" else "settled up",
                                                Fonts.body, 12.5, if (v > 0.5) c.pos else if (v < -0.5) c.neg else c.mut, Modifier.padding(top = 2.dp),
                                            )
                                        }
                                        Icon("chevron-right", 18, c.mut)
                                    }
                                }
                            }
                        } else {
                            Column(Modifier.padding(top = 20.dp)) {
                                Txt("Total group spend", Fonts.body, 14, c.mut)
                                Txt("₹${inr(totals.total)}", Fonts.display, 30, c.fg, Modifier.padding(top = 2.dp, bottom = 10.dp))
                                totals.rows.forEach { row ->
                                    val p = members.find { it.id == row.id }
                                    val pct = if (totals.total != 0.0) min(100.0, (row.paid / totals.total) * 100) else 0.0
                                    Column(Modifier.fillMaxWidth().press { openPerson(row.id) }.padding(vertical = 10.dp)) {
                                        Row(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
                                            Avatar(row.id, p?.initials ?: "?", 32, you = row.id == you)
                                            Column(Modifier.weight(1f)) {
                                                Txt(name(row.id), Fonts.medium, 14, c.fg)
                                                Txt("Paid ₹${inr(row.paid)}, share ₹${inr(row.share)}", Fonts.body, 12, c.mut, Modifier.padding(top = 2.dp))
                                            }
                                            Txt("${if (row.net >= 0) "+" else "−"}₹${inr(abs(row.net))}", Fonts.displaySm, 14, if (row.net >= 0) c.pos else c.neg)
                                        }
                                        Box(Modifier.padding(start = 44.dp, top = 10.dp).fillMaxWidth().height(3.dp).background(c.faint, RoundedCornerShape(2.dp))) {
                                            Box(Modifier.fillMaxWidth((pct / 100).toFloat()).height(3.dp).background(c.fg, RoundedCornerShape(2.dp)))
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun RowScope.Action(label: String, icon: String, primary: Boolean = false, iconOnly: Boolean = false, onPress: () -> Unit) {
    Row(
        (if (iconOnly) Modifier.width(44.dp) else Modifier.weight(1f)).press(onPress = onPress).height(44.dp)
            .background(if (primary) c.acc else c.sub, RoundedCornerShape(22.dp))
            .padding(horizontal = if (iconOnly) 0.dp else 12.dp),
        horizontalArrangement = Arrangement.spacedBy(6.dp, Alignment.CenterHorizontally),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(icon, 18, if (primary) c.accFg else c.fg)
        if (!iconOnly) Txt(label, Fonts.semi, 14, if (primary) c.accFg else c.fg, lines = 1)
    }
}

@Composable
private fun ExpenseRow(e: Expense, you: String, name: (String) -> String, onPress: () -> Unit) {
    val col = tagColors(e.tag ?: "untagged", c.dark)
    val share = e.shares?.get(you) ?: 0.0
    val paid = e.payerId == you
    val lent = if (paid) e.amount - share else 0.0
    val (label, amt, color) = when {
        paid -> Triple("you lent", lent, c.pos)
        share > 0 -> Triple("you borrowed", share, c.neg)
        else -> Triple("not involved", 0.0, c.mut)
    }
    Row(Modifier.fillMaxWidth().press(onPress = onPress).padding(vertical = 10.dp), horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.size(38.dp).background(col.bg, RoundedCornerShape(13.dp)), contentAlignment = Alignment.Center) { Icon("receipt-text-outline", 19, col.fg) }
        Column(Modifier.weight(1f)) {
            Txt(e.merchant, Fonts.medium, 15, c.fg, lines = 1)
            Txt("${if (paid) "You" else name(e.payerId ?: "")} paid ₹${inr(e.amount)}", Fonts.body, 12.5, c.mut, Modifier.padding(top = 2.dp), lines = 1)
        }
        Column(horizontalAlignment = Alignment.End) {
            Txt(label, Fonts.body, 11, color)
            if (amt > 0) Txt("₹${inr(amt)}", Fonts.displaySm, 15, color)
        }
    }
}

@Composable
private fun Flow(d: Debt, i: Int, you: String, people: List<Person>, reduce: Boolean, via: List<String>) {
    val from = people.find { it.id == d.fromId }
    val to = people.find { it.id == d.toId }
    val tone = if (d.fromId == you) c.neg else if (d.toId == you) c.pos else null
    Row(
        Modifier.entering(if (reduce) null else fadeInDownE(260, i * 50)).fillMaxWidth().padding(vertical = 10.dp),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.width(64.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            Avatar(d.fromId, from?.initials ?: "?", 34, you = d.fromId == you)
            Txt(if (d.fromId == you) "You" else from?.name?.split(" ")?.get(0) ?: "Someone", Fonts.medium, 11.5, c.fg, Modifier.padding(top = 4.dp), lines = 1)
        }
        Column(Modifier.weight(1f).padding(bottom = if (via.isEmpty()) 16.dp else 0.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            Txt("₹${inr(d.amount)}", Fonts.displaySm, 15, tone ?: c.fg)
            Row(Modifier.fillMaxWidth().padding(top = 2.dp), verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.weight(1f).height(1.5.dp).background(tone ?: c.line))
                Icon("chevron-right", 16, tone ?: c.mut)
            }
            if (via.isNotEmpty()) Txt("via ${via.joinToString(", ")}", Fonts.body, 11, c.mut, Modifier.padding(top = 1.dp), lines = 1)
        }
        Column(Modifier.width(64.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            Avatar(d.toId, to?.initials ?: "?", 34, you = d.toId == you)
            Txt(if (d.toId == you) "You" else to?.name?.split(" ")?.get(0) ?: "Someone", Fonts.medium, 11.5, c.fg, Modifier.padding(top = 4.dp), lines = 1)
        }
    }
}
