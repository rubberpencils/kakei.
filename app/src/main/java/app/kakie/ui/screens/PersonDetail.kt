package app.kakie.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import app.kakie.lib.Expense
import app.kakie.lib.Settlement
import app.kakie.lib.friendBalances
import app.kakie.lib.inr
import app.kakie.lib.personName
import app.kakie.ui.Avatar
import app.kakie.ui.Back
import app.kakie.ui.ExpenseR
import app.kakie.ui.Fonts
import app.kakie.ui.GroupR
import app.kakie.ui.Icon
import app.kakie.ui.LocalInsets
import app.kakie.ui.LocalNav
import app.kakie.ui.LocalStore
import app.kakie.ui.Segmented
import app.kakie.ui.Settle
import app.kakie.ui.Txt
import app.kakie.ui.Word
import app.kakie.ui.c
import app.kakie.ui.press
import app.kakie.ui.timeline
import kotlin.math.abs

private sealed interface PEv {
    val at: String

    data class Exp(val e: Expense) : PEv {
        override val at get() = e.at
    }

    data class Set(val s: Settlement) : PEv {
        override val at get() = s.at
    }
}

@Composable
fun PersonScreen(id: String) {
    val store = LocalStore.current
    val s = store.s
    val nav = LocalNav.current
    val insets = LocalInsets.current
    var filter by rememberSaveable { mutableStateOf("all") }
    val you = s.you.id
    val isYou = id == you
    val person = if (isYou) s.you else s.people.find { it.id == id }
    fun name(pid: String) = personName(s.people, s.you, pid)
    val first = if (isYou) "You" else person?.name?.split(" ")?.get(0) ?: "They"

    if (person == null) {
        Column(Modifier.fillMaxSize().background(c.bg).padding(start = 24.dp, end = 24.dp, bottom = 24.dp, top = insets.top + 8.dp)) {
            Back()
            Word("Not found", 24)
        }
        return
    }

    val balance = if (isYou) null else friendBalances(s.expenses, s.settlements, s.groups, you).find { it.id == id }
    val net = balance?.net ?: 0.0
    fun inExp(e: Expense, pid: String) = e.payerId == pid || (e.shares?.get(pid) ?: 0.0) != 0.0
    fun inSet(st: Settlement, pid: String) = st.fromId == pid || st.toId == pid

    val events = (
        s.expenses.filter {
            if (isYou) (if (filter == "all") it.groupId == null || inExp(it, id) else it.groupId != null && inExp(it, id))
            else inExp(it, id) && (filter == "all" || inExp(it, you))
        }.map { PEv.Exp(it) } +
            s.settlements.filter { inSet(it, id) && (isYou || filter == "all" || inSet(it, you)) }.map { PEv.Set(it) }
        ).sortedByDescending { it.at }

    LazyColumn(
        Modifier.fillMaxSize().background(c.bg).padding(top = insets.top),
        contentPadding = PaddingValues(top = 4.dp, start = 24.dp, end = 24.dp, bottom = insets.bottom + 40.dp),
    ) {
        item(key = "head") {
            Column {
                Back()
                Row(horizontalArrangement = Arrangement.spacedBy(14.dp), verticalAlignment = Alignment.CenterVertically) {
                    Avatar(person.id, person.initials, 56, you = isYou)
                    Column(Modifier.weight(1f)) {
                        Word(if (isYou) "Your activity" else person.name, 26, lineHeight = 30)
                        Txt(
                            if (isYou) "Everything you paid for or were split into" else if (person.claimed == true) "On kakie." else "Not on kakie. yet",
                            Fonts.body, 13, c.mut, Modifier.padding(top = 3.dp),
                        )
                    }
                }

                if (!isYou) {
                    Column(Modifier.padding(top = 22.dp)) {
                        Txt(
                            when {
                                net > 0.5 -> "$first owes you ₹${inr(net)}"
                                net < -0.5 -> "You owe $first ₹${inr(-net)}"
                                else -> "All settled up"
                            },
                            Fonts.display, 22, if (net > 0.5) c.pos else if (net < -0.5) c.neg else c.fg, spacing = -0.6,
                        )
                        balance?.groups?.filter { abs(it.net) > 0.5 }?.forEach { g ->
                            val group = s.groups.find { it.id == g.groupId } ?: return@forEach
                            Row(Modifier.padding(vertical = 9.dp), horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
                                Row(
                                    Modifier.weight(1f).press { nav.push(GroupR(group.id)) },
                                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                ) {
                                    Box(Modifier.size(34.dp).background(c.sub, RoundedCornerShape(12.dp)), contentAlignment = Alignment.Center) { Icon(group.icon, 17) }
                                    Column(Modifier.weight(1f)) {
                                        Txt(group.name, Fonts.medium, 14.5, c.fg, lines = 1)
                                        Txt(
                                            if (g.net > 0) "owes you ₹${inr(g.net)}" else "you owe ₹${inr(-g.net)}",
                                            Fonts.body, 12.5, if (g.net > 0) c.pos else c.neg, Modifier.padding(top = 1.dp),
                                        )
                                    }
                                }
                                Box(
                                    Modifier.press { nav.push(Settle(group.id, id)) }.height(34.dp).background(c.acc, RoundedCornerShape(17.dp)).padding(horizontal = 14.dp),
                                    contentAlignment = Alignment.Center,
                                ) { Txt("Settle", Fonts.semi, 13, c.accFg) }
                            }
                        }
                    }
                }

                Box(Modifier.padding(top = 24.dp)) {
                    Segmented(
                        if (isYou) listOf("all" to "Everything", "shared" to "Shared only") else listOf("all" to "All of $first's", "shared" to "With you"),
                        filter,
                    ) { filter = it }
                }
            }
        }

        if (events.isEmpty()) {
            item(key = "empty") {
                Column(Modifier.fillMaxWidth().padding(vertical = 36.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                    Icon("receipt-text-outline", 30, c.mut)
                    Txt("Nothing here yet.", Fonts.body, 14, c.mut, Modifier.padding(top = 10.dp), align = TextAlign.Center)
                }
            }
        } else {
            timeline(events, { it.at }) { ev ->
                when (ev) {
                    is PEv.Exp -> ExpRow(ev.e, id, first, ::name)
                    is PEv.Set -> SetRow(ev.s, ::name)
                }
            }
        }
    }
}

@Composable
private fun ExpRow(e: Expense, subject: String, first: String, name: (String) -> String) {
    val store = LocalStore.current
    val nav = LocalNav.current
    val group = e.groupId?.let { gid -> store.s.groups.find { it.id == gid } }
    val share = e.shares?.get(subject) ?: 0.0
    val paid = e.payerId == subject
    val (label, amt, color) = when {
        e.groupId == null -> Triple(if (e.income) "received" else "spent", e.amount, if (e.income) c.pos else c.fg)
        paid -> Triple("$first lent", e.amount - share, c.pos)
        else -> Triple("$first borrowed", share, c.neg)
    }
    Row(Modifier.fillMaxWidth().press { nav.push(ExpenseR(e.id)) }.padding(vertical = 10.dp), horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) {
            Txt(e.merchant, Fonts.medium, 15, c.fg, lines = 1)
            Txt(
                if (group != null) "${name(e.payerId ?: "")} paid ₹${inr(e.amount)} in ${group.name}" else "Personal",
                Fonts.body, 12.5, c.mut, Modifier.padding(top = 2.dp), lines = 1,
            )
        }
        Column(horizontalAlignment = Alignment.End) {
            Txt(label, Fonts.body, 11, color)
            Txt("₹${inr(amt)}", Fonts.displaySm, 15, color)
        }
    }
}

@Composable
private fun SetRow(st: Settlement, name: (String) -> String) {
    Row(Modifier.fillMaxWidth().padding(vertical = 10.dp), horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
        Row(Modifier.weight(1f), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon("cash-check", 18, c.pos)
            Txt("${name(st.fromId)} paid ${if (name(st.toId) == "You") "you" else name(st.toId)}", Fonts.medium, 14.5, c.fg, Modifier.weight(1f), lines = 1)
        }
        Txt("₹${inr(st.amount)}", Fonts.displaySm, 15, c.pos)
    }
}
