package app.kakie.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
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
import androidx.compose.ui.unit.dp
import app.kakie.lib.inr
import app.kakie.lib.personName
import app.kakie.lib.youBalances
import app.kakie.ui.Avatar
import app.kakie.ui.Back
import app.kakie.ui.BalancesR
import app.kakie.ui.Fonts
import app.kakie.ui.GroupR
import app.kakie.ui.Icon
import app.kakie.ui.LocalInsets
import app.kakie.ui.LocalNav
import app.kakie.ui.LocalStore
import app.kakie.ui.PersonR
import app.kakie.ui.Settle
import app.kakie.ui.Txt
import app.kakie.ui.Word
import app.kakie.ui.buzz
import app.kakie.ui.c
import app.kakie.ui.drawTopLine
import app.kakie.ui.press

@Composable
fun BalancesScreen(route: BalancesR) {
    val store = LocalStore.current
    val s = store.s
    val nav = LocalNav.current
    val insets = LocalInsets.current
    var side by rememberSaveable { mutableStateOf(if (route.side == "owe") "owe" else "owed") }
    val b = youBalances(s.expenses, s.settlements, s.groups, s.you.id)
    val rows = if (side == "owed") b.owed else b.owe
    val total = if (side == "owed") b.owedTotal else b.oweTotal
    val color = if (side == "owed") c.pos else c.neg
    val groups = rows.flatMap { it.lines.map { l -> l.groupId } }.toSet().size

    Column(
        Modifier.fillMaxSize().background(c.bg).verticalScroll(rememberScrollState())
            .padding(top = insets.top + 4.dp, start = 24.dp, end = 24.dp, bottom = insets.bottom + 32.dp),
    ) {
        Back()
        Word("Balances", 28)
        Row(Modifier.padding(top = 18.dp).fillMaxWidth().background(c.sub, RoundedCornerShape(20.dp)).padding(3.dp)) {
            listOf("owed" to ("Owed to you" to b.owedTotal), "owe" to ("You owe" to b.oweTotal)).forEach { (k, pair) ->
                val on = side == k
                Column(
                    Modifier.weight(1f).press { buzz(); side = k }.height(38.dp).background(if (on) c.acc else c.sub, RoundedCornerShape(17.dp)),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.Center,
                ) {
                    Txt(pair.first, Fonts.medium, 13.5, if (on) c.accFg else c.fg)
                    Txt("₹${inr(pair.second)}", Fonts.body, 11, if (on) c.accFg else c.mut)
                }
            }
        }
        Txt("₹${inr(total)}", Fonts.display, 52, if (total > 0.005) color else c.fg, Modifier.padding(top = 28.dp), spacing = -1.5)
        Txt(
            when {
                rows.isEmpty() && side == "owed" -> "Nobody owes you anything right now."
                rows.isEmpty() -> "You do not owe anyone anything right now."
                side == "owed" -> "Coming back from ${rows.size} ${if (rows.size == 1) "person" else "people"} across $groups ${if (groups == 1) "group" else "groups"}."
                else -> "You owe ${rows.size} ${if (rows.size == 1) "person" else "people"} across $groups ${if (groups == 1) "group" else "groups"}."
            },
            Fonts.body, 14, c.mut, Modifier.padding(top = 4.dp), lineHeight = 20,
        )
        rows.forEach { r ->
            val name = personName(s.people, s.you, r.id)
            val p = s.people.find { it.id == r.id }
            val top = r.lines.firstOrNull()
            Column(Modifier.padding(top = 28.dp)) {
                Row(
                    Modifier.fillMaxWidth().press { nav.push(PersonR(r.id)) },
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Avatar(r.id, p?.initials ?: name.take(1), 40)
                    Column(Modifier.weight(1f)) {
                        Txt(name, Fonts.semi, 16, c.fg, lines = 1)
                        Txt("${r.lines.size} ${if (r.lines.size == 1) "group" else "groups"}", Fonts.body, 12.5, c.mut, Modifier.padding(top = 1.dp))
                    }
                    Txt("₹${inr(r.amount)}", Fonts.displaySm, 19, color)
                }
                Column(Modifier.padding(start = 52.dp, top = 10.dp).drawTopLine(c.faint)) {
                    r.lines.forEach { l ->
                        val g = s.groups.find { it.id == l.groupId }
                        Row(
                            Modifier.fillMaxWidth().press { nav.push(GroupR(l.groupId)) }.height(46.dp),
                            horizontalArrangement = Arrangement.spacedBy(10.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Icon(g?.icon ?: "account-group", 18, c.mut)
                            Txt(g?.name ?: "Group", Fonts.medium, 14.5, c.fg, Modifier.weight(1f), lines = 1)
                            Txt("₹${inr(l.amount)}", Fonts.displaySm, 14.5, c.fg)
                            Icon("chevron-right", 18, c.mut)
                        }
                    }
                    if (top != null) {
                        Box(
                            Modifier.padding(top = 10.dp).press { nav.push(Settle(top.groupId, r.id)) }
                                .height(34.dp).border(1.dp, c.line, RoundedCornerShape(17.dp)).padding(horizontal = 14.dp),
                            contentAlignment = Alignment.Center,
                        ) { Txt(if (side == "owed") "Record a payment" else "Settle up", Fonts.medium, 13, c.fg) }
                    }
                }
            }
        }
    }
}
