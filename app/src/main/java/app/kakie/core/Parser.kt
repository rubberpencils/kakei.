package app.kakie.core

private val BANKS = listOf(
    Regex("HDFC") to "HDFC",
    Regex("ICICI") to "ICICI",
    Regex("SBI") to "SBI",
    Regex("AXIS") to "Axis",
    Regex("KOTAK|KKBK") to "Kotak",
    Regex("YESBK|YESBNK") to "Yes Bank",
    Regex("PNB|PUNB") to "PNB",
    Regex("IDFCF|IDFC") to "IDFC",
    Regex("BARB|BOB") to "Bank of Baroda",
    Regex("INDB|INDUS") to "IndusInd",
    Regex("UBIN|UNION") to "Union Bank",
    Regex("CANBNK|CANARA") to "Canara",
    Regex("PAYTM") to "Paytm",
)

private val TAGS = listOf(
    Regex("starbucks|cafe|coffee|third wave", RegexOption.IGNORE_CASE) to "coffee",
    Regex("swiggy|zomato|deli|restaurant|canteen|thalassa", RegexOption.IGNORE_CASE) to "food",
    Regex("uber|ola|rapido|namma yatri", RegexOption.IGNORE_CASE) to "transport",
    Regex("amazon|myntra|flipkart|ajio", RegexOption.IGNORE_CASE) to "shopping",
    Regex("blinkit|zepto|bigbasket|instamart|grocery", RegexOption.IGNORE_CASE) to "groceries",
    Regex("netflix|spotify|bookmyshow|hotstar|prime video", RegexOption.IGNORE_CASE) to "entertainment",
    Regex("airtel|jio|vi\\b|electric|bescom|wifi|broadband", RegexOption.IGNORE_CASE) to "bills",
    Regex("petrol|fuel|hpcl|iocl|bpcl|indian oil", RegexOption.IGNORE_CASE) to "fuel",
    Regex("pharmacy|apollo|doctor|hospital|clinic", RegexOption.IGNORE_CASE) to "medical",
    Regex("rent", RegexOption.IGNORE_CASE) to "rent",
    Regex("salary|stipend", RegexOption.IGNORE_CASE) to "salary",
)

private val MONTH = mapOf(
    "jan" to 1, "feb" to 2, "mar" to 3, "apr" to 4, "may" to 5, "jun" to 6,
    "jul" to 7, "aug" to 8, "sep" to 9, "oct" to 10, "nov" to 11, "dec" to 12,
)

private fun titleCase(s: String) = s.lowercase().replace(Regex("\\b[a-z]")) { it.value.uppercase() }

fun cleanMerchant(raw: String): String {
    var t = raw.replace(Regex("\\s+"), " ").replace(Regex("[.,]+$"), "").trim()
    t = t.replace(Regex("^(refund|reversal)\\s+(from|of)\\s+", RegexOption.IGNORE_CASE), "")
    t = t.replace(Regex("\\b(PVT LTD|PRIVATE LIMITED|LTD)\\b.*", RegexOption.IGNORE_CASE), "")
    t = t.replace(Regex("\\bSALARY\\b.*", RegexOption.IGNORE_CASE), "")
    t = t.replace(Regex("\\bPAY IN\\b.*", RegexOption.IGNORE_CASE), "")
    t = t.replace(Regex("\\bUPI\\b", RegexOption.IGNORE_CASE), "")
    t = t.replace(Regex("\\d{6,}"), "")
    t = t.replace(Regex("\\s+"), " ").trim()
    if (t.isEmpty()) return "Payment"
    if (t == t.uppercase()) return titleCase(t)
    return t
}

