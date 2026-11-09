package app.kakie.ui.screens

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.ExitTransition
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import app.kakie.KakieApp
import app.kakie.lib.SmsError
import app.kakie.lib.cleanVpa
import app.kakie.ui.Back
import app.kakie.ui.Body
import app.kakie.ui.Button
import app.kakie.ui.Enter
import app.kakie.ui.ExpOut
import app.kakie.ui.Field
import app.kakie.ui.Fonts
import app.kakie.ui.Ghost
import app.kakie.ui.Haptic
import app.kakie.ui.Icon
import app.kakie.ui.LocalInsets
import app.kakie.ui.LocalReduceMotion
import app.kakie.ui.LocalStore
import app.kakie.ui.Soft
import app.kakie.ui.Txt
import app.kakie.ui.Word
import app.kakie.ui.Wordmark
import app.kakie.ui.buzz
import app.kakie.ui.c
import app.kakie.ui.entering
import app.kakie.ui.fadeInDownE
import app.kakie.ui.fadeInE
import app.kakie.ui.fadeInSlideT
import app.kakie.ui.fadeInT
import app.kakie.ui.fadeOutSlideT
import app.kakie.ui.fadeOutT
import app.kakie.ui.press
import app.kakie.ui.tagColors
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

private class Feature(val icon: String, val title: String, val body: String)

private val FEATURES = listOf(
    Feature("message-text-outline", "Bank SMS, auto-read", "Every debit alert is parsed on this phone. UPI, card, NEFT, IMPS, debit. You confirm each one."),
    Feature("tag-outline", "One tap to tag", "Type to match a tag or create one. One tag per expense keeps it clean."),
    Feature("account-group-outline", "Split with anyone", "Drop a spend into a group, pick who paid, and watch balances shrink as people settle."),
)

private fun rise(i: Int) = fadeInDownE(420, 80 + i * 70, ExpOut)

@Composable
fun OnboardingScreen() {
    val insets = LocalInsets.current
    val reduce = LocalReduceMotion.current
    val store = LocalStore.current
    val scope = rememberCoroutineScope()
    val density = LocalDensity.current.density
    var step by rememberSaveable { mutableIntStateOf(0) }
    var dir by rememberSaveable { mutableIntStateOf(1) }
    // The leaving page keeps the direction it was shown with, as Reanimated keeps its last exiting prop.
    var exitDir by rememberSaveable { mutableIntStateOf(1) }
    var mode by rememberSaveable { mutableStateOf("signup") }

    fun go(next: Int) {
        exitDir = dir
        dir = if (next > step) 1 else -1
        step = next
    }

    fun allow() = scope.launch {
        val result = KakieApp.instance.device.readSms()
        when (result.error) {
            SmsError.FAILED -> store.flash("Inbox reading needs the installed app. Paste messages in Review for now.")
            SmsError.DENIED -> store.flash("SMS stays off until you allow it")
            null -> {
                val n = store.ingest(result.rows)
                store.setSmsOn(true)
                store.flash(if (n != 0) "$n bank messages ready to review" else "No bank messages yet")
            }
        }
        go(3)
    }

    Column(
        Modifier.fillMaxSize().background(c.bg)
            .padding(top = insets.top, bottom = maxOf(insets.bottom, 16.dp), start = 28.dp, end = 28.dp),
    ) {
        AnimatedContent(
            targetState = step,
            modifier = Modifier.weight(1f),
            transitionSpec = {
                val enter = if (reduce) fadeInT(200) else fadeInSlideT(340, 25f * dir, 0f, density, ExpOut)
                val exit = if (reduce) ExitTransition.None else fadeOutSlideT(200, -25f * exitDir, 0f, density)
                enter togetherWith exit
            },
            label = "onboarding",
        ) { page ->
            Column(Modifier.fillMaxSize()) {
                when (page) {
                    0 -> Column(Modifier.fillMaxSize().padding(top = 36.dp), verticalArrangement = Arrangement.SpaceBetween) {
                        Box(Modifier.entering(rise(0))) { Wordmark(32) }
                        Column {
                            Demo(reduce)
                            Box(Modifier.entering(rise(4))) {
                                Word(
                                    buildAnnotatedString {
                                        append("Your bank already tracks ")
                                        withStyle(SpanStyle(color = c.brand)) { append("every spend.") }
                                    },
                                    36, Modifier.padding(top = 28.dp), lineHeight = 40,
                                )
                            }
                            Box(Modifier.entering(rise(5))) {
                                Body("kakie. reads those SMS alerts and turns them into a clean, split-ready ledger.", Modifier.padding(top = 14.dp), c.mut, 16, 24)
                            }
                        }
                        Column(Modifier.entering(rise(6))) {
                            Dots(0)
                            Button("Get started", { go(1) }, icon = "arrow-right")
                            Ghost("I already have an account") {
                                mode = "login"
                                go(3)
                            }
                        }
                    }
                    1 -> {
                        Back { go(0) }
                        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(30.dp, Alignment.CenterVertically)) {
                            FEATURES.forEachIndexed { i, f -> FeatureRow(f, i, reduce) }
                        }
                        Dots(1)
                        Button("Connect my bank SMS", { go(2) })
                        Ghost("I'll add manually") { go(3) }
                    }
                    2 -> {
                        Back { go(1) }
                        Box(
                            Modifier.padding(top = 20.dp).entering(rise(0)).rotate(-6f).size(52.dp).background(c.brandSoft, RoundedCornerShape(16.dp)),
                            contentAlignment = Alignment.Center,
                        ) { Icon("message-text-outline", 26, c.brandInk) }
                        Column(Modifier.entering(rise(1))) {
                            Word("Connect bank SMS", 32, Modifier.padding(top = 20.dp), lineHeight = 36)
                            Body("kakie. scans for bank transactions only. Personal chats are never accessed.", Modifier.padding(top = 12.dp), c.mut, lineHeight = 22)
                        }
                        Column(
                            Modifier.weight(1f).padding(top = 24.dp).verticalScroll(rememberScrollState()),
                            verticalArrangement = Arrangement.spacedBy(20.dp),
                        ) {
                            Note(2, reduce, "lock-outline", "Parsed on this phone", "Only amount, merchant, date, and rail are synced. The message text stays here.")
                            Note(3, reduce, "filter-outline", "Transactional messages only", "Banks, cards, and wallets. OTPs and chats are skipped.")
                            Note(4, reduce, "check-circle-outline", "You confirm every entry", "Nothing enters the ledger until you tap confirm.")
                        }
                        Dots(2)
                        Button("Allow SMS access", { allow() })
                        Ghost("Skip for now") { go(3) }
                    }
                    else -> Account(mode, { mode = it }) { go(2) }
                }
            }
        }
    }
}

