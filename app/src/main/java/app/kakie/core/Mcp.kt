package app.kakie.core

import org.json.JSONArray
import org.json.JSONObject

data class McpData(
    val you: Person,
    val people: List<Person>,
    val groups: List<Group>,
    val expenses: List<Expense>,
    val settlements: List<Settlement>,
    val budget: Double,
    val now: String,
)

data class McpReply(val status: Int, val body: String)

private val VERSIONS = listOf("2025-06-18", "2025-03-26", "2024-11-05")
private val DAY = Regex("^\\d{4}-\\d{2}-\\d{2}$")
private val MONTH = Regex("^(\\d{4})-(\\d{2})$")

fun handleMcp(raw: String, data: McpData): McpReply {
    val parsed = try {
        org.json.JSONTokener(raw).nextValue()
    } catch (_: Exception) {
        return McpReply(200, bad(null, -32700, "Parse error").toString())
    }
    if (parsed is JSONArray) {
        val out = JSONArray()
        for (i in 0 until parsed.length()) {
            val one = one(parsed.optJSONObject(i), data) ?: continue
            out.put(one)
        }
        return if (out.length() == 0) McpReply(202, "") else McpReply(200, out.toString())
    }
    val res = one(parsed as? JSONObject, data)
    return if (res == null) McpReply(202, "") else McpReply(200, res.toString())
}

private fun one(msg: JSONObject?, data: McpData): JSONObject? {
    if (msg == null || msg.optString("jsonrpc") != "2.0" || msg.optString("method").isEmpty()) {
        return bad(msg?.opt("id"), -32600, "Invalid request")
    }
    if (!msg.has("id") || msg.isNull("id")) return null
    val id = msg.opt("id")
    val params = msg.optJSONObject("params") ?: JSONObject()
    return when (msg.optString("method")) {
        "initialize" -> {
            val asked = params.optString("protocolVersion")
            ok(id, JSONObject()
                .put("protocolVersion", if (asked in VERSIONS) asked else VERSIONS[0])
                .put("capabilities", JSONObject().put("tools", JSONObject().put("listChanged", false)))
                .put("serverInfo", JSONObject().put("name", "kakei").put("version", "1.0.0"))
                .put("instructions", "Personal finance data from the Kakei app, served from the user's phone. Read-only. Amounts are in INR."))
        }
        "ping" -> ok(id, JSONObject())
        "tools/list" -> ok(id, JSONObject().put("tools", tools()))
        "tools/call" -> {
            val name = params.optString("name")
            val known = tools().let { arr -> (0 until arr.length()).any { arr.getJSONObject(it).getString("name") == name } }
            if (!known) return bad(id, -32602, "Unknown tool ${name.ifEmpty { "(none)" }}")
            val args = params.optJSONObject("arguments") ?: JSONObject()
            try {
                ok(id, callTool(name, args, data))
            } catch (err: Exception) {
                ok(id, problem(err.message ?: "Something went wrong"))
            }
        }
        else -> bad(id, -32601, "Method not found: ${msg.optString("method")}")
    }
}

private fun tools(): JSONArray {
    fun tool(name: String, description: String) = JSONObject().put("name", name).put("description", description)
    return JSONArray()
        .put(tool("get_summary", "Spending for one month."))
        .put(tool("list_transactions", "Transactions, newest first."))
        .put(tool("spending_by_tag", "Spend grouped by tag."))
        .put(tool("list_groups", "Groups and quick splits."))
        .put(tool("get_balances", "Net balance with each friend."))
}

