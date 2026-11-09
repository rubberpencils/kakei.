package app.kakie.ui.screens

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.FlowRowScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.kakie.lib.Moved
import app.kakie.lib.cashFlow
import app.kakie.lib.dayKey
import app.kakie.lib.inr
import app.kakie.lib.monthBounds
import app.kakie.lib.monthName
import app.kakie.lib.pad
import app.kakie.lib.personName
import app.kakie.ui.Fonts
import app.kakie.ui.Input
import app.kakie.ui.LocalInsets
import app.kakie.ui.LocalStore
import app.kakie.ui.Section
import app.kakie.ui.Segmented
import app.kakie.ui.SettleRow
import app.kakie.ui.Txt
import app.kakie.ui.TxnRow
import app.kakie.ui.Word
import app.kakie.ui.c
import app.kakie.ui.drawBottomLine
import app.kakie.ui.press
import app.kakie.ui.tagColors
import app.kakie.ui.ts
import java.time.LocalDate
import java.time.YearMonth
import java.time.temporal.ChronoUnit
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

private const val SAVE_GOAL = 0.2
private const val BARS = 72
private val PER = mapOf("day" to 1.0, "week" to 7.0, "month" to 365.0 / 12)

private fun span(a: String, b: String): Int {
    val days = runCatching { ChronoUnit.DAYS.between(LocalDate.parse(a), LocalDate.parse(b)) }.getOrDefault(0L)
    return max(1, days.toInt() + 1)
}