private fun merchantFrom(body: String): String {
    Regex("vpa\\s+([a-z0-9._-]+)@", RegexOption.IGNORE_CASE).find(body)?.let { vpa ->
        val head = vpa.groupValues[1].split(".")[0].replace(Regex("[^a-zA-Z]"), "")
        if (head.isNotEmpty()) return titleCase(head)
    }
    Regex("NEFT-([A-Z][A-Z0-9 .&-]{2,48})", RegexOption.IGNORE_CASE).find(body)?.let { return cleanMerchant(it.groupValues[1]) }
    Regex("\\bon\\s+([A-Z][A-Z0-9 .&-]{2,40})").find(body)?.let { return cleanMerchant(it.groupValues[1]) }
    Regex("towards\\s+(.+?)(?:\\s+payment|\\.|$)", RegexOption.IGNORE_CASE).find(body)?.let {
        return cleanMerchant(it.groupValues[1].replace(Regex("\\bXX\\d+\\b", RegexOption.IGNORE_CASE), ""))
    }
    Regex("\\bto\\s+([A-Za-z][A-Za-z0-9.&'-]{1,24})", RegexOption.IGNORE_CASE).find(body)?.let { to ->
        if (!Regex("^vpa$", RegexOption.IGNORE_CASE).matches(to.groupValues[1])) return cleanMerchant(to.groupValues[1])
    }
    return "Payment"
}

fun readMoney(text: String): Double? {
    val m = Regex(
        "(?:(?:rs\\.?|inr|₹)\\s*)([0-9][0-9,]*(?:\\.[0-9]{1,2})?)|([0-9]{1,3}(?:,[0-9]{2,3})+(?:\\.[0-9]{1,2})?)|([0-9]+\\.[0-9]{2})(?!\\d)",
        RegexOption.IGNORE_CASE,
    ).find(text) ?: return null
    val raw = m.groupValues.drop(1).firstOrNull { it.isNotEmpty() } ?: return null
    val n = raw.replace(",", "").toDoubleOrNull() ?: return null
    return if (n > 0) n else null
}

fun guessRail(body: String, transfer: Boolean = false): String {
    if (!transfer && Regex("\\sCC\\s").containsMatchIn(body)) return "credit"
    if (Regex("vpa\\b|\\bupi\\b|@[a-z]{2,}", RegexOption.IGNORE_CASE).containsMatchIn(body) &&
        !Regex("spent using", RegexOption.IGNORE_CASE).containsMatchIn(body)
    ) return "upi"
    if (Regex("spent using|credit card", RegexOption.IGNORE_CASE).containsMatchIn(body) && !transfer) return "credit"
    if (Regex("\\bimps\\b", RegexOption.IGNORE_CASE).containsMatchIn(body)) return "imps"
    if (Regex("\\bneft\\b|\\brtgs\\b", RegexOption.IGNORE_CASE).containsMatchIn(body)) return "neft"
    if (Regex("\\bdebit card\\b", RegexOption.IGNORE_CASE).containsMatchIn(body)) return "debit"
    return "debit"
}

private fun suggestTag(merchant: String, income: Boolean, transfer: Boolean): String? {
    if (transfer) return "bills"
    if (income) return "salary"
    val hay = merchant.lowercase()
    return TAGS.firstOrNull { it.first.containsMatchIn(hay) }?.second
}

private fun parseWhen(body: String): String? {
    val m = Regex("(\\d{1,2})[-/](\\d{1,2}|[A-Za-z]{3})[-/](\\d{2,4})").find(body) ?: return null
    val day = m.groupValues[1].toInt()
    val monRaw = m.groupValues[2]
    val month = if (monRaw.all { it.isDigit() }) monRaw.toInt() else MONTH[monRaw.take(3).lowercase()] ?: return null
    var year = m.groupValues[3].toInt()
    if (year < 100) year += 2000
    if (month !in 1..12 || day !in 1..31) return null
    return localNoon(year, month, day)
}

private fun bankOf(sender: String) = BANKS.firstOrNull { it.first.containsMatchIn(sender.uppercase()) }?.second ?: "Bank"

