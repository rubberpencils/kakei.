package app.kakie.ui.screens

import android.Manifest
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import app.kakie.sms.McpHost
import app.kakie.ui.Back
import app.kakie.ui.Body
import app.kakie.ui.Button
import app.kakie.ui.Fonts
import app.kakie.ui.LocalInsets
import app.kakie.ui.LocalStore
import app.kakie.ui.Toggle
import app.kakie.ui.Txt
import app.kakie.ui.Word
import app.kakie.ui.c
import java.security.SecureRandom

@Composable
fun DeveloperScreen() {
    val store = LocalStore.current
    val insets = LocalInsets.current
    val context = LocalContext.current
    val dev = store.s.dev
    var served by remember { mutableIntStateOf(0) }
    val notify = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { }
    val listening = McpHost.listening()
    val host = if (dev.lan) McpHost.addresses().firstOrNull { it.kind != "cellular" }?.ip ?: "<phone-ip>" else "127.0.0.1"
    Column(
        Modifier.fillMaxSize().background(c.bg).verticalScroll(rememberScrollState())
            .padding(top = insets.top + 4.dp, start = 24.dp, end = 24.dp, bottom = insets.bottom + 24.dp),
    ) {
        Back()
        Word("Developer", 28)
        Txt("MCP SERVER", Fonts.medium, 12, c.mut, Modifier.padding(top = 28.dp, bottom = 8.dp), spacing = 1)
        Txt("Serve my data over MCP", Fonts.semi, 15, c.fg)
        Txt(
            if (!dev.mcp) "Off" else if (listening) "Listening on port ${dev.port}. $served requests answered" else "Starting",
            Fonts.body, 12.5, c.mut, Modifier.padding(top = 2.dp),
        )
        Toggle(dev.mcp) {
            if (dev.mcp) {
                store.setDev(dev.copy(mcp = false))
                McpHost.stop(context)
            } else {
                val token = dev.token.ifEmpty { ByteArray(24).also { SecureRandom().nextBytes(it) }.joinToString("") { "%02x".format(it) } }
                store.setDev(dev.copy(mcp = true, token = token))
                if (Build.VERSION.SDK_INT >= 33) notify.launch(Manifest.permission.POST_NOTIFICATIONS)
                runCatching {
                    val port = McpHost.start(context, dev.port, token, dev.lan)
                    store.setDev(store.s.dev.copy(port = port))
                    if (!McpHost.batteryExempt(context)) McpHost.requestBattery(context)
                }.onFailure { store.flash(it.message ?: "Could not start") }
            }
        }
        if (dev.mcp) {
            Body("http://$host:${store.s.dev.port}/mcp", Modifier.padding(top = 16.dp), c.mut)
            Txt("Authorization: Bearer ${store.s.dev.token}", Fonts.mono, 12, c.mut, Modifier.padding(top = 8.dp))
            Button("New token", {
                val token = ByteArray(24).also { SecureRandom().nextBytes(it) }.joinToString("") { "%02x".format(it) }
                store.setDev(store.s.dev.copy(token = token))
                runCatching { McpHost.start(context, store.s.dev.port, token, store.s.dev.lan) }
            })
            Toggle(dev.lan) {
                store.setDev(store.s.dev.copy(lan = !dev.lan))
                if (store.s.dev.mcp) runCatching { McpHost.start(context, store.s.dev.port, store.s.dev.token, !dev.lan) }
            }
            Txt(if (dev.lan) "Reachable on Wi-Fi and Tailscale" else "This phone only", Fonts.body, 13, c.mut)
        }
        if (store.s.pro && store.signedIn) {
            Button("Remote MCP", {
                // Created from Profile when Pro is on. This starts it if the token is already here.
                if (store.s.dev.remoteId.isEmpty()) store.flash("Create the remote MCP from Profile")
            })
        }
    }
}
