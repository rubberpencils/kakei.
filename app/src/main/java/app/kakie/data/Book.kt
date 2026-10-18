package app.kakie.data

import app.kakie.core.Draft
import app.kakie.core.Expense
import app.kakie.core.FormatRule
import app.kakie.core.Group
import app.kakie.core.Hit
import app.kakie.core.MerchantRule
import app.kakie.core.MonthSnapshot
import app.kakie.core.Payer
import app.kakie.core.Person
import app.kakie.core.Settlement
import app.kakie.core.SplitItem
import app.kakie.core.initials
import app.kakie.core.slugTag
import org.json.JSONArray
import org.json.JSONObject

const val DEFAULT_API = "https://kakei.169.58.42.62.sslip.io"

private val OLD_TAGS = listOf("food", "coffee", "transport", "groceries", "shopping", "entertainment", "bills", "rent", "fuel", "medical", "travel", "salary")

data class Book(
    val entered: Boolean = false,
    val base: String = DEFAULT_API,
    val token: String? = null,
    val you: Person = Person("me", "You", "YO"),
    val phone: String = "",
    val people: List<Person> = emptyList(),
    val groups: List<Group> = emptyList(),
    val expenses: List<Expense> = emptyList(),
    val settlements: List<Settlement> = emptyList(),
    val tags: List<String> = emptyList(),
    val budget: Double = 0.0,
    val history: List<MonthSnapshot> = emptyList(),
    val tagBudgets: Map<String, Double> = emptyMap(),
    val alerted: List<String> = emptyList(),
    val lock: Boolean = false,
    val queue: List<Draft> = emptyList(),
    val seen: List<String> = emptyList(),
    val smsOn: Boolean = false,
    val rules: List<MerchantRule> = emptyList(),
    val formats: List<FormatRule> = emptyList(),
    val recent: List<Hit> = emptyList(),
    val devMcp: Boolean = false,
    val devLan: Boolean = false,
    val devPort: Int = 8765,
    val devToken: String = "",
    val remote: Boolean = false,
    val remoteId: String = "",
    val remoteToken: String = "",
    val local: Boolean = false,
    val outbox: List<JSONObject> = emptyList(),
    val pro: Boolean = false,
    val askOk: Boolean = false,
    val digest: Boolean = false,
    val sunday: String = "",
    val nudgeDay: String = "",
    val nudgeStamp: String = "",
) {
    val signedIn get() = !token.isNullOrBlank() && !local

    fun withTag(tag: String?): Book {
        val slug = slugTag(tag ?: "") 
        if (slug.isEmpty() || slug in tags) return this
        return copy(tags = tags + slug)
    }
}

fun Book.backupJson(): String {
    val o = JSONObject()
    o.put("expenses", JSONArray(expenses.map { it.toJson() }))
    o.put("settlements", JSONArray(settlements.map { it.toJson() }))
    o.put("groups", JSONArray(groups.map { it.toJson() }))
    o.put("people", JSONArray(people.map { it.toJson() }))
    o.put("budget", budget)
    o.put("tags", JSONArray(tags))
    o.put("rules", JSONArray(rules.map { JSONObject().put("key", it.key).put("tag", it.tag).put("groupId", it.groupId) }))
    o.put("history", JSONArray(history.map { JSONObject().put("y", it.y).put("m", it.m).put("spent", it.spent).put("sample", it.sample) }))
    o.put("tagBudgets", JSONObject(tagBudgets))
    return o.toString()
}

fun Book.applyBackup(json: String): Book {
    val o = JSONObject(json)
    val nextTags = o.optJSONArray("tags").toStrings()
    return copy(
        expenses = o.optJSONArray("expenses").toList { it.toExpense() },
        settlements = o.optJSONArray("settlements").toList { it.toSettlement() },
        groups = o.optJSONArray("groups").toList { it.toGroup() },
        people = o.optJSONArray("people").toList { it.toPerson() },
        budget = o.optDouble("budget", budget),
        tags = migrateTags(nextTags, o.optJSONArray("expenses").toList { it.toExpense() }, o.optJSONObject("tagBudgets")),
        rules = o.optJSONArray("rules").toList { MerchantRule(it.optString("key"), it.optString("tag").ifEmpty { null }, it.optString("groupId").ifEmpty { null }) },
        history = o.optJSONArray("history").toList { MonthSnapshot(it.optInt("y"), it.optInt("m"), it.optDouble("spent"), it.optBoolean("sample")) },
        tagBudgets = o.optJSONObject("tagBudgets")?.toDoubles() ?: tagBudgets,
    )
}