fun parseSms(sender: String, body: String): ParsedSms? {
    if (body.length < 12) return null
    if (Regex("\\botp\\b|one time password|do not share|verification code", RegexOption.IGNORE_CASE).containsMatchIn(body)) return null
    if (Regex("\\b(failed|unsuccessful|declined)\\b", RegexOption.IGNORE_CASE).containsMatchIn(body)) return null
    val amt = Regex("(?:rs\\.?|inr|₹)\\s*([0-9][0-9,]*(?:\\.[0-9]{1,2})?)", RegexOption.IGNORE_CASE).find(body) ?: return null
    val amount = amt.groupValues[1].replace(",", "").toDoubleOrNull() ?: return null
    if (amount <= 0) return null
    val credited = Regex("\\b(credited|credit of|received|deposited)\\b", RegexOption.IGNORE_CASE).containsMatchIn(body)
    val debited = Regex("\\b(debited|spent|withdrawn|purchase|paid|sent|transferred)\\b", RegexOption.IGNORE_CASE).containsMatchIn(body)
    if (!credited && !debited) return null
    val income = credited && !debited
    val transfer = Regex(
        "credit card[\\s\\S]{0,40}payment|towards[\\s\\S]{0,40}(?:credit card|\\scc\\s)|\\scc\\s[\\s\\S]{0,30}payment|card bill",
        RegexOption.IGNORE_CASE,
    ).containsMatchIn(body)
    val merchant = if (transfer) "Card bill" else merchantFrom(body)
    val account = Regex("(?:XX|\\*{1,}|x{2,})(\\d{3,6})", RegexOption.IGNORE_CASE).find(body)?.groupValues?.get(1)
    return ParsedSms(
        bank = bankOf(sender),
        amount = amount,
        income = income,
        transfer = transfer,
        merchant = merchant,
        rail = guessRail(body, transfer),
        tag = suggestTag(merchant, income, transfer),
        account = account,
        at = parseWhen(body),
    )
}

fun spanContext(body: String, slice: String): Pair<String, String>? {
    val i = body.indexOf(slice)
    if (i < 0 || slice.isEmpty()) return null
    return body.substring(maxOf(0, i - 12), i) to body.substring(i + slice.length, minOf(body.length, i + slice.length + 12))
}

private fun esc(s: String) = Regex.escape(s)

private fun capture(body: String, before: String, after: String): Double? {
    if (before.isEmpty() && after.isEmpty()) return null
    val m = Regex(esc(before) + "(?:(?:rs\\.?|inr|₹)\\s*)?([0-9][0-9,]*(?:\\.[0-9]{1,2})?)" + esc(after), RegexOption.IGNORE_CASE).find(body) ?: return null
    val n = m.groupValues[1].replace(",", "").toDoubleOrNull() ?: return null
    return if (n > 0) n else null
}

private fun captureText(body: String, before: String, after: String): String? {
    if (before.isEmpty() && after.isEmpty()) return null
    return Regex(esc(before) + "(.{2,40}?)" + esc(after)).find(body)?.groupValues?.get(1)?.trim()
}

fun parseWithRules(sender: String, body: String, formats: List<FormatRule>, merchants: List<MerchantRule>): ParsedSms? {
    var parsed = parseSms(sender, body)
    val taught = formats.find { it.sender == sender }
    if (parsed == null && taught != null) {
        val amount = capture(body, taught.amountBefore, taught.amountAfter)
        if (amount != null) {
            val merchant = cleanMerchant(captureText(body, taught.merchantBefore, taught.merchantAfter) ?: "Payment")
            parsed = ParsedSms(
                bank = bankOf(sender),
                amount = amount,
                income = false,
                transfer = false,
                merchant = merchant,
                rail = guessRail(body),
                tag = suggestTag(merchant, false, false),
                account = null,
                at = parseWhen(body),
            )
        }
    }
    if (parsed == null) return null
    val rule = merchants.find { it.key == parsed.merchant.lowercase() }
    return if (rule?.tag != null) parsed.copy(tag = rule.tag) else parsed
}

fun isRecentDupe(hits: List<Hit>, merchant: String, amount: Double, at: Long): Boolean {
    val key = merchant.lowercase()
    return hits.any { it.merchant == key && it.amount == amount && kotlin.math.abs(it.at - at) < 180_000 }
}
