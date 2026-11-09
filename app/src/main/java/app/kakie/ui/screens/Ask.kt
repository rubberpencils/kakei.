package app.kakie.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import app.kakie.ui.Back
import app.kakie.ui.Body
import app.kakie.ui.Button
import app.kakie.ui.Field
import app.kakie.ui.Fonts
import app.kakie.ui.LocalInsets
import app.kakie.ui.LocalStore
import app.kakie.ui.Txt
import app.kakie.ui.Word
import app.kakie.ui.c
import kotlinx.coroutines.launch

@Composable
fun AskScreen() {
    val store = LocalStore.current
    val insets = LocalInsets.current
    val scope = rememberCoroutineScope()
    var q by remember { mutableStateOf("") }
    var answer by remember { mutableStateOf("") }
    var note by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }
    Column(
        Modifier.fillMaxSize().background(c.bg).verticalScroll(rememberScrollState())
            .padding(top = insets.top + 4.dp, start = 24.dp, end = 24.dp, bottom = insets.bottom + 24.dp),
    ) {
        Back()
        Word("Ask", 32, Modifier.padding(top = 16.dp))
        Body(
            "The question and the numbers a tool returns are sent to Google. SMS text is not. This uses the paid API, and it shares a limit of 30 answers a month with the Sunday digest.",
            Modifier.padding(top = 10.dp), c.mut, lineHeight = 22,
        )
        if (store.s.askOk) {
            Column(Modifier.padding(top = 28.dp)) {
                Field("Question", q, { q = it }, "What did I spend on food?")
                if (answer.isNotEmpty()) Txt(answer, Fonts.body, 15, c.fg, Modifier.padding(top = 16.dp), lineHeight = 22)
                if (note != null) Txt(note!!, Fonts.body, 14, c.neg, Modifier.padding(top = 8.dp))
            }
        }
        Button(if (busy) "One sec" else if (store.s.askOk) "Ask" else "Allow Ask", {
            scope.launch {
                busy = true
                note = null
                if (store.s.askOk) {
                    val question = q.trim()
                    if (question.isNotEmpty()) runCatching { answer = store.askQuestion(question) }.onFailure { note = it.message }
                } else note = store.allowAsk()
                busy = false
            }
        }, disabled = busy)
    }
}
