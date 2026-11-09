package app.kakie.ui.screens

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.MutableTransitionState
import androidx.compose.foundation.background
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
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import app.kakie.ui.Back
import app.kakie.ui.Button
import app.kakie.ui.Fonts
import app.kakie.ui.GroupR
import app.kakie.ui.Haptic
import app.kakie.ui.Icon
import app.kakie.ui.Input
import app.kakie.ui.Label
import app.kakie.ui.LocalInsets
import app.kakie.ui.LocalNav
import app.kakie.ui.LocalStore
import app.kakie.ui.Txt
import app.kakie.ui.Word
import app.kakie.ui.buzz
import app.kakie.ui.c
import app.kakie.ui.drawBottomLine
import app.kakie.ui.fadeInT
import app.kakie.ui.fadeOutT
import app.kakie.ui.press
import app.kakie.ui.ts

private val ICONS = listOf("account-group", "airplane", "home-variant", "silverware-fork-knife", "beach", "party-popper")

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun NewGroupScreen() {
    val store = LocalStore.current
    val nav = LocalNav.current
    val insets = LocalInsets.current
    var name by rememberSaveable { mutableStateOf("") }
    var icon by rememberSaveable { mutableStateOf(ICONS[0]) }
    var who by rememberSaveable { mutableStateOf("") }
    var members by rememberSaveable { mutableStateOf(listOf<String>()) }
    // Removed names stay on screen while they fade out.
    var leaving by remember { mutableStateOf(listOf<String>()) }

    fun add() {
        val n = who.trim()
        if (n.isNotEmpty() && n !in members) members = members + n
        who = ""
    }

    fun create() {
        if (name.isBlank()) return
        buzz(Haptic.DONE)
        val extra = who.trim()
        val id = store.createGroup(name.trim(), if (extra.isNotEmpty() && extra !in members) members + extra else members, icon)
        nav.replace(GroupR(id))
    }

    Column(
        Modifier.fillMaxSize().background(c.bg).verticalScroll(rememberScrollState())
            .padding(top = insets.top + 4.dp, start = 24.dp, end = 24.dp, bottom = insets.bottom + 32.dp),
    ) {
        Back()
        Word("New group", 28)
        Input(
            name, { name = it }, ts(Fonts.semi, 20, c.fg),
            Modifier.padding(top = 24.dp).fillMaxWidth().drawBottomLine(c.faint, 1.dp).padding(vertical = 8.dp),
            placeholder = "Goa trip, Flat 4B...", autoFocus = true,
        )
        Row(Modifier.padding(top = 18.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            ICONS.forEach { i ->
                Box(Modifier.press { icon = i }.size(44.dp).background(if (icon == i) c.acc else c.sub, RoundedCornerShape(22.dp)), contentAlignment = Alignment.Center) {
                    Icon(i, 20, if (icon == i) c.accFg else c.fg)
                }
            }
        }
        Label("People", Modifier.padding(top = 28.dp))
        Txt("Add names now. They claim their spot later with the invite code.", Fonts.body, 13, c.mut, Modifier.padding(top = 4.dp))
        Row(Modifier.padding(top = 10.dp), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
            Input(
                who, { who = it }, ts(Fonts.body, 16, c.fg),
                Modifier.weight(1f).drawBottomLine(c.faint, 1.dp).padding(vertical = 8.dp),
                placeholder = "Add a person", onSubmit = ::add, blurOnSubmit = false,
            )
            Box(Modifier.press(onPress = ::add).size(44.dp).background(c.acc, RoundedCornerShape(22.dp)), contentAlignment = Alignment.Center) {
                Icon("plus", 22, c.accFg)
            }
        }
        FlowRow(Modifier.padding(top = 16.dp), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            (members + leaving.filter { it !in members }).forEach { m ->
                key(m) {
                    val visible = remember { MutableTransitionState(false) }
                    visible.targetState = m in members
                    if (!visible.targetState && visible.isIdle && !visible.currentState) leaving = leaving - m
                    AnimatedVisibility(visible, enter = fadeInT(180), exit = fadeOutT(140)) {
                        Row(
                            Modifier.press {
                                leaving = leaving + m
                                members = members - m
                            }.height(32.dp).background(c.sub, RoundedCornerShape(16.dp)).padding(start = 12.dp, end = 8.dp),
                            horizontalArrangement = Arrangement.spacedBy(4.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Txt(m, Fonts.medium, 14, c.fg)
                            Icon("close", 14, c.mut)
                        }
                    }
                }
            }
        }
        Box(Modifier.padding(top = 28.dp)) { Button("Create group", ::create, disabled = name.isBlank()) }
    }
}
