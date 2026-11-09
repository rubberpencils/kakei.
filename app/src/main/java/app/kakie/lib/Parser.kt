package app.kakie.lib

data class ParsedSms(
    val bank: String,
    val amount: Double,
    val income: Boolean,
    val transfer: Boolean,
    val merchant: String,
    val rail: Rail,
    val tag: String?,
    val account: String?,
    val at: String?,
)

private val I = RegexOption.IGNORE_CASE

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

private val TAG_RULES = listOf(
    Regex("starbucks|cafe|coffee|third wave") to "coffee",
    Regex("swiggy|zomato|deli|restaurant|canteen|thalassa") to "food",
    Regex("uber|ola|rapido|namma yatri") to "transport",
    Regex("amazon|myntra|flipkart|ajio") to "shopping",
    Regex("blinkit|zepto|bigbasket|instamart|grocery") to "groceries",
    Regex("netflix|spotify|bookmyshow|hotstar|prime video") to "entertainment",
    Regex("airtel|jio|vi\\b|electric|bescom|wifi|broadband") to "bills",
    Regex("petrol|fuel|hpcl|iocl|bpcl|indian oil") to "fuel",
    Regex("pharmacy|apollo|doctor|hospital|clinic") to "medical",
    Regex("rent") to "rent",
    Regex("salary|stipend") to "salary",
)

private val MONTH = mapOf(
    "jan" to 1, "feb" to 2, "mar" to 3, "apr" to 4, "may" to 5, "jun" to 6,
    "jul" to 7, "aug" to 8, "sep" to 9, "oct" to 10, "nov" to 11, "dec" to 12,
)

private fun titleCase(s: String) = s.lowercase().replace(Regex("\\b[a-z]")) { it.value.uppercase() }

private fun cleanMerchant(raw: String): String {
    var t = raw.replace(Regex("\\s+"), " ").replace(Regex("[.,]+$"), "").trim()
    t = Regex("\\b(PVT LTD|PRIVATE LIMITED|LTD)\\b.*", I).replaceFirst(t, "")
    t = Regex("\\bSALARY\\b.*", I).replaceFirst(t, "")
    t = Regex("\\bPAY IN\\b.*", I).replaceFirst(t, "")
    t = t.replace(Regex("\\s+"), " ").trim()
    if (t.isEmpty()) return "Payment"
    if (t == t.uppercase()) return titleCase(t)
    return t
}

private fun merchantFrom(body: String): String {
    Regex("vpa\\s+([a-z0-9._-]+)@", I).find(body)?.let { vpa ->
        val head = vpa.groupValues[1].split(".")[0].replace(Regex("[^a-z]", I), "")
        if (head.isNotEmpty()) return titleCase(head)
    }
    Regex("NEFT-([A-Z][A-Z0-9 .&-]{2,48})", I).find(body)?.let { return cleanMerchant(it.groupValues[1]) }
    Regex("\\bon\\s+([A-Z][A-Z0-9 .&-]{2,40})").find(body)?.let { return cleanMerchant(it.groupValues[1]) }
    Regex("towards\\s+(.+?)(?:\\s+payment|\\.|$)", I).find(body)?.let {
        return cleanMerchant(Regex("\\bXX\\d+\\b", I).replace(it.groupValues[1], ""))
    }
    return "Payment"
}

private fun suggestTag(merchant: String, income: Boolean, transfer: Boolean): String? {
    if (transfer) return "bills"
    if (income) return "salary"
    val hay = merchant.lowercase()
    return TAG_RULES.firstOrNull { (re, _) -> re.containsMatchIn(hay) }?.second
}

private fun parseWhen(body: String): String? {
    val m = Regex("(\\d{1,2})[-/](\\d{1,2}|[A-Za-z]{3})[-/](\\d{2,4})").find(body) ?: return null
    val day = m.groupValues[1].toInt()
    val monRaw = m.groupValues[2]
    val month = if (monRaw.all { it.isDigit() }) monRaw.toInt() else MONTH[monRaw.take(3).lowercase()] ?: 0
    var year = m.groupValues[3].toInt()
    if (year < 100) year += 2000
    if (month < 1 || month > 12 || day < 1 || day > 31) return null
    return localNoon(year, month, day)
}

fun parseSms(sender: String, body: String): ParsedSms? {
    if (body.length < 12) return null
    if (Regex("\\botp\\b|one time password|do not share|verification code", I).containsMatchIn(body)) return null
    val amt = Regex("(?:rs\\.?|inr|₹)\\s*([0-9][0-9,]*(?:\\.[0-9]{1,2})?)", I).find(body) ?: return null
    val amount = amt.groupValues[1].replace(",", "").toDoubleOrNull() ?: return null
    if (amount <= 0) return null

    val credited = Regex("\\b(credited|credit of|received|deposited)\\b", I).containsMatchIn(body)
    val debited = Regex("\\b(debited|spent|withdrawn|purchase|paid)\\b", I).containsMatchIn(body)
    if (!credited && !debited) return null
    val income = credited && !debited

    val transfer = Regex("credit card[\\s\\S]{0,40}payment|towards[\\s\\S]{0,40}credit card|card bill", I).containsMatchIn(body)
    val rail = when {
        Regex("vpa\\b|\\bupi\\b|@[a-z]{2,}", I).containsMatchIn(body) && !Regex("spent using", I).containsMatchIn(body) -> Rail.UPI
        Regex("spent using|credit card", I).containsMatchIn(body) && !transfer -> Rail.CREDIT
        Regex("\\bimps\\b", I).containsMatchIn(body) -> Rail.IMPS
        Regex("\\bneft\\b|\\brtgs\\b", I).containsMatchIn(body) -> Rail.NEFT
        else -> Rail.DEBIT
    }

    val upper = sender.uppercase()
    val bank = BANKS.firstOrNull { (re, _) -> re.containsMatchIn(upper) }?.second ?: "Bank"
    val merchant = if (transfer) "Card bill" else merchantFrom(body)
    val account = Regex("(?:XX|\\*{2,}|x{2,})(\\d{4})", I).find(body)?.groupValues?.get(1)

    return ParsedSms(
        bank = bank,
        amount = amount,
        income = income,
        transfer = transfer,
        merchant = merchant,
        rail = rail,
        tag = suggestTag(merchant, income, transfer),
        account = account,
        at = parseWhen(body),
    )
}
