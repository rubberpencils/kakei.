package app.kakie.ui

import android.content.Context
import android.hardware.biometrics.BiometricPrompt
import android.net.Uri
import android.os.Build
import android.os.CancellationSignal
import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedContentTransitionScope
import androidx.compose.animation.EnterTransition
import androidx.compose.animation.ExitTransition
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.displayCutout
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.ime
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.union
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveableStateHolder
import androidx.compose.runtime.setValue
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.max
import androidx.navigation.NavBackStackEntry
import androidx.navigation.NavDestination
import androidx.navigation.NavDestination.Companion.hasRoute
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.toRoute
import app.kakie.lib.Store
import app.kakie.ui.screens.BalancesScreen
import app.kakie.ui.screens.CardBillScreen
import app.kakie.ui.screens.AddScreen
import app.kakie.ui.screens.ExpenseScreen
import app.kakie.ui.screens.GroupScreen
import app.kakie.ui.screens.GroupSettingsScreen
import app.kakie.ui.screens.GroupsScreen
import app.kakie.ui.screens.HomeScreen
import app.kakie.ui.screens.InsightsScreen
import app.kakie.ui.screens.JoinScreen
import app.kakie.ui.screens.NewGroupScreen
import app.kakie.ui.screens.OnboardingScreen
import app.kakie.ui.screens.PersonScreen
import app.kakie.ui.screens.PersonalScreen
import app.kakie.ui.screens.ProfileScreen
import app.kakie.ui.screens.QuickSplitScreen
import app.kakie.ui.screens.ReviewScreen
import app.kakie.ui.screens.SearchScreen
import app.kakie.ui.screens.SettleScreen
import app.kakie.ui.screens.SplitScreen
import app.kakie.ui.screens.UpiLabScreen
import kotlinx.serialization.Serializable

@Serializable data object TabsRoute
@Serializable data object Onboarding
@Serializable data object Add
@Serializable data object Review
@Serializable data class Split(val groupId: String? = null, val draftId: String? = null, val expenseId: String? = null, val reflect: Boolean = true, val tag: String? = null)
@Serializable data class Settle(val groupId: String, val withId: String? = null)
@Serializable data class UpiLab(val to: String, val am: String)
@Serializable data class Join(val code: String? = null)
@Serializable data object NewGroup
@Serializable data class GroupR(val id: String)
@Serializable data class ExpenseR(val id: String)
@Serializable data class PersonR(val id: String)
@Serializable data class GroupSettings(val id: String)
@Serializable data object Search
@Serializable data class BalancesR(val side: String = "owed")
@Serializable data object CardBill
@Serializable data class QuickSplitR(val draftId: String? = null, val expenseId: String? = null, val tag: String? = null)

enum class Tab(val label: String, val icon: String, val on: String) {
    HOME("Home", "home-outline", "home"),
    PERSONAL("Personal", "wallet-outline", "wallet"),
    GROUPS("Groups", "account-group-outline", "account-group"),
    INSIGHTS("Insights", "chart-donut", "chart-donut"),
    PROFILE("Profile", "account-outline", "account"),
}

class Nav(val controller: NavHostController) {
    var tab by mutableStateOf(Tab.HOME)

    fun push(route: Any) = controller.navigate(route)

    /** Switches to a tab from anywhere, dropping screens stacked over the tabs. */
    fun tab(t: Tab) {
        tab = t
        controller.popBackStack(TabsRoute, inclusive = false)
    }

    fun back() {
        if (controller.previousBackStackEntry != null) controller.popBackStack() else home()
    }

    fun home() {
        tab = Tab.HOME
        if (!controller.popBackStack(TabsRoute, inclusive = false)) {
            controller.navigate(TabsRoute) { popUpTo(controller.graph.id) { inclusive = true } }
        }
    }

    fun replace(route: Any) {
        val current = controller.currentBackStackEntry?.destination?.id
        controller.navigate(route) { if (current != null) popUpTo(current) { inclusive = true } }
    }
}

val LocalNav = staticCompositionLocalOf<Nav> { error("no nav") }

/** Pending kakie:// link from the activity. */
object Links {
    var pending by mutableStateOf<Uri?>(null)
}

// react-native-screens animations: slide_from_right, slide_from_bottom (Add), fade (onboarding), fade_from_bottom (Search).
private enum class Motion { RIGHT, BOTTOM, FADE, FADE_BOTTOM }

private fun NavDestination.motion(reduce: Boolean) = when {
    reduce -> Motion.FADE
    hasRoute(Add::class) -> Motion.BOTTOM
    hasRoute(Search::class) -> Motion.FADE_BOTTOM
    hasRoute(Onboarding::class) -> Motion.FADE
    else -> Motion.RIGHT
}

