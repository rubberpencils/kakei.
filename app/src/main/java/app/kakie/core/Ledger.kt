package app.kakie.core

import java.time.LocalDate
import java.time.LocalDateTime

private data class Net(val k: String, var v: Double)

fun tagSpend(expenses: List<Expense>, youId: String, tag: String, from: String, to: String) =
    round2(expenses.fold(0.0) { sum, e ->
        if (e.tag != tag || e.income || e.transfer || !inRange(e.at, from, to)) sum else sum + pocket(e, youId)
    })

fun detectSubs(expenses: List<Expense>): List<Pair<String, Double>> {
    val groups = linkedMapOf<String, MutableList<Expense>>()
    for (e in expenses) {
        if (e.income || e.transfer || e.sample || e.groupId != null) continue
        groups.getOrPut(e.merchant.lowercase()) { mutableListOf() }.add(e)
    }
    val out = mutableListOf<Pair<String, Double>>()
    for (list in groups.values) {
        val sorted = list.sortedBy { it.at }
        if (sorted.size < 3) continue
        var gaps = 0
        for (i in 1 until sorted.size) {
            val days = (parseAt(sorted[i].at) - parseAt(sorted[i - 1].at)) / 86_400_000.0
            val prev = sorted[i - 1].amount
            val next = sorted[i].amount
            if (days in 25.0..35.0 && kotlin.math.abs(prev - next) / maxOf(prev, next) <= 0.15) gaps += 1
        }
        if (gaps >= 2) out += sorted.last().merchant to sorted.last().amount
    }
    return out
}

private fun parseAt(iso: String): Long {
    val text = if (iso.length >= 19) iso.substring(0, 19) else iso
    return LocalDateTime.parse(text).toEpochSecond(java.time.ZoneOffset.UTC) * 1000
}

private fun expenseDebts(e: Expense): List<Debt> {
    val shares = e.shares ?: return emptyList()
    val paid = linkedMapOf<String, Double>()
    val list = if (!e.payers.isNullOrEmpty()) e.payers else if (e.payerId != null) listOf(Payer(e.payerId, e.amount)) else emptyList()
    for (p in list) paid[p.id] = round2((paid[p.id] ?: 0.0) + p.amount)
    if (paid.isEmpty()) return emptyList()
    val net = linkedMapOf<String, Double>()
    fun touch(id: String, d: Double) { net[id] = round2((net[id] ?: 0.0) + d) }
    for ((id, share) in shares) touch(id, -share)
    for ((id, v) in paid) touch(id, v)
    val cred = net.filter { it.value > dust }.map { Net(it.key, it.value) }.sortedByDescending { it.v }.toMutableList()
    val deb = net.filter { it.value < -dust }.map { Net(it.key, -it.value) }.sortedByDescending { it.v }.toMutableList()
    val out = mutableListOf<Debt>()
    var i = 0
    var j = 0
    while (i < cred.size && j < deb.size) {
        val amt = minOf(cred[i].v, deb[j].v)
        if (amt > dust) out += Debt(deb[j].k, cred[i].k, round2(amt))
        cred[i].v -= amt
        deb[j].v -= amt
        if (cred[i].v < dust) i += 1
        if (deb[j].v < dust) j += 1
    }
    return out
}

fun equalShares(amount: Double, ids: List<String>): Map<String, Double> {
    if (ids.isEmpty()) return emptyMap()
    val base = kotlin.math.floor((amount / ids.size) * 100.0) / 100.0
    val shares = linkedMapOf<String, Double>()
    var used = 0.0
    ids.forEachIndexed { i, id ->
        val v = if (i == ids.lastIndex) round2(amount - used) else base
        shares[id] = v
        used = round2(used + v)
    }
    return shares
}

