package app.kakie.lib

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

@Serializable
enum class Rail(val label: String, val icon: String) {
    @SerialName("upi") UPI("UPI", "qrcode"),
    @SerialName("debit") DEBIT("Debit", "credit-card-outline"),
    @SerialName("credit") CREDIT("Credit", "credit-card"),
    @SerialName("neft") NEFT("NEFT", "bank-outline"),
    @SerialName("imps") IMPS("IMPS", "bank-transfer"),
    @SerialName("cash") CASH("Cash", "cash"),
}

@Serializable
data class Person(
    val id: String,
    val name: String,
    val initials: String,
    val claimed: Boolean? = null,
    val vpa: String? = null,
)

@Serializable
data class Group(
    val id: String,
    val name: String,
    val icon: String,
    val memberIds: List<String> = emptyList(),
    val note: String = "",
    val code: String? = null,
    val owner: Boolean? = null,
    val sample: Boolean? = null,
    val simplify: Boolean? = null,
)

@Serializable
data class Expense(
    val id: String,
    val merchant: String,
    val amount: Double,
    val at: String,
    val tag: String? = null,
    val rail: Rail,
    val income: Boolean = false,
    val transfer: Boolean = false,
    /** "weekly" or "monthly". */
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
)

@Serializable
data class Settlement(
    val id: String,
    val groupId: String,
    val fromId: String,
    val toId: String,
    val amount: Double,
    val at: String,
    /** "upi" or "cash". */
    val method: String,
    val sample: Boolean = false,
)

@Serializable
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
    val rail: Rail,
    val tag: String? = null,
    val account: String? = null,
    val sample: Boolean = false,
)

@Serializable
data class MonthSnapshot(val y: Int, val m: Int, val spent: Double, val sample: Boolean = false)

@Serializable
data class GroupPatch(
    val id: String,
    val name: String,
    val icon: String,
    val note: String,
    val sample: Boolean? = null,
    val simplify: Boolean? = null,
)

@Serializable
data class NewPerson(val id: String, val name: String)

@Serializable
data class Prefs(val budget: Double? = null, val tags: List<String>? = null, val history: List<MonthSnapshot>? = null)

@Serializable
sealed interface Op

@Serializable @SerialName("group.upsert") data class GroupUpsert(val group: GroupPatch) : Op
@Serializable @SerialName("group.delete") data class GroupDelete(val id: String) : Op
@Serializable @SerialName("person.add") data class PersonAdd(val groupId: String, val person: NewPerson) : Op
@Serializable @SerialName("expense.upsert") data class ExpenseUpsert(val expense: Expense) : Op
@Serializable @SerialName("expense.delete") data class ExpenseDelete(val id: String) : Op
@Serializable @SerialName("settlement.upsert") data class SettlementUpsert(val settlement: Settlement) : Op
@Serializable @SerialName("settlement.delete") data class SettlementDelete(val id: String) : Op
@Serializable @SerialName("prefs.set") data class PrefsSet(val prefs: Prefs) : Op

/** Null fields are left alone by the server; an empty [vpa] removes the UPI ID. */
@Serializable @SerialName("me.set") data class MeSet(val name: String? = null, val vpa: String? = null) : Op

@Serializable
data class Queued(val qid: String, val op: Op)

@Serializable
data class RemoteYou(val id: String, val name: String, val phone: String, val vpa: String? = null)

@Serializable
data class RemotePerson(val id: String, val name: String, val claimed: Boolean = false, val vpa: String? = null)

@Serializable
data class Remote(
    val you: RemoteYou,
    val people: List<RemotePerson>,
    val groups: List<Group>,
    val expenses: List<Expense>,
    val settlements: List<Settlement>,
    val prefs: Prefs,
)

@Serializable
data class InviteGroup(val id: String, val name: String, val icon: String, val note: String = "")

@Serializable
data class InviteMember(val id: String, val name: String, val claimable: Boolean)

@Serializable
data class Invite(val group: InviteGroup, val joined: Boolean, val members: List<InviteMember>)

val json = Json {
    ignoreUnknownKeys = true
    encodeDefaults = true
    explicitNulls = false
    coerceInputValues = true
}
