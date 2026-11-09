package app.kakie.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.defaultMinSize
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
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import app.kakie.lib.inr
import app.kakie.ui.Back
import app.kakie.ui.Checkbox
import app.kakie.ui.Chip
import app.kakie.ui.ExpOut
import app.kakie.ui.Fonts
import app.kakie.ui.Haptic
import app.kakie.ui.Icon
import app.kakie.ui.Input
import app.kakie.ui.Label
import app.kakie.ui.LocalInsets
import app.kakie.ui.LocalNav
import app.kakie.ui.LocalReduceMotion
import app.kakie.ui.LocalStore
import app.kakie.ui.NewGroup
import app.kakie.ui.Split
import app.kakie.ui.TagPicker
import app.kakie.ui.Toggle
import app.kakie.ui.Txt
import app.kakie.ui.Word
import app.kakie.ui.buzz
import app.kakie.ui.c
import app.kakie.ui.entering
import app.kakie.ui.fadeInE
import app.kakie.ui.fadeInRightE
import app.kakie.ui.press
import app.kakie.ui.ts

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun ReviewScreen() {
    val store = LocalStore.current
    val s = store.s
    val nav = LocalNav.current
    val insets = LocalInsets.current
    val reduce = LocalReduceMotion.current
    val cur = s.queue.firstOrNull()
    var tag by rememberSaveable { mutableStateOf(cur?.tag) }
    var groupOn by rememberSaveable { mutableStateOf(false) }
    var groupId by rememberSaveable { mutableStateOf(s.groups.firstOrNull()?.id ?: "") }
    var reflect by rememberSaveable { mutableStateOf(true) }
    var paste by rememberSaveable { mutableStateOf("") }
    var seenId by rememberSaveable { mutableStateOf(cur?.id) }

    if (cur != null && cur.id != seenId) {
        seenId = cur.id
        tag = cur.tag
        groupOn = false
    }

    fun confirm() {
        if (cur == null) return
        val gid = groupId.ifEmpty { s.groups.firstOrNull()?.id ?: "" }
        if (groupOn && gid.isNotEmpty()) {
            nav.push(Split(groupId = gid, draftId = cur.id, reflect = reflect, tag = tag))
            return
        }
        buzz(Haptic.DONE)
        store.confirmDraft(cur.id, tag)
        store.flash(if (cur.transfer) "Card bill saved. Not counted as spend." else "Saved")
    }

    Column(Modifier.fillMaxSize().background(c.bg).padding(top = insets.top + 4.dp)) {
        Row(Modifier.fillMaxWidth().height(52.dp).padding(horizontal = 12.dp), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
            Back()
            Txt("Review SMS", Fonts.semi, 16, c.fg)
            Txt(s.queue.size.toString(), Fonts.body, 14, c.mut, Modifier.width(44.dp), align = TextAlign.Center)
        }
        if (cur == null) {
            Column(
                Modifier.fillMaxWidth().weight(1f).padding(horizontal = 32.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center,
            ) {
                Box(Modifier.size(72.dp).background(c.sub, RoundedCornerShape(36.dp)), contentAlignment = Alignment.Center) { Icon("check-all", 32) }
                Word("All caught up", 28, Modifier.padding(top = 22.dp))
                Txt("New messages will appear here as they arrive.", Fonts.body, 14, c.mut, Modifier.padding(top = 8.dp), lineHeight = 21, align = TextAlign.Center)
                Input(
                    paste, { paste = it }, ts(Fonts.mono, 12, c.fg),
                    Modifier.padding(top = 24.dp).fillMaxWidth().defaultMinSize(minHeight = 80.dp).background(c.sub, RoundedCornerShape(14.dp)).padding(12.dp),
                    placeholder = "Paste a bank SMS",
                    singleLine = false,
                    contentAlignment = Alignment.TopStart,
                )
                Box(
                    Modifier.padding(top = 12.dp).press {
                        if (store.ingestText(paste)) {
                            paste = ""
                            store.flash("Parsed")
                        } else {
                            store.flash("That does not look like a bank debit or credit.")
                        }
                    }.height(46.dp).border(1.dp, c.line, RoundedCornerShape(23.dp)).padding(horizontal = 20.dp),
                    contentAlignment = Alignment.Center,
                ) { Txt("Parse message", Fonts.medium, 14, c.fg) }
            }
        } else {
            Column(Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(start = 24.dp, end = 24.dp, bottom = insets.bottom + 32.dp)) {
                Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    s.queue.take(8).forEachIndexed { i, _ ->
                        Box(Modifier.weight(1f).height(3.dp).background(if (i == 0) c.acc else c.bar, RoundedCornerShape(2.dp)))
                    }
                }
                key(cur.id) {
                    Column(Modifier.entering(if (reduce) fadeInE(160) else fadeInRightE(300, easing = ExpOut))) {
                        Column(Modifier.padding(top = 16.dp).fillMaxWidth().background(c.sub, RoundedCornerShape(14.dp)).padding(12.dp)) {
                            Row(Modifier.fillMaxWidth().padding(bottom = 6.dp), horizontalArrangement = Arrangement.SpaceBetween) {
                                Txt(cur.sender, Fonts.mono, 11, c.mut)
                                Txt(cur.bank, Fonts.mono, 11, c.mut)
                            }
                            Txt(cur.body, Fonts.mono, 12, c.mut, lineHeight = 18)
                        }
                        Row(Modifier.fillMaxWidth().padding(top = 24.dp), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.Bottom) {
                            Column(Modifier.weight(1f)) {
                                Txt(cur.merchant, Fonts.semi, 20, c.fg)
                                Row(
                                    Modifier.padding(top = 8.dp).height(26.dp).background(c.sub, RoundedCornerShape(13.dp)).padding(horizontal = 10.dp),
                                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                ) {
                                    Icon(cur.rail.icon, 16)
                                    Txt("${cur.rail.label}${if (cur.transfer) " · card bill" else ""}", Fonts.medium, 12.5, c.fg)
                                }
                            }
                            Txt("${if (cur.income) "+" else "−"}₹${inr(cur.amount)}", Fonts.display, 40, if (cur.income) c.pos else c.fg)
                        }
                        Label("Tag", Modifier.padding(top = 22.dp, bottom = 10.dp))
                        TagPicker(tag) { tag = it }

                        if (!cur.income && !cur.transfer) {
                            Column(Modifier.padding(top = 20.dp).fillMaxWidth().background(c.sub, RoundedCornerShape(16.dp)).padding(16.dp)) {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Column(Modifier.weight(1f).padding(end = 12.dp)) {
                                        Txt("Add to a group split", Fonts.medium, 14.5, c.fg)
                                        Txt("Your share can show up in personal.", Fonts.body, 12.5, c.mut, Modifier.padding(top = 2.dp))
                                    }
                                    Toggle(groupOn) { if (s.groups.isNotEmpty()) groupOn = !groupOn else nav.push(NewGroup) }
                                }
                                if (groupOn) {
                                    Column(Modifier.padding(top = 12.dp)) {
                                        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                            s.groups.forEach { g ->
                                                Chip(g.name, g.id == groupId.ifEmpty { s.groups.firstOrNull()?.id }, { groupId = g.id }, height = 32, size = 13)
                                            }
                                        }
                                        Row(
                                            Modifier.padding(top = 14.dp).press { reflect = !reflect },
                                            horizontalArrangement = Arrangement.spacedBy(10.dp),
                                            verticalAlignment = Alignment.CenterVertically,
                                        ) {
                                            Checkbox(reflect, 20)
                                            Txt("Reflect my share in personal expenses", Fonts.body, 14, c.fg)
                                        }
                                    }
                                }
                            }
                        }
                    }
                }

                Row(Modifier.fillMaxWidth().padding(top = 28.dp), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                    Box(Modifier.press { store.ignoreDraft(cur.id) }) { Txt("Not an expense", Fonts.medium, 14, c.mut) }
                    Spacer(Modifier.weight(1f))
                    Box(
                        Modifier.press { store.skipDraft(cur.id) }.size(52.dp).border(1.dp, c.line, RoundedCornerShape(26.dp)),
                        contentAlignment = Alignment.Center,
                    ) { Icon("redo", 22) }
                    Row(
                        Modifier.press(onPress = ::confirm).height(52.dp).background(c.acc, RoundedCornerShape(26.dp)).padding(horizontal = 22.dp),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Icon("check", 18, c.accFg)
                        Txt("Confirm", Fonts.semi, 15, c.accFg)
                    }
                }
            }
        }
    }
}
