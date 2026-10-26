package app.kakie.core

private val MONTHS = listOf(
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
)
private val MONS = listOf("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")

/** Half a paisa. Smaller than this is float dust, not money. */
const val dust = 0.005

fun round2(n: Double): Double = kotlin.math.round(n * 100.0) / 100.0

/** Indian grouping. Two fraction digits only when the amount has paise. */
fun inr(n: Double): String {
    val v = round2(kotlin.math.abs(n))
    val paise = kotlin.math.round(v * 100.0).toLong() % 100L != 0L
    val body = if (paise) {
        val scaled = kotlin.math.round(v * 100.0).toLong()
        val whole = scaled / 100
        val frac = (scaled % 100).toString().padStart(2, '0')
        "${groupIn(whole)}.$frac"
    } else groupIn(v.toLong())
    return body
}

fun inrExact(n: Double) = inr(n)

fun money(n: Double, sign: Boolean = false): String {
    val body = "₹${inr(n)}"
    if (!sign) return body
    return if (n < 0) "−$body" else "+$body"
}

private fun groupIn(n: Long): String {
    val s = n.toString()
    if (s.length <= 3) return s
    val head = s.dropLast(3)
    val tail = s.takeLast(3)
    val grouped = head.reversed().chunked(2).joinToString(",").reversed()
    return "$grouped,$tail"
}

fun pad(n: Int) = n.toString().padStart(2, '0')

fun dayKey(iso: String): String {
    if (iso.length >= 10 && iso[4] == '-' && iso[7] == '-') return iso.substring(0, 10)
    return iso
}

fun localNoon(y: Int, m: Int, day: Int) = "$y-${pad(m)}-${pad(day)}T12:00:00"

fun monthName(m: Int, short: Boolean = false) = (if (short) MONS else MONTHS).getOrElse(m - 1) { "" }

fun initials(name: String): String {
    val parts = name.trim().split(Regex("\\s+")).filter { it.isNotEmpty() }
    if (parts.isEmpty()) return "YO"
    if (parts.size == 1) return parts[0].take(2).uppercase()
    return (parts[0].take(1) + parts.last().take(1)).uppercase()
}

fun uid(): String {
    val alphabet = "0123456789abcdefghijklmnopqrstuvwxyz"
    return buildString {
        repeat(8) { append(alphabet.random()) }
        append(System.currentTimeMillis().toString(36))
    }
}

fun slugTag(raw: String) = raw.trim().lowercase().replace(Regex("[^a-z0-9-]"), "").take(24)
