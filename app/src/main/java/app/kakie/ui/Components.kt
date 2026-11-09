package app.kakie.ui

import android.content.Context
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.tween
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.AnchoredDraggableState
import androidx.compose.foundation.gestures.DraggableAnchors
import androidx.compose.foundation.gestures.Orientation
import androidx.compose.foundation.gestures.anchoredDraggable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicText
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.layout
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.PlatformTextStyle
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.LineHeightStyle
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextMotion
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.zIndex
import app.kakie.KakieApp
import app.kakie.lib.Expense
import app.kakie.lib.Settlement
import app.kakie.lib.Store
import app.kakie.lib.dayKey
import app.kakie.lib.inr
import app.kakie.lib.json
import app.kakie.lib.monthName
import app.kakie.lib.owedBack
import app.kakie.lib.parseAt
import app.kakie.lib.pocket
import app.kakie.lib.prettyDay
import app.kakie.lib.remainingOwed
import app.kakie.lib.slugTag
import app.kakie.lib.youStillOwe
import java.time.LocalDate
import kotlin.math.roundToInt
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

val LocalStore = staticCompositionLocalOf<Store> { error("no store") }

data class Insets(val top: Dp, val bottom: Dp)

val LocalInsets = staticCompositionLocalOf { Insets(0.dp, 0.dp) }

/** One physical pixel, like StyleSheet.hairlineWidth. */
val hairline: Dp
    @Composable get() = (1f / LocalDensity.current.density).dp

// ---------- text ----------

fun ts(
    font: FontFamily,
    size: Number,
    color: Color,
    lineHeight: Number? = null,
    spacing: Number? = null,
    align: TextAlign = TextAlign.Unspecified,
) = TextStyle(
    fontFamily = font,
    fontSize = size.toFloat().sp,
    color = color,
    lineHeight = lineHeight?.toFloat()?.sp ?: TextUnit.Unspecified,
    letterSpacing = spacing?.toFloat()?.sp ?: TextUnit.Unspecified,
    textAlign = align,
    // React Native keeps Android's font padding, except that a set lineHeight makes every line exactly that tall, glyphs centred.
    platformStyle = PlatformTextStyle(includeFontPadding = lineHeight == null),
    lineHeightStyle = if (lineHeight == null) null else LineHeightStyle(LineHeightStyle.Alignment.Center, LineHeightStyle.Trim.None),
    // Fractional glyph advances, as React Native lays text out; Static rounds them and runs ~2% narrower.
    textMotion = TextMotion.Animated,
)

@Composable
fun Txt(
    text: String,
    font: FontFamily,
    size: Number,
    color: Color,
    modifier: Modifier = Modifier,
    lineHeight: Number? = null,
    spacing: Number? = null,
    align: TextAlign = TextAlign.Unspecified,
    lines: Int = Int.MAX_VALUE,
) {
    BasicText(
        text,
        modifier,
        ts(font, size, color, lineHeight, spacing, align),
        overflow = if (lines == 1) TextOverflow.Ellipsis else TextOverflow.Clip,
        maxLines = lines,
    )
}

@Composable
fun Txt(
    text: AnnotatedString,
    font: FontFamily,
    size: Number,
    color: Color,
    modifier: Modifier = Modifier,
    lineHeight: Number? = null,
    spacing: Number? = null,
    align: TextAlign = TextAlign.Unspecified,
    lines: Int = Int.MAX_VALUE,
) {
    BasicText(
        text,
        modifier,
        ts(font, size, color, lineHeight, spacing, align),
        overflow = if (lines == 1) TextOverflow.Ellipsis else TextOverflow.Clip,
        maxLines = lines,
    )
}

/** Uppercase section label used across forms (12, letter-spaced, muted). */
@Composable
fun Label(text: String, modifier: Modifier = Modifier) {
    Txt(text.uppercase(), Fonts.medium, 12, c.mut, modifier, spacing = 1)
}