private const val SLIDE = 400
private fun <T> slide() = tween<T>(SLIDE, easing = AccelDecel)
private fun hold(ms: Int) = fadeOut(tween(ms), targetAlpha = 0.999f)

private fun enterFor(m: Motion): EnterTransition = when (m) {
    Motion.RIGHT -> slideInHorizontally(slide()) { it }
    Motion.BOTTOM -> slideInVertically(slide()) { it }
    Motion.FADE -> fadeIn(tween(150, easing = LinearEasing))
    Motion.FADE_BOTTOM -> fadeIn(tween(210, easing = DecelQuint)) + slideInVertically(tween(350, easing = DecelQuint)) { (it * 0.08f).toInt() }
}

private fun exitUnder(m: Motion): ExitTransition = when (m) {
    Motion.RIGHT -> slideOutHorizontally(slide()) { -it }
    Motion.BOTTOM -> hold(SLIDE)
    Motion.FADE -> fadeOut(tween(150, easing = LinearEasing))
    Motion.FADE_BOTTOM -> hold(350)
}

private fun popEnterUnder(m: Motion): EnterTransition = when (m) {
    Motion.RIGHT -> slideInHorizontally(slide()) { -it }
    Motion.FADE -> fadeIn(tween(150, easing = LinearEasing))
    Motion.BOTTOM, Motion.FADE_BOTTOM -> EnterTransition.None
}

private fun popExitFor(m: Motion): ExitTransition = when (m) {
    Motion.RIGHT -> slideOutHorizontally(slide()) { it }
    Motion.BOTTOM -> slideOutVertically(slide()) { it }
    Motion.FADE -> fadeOut(tween(150, easing = LinearEasing))
    Motion.FADE_BOTTOM -> fadeOut(tween(150, 100, LinearEasing)) + slideOutVertically(tween(250, easing = AccelQuint)) { (it * 0.08f).toInt() }
}

@Composable
fun Root(store: Store) {
    val reduce = LocalReduceMotion.current
    val top = WindowInsets.statusBars.union(WindowInsets.displayCutout).asPaddingValues().calculateTopPadding()
    val navBar = WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()
    val ime = WindowInsets.ime.asPaddingValues().calculateBottomPadding()
    var splash by remember { mutableStateOf(true) }
    var unlocked by remember { mutableStateOf(!store.s.lock) }
    val context = LocalContext.current
    if (!store.s.lock && !unlocked) unlocked = true
    CompositionLocalProvider(LocalStore provides store, LocalInsets provides Insets(top, max(0.dp, navBar - ime))) {
        Box(Modifier.fillMaxSize().background(c.bg)) {
            // The window stops at the keyboard, like adjustResize.
            Box(Modifier.fillMaxSize().padding(bottom = ime)) {
                if (store.ready) AppNav(store, reduce)
                Toast()
            }
            ConfirmHost()
            if (store.s.lock && !unlocked && !splash) {
                Column(Modifier.fillMaxSize().background(c.bg), verticalArrangement = Arrangement.Center, horizontalAlignment = Alignment.CenterHorizontally) {
                    Wordmark(32)
                    Box(Modifier.padding(top = 16.dp, start = 24.dp, end = 24.dp).fillMaxWidth()) {
                        Button("Unlock", { unlock(context) { unlocked = true } })
                    }
                }
            }
            if (splash) Splash(store.ready) { splash = false }
        }
    }
    SystemBars(lightStatus = !splash && !c.dark, lightNav = !c.dark)
}

@Composable
private fun AppNav(store: Store, reduce: Boolean) {
    val controller = rememberNavController()
    val nav = remember(controller) { Nav(controller) }
    val entered = store.entered
    val start = remember { if (entered) TabsRoute else Onboarding }
    CompositionLocalProvider(LocalNav provides nav) {
        NavHost(
            controller,
            startDestination = start,
            modifier = Modifier.fillMaxSize().background(c.bg),
            enterTransition = { enterFor(targetState.destination.motion(reduce)) },
            exitTransition = { exitUnder(targetState.destination.motion(reduce)) },
            popEnterTransition = { popEnterUnder(initialState.destination.motion(reduce)) },
            popExitTransition = { popExitFor(initialState.destination.motion(reduce)) },
        ) {
            composable<TabsRoute> { TabsScreen() }
            composable<Onboarding> { OnboardingScreen() }
            composable<Add> { AddScreen() }
            composable<Review> { ReviewScreen() }
            composable<Split> { SplitScreen(it.toRoute()) }
            composable<Settle> { SettleScreen(it.toRoute()) }
            composable<UpiLab> { UpiLabScreen(it.toRoute()) }
            composable<Join> { JoinScreen(it.toRoute<Join>().code) }
            composable<NewGroup> { NewGroupScreen() }
            composable<GroupR> { GroupScreen(it.toRoute<GroupR>().id) }
            composable<ExpenseR> { ExpenseScreen(it.toRoute<ExpenseR>().id) }
            composable<PersonR> { PersonScreen(it.toRoute<PersonR>().id) }
            composable<GroupSettings> { GroupSettingsScreen(it.toRoute<GroupSettings>().id) }
            composable<Search> { SearchScreen() }
            composable<BalancesR> { BalancesScreen(it.toRoute()) }
            composable<CardBill> { CardBillScreen() }
            composable<QuickSplitR> { QuickSplitScreen(it.toRoute()) }
        }
    }

    // Stack.Protected: signing in, skipping the account, or signing out swaps the whole stack.
    LaunchedEffect(entered) {
        val onTabs = controller.currentDestination?.hasRoute(Onboarding::class) != true
        if (entered == onTabs) return@LaunchedEffect
        nav.tab = Tab.HOME
        controller.navigate(if (entered) TabsRoute else Onboarding) { popUpTo(controller.graph.id) { inclusive = true } }
    }

    val link = Links.pending
    LaunchedEffect(link, entered) {
        if (link == null || !entered) return@LaunchedEffect
        Links.pending = null
        openLink(link, store, nav)
    }
}

