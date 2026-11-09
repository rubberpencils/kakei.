package app.kakie.lib

import java.time.LocalDateTime
import java.time.YearMonth
import kotlin.math.abs
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min

data class Debt(val fromId: String, val toId: String, val amount: Double)

data class Reroute(val fromId: String, val viaId: String, val toId: String, val amount: Double)

data class GroupNet(val groupId: String, val net: Double)

data class FriendBalance(val id: String, val net: Double, val groups: List<GroupNet>)

data class YouNet(val owed: Double, val owe: Double, val net: Double)

/** Per expense, per person: what they still owe the payer after settlements. */
typealias Remaining = Map<String, Map<String, Double>>

fun tagSpend(expenses: List<Expense>, youId: String, tag: String, from: String, to: String): Double {
    val rem = remainingOwed(expenses, emptyList())
    return round2(expenses.sumOf { e ->
        if (e.tag != tag || e.income || e.transfer || !inRange(e.at, from, to)) 0.0 else pocket(e, youId, rem)
    })
}

fun round2(n: Double) = jsRound(n * 100) / 100.0

fun equalShares(amount: Double, ids: List<String>): Map<String, Double> {
    val shares = linkedMapOf<String, Double>()
    if (ids.isEmpty()) return shares
    val base = floor((amount / ids.size) * 100) / 100
    var used = 0.0
    ids.forEachIndexed { i, id ->
        val v = if (i == ids.lastIndex) round2(amount - used) else base
        shares[id] = v
        used = round2(used + v)
    }
    return shares
}

private const val DUST = 0.005

/** One payer, or several. Each person's share minus what they paid is what they owe. */
private fun expenseDebts(e: Expense): List<Debt> {
    val shares = e.shares ?: return emptyList()
    val paid = linkedMapOf<String, Double>()
    val list = if (!e.payers.isNullOrEmpty()) e.payers else if (e.payerId != null) listOf(SharePayer(e.payerId, e.amount)) else emptyList()
    for (p in list) paid[p.id] = round2((paid[p.id] ?: 0.0) + p.amount)
    if (paid.isEmpty()) return emptyList()
    val net = linkedMapOf<String, Double>()
    fun touch(id: String, d: Double) { net[id] = round2((net[id] ?: 0.0) + d) }
    for ((id, share) in shares) touch(id, -share)
    for ((id, v) in paid) touch(id, v)
    val cred = net.filter { it.value > DUST }.map { it.key to it.value }.sortedByDescending { it.second }.toMutableList()
    val deb = net.filter { it.value < -DUST }.map { it.key to -it.value }.sortedByDescending { it.second }.toMutableList()
    val out = mutableListOf<Debt>()
    var i = 0
    var j = 0
    val c = cred.map { it.first to it.second }.toMutableList()
    val d = deb.map { it.first to it.second }.toMutableList()
    while (i < c.size && j < d.size) {
        val amt = minOf(c[i].second, d[j].second)
        if (amt > DUST) out += Debt(d[j].first, c[i].first, round2(amt))
        c[i] = c[i].first to (c[i].second - amt)
        d[j] = d[j].first to (d[j].second - amt)
        if (c[i].second < DUST) i += 1
        if (d[j].second < DUST) j += 1
    }
    return out
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
        val (from, to) = k.split("|")
        val revK = "$to|$from"
        val rev = map[revK] ?: 0.0
        seen += k
        seen += revK
        val net = round2(v - rev)
        if (net > 0.5) out += Debt(from, to, net)
        else if (net < -0.5) out += Debt(to, from, round2(-net))
    }
    return out.sortedByDescending { it.amount }
}

