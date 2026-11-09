package app.kakie.lib

import java.time.LocalDate
import org.json.JSONArray
import org.json.JSONObject

data class McpReply(val status: Int, val body: String)

private val VERSIONS = listOf("2025-06-18", "2025-03-26", "2024-11-05")

fun handleMcp(raw: String, data: McpData): McpReply {
    if (raw.trimStart().startsWith("[")) {
        val arr = runCatching { JSONArray(raw) }.getOrElse { return McpReply(200, bad(null, -32700, "Parse error").toString()) }
        val out = JSONArray()
        for (i in 0 until arr.length()) oneRpc(arr.optJSONObject(i), data)?.let { out.put(it) }
        return if (out.length() == 0) McpReply(202, "") else McpReply(200, out.toString())
    }
    val obj = runCatching { JSONObject(raw) }.getOrElse { return McpReply(200, bad(null, -32700, "Parse error").toString()) }
    val res = oneRpc(obj, data) ?: return McpReply(202, "")
    return McpReply(200, res.toString())
}

data class McpData(
    val you: Person,
    val people: List<Person>,
    val groups: List<Group>,
    val expenses: List<Expense>,
    val settlements: List<Settlement>,
    val budget: Double,
    val now: LocalDate = LocalDate.now(),
)

private fun ok(id: Any?, result: JSONObject) = JSONObject().put("jsonrpc", "2.0").put("id", id ?: JSONObject.NULL).put("result", result)

private fun bad(id: Any?, code: Int, message: String) = JSONObject()
    .put("jsonrpc", "2.0").put("id", id ?: JSONObject.NULL)
    .put("error", JSONObject().put("code", code).put("message", message))

private fun text(value: JSONObject) = JSONObject().put("content", JSONArray().put(JSONObject().put("type", "text").put("text", value.toString(2))))

private fun problem(message: String) = JSONObject()
    .put("content", JSONArray().put(JSONObject().put("type", "text").put("text", message)))
    .put("isError", true)

private fun tools(): JSONArray {
    fun tool(name: String, description: String) = JSONObject()
        .put("name", name).put("description", description)
        .put("inputSchema", JSONObject().put("type", "object").put("additionalProperties", false))
        .put("annotations", JSONObject().put("readOnlyHint", true))
    return JSONArray()
        .put(tool("get_summary", "Spending for one month. spent is only the user's own share."))
        .put(tool("list_transactions", "Transactions, newest first. Max 200."))
        .put(tool("spending_by_tag", "The user's own spend grouped by tag."))
        .put(tool("list_groups", "Groups and quick splits."))
        .put(tool("get_balances", "Net balance with each friend. Positive means they owe the user."))
}

private fun oneRpc(msg: JSONObject?, data: McpData): JSONObject? {
    if (msg == null || msg.optString("jsonrpc") != "2.0" || !msg.has("method")) return bad(msg?.opt("id"), -32600, "Invalid request")
    if (!msg.has("id")) return null
    val id = msg.opt("id")
    val params = msg.optJSONObject("params") ?: JSONObject()
    return when (msg.optString("method")) {
        "initialize" -> ok(id, JSONObject()
            .put("protocolVersion", params.optString("protocolVersion").takeIf { it in VERSIONS } ?: VERSIONS[0])
            .put("capabilities", JSONObject().put("tools", JSONObject().put("listChanged", false)))
            .put("serverInfo", JSONObject().put("name", "kakei").put("version", "1.0.0"))
            .put("instructions", "Personal finance data from kakie., served from this phone. Read-only. Amounts are INR."))
        "ping" -> ok(id, JSONObject())
        "tools/list" -> ok(id, JSONObject().put("tools", tools()))
        "tools/call" -> {
            val name = params.optString("name")
            val known = setOf("get_summary", "list_transactions", "spending_by_tag", "list_groups", "get_balances")
            if (name !in known) return bad(id, -32602, "Unknown tool ${name.ifEmpty { "(none)" }}")
            val args = params.optJSONObject("arguments") ?: JSONObject()
            ok(id, runCatching { callTool(name, args, data) }.getOrElse { problem(it.message ?: "Something went wrong") })
        }
        else -> bad(id, -32601, "Method not found: ${msg.optString("method")}")
    }
}