/** Query values decoded like expo-router: '+' is a space. */
private fun query(uri: Uri): Map<String, String> =
    uri.encodedQuery.orEmpty().split("&").filter { it.isNotEmpty() }.associate {
        val k = it.substringBefore("=")
        val v = it.substringAfter("=", "")
        Uri.decode(k.replace('+', ' ')) to Uri.decode(v.replace('+', ' '))
    }

private fun unlock(context: Context, onOk: () -> Unit) {
    if (Build.VERSION.SDK_INT < 28) {
        onOk()
        return
    }
    val prompt = BiometricPrompt.Builder(context).setTitle("Unlock kakie.").setNegativeButton("Cancel", context.mainExecutor) { _, _ -> }.build()
    prompt.authenticate(CancellationSignal(), context.mainExecutor, object : BiometricPrompt.AuthenticationCallback() {
        override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult?) = onOk()
    })
}

private fun openLink(uri: Uri, store: Store, nav: Nav) {
    val q = query(uri)
    when (uri.host ?: uri.path?.trim('/')) {
        "join" -> nav.push(Join(q["code"]?.uppercase()))
        "sms" -> {
            val text = q["text"]
            val ok = text != null && store.ingestText(text, q["sender"] ?: "Shortcuts")
            if (!ok) store.flash("That message is not a bank debit or credit")
            if (ok) nav.push(Review) else nav.home()
        }
        else -> nav.home()
    }
}

@Composable
private fun TabsScreen() {
    val nav = LocalNav.current
    val store = LocalStore.current
    val insets = LocalInsets.current
    val holder = rememberSaveableStateHolder()
    BackHandler(enabled = nav.tab != Tab.HOME) { nav.tab = Tab.HOME }
    Box(Modifier.fillMaxSize().background(c.bg)) {
        Column(Modifier.fillMaxSize()) {
            Box(Modifier.weight(1f)) {
                holder.SaveableStateProvider(nav.tab.name) {
                    when (nav.tab) {
                        Tab.HOME -> HomeScreen()
                        Tab.PERSONAL -> PersonalScreen()
                        Tab.GROUPS -> GroupsScreen()
                        Tab.INSIGHTS -> InsightsScreen()
                        Tab.PROFILE -> ProfileScreen()
                    }
                }
            }
            Row(
                Modifier.fillMaxWidth().background(c.bg).drawTopLine(c.faint)
                    .padding(top = 6.dp, bottom = max(insets.bottom, 8.dp)),
            ) {
                Tab.entries.forEach { t ->
                    val focused = nav.tab == t
                    Column(
                        Modifier.weight(1f).press { nav.tab = t }.defaultMinSize(minHeight = 48.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(2.dp),
                    ) {
                        Icon(if (focused) t.on else t.icon, 24, if (focused) c.fg else c.mut)
                        Txt(t.label, Fonts.medium, 10.5, if (focused) c.fg else c.mut)
                    }
                }
            }
        }
        if (nav.tab == Tab.HOME || nav.tab == Tab.PERSONAL || nav.tab == Tab.GROUPS) {
            Box(
                Modifier.align(Alignment.BottomEnd).padding(end = 20.dp, bottom = max(insets.bottom, 8.dp) + 62.dp)
                    .press {
                        val groups = store.s.groups
                        if (nav.tab == Tab.GROUPS) {
                            if (groups.isEmpty()) nav.push(NewGroup) else nav.push(Split(groupId = groups[0].id))
                        } else {
                            nav.push(Add)
                        }
                    }
                    .size(56.dp).background(c.acc, CircleShape),
                contentAlignment = Alignment.Center,
            ) { Icon("plus", 28, c.accFg) }
        }
    }
}
