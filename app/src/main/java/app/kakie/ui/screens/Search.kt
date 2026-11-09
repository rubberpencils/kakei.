package app.kakie.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
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
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.input.nestedscroll.NestedScrollConnection
import androidx.compose.ui.input.nestedscroll.NestedScrollSource
import androidx.compose.ui.input.nestedscroll.nestedScroll
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.unit.dp
import app.kakie.lib.inr
import app.kakie.lib.personName
import app.kakie.lib.pocket
import app.kakie.lib.remainingOwed
import app.kakie.ui.Avatar
import app.kakie.ui.Fonts
import app.kakie.ui.GroupR
import app.kakie.ui.Icon
import app.kakie.ui.Input
import app.kakie.ui.LocalInsets
import app.kakie.ui.LocalNav
import app.kakie.ui.LocalStore
import app.kakie.ui.PersonR
import app.kakie.ui.Txt
import app.kakie.ui.TxnRow
import app.kakie.ui.c
import app.kakie.ui.press
import app.kakie.ui.tagColors
import app.kakie.ui.ts
import kotlin.math.abs

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun SearchScreen() {
    val store = LocalStore.current
    val s = store.s
    val nav = LocalNav.current
    val insets = LocalInsets.current
    val focus = LocalFocusManager.current
    var raw by rememberSaveable { mutableStateOf("") }
    val q = raw.trim().lowercase()
    val tagOnly = if (q.startsWith("#")) q.drop(1) else null
    val num = q.replace(Regex("[₹,\\s]"), "").toDoubleOrNull() ?: 0.0
    fun groupName(id: String?) = id?.let { gid -> s.groups.find { it.id == gid }?.name } ?: ""

    val expenses = if (q.isEmpty()) emptyList() else s.expenses.filter { e ->
        if (tagOnly != null) return@filter (e.tag ?: "").startsWith(tagOnly)
        e.merchant.lowercase().contains(q) ||
            (e.tag ?: "").contains(q) ||
            groupName(e.groupId).lowercase().contains(q) ||
            (e.payerId?.let { personName(s.people, s.you, it).lowercase().contains(q) } ?: false) ||
            (e.bank ?: "").lowercase().contains(q) ||
            (num > 0 && abs(e.amount - num) < 1)
    }.sortedByDescending { it.at }
    val rem = remainingOwed(s.expenses, s.settlements)
    val spent = expenses.sumOf { pocket(it, s.you.id, rem) }
    val people = if (q.isNotEmpty() && tagOnly == null) s.people.filter { it.name.lowercase().contains(q) } else emptyList()
    val groups = if (q.isNotEmpty() && tagOnly == null) s.groups.filter { it.name.lowercase().contains(q) } else emptyList()
    val topTags = s.expenses.mapNotNull { it.tag }.groupingBy { it }.eachCount().entries.sortedByDescending { it.value }.take(8).map { it.key }
    val nothing = q.isNotEmpty() && expenses.isEmpty() && people.isEmpty() && groups.isEmpty()

    // keyboardDismissMode="on-drag"
    val dismiss = remember {
        object : NestedScrollConnection {
            override fun onPreScroll(available: Offset, source: NestedScrollSource): Offset {
                if (source == NestedScrollSource.UserInput && available.y != 0f) focus.clearFocus()
                return Offset.Zero
            }
        }
    }

    Column(Modifier.fillMaxSize().background(c.bg).padding(top = insets.top + 8.dp)) {
        Row(Modifier.padding(horizontal = 24.dp), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
            Row(
                Modifier.weight(1f).height(44.dp).background(c.sub, RoundedCornerShape(22.dp)).padding(horizontal = 14.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon("magnify", 20, c.mut)
                Input(
                    raw, { raw = it }, ts(Fonts.body, 15, c.fg), Modifier.weight(1f),
                    placeholder = "Merchant, #tag, person, group or amount",
                    caps = KeyboardCapitalization.None, autoCorrect = false, autoFocus = true, imeAction = ImeAction.Search,
                )
                if (raw.isNotEmpty()) {
                    Box(Modifier.press { raw = "" }.size(28.dp), contentAlignment = Alignment.Center) { Icon("close-circle", 18, c.mut) }
                }
            }
            Box(Modifier.press { nav.back() }.height(44.dp).padding(horizontal = 6.dp), contentAlignment = Alignment.Center) {
                Txt("Cancel", Fonts.medium, 15, c.fg)
            }
        }

        Column(Modifier.fillMaxWidth().nestedScroll(dismiss).verticalScroll(rememberScrollState()).padding(start = 24.dp, end = 24.dp, bottom = insets.bottom + 40.dp)) {
            if (q.isEmpty()) {
                if (topTags.isNotEmpty()) {
                    Heading("Your tags")
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        topTags.forEach { t ->
                            val col = tagColors(t, c.dark)
                            Box(Modifier.press { raw = "#$t" }.height(34.dp).background(col.bg, RoundedCornerShape(17.dp)).padding(horizontal = 12.dp), contentAlignment = Alignment.Center) {
                                Txt("#$t", Fonts.medium, 13, col.fg)
                            }
                        }
                    }
                }
                if (s.people.isNotEmpty()) {
                    Heading("People")
                    Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                        s.people.forEach { p ->
                            Column(Modifier.press { nav.push(PersonR(p.id)) }.width(56.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                                Avatar(p.id, p.initials, 44)
                                Txt(p.name.split(" ")[0], Fonts.medium, 12, c.fg, Modifier.padding(top = 6.dp), lines = 1)
                            }
                        }
                    }
                }
                Txt(
                    "Try a merchant like Swiggy, a tag like #food, a friend, a group, or an amount like 450.",
                    Fonts.body, 13, c.mut, Modifier.padding(top = 28.dp), lineHeight = 19,
                )
            }

            if (people.isNotEmpty() || groups.isNotEmpty()) {
                Column(Modifier.padding(top = 20.dp)) {
                    people.forEach { p ->
                        Row(Modifier.fillMaxWidth().press { nav.push(PersonR(p.id)) }.padding(vertical = 8.dp), horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
                            Avatar(p.id, p.initials, 36)
                            Txt(p.name, Fonts.medium, 15, c.fg, Modifier.weight(1f))
                            Icon("chevron-right", 18, c.mut)
                        }
                    }
                    groups.forEach { g ->
                        Row(Modifier.fillMaxWidth().press { nav.push(GroupR(g.id)) }.padding(vertical = 8.dp), horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
                            Box(Modifier.size(36.dp).background(c.sub, RoundedCornerShape(12.dp)), contentAlignment = Alignment.Center) { Icon(g.icon, 19) }
                            Txt(g.name, Fonts.medium, 15, c.fg, Modifier.weight(1f))
                            Icon("chevron-right", 18, c.mut)
                        }
                    }
                }
            }

            if (expenses.isNotEmpty()) {
                Row(Modifier.fillMaxWidth().padding(top = 24.dp, bottom = 4.dp), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.Bottom) {
                    Txt("${expenses.size} ${if (expenses.size == 1) "expense" else "expenses"}", Fonts.displaySm, 17, c.fg, Modifier.alignByBaseline())
                    if (spent > 0) Txt("₹${inr(spent)} spent by you", Fonts.medium, 13, c.mut, Modifier.alignByBaseline())
                }
                expenses.take(80).forEach { TxnRow(it) }
                if (expenses.size > 80) Txt("Showing the latest 80. Narrow the search to see older ones.", Fonts.body, 13, c.mut, Modifier.padding(top = 12.dp))
            }

            if (nothing) {
                Column(Modifier.fillMaxWidth().padding(top = 56.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                    Icon("text-search", 30, c.mut)
                    Txt("Nothing matches “${raw.trim()}”", Fonts.semi, 15, c.fg, Modifier.padding(top = 10.dp))
                    Txt("Check the spelling, or search a tag with #.", Fonts.body, 13, c.mut, Modifier.padding(top = 4.dp))
                }
            }
        }
    }
}

@Composable
private fun Heading(text: String) {
    Txt(text, Fonts.semi, 13, c.mut, Modifier.padding(top = 24.dp, bottom = 10.dp))
}
