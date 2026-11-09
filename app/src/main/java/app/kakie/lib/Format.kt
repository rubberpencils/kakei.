package app.kakie.lib

import android.icu.text.DateFormat
import android.icu.util.ULocale
import java.time.Instant
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.OffsetDateTime
import java.time.ZoneId
import java.util.Date
import kotlin.math.abs
import kotlin.random.Random

private val MONTHS = listOf(
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
)
private val MONS = listOf("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")

/** JavaScript's Math.round: halves go up. */
fun jsRound(n: Double): Long = Math.floor(n + 0.5).toLong()

/** Whole rupees with Indian digit grouping (1,23,456), like toLocaleString('en-IN'). */
fun inr(n: Double): String = groupIndian(jsRound(abs(n)))

fun groupIndian(v: Long): String {
    val s = v.toString()
    if (s.length <= 3) return s
    val head = s.dropLast(3)
    val pairs = head.reversed().chunked(2).joinToString(",").reversed()
    return "$pairs,${s.takeLast(3)}"
}

fun pad(n: Int) = n.toString().padStart(2, '0')

/** JavaScript's String(number): no ".0" on whole numbers. */
fun jsNum(d: Double): String = if (d % 1.0 == 0.0 && abs(d) < 1e15) d.toLong().toString() else d.toString()

/** Parses the app's timestamps the way `new Date(iso)` does: zoned strings as instants, bare ones as local time. */
fun parseAt(iso: String): LocalDateTime =
    runCatching { LocalDateTime.parse(iso) }
        .recoverCatching { OffsetDateTime.parse(iso).atZoneSameInstant(ZoneId.systemDefault()).toLocalDateTime() }
        .recoverCatching { LocalDate.parse(iso).atStartOfDay() }
        .getOrElse { LocalDateTime.now() }

fun nowIso(): String = Instant.now().toString()

fun dayKey(iso: String): String = dayKey(parseAt(iso).toLocalDate())

fun dayKey(d: LocalDate): String = "${d.year}-${pad(d.monthValue)}-${pad(d.dayOfMonth)}"

fun localNoon(y: Int, m: Int, day: Int) = "$y-${pad(m)}-${pad(day)}T12:00:00"

fun monthName(m: Int, short: Boolean = false) = (if (short) MONS else MONTHS).getOrElse(m - 1) { "" }

/** Formats like Intl with the en-IN locale, e.g. skeleton "EEEdMMM" gives "Sat, 19 Sept". */
fun enIn(skeleton: String, at: LocalDateTime): String {
    val date = Date.from(at.atZone(ZoneId.systemDefault()).toInstant())
    return DateFormat.getInstanceForSkeleton(skeleton, ULocale("en_IN")).format(date)
}

fun prettyDay(iso: String, now: LocalDate = LocalDate.now()): String {
    val d = parseAt(iso)
    if (d.toLocalDate() == now) return "Today"
    if (d.toLocalDate() == now.minusDays(1)) return "Yesterday"
    return enIn("EEEdMMM", d)
}

fun initials(name: String): String {
    val parts = name.trim().split(Regex("\\s+")).filter { it.isNotEmpty() }
    if (parts.isEmpty()) return "YO"
    if (parts.size == 1) return parts[0].take(2).uppercase()
    return "${parts.first()[0]}${parts.last()[0]}".uppercase()
}

fun uid(): String {
    val chars = "0123456789abcdefghijklmnopqrstuvwxyz"
    val rand = (1..8).map { chars[Random.nextInt(chars.length)] }.joinToString("")
    return rand + java.lang.Long.toString(System.currentTimeMillis(), 36)
}

fun slugTag(raw: String) = raw.trim().lowercase().replace(Regex("[^a-z0-9-]"), "").take(24)