fun pairDebts(expenses: List<Expense>, settlements: List<Settlement>, groupId: String): List<Debt> {
    val map = linkedMapOf<String, Double>()
    fun add(from: String, to: String, amt: Double) {
        if (from == to || amt <= 0) return
        val k = "$from|$to"
        map[k] = round2((map[k] ?: 0.0) + amt)
    }
    for (e in expenses) {
        if (e.groupId != groupId || e.shares == null) continue
        for (d in expenseDebts(e)) add(d.fromId, d.toId, d.amount)
    }
    for (s in settlements) {
        if (s.groupId != groupId) continue
        add(s.toId, s.fromId, s.amount)
    }
    val seen = mutableSetOf<String>()
    val out = mutableListOf<Debt>()
    for ((k, v) in map) {
        if (k in seen) continue
        val parts = k.split("|")
        val from = parts[0]
        val to = parts[1]
        val revK = "$to|$from"
        val rev = map[revK] ?: 0.0
        seen += k
        seen += revK
        val net = round2(v - rev)
        if (net > dust) out += Debt(from, to, net)
        else if (net < -dust) out += Debt(to, from, round2(-net))
    }
    return out.sortedByDescending { it.amount }
}

fun simplify(debts: List<Debt>): List<Debt> {
    val net = linkedMapOf<String, Double>()
    for (d in debts) {
        net[d.fromId] = round2((net[d.fromId] ?: 0.0) - d.amount)
        net[d.toId] = round2((net[d.toId] ?: 0.0) + d.amount)
    }
    val cred = net.filter { it.value > dust }.map { Net(it.key, it.value) }.sortedByDescending { it.v }.toMutableList()
    val deb = net.filter { it.value < -dust }.map { Net(it.key, -it.value) }.sortedByDescending { it.v }.toMutableList()
    val out = mutableListOf<Debt>()
    var i = 0
    var j = 0
    while (i < cred.size && j < deb.size) {
        val amt = minOf(cred[i].v, deb[j].v)
        if (amt > dust) out += Debt(deb[j].k, cred[i].k, round2(amt))
        cred[i].v -= amt
        deb[j].v -= amt
        if (cred[i].v < dust) i += 1
        if (deb[j].v < dust) j += 1
    }
    return out
}

private fun owesOnTo(pairs: List<Debt>, fromId: String, toId: String): Boolean {
    val seen = mutableSetOf(fromId)
    val queue = ArrayDeque<String>()
    queue.add(fromId)
    while (queue.isNotEmpty()) {
        val cur = queue.removeFirst()
        if (cur == toId) return true
        for (d in pairs) {
            if (d.fromId == cur && d.toId !in seen) {
                seen += d.toId
                queue.add(d.toId)
            }
        }
    }
    return false
}

fun reroutes(pairs: List<Debt>, simple: List<Debt>): List<Reroute> {
    val out = mutableListOf<Reroute>()
    for (p in pairs) {
        if (simple.any { it.fromId == p.fromId && it.toId == p.toId }) continue
        val to = simple.find { it.fromId == p.fromId && it.toId != p.toId && owesOnTo(pairs, p.toId, it.toId) } ?: continue
        out += Reroute(p.fromId, p.toId, to.toId, p.amount)
    }
    return out
}

fun whyYouPay(you: String, other: String, expenses: List<Expense>, settlements: List<Settlement>, groupId: String? = null): List<WhyLine> {
    val lines = mutableListOf<WhyLine>()
    for (e in expenses) {
        val shares = e.shares ?: continue
        if (e.payerId == null) continue
        if (groupId != null && e.groupId != groupId) continue
        if (groupId == null && e.groupId == null) continue
        val yours = shares[you] ?: 0.0
        val theirs = shares[other] ?: 0.0
        if (e.payerId == other && yours > 0) lines += WhyLine("share", e.merchant, yours, "owe", e.id)
        if (e.payerId == you && theirs > 0) lines += WhyLine("share", e.merchant, theirs, "owed", e.id)
    }
    for (s in settlements) {
        if (groupId != null && s.groupId != groupId) continue
        if (s.fromId == you && s.toId == other) lines += WhyLine("settlement", "You paid", s.amount, "owed")
        if (s.fromId == other && s.toId == you) lines += WhyLine("settlement", "They paid you", s.amount, "owe")
    }
    return lines
}

