package app.kakie.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import app.kakie.lib.Expense
import app.kakie.lib.Rail
import app.kakie.lib.equalShares
import app.kakie.lib.inr
import app.kakie.lib.jsNum
import app.kakie.lib.nowIso
import app.kakie.lib.percentShares
import app.kakie.lib.round2
import app.kakie.ui.Back
import app.kakie.ui.Button
import app.kakie.ui.Checkbox
import app.kakie.ui.Chip
import app.kakie.ui.Fonts
import app.kakie.ui.Haptic
import app.kakie.ui.Input
import app.kakie.ui.Label
import app.kakie.ui.LocalInsets
import app.kakie.ui.LocalNav
import app.kakie.ui.LocalStore
import app.kakie.ui.NewGroup
import app.kakie.ui.Split
import app.kakie.ui.TagPicker
import app.kakie.ui.Txt
import app.kakie.ui.Word
import app.kakie.ui.buzz
import app.kakie.ui.c
import app.kakie.ui.drawBottomLine
import app.kakie.ui.press
import app.kakie.ui.ts
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.roundToInt

private fun numeric(v: String) = v.filter { it.isDigit() || it == '.' }

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun SplitScreen(route: Split) {
    val store = LocalStore.current
    val s = store.s
    val nav = LocalNav.current
    val insets = LocalInsets.current
    var groupParam by rememberSaveable { mutableStateOf(route.groupId) }
    val editing = route.expenseId?.let { id -> s.expenses.find { it.id == id } }
    val draft = route.draftId?.let { id -> s.queue.find { it.id == id } }
    val group = s.groups.find { it.id == (editing?.groupId ?: groupParam) } ?: s.groups.firstOrNull()
    val members = if (group != null) listOf(s.you.id) + group.memberIds else listOf(s.you.id)
    var desc by rememberSaveable { mutableStateOf(editing?.merchant ?: draft?.merchant ?: "") }
    var amt by rememberSaveable { mutableStateOf(editing?.let { jsNum(it.amount) } ?: draft?.let { jsNum(it.amount) } ?: "") }
    var payer by rememberSaveable { mutableStateOf(editing?.payerId ?: s.you.id) }
    var mode by rememberSaveable { mutableStateOf(if (editing != null) "exact" else "equal") }
    var on by rememberSaveable { mutableStateOf(members.associateWith { id -> if (editing != null) (editing.shares?.get(id) ?: 0.0) != 0.0 else true }) }
    var exact by rememberSaveable { mutableStateOf(editing?.shares?.mapValues { jsNum(it.value) } ?: emptyMap()) }
    var pct by rememberSaveable { mutableStateOf(mapOf<String, String>()) }
    var reflect by rememberSaveable { mutableStateOf(editing?.reflect ?: route.reflect) }
    var tag by rememberSaveable { mutableStateOf(editing?.tag ?: route.tag?.ifEmpty { null }) }
    var multiPaid by rememberSaveable { mutableStateOf(!editing?.payers.isNullOrEmpty()) }
    var paid by rememberSaveable { mutableStateOf(editing?.payers?.associate { it.id to jsNum(it.amount) } ?: emptyMap()) }
    var itemText by rememberSaveable { mutableStateOf(editing?.items?.joinToString("\n") { "${it.name}|${jsNum(it.amount)}" } ?: "") }

    if (group == null) {
        Column(Modifier.fillMaxSize().background(c.bg).padding(start = 24.dp, end = 24.dp, bottom = 24.dp, top = insets.top + 8.dp)) {
            Back()
            Word("Make a group first", 24)
            Box(Modifier.padding(top = 16.dp).press { nav.replace(NewGroup) }) { Txt("New group", Fonts.medium, 14, c.fg) }
        }
        return
    }

    val amount = amt.toDoubleOrNull() ?: 0.0
    fun isOn(id: String) = on[id] ?: true
    val included = members.filter(::isOn)
    fun pctOf(id: String) = pct[id]?.let { it.toDoubleOrNull() ?: 0.0 } ?: round2(100.0 / max(1, included.size))
    val shares = when (mode) {
        "equal" -> equalShares(amount, included)
        "percent" -> percentShares(amount, included.associateWith(::pctOf))
        else -> included.associateWith { exact[it]?.toDoubleOrNull() ?: 0.0 }
    }
    val sum = shares.values.sum()
    val pctSum = included.sumOf(::pctOf)
    val payers = if (multiPaid) members.map { id -> app.kakie.lib.SharePayer(id, paid[id]?.toDoubleOrNull() ?: 0.0) }.filter { it.amount > 0 } else null
    val itemRows = itemText.lines().mapNotNull { line ->
        val name = line.substringBefore("|").trim()
        val value = line.substringAfter("|", "").toDoubleOrNull() ?: return@mapNotNull null
        if (name.isEmpty() || value <= 0) null else app.kakie.lib.LineItem(name, value, included)
    }
    val paidOk = payers == null || abs(payers.sumOf { it.amount } - amount) < 0.5
    val itemsOk = itemRows.isEmpty() || abs(itemRows.sumOf { it.amount } - amount) < 0.5
    val lead = payers?.maxByOrNull { it.amount }?.id ?: payer
    val balanced = mode == "equal" || (if (mode == "exact") abs(sum - amount) < 0.5 else abs(pctSum - 100) < 0.5)
    val ok = amount > 0 && included.isNotEmpty() && balanced && paidOk && itemsOk
    fun name(id: String) = if (id == s.you.id) "You" else s.people.find { it.id == id }?.name ?: "Someone"
    val status = when {
        included.isEmpty() -> "Pick at least one person"
        mode == "exact" && !balanced -> "₹${inr(abs(amount - sum))} ${if (sum < amount) "unassigned" else "over"}"
        mode == "percent" && !balanced -> "${abs(100 - pctSum).roundToInt()}% ${if (pctSum < 100) "unassigned" else "over"}"
        else -> "Adds up"
    }

    fun save() {
        if (!ok) return
        buzz(Haptic.DONE)
        when {
            editing != null -> {
                store.updateExpense(editing.copy(merchant = desc.trim().ifEmpty { editing.merchant }, amount = amount, tag = tag, payerId = lead, shares = shares, reflect = reflect, payers = payers, items = itemRows.ifEmpty { null }))
                store.flash("Split updated")
            }
            draft != null -> {
                store.confirmDraft(draft.id, tag, group.id, reflect, shares, lead, payers, itemRows.ifEmpty { null })
                store.flash("Split saved")
            }
            else -> store.addExpense(
                Expense(
                    id = "", merchant = desc.trim().ifEmpty { "Group expense" }, amount = amount, at = nowIso(), tag = tag, rail = Rail.UPI,
                    groupId = group.id, payerId = lead, shares = shares, reflect = reflect, payers = payers, items = itemRows.ifEmpty { null },
                ),
            )
        }
        nav.back()
    }

    Column(
        Modifier.fillMaxSize().background(c.bg).verticalScroll(rememberScrollState())
            .padding(top = insets.top + 4.dp, start = 24.dp, end = 24.dp, bottom = insets.bottom + 24.dp),
    ) {
        Back()
        Word(group.name, 28)
        if (editing == null && draft == null && s.groups.size > 1) {
            Row(Modifier.padding(top = 12.dp).horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                s.groups.forEach { g -> Chip(g.name, g.id == group.id, { groupParam = g.id }) }
            }
        }
        Input(
            desc, { desc = it }, ts(Fonts.medium, 18, c.fg),
            Modifier.padding(top = 16.dp).fillMaxWidth().drawBottomLine(c.faint, 1.dp).padding(vertical = 8.dp),
            placeholder = "What was it for?",
        )
        Row(Modifier.padding(top = 12.dp), verticalAlignment = Alignment.CenterVertically) {
            Txt("₹", Fonts.display, 30, c.mut)
            Input(
                amt, { amt = numeric(it) }, ts(Fonts.display, 48, c.fg), Modifier.weight(1f),
                placeholder = "0", placeholderColor = c.bar, keyboard = KeyboardType.Decimal, enabled = draft == null,
            )
        }
        Label("Paid by", Modifier.padding(top = 16.dp, bottom = 8.dp))
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            members.forEach { id -> Chip(name(id), payer == id, { payer = id }) }
        }
        Box(Modifier.padding(top = 12.dp).press { multiPaid = !multiPaid }) {
            Txt(if (multiPaid) "One person paid" else "More than one person paid", Fonts.medium, 13, c.acc)
        }
        if (multiPaid) {
            members.forEach { id ->
                Row(Modifier.padding(top = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                    Txt(name(id), Fonts.body, 14, c.fg, Modifier.weight(1f))
                    Input(paid[id] ?: "", { paid = paid + (id to numeric(it)) }, ts(Fonts.displaySm, 16, c.fg, align = TextAlign.End), Modifier.width(90.dp), placeholder = "0", keyboard = KeyboardType.Decimal)
                }
            }
        }
        Box(Modifier.padding(top = 14.dp).press { itemText = if (itemText.isEmpty()) "|" else "$itemText\n|" }) {
            Txt("Add an item", Fonts.medium, 13, c.acc)
        }
        if (itemText.isNotEmpty()) {
            Input(itemText, { itemText = it }, ts(Fonts.body, 15, c.fg), Modifier.fillMaxWidth().padding(top = 8.dp), placeholder = "name|amount, one item a line", singleLine = false)
        }
        Row(Modifier.padding(top = 20.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Chip("Equally", mode == "equal", { mode = "equal" })
            Chip("Exact", mode == "exact", { mode = "exact" })
            Chip("Percent", mode == "percent", { mode = "percent" })
        }
        Column(Modifier.padding(top = 12.dp)) {
            members.forEach { id ->
                Row(Modifier.padding(vertical = 8.dp), horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
                    Row(
                        Modifier.weight(1f).press { on = on + (id to !(on[id] ?: true)) },
                        horizontalArrangement = Arrangement.spacedBy(10.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Checkbox(isOn(id))
                        Txt(name(id), Fonts.medium, 14, if (isOn(id)) c.fg else c.mut, Modifier.weight(1f))
                    }
                    when {
                        mode == "exact" && isOn(id) -> Input(
                            exact[id] ?: "", { exact = exact + (id to numeric(it)) }, ts(Fonts.displaySm, 16, c.fg, align = TextAlign.End), Modifier.width(90.dp),
                            placeholder = "0", keyboard = KeyboardType.Decimal, contentAlignment = Alignment.CenterEnd,
                        )
                        mode == "percent" && isOn(id) -> Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                            Txt("₹${inr(shares[id] ?: 0.0)}", Fonts.body, 12, c.mut)
                            Input(
                                pct[id] ?: jsNum(pctOf(id)), { pct = pct + (id to numeric(it)) }, ts(Fonts.displaySm, 16, c.fg, align = TextAlign.End), Modifier.width(54.dp),
                                keyboard = KeyboardType.Decimal, contentAlignment = Alignment.CenterEnd,
                            )
                            Txt("%", Fonts.displaySm, 14, c.mut)
                        }
                        else -> Txt("₹${inr(shares[id] ?: 0.0)}", Fonts.displaySm, 14, if (isOn(id)) c.fg else c.mut)
                    }
                }
            }
        }
        Txt(if (amount > 0) status else "Enter an amount", Fonts.medium, 13, if (ok) c.pos else c.neg, Modifier.padding(top = 6.dp))
        Box(Modifier.padding(top = 18.dp)) { TagPicker(tag) { tag = it } }
        Row(
            Modifier.padding(top = 18.dp, bottom = 22.dp).fillMaxWidth().press { reflect = !reflect },
            horizontalArrangement = Arrangement.spacedBy(10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Checkbox(reflect)
            Txt("Reflect my share in personal expenses", Fonts.body, 14, c.fg, Modifier.weight(1f))
        }
        Button(if (editing != null) "Save changes" else "Save to ${group.name}", ::save, disabled = !ok)
    }
}
