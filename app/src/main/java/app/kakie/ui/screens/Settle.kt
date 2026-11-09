package app.kakie.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import app.kakie.KakieApp
import app.kakie.lib.PayStatus
import app.kakie.lib.groupDebts
import app.kakie.lib.inr
import app.kakie.lib.jsNum
import app.kakie.lib.jsRound
import app.kakie.lib.maskVpa
import app.kakie.lib.personName
import app.kakie.lib.upiLink
import app.kakie.ui.Ask
import app.kakie.ui.Avatar
import app.kakie.ui.Back
import app.kakie.ui.Button
import app.kakie.ui.Fonts
import app.kakie.ui.Ghost
import app.kakie.ui.Haptic
import app.kakie.ui.Icon
import app.kakie.ui.Input
import app.kakie.ui.LocalInsets
import app.kakie.ui.LocalNav
import app.kakie.ui.LocalStore
import app.kakie.ui.Settle
import app.kakie.ui.Txt
import app.kakie.ui.UpiLab
import app.kakie.ui.Word
import app.kakie.ui.ask
import app.kakie.ui.buzz
import app.kakie.ui.c
import app.kakie.ui.entering
import app.kakie.ui.fadeInDownE
import app.kakie.ui.fadeInE
import app.kakie.ui.press
import app.kakie.ui.ts
import app.kakie.ui.zoomInE
import kotlinx.coroutines.launch

