package app.kakie.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import app.kakie.lib.Expense
import app.kakie.lib.Rail
import app.kakie.lib.groupIndian
import app.kakie.lib.localNoon
import app.kakie.lib.nowIso
import app.kakie.ui.Fonts
import app.kakie.ui.Haptic
import app.kakie.ui.Icon
import app.kakie.ui.Input
import app.kakie.ui.Label
import app.kakie.ui.LocalInsets
import app.kakie.ui.LocalNav
import app.kakie.ui.LocalStore
import app.kakie.ui.TagPicker
import app.kakie.ui.Toggle
import app.kakie.ui.Txt
import app.kakie.ui.buzz
import app.kakie.ui.c
import app.kakie.ui.drawBottomLine
import app.kakie.ui.drawTopLine
import app.kakie.ui.press
import app.kakie.ui.ts
import java.time.LocalDate

private val RAILS = listOf(Rail.UPI, Rail.CREDIT, Rail.DEBIT, Rail.CASH)
private val KEYS = listOf("1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "del")

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun AddScreen() {
    val store = LocalStore.current
    val nav = LocalNav.current
    val insets = LocalInsets.current
    var kind by rememberSaveable { mutableStateOf("exp") }
    var amt by rememberSaveable { mutableStateOf("") }
    var note by rememberSaveable { mutableStateOf("") }
    var tag by rememberSaveable { mutableStateOf<String?>(null) }
    var rail by rememberSaveable { mutableStateOf(Rail.UPI) }
    LaunchedEffect(Unit) {
        if (store.openRail == "cash") {
            rail = Rail.CASH
            store.openRail = null
        }
    }
    var rec by rememberSaveable { mutableStateOf(false) }
    var freq by rememberSaveable { mutableStateOf("monthly") }
    var bill by rememberSaveable { mutableStateOf(false) }
    var daysAgo by rememberSaveable { mutableIntStateOf(0) }

    fun push(k: String) {
        val v = amt
        amt = when {
            k == "del" -> v.dropLast(1)
            k == "." -> if ("." in v) v else "${v.ifEmpty { "0" }}."
            "." in v && v.substringAfter(".").length >= 2 -> v
            v.replace(".", "").length >= 7 -> v
            v == "0" -> k
            else -> v + k
        }
    }

    fun save() {
        val amount = amt.toDoubleOrNull() ?: 0.0
        if (amount == 0.0) return
        val at = LocalDate.now().minusDays(daysAgo.toLong())
        buzz(Haptic.DONE)
        store.addExpense(
            Expense(
                id = "",
                merchant = note.trim().ifEmpty { if (kind == "inc") "Income" else "Expense" },
                amount = amount,
                at = if (daysAgo != 0) localNoon(at.year, at.monthValue, at.dayOfMonth) else nowIso(),
                tag = tag,
                rail = rail,
                income = kind == "inc",
                transfer = kind == "exp" && bill,
                recurring = if (rec) freq else null,
                recurId = if (rec) "r${System.currentTimeMillis()}" else null,
            ),
        )
        nav.back()
    }

    val whole = amt.substringBefore(".").ifEmpty { "0" }.toLongOrNull() ?: 0L
    val shown = if (amt.isNotEmpty()) groupIndian(whole) + (if ("." in amt) ".${amt.substringAfter(".")}" else "") else "0"

    Column(Modifier.fillMaxSize().background(c.bg).padding(top = insets.top, bottom = insets.bottom)) {
        Row(Modifier.fillMaxWidth().height(52.dp).padding(horizontal = 12.dp), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.press { nav.back() }.size(44.dp), contentAlignment = Alignment.Center) { Icon("close", 24) }
            Row(Modifier.background(c.sub, RoundedCornerShape(18.dp)).padding(3.dp)) {
                listOf("exp", "inc").forEach { k ->
                    Box(
                        Modifier.press { kind = k }.height(30.dp).background(if (kind == k) c.acc else Color.Transparent, RoundedCornerShape(15.dp)).padding(horizontal = 16.dp),
                        contentAlignment = Alignment.Center,
                    ) { Txt(if (k == "exp") "Expense" else "Income", Fonts.medium, 13, if (kind == k) c.accFg else c.fg) }
                }
            }
            Box(Modifier.width(44.dp))
        }
        Column(Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(start = 24.dp, end = 24.dp, bottom = 16.dp)) {
            Txt("₹$shown", Fonts.display, 56, if (kind == "inc") c.pos else c.fg, Modifier.fillMaxWidth(), align = TextAlign.Center)
            Input(
                note, { note = it }, ts(Fonts.medium, 16, c.fg, align = TextAlign.Center),
                Modifier.fillMaxWidth().padding(top = 8.dp).drawBottomLine(c.faint, 1.dp).padding(vertical = 8.dp),
                placeholder = "What was it for?",
                contentAlignment = Alignment.Center,
            )
            Row(Modifier.fillMaxWidth().padding(top = 14.dp), horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.CenterHorizontally)) {
                listOf("Today", "Yesterday", "2 days ago").forEachIndexed { i, label ->
                    Box(
                        Modifier.press { daysAgo = i }.height(30.dp).background(if (daysAgo == i) c.acc else c.sub, RoundedCornerShape(15.dp)).padding(horizontal = 12.dp),
                        contentAlignment = Alignment.Center,
                    ) { Txt(label, Fonts.medium, 12.5, if (daysAgo == i) c.accFg else c.fg) }
                }
            }
            Label("Tag", Modifier.padding(top = 18.dp, bottom = 10.dp))
            TagPicker(tag) { tag = it }
            Label("Paid with", Modifier.padding(top = 18.dp, bottom = 10.dp))
            Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                RAILS.forEach { id ->
                    val on = rail == id
                    Row(
                        Modifier.press { rail = id }.height(34.dp)
                            .background(if (on) c.acc else Color.Transparent, RoundedCornerShape(17.dp))
                            .border(1.dp, if (on) c.acc else c.line, RoundedCornerShape(17.dp)).padding(horizontal = 12.dp),
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Icon(id.icon, 16, if (on) c.accFg else c.fg)
                        Txt(id.label, Fonts.medium, 13, if (on) c.accFg else c.fg)
                    }
                }
            }
            if (kind == "exp") {
                Row(Modifier.fillMaxWidth().padding(top = 18.dp), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                    Txt("Credit card bill", Fonts.medium, 14.5, c.fg)
                    Toggle(bill) { bill = !bill }
                }
            }
            Row(Modifier.fillMaxWidth().padding(top = 16.dp), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                Txt("Repeat", Fonts.medium, 14.5, c.fg)
                Toggle(rec) { rec = !rec }
            }
            if (rec) {
                Row(Modifier.padding(top = 12.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    listOf("weekly", "monthly").forEach { f ->
                        Box(
                            Modifier.weight(1f).press { freq = f }.height(34.dp)
                                .background(if (freq == f) c.acc else Color.Transparent, RoundedCornerShape(17.dp))
                                .border(1.dp, if (freq == f) c.acc else c.line, RoundedCornerShape(17.dp)),
                            contentAlignment = Alignment.Center,
                        ) { Txt(f, Fonts.medium, 14, if (freq == f) c.accFg else c.fg) }
                    }
                }
            }
        }
        Column(Modifier.fillMaxWidth().drawTopLine(c.faint, 1.dp).padding(start = 16.dp, end = 16.dp, bottom = 16.dp)) {
            FlowRow(Modifier.fillMaxWidth(), maxItemsInEachRow = 3) {
                KEYS.forEach { k ->
                    Box(Modifier.weight(1f).press { push(k) }.height(48.dp), contentAlignment = Alignment.Center) {
                        if (k == "del") Icon("backspace-outline", 22) else Txt(k, Fonts.displaySm, 24, c.fg)
                    }
                }
            }
            Box(
                Modifier.fillMaxWidth().press { save() }.alpha(if ((amt.toDoubleOrNull() ?: 0.0) > 0) 1f else 0.4f)
                    .height(52.dp).background(c.acc, RoundedCornerShape(26.dp)),
                contentAlignment = Alignment.Center,
            ) { Txt(if (bill) "Save card bill" else if (kind == "inc") "Save income" else "Save expense", Fonts.semi, 16, c.accFg) }
        }
    }
}
