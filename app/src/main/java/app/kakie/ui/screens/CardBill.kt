package app.kakie.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import app.kakie.lib.cardBills
import app.kakie.lib.inr
import app.kakie.lib.prettyDay
import app.kakie.lib.round2
import app.kakie.ui.Back
import app.kakie.ui.Button
import app.kakie.ui.ExpenseR
import app.kakie.ui.Fonts
import app.kakie.ui.Haptic
import app.kakie.ui.Icon
import app.kakie.ui.Input
import app.kakie.ui.LocalInsets
import app.kakie.ui.LocalNav
import app.kakie.ui.LocalStore
import app.kakie.ui.Txt
import app.kakie.ui.Word
import app.kakie.ui.buzz
import app.kakie.ui.c
import app.kakie.ui.drawTopLine
import app.kakie.ui.press
import app.kakie.ui.ts

@Composable
fun CardBillScreen() {
    val store = LocalStore.current
    val nav = LocalNav.current
    val insets = LocalInsets.current
    val cards = cardBills(store.s.expenses, store.s.you.id)
    val total = cards.sumOf { it.due }
    var paying by rememberSaveable { mutableStateOf<String?>(null) }
    var amt by rememberSaveable { mutableStateOf("") }

    Column(
        Modifier.fillMaxSize().background(c.bg).verticalScroll(rememberScrollState())
            .padding(top = insets.top + 4.dp, start = 24.dp, end = 24.dp, bottom = insets.bottom + 32.dp),
    ) {
        Back()
        Word("Credit card bill", 28)
        Txt("₹${inr(total)}", Fonts.display, 52, c.fg, Modifier.padding(top = 20.dp), spacing = -1.5)
        Txt(
            if (cards.isEmpty()) "Nothing due. Pick Credit card under Paid with when you add a spend and it shows up here."
            else "Everything you paid for with a credit card and have not paid off yet.",
            Fonts.body, 14, c.mut, Modifier.padding(top = 4.dp), lineHeight = 20,
        )
        cards.forEach { card ->
            val title = if (card.account != null) "${card.bank ?: "Card"} ••${card.account}" else "Credit card"
            val open = paying == card.key
            val amount = amt.toDoubleOrNull() ?: 0.0
            val over = amount > card.due + 0.005
            Column(Modifier.padding(top = 30.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    Box(Modifier.size(40.dp).background(c.sub, RoundedCornerShape(14.dp)), contentAlignment = Alignment.Center) { Icon("credit-card-outline", 20) }
                    Column(Modifier.weight(1f)) {
                        Txt(title, Fonts.semi, 16, c.fg, lines = 1)
                        Txt(
                            "${card.charges.size} ${if (card.charges.size == 1) "spend" else "spends"}" +
                                (card.lastPaid?.let { ", last paid ${prettyDay(it)}" } ?: ""),
                            Fonts.body, 12.5, c.mut, Modifier.padding(top = 1.dp),
                        )
                    }
                    Txt("₹${inr(card.due)}", Fonts.displaySm, 19, c.fg)
                }
                Column(Modifier.padding(top = 10.dp).drawTopLine(c.faint)) {
                    card.charges.take(8).forEach { e ->
                        Row(
                            Modifier.fillMaxWidth().press { nav.push(ExpenseR(e.id)) }.height(46.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Column(Modifier.weight(1f)) {
                                Txt(e.merchant, Fonts.medium, 14.5, c.fg, lines = 1)
                                Txt(prettyDay(e.at), Fonts.body, 12, c.mut)
                            }
                            Txt("₹${inr(e.amount)}", Fonts.displaySm, 14.5, c.fg)
                        }
                    }
                }
                if (open) {
                    Column(Modifier.padding(top = 18.dp).fillMaxWidth().background(c.sub, RoundedCornerShape(20.dp)).padding(16.dp)) {
                        Txt("PAYING", Fonts.medium, 12, c.mut, spacing = 1)
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Txt("₹", Fonts.display, 30, c.mut)
                            Input(amt, { amt = it.filter { ch -> ch.isDigit() || ch == '.' } }, ts(Fonts.display, 44, if (over) c.neg else c.fg), Modifier.weight(1f), keyboard = KeyboardType.Decimal)
                        }
                        Txt(
                            when {
                                over -> "That is more than the ₹${inr(card.due)} due."
                                amount > 0 && amount < card.due - 0.005 -> "Part payment. ₹${inr(round2(card.due - amount))} stays due."
                                amount > 0 -> "The full bill. Change the number to pay less."
                                else -> "Enter what you paid."
                            },
                            Fonts.body, 13.5, if (over) c.neg else c.mut, Modifier.padding(top = 4.dp), lineHeight = 19,
                        )
                        Button("Confirm ₹${inr(if (amount > 0) amount else 0.0)} paid", {
                            buzz(Haptic.DONE)
                            store.payCardBill(card.bank, card.account, amount)
                            paying = null
                        }, disabled = amount <= 0 || over)
                    }
                } else {
                    Box(Modifier.padding(top = 14.dp)) {
                        Button("Pay ₹${inr(card.due)}", {
                            buzz()
                            paying = card.key
                            amt = card.due.toString()
                        })
                    }
                }
            }
        }
    }
}
