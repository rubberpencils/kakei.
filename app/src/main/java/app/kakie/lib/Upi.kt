package app.kakie.lib

import java.util.Locale

val VPA = Regex("^[a-z0-9][a-z0-9._-]{1,63}@[a-z][a-z0-9]{1,31}$")

enum class PayStatus { SUCCESS, PENDING, FAILED, CANCELLED, NO_APP, UNKNOWN, UNSUPPORTED }

fun cleanVpa(raw: String): String? {
    val v = raw.trim().lowercase()
    return if (VPA.matches(v)) v else null
}

fun maskVpa(vpa: String): String {
    val user = vpa.substringBefore("@")
    val host = vpa.substringAfter("@", "")
    return "${user.take(2)}${"•".repeat((user.length - 2).coerceIn(2, 6))}@$host"
}

/** JavaScript's encodeURIComponent. */
fun encodeUriComponent(s: String): String {
    val keep = "-_.!~*'()"
    val out = StringBuilder()
    for (b in s.toByteArray(Charsets.UTF_8)) {
        val c = b.toInt().toChar()
        if (b >= 0 && (c.isLetterOrDigit() || c in keep)) out.append(c)
        else out.append('%').append(String.format(Locale.US, "%02X", b.toInt() and 0xff))
    }
    return out.toString()
}

// Person-to-person link only: merchant fields like tr make GPay and others refuse the payment.
fun upiLink(vpa: String, amount: Double, note: String): String {
    // pa stays raw: some apps don't decode %40, and a validated VPA has no characters that need escaping.
    val q = listOf(
        "am" to String.format(Locale.US, "%.2f", amount),
        "cu" to "INR",
        "tn" to note.take(60),
    )
    return "upi://pay?pa=$vpa&" + q.joinToString("&") { (k, v) -> "$k=${encodeUriComponent(v)}" }
}

fun readUpiResponse(raw: String): PayStatus {
    if (raw == "NO_APP") return PayStatus.NO_APP
    if (raw.isEmpty()) return PayStatus.CANCELLED
    val status = Regex("(?:^|&)status=([a-z]+)", RegexOption.IGNORE_CASE).find(raw)?.groupValues?.get(1)?.lowercase()
    return when (status) {
        "success" -> PayStatus.SUCCESS
        "submitted", "pending" -> PayStatus.PENDING
        else -> PayStatus.FAILED
    }
}