@Composable
private fun ColumnScope.Account(mode: String, setMode: (String) -> Unit, back: () -> Unit) {
    val store = LocalStore.current
    val scope = rememberCoroutineScope()
    var name by rememberSaveable { mutableStateOf("") }
    var phone by rememberSaveable { mutableStateOf("") }
    var pass by rememberSaveable { mutableStateOf("") }
    var vpa by rememberSaveable { mutableStateOf("") }
    var vpaError by rememberSaveable { mutableStateOf<String?>(null) }
    var busy by rememberSaveable { mutableStateOf(false) }
    var error by rememberSaveable { mutableStateOf<String?>(null) }
    var editServer by rememberSaveable { mutableStateOf(false) }
    var server by rememberSaveable { mutableStateOf(store.s.base) }
    var serverError by rememberSaveable { mutableStateOf<String?>(null) }
    val signup = mode == "signup"

    fun submit() {
        error = null
        vpaError = null
        if (signup && name.isBlank()) {
            error = "Add your name so friends recognise you"
            return
        }
        val upi = if (signup && vpa.isNotBlank()) cleanVpa(vpa) else null
        if (signup && vpa.isNotBlank() && upi == null) {
            vpaError = "That does not look like a UPI ID. It has an @, like ananya@okaxis"
            return
        }
        busy = true
        scope.launch {
            val err = if (signup) store.signUp(name, phone, pass, upi) else store.signIn(phone, pass)
            busy = false
            if (err != null) error = err else buzz(Haptic.DONE)
        }
    }

    fun saveServer() = scope.launch {
        serverError = null
        val err = store.setBase(server)
        if (err != null) serverError = err else editServer = false
    }

    // ScrollView with flexGrow 1 content: at least a screen tall so the buttons sit at the bottom.
    BoxWithConstraints(Modifier.weight(1f)) {
        val minH = maxHeight
        Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState())) {
        Column(Modifier.heightIn(min = minH)) {
            Back(back)
            Column(Modifier.entering(rise(0))) {
                Word(if (signup) "Make your account" else "Welcome back", 32, Modifier.padding(top = 16.dp), lineHeight = 36)
                Body(
                    if (signup) "Your phone number is how friends find you in groups." else "Log in with the phone number you signed up with.",
                    Modifier.padding(top = 10.dp), c.mut, lineHeight = 22,
                )
            }
            Column(Modifier.padding(top = 28.dp).entering(rise(1)), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                if (signup) Field("Name", name, { name = it }, "Ananya Rao", words = true)
                Field("Phone", phone, { phone = it }, "98765 43210", keyboard = KeyboardType.Phone)
                Field("Password", pass, { pass = it }, "At least 6 characters", secure = true, error = error)
                if (signup) {
                    Field(
                        "UPI ID (optional)", vpa, { vpa = it }, "ananya@okaxis", keyboard = KeyboardType.Email, error = vpaError,
                        hint = "Lets friends in your groups pay you in one tap. Leave it empty to settle by hand. You can add it later in Profile.",
                    )
                }
            }
            Column(Modifier.padding(top = 20.dp).entering(rise(2))) {
                if (editServer) {
                    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        Field("Server address", server, { server = it }, "http://192.168.1.20:4000", keyboard = KeyboardType.Uri, error = serverError)
                        Box(
                            Modifier.press { saveServer() }.height(40.dp).border(1.dp, c.line, RoundedCornerShape(20.dp)).padding(horizontal = 16.dp),
                            contentAlignment = Alignment.Center,
                        ) { Txt("Test and use", Fonts.medium, 13, c.fg) }
                    }
                } else {
                    Row(Modifier.fillMaxWidth().press { editServer = true }, horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                        Icon("server-network", 16, c.mut)
                        Txt(store.s.base.replace(Regex("^https?://"), ""), Fonts.mono, 12, c.mut, Modifier.weight(1f), lines = 1)
                        Txt("Change", Fonts.medium, 13, c.fg)
                    }
                }
            }
            Spacer(Modifier.height(24.dp))
            Spacer(Modifier.weight(1f))
            Dots(3)
            Button(if (busy) "One sec" else if (signup) "Create account" else "Log in", ::submit, disabled = busy)
            Ghost(if (signup) "I already have an account" else "New here? Make an account") {
                error = null
                setMode(if (signup) "login" else "signup")
            }
        }
        }
    }
}