private fun calendarCells(y: Int, m: Int): List<Int?> {
    val first = LocalDate.of(y, m, 1)
    val padN = first.dayOfWeek.value - 1
    val count = YearMonth.of(y, m).lengthOfMonth()
    val cells = MutableList<Int?>(padN) { null }
    for (d in 1..count) cells += d
    while (cells.size % 7 != 0) cells += null
    return cells
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun InsightsScreen() {
    val store = LocalStore.current
    val s = store.s
    val insets = LocalInsets.current
    val now = LocalDate.now()
    val today = dayKey(now)
    var cursor by rememberSaveable { mutableStateOf(now.year to now.monthValue) }
    var range by rememberSaveable { mutableStateOf("month") }
    var filters by rememberSaveable { mutableStateOf(false) }
    var from by rememberSaveable { mutableStateOf("${now.year}-01-01") }
    var to by rememberSaveable { mutableStateOf(today) }
    var day by rememberSaveable { mutableStateOf<String?>(null) }
    var unit by rememberSaveable { mutableStateOf("day") }
    val you = s.you.id
    val (cy, cm) = cursor

    val bFrom: String
    val bTo: String
    when (range) {
        "year" -> {
            bFrom = "$cy-01-01"
            bTo = "$cy-12-31"
        }
        "custom" -> {
            bFrom = from
            bTo = to
        }
        else -> monthBounds(cy, cm).let {
            bFrom = it.from
            bTo = it.to
        }
    }
    val flow = cashFlow(s.expenses, s.settlements, you, bFrom, bTo)

    val periodDays = span(bFrom, bTo)
    val live = bFrom <= today && today <= bTo
    val elapsed = if (bFrom > today) 1 else span(bFrom, if (live) today else bTo)
    val perDay = (s.budget * 12) / 365
    val budget = if (range == "month") s.budget else perDay * periodDays
    val label = when (range) {
        "year" -> cy.toString()
        "custom" -> "$from to $to"
        else -> "${monthName(cm)} $cy"
    }

    val days = flow.byDay.entries.filter { it.value > 0 }.map { it.key to it.value }
    val high = days.fold<Pair<String, Double>, Pair<String, Double>?>(null) { a, d -> if (a == null || d.second > a.second) d else a }
    val low = days.fold<Pair<String, Double>, Pair<String, Double>?>(null) { a, d -> if (a == null || d.second < a.second) d else a }
    fun dayLabel(k: String) = "${k.substring(8).toInt()} ${monthName(k.substring(5, 7).toInt(), true)}"

    val weekStart = now.minusDays((now.dayOfWeek.value - 1).toLong())
    val nowFrom = when (unit) {
        "day" -> today
        "week" -> dayKey(weekStart)
        else -> monthBounds(now.year, now.monthValue).from
    }
    val soFar = cashFlow(s.expenses, s.settlements, you, nowFrom, today)
    val current = soFar.out - soFar.recurring
    // Everyday pace leaves recurring bills out: one rent day would otherwise put every average over.
    val everyday = max(0.0, budget - flow.recurring) / periodDays
    val per = PER.getValue(unit)
    val average = ((flow.out - flow.recurring) / elapsed) * per
    val allowance = everyday * per
    val daysOver = flow.byDay.values.count { it > everyday }

    val tags = flow.byTag.entries.sortedByDescending { it.value }.map { it.key to it.value }
    val tagTotal = tags.sumOf { it.second }.takeIf { it != 0.0 } ?: 1.0
    val merchants = flow.byMerchant.entries.sortedByDescending { it.value.v }.take(4)
    data class Mo(val y: Int, val m: Int, val spent: Double, val save: Double)
    val months = (5 downTo 0).map { i ->
        val ym = YearMonth.of(cy, cm).minusMonths(i.toLong())
        val b = monthBounds(ym.year, ym.monthValue)
        val moved = cashFlow(s.expenses, s.settlements, you, b.from, b.to)
        val snap = s.history.find { it.y == ym.year && it.m == ym.monthValue }
        val spent = if (moved.count != 0) moved.net else snap?.spent ?: moved.net
        Mo(ym.year, ym.monthValue, spent, max(0.0, s.budget - spent))
    }
    val maxBar = maxOf(months.maxOf { it.spent }, s.budget, 1.0)

    val cells = calendarCells(cy, cm)
    val dayItems = if (day != null) flow.items.filter { dayKey(it.at) == day } else emptyList()
    val name = { pid: String -> personName(s.people, s.you, pid) }

    val over = budget > 0 && flow.net > budget
    val scale = maxOf(budget, flow.net, 1.0)
    val unspent = max(0.0, budget - flow.net)
    val goal = budget * SAVE_GOAL
    val room = budget - goal - flow.net
    val daysLeft = periodDays - elapsed + 1
    val safe = if (live && room > 0) room / daysLeft else 0.0
    val oneTime = max(0.0, flow.out - flow.recurring)

    fun shift(dir: Int) {
        day = null
        cursor = if (range == "year") (cy + dir) to cm else YearMonth.of(cy, cm).plusMonths(dir.toLong()).let { it.year to it.monthValue }
    }

    Column(
        Modifier.fillMaxSize().background(c.bg).verticalScroll(rememberScrollState())
            .padding(top = insets.top + 16.dp, start = 20.dp, end = 20.dp, bottom = 120.dp),
    ) {
        Row(Modifier.fillMaxWidth().padding(horizontal = 4.dp), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
            Word("Insights", 28)
            Box(Modifier.press { filters = !filters }) { Txt(if (filters) "Done" else "Filter", Fonts.medium, 14, c.mut) }
        }
        if (filters) {
            Row(Modifier.padding(top = 16.dp).padding(horizontal = 4.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                listOf("year", "custom").forEach { id ->
                    val on = range == id
                    Box(
                        Modifier.press { range = if (range == id) "month" else id }.height(34.dp)
                            .background(if (on) c.acc else Color.Transparent, RoundedCornerShape(17.dp))
                            .border(1.dp, if (on) c.acc else c.line, RoundedCornerShape(17.dp)).padding(horizontal = 14.dp),
                        contentAlignment = Alignment.Center,
                    ) { Txt(if (id == "year") "Year" else "Custom", Fonts.medium, 13, if (on) c.accFg else c.fg) }
                }
            }
        }
        if (range == "custom") {
            Row(Modifier.padding(top = 14.dp).padding(horizontal = 4.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                DateField("From", from) { from = it }
                DateField("To", to) { to = it }
            }
        } else {
            Row(Modifier.fillMaxWidth().padding(top = 14.dp), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.press { shift(-1) }.size(44.dp), contentAlignment = Alignment.Center) { Txt("‹", FontFamily.Default, 22, c.fg) }
                Txt(label, Fonts.displaySm, 17, c.fg)
                Box(Modifier.press { shift(1) }.size(44.dp), contentAlignment = Alignment.Center) { Txt("›", FontFamily.Default, 22, c.fg) }
            }
        }

        Card(Modifier.padding(top = 10.dp)) {
            Txt("Spent", Fonts.medium, 13, c.mut)
            Txt("₹${inr(flow.net)}", Fonts.display, 40, c.fg, Modifier.padding(top = 2.dp), spacing = -1.2)
            Txt(
                when {
                    budget == 0.0 -> "Set a monthly budget in Profile to track it here"
                    over -> "₹${inr(flow.net - budget)} over the ₹${inr(budget)} budget"
                    else -> "${((unspent / budget) * 100).roundToInt()}% of ₹${inr(budget)} left"
                },
                Fonts.body, 13, c.mut, Modifier.padding(top = 2.dp),
            )
            Box(Modifier.padding(top = 16.dp)) {
                Meter(
                    listOf((flow.real / scale) * 100 to (if (over) c.neg else c.fg), (flow.owed / scale) * 100 to c.pos),
                    mark = if (over) (budget / scale) * 100 else null,
                )
            }
            Column(Modifier.padding(top = 14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Key(if (over) c.neg else c.fg, "Your real spend", flow.real)
                Key(c.pos, "Coming back to you", flow.owed)
                if (budget != 0.0) Key(c.mut, if (over) "Over budget" else "Left in budget", if (over) flow.net - budget else unspent, ring = true)
            }
            if (flow.back != 0.0) {
                Txt("₹${inr(flow.out)} went out, ₹${inr(flow.back)} was paid back by friends.", Fonts.body, 12, c.mut, Modifier.padding(top = 12.dp), lineHeight = 17)
            }
        }

        Section("Pace", top = 28)
        Segmented(listOf("day" to "Daily", "week" to "Weekly", "month" to "Monthly"), unit) { unit = it }
        Card(Modifier.padding(top = 10.dp), gap = 16) {
            if (live) Pace(if (unit == "day") "Today" else if (unit == "week") "This week" else "This month", current, allowance)
            Pace("Average $unit", average, allowance)
            Txt(
                if (s.budget != 0.0) "Everyday spending, with rent and other recurring bills left out. After those, your budget allows ₹${inr(allowance)} a $unit."
                else "Set a monthly budget in Profile to see how much you can spend each day.",
                Fonts.body, 12, c.mut, lineHeight = 17,
            )
        }

        if (range == "month") {
            Section("Calendar", top = 28)
            Card {
                Row {
                    listOf("M", "T", "W", "T", "F", "S", "S").forEach {
                        Txt(it, Fonts.medium, 11, c.mut, Modifier.weight(1f).padding(bottom = 6.dp), align = TextAlign.Center)
                    }
                }
                BoxWithConstraints(Modifier.fillMaxWidth()) {
                    val cellW = maxWidth * 0.1428f
                    FlowRow {
                        cells.forEach { n ->
                            val key = if (n != null) "$cy-${pad(cm)}-${pad(n)}" else ""
                            val v = if (n != null) flow.byDay[key] ?: 0.0 else 0.0
                            val ratio = v / (everyday.takeIf { it != 0.0 } ?: high?.second ?: 1.0)
                            val on = day == key
                            Box(Modifier.width(cellW).padding(2.5.dp)) {
                                if (n != null) {
                                    Box(
                                        Modifier.fillMaxWidth().press { day = if (on) null else key }.height(38.dp).clip(RoundedCornerShape(10.dp))
                                            .background(if (on) c.acc else Color.Transparent)
                                            .then(if (key == today && !on) Modifier.border(1.dp, c.line, RoundedCornerShape(10.dp)) else Modifier),
                                        contentAlignment = Alignment.Center,
                                    ) {
                                        if (v > 0 && !on) {
                                            val alpha = if (ratio > 1) 0.3 + 0.3 * min(1.0, ratio - 1) else 0.12 + 0.3 * ratio
                                            Box(Modifier.matchParentSize().background((if (ratio > 1) c.neg else c.pos).copy(alpha = alpha.toFloat().coerceIn(0f, 1f))))
                                        }
                                        Txt(n.toString(), Fonts.medium, 13, if (on) c.accFg else c.fg)
                                    }
                                }
                            }
                        }
                    }
                }
                Txt(
                    (if (everyday != 0.0) "Green days stayed under your everyday ₹${inr(everyday)}, red went over." else "Days are shaded by money out.") + " Tap a day to see it.",
                    Fonts.body, 12, c.mut, Modifier.padding(top = 10.dp), lineHeight = 17,
                )
            }
            if (day != null) {
                Column(Modifier.padding(top = 6.dp).padding(horizontal = 4.dp)) {
                    if (dayItems.isEmpty()) {
                        Txt("No money moved on this day.", Fonts.body, 14, c.mut, Modifier.padding(vertical = 12.dp))
                    } else {
                        dayItems.forEach { x ->
                            when (x) {
                                is Moved.Exp -> TxnRow(x.e, full = true)
                                is Moved.Set -> SettleRow(x.s, you, name)
                            }
                        }
                    }
                }
            }
        }

        FlowRow(Modifier.padding(top = 14.dp), horizontalArrangement = Arrangement.spacedBy(10.dp), verticalArrangement = Arrangement.spacedBy(10.dp), maxItemsInEachRow = 2) {
            Tile("Lowest day", if (low != null) "₹${inr(low.second)}" else "None", if (low != null) dayLabel(low.first) else "")
            Tile("Highest day", if (high != null) "₹${inr(high.second)}" else "None", if (high != null) dayLabel(high.first) else "")
            Tile("Expenses", flow.count.toString(), "${days.size} ${if (days.size == 1) "day" else "days"} with spending")
            if (everyday != 0.0) {
                Tile("Days on budget", "${max(0, elapsed - daysOver)} of $elapsed", "under ₹${inr(everyday)} a day")
            } else {
                Tile("Daily average", "₹${inr(flow.out / elapsed)}", "over $elapsed ${if (elapsed == 1) "day" else "days"}")
            }
        }

        Section("Categories", top = 28)
        Card(row = true) {
            Pie(tags.take(6).map { (tag, v) -> tag to (v / tagTotal) * 100 }, c.bar, c.dark)
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                tags.take(6).forEach { (tag, v) ->
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                        Box(Modifier.size(8.dp).background(tagColors(tag, c.dark).pie, RoundedCornerShape(4.dp)))
                        Txt("#$tag", Fonts.body, 13, c.fg, Modifier.weight(1f), lines = 1)
                        Txt("${((v / tagTotal) * 100).roundToInt()}%", Fonts.displaySm, 12, c.mut)
                    }
                }
                if (tags.isEmpty()) Txt("Nothing spent in this range.", Fonts.body, 14, c.mut)
            }
        }

        Section("Savings", top = 28)
        Card {
            if (budget != 0.0) {
                Txt(if (live) "Safe to spend" else "Saved", Fonts.medium, 13, c.mut)
                Row(Modifier.padding(top = 2.dp), horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.Bottom) {
                    Txt("₹${inr(if (live) safe else unspent)}", Fonts.display, 30, if (live && safe == 0.0) c.neg else c.fg, Modifier.alignByBaseline(), spacing = -0.8)
                    Txt(if (live) "a day" else "${((unspent / budget) * 100).roundToInt()}% of budget", Fonts.semi, 14, c.mut, Modifier.alignByBaseline())
                }
                Txt(
                    when {
                        !live -> if (unspent >= goal) "You hit the 20% savings goal." else "₹${inr(goal - unspent)} short of the 20% goal."
                        safe != 0.0 -> "for the next $daysLeft ${if (daysLeft == 1) "day" else "days"} to still save 20%"
                        over -> "Over budget, so nothing is left to save."
                        else -> "₹${inr(-room)} of the 20% savings is already spent."
                    },
                    Fonts.body, 13, c.mut, Modifier.padding(top = 2.dp),
                )
                Box(Modifier.padding(top = 16.dp)) {
                    val z = 100 - SAVE_GOAL * 100
                    Meter(listOf((flow.net / budget) * 100 to (if (room < 0) c.neg else c.fg)), mark = z, zone = z)
                }
                Row(Modifier.fillMaxWidth().padding(top = 8.dp), horizontalArrangement = Arrangement.SpaceBetween) {
                    Txt("Spent ₹${inr(flow.net)}", Fonts.body, 12, c.mut)
                    Txt("Save 20%, ₹${inr(goal)}", Fonts.body, 12, c.pos)
                }
            } else {
                Txt("Set a monthly budget in Profile to see savings.", Fonts.body, 14, c.mut)
            }
            Box(Modifier.padding(top = 22.dp).fillMaxWidth().height(BARS.dp)) {
                Row(Modifier.matchParentSize(), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.Bottom) {
                    months.forEach { mo ->
                        Box(
                            Modifier.weight(1f).height(max(4.0, (mo.spent / maxBar) * BARS).dp)
                                .background(if (s.budget == 0.0) c.bar else if (mo.save > 0) c.pos else c.neg, RoundedCornerShape(6.dp)),
                        )
                    }
                }
                if (s.budget != 0.0) {
                    Box(
                        Modifier.align(Alignment.BottomStart).offset(y = -((s.budget / maxBar) * BARS).dp).fillMaxWidth().height(1.dp)
                            .background(c.fg.copy(alpha = 0.35f)),
                    )
                }
            }
            Row(Modifier.padding(top = 6.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                months.forEach { mo -> Txt(monthName(mo.m, true), Fonts.medium, 10, c.mut, Modifier.weight(1f), align = TextAlign.Center) }
            }
            if (s.budget != 0.0) Txt("Last six months against your budget line.", Fonts.body, 12, c.mut, Modifier.padding(top = 8.dp))
        }

        Section("Recurring and one-time", top = 28)
        Card(gap = 12) {
            Meter(
                listOf(
                    (if (flow.out != 0.0) (flow.recurring / flow.out) * 100 else 0.0) to c.fg,
                    (if (flow.out != 0.0) (oneTime / flow.out) * 100 else 0.0) to c.mut,
                ),
            )
            Key(c.fg, "Recurring", flow.recurring, pct = if (flow.out != 0.0) flow.recurring / flow.out else 0.0)
            Key(c.mut, "One-time", oneTime, pct = if (flow.out != 0.0) oneTime / flow.out else 0.0)
        }

        Section("Top merchants", top = 28)
        merchants.forEachIndexed { i, (merchant, v) ->
            Row(Modifier.padding(vertical = 10.dp, horizontal = 4.dp), horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
                Txt("${i + 1}", Fonts.mono, 14, c.mut, Modifier.width(18.dp))
                Column(Modifier.weight(1f)) {
                    Txt(merchant, Fonts.medium, 15, c.fg)
                    Txt("${v.n} ${if (v.n == 1) "time" else "times"}", Fonts.body, 12, c.mut)
                }
                Txt("₹${inr(v.v)}", Fonts.displaySm, 15, c.fg)
            }
        }
        if (merchants.isEmpty()) Txt("Nothing yet.", Fonts.body, 14, c.mut, Modifier.padding(horizontal = 4.dp))
    }
}

@Composable
private fun Card(modifier: Modifier = Modifier, gap: Int = 0, content: @Composable ColumnScope.() -> Unit) {
    Column(
        modifier.fillMaxWidth().background(c.sub, RoundedCornerShape(22.dp)).padding(18.dp),
        verticalArrangement = Arrangement.spacedBy(gap.dp),
        content = content,
    )
}

@Composable
private fun Card(row: Boolean, content: @Composable RowScope.() -> Unit) {
    Row(
        Modifier.fillMaxWidth().background(c.sub, RoundedCornerShape(22.dp)).padding(18.dp),
        horizontalArrangement = Arrangement.spacedBy(16.dp),
        verticalAlignment = Alignment.CenterVertically,
        content = content,
    )
}

@Composable
private fun Meter(parts: List<Pair<Double, Color>>, mark: Double? = null, zone: Double? = null) {
    BoxWithConstraints(Modifier.fillMaxWidth()) {
        val w = maxWidth
        Box(Modifier.fillMaxWidth().height(10.dp).clip(RoundedCornerShape(5.dp)).background(c.bar)) {
            if (zone != null) Box(Modifier.offset(x = w * (zone / 100).toFloat()).width(w * (1 - zone / 100).toFloat()).height(10.dp).background(c.pos.copy(alpha = 0.3f)))
            Row {
                parts.forEach { (pct, color) -> Box(Modifier.width(w * (pct.coerceIn(0.0, 100.0) / 100).toFloat()).height(10.dp).background(color)) }
            }
        }
        if (mark != null) {
            Box(Modifier.offset(x = w * (min(100.0, mark) / 100).toFloat(), y = (-3).dp).size(2.dp, 16.dp).background(c.fg, RoundedCornerShape(1.dp)))
        }
    }
}

@Composable
private fun Key(color: Color, label: String, value: Double, pct: Double? = null, ring: Boolean = false) {
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
        Box(
            Modifier.size(8.dp).clip(RoundedCornerShape(4.dp))
                .then(if (ring) Modifier.border(1.5.dp, color, RoundedCornerShape(4.dp)) else Modifier.background(color)),
        )
        Txt(label, Fonts.body, 13, c.mut, Modifier.weight(1f))
        Txt("₹${inr(value)}${if (pct != null) " (${(pct * 100).roundToInt()}%)" else ""}", Fonts.semi, 13, c.fg)
    }
}

@Composable
private fun Pace(label: String, value: Double, limit: Double) {
    val over = limit > 0 && value > limit
    Column {
        Row(Modifier.fillMaxWidth().padding(bottom = 8.dp), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.Bottom) {
            Txt(label, Fonts.medium, 13, c.mut, Modifier.alignByBaseline())
            val mut = c.mut
            Txt(
                buildAnnotatedString {
                    append("₹${inr(value)}")
                    if (limit > 0) withStyle(SpanStyle(fontFamily = Fonts.body, fontSize = 12.sp, color = mut)) { append(" of ₹${inr(limit)}") }
                },
                Fonts.displaySm, 16, if (over) c.neg else c.fg, Modifier.alignByBaseline(),
            )
        }
        Meter(listOf((if (limit > 0) (value / limit) * 100 else 0.0) to (if (over) c.neg else c.pos)))
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun FlowRowScope.Tile(label: String, value: String, sub: String) {
    Column(Modifier.weight(1f).background(c.sub, RoundedCornerShape(18.dp)).padding(14.dp)) {
        Txt(label, Fonts.medium, 12, c.mut)
        Txt(value, Fonts.displaySm, 19, c.fg, Modifier.padding(top = 6.dp), lines = 1)
        if (sub.isNotEmpty()) Txt(sub, Fonts.body, 11.5, c.mut, Modifier.padding(top = 2.dp), lines = 1)
    }
}

@Composable
private fun Pie(slices: List<Pair<String, Double>>, track: Color, isDark: Boolean) {
    Canvas(Modifier.size(128.dp)) {
        val r = 46.dp.toPx()
        val stroke = 16.dp.toPx()
        val topLeft = androidx.compose.ui.geometry.Offset(center.x - r, center.y - r)
        val arc = androidx.compose.ui.geometry.Size(r * 2, r * 2)
        drawCircle(track, r, style = Stroke(stroke))
        var start = -90f
        slices.forEach { (tag, pct) ->
            val sweep = (pct / 100 * 360).toFloat()
            drawArc(tagColors(tag, isDark).pie, start, sweep, false, topLeft, arc, style = Stroke(stroke, cap = StrokeCap.Butt))
            start += sweep
        }
    }
}

@Composable
private fun RowScope.DateField(label: String, value: String, onChange: (String) -> Unit) {
    Column(Modifier.weight(1f)) {
        Txt(label, Fonts.body, 12, c.mut)
        Input(
            value, onChange, ts(Fonts.mono, 13, c.fg),
            Modifier.fillMaxWidth().drawBottomLine(c.faint, 1.dp).padding(vertical = 6.dp),
            caps = KeyboardCapitalization.None,
        )
    }
}