fun simplify(debts: List<Debt>): List<Debt> {
    val net = linkedMapOf<String, Double>()
    for (d in debts) {
        net[d.fromId] = round2((net[d.fromId] ?: 0.0) - d.amount)
        net[d.toId] = round2((net[d.toId] ?: 0.0) + d.amount)
    }
    class Bal(val k: String, var v: Double)
    val cred = net.filter { it.value > 0.5 }.map { Bal(it.key, it.value) }.sortedByDescending { it.v }
    val deb = net.filter { it.value < -0.5 }.map { Bal(it.key, -it.value) }.sortedByDescending { it.v }
    val out = mutableListOf<Debt>()
    var i = 0
    var j = 0
    while (i < cred.size && j < deb.size) {
        val amt = min(cred[i].v, deb[j].v)
        if (amt > 0.5) out += Debt(deb[j].k, cred[i].k, round2(amt))
        cred[i].v -= amt
        deb[j].v -= amt
        if (cred[i].v < 0.5) i += 1
        if (deb[j].v < 0.5) j += 1
    }
    return out
}

private fun owesOnTo(pairs: List<Debt>, fromId: String, toId: String): Boolean {
    val seen = mutableSetOf(fromId)
    val queue = ArrayDeque(listOf(fromId))
    while (queue.isNotEmpty()) {
        val cur = queue.removeFirst()
        if (cur == toId) return true
        for (d in pairs) {
            if (d.fromId == cur && d.toId !in seen) {
                seen += d.toId
                queue += d.toId
            }
        }
    }
    return false
}

