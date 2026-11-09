package app.kakie.ui.screens

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import app.kakie.lib.SmsError
import app.kakie.lib.serverName
import app.kakie.lib.SyncState
import app.kakie.lib.accountsFrom
import app.kakie.lib.enIn
import app.kakie.lib.jsNum
import app.kakie.lib.maskVpa
import app.kakie.ui.Ask
import app.kakie.ui.AskR
import app.kakie.ui.CardBill
import app.kakie.ui.DeveloperR
import app.kakie.ui.ProR
import app.kakie.ui.Avatar
import app.kakie.ui.Fonts
import app.kakie.ui.Icon
import app.kakie.ui.Input
import app.kakie.ui.LocalInsets
import app.kakie.ui.LocalNav
import app.kakie.ui.LocalStore
import app.kakie.ui.PersonR
import app.kakie.ui.Review
import app.kakie.ui.Txt
import app.kakie.ui.Word
import app.kakie.ui.ask
import app.kakie.ui.c
import app.kakie.ui.drawBottomLine
import app.kakie.ui.press
import app.kakie.ui.ts
import app.kakie.KakieApp
import java.time.Instant
import java.time.LocalDateTime
import java.time.ZoneId
import kotlinx.coroutines.launch

@Composable
fun ProfileScreen() {
    val store = LocalStore.current
    val s = store.s
    val nav = LocalNav.current
    val insets = LocalInsets.current
    val scope = rememberCoroutineScope()
    var name by rememberSaveable { mutableStateOf(s.you.name) }
    var budget by rememberSaveable { mutableStateOf(if (s.budget != 0.0) jsNum(s.budget) else "") }
    val accounts = accountsFrom(s.expenses)
    var editVpa by rememberSaveable { mutableStateOf(false) }
    var vpaDraft by rememberSaveable { mutableStateOf("") }
    var vpaError by rememberSaveable { mutableStateOf<String?>(null) }
    var tagName by rememberSaveable { mutableStateOf("") }
    var tagAmt by rememberSaveable { mutableStateOf("") }
    var deletePass by rememberSaveable { mutableStateOf("") }

    fun saveVpa() {
        val err = store.setVpa(vpaDraft)
        if (err != null) vpaError = err else editVpa = false
    }

    fun scan() = scope.launch {
        val result = KakieApp.instance.device.readSms()
        when (result.error) {
            SmsError.DENIED -> return@launch store.flash("SMS permission was not granted")
            SmsError.FAILED -> return@launch store.flash("Inbox reading needs the installed app. Paste messages in Review.")
            null -> Unit
        }
        val n = store.ingest(result.rows)
        store.setSmsOn(true)
        store.flash(if (n != 0) "$n new bank messages" else "No new bank messages")
        if (n != 0) nav.push(Review)
    }

    fun signOut() {
        val msg = if (store.pending != 0) "${store.pending} changes have not reached the server and will be lost." else "You can log back in with your phone number."
        ask(Ask("Sign out?", msg, "Sign out", destructive = true) { store.signOut() })
    }

    val syncLine = when {
        store.sync == SyncState.SYNCING -> "Syncing"
        store.sync == SyncState.OFFLINE -> "Offline${if (store.pending != 0) ", ${store.pending} changes waiting" else ""}"
        s.syncedAt != null -> "Synced ${enIn("hmm", LocalDateTime.ofInstant(Instant.ofEpochMilli(s.syncedAt), ZoneId.systemDefault()))}"
        else -> "Not synced yet"
    }

    Column(
        Modifier.fillMaxSize().background(c.bg).verticalScroll(rememberScrollState())
            .padding(top = insets.top + 16.dp, start = 24.dp, end = 24.dp, bottom = 120.dp),
    ) {
        Word("Profile", 28)
        Row(Modifier.padding(top = 20.dp), horizontalArrangement = Arrangement.spacedBy(16.dp), verticalAlignment = Alignment.CenterVertically) {
            Avatar(s.you.id, s.you.initials, 64, you = true)
            Column(Modifier.weight(1f)) {
                Input(name, { name = it }, ts(Fonts.semi, 19, c.fg), Modifier.fillMaxWidth(), onSubmit = { store.setName(name) }, onBlur = { store.setName(name) })
                Txt(s.phone, Fonts.mono, 12.5, c.mut, Modifier.padding(top = 4.dp))
            }
        }
        Box(Modifier.padding(top = 12.dp).press { nav.push(PersonR(s.you.id)) }) {
            ProfileRow("format-list-bulleted", "Your activity", "Every expense and payment you are part of") { Icon("chevron-right", 20, c.mut) }
        }

        Label("Get paid")
        val vpa = s.you.vpa
        if (editVpa) {
            Column(Modifier.padding(vertical = 8.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Input(
                    vpaDraft, {
                        vpaDraft = it
                        vpaError = null
                    },
                    ts(Fonts.body, 16, c.fg),
                    Modifier.fillMaxWidth().height(52.dp).border(1.dp, if (vpaError != null) c.neg else c.line, RoundedCornerShape(16.dp)).padding(horizontal = 16.dp),
                    placeholder = "name@bank",
                    keyboard = KeyboardType.Email,
                    caps = KeyboardCapitalization.None,
                    autoCorrect = false,
                    autoFocus = true,
                    onSubmit = ::saveVpa,
                )
                if (vpaError != null) Txt(vpaError!!, Fonts.body, 12, c.neg)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Box(Modifier.press(onPress = ::saveVpa).height(40.dp).background(c.acc, RoundedCornerShape(20.dp)).padding(horizontal = 18.dp), contentAlignment = Alignment.Center) {
                        Txt("Save", Fonts.semi, 13.5, c.accFg)
                    }
                    Box(
                        Modifier.press {
                            editVpa = false
                            vpaError = null
                        }.height(40.dp).padding(horizontal = 16.dp),
                        contentAlignment = Alignment.Center,
                    ) { Txt("Cancel", Fonts.medium, 13.5, c.mut) }
                }
            }
        } else if (vpa != null) {
            ProfileRow("qrcode", maskVpa(vpa), "Friends can pay you by UPI") {
                Box(
                    Modifier.press {
                        vpaDraft = vpa
                        editVpa = true
                    }.height(34.dp).padding(horizontal = 10.dp),
                    contentAlignment = Alignment.Center,
                ) { Txt("Change", Fonts.medium, 12.5, c.fg) }
                Box(
                    Modifier.press {
                        ask(Ask("Remove your UPI ID?", "Friends will only be able to mark payments to you by hand.", "Remove", destructive = true) { store.setVpa("") })
                    }.height(34.dp).padding(horizontal = 10.dp),
                    contentAlignment = Alignment.Center,
                ) { Txt("Remove", Fonts.medium, 12.5, c.mut) }
            }
        } else {
            Box(
                Modifier.press {
                    vpaDraft = ""
                    editVpa = true
                },
            ) { ProfileRow("qrcode", "Add your UPI ID", "Without it, friends settle with you by hand") { Icon("chevron-right", 20, c.mut) } }
        }
        Txt(
            "Stored encrypted on the server and shown only to people in your groups, when they settle up with you.",
            Fonts.body, 12.5, c.mut, Modifier.padding(top = 10.dp), lineHeight = 18,
        )

        Label("SMS import")
        ProfileRow("message-text-outline", "Read bank SMS", if (s.smsOn) "Checks the inbox each time you open kakie." else "Off") {
            NativeSwitch(s.smsOn) { on ->
                store.setSmsOn(on)
                if (on) scan()
            }
        }
        Box(Modifier.press { scan() }) { ProfileRow("refresh", "Scan inbox now") }
        accounts.forEach { a ->
            ProfileRow(if (a.credit) "credit-card-outline" else "bank-outline", "${a.bank} ••${a.account}", if (a.credit) "Card" else "Account") {
                Txt(a.count.toString(), Fonts.mono, 13, c.mut)
            }
        }

        Label("Budget")
        Row(Modifier.padding(vertical = 8.dp), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
            Txt("₹", Fonts.display, 22, c.mut)
            Input(
                budget, { budget = it.filter(Char::isDigit) }, ts(Fonts.displaySm, 28, c.fg), Modifier.weight(1f),
                placeholder = "60000",
                keyboard = KeyboardType.Number,
                onSubmit = { store.setBudget(budget.toDoubleOrNull() ?: 0.0) },
                onBlur = { store.setBudget(budget.toDoubleOrNull() ?: 0.0) },
            )
        }
        Txt("One number for the month. Spend under it is savings.", Fonts.body, 13, c.mut)
        s.tagBudgets.forEach { (tag, amount) ->
            ProfileRow("tag-outline", "#$tag", "₹${amount.toInt()} this month") {
                Box(Modifier.press { store.setTagBudget(tag, 0.0) }) { Txt("Clear", Fonts.medium, 12.5, c.mut) }
            }
        }
        Row(Modifier.padding(top = 8.dp), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
            Input(tagName, { tagName = it }, ts(Fonts.body, 15, c.fg), Modifier.weight(1f), placeholder = "tag")
            Input(tagAmt, { tagAmt = it.filter(Char::isDigit) }, ts(Fonts.displaySm, 18, c.fg), Modifier.width(90.dp), placeholder = "limit", keyboard = KeyboardType.Number)
            Box(Modifier.press {
                val tag = store.addTag(tagName)
                val n = tagAmt.toDoubleOrNull() ?: 0.0
                if (tag != null && n > 0) {
                    store.setTagBudget(tag, n)
                    tagName = ""
                    tagAmt = ""
                }
            }.height(36.dp).padding(horizontal = 10.dp), contentAlignment = Alignment.Center) { Txt("Add", Fonts.medium, 13, c.fg) }
        }

        Label("On this phone")
        Box(Modifier.press { nav.push(CardBill) }) { ProfileRow("credit-card-outline", "Credit card bill", "What each card still owes") }
        ProfileRow("fingerprint", "Lock with biometrics", if (s.lock) "On. kakie. asks before it opens" else "Off") {
            NativeSwitch(s.lock, store::setLock)
        }

        Label("Server")
        ProfileRow("server-network", serverName(s.base), syncLine) {
            Box(
                Modifier.press { store.syncNow() }.height(34.dp).border(1.dp, c.line, RoundedCornerShape(17.dp)).padding(horizontal = 12.dp),
                contentAlignment = Alignment.Center,
            ) { Txt("Sync now", Fonts.medium, 12.5, c.fg) }
        }
        Txt(
            "Only groups, their expenses and settlements leave this phone. Your own spends, budget and tags stay here.",
            Fonts.body, 12.5, c.mut, Modifier.padding(top = 10.dp), lineHeight = 18,
        )

        if (store.signedIn && s.pro) {
            Box(Modifier.press { nav.push(AskR) }) { ProfileRow("comment-question-outline", "Ask", if (s.digest) "Sunday digest is on" else "A question about this phone's spending") }
            ProfileRow("calendar-week", "Sunday digest", "One Pro answer each Sunday") {
                NativeSwitch(s.digest, store::setDigest)
            }
        }
        if (store.signedIn && !s.pro) {
            Box(Modifier.press { nav.push(ProR) }) { ProfileRow("star-outline", "Kakei Pro", "Backup, Ask, and a remote MCP") }
        }
        Box(Modifier.press { nav.push(DeveloperR) }) { ProfileRow("server-outline", "MCP server", if (s.dev.mcp) "On. Your data is served from this phone" else "Serve your data from this phone") }

        Label("Sample data")
        if (store.hasSample) {
            Box(Modifier.press { store.clearSample() }) { ProfileRow("broom", "Clear sample data", "Removes sample groups, expenses and SMS") }
        } else {
            Box(Modifier.press { store.loadSample() }) { ProfileRow("flask-outline", "Load sample data", "Three groups and a month of spends to explore") }
        }

        if (store.signedIn) {
            Box(Modifier.press {
                scope.launch {
                    runCatching { store.downloadAccount() }
                    store.flash("Account data downloaded")
                }
            }) { ProfileRow("download-outline", "Download my data", "Groups and shared expenses stored for this account") }
            Input(deletePass, { deletePass = it }, ts(Fonts.body, 15, c.fg), Modifier.fillMaxWidth().padding(top = 8.dp), placeholder = "Password to delete the account", secure = true)
            Box(Modifier.press {
                val password = deletePass
                ask(Ask("Delete this account?", "Shared groups move to someone else in them. Expenses on this phone stay here.", "Delete account", destructive = true) {
                    scope.launch { store.deleteAccount(password)?.let(store::flash) }
                })
            }) { Txt("Delete account", Fonts.medium, 15, c.neg) }
        }
        Box(Modifier.padding(top = 28.dp).press(onPress = ::signOut)) { Txt(if (store.signedIn) "Sign out" else "Erase everything on this phone", Fonts.medium, 15, c.neg) }
        Row(Modifier.padding(top = 24.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Icon("lock-outline", 18, c.mut)
            Txt(
                "Messages are parsed on this phone. Only the amount, merchant, date, rail and last four digits of the account reach the server. The message text never leaves the phone.",
                Fonts.body, 12.5, c.mut, Modifier.weight(1f), lineHeight = 18,
            )
        }
    }
}

@Composable
private fun ProfileRow(icon: String, title: String, sub: String? = null, trailing: @Composable () -> Unit = {}) {
    Row(
        Modifier.fillMaxWidth().drawBottomLine(c.faint, 1.dp).padding(vertical = 13.dp),
        horizontalArrangement = Arrangement.spacedBy(14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(icon, 22)
        Column(Modifier.weight(1f)) {
            Txt(title, Fonts.medium, 15, c.fg, lines = 1)
            if (sub != null) Txt(sub, Fonts.body, 12, c.mut, Modifier.padding(top = 2.dp))
        }
        trailing()
    }
}

@Composable
private fun Label(text: String) {
    Txt(text.uppercase(), Fonts.medium, 12, c.mut, Modifier.padding(top = 32.dp, bottom = 6.dp), spacing = 1)
}

/** Android's native switch as React Native draws it: tinted track, theme thumb. */
@Composable
private fun NativeSwitch(on: Boolean, onChange: (Boolean) -> Unit) {
    val x by animateFloatAsState(if (on) 1f else 0f, tween(150), label = "switch")
    val thumb = if (on) (if (c.dark) Color(0xff80cbc4) else Color(0xff009688)) else if (c.dark) Color(0xffbdbdbd) else Color(0xfff1f1f1)
    Box(Modifier.press { onChange(!on) }.size(52.dp, 32.dp), contentAlignment = Alignment.CenterStart) {
        Box(Modifier.padding(horizontal = 8.dp).fillMaxWidth().height(14.dp).background(if (on) c.acc else c.bar, RoundedCornerShape(7.dp)))
        Box(Modifier.offset(x = (6 + 20 * x).dp).size(20.dp).shadow(2.dp, CircleShape).background(thumb, CircleShape))
    }
}
