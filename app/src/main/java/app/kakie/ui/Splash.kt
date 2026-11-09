package app.kakie.ui

import android.app.Activity
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalView
import androidx.core.view.WindowCompat
import kotlinx.coroutines.delay

private val INK = Color(0xff0e0e10)
private val PAPER = Color(0xfff7f7f5)
private val PURPLE = Color(0xff704af8)

@Composable
fun Splash(ready: Boolean, onDone: () -> Unit) {
    val reduce = LocalReduceMotion.current
    val out = remember { Animatable(0f) }
    LaunchedEffect(ready) {
        if (!ready) return@LaunchedEffect
        delay(if (reduce) 150 else 900)
        out.animateTo(1f, tween(320, easing = CubicOut))
        onDone()
    }
    Box(
        Modifier.fillMaxSize().graphicsLayer { alpha = 1 - out.value }.background(INK),
        contentAlignment = Alignment.Center,
    ) {
        Row(
            Modifier.graphicsLayer {
                val s = if (reduce) 1f else 1 + out.value * 0.06f
                scaleX = s
                scaleY = s
            },
            verticalAlignment = Alignment.Bottom,
        ) {
            "kakie".forEachIndexed { i, ch ->
                Txt(ch.toString(), Fonts.display, 56, PAPER, Modifier.entering(fadeInDownE(420, 80 + i * 55, ExpOut)), spacing = -3.4)
            }
            Txt(".", Fonts.display, 56, PURPLE, Modifier.entering(zoomInE(440, 10f, 220f)), spacing = -3.4)
        }
    }
}

@Composable
fun SystemBars(lightStatus: Boolean, lightNav: Boolean) {
    val view = LocalView.current
    SideEffect {
        val window = (view.context as Activity).window
        WindowCompat.getInsetsController(window, view).apply {
            isAppearanceLightStatusBars = lightStatus
            isAppearanceLightNavigationBars = lightNav
        }
    }
}
