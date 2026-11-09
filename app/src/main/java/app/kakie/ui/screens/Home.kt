package app.kakie.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.withTransform
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import app.kakie.lib.dayKey
import app.kakie.lib.enIn
import app.kakie.lib.groupDebts
import app.kakie.lib.inr
import app.kakie.lib.monthBounds
import app.kakie.lib.monthName
import app.kakie.lib.spendIn
import app.kakie.lib.youNet
import app.kakie.lib.SyncState
import app.kakie.ui.Add
import app.kakie.ui.Avatar
import app.kakie.ui.Fonts
import app.kakie.ui.GroupR
import app.kakie.ui.Icon
import app.kakie.ui.LocalInsets
import app.kakie.ui.LocalNav
import app.kakie.ui.LocalStore
import app.kakie.ui.NewGroup
import app.kakie.ui.Review
import app.kakie.ui.Search
import app.kakie.ui.Section
import app.kakie.ui.Tab
import app.kakie.ui.Txt
import app.kakie.ui.TxnRow
import app.kakie.ui.Word
import app.kakie.ui.Wordmark
import app.kakie.ui.c
import app.kakie.ui.hairline
import app.kakie.ui.press
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.YearMonth
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun HomeScreen() {
    val store = LocalStore.current
    val s = store.s
    val nav = LocalNav.current
    val insets = LocalInsets.current
    val now = LocalDateTime.now()
    val y = now.year
    val m = now.monthValue
    val bounds = monthBounds(y, m)
    val month = spendIn(s.expenses, s.settlements, s.you.id, bounds.from, bounds.to)
    val left = max(0.0, s.budget - month.total)
    val pct = min(100.0, if (s.budget != 0.0) (month.total / s.budget) * 100 else 0.0)
    val day = now.dayOfMonth
    val days = YearMonth.of(y, m).lengthOfMonth()
    val pace = if (day >= 5) ((month.total / day) * days).roundToInt().toDouble() else null
    val onTrack = pace == null || pace <= s.budget

    var owed = 0.0
    var owe = 0.0
    var owedPeople = 0
    var oweGroups = 0
    for (g in s.groups) {
        val debts = groupDebts(s.expenses, s.settlements, g)
        val n = youNet(debts, s.you.id)
        owed += n.owed
        owe += n.owe
        owedPeople += debts.count { it.toId == s.you.id }
        if (n.owe > 0.5) oweGroups += 1
    }

    val today = LocalDate.now()
    val week = (0..6).map { i ->
        val d = today.minusDays((6 - i).toLong())
        val key = dayKey(d)
        Triple(enIn("EEEEE", d.atTime(12, 0)), key, month.byDay[key]?.total ?: spendIn(s.expenses, s.settlements, s.you.id, key, key).total)
    }
    val wMax = max(week.maxOf { it.third }, 1.0)

    val recent = s.expenses.filter { it.groupId == null || it.reflect }.sortedByDescending { it.at }.take(6)
    val preview = s.queue.take(2).joinToString(", ") { it.merchant }
    val empty = s.expenses.isEmpty() && s.groups.isEmpty() && s.queue.isEmpty()
    val budgetLine = when {
        s.budget == 0.0 -> "Set a monthly budget in Profile to see savings"
        pace == null -> "Early in ${monthName(m)} · ₹${inr(left)} left of ₹${inr(s.budget)}"
        onTrack -> "On track · save about ₹${inr(s.budget - pace)} this month"
        else -> "Pace is ₹${inr(pace - s.budget)} over budget"
    }
    val glow = c.fg

    Box(
        Modifier.fillMaxSize().background(c.bg).drawBehind {
            // SVG radial gradient (cx 50%, cy 0, r 75%) over a 280-tall box: elliptical, so draw a circle and squash it.
            val h = 280.dp.toPx()
            val w = size.width
            withTransform({ scale(1f, h / w, Offset(w / 2, 0f)) }) {
                drawRect(
                    Brush.radialGradient(listOf(glow.copy(alpha = 0.08f), glow.copy(alpha = 0f)), Offset(w / 2, 0f), w * 0.75f),
                    size = Size(w, w),
                )
            }
        },
    ) {
        Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(bottom = 120.dp)) {
            Column(Modifier.padding(top = insets.top + 8.dp, start = 24.dp, end = 24.dp)) {
                Row(Modifier.fillMaxWidth().height(52.dp), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                    Wordmark()
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Box(Modifier.press { nav.push(Search) }.size(40.dp), contentAlignment = Alignment.Center) { Icon("magnify", 23) }
                        Box(Modifier.press { nav.push(Review) }.size(40.dp), contentAlignment = Alignment.Center) {
                            Icon("bell-outline", 23)
                            if (s.queue.isNotEmpty()) {
                                Box(Modifier.align(Alignment.TopEnd).padding(top = 10.dp, end = 10.dp).size(7.dp).background(c.brand, RoundedCornerShape(4.dp)))
                            }
                        }
                        Box(Modifier.padding(start = 4.dp).press { nav.tab = Tab.PROFILE }) { Avatar(s.you.id, s.you.initials, 34, you = true) }
                    }
                }
                val offline = if (store.sync == SyncState.OFFLINE) ", offline${if (store.pending > 0) " with ${store.pending} waiting" else ""}" else ""
                Txt(enIn("EEEEdMMMM", now) + offline, Fonts.body, 13, c.mut)

                Txt("Spent in ${monthName(m)}", Fonts.medium, 13, c.mut, Modifier.padding(top = 24.dp))
                Row(Modifier.padding(top = 4.dp), verticalAlignment = Alignment.Bottom) {
                    Txt("₹", Fonts.display, 26, c.mut)
                    Txt(inr(month.total), Fonts.display, 58, c.fg, spacing = -2, lineHeight = 64)
                }
                Row(Modifier.padding(top = 14.dp), horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
                    Box(Modifier.weight(1f).height(4.dp).background(c.bar, RoundedCornerShape(2.dp))) {
                        Box(Modifier.fillMaxWidth((pct / 100).toFloat()).height(4.dp).background(c.acc, RoundedCornerShape(2.dp)))
                    }
                    if (s.budget != 0.0) Txt("₹${inr(left)} left", Fonts.body, 13, c.mut)
                }
                Row(Modifier.padding(top = 8.dp), horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                    Icon(if (onTrack) "trending-down" else "trending-up", 16, if (onTrack) c.pos else c.neg)
                    Txt(budgetLine, Fonts.medium, 12.5, if (s.budget == 0.0) c.mut else if (onTrack) c.pos else c.neg)
                }

                if (empty) {
                    Column(Modifier.padding(top = 28.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        Word("Start your ledger", 20)
                        Txt("Confirm a bank SMS, add a spend by hand, or make a group with friends.", Fonts.body, 14, c.mut, lineHeight = 20)
                        FlowRow(Modifier.padding(top = 6.dp), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            Pill("message-text-outline", "Review SMS") { nav.push(Review) }
                            Pill("plus", "Add expense") { nav.push(Add) }
                            Pill("account-multiple-plus", "New group") { nav.push(NewGroup) }
                            Pill("flask-outline", "Try sample data") { store.loadSample() }
                        }
                    }
                }

                Section("This week")
                Row(Modifier.fillMaxWidth().height(78.dp), horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.Bottom) {
                    week.forEachIndexed { i, (label, _, v) ->
                        val isToday = i == 6
                        Column(Modifier.weight(1f).fillMaxHeight(), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Bottom) {
                            Box(
                                Modifier.fillMaxWidth().height(max(4.0, (v / wMax) * 56).dp)
                                    .background(if (isToday) c.acc else if (v != 0.0) c.bar else c.faint, RoundedCornerShape(6.dp)),
                            )
                            Txt(label, if (isToday) Fonts.semi else Fonts.body, 10.5, if (isToday) c.fg else c.mut, Modifier.padding(top = 6.dp))
                        }
                    }
                }

                if (s.queue.isNotEmpty()) {
                    Row(
                        Modifier.padding(top = 24.dp).fillMaxWidth().press { nav.push(Review) }.background(c.sub, RoundedCornerShape(20.dp)).padding(16.dp),
                        horizontalArrangement = Arrangement.spacedBy(14.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Box(Modifier.size(36.dp).background(c.acc, RoundedCornerShape(18.dp)), contentAlignment = Alignment.Center) {
                            Txt(s.queue.size.toString(), Fonts.bold, 13, c.accFg)
                        }
                        Column(Modifier.weight(1f)) {
                            Txt("New bank transactions", Fonts.semi, 14.5, c.fg)
                            Txt(preview, Fonts.body, 12.5, c.mut, Modifier.padding(top = 2.dp), lines = 1)
                        }
                        Icon("chevron-right", 22, c.mut)
                    }
                } else {
                    val line = hairline
                    val faint = c.faint
                    Row(
                        Modifier.padding(top = 24.dp).fillMaxWidth().drawBehind {
                            drawRect(faint, size = Size(size.width, line.toPx()))
                            drawRect(faint, Offset(0f, size.height - line.toPx()), Size(size.width, line.toPx()))
                        }.padding(vertical = 12.dp),
                        horizontalArrangement = Arrangement.spacedBy(10.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Icon("check-all", 20, c.pos)
                        Txt("No new bank SMS to review", Fonts.body, 14, c.mut)
                    }
                }

                Row(Modifier.padding(top = 24.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    NetCard("Owed to you", owed, if (owed > 0.5) c.pos else c.fg, "$owedPeople ${if (owedPeople == 1) "person" else "people"}") { nav.tab = Tab.GROUPS }
                    NetCard("You owe", owe, if (owe > 0.5) c.neg else c.fg, "$oweGroups ${if (oweGroups == 1) "group" else "groups"}") { nav.tab = Tab.GROUPS }
                }
            }

            Box(Modifier.padding(horizontal = 24.dp)) { Section("Groups", "See all", { nav.tab = Tab.GROUPS }) }
            // Cards stretch to the tallest one, like a row with align-items: stretch.
            Row(
                Modifier.horizontalScroll(rememberScrollState()).height(IntrinsicSize.Min).padding(horizontal = 24.dp),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                s.groups.forEach { g ->
                    val n = youNet(groupDebts(s.expenses, s.settlements, g), s.you.id)
                    val color = if (n.net > 0) c.pos else if (n.net < 0) c.neg else c.mut
                    Column(Modifier.press { nav.push(GroupR(g.id)) }.width(156.dp).fillMaxHeight().background(c.sub, RoundedCornerShape(20.dp)).padding(16.dp)) {
                        Box(Modifier.padding(bottom = 12.dp).size(38.dp).background(c.bg, RoundedCornerShape(12.dp)), contentAlignment = Alignment.Center) { Icon(g.icon, 20) }
                        Txt(g.name, Fonts.semi, 15, c.fg, lines = 1)
                        Txt("${g.memberIds.size + 1} people", Fonts.body, 12, c.mut, Modifier.padding(top = 2.dp))
                        Txt(if (n.net > 0.5) "Owed to you" else if (n.net < -0.5) "You owe" else "Settled up", Fonts.medium, 12, c.mut, Modifier.padding(top = 14.dp))
                        Txt(if (abs(n.net) > 0.5) "₹${inr(abs(n.net))}" else "₹0", Fonts.displaySm, 20, color, Modifier.padding(top = 2.dp))
                    }
                }
                val line = c.line
                Column(
                    Modifier.press { nav.push(NewGroup) }.width(90.dp).fillMaxHeight().drawBehind {
                        val w = 1.dp.toPx()
                        drawRoundRect(
                            line, Offset(w / 2, w / 2), Size(size.width - w, size.height - w), CornerRadius(20.dp.toPx()),
                            style = Stroke(w, pathEffect = PathEffect.dashPathEffect(floatArrayOf(w * 3, w * 3))),
                        )
                    },
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(8.dp, Alignment.CenterVertically),
                ) {
                    Icon("account-multiple-plus", 24, c.mut)
                    Txt("New\ngroup", Fonts.body, 12, c.mut, align = TextAlign.Center)
                }
            }

            Column(Modifier.padding(horizontal = 24.dp)) {
                Section("Recent", "See all", { nav.tab = Tab.PERSONAL })
                recent.forEach { TxnRow(it) }
            }
        }
    }
}

@Composable
private fun RowScope.NetCard(label: String, amount: Double, color: androidx.compose.ui.graphics.Color, sub: String, onPress: () -> Unit) {
    Column(Modifier.weight(1f).press(onPress = onPress).background(c.sub, RoundedCornerShape(20.dp)).padding(16.dp)) {
        Txt(label, Fonts.medium, 12.5, c.mut)
        Txt("₹${inr(amount)}", Fonts.displaySm, 26, color, Modifier.padding(top = 6.dp))
        Txt(sub, Fonts.body, 12, c.mut, Modifier.padding(top = 4.dp))
    }
}

@Composable
private fun Pill(icon: String, label: String, onPress: () -> Unit) {
    Row(
        Modifier.press(onPress = onPress).height(40.dp).background(c.sub, RoundedCornerShape(20.dp)).padding(horizontal = 14.dp),
        horizontalArrangement = Arrangement.spacedBy(7.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(icon, 17)
        Txt(label, Fonts.medium, 13.5, c.fg)
    }
}
