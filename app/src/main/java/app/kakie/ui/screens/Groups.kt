package app.kakie.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import app.kakie.lib.GroupNet
import app.kakie.lib.friendBalances
import app.kakie.lib.groupDebts
import app.kakie.lib.inr
import app.kakie.lib.personName
import app.kakie.lib.youNet
import app.kakie.ui.Avatar
import app.kakie.ui.Fonts
import app.kakie.ui.GroupR
import app.kakie.ui.Icon
import app.kakie.ui.Join
import app.kakie.ui.LocalInsets
import app.kakie.ui.LocalNav
import app.kakie.ui.LocalStore
import app.kakie.ui.NewGroup
import app.kakie.ui.PersonR
import app.kakie.ui.Segmented
import app.kakie.ui.Txt
import app.kakie.ui.Word
import app.kakie.ui.c
import app.kakie.ui.entering
import app.kakie.ui.fadeInE
import app.kakie.ui.press
import kotlin.math.abs
import kotlin.math.max

@Composable
fun GroupsScreen() {
    val store = LocalStore.current
    val s = store.s
    val nav = LocalNav.current
    val insets = LocalInsets.current
    var view by rememberSaveable { mutableStateOf("groups") }
    val you = s.you.id
    val friends = friendBalances(s.expenses, s.settlements, s.groups, you)
    val owed = friends.sumOf { max(0.0, it.net) }
    val owe = friends.sumOf { max(0.0, -it.net) }
    fun first(pid: String) = personName(s.people, s.you, pid).split(" ")[0]

    Column(
        Modifier.fillMaxSize().background(c.bg).verticalScroll(rememberScrollState())
            .padding(top = insets.top + 16.dp, start = 24.dp, end = 24.dp, bottom = 120.dp),
    ) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
            Word("Groups", 28)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Box(
                    Modifier.press { nav.push(Join()) }.height(36.dp).border(1.dp, c.line, RoundedCornerShape(18.dp)).padding(horizontal = 14.dp),
                    contentAlignment = Alignment.Center,
                ) { Txt("Join with code", Fonts.medium, 13, c.fg) }
                Box(Modifier.press { nav.push(NewGroup) }.size(36.dp).background(c.acc, RoundedCornerShape(18.dp)), contentAlignment = Alignment.Center) {
                    Icon("plus", 20, c.accFg)
                }
            }
        }

        if (s.groups.isNotEmpty()) {
            Row(Modifier.padding(top = 20.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Total("Owed to you", owed, if (owed != 0.0) c.pos else c.fg)
                Total("You owe", owe, if (owe != 0.0) c.neg else c.fg)
            }
        }

        Box(Modifier.padding(top = 24.dp)) {
            Segmented(listOf("groups" to "Groups", "friends" to "Friends"), view) { view = it }
        }

        key(view) {
            Column(Modifier.padding(top = 8.dp).entering(fadeInE(180))) {
                if (view == "groups") {
                    s.groups.forEach { g ->
                        val debts = groupDebts(s.expenses, s.settlements, g)
                        val n = youNet(debts, you)
                        val mine = debts.filter { it.fromId == you || it.toId == you }
                        val color = if (n.net > 0) c.pos else if (n.net < 0) c.neg else c.mut
                        Row(
                            Modifier.fillMaxWidth().press { nav.push(GroupR(g.id)) }.padding(vertical = 14.dp),
                            horizontalArrangement = Arrangement.spacedBy(14.dp),
                        ) {
                            Box(Modifier.size(46.dp).background(c.sub, RoundedCornerShape(14.dp)), contentAlignment = Alignment.Center) { Icon(g.icon, 22) }
                            Column(Modifier.weight(1f).defaultMinSize(minHeight = 46.dp), verticalArrangement = Arrangement.Center) {
                                Txt(g.name, Fonts.semi, 16, c.fg, lines = 1)
                                if (mine.isNotEmpty()) {
                                    mine.take(2).forEach { d ->
                                        Txt(
                                            if (d.toId == you) "${first(d.fromId)} owes you ₹${inr(d.amount)}" else "You owe ${first(d.toId)} ₹${inr(d.amount)}",
                                            Fonts.body, 12.5, c.mut, Modifier.padding(top = 2.dp), lines = 1,
                                        )
                                    }
                                } else {
                                    Txt("${g.memberIds.size + 1} people", Fonts.body, 12.5, c.mut, Modifier.padding(top = 2.dp))
                                }
                                if (mine.size > 2) Txt("and ${mine.size - 2} more", Fonts.body, 12.5, c.mut, Modifier.padding(top = 2.dp))
                            }
                            Column(Modifier.defaultMinSize(minHeight = 46.dp), horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.Center) {
                                Txt(if (n.net > 0) "you are owed" else if (n.net < 0) "you owe" else "settled up", Fonts.body, 11.5, color)
                                if (n.net != 0.0) Txt("₹${inr(abs(n.net))}", Fonts.displaySm, 16, color)
                            }
                        }
                    }
                } else {
                    friends.forEach { f ->
                        val p = s.people.find { it.id == f.id }
                        val color = if (f.net > 0.5) c.pos else if (f.net < -0.5) c.neg else c.mut
                        Row(
                            Modifier.fillMaxWidth().press { nav.push(PersonR(f.id)) }.padding(vertical = 12.dp),
                            horizontalArrangement = Arrangement.spacedBy(14.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Avatar(f.id, p?.initials ?: "?", 42)
                            Column(Modifier.weight(1f)) {
                                Txt(p?.name ?: "Someone", Fonts.semi, 16, c.fg, lines = 1)
                                Txt(groupCount(f.groups), Fonts.body, 12.5, c.mut, Modifier.padding(top = 2.dp))
                            }
                            Column(horizontalAlignment = Alignment.End) {
                                Txt(if (f.net > 0.5) "owes you" else if (f.net < -0.5) "you owe" else "settled up", Fonts.body, 11.5, color)
                                if (abs(f.net) > 0.5) Txt("₹${inr(abs(f.net))}", Fonts.displaySm, 16, color)
                            }
                        }
                    }
                }
            }
        }

        if (s.groups.isEmpty()) {
            Column(Modifier.padding(top = 40.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Box(Modifier.size(56.dp).background(c.sub, RoundedCornerShape(16.dp)), contentAlignment = Alignment.Center) { Icon("account-group-outline", 28) }
                Word("No groups yet", 20)
                Txt(
                    "Make one for a trip, a flat, or Friday lunches. Share its code and friends join from their phones.",
                    Fonts.body, 14, c.mut, lineHeight = 20,
                )
                Row(
                    Modifier.padding(top = 6.dp).press { nav.push(NewGroup) }.height(44.dp).background(c.acc, RoundedCornerShape(22.dp)).padding(horizontal = 18.dp),
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon("plus", 18, c.accFg)
                    Txt("Start a group", Fonts.semi, 14, c.accFg)
                }
            }
        }
    }
}

private fun groupCount(groups: List<GroupNet>): String {
    val n = groups.map { it.groupId }.toSet().size
    return if (n != 0) "In $n ${if (n == 1) "group" else "groups"}" else "No open balances"
}

@Composable
private fun RowScope.Total(label: String, amount: Double, color: Color) {
    Column(Modifier.weight(1f).background(c.sub, RoundedCornerShape(20.dp)).padding(16.dp)) {
        Txt(label, Fonts.medium, 12.5, c.mut)
        Txt("₹${inr(amount)}", Fonts.displaySm, 24, color, Modifier.padding(top = 6.dp))
    }
}
