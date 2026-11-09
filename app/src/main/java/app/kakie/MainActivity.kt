package app.kakie

import android.content.Intent
import android.graphics.Color
import android.os.Bundle
import android.provider.Settings
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import app.kakie.ui.Dark
import app.kakie.ui.Light
import app.kakie.ui.Links
import app.kakie.ui.LocalPalette
import app.kakie.ui.LocalReduceMotion
import app.kakie.ui.Root

class MainActivity : ComponentActivity() {
    private val app get() = application as KakieApp
    private var reduce by mutableStateOf(false)

    override fun onCreate(savedInstanceState: Bundle?) {
        installSplashScreen()
        enableEdgeToEdge(
            SystemBarStyle.auto(Color.TRANSPARENT, Color.TRANSPARENT),
            SystemBarStyle.auto(Color.TRANSPARENT, Color.TRANSPARENT),
        )
        super.onCreate(savedInstanceState)
        app.device.attach(this)
        if (savedInstanceState == null) intent?.data?.let { Links.pending = it }
        reduce = readReduceMotion()
        setContent {
            CompositionLocalProvider(
                LocalPalette provides if (isSystemInDarkTheme()) Dark else Light,
                LocalReduceMotion provides reduce,
            ) { Root(app.store) }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        intent.data?.let { Links.pending = it }
    }

    override fun onResume() {
        super.onResume()
        reduce = readReduceMotion()
        app.store.onResume()
    }

    private fun readReduceMotion(): Boolean {
        fun off(key: String) = Settings.Global.getFloat(contentResolver, key, 1f) == 0f
        return off(Settings.Global.ANIMATOR_DURATION_SCALE) ||
            off(Settings.Global.TRANSITION_ANIMATION_SCALE) ||
            off(Settings.Global.WINDOW_ANIMATION_SCALE)
    }

    override fun onPause() {
        super.onPause()
        app.store.onPause()
    }
}