fun Book.toJson(): String {
    val o = JSONObject(backupJson())
    o.put("entered", entered)
    o.put("base", base)
    o.put("token", token)
    o.put("you", you.toJson())
    o.put("phone", phone)
    o.put("alerted", JSONArray(alerted))
    o.put("lock", lock)
    o.put("queue", JSONArray(queue.map { it.toJson() }))
    o.put("seen", JSONArray(seen))
    o.put("smsOn", smsOn)
    o.put("formats", JSONArray(formats.map { JSONObject().put("sender", it.sender).put("amountBefore", it.amountBefore).put("amountAfter", it.amountAfter).put("merchantBefore", it.merchantBefore).put("merchantAfter", it.merchantAfter) }))
    o.put("recent", JSONArray(recent.map { JSONObject().put("merchant", it.merchant).put("amount", it.amount).put("at", it.at) }))
    o.put("devMcp", devMcp)
    o.put("devLan", devLan)
    o.put("devPort", devPort)
    o.put("devToken", devToken)
    o.put("remote", remote)
    o.put("remoteId", remoteId)
    o.put("remoteToken", remoteToken)
    o.put("local", local)
    o.put("outbox", JSONArray(outbox))
    o.put("pro", pro)
    o.put("askOk", askOk)
    o.put("digest", digest)
    o.put("sunday", sunday)
    o.put("nudgeDay", nudgeDay)
    o.put("nudgeStamp", nudgeStamp)
    return o.toString()
}

fun bookFrom(raw: String?): Book {
    if (raw.isNullOrBlank()) return Book()
    val o = JSONObject(raw)
    val expenses = o.optJSONArray("expenses").toList { it.toExpense() }
    val tags = migrateTags(o.optJSONArray("tags").toStrings(), expenses, o.optJSONObject("tagBudgets"))
    return Book(
        entered = o.optBoolean("entered"),
        base = o.optString("base", DEFAULT_API).ifBlank { DEFAULT_API },
        token = o.optString("token").ifBlank { null },
        you = o.optJSONObject("you")?.toPerson() ?: Person("me", "You", "YO"),
        phone = o.optString("phone"),
        people = o.optJSONArray("people").toList { it.toPerson() },
        groups = o.optJSONArray("groups").toList { it.toGroup() },
        expenses = expenses,
        settlements = o.optJSONArray("settlements").toList { it.toSettlement() },
        tags = tags,
        budget = o.optDouble("budget", 0.0),
        history = o.optJSONArray("history").toList { MonthSnapshot(it.optInt("y"), it.optInt("m"), it.optDouble("spent"), it.optBoolean("sample")) },
        tagBudgets = o.optJSONObject("tagBudgets")?.toDoubles() ?: emptyMap(),
        alerted = o.optJSONArray("alerted").toStrings(),
        lock = o.optBoolean("lock"),
        queue = o.optJSONArray("queue").toList { it.toDraft() },
        seen = o.optJSONArray("seen").toStrings(),
        smsOn = o.optBoolean("smsOn"),
        rules = o.optJSONArray("rules").toList { MerchantRule(it.optString("key"), it.optString("tag").ifEmpty { null }, it.optString("groupId").ifEmpty { null }) },
        formats = o.optJSONArray("formats").toList { FormatRule(it.optString("sender"), it.optString("amountBefore"), it.optString("amountAfter"), it.optString("merchantBefore"), it.optString("merchantAfter")) },
        recent = o.optJSONArray("recent").toList { Hit(it.optString("merchant"), it.optDouble("amount"), it.optLong("at")) },
        devMcp = o.optBoolean("devMcp"),
        devLan = o.optBoolean("devLan"),
        devPort = o.optInt("devPort", 8765),
        devToken = o.optString("devToken"),
        remote = o.optBoolean("remote"),
        remoteId = o.optString("remoteId"),
        remoteToken = o.optString("remoteToken"),
        local = o.optBoolean("local"),
        outbox = o.optJSONArray("outbox").toList { it },
        pro = o.optBoolean("pro"),
        askOk = o.optBoolean("askOk"),
        digest = o.optBoolean("digest"),
        sunday = o.optString("sunday"),
        nudgeDay = o.optString("nudgeDay"),
        nudgeStamp = o.optString("nudgeStamp"),
    )
}

private fun migrateTags(tags: List<String>, expenses: List<Expense>, budgets: JSONObject?): List<String> {
    if (tags != OLD_TAGS) return tags
    val used = linkedSetOf<String>()
    expenses.mapNotNull { it.tag }.forEach { used += it }
    budgets?.keys()?.forEach { used += it }
    return used.toList()
}