// ---------- icons ----------

private object Mci {
    val map: Map<String, Int> by lazy {
        KakieApp.instance.assets.open("mci.json").bufferedReader().use { json.decodeFromString<Map<String, Int>>(it.readText()) }
    }

    fun glyph(name: String) = map[name]?.let { String(Character.toChars(it)) } ?: "?"
}

@Composable
fun Icon(name: String, size: Int = 22, color: Color = c.fg, modifier: Modifier = Modifier) {
    // Vector icons ignore font scaling, so the size stays in dp.
    val fs = with(LocalDensity.current) { size.dp.toSp() }
    Box(modifier.size(size.dp), contentAlignment = Alignment.Center) {
        BasicText(
            Mci.glyph(name),
            style = TextStyle(
                fontFamily = Fonts.icons,
                fontSize = fs,
                lineHeight = fs,
                color = color,
                platformStyle = PlatformTextStyle(includeFontPadding = false),
                lineHeightStyle = LineHeightStyle(LineHeightStyle.Alignment.Center, LineHeightStyle.Trim.Both),
            ),
            softWrap = false,
        )
    }
}

// ---------- press & haptics ----------

/** Pressable: shrinks to 98% while held, fades to 40% when disabled. Put it before size and background. */
@Composable
fun Modifier.press(enabled: Boolean = true, onPress: (() -> Unit)?): Modifier {
    val source = remember { MutableInteractionSource() }
    val pressed by source.collectIsPressedAsState()
    val reduce = LocalReduceMotion.current
    return graphicsLayer {
        if (pressed && !reduce) {
            scaleX = 0.98f
            scaleY = 0.98f
        }
        if (!enabled) alpha = 0.4f
    }.clickable(source, indication = null, enabled = enabled && onPress != null, role = Role.Button) { onPress?.invoke() }
}

enum class Haptic { TAP, DONE }

private val vibrator: Vibrator by lazy {
    val ctx = KakieApp.instance
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        (ctx.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as VibratorManager).defaultVibrator
    } else {
        @Suppress("DEPRECATION")
        ctx.getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
    }
}

/** Expo Haptics: selectionAsync for taps, notificationAsync(Success) for done. */
fun buzz(kind: Haptic = Haptic.TAP) {
    runCatching {
        val timings = if (kind == Haptic.DONE) longArrayOf(0, 40, 100, 40) else longArrayOf(0, 50)
        val amps = if (kind == Haptic.DONE) intArrayOf(0, 50, 0, 60) else intArrayOf(0, 30)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            vibrator.vibrate(VibrationEffect.createWaveform(timings, amps, -1))
        } else {
            @Suppress("DEPRECATION")
            vibrator.vibrate(if (kind == Haptic.DONE) timings else longArrayOf(0, 70), -1)
        }
    }
}

/** React Native's Share.share({ message }): the system share sheet with plain text. */
fun shareText(context: Context, message: String) {
    val send = android.content.Intent(android.content.Intent.ACTION_SEND).setType("text/plain").putExtra(android.content.Intent.EXTRA_TEXT, message)
    context.startActivity(android.content.Intent.createChooser(send, null))
}

// ---------- basic pieces ----------

@Composable
fun Word(text: String, size: Number = 28, modifier: Modifier = Modifier, lineHeight: Number? = null, align: TextAlign = TextAlign.Unspecified) {
    Txt(text, Fonts.display, size, c.fg, modifier, lineHeight = lineHeight, spacing = -0.8, align = align)
}

@Composable
fun Word(text: AnnotatedString, size: Number = 28, modifier: Modifier = Modifier, lineHeight: Number? = null) {
    Txt(text, Fonts.display, size, c.fg, modifier, lineHeight = lineHeight, spacing = -0.8)
}

