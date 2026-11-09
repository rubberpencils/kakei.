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
import androidx.compose.foundation.layout.size
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import app.kakie.lib.Person
import app.kakie.ui.Ask
import app.kakie.ui.Avatar
import app.kakie.ui.Back
import app.kakie.ui.Fonts
import app.kakie.ui.Icon
import app.kakie.ui.Input
import app.kakie.ui.Label
import app.kakie.ui.LocalInsets
import app.kakie.ui.LocalNav
import app.kakie.ui.LocalStore
import app.kakie.ui.PersonR
import app.kakie.ui.Tab
import app.kakie.ui.Toggle
import app.kakie.ui.Txt
import app.kakie.ui.Word
import app.kakie.ui.ask
import app.kakie.ui.buzz
import app.kakie.ui.c
import app.kakie.ui.drawBottomLine
import app.kakie.ui.press
import app.kakie.ui.shareText
import app.kakie.ui.ts

private val ICONS = listOf("account-group", "airplane", "home-variant", "silverware-fork-knife", "beach", "party-popper", "car", "briefcase-outline")

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun GroupSettingsScreen(id: String) {
    val store = LocalStore.current
    val s = store.s
    val nav = LocalNav.current
    val insets = LocalInsets.current
    val context = LocalContext.current
    val group = s.groups.find { it.id == id }
    var name by rememberSaveable { mutableStateOf(group?.name ?: "") }
    var who by rememberSaveable { mutableStateOf("") }

    if (group == null) {
        Column(Modifier.fillMaxSize().background(c.bg).padding(start = 24.dp, end = 24.dp, bottom = 24.dp, top = insets.top + 8.dp)) {
            Back()
            Word("That group is gone", 24)
        }
        return
    }

    val members = listOf(s.you) + group.memberIds.map { pid -> s.people.find { it.id == pid } ?: Person(pid, "Someone", "?") }
    fun saveName() {
        if (name.isNotBlank() && name.trim() != group.name) store.updateGroup(group.id, name = name) else name = group.name
    }
    fun add() {
        if (who.isBlank()) return
        store.addMember(group.id, who)
        buzz()
        who = ""
    }
    fun share() {
        val code = group.code ?: return store.flash("The code appears once the group reaches the server")
        shareText(context, "Join \"${group.name}\" on kakie. with code $code\nkakie://join?code=$code")
    }
    fun remove() = ask(Ask("Delete ${group.name}?", "Every expense and payment in it is removed for all members.", "Delete group", destructive = true) {
        store.deleteGroup(group.id)
        nav.tab(Tab.GROUPS)
    })

    Column(
        Modifier.fillMaxSize().background(c.bg).verticalScroll(rememberScrollState())
            .padding(top = insets.top + 4.dp, start = 24.dp, end = 24.dp, bottom = insets.bottom + 40.dp),
    ) {
        Back()
        Word("Group settings", 28)

        Label("Name", Modifier.padding(top = 30.dp, bottom = 8.dp))
        Input(
            name, { name = it }, ts(Fonts.semi, 20, c.fg),
            Modifier.fillMaxWidth().drawBottomLine(c.faint, 1.dp).padding(vertical = 8.dp),
            onSubmit = ::saveName, onBlur = ::saveName,
        )
        FlowRow(Modifier.padding(top = 16.dp), horizontalArrangement = Arrangement.spacedBy(10.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            ICONS.forEach { i ->
                val on = group.icon == i
                Box(
                    Modifier.press { store.updateGroup(group.id, icon = i) }.size(44.dp).background(if (on) c.acc else c.sub, RoundedCornerShape(15.dp)),
                    contentAlignment = Alignment.Center,
                ) { Icon(i, 20, if (on) c.accFg else c.fg) }
            }
        }

        Row(Modifier.padding(top = 30.dp), horizontalArrangement = Arrangement.spacedBy(14.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(40.dp).background(c.sub, RoundedCornerShape(12.dp)), contentAlignment = Alignment.Center) { Icon("auto-fix", 20) }
            Column(Modifier.weight(1f)) {
                Txt("Simplify debts", Fonts.semi, 15, c.fg)
                Txt(
                    "Reroutes money so the group settles in the fewest payments. Nobody ends up paying more.",
                    Fonts.body, 12.5, c.mut, Modifier.padding(top = 2.dp), lineHeight = 17,
                )
            }
            Toggle(group.simplify != false) { store.updateGroup(group.id, simplify = group.simplify == false) }
        }

        Label("People", Modifier.padding(top = 30.dp, bottom = 8.dp))
        members.forEach { p ->
            Row(
                Modifier.fillMaxWidth().press { nav.push(PersonR(p.id)) }.padding(vertical = 9.dp),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Avatar(p.id, p.initials, you = p.id == s.you.id)
                Column(Modifier.weight(1f)) {
                    Txt(if (p.id == s.you.id) "${p.name} (you)" else p.name, Fonts.medium, 15, c.fg)
                    Txt(
                        if (p.id == s.you.id || p.claimed == true) "On kakie." else "Not joined yet. They pick this name when joining.",
                        Fonts.body, 12, c.mut, Modifier.padding(top = 1.dp),
                    )
                }
            }
        }
        Row(Modifier.padding(top = 8.dp), horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
            Input(
                who, { who = it }, ts(Fonts.body, 15, c.fg),
                Modifier.weight(1f).drawBottomLine(c.faint, 1.dp).padding(vertical = 8.dp),
                placeholder = "Add someone by name",
                onSubmit = ::add, blurOnSubmit = false,
            )
            Box(Modifier.press(who.isNotBlank(), ::add).size(40.dp).background(c.acc, RoundedCornerShape(20.dp)), contentAlignment = Alignment.Center) {
                Icon("plus", 20, c.accFg)
            }
        }

        Label("Invite code", Modifier.padding(top = 30.dp, bottom = 8.dp))
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
            Txt(group.code ?: "------", Fonts.mono, 28, c.fg, spacing = 5)
            Row(
                Modifier.press(onPress = ::share).height(40.dp).background(c.acc, RoundedCornerShape(20.dp)).padding(horizontal = 16.dp),
                horizontalArrangement = Arrangement.spacedBy(6.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon("share-variant", 16, c.accFg)
                Txt("Share", Fonts.semi, 14, c.accFg)
            }
        }
        Txt(
            "Friends open Groups, tap Join with code, then pick their name so past splits become theirs.",
            Fonts.body, 12.5, c.mut, Modifier.padding(top = 8.dp), lineHeight = 18,
        )

        if (group.owner == true) {
            Box(
                Modifier.padding(top = 36.dp).fillMaxWidth().press(onPress = ::remove).height(50.dp).border(1.dp, c.neg, RoundedCornerShape(25.dp)),
                contentAlignment = Alignment.Center,
            ) { Txt("Delete group", Fonts.semi, 14, c.neg) }
        }
    }
}
