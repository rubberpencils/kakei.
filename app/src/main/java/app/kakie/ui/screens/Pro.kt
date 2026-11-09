package app.kakie.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import app.kakie.KakieApp
import app.kakie.lib.Billing
import app.kakie.lib.Plan
import app.kakie.ui.Back
import app.kakie.ui.Body
import app.kakie.ui.Button
import app.kakie.ui.Fonts
import app.kakie.ui.Ghost
import app.kakie.ui.LocalInsets
import app.kakie.ui.LocalNav
import app.kakie.ui.LocalStore
import app.kakie.ui.Txt
import app.kakie.ui.Word
import app.kakie.ui.c
import kotlinx.coroutines.launch

@Composable
fun ProScreen() {
    val store = LocalStore.current
    val nav = LocalNav.current
    val insets = LocalInsets.current
    val scope = rememberCoroutineScope()
    val context = LocalContext.current
    val billing = remember {
        Billing(context) { KakieApp.instance.device.activity() }.also { bill ->
            bill.onPurchase = { token, id ->
                scope.launch {
                    val err = store.confirmPlay(token, id)
                    if (err != null) store.flash(err) else nav.back()
                }
            }
        }
    }
    var plans by remember { mutableStateOf(listOf<Plan>()) }
    var error by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) {
        runCatching { plans = billing.plans() }.onFailure { error = it.message ?: "Play Billing is unavailable" }
    }
    Column(
        Modifier.fillMaxSize().background(c.bg).verticalScroll(rememberScrollState())
            .padding(top = insets.top + 4.dp, start = 24.dp, end = 24.dp, bottom = insets.bottom + 24.dp),
    ) {
        Back()
        Word("Kakei Pro", 32, Modifier.padding(top = 16.dp))
        Body("Backup, Ask, and a remote MCP. The price comes from Play.", Modifier.padding(top = 10.dp), c.mut, lineHeight = 22)
        Column(Modifier.padding(top = 28.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            plans.forEach { plan ->
                Column(Modifier.fillMaxWidth().border(1.dp, c.line, RoundedCornerShape(16.dp)).padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Txt(plan.title, Fonts.semi, 16, c.fg)
                    Txt(plan.price, Fonts.mono, 15, c.fg)
                    if (plan.trial != null) Txt(plan.trial, Fonts.body, 13, c.mut)
                    Button(if (busy) "One sec" else "Buy", { busy = true; billing.buy(plan); busy = false }, disabled = busy)
                }
            }
        }
        if (error != null) Txt(error!!, Fonts.body, 14, c.neg, Modifier.padding(top = 16.dp))
        Ghost("Restore a purchase") {
            scope.launch {
                busy = true
                error = null
                val owned = runCatching { billing.owned() }.getOrNull()
                if (owned == null) error = "Play has no Kakei subscription for this account"
                else {
                    val err = store.confirmPlay(owned.first, owned.second)
                    if (err != null) error = err else nav.back()
                }
                busy = false
            }
        }
    }
}