fun exactSteps(pairs: List<Debt>, simple: List<Debt>): List<ExactStep> {
    val left = pairs.map { it.copy() }.toMutableList()
    val out = mutableListOf<ExactStep>()
    for (s in simple) {
        val because = mutableListOf<Because>()
        var need = s.amount
        val direct = left.indexOfFirst { it.fromId == s.fromId && it.toId == s.toId && it.amount > dust }
        if (direct >= 0) {
            val take = minOf(left[direct].amount, need)
            left[direct] = left[direct].copy(amount = round2(left[direct].amount - take))
            need = round2(need - take)
        }
        for (hi in left.indices) {
            if (need <= dust) break
            val hop = left[hi]
            if (hop.fromId != s.fromId || hop.amount <= dust) continue
            val oi = left.indexOfFirst { it.fromId == hop.toId && it.toId == s.toId && it.amount > dust }
            if (oi < 0) continue
            val take = minOf(hop.amount, left[oi].amount, need)
            if (take <= dust) continue
            left[hi] = hop.copy(amount = round2(hop.amount - take))
            left[oi] = left[oi].copy(amount = round2(left[oi].amount - take))
            need = round2(need - take)
            because += Because(s.fromId, hop.toId, s.toId, round2(take))
        }
        out += ExactStep(s.fromId, s.toId, s.amount, because)
    }
    return out
}

fun groupDebts(expenses: List<Expense>, settlements: List<Settlement>, group: Group): List<Debt> {
    val pairs = pairDebts(expenses, settlements, group.id)
    return if (group.simplify == false) pairs else simplify(pairs)
}

fun memberNets(debts: List<Debt>): Map<String, Double> {
    val net = linkedMapOf<String, Double>()
    for (d in debts) {
        net[d.fromId] = round2((net[d.fromId] ?: 0.0) - d.amount)
        net[d.toId] = round2((net[d.toId] ?: 0.0) + d.amount)
    }
    return net
}

fun friendBalances(expenses: List<Expense>, settlements: List<Settlement>, groups: List<Group>, youId: String): List<FriendBalance> {
    val map = linkedMapOf<String, FriendBalance>()
    fun touch(id: String): FriendBalance {
        map[id]?.let { return it }
        return FriendBalance(id, 0.0, emptyList()).also { map[id] = it }
    }
    for (g in groups) {
        for (pid in g.memberIds) touch(pid)
        for (d in groupDebts(expenses, settlements, g)) {
            val other = when {
                d.toId == youId -> d.fromId
                d.fromId == youId -> d.toId
                else -> null
            } ?: continue
            val signed = if (d.toId == youId) d.amount else -d.amount
            val row = touch(other)
            map[other] = row.copy(net = round2(row.net + signed), groups = row.groups + (g.id to signed))
        }
    }
    map.remove(youId)
    return map.values.sortedByDescending { kotlin.math.abs(it.net) }
}

fun youBalances(expenses: List<Expense>, settlements: List<Settlement>, groups: List<Group>, youId: String): YouBalances {
    val owed = linkedMapOf<String, BalanceRow>()
    val owe = linkedMapOf<String, BalanceRow>()
    fun bump(map: MutableMap<String, BalanceRow>, id: String, groupId: String, amount: Double) {
        val row = map[id] ?: BalanceRow(id, 0.0, emptyList())
        map[id] = row.copy(amount = round2(row.amount + amount), lines = row.lines + BalanceLine(groupId, round2(amount)))
    }
    for (g in groups) {
        for (d in groupDebts(expenses, settlements, g)) {
            if (d.toId == youId) bump(owed, d.fromId, g.id, d.amount)
            else if (d.fromId == youId) bump(owe, d.toId, g.id, d.amount)
        }
    }
    fun list(m: Map<String, BalanceRow>) = m.values
        .map { it.copy(lines = it.lines.sortedByDescending { line -> line.amount }) }
        .sortedByDescending { it.amount }
    fun sum(rows: List<BalanceRow>) = round2(rows.sumOf { it.amount })
    val o = list(owed)
    val w = list(owe)
    return YouBalances(o, w, sum(o), sum(w))
}