@Composable
fun Section(title: String, action: String? = null, onAction: (() -> Unit)? = null, top: Int = 32) {
    Row(
        Modifier.fillMaxWidth().padding(top = top.dp, bottom = 12.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.Bottom,
    ) {
        Txt(title, Fonts.displaySm, 17, c.fg, spacing = -0.2)
        if (action != null && onAction != null) {
            Box(Modifier.press(onPress = onAction)) { Txt(action, Fonts.medium, 13, c.mut) }
        }
    }
}

@Composable
fun Wordmark(size: Int = 22) {
    Txt("kakie.", Fonts.display, size, c.brand, spacing = -size * 0.06)
}

@Composable
fun Avatar(id: String, label: String, size: Int = 36, you: Boolean = false) {
    val (abg, afg) = avatarColors(id, c.dark)
    val bg = if (you) c.acc else abg
    val fg = if (you) c.accFg else afg
    Box(Modifier.size(size.dp).background(bg, RoundedCornerShape((size * 0.36f).dp)), contentAlignment = Alignment.Center) {
        Txt(label, Fonts.bold, size * 0.34f, fg)
    }
}

@Composable
fun <T> Segmented(options: List<Pair<T, String>>, value: T, onChange: (T) -> Unit) {
    val reduce = LocalReduceMotion.current
    val density = LocalDensity.current
    var width by remember { mutableIntStateOf(0) }
    val inset = with(density) { 6.dp.toPx() }
    val seg = if (width > 0) (width - inset) / options.size else 0f
    val idx = options.indexOfFirst { it.first == value }.coerceAtLeast(0)
    val x = remember { Animatable(0f) }
    var placed by remember { mutableStateOf(false) }
    LaunchedEffect(idx, seg, reduce) {
        if (seg == 0f) return@LaunchedEffect
        val to = idx * seg
        if (reduce || !placed) x.snapTo(to) else x.animateTo(to, rnSpring(36f, 320f))
        placed = true
    }
    Box(
        Modifier.fillMaxWidth().onSizeChanged { width = it.width }.background(c.sub, RoundedCornerShape(14.dp)).padding(3.dp),
    ) {
        if (seg > 0f) {
            Box(
                Modifier.offset { IntOffset(x.value.roundToInt(), 0) }
                    .width(with(density) { seg.toDp() }).height(34.dp)
                    .background(c.bg, RoundedCornerShape(11.dp)),
            )
        }
        Row {
            options.forEach { (id, label) ->
                val on = id == value
                Box(
                    Modifier.weight(1f)
                        .press {
                            if (!on) {
                                buzz()
                                onChange(id)
                            }
                        }
                        .height(34.dp)
                        .background(if (on && seg == 0f) c.bg else Color.Transparent, RoundedCornerShape(11.dp)),
                    contentAlignment = Alignment.Center,
                ) {
                    Txt(label, if (on) Fonts.semi else Fonts.medium, 13, if (on) c.fg else c.mut)
                }
            }
        }
    }
}

@Composable
fun Body(text: String, modifier: Modifier = Modifier, color: Color = c.fg, size: Number = 15, lineHeight: Number? = null) {
    Txt(text, Fonts.body, size, color, modifier, lineHeight = lineHeight)
}

@Composable
fun Button(label: String, onPress: () -> Unit, icon: String? = null, disabled: Boolean = false, bg: Color = c.acc, fg: Color = c.accFg) {
    Row(
        Modifier.fillMaxWidth().press(!disabled, onPress).height(56.dp).background(bg, RoundedCornerShape(28.dp)),
        horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.CenterHorizontally),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Txt(label, Fonts.semi, 16, fg)
        if (icon != null) Icon(icon, 20, fg)
    }
}

@Composable
fun Ghost(label: String, onPress: () -> Unit) {
    Box(Modifier.fillMaxWidth().press(onPress = onPress).height(48.dp), contentAlignment = Alignment.Center) {
        Txt(label, Fonts.medium, 14, c.mut)
    }
}

