package app.kakie.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import app.kakie.lib.Person
import app.kakie.lib.equalShares
import app.kakie.lib.inr
import app.kakie.lib.percentShares
import app.kakie.lib.round2
import app.kakie.lib.uid
import app.kakie.ui.Back
import app.kakie.ui.Button
import app.kakie.ui.Chip
import app.kakie.ui.Fonts
import app.kakie.ui.Haptic
import app.kakie.ui.Icon
import app.kakie.ui.Input
import app.kakie.ui.LocalInsets
import app.kakie.ui.LocalNav
import app.kakie.ui.LocalStore
import app.kakie.ui.QuickSplitR
import app.kakie.ui.Txt
import app.kakie.ui.Word
import app.kakie.ui.buzz
import app.kakie.ui.c
import app.kakie.ui.press
import app.kakie.ui.ts
import kotlin.math.abs

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun QuickSplitScreen(route: QuickSplitR) {
    val store = LocalStore.current
    val s = store.s
    val nav = LocalNav.current
    val insets = LocalInsets.current
    val source = route.expenseId?.let { id -> s.expenses.find { it.id == id } }
    val draft = route.draftId?.let { id -> s.queue.find { it.id == id } }
    val fixed = source != null || draft != null
    if (route.expenseId != null && source == null && draft == null) {
        Column(Modifier.fillMaxSize().background(c.bg).padding(24.dp).padding(top = insets.top)) {
            Back()
            Word("That expense is gone", 24)
        }
        return
    }
    var desc by rememberSaveable { mutableStateOf(source?.merchant ?: draft?.merchant ?: "") }
    var amt by rememberSaveable { mutableStateOf(source?.amount?.toString() ?: draft?.amount?.toString() ?: "") }
    var picked by rememberSaveable { mutableStateOf(listOf<String>()) }
    var names by rememberSaveable { mutableStateOf(s.people.filter { it.id != s.you.id }.associate { it.id to it.name }) }
    var newName by rememberSaveable { mutableStateOf("") }
    var payer by rememberSaveable { mutableStateOf(s.you.id) }
    var mode by rememberSaveable { mutableStateOf("equal") }
    var off by rememberSaveable { mutableStateOf(setOf<String>()) }
    var exact by rememberSaveable { mutableStateOf(mapOf<String, String>()) }
    var pct by rememberSaveable { mutableStateOf(mapOf<String, String>()) }
    var tag by rememberSaveable { mutableStateOf(source?.tag ?: route.tag) }

    val you = Person(s.you.id, "You", s.you.initials)
    val known = names.map { (id, name) -> Person(id, name, name.take(2).uppercase()) }
    val members = listOf(you) + picked.mapNotNull { id -> if (id == s.you.id) you else known.find { it.id == id } }
    val included = members.filter { it.id !in off }
    val amount = amt.toDoubleOrNull() ?: 0.0
    val pctOf = { id: String -> pct[id]?.toDoubleOrNull() ?: round2(100.0 / included.size.coerceAtLeast(1)) }
    val shares = when (mode) {
        "percent" -> percentShares(amount, included.associate { it.id to pctOf(it.id) })
        "exact" -> included.associate { it.id to (exact[it.id]?.toDoubleOrNull() ?: 0.0) }
        else -> equalShares(amount, included.map { it.id })
    }
    val sum = shares.values.sum()
    val pctSum = included.sumOf { pctOf(it.id) }
    val balanced = mode == "equal" || (if (mode == "exact") abs(sum - amount) < 0.005 else abs(pctSum - 100) < 0.5)
    val ok = amount > 0 && picked.isNotEmpty() && included.isNotEmpty() && balanced && (fixed || desc.isNotBlank())

    Column(
        Modifier.fillMaxSize().background(c.bg).verticalScroll(rememberScrollState())
            .padding(top = insets.top + 4.dp, start = 24.dp, end = 24.dp, bottom = insets.bottom + 24.dp),
    ) {
        Back()
        Word("Quick split", 28)
        Txt("Share one bill with a few people. Only your part counts as your spend.", Fonts.body, 13, c.mut, Modifier.padding(top = 6.dp), lineHeight = 19)
        Input(desc, { desc = it }, ts(Fonts.medium, 18, c.fg), Modifier.fillMaxWidth().padding(top = 16.dp), placeholder = "What was it for?", caps = KeyboardCapitalization.Sentences)
        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(top = 12.dp)) {
            Txt("₹", Fonts.display, 30, c.mut)
            Input(
                amt, { if (!fixed) amt = it.filter { ch -> ch.isDigit() || ch == '.' } },
                ts(Fonts.display, 48, c.fg), Modifier.weight(1f), placeholder = "0", keyboard = KeyboardType.Decimal, enabled = !fixed,
            )
        }
        Txt("WITH", Fonts.medium, 12, c.mut, Modifier.padding(top = 22.dp, bottom = 8.dp), spacing = 1)
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            known.forEach { w ->
                val on = w.id in picked
                Chip(w.name, on, {
                    picked = if (on) picked - w.id else picked + w.id
                    if (payer == w.id && on) payer = s.you.id
                })
            }
        }
        Row(Modifier.padding(top = 10.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Input(newName, { newName = it }, ts(Fonts.body, 15, c.fg), Modifier.weight(1f), placeholder = "Add someone by name", caps = KeyboardCapitalization.Words)
            Box(Modifier.press {
                val n = newName.trim()
                if (n.isEmpty()) return@press
                val id = uid()
                names = names + (id to n)
                picked = picked + id
                newName = ""
                buzz()
            }.size(40.dp).background(c.acc, CircleShape), contentAlignment = Alignment.Center) { Icon("plus", 20, c.accFg) }
        }
        if (picked.isNotEmpty()) {
            Txt("PAID BY", Fonts.medium, 12, c.mut, Modifier.padding(top = 22.dp, bottom = 8.dp), spacing = 1)
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                members.forEach { m -> Chip(m.name, payer == m.id, { payer = m.id }) }
            }
            Row(Modifier.padding(top = 20.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Chip("Equally", mode == "equal", { mode = "equal" })
                Chip("Exact", mode == "exact", { mode = "exact" })
                Chip("Percent", mode == "percent", { mode = "percent" })
            }
            members.forEach { m ->
                val on = m.id !in off
                Row(Modifier.fillMaxWidth().padding(vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                    Txt(m.name, Fonts.medium, 15, if (on) c.fg else c.mut, Modifier.weight(1f).press { off = if (on) off + m.id else off - m.id })
                    Txt("₹${inr(shares[m.id] ?: 0.0)}", Fonts.displaySm, 16, if (on) c.fg else c.mut)
                }
            }
        }
        Box(Modifier.padding(top = 24.dp)) {
            Button("Save split", {
                if (!ok) return@Button
                buzz(Haptic.DONE)
                val people = picked.mapNotNull { id -> names[id]?.let { Person(id, it, it.take(2).uppercase()) } }
                val id = store.quickSplit(source?.id, draft?.id, if (fixed) null else amount, desc, people, payer, shares, tag)
                store.flash(if (id.isNotEmpty()) "Split saved" else "Could not split that")
                nav.back()
            }, disabled = !ok)
        }
    }
}
