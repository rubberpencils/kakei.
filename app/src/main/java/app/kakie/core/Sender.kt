package app.kakie.core

/** A personal number is digits only, 8 to 15 long, after spaces and one leading + are removed. */
fun isPersonalSender(address: String): Boolean {
    val cleaned = address.replace(Regex("\\s"), "").replace(Regex("^\\+"), "")
    return cleaned.length in 8..15 && cleaned.all { it.isDigit() }
}
