package app.kakie.lib

val TAGS = listOf("food", "coffee", "transport", "groceries", "shopping", "entertainment", "bills", "rent", "fuel", "medical", "travel", "salary")

private val RAWS = listOf(
    Triple("q1", "VM-HDFCBK", "Rs.1240.00 debited from A/c XX4521 on 02-10-26 to VPA swiggy@icici. UPI Ref 426781234."),
    Triple("q2", "AD-ICICIT", "INR 3,499.00 spent using ICICI Bank Card XX9012 on 02-Oct-26 on AMAZON PAY IN."),
    Triple("q3", "VM-HDFCBK", "Rs.386.00 debited from A/c XX4521 on 02-10-26 to VPA uber.india@axisbank."),
    Triple("q4", "JD-SBIINB", "Your A/c XX7710 is credited Rs.85,000.00 on 01/10/26 by NEFT-ACME TECHNOLOGIES PVT LTD SALARY OCT26."),
    Triple("q5", "VM-HDFCBK", "Rs.2150.00 debited from A/c XX4521 on 01-10-26 to VPA blinkit.payu@hdfcbank."),
    Triple("q6", "AX-AXISBK", "INR 12,340.00 debited from A/c no. XX3308 on 01-10-26 towards HDFC Bank Credit Card XX2207 payment."),
)

class SampleData(
    val people: List<Person>,
    val groups: List<Group>,
    val expenses: List<Expense>,
    val settlements: List<Settlement>,
    val queue: List<Draft>,
    val history: List<MonthSnapshot>,
    val budget: Double,
)

