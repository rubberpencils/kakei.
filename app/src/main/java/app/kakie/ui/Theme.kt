package app.kakie.ui

import androidx.compose.runtime.Composable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import app.kakie.R

data class Palette(
    val bg: Color,
    val fg: Color,
    val mut: Color,
    val faint: Color,
    val line: Color,
    val sub: Color,
    val bar: Color,
    val acc: Color,
    val accFg: Color,
    val pos: Color,
    val neg: Color,
    val brand: Color,
    val brandFg: Color,
    val brandSoft: Color,
    val brandInk: Color,
    val dark: Boolean,
)

private fun hex(v: Long) = Color(0xff000000 or v)

val Light = Palette(
    bg = hex(0xf7f7f5),
    fg = hex(0x0e0e10),
    mut = hex(0x5a5a61),
    faint = hex(0xececea),
    line = hex(0xd9d9d4),
    sub = hex(0xefefec),
    bar = hex(0xe4e4e0),
    acc = hex(0x0e0e10),
    accFg = hex(0xffffff),
    pos = hex(0x1b7f45),
    neg = hex(0xc4382f),
    brand = hex(0x653de9),
    brandFg = hex(0xffffff),
    brandSoft = hex(0xece8ff),
    brandInk = hex(0x4a29b2),
    dark = false,
)

val Dark = Palette(
    bg = hex(0x18181a),
    fg = hex(0xf2f2f0),
    mut = hex(0xa5a5aa),
    faint = hex(0x28282b),
    line = hex(0x3a3a3f),
    sub = hex(0x232326),
    bar = hex(0x323236),
    acc = hex(0xf2f2f0),
    accFg = hex(0x18181a),
    pos = hex(0x6dce96),
    neg = hex(0xf0998c),
    brand = hex(0x9c92ff),
    brandFg = hex(0x0e0a24),
    brandSoft = hex(0x27214f),
    brandInk = hex(0xc3c2ff),
    dark = true,
)

val LocalPalette = staticCompositionLocalOf { Light }

val c: Palette
    @Composable get() = LocalPalette.current

object Fonts {
    val display = FontFamily(Font(R.font.syne_extrabold))
    val displaySm = FontFamily(Font(R.font.syne_bold))
    val body = FontFamily(Font(R.font.jakarta_regular))
    val medium = FontFamily(Font(R.font.jakarta_medium))
    val semi = FontFamily(Font(R.font.jakarta_semibold))
    val bold = FontFamily(Font(R.font.jakarta_bold))
    val mono = FontFamily(Font(R.font.jetbrains_medium))
    val icons = FontFamily(Font(R.font.mci))
}

private val TAG_HUES = mapOf(
    "food" to 28, "coffee" to 24, "transport" to 230, "rent" to 215, "bills" to 195,
    "entertainment" to 275, "health" to 155, "travel" to 208, "shopping" to 340,
    "salary" to 148, "freelance" to 168, "groceries" to 128, "weekend" to 22,
    "family" to 350, "work" to 235, "trip" to 200, "festive" to 42, "subscription" to 265,
    "medical" to 155, "fuel" to 40, "untagged" to 220,
)

fun hashHue(s: String, seed: Int) = s.fold(seed) { h, ch -> (h * 31 + ch.code) % 360 }

data class TagColors(val bg: Color, val fg: Color, val pie: Color)

private fun hsl(h: Int, s: Int, l: Int) = Color.hsl(h.toFloat(), s / 100f, l / 100f)

fun tagColors(tag: String, isDark: Boolean): TagColors {
    val hue = TAG_HUES[tag] ?: hashHue(tag, 7)
    return if (isDark) TagColors(hsl(hue, 32, 18), hsl(hue, 45, 78), hsl(hue, 55, 64))
    else TagColors(hsl(hue, 62, 91), hsl(hue, 48, 28), hsl(hue, 58, 42))
}

fun avatarColors(id: String, isDark: Boolean): Pair<Color, Color> {
    val hue = hashHue(id, 17)
    return if (isDark) hsl(hue, 18, 20) to hsl(hue, 30, 78) else hsl(hue, 32, 90) to hsl(hue, 30, 30)
}