private class Seg(val t: String, val k: Int = 0)

private class Sample(val sender: String, val body: List<Seg>, val merchant: String, val meta: String, val amount: String, val income: Boolean, val tag: String, val icon: String)

private val SAMPLES = listOf(
    Sample(
        "VM-HDFCBK",
        listOf(Seg("Rs.1,240.00", 1), Seg(" debited from A/c XX4521 to VPA "), Seg("swiggy@icici", 2), Seg(". "), Seg("UPI", 3), Seg(" Ref 4267812.")),
        "Swiggy", "UPI · HDFC ••4521", "₹1,240", false, "food", "qrcode",
    ),
    Sample(
        "AX-ICICIT",
        listOf(Seg("INR 386.00", 1), Seg(" spent on ICICI Bank "), Seg("Credit Card", 3), Seg(" XX9012 at "), Seg("UBER INDIA", 2), Seg(" on 03-Oct.")),
        "Uber", "Credit card · ICICI ••9012", "₹386", false, "transport", "credit-card-outline",
    ),
    Sample(
        "JD-SBIINB",
        listOf(Seg("Your A/c XX7730 is credited by "), Seg("Rs.52,000.00", 1), Seg(" via "), Seg("NEFT", 3), Seg(" from "), Seg("MERIDIAN LABS", 2), Seg(".")),
        "Meridian Labs", "NEFT · SBI ••7730", "₹52,000", true, "salary", "bank-transfer-in",
    ),
)

// phase: 0 message in, 1-3 tokens read, 4 parsed row, 5 tag
private val BEATS = listOf(700L, 380L, 380L, 420L, 380L, 2600L)

