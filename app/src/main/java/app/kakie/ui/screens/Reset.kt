package app.kakie.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import app.kakie.ui.Back
import app.kakie.ui.Body
import app.kakie.ui.Button
import app.kakie.ui.Field
import app.kakie.ui.Ghost
import app.kakie.ui.LocalInsets
import app.kakie.ui.LocalNav
import app.kakie.ui.LocalStore
import app.kakie.ui.Word
import app.kakie.ui.c
import kotlinx.coroutines.launch

@Composable
fun ResetScreen() {
    val store = LocalStore.current
    val nav = LocalNav.current
    val insets = LocalInsets.current
    val scope = rememberCoroutineScope()
    var phone by remember { mutableStateOf("") }
    var code by remember { mutableStateOf("") }
    var pass by remember { mutableStateOf("") }
    var sent by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var done by remember { mutableStateOf(false) }
    Column(
        Modifier.fillMaxSize().background(c.bg).verticalScroll(rememberScrollState())
            .padding(top = insets.top + 4.dp, start = 24.dp, end = 24.dp, bottom = insets.bottom + 24.dp),
    ) {
        Back()
        Word("Reset password", 32, Modifier.padding(top = 16.dp), lineHeight = 36)
        Body(
            if (done) "Password updated. Log in with the new one."
            else "We text a code to the phone on the account. A self-hosted server prints that code in its log.",
            Modifier.padding(top = 10.dp), c.mut, lineHeight = 22,
        )
        if (!done) {
            Column(Modifier.padding(top = 28.dp)) {
                Field("Phone", phone, { phone = it }, "98765 43210", keyboard = KeyboardType.Phone)
                Field("Code", code, { code = it }, "6 digits", keyboard = KeyboardType.Number)
                Field("New password", pass, { pass = it }, "At least 6 characters", secure = true, error = error)
                Ghost(if (sent) "Send the code again" else "Send a code") {
                    scope.launch {
                        error = null
                        busy = true
                        val err = store.requestCode(phone, "reset")
                        busy = false
                        if (err != null) error = err else sent = true
                    }
                }
            }
        }
        Button(if (busy) "One sec" else if (done) "Back to log in" else "Update password", {
            if (done) nav.back()
            else scope.launch {
                error = null
                busy = true
                val err = store.resetPassword(phone, code, pass)
                busy = false
                if (err != null) error = err else done = true
            }
        }, disabled = busy)
    }
}
