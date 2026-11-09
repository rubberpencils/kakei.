package app.kakie.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.unit.dp
import app.kakie.lib.Invite
import app.kakie.lib.initials
import app.kakie.ui.Back
import app.kakie.ui.Body
import app.kakie.ui.Button
import app.kakie.ui.Fonts
import app.kakie.ui.GroupR
import app.kakie.ui.Haptic
import app.kakie.ui.Icon
import app.kakie.ui.Input
import app.kakie.ui.LocalInsets
import app.kakie.ui.LocalNav
import app.kakie.ui.LocalStore
import app.kakie.ui.Txt
import app.kakie.ui.Word
import app.kakie.ui.buzz
import app.kakie.ui.c
import app.kakie.ui.drawBottomLine
import app.kakie.ui.entering
import app.kakie.ui.fadeInDownE
import app.kakie.ui.press
import app.kakie.ui.ts
import kotlinx.coroutines.launch

@Composable
fun JoinScreen(codeParam: String?) {
    val store = LocalStore.current
    val nav = LocalNav.current
    val insets = LocalInsets.current
    val scope = rememberCoroutineScope()
    var code by rememberSaveable { mutableStateOf(codeParam?.uppercase() ?: "") }
    var invite by remember { mutableStateOf<Invite?>(null) }
    var claim by rememberSaveable { mutableStateOf<String?>(null) }
    var error by rememberSaveable { mutableStateOf<String?>(null) }
    var busy by rememberSaveable { mutableStateOf(codeParam != null) }

    fun show(res: Result<Invite>) {
        busy = false
        val inv = res.getOrElse {
            error = it.message
            return
        }
        if (inv.joined) {
            nav.replace(GroupR(inv.group.id))
            return
        }
        invite = inv
        claim = null
    }

    fun look() {
        error = null
        busy = true
        scope.launch { show(store.previewInvite(code)) }
    }

    LaunchedEffect(Unit) { if (codeParam != null) show(store.previewInvite(codeParam)) }

    fun join() {
        val inv = invite ?: return
        busy = true
        scope.launch {
            val res = store.joinGroup(code, claim)
            busy = false
            val groupId = res.getOrElse {
                error = it.message
                return@launch
            }
            buzz(Haptic.DONE)
            store.flash("Joined ${inv.group.name}")
            nav.replace(GroupR(groupId))
        }
    }

    val placeholders = invite?.members?.filter { it.claimable } ?: emptyList()

    Column(Modifier.fillMaxSize().background(c.bg).padding(top = insets.top, bottom = 24.dp, start = 24.dp, end = 24.dp)) {
        Back()
        Column(Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(bottom = 24.dp)) {
            Word("Join a group", 30, Modifier.padding(top = 8.dp))
            Body("Ask anyone in the group for its 6-letter code. It is on the group screen under Invite.", Modifier.padding(top = 8.dp), c.mut, lineHeight = 21)
            Input(
                code, {
                    code = it.uppercase().filter { ch -> ch in 'A'..'Z' || ch in '0'..'9' }.take(8)
                    invite = null
                },
                ts(Fonts.mono, 34, c.fg, spacing = 6),
                Modifier.padding(top = 24.dp).fillMaxWidth().drawBottomLine(if (error != null) c.neg else c.line, 1.dp).padding(vertical = 8.dp),
                placeholder = "K7Q2MX", placeholderColor = c.bar,
                caps = KeyboardCapitalization.Characters, autoCorrect = false,
                onSubmit = ::look,
            )
            if (error != null) Txt(error!!, Fonts.body, 13, c.neg, Modifier.padding(top = 8.dp))

            val inv = invite
            if (inv != null) {
                Column(Modifier.padding(top = 28.dp).entering(fadeInDownE(320))) {
                    Row(horizontalArrangement = Arrangement.spacedBy(14.dp), verticalAlignment = Alignment.CenterVertically) {
                        Box(Modifier.size(48.dp).background(c.sub, RoundedCornerShape(16.dp)), contentAlignment = Alignment.Center) { Icon(inv.group.icon, 24) }
                        Column(Modifier.weight(1f)) {
                            Txt(inv.group.name, Fonts.displaySm, 19, c.fg)
                            Txt(inv.members.joinToString(", ") { it.name.split(" ")[0] }, Fonts.body, 13, c.mut, Modifier.padding(top = 2.dp))
                        }
                    }
                    if (placeholders.isNotEmpty()) {
                        Txt("Which one is you?", Fonts.semi, 15, c.fg, Modifier.padding(top = 26.dp))
                        Txt("Pick your name and every expense already split with that name becomes yours.", Fonts.body, 13, c.mut, Modifier.padding(top = 4.dp), lineHeight = 19)
                        Column(Modifier.padding(top = 12.dp)) {
                            placeholders.forEach { m -> Choice(m.name, claim == m.id) { claim = m.id } }
                            Choice("I'm not on this list", claim == null) { claim = null }
                        }
                    }
                }
            }
        }
        if (invite != null) {
            Button(if (busy) "Joining" else "Join ${invite!!.group.name}", ::join, disabled = busy)
        } else {
            Button(if (busy) "Looking" else "Find group", ::look, disabled = busy || code.length < 4)
        }
    }
}

@Composable
private fun Choice(label: String, on: Boolean, onPress: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().press(onPress = onPress).drawBottomLine(c.faint, 1.dp).padding(vertical = 12.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.size(34.dp).background(if (on) c.acc else c.sub, RoundedCornerShape(17.dp)), contentAlignment = Alignment.Center) {
            Txt(initials(label), Fonts.bold, 11, if (on) c.accFg else c.fg)
        }
        Txt(label, Fonts.medium, 15, c.fg, Modifier.weight(1f))
        Icon(if (on) "radiobox-marked" else "radiobox-blank", 22, if (on) c.fg else c.mut)
    }
}