private fun callTool(name: String, args: JSONObject, d: McpData): JSONObject {
    val you = d.you.id
    fun groupName(id: String?) = if (id == null) null else d.groups.find { it.id == id }?.name
    return when (name) {
        "get_summary" -> {
            val r = monthRange(d.now, if (args.has("month")) args.opt("month") else null)
            val s = spendIn(d.expenses, d.settlements, you, r.first, r.second)
            text(JSONObject()
                .put("month", r.third)
                .put("currency", "INR")
                .put("spent", round2(s.total))
                .put("toGetBack", round2(s.back))
                .put("transactions", s.count))
        }
        "list_transactions" -> {
            val from = day(args.opt("from"), "0000-01-01")
            val to = day(args.opt("to"), "9999-12-31")
            val tag = args.optString("tag").takeIf { it.isNotEmpty() }?.lowercase()
            val query = args.optString("query").takeIf { it.isNotEmpty() }?.lowercase()
            val rows = d.expenses
                .filter { inRange(it.at, from, to) && (tag == null || it.tag == tag) && (query == null || it.merchant.lowercase().contains(query)) }
                .sortedByDescending { it.at }
                .take(50)
            val arr = JSONArray()
            for (e in rows) {
                arr.put(JSONObject()
                    .put("id", e.id)
                    .put("date", dayKey(e.at))
                    .put("merchant", e.merchant)
                    .put("amount", e.amount)
                    .put("yourShare", round2(pocket(e, you)))
                    .put("tag", e.tag)
                    .put("split", groupName(e.groupId))
                    .put("paidBy", if (e.groupId != null && e.payerId != null) personName(d.people, d.you, e.payerId) else "You"))
            }
            text(JSONObject().put("currency", "INR").put("count", rows.size).put("transactions", arr))
        }
        "list_groups" -> {
            val arr = JSONArray()
            for (g in d.groups) {
                val debts = groupDebts(d.expenses, d.settlements, g)
                arr.put(JSONObject()
                    .put("id", g.id)
                    .put("name", g.name)
                    .put("kind", if (g.kind == "split") "quick split" else "group")
                    .put("youAreOwed", round2(debts.filter { it.toId == you }.sumOf { it.amount }))
                    .put("youOwe", round2(debts.filter { it.fromId == you }.sumOf { it.amount })))
            }
            text(JSONObject().put("currency", "INR").put("groups", arr))
        }
        "get_balances" -> {
            val arr = JSONArray()
            for (f in friendBalances(d.expenses, d.settlements, d.groups, you).filter { kotlin.math.abs(it.net) >= 0.5 }) {
                arr.put(JSONObject()
                    .put("friend", personName(d.people, d.you, f.id))
                    .put("net", round2(f.net))
                    .put("meaning", if (f.net > 0) "owes you" else "you owe them"))
            }
            text(JSONObject().put("currency", "INR").put("balances", arr))
        }
        else -> problem("Unknown tool $name")
    }
}

private fun monthRange(nowIso: String, raw: Any?): Triple<String, String, String> {
    val now = java.time.LocalDateTime.parse(nowIso.take(19))
    if (raw == null || raw == JSONObject.NULL || raw == "") {
        val b = monthBounds(now.year, now.monthValue)
        return Triple(b.first, b.second, "${now.year}-${pad(now.monthValue)}")
    }
    val text = raw as? String ?: throw IllegalArgumentException("Month must look like 2026-10")
    val m = MONTH.matchEntire(text) ?: throw IllegalArgumentException("Month must look like 2026-10")
    val month = m.groupValues[2].toInt()
    if (month !in 1..12) throw IllegalArgumentException("Month must look like 2026-10")
    val b = monthBounds(m.groupValues[1].toInt(), month)
    return Triple(b.first, b.second, text)
}

private fun day(v: Any?, fallback: String): String {
    if (v == null || v == JSONObject.NULL || v == "") return fallback
    val s = v as? String ?: throw IllegalArgumentException("Dates must look like 2026-10-31")
    if (!DAY.matches(s)) throw IllegalArgumentException("Dates must look like 2026-10-31")
    return s
}

private fun text(value: JSONObject) = JSONObject().put("content", JSONArray().put(JSONObject().put("type", "text").put("text", value.toString())))

private fun problem(message: String) = JSONObject().put("content", JSONArray().put(JSONObject().put("type", "text").put("text", message))).put("isError", true)

private fun ok(id: Any?, result: JSONObject) = JSONObject().put("jsonrpc", "2.0").put("id", id ?: JSONObject.NULL).put("result", result)

private fun bad(id: Any?, code: Int, message: String) =
    JSONObject().put("jsonrpc", "2.0").put("id", id ?: JSONObject.NULL).put("error", JSONObject().put("code", code).put("message", message))