fun cardBills(expenses: List<Expense>, youId: String): List<CardBill> {
    val cards = linkedMapOf<String, CardBill>()
    fun card(e: Expense): CardBill {
        val key = if (e.account != null) "${e.bank ?: ""}|${e.account}" else "card"
        return cards.getOrPut(key) { CardBill(key, if (e.account != null) e.bank else null, e.account, 0.0, mutableListOf(), null) }
    }
    val sorted = expenses.filter { !it.income }.sortedBy { it.at }
    for (e in sorted) {
        if (e.transfer) {
            val named = if (e.account != null) cards["${e.bank ?: ""}|${e.account}"] else null
            val target = named ?: cards.values.maxByOrNull { it.due }
            if (target == null) continue
            target.due = round2(maxOf(0.0, target.due - e.amount))
            target.lastPaid = e.at
            if (target.due < dust) target.charges.clear()
            continue
        }
        if (e.rail != "credit") continue
        if (e.groupId != null && e.payerId != null && e.payerId != youId) continue
        val c = card(e)
        c.due = round2(c.due + e.amount)
        c.charges.add(0, e)
    }
    return cards.values.filter { it.due >= dust }.sortedByDescending { it.due }
}

fun remainingOwed(expenses: List<Expense>, settlements: List<Settlement>): Map<String, Map<String, Double>> {
    val rem = linkedMapOf<String, MutableMap<String, Double>>()
    val groupIds = expenses.mapNotNull { it.groupId }.distinct()
    for (gid in groupIds) {
        val exps = expenses.filter { it.groupId == gid && it.shares != null && it.payerId != null }.sortedBy { it.at }
        for (e in exps) {
            val row = linkedMapOf<String, Double>()
            for ((id, share) in e.shares!!) if (id != e.payerId) row[id] = share
            rem[e.id] = row
        }
        val sets = settlements.filter { it.groupId == gid }.sortedBy { it.at }
        for (s in sets) {
            var left = s.amount
            for (e in exps) {
                if (e.payerId != s.toId) continue
                val row = rem[e.id] ?: continue
                val due = row[s.fromId] ?: 0.0
                val pay = minOf(due, left)
                row[s.fromId] = round2(due - pay)
                left = round2(left - pay)
                if (left < dust) break
            }
        }
    }
    return rem
}

fun owedBack(e: Expense, youId: String, rem: Map<String, Map<String, Double>>): Double {
    if (e.payerId != youId || e.groupId == null) return 0.0
    return round2((rem[e.id] ?: emptyMap()).values.sum())
}

fun youStillOwe(e: Expense, youId: String, rem: Map<String, Map<String, Double>>): Double {
    if (e.groupId == null || e.payerId == youId) return 0.0
    return round2(rem[e.id]?.get(youId) ?: 0.0)
}

fun pocket(e: Expense, youId: String): Double {
    if (e.income || e.transfer) return 0.0
    if (e.groupId == null) return e.amount
    if (!e.reflect) return 0.0
    return e.shares?.get(youId) ?: 0.0
}

fun countsAsSpend(e: Expense) = !e.income && !e.transfer

fun inRange(iso: String, from: String, to: String): Boolean {
    val k = dayKey(iso)
    return k >= from && k <= to
}

fun monthBounds(y: Int, m: Int): Pair<String, String> {
    val last = LocalDate.of(y, m, 1).lengthOfMonth()
    return "${y}-${pad(m)}-01" to "${y}-${pad(m)}-${pad(last)}"
}

data class Spend(val total: Double, val back: Double, val count: Int, val byDay: Map<String, Double>, val byTag: Map<String, Double>)

fun spendIn(expenses: List<Expense>, settlements: List<Settlement>, youId: String, from: String, to: String): Spend {
    val rem = remainingOwed(expenses, settlements)
    var total = 0.0
    var back = 0.0
    var count = 0
    val byDay = linkedMapOf<String, Double>()
    val byTag = linkedMapOf<String, Double>()
    for (e in expenses) {
        if (!countsAsSpend(e) || !inRange(e.at, from, to)) continue
        if (e.groupId != null && e.reflect) back += owedBack(e, youId, rem)
        val amount = pocket(e, youId)
        if (amount <= 0) continue
        total += amount
        count += 1
        val key = dayKey(e.at)
        byDay[key] = (byDay[key] ?: 0.0) + amount
        val tag = e.tag ?: "untagged"
        byTag[tag] = (byTag[tag] ?: 0.0) + amount
    }
    return Spend(round2(total), round2(back), count, byDay, byTag)
}