@Composable
fun Back(to: (() -> Unit)? = null) {
    val nav = LocalNav.current
    Box(Modifier.press(onPress = to ?: nav::back).size(44.dp), contentAlignment = Alignment.Center) {
        Icon("arrow-left", 24, c.fg)
    }
}

@Composable
fun Toggle(on: Boolean, onPress: () -> Unit) {
    Box(
        Modifier.press {
            buzz()
            onPress()
        }.size(46.dp, 28.dp).background(if (on) c.brand else c.bar, RoundedCornerShape(14.dp)).padding(3.dp),
    ) {
        Box(Modifier.offset(x = if (on) 18.dp else 0.dp).size(22.dp).background(c.bg, RoundedCornerShape(11.dp)))
    }
}

@Composable
fun Checkbox(on: Boolean, size: Int = 22) {
    Box(
        Modifier.size(size.dp).clip(RoundedCornerShape(6.dp))
            .background(if (on) c.acc else Color.Transparent)
            .border(1.dp, if (on) c.acc else c.line, RoundedCornerShape(6.dp)),
        contentAlignment = Alignment.Center,
    ) {
        if (on) Icon("check", 14, c.accFg)
    }
}

/** Pill chip that flips to the accent colour when selected. */
@Composable
fun Chip(label: String, on: Boolean, onPress: () -> Unit, height: Int = 34, pad: Int = 12, size: Number = 14, modifier: Modifier = Modifier) {
    Box(
        modifier.press(onPress = onPress).height(height.dp)
            .background(if (on) c.acc else Color.Transparent, RoundedCornerShape((height / 2f).dp))
            .border(1.dp, if (on) c.acc else c.line, RoundedCornerShape((height / 2f).dp))
            .padding(horizontal = pad.dp),
        contentAlignment = Alignment.Center,
    ) {
        Txt(label, Fonts.medium, size, if (on) c.accFg else c.fg)
    }
}

// ---------- text input ----------

/** React Native TextInput: plain field with placeholder; [onBlur] fires when focus leaves. */
@Composable
fun Input(
    value: String,
    onChange: (String) -> Unit,
    style: TextStyle,
    modifier: Modifier = Modifier,
    placeholder: String? = null,
    placeholderColor: Color = c.mut,
    keyboard: KeyboardType = KeyboardType.Text,
    caps: KeyboardCapitalization = KeyboardCapitalization.Sentences,
    autoCorrect: Boolean = true,
    secure: Boolean = false,
    singleLine: Boolean = true,
    enabled: Boolean = true,
    autoFocus: Boolean = false,
    imeAction: ImeAction = if (singleLine) ImeAction.Done else ImeAction.Default,
    onSubmit: (() -> Unit)? = null,
    blurOnSubmit: Boolean = true,
    onBlur: (() -> Unit)? = null,
    contentAlignment: Alignment = Alignment.CenterStart,
) {
    val focus = remember { FocusRequester() }
    val focusManager = LocalFocusManager.current
    var focused by remember { mutableStateOf(false) }
    if (autoFocus) LaunchedEffect(Unit) { runCatching { focus.requestFocus() } }
    BasicTextField(
        value = value,
        onValueChange = onChange,
        modifier = modifier.focusRequester(focus).onFocusChanged {
            if (focused && !it.isFocused) onBlur?.invoke()
            focused = it.isFocused
        },
        enabled = enabled,
        textStyle = style,
        singleLine = singleLine,
        cursorBrush = SolidColor(style.color),
        visualTransformation = if (secure) PasswordVisualTransformation() else VisualTransformation.None,
        keyboardOptions = KeyboardOptions(capitalization = caps, autoCorrectEnabled = autoCorrect, keyboardType = keyboard, imeAction = imeAction),
        keyboardActions = KeyboardActions(
            onAny = {
                onSubmit?.invoke()
                if (blurOnSubmit) focusManager.clearFocus()
            },
        ),
        decorationBox = { inner ->
            Box(contentAlignment = contentAlignment) {
                if (value.isEmpty() && placeholder != null) BasicText(placeholder, style = style.copy(color = placeholderColor), maxLines = if (singleLine) 1 else Int.MAX_VALUE)
                inner()
            }
        },
    )
}