private fun Person.toJson() = JSONObject().put("id", id).put("name", name).put("initials", initials).put("claimed", claimed)
private fun JSONObject.toPerson() = Person(optString("id"), optString("name"), optString("initials").ifBlank { initials(optString("name")) }, optBoolean("claimed"))

private fun Group.toJson() = JSONObject()
    .put("id", id).put("name", name).put("icon", icon).put("memberIds", JSONArray(memberIds)).put("note", note)
    .put("code", code).put("owner", owner).put("sample", sample).put("simplify", simplify).put("kind", kind)

private fun JSONObject.toGroup() = Group(
    optString("id"), optString("name"), optString("icon", "group"),
    optJSONArray("memberIds").toStrings(), optString("note"),
    optString("code").ifBlank { null }, optBoolean("owner"), optBoolean("sample"),
    if (has("simplify") && !isNull("simplify")) optBoolean("simplify") else null,
    optString("kind").ifBlank { null },
)

fun Expense.toJson(): JSONObject = JSONObject()
    .put("id", id).put("merchant", merchant).put("amount", amount).put("at", at).put("tag", tag)
    .put("rail", rail).put("income", income).put("transfer", transfer).put("recurring", recurring).put("recurId", recurId)
    .put("groupId", groupId).put("payerId", payerId)
    .put("shares", shares?.let { JSONObject(it) } ?: JSONObject.NULL)
    .put("reflect", reflect).put("account", account).put("bank", bank).put("note", note).put("sample", sample)
    .put("payers", payers?.let { JSONArray(it.map { p -> JSONObject().put("id", p.id).put("amount", p.amount) }) } ?: JSONObject.NULL)
    .put("items", items?.let { JSONArray(it.map { item -> JSONObject().put("name", item.name).put("amount", item.amount).put("memberIds", JSONArray(item.memberIds)) }) } ?: JSONObject.NULL)

private fun JSONObject.toExpense() = Expense(
    id = optString("id"), merchant = optString("merchant"), amount = optDouble("amount"), at = optString("at"),
    tag = optString("tag").ifBlank { null }, rail = optString("rail", "upi"),
    income = optBoolean("income"), transfer = optBoolean("transfer"),
    recurring = optString("recurring").ifBlank { null }, recurId = optString("recurId").ifBlank { null },
    groupId = optString("groupId").ifBlank { null }, payerId = optString("payerId").ifBlank { null },
    shares = optJSONObject("shares")?.toDoubles(), reflect = if (has("reflect")) optBoolean("reflect") else true,
    account = optString("account").ifBlank { null }, bank = optString("bank").ifBlank { null },
    note = optString("note").ifBlank { null }, sample = optBoolean("sample"),
    payers = optJSONArray("payers")?.let { arr -> (0 until arr.length()).map { arr.getJSONObject(it) }.map { Payer(it.optString("id"), it.optDouble("amount")) } },
    items = optJSONArray("items")?.let { arr -> (0 until arr.length()).map { arr.getJSONObject(it) }.map { SplitItem(it.optString("name"), it.optDouble("amount"), it.optJSONArray("memberIds").toStrings()) } },
)

private fun Settlement.toJson() = JSONObject().put("id", id).put("groupId", groupId).put("fromId", fromId).put("toId", toId).put("amount", amount).put("at", at).put("sample", sample)
private fun JSONObject.toSettlement() = Settlement(optString("id"), optString("groupId"), optString("fromId"), optString("toId"), optDouble("amount"), optString("at"), optBoolean("sample"))

private fun Draft.toJson() = JSONObject()
    .put("id", id).put("key", key).put("sender", sender).put("bank", bank).put("body", body).put("at", at)
    .put("amount", amount).put("income", income).put("transfer", transfer).put("merchant", merchant)
    .put("rail", rail).put("tag", tag).put("account", account).put("sample", sample)

private fun JSONObject.toDraft() = Draft(
    optString("id"), optString("key"), optString("sender"), optString("bank"), optString("body"), optString("at"),
    optDouble("amount"), optBoolean("income"), optBoolean("transfer"), optString("merchant"), optString("rail", "upi"),
    optString("tag").ifBlank { null }, optString("account").ifBlank { null }, optBoolean("sample"),
)

private fun JSONObject.toDoubles(): Map<String, Double> {
    val out = linkedMapOf<String, Double>()
    keys().forEach { key -> out[key] = optDouble(key) }
    return out
}

private fun JSONArray?.toStrings(): List<String> {
    if (this == null) return emptyList()
    return (0 until length()).map { optString(it) }
}

private fun <T> JSONArray?.toList(map: (JSONObject) -> T): List<T> {
    if (this == null) return emptyList()
    return (0 until length()).mapNotNull { idx -> optJSONObject(idx)?.let(map) }
}
