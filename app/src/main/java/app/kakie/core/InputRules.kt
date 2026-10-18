package app.kakie.core

/** Digits and one dot, at most two paise. `007` is `7`. `0.5` keeps its zero. */
fun cleanAmount(raw: String): String {
    var v = raw.replace(Regex("[^0-9.]"), "")
    val dot = v.indexOf('.')
    if (dot >= 0) v = v.substring(0, dot + 1) + v.substring(dot + 1).replace(".", "").take(2)
    if (v.length > 1 && v.startsWith("0") && v.getOrNull(1) != '.') v = v.replace(Regex("^0+"), "").ifEmpty { "0" }
    return v.take(10)
}

/** Whole rupees. */
fun cleanNumber(raw: String) = raw.replace(Regex("\\D"), "").replace(Regex("^0+(?=\\d)"), "").take(9)

/** A phone. One leading plus, then digits. */
fun cleanPhone(raw: String): String {
    val plus = raw.trim().startsWith("+")
    val digits = raw.replace(Regex("\\D"), "").take(15)
    return if (plus) "+$digits" else digits
}