@Composable
fun Field(
    label: String,
    value: String,
    onChange: (String) -> Unit,
    placeholder: String? = null,
    secure: Boolean = false,
    keyboard: KeyboardType = KeyboardType.Text,
    words: Boolean = false,
    error: String? = null,
    hint: String? = null,
) {
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Txt(label, Fonts.medium, 13, c.mut)
        Input(
            value, onChange, ts(Fonts.body, 16, c.fg),
            Modifier.fillMaxWidth().height(52.dp).border(1.dp, if (error != null) c.neg else c.line, RoundedCornerShape(16.dp)).padding(horizontal = 16.dp),
            placeholder = placeholder,
            keyboard = keyboard,
            caps = if (words) KeyboardCapitalization.Words else KeyboardCapitalization.None,
            autoCorrect = false,
            secure = secure,
        )
        if (error != null) Txt(error, Fonts.body, 12, c.neg)
        if (hint != null && error == null) Txt(hint, Fonts.body, 12, c.mut, lineHeight = 17)
    }
}

// ---------- tags ----------

@Composable
fun TagPicker(value: String?, onChange: (String?) -> Unit) {
    val store = LocalStore.current
    val tags = store.s.tags
    var open by remember { mutableStateOf(false) }
    var q by remember { mutableStateOf("") }
    val query = slugTag(q)
    val sugg = if (query.isNotEmpty()) tags.filter { query in it }.take(5) else emptyList()
    val showCreate = query.isNotEmpty() && query !in tags
    fun pick(tag: String) {
        val saved = if (tag in tags) tag else store.addTag(tag) ?: return
        onChange(saved)
        q = ""
        open = false
    }
    if (!open) {
        if (value != null) {
            val col = tagColors(value, c.dark)
            Row(verticalAlignment = Alignment.CenterVertically) {
                Row(
                    Modifier.height(36.dp).background(col.bg, RoundedCornerShape(18.dp)).padding(horizontal = 12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Txt("#$value", Fonts.medium, 14, col.fg)
                    Box(Modifier.press { onChange(null) }) { Txt("✕", Fonts.body, 14, col.fg, Modifier.padding(start = 6.dp)) }
                }
            }
        } else {
            Row(Modifier.press { open = true }, horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
                Icon("plus", 18, c.fg)
                Txt("Add tag", Fonts.medium, 14, c.fg)
            }
        }
        return
    }
    Column {
        Row(
            Modifier.fillMaxWidth().height(44.dp).clip(RoundedCornerShape(22.dp)).background(c.sub)
                .border(1.dp, c.line, RoundedCornerShape(22.dp)).padding(horizontal = 14.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon("tag-outline", 18, c.mut)
            Input(
                q, { q = it }, ts(Fonts.body, 14, c.fg), Modifier.weight(1f),
                placeholder = "Search or create a tag",
                caps = KeyboardCapitalization.None,
                autoCorrect = false,
                onSubmit = { if (query.isNotEmpty()) pick(query) },
            )
            if (q.isEmpty()) Icon("plus", 18, c.mut)
        }
        if (query.isNotEmpty() && (sugg.isNotEmpty() || showCreate)) {
            Column(Modifier.padding(top = 6.dp).fillMaxWidth().clip(RoundedCornerShape(14.dp)).border(1.dp, c.line, RoundedCornerShape(14.dp))) {
                sugg.forEach { t ->
                    val col = tagColors(t, c.dark)
                    Row(
                        Modifier.fillMaxWidth().press { pick(t) }.padding(horizontal = 14.dp, vertical = 12.dp),
                        horizontalArrangement = Arrangement.spacedBy(10.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Box(Modifier.size(8.dp).background(col.pie, RoundedCornerShape(4.dp)))
                        Txt("#$t", Fonts.medium, 14, c.fg)
                    }
                    Box(Modifier.fillMaxWidth().height(hairline).background(c.faint))
                }
                if (showCreate) {
                    Row(
                        Modifier.fillMaxWidth().press { pick(query) }.padding(horizontal = 14.dp, vertical = 12.dp),
                        horizontalArrangement = Arrangement.spacedBy(10.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Icon("plus", 18, c.acc)
                        Txt(
                            AnnotatedString.Builder().apply {
                                append("Create ")
                                pushStyle(androidx.compose.ui.text.SpanStyle(color = c.acc))
                                append("#$query")
                                pop()
                            }.toAnnotatedString(),
                            Fonts.medium, 14, c.fg,
                        )
                    }
                    Box(Modifier.fillMaxWidth().height(hairline).background(c.faint))
                }
            }
        }
    }
}

// ---------- rows ----------

@Composable
fun SettleRow(s: Settlement, you: String, name: (String) -> String, onPress: (() -> Unit)? = null) {
    val mine = s.fromId == you || s.toId == you
    val who = when {
        s.fromId == you -> "You paid ${name(s.toId)}"
        s.toId == you -> "${name(s.fromId)} paid you"
        else -> "${name(s.fromId)} paid ${name(s.toId)}"
    }
    Row(
        Modifier.fillMaxWidth().press(onPress = onPress ?: {}).padding(vertical = 10.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.size(38.dp), contentAlignment = Alignment.Center) { Icon("cash-check", 19, if (mine) c.pos else c.mut) }
        Column(Modifier.weight(1f)) {
            Txt(who, Fonts.body, 13.5, c.mut, lines = 1)
            Txt("Settled by ${if (s.method == "upi") "UPI" else "cash"}", Fonts.body, 11.5, c.mut.copy(alpha = c.mut.alpha * 0.75f), Modifier.padding(top = 1.dp))
        }
        Txt("₹${inr(s.amount)}", Fonts.medium, 13.5, if (mine) c.pos else c.mut)
    }
}

private const val FEED_ROW = 58

@Composable
private fun StickyDate(at: String) {
    val d = parseAt(at)
    Box(Modifier.width(30.dp).height(FEED_ROW.dp).background(c.bg), contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Txt(monthName(d.monthValue, true).uppercase(), Fonts.medium, 10, c.mut)
            Txt(d.dayOfMonth.toString(), Fonts.displaySm, 16, c.fg)
        }
    }
}

@Composable
private fun MonthLabel(at: String) {
    val d = parseAt(at)
    val year = if (d.year != LocalDate.now().year) " ${d.year}" else ""
    // Above the sticky dates so a new month slides over the previous month's pinned date.
    Txt(
        "${monthName(d.monthValue)}$year", Fonts.semi, 13, c.mut,
        Modifier.zIndex(11f).fillMaxWidth().background(c.bg).padding(top = 18.dp, bottom = 4.dp),
    )
}

/** Newest-first rows with each day's date shown once and sticky beside the day's first row. */
@OptIn(ExperimentalFoundationApi::class)
fun <T> LazyListScope.timeline(events: List<T>, at: (T) -> String, row: @Composable (T) -> Unit) {
    var month = ""
    var i = 0
    while (i < events.size) {
        val first = events[i]
        val day = dayKey(at(first))
        var j = i
        while (j < events.size && dayKey(at(events[j])) == day) j++
        val rows = events.subList(i, j)
        if (day.take(7) != month) item(key = "month-$day") { MonthLabel(at(first)) }
        month = day.take(7)
        stickyHeader(key = "date-$day") { Box(Modifier.zIndex(10f)) { StickyDate(at(first)) } }
        item(key = "rows-$day") {
            Column(
                Modifier.layout { m, cons ->
                    val p = m.measure(cons)
                    val up = FEED_ROW.dp.roundToPx()
                    layout(p.width, (p.height - up).coerceAtLeast(0)) { p.place(0, -up) }
                }.padding(start = 42.dp),
            ) { rows.forEach { row(it) } }
        }
        i = j
    }
}

@Composable
fun TxnRow(item: Expense, onRemove: (() -> Unit)? = null, showDay: Boolean = true, full: Boolean = false) {
    val store = LocalStore.current
    val nav = LocalNav.current
    val s = store.s
    val rem = remainingOwed(s.expenses, s.settlements)
    val you = s.you.id
    val owed = owedBack(item, you, rem)
    val owe = youStillOwe(item, you, rem)
    val shown = if (item.groupId != null && !full) pocket(item, you, rem) else item.amount
    val col = item.tag?.let { tagColors(it, c.dark) }
    val group = item.groupId?.let { gid -> s.groups.find { it.id == gid } }
    val row: @Composable () -> Unit = {
        Row(
            Modifier.fillMaxWidth().press { nav.push(ExpenseR(item.id)) }.background(c.bg)
                .drawBottomLine(c.faint).padding(vertical = 12.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(Modifier.size(36.dp).background(c.sub, RoundedCornerShape(12.dp)), contentAlignment = Alignment.Center) {
                Icon(item.rail.icon, 18, c.fg)
            }
            Column(Modifier.weight(1f)) {
                Txt(item.merchant, Fonts.medium, 15, c.fg, lines = 1)
                val meta = buildString {
                    if (showDay) append("${prettyDay(item.at)} · ")
                    append(item.rail.label)
                    if (item.transfer) append(" · card bill")
                    if (item.recurring != null) append(" · ${item.recurring}")
                    if (group != null) append(" · ${group.name}")
                }
                Txt(meta, Fonts.body, 12, c.mut, Modifier.padding(top = 2.dp))
                if (owed > 0) Txt("Owed back ₹${inr(owed)}", Fonts.medium, 12, c.pos, Modifier.padding(top = 2.dp))
                if (owe > 0) Txt("You owe ₹${inr(owe)}", Fonts.medium, 12, c.neg, Modifier.padding(top = 2.dp))
            }
            Column(horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Txt(
                    "${if (item.income) "+" else "−"}₹${inr(if (item.income || item.transfer) item.amount else shown)}",
                    Fonts.displaySm, 16, if (item.income) c.pos else c.fg,
                )
                if (col != null && item.tag != null) {
                    Box(Modifier.background(col.bg, RoundedCornerShape(8.dp)).padding(horizontal = 6.dp, vertical = 2.dp)) {
                        Txt("#${item.tag}", Fonts.medium, 11, col.fg)
                    }
                }
            }
        }
    }
    if (onRemove == null) row() else SwipeToRemove(onRemove, row)
}

@Composable
private fun SwipeToRemove(onRemove: () -> Unit, content: @Composable () -> Unit) {
    val width = with(LocalDensity.current) { 88.dp.toPx() }
    val state = remember { AnchoredDraggableState(initialValue = 0, anchors = DraggableAnchors { 0 at 0f; 1 at -width }) }
    Box {
        Box(Modifier.matchParentSize(), contentAlignment = Alignment.CenterEnd) {
            Box(
                Modifier.press {
                    buzz()
                    onRemove()
                }.width(88.dp).fillMaxHeight().background(c.neg),
                contentAlignment = Alignment.Center,
            ) { Txt("Remove", Fonts.semi, 14, Color.White) }
        }
        Box(
            Modifier.offset { IntOffset(state.offset.takeIf { !it.isNaN() }?.roundToInt() ?: 0, 0) }
                .anchoredDraggable(state, Orientation.Horizontal),
        ) { content() }
    }
}

/** A border on one edge, drawn over the content like React Native's borderBottomWidth. */
@Composable
fun Modifier.drawBottomLine(color: Color, width: Dp = hairline): Modifier = drawBehind {
    val w = width.toPx()
    drawRect(color, Offset(0f, size.height - w), Size(size.width, w))
}

@Composable
fun Modifier.drawTopLine(color: Color, width: Dp = hairline): Modifier = drawBehind {
    drawRect(color, size = Size(size.width, width.toPx()))
}

// ---------- toast & confirm ----------

@Composable
fun Toast() {
    val store = LocalStore.current
    val insets = LocalInsets.current
    val density = LocalDensity.current.density
    Box(Modifier.fillMaxSize().padding(start = 24.dp, end = 24.dp, bottom = insets.bottom + 88.dp), contentAlignment = Alignment.BottomCenter) {
        AnimatedContent(
            targetState = store.toast,
            transitionSpec = { fadeInSlideT(220, 0f, 25f, density) togetherWith fadeOutT(160) },
            label = "toast",
        ) { msg ->
            if (msg.isEmpty()) {
                Spacer(Modifier.size(0.dp))
            } else {
                Row(
                    Modifier.background(c.fg, RoundedCornerShape(22.dp)).padding(horizontal = 16.dp, vertical = 12.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon("check", 16, c.bg)
                    Txt(msg, Fonts.medium, 13, c.bg)
                }
            }
        }
    }
}

data class Ask(val title: String, val body: String? = null, val confirm: String, val destructive: Boolean = false, val onConfirm: () -> Unit)

private object Asker {
    var current by mutableStateOf<Ask?>(null)
    var open by mutableStateOf(false)
}

fun ask(a: Ask) {
    Asker.current = a
    Asker.open = true
}

@Composable
fun ConfirmHost() {
    val a = Asker.current ?: return
    val reduce = LocalReduceMotion.current
    val insets = LocalInsets.current
    val scope = rememberCoroutineScope()
    val windowH = with(LocalDensity.current) { LocalConfiguration.current.screenHeightDp.dp.roundToPx() }
    fun close(then: (() -> Unit)? = null) {
        Asker.open = false
        scope.launch {
            delay(if (reduce) 120 else 200)
            Asker.current = null
            then?.invoke()
        }
    }
    BackHandler { close() }
    Box(Modifier.fillMaxSize()) {
        AnimatedVisibility(Asker.open, enter = fadeInT(180), exit = fadeOutT(160)) {
            Box(Modifier.fillMaxSize().background(Color(0x7308080A)).clickable(remember { MutableInteractionSource() }, null) { close() })
        }
        AnimatedVisibility(
            Asker.open,
            Modifier.align(Alignment.BottomCenter),
            enter = if (reduce) fadeInT(120) else slideInVertically(rnSpring<IntOffset>(32f, 320f)) { windowH },
            exit = if (reduce) fadeOutT(120) else slideOutVertically(tween(200, easing = QuadInOut)) { windowH },
        ) {
            Column(
                Modifier.fillMaxWidth()
                    .background(c.bg, RoundedCornerShape(topStart = 28.dp, topEnd = 28.dp))
                    .clickable(remember { MutableInteractionSource() }, null) {}
                    .padding(start = 24.dp, end = 24.dp, top = 10.dp, bottom = insets.bottom + 20.dp),
            ) {
                Box(Modifier.align(Alignment.CenterHorizontally).padding(bottom = 20.dp).size(36.dp, 4.dp).background(c.bar, RoundedCornerShape(2.dp)))
                Txt(a.title, Fonts.displaySm, 20, c.fg)
                if (a.body != null) Txt(a.body, Fonts.body, 15, c.mut, Modifier.padding(top = 8.dp), lineHeight = 22)
                Column(Modifier.padding(top = 24.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Button(
                        a.confirm,
                        {
                            buzz(if (a.destructive) Haptic.TAP else Haptic.DONE)
                            close(a.onConfirm)
                        },
                        bg = if (a.destructive) c.neg else c.acc,
                        fg = if (a.destructive) Color.White else c.accFg,
                    )
                    Ghost("Cancel") { close() }
                }
            }
        }
    }
}
