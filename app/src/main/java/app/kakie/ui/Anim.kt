package app.kakie.ui

import androidx.compose.animation.EnterTransition
import androidx.compose.animation.ExitTransition
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.AnimationSpec
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.Easing
import androidx.compose.animation.core.SpringSpec
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideIn
import androidx.compose.animation.slideOut
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.pow
import kotlin.math.roundToInt
import kotlin.math.sqrt
import kotlinx.coroutines.delay

/** Reanimated's default timing curve, Easing.inOut(Easing.quad). */
val QuadInOut = Easing { t -> if (t < 0.5f) 2 * t * t else 1 - (-2 * t + 2).pow(2) / 2 }
val ExpOut = Easing { t -> if (t >= 1f) 1f else 1 - 2f.pow(-10 * t) }
val CubicOut = Easing { t -> 1 - (1 - t).pow(3) }
val Soft = CubicBezierEasing(0.22f, 1f, 0.36f, 1f)

/** Android's AccelerateDecelerateInterpolator, used by react-native-screens slides. */
val AccelDecel = Easing { t -> (cos((t + 1) * PI) / 2 + 0.5).toFloat() }
val DecelQuint = Easing { t -> 1 - (1 - t).pow(5) }
val AccelQuint = Easing { t -> t.pow(5) }

/** Reanimated spring (mass 1) expressed as a Compose spring. */
fun <T> rnSpring(damping: Float, stiffness: Float): SpringSpec<T> =
    spring(dampingRatio = damping / (2 * sqrt(stiffness)), stiffness = stiffness)

val LocalReduceMotion = staticCompositionLocalOf { false }

/** A Reanimated `entering` preset: fades and/or moves from an offset (dp) or scales up from 0. */
data class Enter(
    val duration: Int = 300,
    val delay: Int = 0,
    val easing: Easing = QuadInOut,
    val dx: Float = 0f,
    val dy: Float = 0f,
    val fade: Boolean = true,
    val zoom: Boolean = false,
    val spring: AnimationSpec<Float>? = null,
)

fun fadeInE(duration: Int = 300, delay: Int = 0, easing: Easing = QuadInOut) = Enter(duration, delay, easing)
fun fadeInDownE(duration: Int = 300, delay: Int = 0, easing: Easing = QuadInOut) = Enter(duration, delay, easing, dy = 25f)
fun fadeInRightE(duration: Int = 300, delay: Int = 0, easing: Easing = QuadInOut) = Enter(duration, delay, easing, dx = 25f)
fun zoomInE(delay: Int = 0, damping: Float, stiffness: Float) = Enter(delay = delay, fade = false, zoom = true, spring = rnSpring(damping, stiffness))

/** Plays [e] once when this element first appears. Null, or reduced motion, shows it at rest. */
@Composable
fun Modifier.entering(e: Enter?): Modifier {
    if (e == null || LocalReduceMotion.current) return this
    val p = remember { Animatable(0f) }
    LaunchedEffect(Unit) {
        delay(e.delay.toLong())
        p.animateTo(1f, e.spring ?: tween(e.duration, easing = e.easing))
    }
    return graphicsLayer {
        val v = p.value
        if (e.fade) alpha = v.coerceIn(0f, 1f)
        translationX = e.dx.dp.toPx() * (1 - v)
        translationY = e.dy.dp.toPx() * (1 - v)
        if (e.zoom) {
            scaleX = v
            scaleY = v
        }
    }
}

/** Shift in dp for slide transitions, as a pixel offset. */
private fun shift(dx: Float, dy: Float, density: Float) = IntOffset((dx * density).roundToInt(), (dy * density).roundToInt())

fun fadeInT(duration: Int, delay: Int = 0, easing: Easing = QuadInOut): EnterTransition = fadeIn(tween(duration, delay, easing))

fun fadeOutT(duration: Int, easing: Easing = QuadInOut): ExitTransition = fadeOut(tween(duration, easing = easing))

fun fadeInSlideT(duration: Int, dx: Float, dy: Float, density: Float, easing: Easing = QuadInOut, delay: Int = 0): EnterTransition =
    fadeIn(tween(duration, delay, easing)) + slideIn(tween(duration, delay, easing)) { shift(dx, dy, density) }

fun fadeOutSlideT(duration: Int, dx: Float, dy: Float, density: Float, easing: Easing = QuadInOut): ExitTransition =
    fadeOut(tween(duration, easing = easing)) + slideOut(tween(duration, easing = easing)) { shift(dx, dy, density) }