private val PAY_ERRORS = mapOf(
    PayStatus.FAILED to "The payment failed in your UPI app. No money moved, so nothing was recorded.",
    PayStatus.CANCELLED to "No result came back from the UPI app, so nothing was recorded. If money did leave your account, use Mark as paid.",
    PayStatus.NO_APP to "No UPI app found on this phone. Pay another way, then mark it as paid.",
    PayStatus.UNSUPPORTED to "This version of the app cannot open UPI apps. Update it, or pay another way and mark it as paid.",
)

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun SettleScreen(route: Settle) {
    val store = LocalStore.current
    val s = store.s
    val nav = LocalNav.current
    val insets = LocalInsets.current
    val scope = rememberCoroutineScope()
    val you = s.you.id
    val group = s.groups.find { it.id == route.groupId }
    val debts = if (group != null) groupDebts(s.expenses, s.settlements, group).filter { it.fromId == you || it.toId == you } else emptyList()
    val first = debts.find { it.fromId == route.withId || it.toId == route.withId } ?: debts.firstOrNull()
    var pick by rememberSaveable { mutableStateOf(first?.let { "${it.fromId}|${it.toId}" } ?: "") }
    val chosen = debts.find { "${it.fromId}|${it.toId}" == pick } ?: first
    var amt by rememberSaveable { mutableStateOf(chosen?.let { jsRound(it.amount).toString() } ?: "") }
    var busy by rememberSaveable { mutableStateOf(false) }
    var error by rememberSaveable { mutableStateOf("") }
    var doneLine by rememberSaveable { mutableStateOf<String?>(null) }
    var doneSub by rememberSaveable { mutableStateOf("") }

    if (doneLine != null) {
        Column(
            Modifier.fillMaxSize().background(c.bg).padding(32.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            Box(Modifier.entering(zoomInE(0, 20f, 220f)).size(88.dp).background(c.pos, CircleShape), contentAlignment = Alignment.Center) {
                Icon("check", 42, c.bg)
            }
            Column(Modifier.entering(fadeInDownE(320, 140)), horizontalAlignment = Alignment.CenterHorizontally) {
                Word(doneLine!!, 28, Modifier.padding(top = 24.dp), align = TextAlign.Center)
                Txt(doneSub, Fonts.body, 14, c.mut, Modifier.padding(top = 8.dp), align = TextAlign.Center)
            }
            Box(Modifier.padding(top = 32.dp).fillMaxWidth()) { Button("Done", { nav.back() }) }
        }
        return
    }

    if (group == null || chosen == null) {
        Column(Modifier.fillMaxSize().background(c.bg).padding(start = 24.dp, end = 24.dp, bottom = 24.dp, top = insets.top + 8.dp)) {
            Back()
            Word("All square", 24)
            Txt("Nothing for you to settle in this group.", Fonts.body, 14, c.mut, Modifier.padding(top = 8.dp))
        }
        return
    }

    val youPay = chosen.fromId == you
    val other = if (youPay) chosen.toId else chosen.fromId
    val otherName = personName(s.people, s.you, other)
    val payee = s.people.find { it.id == other }
    val amount = amt.toDoubleOrNull() ?: 0.0
    val canUpi = youPay && payee?.vpa != null

    fun record(method: String) {
        if (amount == 0.0) return
        store.settle(group.id, chosen.fromId, chosen.toId, amount, method)
        buzz(Haptic.DONE)
        doneSub = "${group.name}, ${if (method == "upi") "paid by UPI" else "marked as paid"}"
        doneLine = "₹${inr(amount)} ${if (youPay) "paid to $otherName" else "received from $otherName"}"
    }

    fun payUpi() {
        val vpa = payee?.vpa
        if (amount == 0.0 || vpa == null || busy) return
        error = ""
        busy = true
        scope.launch {
            val status = KakieApp.instance.device.payWithUpi(upiLink(vpa, amount, "Settle with $otherName from ${group.name}"))
            busy = false
            when (status) {
                PayStatus.SUCCESS -> record("upi")
                PayStatus.PENDING, PayStatus.UNKNOWN -> ask(
                    Ask(
                        "Did ₹${inr(amount)} reach $otherName?",
                        if (status == PayStatus.PENDING) "Your UPI app says the payment is still processing. Record it once your bank confirms it."
                        else "Your UPI app does not report back on this phone. Record it only if the app showed the payment as successful.",
                        "Yes, record it",
                    ) { record("upi") },
                )
                else -> {
                    buzz()
                    error = PAY_ERRORS[status] ?: "Something went wrong."
                }
            }
        }
    }

    val note = when {
        youPay -> if (payee?.vpa != null) null else "$otherName has not added a UPI ID, so pay them however you like and mark it here."
        s.you.vpa != null -> "$otherName can pay you by UPI from their phone. Mark it here if they paid another way."
        else -> "Add your UPI ID in Profile so friends can pay you in one tap."
    }
    val firstName = otherName.split(" ")[0]

    Column(Modifier.fillMaxSize().background(c.bg).padding(top = insets.top + 4.dp, start = 24.dp, end = 24.dp, bottom = insets.bottom + 16.dp)) {
        Back()
        Column(Modifier.fillMaxWidth().padding(top = 8.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
                Avatar(chosen.fromId, if (chosen.fromId == you) s.you.initials else payee?.initials ?: "?", 48, you = chosen.fromId == you)
                Icon("arrow-right", 20, c.mut)
                Avatar(chosen.toId, if (chosen.toId == you) s.you.initials else payee?.initials ?: "?", 48, you = chosen.toId == you)
            }
            Word(if (youPay) "You pay $firstName" else "$firstName pays you", 26, Modifier.padding(top = 16.dp), align = TextAlign.Center)
            Txt(group.name, Fonts.body, 13, c.mut, Modifier.padding(top = 4.dp))
        }

        if (debts.size > 1) {
            FlowRow(
                Modifier.fillMaxWidth().padding(top = 20.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.CenterHorizontally),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                debts.forEach { d ->
                    val key = "${d.fromId}|${d.toId}"
                    val on = key == "${chosen.fromId}|${chosen.toId}"
                    val label = if (d.fromId == you) "To ${personName(s.people, s.you, d.toId)}" else "From ${personName(s.people, s.you, d.fromId)}"
                    Box(
                        Modifier.press {
                            buzz()
                            pick = key
                            amt = jsRound(d.amount).toString()
                            error = ""
                        }.height(34.dp).background(if (on) c.acc else c.sub, RoundedCornerShape(17.dp)).padding(horizontal = 14.dp),
                        contentAlignment = Alignment.Center,
                    ) { Txt("$label ₹${inr(d.amount)}", Fonts.medium, 13, if (on) c.accFg else c.fg) }
                }
            }
        }

        Row(Modifier.fillMaxWidth().padding(top = 28.dp), horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically) {
            Txt("₹", Fonts.display, 30, c.mut)
            Input(
                amt, {
                    amt = it.filter { ch -> ch.isDigit() || ch == '.' }
                    error = ""
                },
                ts(Fonts.display, 56, c.fg, align = TextAlign.Center), Modifier.widthIn(min = 80.dp),
                keyboard = KeyboardType.Decimal, contentAlignment = Alignment.Center,
            )
        }
        if (amount > 0 && amount < chosen.amount - 0.5) {
            Txt("Partial. ₹${inr(chosen.amount - amount)} stays open.", Fonts.body, 14, c.mut, Modifier.fillMaxWidth(), align = TextAlign.Center)
        }

        Spacer(Modifier.weight(1f))

        if (error.isNotEmpty()) {
            Row(
                Modifier.padding(bottom = 16.dp).entering(fadeInE(160)).fillMaxWidth().background(c.sub, RoundedCornerShape(16.dp)).padding(14.dp),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                Icon("alert-circle-outline", 18, c.neg)
                Txt(error, Fonts.body, 13.5, c.fg, Modifier.weight(1f), lineHeight = 19)
            }
        } else if (note != null) {
            Txt(note, Fonts.body, 13, c.mut, Modifier.fillMaxWidth().padding(bottom = 16.dp), lineHeight = 19, align = TextAlign.Center)
        }

        if (canUpi) {
            Button(if (busy) "Waiting for UPI app" else "Pay ₹${inr(amount)} with UPI", ::payUpi, icon = "arrow-top-right", disabled = !(amount > 0) || busy)
            Txt(
                "To ${maskVpa(payee!!.vpa!!)}", Fonts.body, 12, c.mut,
                Modifier.fillMaxWidth().padding(top = 8.dp).pointerInput(other, amount) {
                    detectTapGestures(onLongPress = { nav.push(UpiLab(other, jsNum(amount))) })
                },
                align = TextAlign.Center,
            )
            Ghost("I paid another way") { record("cash") }
        } else {
            Button(if (youPay) "Mark as paid" else "Mark as received", { record("cash") }, disabled = !(amount > 0))
        }
    }
}