data class Flow(val spent: Double, val owed: Double, val byDay: Map<String, Double>)

fun cashFlow(expenses: List<Expense>, settlements: List<Settlement>, youId: String, from: String, to: String): Flow {
    val rem = remainingOwed(expenses, settlements)
    var spent = 0.0
    var owed = 0.0
    val byDay = linkedMapOf<String, Double>()
    for (e in expenses) {
        if (!inRange(e.at, from, to) || (e.groupId != null && !e.reflect)) continue
        if (!countsAsSpend(e)) continue
        owed += owedBack(e, youId, rem)
        val v = pocket(e, youId)
        if (v <= 0) continue
        spent += v
        val key = dayKey(e.at)
        byDay[key] = (byDay[key] ?: 0.0) + v
    }
    return Flow(round2(spent), round2(owed), byDay)
}

data class TotalRow(val id: String, val paid: Double, val share: Double, val net: Double)

fun groupTotals(expenses: List<Expense>, group: Group, youId: String): Pair<Double, List<TotalRow>> {
    val ids = listOf(youId) + group.memberIds
    val paid = linkedMapOf<String, Double>()
    val share = linkedMapOf<String, Double>()
    ids.forEach { paid[it] = 0.0; share[it] = 0.0 }
    var total = 0.0
    for (e in expenses) {
        if (e.groupId != group.id || e.shares == null || e.payerId == null) continue
        total += e.amount
        paid[e.payerId] = round2((paid[e.payerId] ?: 0.0) + e.amount)
        for ((id, v) in e.shares) share[id] = round2((share[id] ?: 0.0) + v)
    }
    return round2(total) to ids.map { id -> TotalRow(id, paid[id] ?: 0.0, share[id] ?: 0.0, round2((paid[id] ?: 0.0) - (share[id] ?: 0.0))) }
}

fun percentShares(amount: Double, pct: Map<String, Double>): Map<String, Double> {
    val ids = pct.filter { it.value > 0 }.keys.toList()
    val shares = linkedMapOf<String, Double>()
    var used = 0.0
    ids.forEachIndexed { i, id ->
        val v = if (i == ids.lastIndex) round2(amount - used) else round2((amount * (pct[id] ?: 0.0)) / 100.0)
        shares[id] = v
        used = round2(used + v)
    }
    return shares
}

fun dueRecurring(expenses: List<Expense>, nowIso: String): List<Expense> {
    val latest = linkedMapOf<String, Expense>()
    for (e in expenses) {
        val rid = e.recurId ?: continue
        if (e.groupId != null) continue
        val prev = latest[rid]
        if (prev == null || prev.at < e.at) latest[rid] = e
    }
    val ids = expenses.map { it.id }.toMutableSet()
    val out = mutableListOf<Expense>()
    val now = LocalDateTime.parse(nowIso.take(19))
    for (e in latest.values) {
        if (e.recurring == null) continue
        val start = LocalDateTime.parse(e.at.take(19))
        for (n in 1..60) {
            val due = if (e.recurring == "monthly") {
                val shifted = start.toLocalDate().plusMonths(n.toLong())
                shifted.atTime(12, 0)
            } else start.plusDays(7L * n)
            if (due.isAfter(now)) break
            val at = localNoon(due.year, due.monthValue, due.dayOfMonth)
            val id = "${e.recurId}-${dayKey(at).replace("-", "")}"
            if (id !in ids) out += e.copy(id = id, at = at)
        }
    }
    return out
}

fun personName(people: List<Person>, you: Person, id: String): String {
    if (id == you.id) return "You"
    return people.find { it.id == id }?.name ?: "Someone"
}
