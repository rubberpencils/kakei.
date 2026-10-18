package app.kakie.core

data class Person(val id: String, val name: String, val initials: String, val claimed: Boolean = false)

data class Group(
    val id: String,
    val name: String,
    val icon: String = "group",
    val memberIds: List<String> = emptyList(),
    val note: String = "",
    val code: String? = null,
    val owner: Boolean = false,
    val sample: Boolean = false,
    val simplify: Boolean? = null,
    val kind: String? = null,
)

data class Payer(val id: String, val amount: Double)

data class SplitItem(val name: String, val amount: Double, val memberIds: List<String>)

data class Expense(
    val id: String,
    val merchant: String,
    val amount: Double,
    val at: String,
    val tag: String? = null,
    val rail: String = "upi",
    val income: Boolean = false,
    val transfer: Boolean = false,
    val recurring: String? = null,
    val recurId: String? = null,
    val groupId: String? = null,
    val payerId: String? = null,
    val shares: Map<String, Double>? = null,
    val reflect: Boolean = true,
    val account: String? = null,
    val bank: String? = null,
    val note: String? = null,
    val sample: Boolean = false,
    val payers: List<Payer>? = null,
    val items: List<SplitItem>? = null,
)

data class Settlement(
    val id: String,
    val groupId: String,
    val fromId: String,
    val toId: String,
    val amount: Double,
    val at: String,
    val sample: Boolean = false,
)

data class Draft(
    val id: String,
    val key: String,
    val sender: String,
    val bank: String,
    val body: String,
    val at: String,
    val amount: Double,
    val income: Boolean,
    val transfer: Boolean,
    val merchant: String,
    val rail: String,
    val tag: String?,
    val account: String?,
    val sample: Boolean = false,
)

data class MonthSnapshot(val y: Int, val m: Int, val spent: Double, val sample: Boolean = false)

data class Debt(val fromId: String, val toId: String, val amount: Double)

data class Reroute(val fromId: String, val viaId: String, val toId: String, val amount: Double)

data class WhyLine(val kind: String, val label: String, val amount: Double, val direction: String, val expenseId: String? = null)

data class Because(val fromId: String, val viaId: String, val toId: String, val amount: Double)

data class ExactStep(val fromId: String, val toId: String, val amount: Double, val because: List<Because>)

data class FriendBalance(val id: String, val net: Double, val groups: List<Pair<String, Double>>)

data class BalanceLine(val groupId: String, val amount: Double)

data class BalanceRow(val id: String, val amount: Double, val lines: List<BalanceLine>)

data class YouBalances(val owed: List<BalanceRow>, val owe: List<BalanceRow>, val owedTotal: Double, val oweTotal: Double)

data class CardBill(
    val key: String,
    val bank: String?,
    val account: String?,
    var due: Double,
    val charges: MutableList<Expense>,
    var lastPaid: String?,
)

data class FormatRule(
    val sender: String,
    val amountBefore: String,
    val amountAfter: String,
    val merchantBefore: String,
    val merchantAfter: String,
)

data class MerchantRule(val key: String, val tag: String? = null, val groupId: String? = null)

data class Hit(val merchant: String, val amount: Double, val at: Long)

data class ParsedSms(
    val bank: String,
    val amount: Double,
    val income: Boolean,
    val transfer: Boolean,
    val merchant: String,
    val rail: String,
    val tag: String?,
    val account: String?,
    val at: String?,
)