/** Each pairwise debt that simplification removed, and who the payer now pays instead. */
fun reroutes(pairs: List<Debt>, simple: List<Debt>): List<Reroute> {
    val out = mutableListOf<Reroute>()
    for (p in pairs) {
        if (simple.any { it.fromId == p.fromId && it.toId == p.toId }) continue
        val to = simple.find { it.fromId == p.fromId && it.toId != p.toId && owesOnTo(pairs, p.toId, it.toId) }
        if (to != null) out += Reroute(p.fromId, p.toId, to.toId, p.amount)
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
    val nets = linkedMapOf<String, Double>()
    val per = linkedMapOf<String, MutableList<GroupNet>>()
    fun touch(id: String) {
        if (id !in nets) {
            nets[id] = 0.0
            per[id] = mutableListOf()
        }
    }
    for (g in groups) {
        for (pid in g.memberIds) touch(pid)
        for (d in groupDebts(expenses, settlements, g)) {
            val other = if (d.toId == youId) d.fromId else if (d.fromId == youId) d.toId else null
            if (other == null) continue
            val signed = if (d.toId == youId) d.amount else -d.amount
            touch(other)
            nets[other] = round2(nets.getValue(other) + signed)
            per.getValue(other) += GroupNet(g.id, signed)
        }
    }
    nets.remove(youId)
    return nets.map { (id, net) -> FriendBalance(id, net, per.getValue(id)) }.sortedByDescending { abs(it.net) }
}

fun youNet(debts: List<Debt>, youId: String): YouNet {
    var owed = 0.0
    var owe = 0.0
    for (d in debts) {
        if (d.toId == youId) owed += d.amount
        if (d.fromId == youId) owe += d.amount
    }
    return YouNet(round2(owed), round2(owe), round2(owed - owe))
}

fun remainingOwed(expenses: List<Expense>, settlements: List<Settlement>): Remaining {
    val rem = linkedMapOf<String, LinkedHashMap<String, Double>>()
    val groupIds = expenses.mapNotNull { it.groupId }.distinct()
    for (gid in groupIds) {
        val exps = expenses.filter { it.groupId == gid && it.shares != null && it.payerId != null }.sortedBy { it.at }
        for (e in exps) {
            rem[e.id] = linkedMapOf<String, Double>().apply {
                for ((id, share) in e.shares!!) if (id != e.payerId) put(id, share)
            }
        }
        for (s in settlements.filter { it.groupId == gid }.sortedBy { it.at }) {
            var left = s.amount
            for (e in exps) {
                if (e.payerId != s.toId) continue
                val row = rem.getValue(e.id)
                val due = row[s.fromId] ?: 0.0
                val pay = min(due, left)
                row[s.fromId] = round2(due - pay)
                left = round2(left - pay)
                if (left < 0.5) break
            }
        }
    }
    return rem
}

fun owedBack(e: Expense, youId: String, rem: Remaining): Double {
    if (e.payerId != youId || e.groupId == null) return 0.0
    return round2((rem[e.id] ?: emptyMap()).values.sum())
}

fun youStillOwe(e: Expense, youId: String, rem: Remaining): Double {
    if (e.groupId == null || e.payerId == youId) return 0.0
    return round2(rem[e.id]?.get(youId) ?: 0.0)
}

fun pocket(e: Expense, youId: String, rem: Remaining): Double {
    if (e.income || e.transfer) return 0.0
    if (e.groupId == null) return e.amount
    if (!e.reflect) return 0.0
    val yourShare = e.shares?.get(youId) ?: 0.0
    if (e.payerId == youId) return round2(yourShare + owedBack(e, youId, rem))
    return yourShare
}

fun countsAsSpend(e: Expense) = !e.income && !e.transfer

fun inRange(iso: String, from: String, to: String): Boolean {
    val k = dayKey(iso)
    return k >= from && k <= to
}

data class Bounds(val from: String, val to: String)

fun monthBounds(y: Int, m: Int): Bounds {
    val last = YearMonth.of(y, m).lengthOfMonth()
    return Bounds("$y-${pad(m)}-01", "$y-${pad(m)}-${pad(last)}")
}

data class DayTotal(val total: Double, val count: Int)

data class Merchant(val n: Int, val v: Double)

data class Spend(
    val total: Double,
    val count: Int,
    val byDay: Map<String, DayTotal>,
    val byTag: Map<String, Double>,
    val byMerchant: Map<String, Merchant>,
)

fun spendIn(expenses: List<Expense>, settlements: List<Settlement>, youId: String, from: String, to: String): Spend {
    val rem = remainingOwed(expenses, settlements)
    var total = 0.0
    var count = 0
    val byDay = linkedMapOf<String, DayTotal>()
    val byTag = linkedMapOf<String, Double>()
    val byMerchant = linkedMapOf<String, Merchant>()
    for (e in expenses) {
        if (!countsAsSpend(e)) continue
        if (!inRange(e.at, from, to)) continue
        val v = pocket(e, youId, rem)
        if (v <= 0 && e.groupId != null && !e.reflect) continue
        val amount = if (e.groupId != null) v else e.amount
        if (amount <= 0) continue
        total += amount
        count += 1
        val key = dayKey(e.at)
        val day = byDay[key] ?: DayTotal(0.0, 0)
        byDay[key] = DayTotal(day.total + amount, day.count + 1)
        val tag = e.tag ?: "untagged"
        byTag[tag] = (byTag[tag] ?: 0.0) + amount
        val merch = byMerchant[e.merchant] ?: Merchant(0, 0.0)
        byMerchant[e.merchant] = Merchant(merch.n + 1, merch.v + amount)
    }
    return Spend(round2(total), count, byDay, byTag, byMerchant)
}

sealed interface Moved {
    val at: String

    data class Exp(val e: Expense) : Moved {
        override val at get() = e.at
    }

    data class Set(val s: Settlement) : Moved {
        override val at get() = s.at
    }
}

data class CashFlow(
    val out: Double,
    val back: Double,
    val net: Double,
    val owed: Double,
    val real: Double,
    val recurring: Double,
    val count: Int,
    val items: List<Moved>,
    val byDay: Map<String, Double>,
    val byTag: Map<String, Double>,
    val byMerchant: Map<String, Merchant>,
)

/**
 * Money that actually left or came back: your own spends, the full amount of group bills you paid,
 * and settle-ups. `net` is out minus repayments; `owed` is what is still coming back on bills in range.
 */
fun cashFlow(expenses: List<Expense>, settlements: List<Settlement>, youId: String, from: String, to: String): CashFlow {
    val rem = remainingOwed(expenses, settlements)
    var out = 0.0
    var back = 0.0
    var owed = 0.0
    var recurring = 0.0
    var count = 0
    val items = mutableListOf<Moved>()
    val byDay = linkedMapOf<String, Double>()
    val byTag = linkedMapOf<String, Double>()
    val byMerchant = linkedMapOf<String, Merchant>()
    fun spend(at: String, v: Double) {
        out += v
        val k = dayKey(at)
        byDay[k] = (byDay[k] ?: 0.0) + v
    }
    for (e in expenses) {
        if (!inRange(e.at, from, to) || (e.groupId != null && !(e.reflect && e.payerId == youId))) continue
        items += Moved.Exp(e)
        if (!countsAsSpend(e)) continue
        spend(e.at, e.amount)
        count += 1
        owed += owedBack(e, youId, rem)
        if (e.recurring != null) recurring += e.amount
        val tag = e.tag ?: "untagged"
        byTag[tag] = (byTag[tag] ?: 0.0) + e.amount
        val merch = byMerchant[e.merchant] ?: Merchant(0, 0.0)
        byMerchant[e.merchant] = Merchant(merch.n + 1, merch.v + e.amount)
    }
    for (s in settlements) {
        if (!inRange(s.at, from, to) || (s.fromId != youId && s.toId != youId)) continue
        items += Moved.Set(s)
        if (s.fromId == youId) spend(s.at, s.amount) else back += s.amount
    }
    val sorted = items.sortedByDescending { it.at }
    val net = max(0.0, out - back)
    return CashFlow(
        out = round2(out),
        back = round2(back),
        net = round2(net),
        owed = round2(min(owed, net)),
        real = round2(max(0.0, net - owed)),
        recurring = round2(recurring),
        count = count,
        items = sorted,
        byDay = byDay,
        byTag = byTag,
        byMerchant = byMerchant,
    )
}

data class TotalRow(val id: String, val paid: Double, val share: Double, val net: Double)

data class GroupTotals(val total: Double, val rows: List<TotalRow>)

fun groupTotals(expenses: List<Expense>, group: Group, youId: String): GroupTotals {
    val ids = listOf(youId) + group.memberIds
    val paid = linkedMapOf<String, Double>()
    val share = linkedMapOf<String, Double>()
    ids.forEach {
        paid[it] = 0.0
        share[it] = 0.0
    }
    var total = 0.0
    for (e in expenses) {
        if (e.groupId != group.id || e.shares == null || e.payerId == null) continue
        total += e.amount
        paid[e.payerId] = round2((paid[e.payerId] ?: 0.0) + e.amount)
        for ((id, v) in e.shares) share[id] = round2((share[id] ?: 0.0) + v)
    }
    return GroupTotals(
        round2(total),
        ids.map { id ->
            val p = paid[id] ?: 0.0
            val s = share[id] ?: 0.0
            TotalRow(id, p, s, round2(p - s))
        },
    )
}

fun percentShares(amount: Double, pct: Map<String, Double>): Map<String, Double> {
    val ids = pct.keys.filter { (pct[it] ?: 0.0) > 0 }
    val shares = linkedMapOf<String, Double>()
    var used = 0.0
    ids.forEachIndexed { i, id ->
        val v = if (i == ids.lastIndex) round2(amount - used) else round2((amount * pct.getValue(id)) / 100)
        shares[id] = v
        used = round2(used + v)
    }
    return shares
}

/** Ids are derived from the series and date so two devices posting the same repeat agree on one row. */
fun dueRecurring(expenses: List<Expense>, now: LocalDateTime = LocalDateTime.now()): List<Expense> {
    val latest = linkedMapOf<String, Expense>()
    for (e in expenses) {
        if (e.recurId == null || e.groupId != null) continue
        val prev = latest[e.recurId]
        if (prev == null || prev.at < e.at) latest[e.recurId] = e
    }
    val ids = expenses.map { it.id }.toSet()
    val out = mutableListOf<Expense>()
    for (e in latest.values) {
        if (e.recurring == null) continue
        val start = parseAt(e.at)
        for (n in 1..60) {
            val dueDate = if (e.recurring == "monthly") {
                val ym = YearMonth.from(start).plusMonths(n.toLong())
                ym.atDay(min(start.dayOfMonth, ym.lengthOfMonth()))
            } else {
                start.toLocalDate().plusDays(7L * n)
            }
            if (dueDate.atTime(12, 0) > now) break
            val at = localNoon(dueDate.year, dueDate.monthValue, dueDate.dayOfMonth)
            val id = "${e.recurId}-${dayKey(at).replace("-", "")}"
            if (id !in ids) out += e.copy(id = id, at = at)
        }
    }
    return out
}

data class Account(val bank: String, val account: String, val count: Int, val credit: Boolean)

fun accountsFrom(expenses: List<Expense>): List<Account> {
    val map = linkedMapOf<String, Account>()
    for (e in expenses) {
        if (e.account == null) continue
        val key = "${e.bank ?: ""}|${e.account}"
        val row = map[key] ?: Account(e.bank ?: "Bank", e.account, 0, false)
        map[key] = row.copy(count = row.count + 1, credit = row.credit || e.rail == Rail.CREDIT)
    }
    return map.values.sortedByDescending { it.count }
}

data class BalanceLine(val groupId: String, val amount: Double)
data class BalanceRow(val id: String, var amount: Double, val lines: MutableList<BalanceLine>)
data class YouBalances(val owed: List<BalanceRow>, val owe: List<BalanceRow>, val owedTotal: Double, val oweTotal: Double)

fun youBalances(expenses: List<Expense>, settlements: List<Settlement>, groups: List<Group>, youId: String): YouBalances {
    val owed = linkedMapOf<String, BalanceRow>()
    val owe = linkedMapOf<String, BalanceRow>()
    fun bump(map: MutableMap<String, BalanceRow>, id: String, groupId: String, amount: Double) {
        val row = map.getOrPut(id) { BalanceRow(id, 0.0, mutableListOf()) }
        row.amount = round2(row.amount + amount)
        row.lines += BalanceLine(groupId, round2(amount))
    }
    for (g in groups) {
        for (d in groupDebts(expenses, settlements, g)) {
            if (d.toId == youId) bump(owed, d.fromId, g.id, d.amount)
            else if (d.fromId == youId) bump(owe, d.toId, g.id, d.amount)
        }
    }
    fun list(m: Map<String, BalanceRow>) = m.values.map { it.copy(lines = it.lines.sortedByDescending { l -> l.amount }.toMutableList()) }.sortedByDescending { it.amount }
    val o = list(owed)
    val w = list(owe)
    return YouBalances(o, w, round2(o.sumOf { it.amount }), round2(w.sumOf { it.amount }))
}

data class CardBill(val key: String, val bank: String?, val account: String?, var due: Double, val charges: MutableList<Expense>, var lastPaid: String?)

fun cardBills(expenses: List<Expense>, youId: String): List<CardBill> {
    val cards = linkedMapOf<String, CardBill>()
    fun card(e: Expense): CardBill {
        val key = if (e.account != null) "${e.bank ?: ""}|${e.account}" else "card"
        return cards.getOrPut(key) { CardBill(key, if (e.account != null) e.bank else null, e.account, 0.0, mutableListOf(), null) }
    }
    val sorted = expenses.filter { !it.income }.sortedBy { it.at }
    for (e in sorted) {
        if (e.transfer) {
            val target = (e.account?.let { cards["${e.bank ?: ""}|$it"] }) ?: cards.values.maxByOrNull { it.due }
            if (target == null) continue
            target.due = round2(maxOf(0.0, target.due - e.amount))
            target.lastPaid = e.at
            if (target.due < DUST) target.charges.clear()
            continue
        }
        if (e.rail != Rail.CREDIT) continue
        if (e.groupId != null && e.payerId != null && e.payerId != youId) continue
        val c = card(e)
        c.due = round2(c.due + e.amount)
        c.charges.add(0, e)
    }
    return cards.values.filter { it.due >= DUST }.sortedByDescending { it.due }
}

fun personName(people: List<Person>, you: Person, id: String): String {
    if (id == you.id) return "You"
    return people.find { it.id == id }?.name ?: "Someone"
}