private fun callTool(name: String, args: JSONObject, d: McpData): JSONObject {
    val you = d.you.id
    val month = d.now
    fun bounds() = monthBounds(month.year, month.monthValue)
    return when (name) {
        "get_summary" -> {
            val r = bounds()
            val s = spendIn(d.expenses, d.settlements, you, r.from, r.to)
            val rem = remainingOwed(d.expenses, d.settlements)
            val back = d.expenses.filter { countsAsSpend(it) && inRange(it.at, r.from, r.to) && it.groupId != null && it.reflect }
                .sumOf { owedBack(it, you, rem) }
            val tags = JSONArray()
            s.byTag.entries.sortedByDescending { it.value }.take(5).forEach { tags.put(JSONObject().put("tag", it.key).put("spent", round2(it.value))) }
            text(JSONObject()
                .put("month", "${month.year}-${pad(month.monthValue)}")
                .put("currency", "INR")
                .put("budget", if (d.budget == 0.0) JSONObject.NULL else d.budget)
                .put("spent", round2(s.total))
                .put("budgetLeft", if (d.budget == 0.0) JSONObject.NULL else round2(d.budget - s.total))
                .put("toGetBack", round2(back))
                .put("transactions", s.count)
                .put("topTags", tags))
        }
        "list_transactions" -> {
            val from = args.optString("from").ifEmpty { "0000-01-01" }
            val to = args.optString("to").ifEmpty { "9999-12-31" }
            val tag = args.optString("tag").lowercase().ifEmpty { null }
            val query = args.optString("query").lowercase().ifEmpty { null }
            val limit = args.optInt("limit", 50).coerceIn(1, 200)
            val rem = remainingOwed(d.expenses, d.settlements)
            val rows = JSONArray()
            d.expenses.filter { inRange(it.at, from, to) && (tag == null || it.tag == tag) && (query == null || query in it.merchant.lowercase()) }
                .sortedByDescending { it.at }.take(limit).forEach { e ->
                    rows.put(JSONObject()
                        .put("id", e.id).put("date", dayKey(e.at)).put("merchant", e.merchant).put("amount", e.amount)
                        .put("yourShare", round2(pocket(e, you, rem))).put("tag", e.tag ?: JSONObject.NULL)
                        .put("type", if (e.income) "income" else if (e.transfer) "transfer" else "expense")
                        .put("split", e.groupId?.let { id -> d.groups.find { it.id == id }?.name } ?: JSONObject.NULL))
                }
            text(JSONObject().put("currency", "INR").put("count", rows.length()).put("transactions", rows))
        }
        "spending_by_tag" -> {
            val r = bounds()
            val from = args.optString("from").ifEmpty { r.from }
            val to = args.optString("to").ifEmpty { r.to }
            val s = spendIn(d.expenses, d.settlements, you, from, to)
            val tags = JSONArray()
            s.byTag.entries.sortedByDescending { it.value }.forEach { tags.put(JSONObject().put("tag", it.key).put("spent", round2(it.value))) }
            text(JSONObject().put("from", from).put("to", to).put("currency", "INR").put("total", round2(s.total)).put("tags", tags))
        }
        "list_groups" -> {
            val groups = JSONArray()
            d.groups.forEach { g ->
                val debts = groupDebts(d.expenses, d.settlements, g)
                groups.put(JSONObject()
                    .put("id", g.id).put("name", g.name)
                    .put("kind", if (g.kind == "split") "quick split" else "group")
                    .put("youAreOwed", round2(debts.filter { it.toId == you }.sumOf { it.amount }))
                    .put("youOwe", round2(debts.filter { it.fromId == you }.sumOf { it.amount })))
            }
            text(JSONObject().put("currency", "INR").put("groups", groups))
        }
        "get_balances" -> {
            val rows = JSONArray()
            friendBalances(d.expenses, d.settlements, d.groups, you).filter { kotlin.math.abs(it.net) >= 0.5 }.forEach { f ->
                rows.put(JSONObject()
                    .put("friend", personName(d.people, d.you, f.id))
                    .put("net", round2(f.net))
                    .put("meaning", if (f.net > 0) "owes you" else "you owe them"))
            }
            text(JSONObject().put("currency", "INR").put("balances", rows))
        }
        else -> problem("Unknown tool $name")
    }
}