@Composable
private fun Demo(reduce: Boolean) {
    var idx by rememberSaveable { mutableIntStateOf(0) }
    var phase by rememberSaveable { mutableIntStateOf(if (reduce) 5 else 0) }
    val shown = if (reduce) 5 else phase
    val density = LocalDensity.current.density
    val maxW = LocalConfiguration.current.screenWidthDp.dp - 56.dp

    LaunchedEffect(phase, reduce) {
        if (reduce) return@LaunchedEffect
        delay(BEATS[phase])
        if (phase < 5) {
            phase += 1
        } else {
            idx = (idx + 1) % SAMPLES.size
            phase = 0
        }
    }

    Box(Modifier.fillMaxWidth().height(196.dp)) {
        AnimatedContent(
            targetState = idx,
            transitionSpec = {
                if (reduce) fadeInT(0) togetherWith ExitTransition.None
                else fadeInSlideT(560, 0f, 25f, density, Soft) togetherWith fadeOutT(260)
            },
            label = "demo",
        ) { i ->
            val s = SAMPLES[i]
            val tag = tagColors(s.tag, c.dark)
            val step = if (i == idx) shown else 5
            Column(Modifier.fillMaxWidth()) {
                Column(
                    Modifier.widthIn(max = maxW * 0.9f)
                        .background(c.sub, RoundedCornerShape(topStart = 20.dp, topEnd = 20.dp, bottomEnd = 20.dp, bottomStart = 6.dp))
                        .padding(horizontal = 15.dp, vertical = 13.dp),
                ) {
                    Txt(s.sender, Fonts.mono, 10.5, c.mut, Modifier.padding(bottom = 6.dp), spacing = 0.4)
                    val ink = c.brandInk
                    val soft = c.brandSoft
                    Txt(
                        buildAnnotatedString {
                            s.body.forEach { seg ->
                                if (seg.k != 0 && step >= seg.k) withStyle(SpanStyle(color = ink, background = soft)) { append(seg.t) } else append(seg.t)
                            }
                        },
                        Fonts.mono, 12.5, c.fg, lineHeight = 19,
                    )
                }
                if (step >= 4) {
                    Column(Modifier.padding(top = 14.dp).entering(if (reduce) null else Enter(480, easing = Soft, dy = 25f))) {
                        Row(Modifier.padding(start = 2.dp, bottom = 10.dp), horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                            Icon("auto-fix", 13, c.brand)
                            Txt("Read by kakie.", Fonts.medium, 11.5, c.brand)
                        }
                        Row(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
                            Box(Modifier.size(42.dp).background(c.brand, RoundedCornerShape(14.dp)), contentAlignment = Alignment.Center) { Icon(s.icon, 20, c.brandFg) }
                            Column(Modifier.weight(1f)) {
                                Txt(s.merchant, Fonts.semi, 16, c.fg)
                                Txt(s.meta, Fonts.body, 12, c.mut, Modifier.padding(top = 2.dp))
                            }
                            Column(horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                Txt("${if (s.income) "+" else "−"}${s.amount}", Fonts.displaySm, 17, if (s.income) c.pos else c.fg)
                                if (step >= 5) {
                                    Box(
                                        Modifier.entering(if (reduce) null else fadeInE(320)).background(tag.bg, RoundedCornerShape(8.dp)).padding(horizontal = 7.dp, vertical = 2.dp),
                                    ) { Txt("#${s.tag}", Fonts.medium, 11, tag.fg) }
                                } else {
                                    Spacer(Modifier.height(19.dp))
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

private val TILT = listOf(-6f, 5f, -3f)

@Composable
private fun FeatureRow(f: Feature, i: Int, reduce: Boolean) {
    val solid = i == 0
    Row(Modifier.entering(if (reduce) null else fadeInDownE(440, 120 + i * 90, ExpOut)), horizontalArrangement = Arrangement.spacedBy(18.dp)) {
        Box(
            Modifier.rotate(TILT[i]).size(48.dp).background(if (solid) c.brand else c.brandSoft, RoundedCornerShape(16.dp)),
            contentAlignment = Alignment.Center,
        ) { Icon(f.icon, 24, if (solid) c.brandFg else c.brandInk) }
        Column(Modifier.weight(1f)) {
            Txt(f.title, Fonts.semi, 17, c.fg, Modifier.padding(bottom = 4.dp))
            Body(f.body, color = c.mut, size = 14, lineHeight = 21)
        }
    }
}

@Composable
private fun Dots(n: Int) {
    Row(Modifier.fillMaxWidth().padding(bottom = 24.dp), horizontalArrangement = Arrangement.spacedBy(5.dp, Alignment.CenterHorizontally)) {
        (0..3).forEach { i ->
            key(i) {
                Box(
                    Modifier.entering(if (i == n) fadeInE(200) else null)
                        .size(if (i == n) 22.dp else 5.dp, 5.dp)
                        .background(if (i == n) c.brand else c.bar, RoundedCornerShape(3.dp)),
                )
            }
        }
    }
}

@Composable
private fun Note(i: Int, reduce: Boolean, icon: String, title: String, sub: String) {
    Row(Modifier.entering(if (reduce) null else rise(i)), horizontalArrangement = Arrangement.spacedBy(14.dp)) {
        Icon(icon, 20, c.brand)
        Column(Modifier.weight(1f)) {
            Txt(title, Fonts.medium, 15, c.fg)
            Txt(sub, Fonts.body, 13.5, c.mut, Modifier.padding(top = 3.dp), lineHeight = 19)
        }
    }
}
