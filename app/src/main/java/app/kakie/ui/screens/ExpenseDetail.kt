package app.kakie.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import app.kakie.lib.inr
import app.kakie.lib.owedBack
import app.kakie.lib.personName
import app.kakie.lib.pocket
import app.kakie.lib.prettyDay
import app.kakie.lib.remainingOwed
import app.kakie.lib.youStillOwe
import app.kakie.ui.Ask
import app.kakie.ui.Back
import app.kakie.ui.Fonts
import app.kakie.ui.Icon
import app.kakie.ui.Label
import app.kakie.ui.LocalInsets
import app.kakie.ui.LocalNav
import app.kakie.ui.LocalStore
import app.kakie.ui.Split
import app.kakie.ui.TagPicker
import app.kakie.ui.Toggle
import app.kakie.ui.Txt
import app.kakie.ui.Word
import app.kakie.ui.ask
import app.kakie.ui.c
import app.kakie.ui.drawBottomLine
import app.kakie.ui.press

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun ExpenseScreen(id: String) {
    val store = LocalStore.current
    val s = store.s
    val nav = LocalNav.current
    val insets = LocalInsets.current
    val e = s.expenses.find { it.id == id }
    if (e == null) {
        Column(Modifier.fillMaxSize().background(c.bg).padding(start = 24.dp, end = 24.dp, bottom = 24.dp, top = insets.top + 8.dp)) {
            Back()
            Word("This expense is gone", 24)
            Txt("Someone in the group may have removed it.", Fonts.body, 14, c.mut, Modifier.padding(top = 8.dp))
        }
        return
    }

    val group = e.groupId?.let { gid -> s.groups.find { it.id == gid } }
    val rem = remainingOwed(s.expenses, s.settlements)
    val you = s.you.id
    fun name(pid: String) = personName(s.people, s.you, pid)
    val owed = owedBack(e, you, rem)
    val owe = youStillOwe(e, you, rem)
    val mine = if (group != null) pocket(e, you, rem) else e.amount

    fun remove() = ask(
        Ask(
            "Remove ${e.merchant}?",
            if (group != null) "It is removed for everyone in ${group.name}, and balances update." else "It comes off your spending for the month.",
            "Remove expense",
            destructive = true,
        ) {
            store.removeExpense(e.id)
            store.flash("Expense removed")
            nav.back()
        },
    )

    Column(
        Modifier.fillMaxSize().background(c.bg).verticalScroll(rememberScrollState())
            .padding(top = insets.top + 4.dp, start = 24.dp, end = 24.dp, bottom = insets.bottom + 32.dp),
    ) {
        Back()
        Txt("${prettyDay(e.at)}${if (group != null) " · ${group.name}" else ""}", Fonts.body, 13, c.mut)
        Word(e.merchant, 28, Modifier.padding(top = 4.dp))
        Txt("${if (e.income) "+" else "−"}₹${inr(e.amount)}", Fonts.display, 48, if (e.income) c.pos else c.fg, Modifier.padding(top = 10.dp), spacing = -1.5)
        FlowRow(Modifier.padding(top = 12.dp), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            InfoChip(e.rail.icon, e.rail.label)
            if (e.bank != null && e.account != null) InfoChip("bank-outline", "${e.bank} ••${e.account}")
            if (e.recurring != null) InfoChip("repeat", e.recurring)
            if (e.transfer) InfoChip("swap-horizontal", "Card bill, not spend")
        }

        Label("Tag", Modifier.padding(top = 28.dp, bottom = 10.dp))
        TagPicker(e.tag) { tag -> store.updateExpense(e.copy(tag = tag)) }

        if (group != null && e.shares != null) {
            Label("Split", Modifier.padding(top = 28.dp, bottom = 6.dp))
            Txt("${name(e.payerId ?: "")} paid", Fonts.body, 13, c.mut, Modifier.padding(bottom = 6.dp))
            e.shares.forEach { (pid, v) ->
                Row(Modifier.fillMaxWidth().drawBottomLine(c.faint, 1.dp).padding(vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                    Txt(name(pid), Fonts.medium, 14, c.fg, Modifier.weight(1f))
                    Txt("₹${inr(v)}", Fonts.displaySm, 14, c.fg)
                }
            }
            if (owed > 0) Txt("Still owed back ₹${inr(owed)}", Fonts.medium, 14, c.pos, Modifier.padding(top = 10.dp))
            if (owe > 0) Txt("You still owe ₹${inr(owe)}", Fonts.medium, 14, c.neg, Modifier.padding(top = 10.dp))
            Row(
                Modifier.padding(top = 14.dp).press { nav.push(Split(expenseId = e.id)) }.height(38.dp)
                    .border(1.dp, c.line, RoundedCornerShape(19.dp)).padding(horizontal = 14.dp),
                horizontalArrangement = Arrangement.spacedBy(6.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon("pencil-outline", 16)
                Txt("Edit split", Fonts.medium, 13, c.fg)
            }
            Row(Modifier.padding(top = 22.dp), horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Txt("Show in personal", Fonts.medium, 15, c.fg)
                    Txt(if (e.reflect) "Counts ₹${inr(mine)} toward your spend" else "Hidden from your personal spend", Fonts.body, 12.5, c.mut, Modifier.padding(top = 2.dp))
                }
                Toggle(e.reflect) { store.updateExpense(e.copy(reflect = !e.reflect)) }
            }
        }

        if (group == null && !e.income) {
            Row(Modifier.padding(top = 26.dp), horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Txt("Credit card bill", Fonts.medium, 15, c.fg)
                    Txt("Paying a card is a transfer, so it is left out of spend.", Fonts.body, 12.5, c.mut, Modifier.padding(top = 2.dp))
                }
                Toggle(e.transfer) { store.updateExpense(e.copy(transfer = !e.transfer)) }
            }
        }
        if (e.recurring != null) {
            Box(
                Modifier.padding(top = 22.dp).press {
                    s.expenses.filter { it.recurId == e.recurId && it.recurring != null }.forEach { store.updateExpense(it.copy(recurring = null)) }
                },
            ) { Txt("Stop repeating", Fonts.medium, 14, c.fg) }
        }

        Box(
            Modifier.padding(top = 32.dp).fillMaxWidth().press(onPress = ::remove).height(50.dp).border(1.dp, c.neg, RoundedCornerShape(25.dp)),
            contentAlignment = Alignment.Center,
        ) { Txt("Remove expense", Fonts.semi, 14, c.neg) }
    }
}

@Composable
private fun InfoChip(icon: String, label: String) {
    Row(
        Modifier.height(28.dp).background(c.sub, RoundedCornerShape(14.dp)).padding(horizontal = 10.dp),
        horizontalArrangement = Arrangement.spacedBy(6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(icon, 15)
        // textTransform: capitalize
        Txt(label.split(" ").joinToString(" ") { w -> w.replaceFirstChar(Char::uppercase) }, Fonts.medium, 12.5, c.fg)
    }
}