// Server ids are global, so every sample row is suffixed with the signed-in user's id.
fun sampleData(youId: String): SampleData {
    val tail = youId.take(8)
    fun id(x: String) = if (x == "you") youId else "$x-$tail"
    fun p(key: String, name: String, initials: String) = Person(id(key), name, initials)
    val people = listOf(
        p("aarav", "Aarav Mehta", "AM"),
        p("meera", "Meera Iyer", "MI"),
        p("kabir", "Kabir Shah", "KS"),
        p("riya", "Riya Das", "RD"),
        p("ishaan", "Ishaan Bhatt", "IB"),
        p("tara", "Tara Kapoor", "TK"),
    )
    fun g(key: String, name: String, icon: String, members: List<String>, note: String) =
        Group(id(key), name, icon, members.map(::id), note, sample = true)
    val groups = listOf(
        g("goa", "Goa trip", "beach", listOf("aarav", "meera", "kabir"), "18-22 Sep"),
        g("flat", "Flat 402", "office-building", listOf("riya", "kabir"), "Shared home"),
        g("lunch", "Friday lunches", "silverware-fork-knife", listOf("aarav", "ishaan", "tara"), "Office"),
    )
    fun solo(
        key: String, merchant: String, tag: String, rail: Rail, amount: Double, at: String,
        bank: String? = null, account: String? = null, income: Boolean = false, recurring: String? = null, recurId: String? = null,
    ) = Expense(
        id = id(key), merchant = merchant, amount = amount, at = at, tag = tag, rail = rail, income = income,
        recurring = recurring, recurId = recurId?.let(::id), bank = bank, account = account, sample = true,
    )
    fun ge(key: String, merchant: String, amount: Double, day: Int, tag: String, rail: Rail, group: String, payer: String, members: List<String>) =
        Expense(
            id = id(key), merchant = merchant, amount = amount, at = localNoon(2026, 9, day), tag = tag, rail = rail,
            groupId = id(group), payerId = id(payer), shares = equalShares(amount, members.map(::id)), sample = true,
        )
    val goa = listOf("you", "aarav", "meera", "kabir")
    val flat = listOf("you", "riya", "kabir")
    val lunch = listOf("you", "aarav", "ishaan", "tara")
    val sep = { d: Int -> localNoon(2026, 9, d) }
    val expenses = listOf(
        solo("t1", "Third Wave Coffee", "coffee", Rail.UPI, 320.0, sep(28), bank = "HDFC", account = "4521"),
        solo("t2", "Zepto", "groceries", Rail.UPI, 864.0, sep(28), bank = "HDFC", account = "4521"),
        solo("t3", "Rapido", "transport", Rail.UPI, 142.0, sep(27), bank = "HDFC", account = "4521"),
        solo("t4", "BookMyShow", "entertainment", Rail.CREDIT, 780.0, sep(27), bank = "ICICI", account = "9012"),
        solo("t5", "Apollo Pharmacy", "medical", Rail.UPI, 455.0, sep(27)),
        solo("t6", "Zepto", "groceries", Rail.UPI, 640.0, sep(27)),
        solo("t7", "Acme Technologies", "salary", Rail.NEFT, 85000.0, sep(25), income = true, bank = "SBI", account = "7710"),
        solo("t8", "Airtel Postpaid", "bills", Rail.CREDIT, 999.0, sep(23), recurring = "monthly", recurId = "airtel"),
        solo("t9", "Myntra", "shopping", Rail.CREDIT, 2799.0, sep(21), bank = "ICICI", account = "9012"),
        solo("t10", "Netflix", "entertainment", Rail.CREDIT, 649.0, sep(21), recurring = "monthly", recurId = "netflix"),
        solo("t11", "Swiggy", "food", Rail.UPI, 340.0, sep(21)),
        solo("t12", "Starbucks", "coffee", Rail.CREDIT, 620.0, sep(19)),
        solo("t13", "Ola", "transport", Rail.UPI, 280.0, sep(19)),
        solo("t14", "Amazon", "shopping", Rail.CREDIT, 1450.0, sep(18)),
        solo("t15", "Blinkit", "groceries", Rail.UPI, 2150.0, sep(18)),
        solo("t16", "Doctor visit", "medical", Rail.UPI, 800.0, sep(15)),
        solo("t17", "Petrol", "fuel", Rail.DEBIT, 1200.0, sep(13), bank = "Axis", account = "3308"),
        solo("t18", "Smoke House Deli", "food", Rail.CREDIT, 2840.0, sep(13)),
        solo("t19", "Zepto", "groceries", Rail.UPI, 1340.0, sep(12)),
        solo("t20", "Zomato", "food", Rail.UPI, 480.0, sep(9)),
        solo("t21", "Ola", "transport", Rail.UPI, 240.0, sep(9)),
        solo("t22", "Pharmacy", "medical", Rail.UPI, 350.0, sep(3)),
        solo("t23", "Swiggy", "food", Rail.UPI, 280.0, sep(3)),
        solo("t24", "Rent", "rent", Rail.UPI, 18000.0, sep(1), recurring = "monthly", recurId = "rent"),
        solo("o1", "Filter coffee", "coffee", Rail.UPI, 180.0, localNoon(2026, 10, 1)),
        solo("o2", "Swiggy", "food", Rail.UPI, 540.0, localNoon(2026, 10, 2)),
        ge("g1", "Dinner at Thalassa", 4800.0, 19, "food", Rail.UPI, "goa", "you", goa),
        ge("g2", "Scooter rentals", 3200.0, 18, "transport", Rail.UPI, "goa", "you", goa),
        ge("g3", "Villa, 3 nights", 24000.0, 20, "travel", Rail.NEFT, "goa", "meera", goa),
        ge("g4", "Seafood lunch", 2800.0, 19, "food", Rail.UPI, "goa", "kabir", goa),
        ge("f1", "Electricity", 3480.0, 23, "bills", Rail.UPI, "flat", "riya", flat),
        ge("f2", "Wi-Fi", 2100.0, 12, "bills", Rail.UPI, "flat", "riya", flat),
        ge("f3", "Groceries restock", 2460.0, 8, "groceries", Rail.UPI, "flat", "kabir", flat),
        ge("l1", "Bombay Canteen", 2480.0, 19, "food", Rail.UPI, "lunch", "you", lunch),
        ge("l2", "Meghana Foods", 1920.0, 12, "food", Rail.UPI, "lunch", "ishaan", lunch),
    )
    fun s(key: String, group: String, from: String, to: String, amount: Double, day: Int, method: String) =
        Settlement(id(key), id(group), id(from), id(to), amount, localNoon(2026, 9, day), method, sample = true)
    val settlements = listOf(
        s("set1", "goa", "aarav", "you", 1200.0, 25, "upi"),
        s("set2", "lunch", "ishaan", "you", 620.0, 20, "upi"),
        s("set3", "lunch", "tara", "you", 620.0, 20, "cash"),
    )
    val queue = RAWS.map { (key, sender, body) ->
        val parsed = parseSms(sender, body) ?: error("seed sms failed: $key")
        Draft(
            id = id(key), key = "sample|$key", sender = sender, body = body, sample = true,
            bank = parsed.bank, at = parsed.at ?: localNoon(2026, 10, 2), amount = parsed.amount,
            income = parsed.income, transfer = parsed.transfer, merchant = parsed.merchant,
            rail = parsed.rail, tag = parsed.tag, account = parsed.account,
        )
    }
    val history = listOf(
        MonthSnapshot(2026, 4, 41200.0, true),
        MonthSnapshot(2026, 5, 62400.0, true),
        MonthSnapshot(2026, 6, 38900.0, true),
        MonthSnapshot(2026, 7, 58300.0, true),
        MonthSnapshot(2026, 8, 67200.0, true),
    )
    return SampleData(people, groups, expenses, settlements, queue, history, 60000.0)
}
