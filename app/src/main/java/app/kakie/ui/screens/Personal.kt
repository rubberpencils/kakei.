package app.kakie.ui.screens

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import app.kakie.lib.Expense
import app.kakie.lib.dayKey
import app.kakie.lib.inr
import app.kakie.lib.monthBounds
import app.kakie.lib.owedBack
import app.kakie.lib.pocket
import app.kakie.lib.prettyDay
import app.kakie.lib.remainingOwed
import app.kakie.lib.spendIn
import app.kakie.lib.youStillOwe
import app.kakie.ui.Fonts
import app.kakie.ui.Icon
import app.kakie.ui.LocalInsets
import app.kakie.ui.LocalStore
import app.kakie.ui.Txt
import app.kakie.ui.TxnRow
import app.kakie.ui.Word
import app.kakie.ui.buzz
import app.kakie.ui.c
import app.kakie.ui.drawBottomLine
import app.kakie.ui.entering
import app.kakie.ui.fadeInE
import app.kakie.ui.press
import java.time.LocalDate

private const val OPEN_BY_DEFAULT = 3

private class Day(val key: String, val at: String, val items: MutableList<Expense> = mutableListOf(), var out: Double = 0.0, var inc: Double = 0.0)

@OptIn(ExperimentalFoundationApi::class)
@Composable
fun PersonalScreen() {
    val store = LocalStore.current
    val s = store.s
    val insets = LocalInsets.current
    var toggled by rememberSaveable { mutableStateOf(mapOf<String, Boolean>()) }
    val now = LocalDate.now()
    val bounds = monthBounds(now.year, now.monthValue)
    val month = spendIn(s.expenses, s.settlements, s.you.id, bounds.from, bounds.to)
    val rem = remainingOwed(s.expenses, s.settlements)
    var owed = 0.0
    var owe = 0.0
    for (e in s.expenses) {
        owed += owedBack(e, s.you.id, rem)
        owe += youStillOwe(e, s.you.id, rem)
    }
    val rows = s.expenses.filter { it.groupId == null || it.reflect }.sortedByDescending { it.at }
    val days = mutableListOf<Day>()
    for (e in rows) {
        val key = dayKey(e.at)
        if (days.lastOrNull()?.key != key) days += Day(key, e.at)
        val d = days.last()
        d.items += e
        if (e.income) d.inc += e.amount else d.out += pocket(e, s.you.id, rem)
    }

    LazyColumn(
        Modifier.fillMaxSize().background(c.bg).padding(top = insets.top),
        state = rememberLazyListState(),
        contentPadding = PaddingValues(start = 24.dp, end = 24.dp, top = 16.dp, bottom = 120.dp),
    ) {
        item(key = "head") {
            Column {
                Word("Personal", 28)
                Row(Modifier.padding(top = 20.dp, bottom = 12.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Stat("This month", inr(month.total), c.fg)
                    Stat("Owed back", inr(owed), if (owed > 0.5) c.pos else c.fg)
                    Stat("You owe", inr(owe), if (owe > 0.5) c.neg else c.fg)
                }
            }
        }
        if (rows.isEmpty()) {
            item(key = "empty") {
                Txt("No expenses yet. Add one, or confirm a bank SMS.", Fonts.body, 15, c.mut, Modifier.padding(top = 40.dp))
            }
        }
        days.forEachIndexed { i, d ->
            val open = toggled[d.key] ?: (i < OPEN_BY_DEFAULT)
            stickyHeader(key = d.key) {
                Box(Modifier.fillMaxWidth().background(c.bg).then(if (open) Modifier else Modifier.drawBottomLine(c.faint, 1.dp))) {
                    Row(
                        Modifier.fillMaxWidth().press {
                            buzz()
                            toggled = toggled + (d.key to !open)
                        }.height(56.dp),
                        horizontalArrangement = Arrangement.spacedBy(10.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Column(Modifier.weight(1f)) {
                            Txt(prettyDay(d.at), Fonts.semi, 15, c.fg)
                            Txt(
                                "${d.items.size} ${if (d.items.size == 1) "entry" else "entries"}${if (d.inc != 0.0) ", +₹${inr(d.inc)} in" else ""}",
                                Fonts.body, 12, c.mut, Modifier.padding(top = 1.dp),
                            )
                        }
                        Txt(if (d.out != 0.0) "₹${inr(d.out)}" else "", Fonts.displaySm, 15, c.fg)
                        Icon(if (open) "chevron-up" else "chevron-down", 20, c.mut)
                    }
                }
            }
            if (open) {
                item(key = "${d.key}-rows") {
                    Column(Modifier.entering(fadeInE(180)).padding(bottom = 8.dp)) {
                        d.items.forEach { e -> TxnRow(e, onRemove = { store.removeExpense(e.id) }, showDay = false) }
                    }
                }
            }
        }
    }
}

@Composable
private fun RowScope.Stat(label: String, value: String, color: Color) {
    Column(Modifier.weight(1f).background(c.sub, RoundedCornerShape(16.dp)).padding(12.dp)) {
        Txt(label, Fonts.medium, 11.5, c.mut, lines = 1)
        Txt("₹$value", Fonts.displaySm, 17, color, Modifier.padding(top = 4.dp), lines = 1)
    }
}
