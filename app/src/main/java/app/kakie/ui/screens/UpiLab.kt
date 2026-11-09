package app.kakie.ui.screens

import androidx.compose.foundation.background
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
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import app.kakie.KakieApp
import app.kakie.lib.encodeUriComponent
import app.kakie.lib.maskVpa
import app.kakie.ui.Back
import app.kakie.ui.Fonts
import app.kakie.ui.LocalInsets
import app.kakie.ui.LocalStore
import app.kakie.ui.Txt
import app.kakie.ui.UpiLab
import app.kakie.ui.Word
import app.kakie.ui.c
import app.kakie.ui.press
import java.util.Locale
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch

private const val GPAY = "com.google.android.apps.nbu.paisa.user"

// Debug screen: tries link variants against real UPI apps and shows their raw replies.
@Composable
fun UpiLabScreen(route: UpiLab) {
    val store = LocalStore.current
    val insets = LocalInsets.current
    val scope = rememberCoroutineScope()
    val payee = store.s.people.find { it.id == route.to }
    var out by rememberSaveable { mutableStateOf(mapOf<String, String>()) }
    val vpa = payee?.vpa
    if (payee == null || vpa == null) {
        Box(Modifier.fillMaxSize().background(c.bg))
        return
    }

    val amount = String.format(Locale.US, "%.2f", route.am.toDoubleOrNull() ?: 1.0)
    val pn = encodeUriComponent(payee.name)
    val tn = encodeUriComponent("Kakie test")
    val base = "upi://pay?pa=$vpa"
    val variants = listOf(
        Triple("now", "Current link", "$base&am=$amount&cu=INR&tn=$tn"),
        Triple("pn", "With name", "$base&pn=$pn&am=$amount&cu=INR"),
        Triple("noam", "Name, no amount", "$base&pn=$pn&cu=INR"),
        Triple("bare", "UPI ID only", base),
    )

    fun run(key: String, uri: String, pkg: String?) {
        out = out + (key to "waiting")
        scope.launch {
            val reply = try {
                KakieApp.instance.device.payUpi(uri, pkg).ifEmpty { "(no reply: backed out, or the app sent nothing)" }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                "error: Error: ${e.message}"
            }
            out = out + (key to reply)
        }
    }

    Column(
        Modifier.fillMaxSize().background(c.bg).verticalScroll(rememberScrollState())
            .padding(top = insets.top + 4.dp, start = 24.dp, end = 24.dp, bottom = insets.bottom + 32.dp),
    ) {
        Back()
        Word("UPI link test", 24)
        Txt(
            "To ${maskVpa(vpa)}. Each try is a real payment of ₹$amount. Nothing is recorded here, so mark a successful one as paid on the settle screen.",
            Fonts.body, 13, c.mut, Modifier.padding(top = 6.dp), lineHeight = 19,
        )
        variants.forEach { (id, label, uri) ->
            Column(Modifier.padding(top = 20.dp).fillMaxWidth().background(c.sub, RoundedCornerShape(18.dp)).padding(16.dp)) {
                Txt(label, Fonts.semi, 15, c.fg)
                Txt(uri.replace(vpa, maskVpa(vpa)), Fonts.mono, 11, c.mut, Modifier.padding(top = 4.dp))
                Row(Modifier.padding(top = 12.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    listOf("chooser" to null, "Google Pay" to GPAY).forEach { (name, pkg) ->
                        val key = "$id|$name"
                        Column(Modifier.weight(1f)) {
                            Box(
                                Modifier.fillMaxWidth().press { run(key, uri, pkg) }.height(38.dp).background(c.acc, RoundedCornerShape(19.dp)),
                                contentAlignment = Alignment.Center,
                            ) { Txt(name, Fonts.medium, 13, c.accFg) }
                            out[key]?.let { SelectionContainer { Txt(it, Fonts.mono, 10.5, c.fg, Modifier.padding(top = 6.dp)) } }
                        }
                    }
                }
            }
        }
    }
}
