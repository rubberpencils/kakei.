package app.kakie.lib

import java.time.LocalDateTime
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class SelfCheckTest {
    private val samples = listOf(
        Triple(
            "VM-HDFCBK", "Rs.1240.00 debited from A/c XX4521 on 28-09-26 to VPA swiggy@icici. UPI Ref 426781234.",
            mapOf("amount" to 1240.0, "income" to false, "rail" to Rail.UPI, "merchant" to "Swiggy", "tag" to "food", "account" to "4521", "bank" to "HDFC"),
        ),
        Triple(
            "AD-ICICIT", "INR 3,499.00 spent using ICICI Bank Card XX9012 on 28-Sep-26 on AMAZON PAY IN.",
            mapOf("amount" to 3499.0, "income" to false, "rail" to Rail.CREDIT, "merchant" to "Amazon", "tag" to "shopping", "account" to "9012"),
        ),
        Triple(
            "VM-HDFCBK", "Rs.386.00 debited from A/c XX4521 on 28-09-26 to VPA uber.india@axisbank.",
            mapOf("amount" to 386.0, "rail" to Rail.UPI, "merchant" to "Uber", "tag" to "transport"),
        ),
        Triple(
            "JD-SBIINB", "Your A/c XX7710 is credited Rs.85,000.00 on 25/09/26 by NEFT-ACME TECHNOLOGIES PVT LTD SALARY SEP26.",
            mapOf("amount" to 85000.0, "income" to true, "rail" to Rail.NEFT, "merchant" to "Acme Technologies", "tag" to "salary"),
        ),
        Triple(
            "VM-HDFCBK", "Rs.2150.00 debited from A/c XX4521 on 27-09-26 to VPA blinkit.payu@hdfcbank.",
            mapOf("merchant" to "Blinkit", "tag" to "groceries", "rail" to Rail.UPI),
        ),
        Triple(
            "AX-AXISBK", "INR 12,340.00 debited from A/c no. XX3308 on 27-09-26 towards HDFC Bank Credit Card XX2207 payment.",
            mapOf("amount" to 12340.0, "transfer" to true, "tag" to "bills", "merchant" to "Card bill", "account" to "3308"),
        ),
    )

    private val shares = equalShares(4800.0, listOf("ananya", "aarav", "meera", "kabir"))
    private val dinner = Expense(
        id = "d", merchant = "Dinner", amount = 4800.0, at = "2026-09-19T12:00:00", tag = "food", rail = Rail.UPI,
        groupId = "goa", payerId = "ananya", shares = shares,
    )
    private val sets = listOf(Settlement("s", "goa", "aarav", "ananya", 1200.0, "2026-09-25T12:00:00", "upi"))

    @Test
    fun parser() {
        for ((sender, body, expect) in samples) {
            val got = parseSms(sender, body) ?: error(body)
            val fields = mapOf(
                "amount" to got.amount, "income" to got.income, "transfer" to got.transfer, "rail" to got.rail,
                "merchant" to got.merchant, "tag" to got.tag, "account" to got.account, "bank" to got.bank,
            )
            for ((k, v) in expect) assertEquals("$k in $body", v, fields[k])
        }
        assertNull("otp", parseSms("VM-HDFCBK", "OTP is 482913. Do not share it with anyone."))
    }

    @Test
    fun sharesAndSettlements() {
        assertEquals("shares", 4800.0, shares.values.sum(), 0.0)
        val rem = remainingOwed(listOf(dinner), sets)
        assertEquals("owed", 2400.0, owedBack(dinner, "ananya", rem), 0.0)
        assertEquals("pocket", 3600.0, pocket(dinner, "ananya", rem), 0.0)
        assertEquals("hidden", 0.0, pocket(dinner.copy(reflect = false), "ananya", rem), 0.0)
        val debts = pairDebts(listOf(dinner), sets, "goa")
        assertNull("aarav settled", debts.find { it.fromId == "aarav" })
        assertEquals("simplify", debts.size, simplify(debts).size)
    }

    @Test
    fun simplifying() {
        val chain = listOf(
            dinner.copy(id = "c1", groupId = "trip", amount = 100.0, payerId = "a", shares = mapOf("b" to 100.0)),
            dinner.copy(id = "c2", groupId = "trip", amount = 100.0, payerId = "b", shares = mapOf("c" to 100.0)),
        )
        val trip = Group("trip", "Trip", "beach", listOf("b", "c"), "")
        assertEquals("simplified by default", 1, groupDebts(chain, emptyList(), trip).size)
        assertEquals("pairwise when simplify is off", 2, groupDebts(chain, emptyList(), trip.copy(simplify = false)).size)
        assertEquals("c pays a directly", 100.0, friendBalances(chain, emptyList(), listOf(trip), "a").find { it.id == "c" }?.net)
        assertEquals("b owes a when not simplified", 100.0, friendBalances(chain, emptyList(), listOf(trip.copy(simplify = false)), "a").find { it.id == "b" }?.net)
        assertEquals("b nets to zero", 0.0, memberNets(pairDebts(chain, emptyList(), "trip"))["b"])

        val pct = percentShares(1000.0, mapOf("a" to 33.3, "b" to 33.3, "c" to 33.4))
        assertEquals("percent shares add up", 1000.0, pct.values.sum(), 0.0)
    }

    @Test
    fun recurring() {
        val rent = dinner.copy(id = "r0", groupId = null, payerId = null, shares = null, recurring = "monthly", recurId = "rent", at = "2026-07-01T12:00:00")
        val now = LocalDateTime.parse("2026-10-02T12:00:00")
        val due = dueRecurring(listOf(rent), now)
        assertEquals("recurring catches up every missed month", 3, due.size)
        assertEquals("recurring id is deterministic", "rent-20261001", due[2].id)
        assertEquals("recurring does not repeat", 0, dueRecurring(listOf(rent) + due, now).size)
    }

    @Test
    fun reroutes() {
        val hops = listOf(Debt("a", "b", 500.0), Debt("b", "c", 500.0), Debt("c", "d", 500.0))
        val hopRoutes = reroutes(hops, simplify(hops))
        assertEquals("only the payer who still pays gets a reroute", 1, hopRoutes.size)
        assertEquals("a now pays d instead of b", "a>b>d", hopRoutes[0].let { "${it.fromId}>${it.viaId}>${it.toId}" })
        val fan = listOf(Debt("k", "m", 300.0), Debt("k", "r", 200.0), Debt("r", "m", 500.0))
        val fanRoutes = reroutes(fan, simplify(fan))
        assertEquals("debt to a middle person goes straight to the end", "k>r>m", fanRoutes.joinToString(",") { "${it.fromId}>${it.viaId}>${it.toId}" })
        assertEquals("nothing rerouted when not simplified", 0, reroutes(fan, fan).size)
    }

    @Test
    fun cashFlowing() {
        val lunch = dinner.copy(id = "l", groupId = null, payerId = null, shares = null, amount = 50.0, at = "2026-10-01T12:00:00")
        val cab = dinner.copy(id = "cab", groupId = "g", payerId = "me", shares = mapOf("me" to 50.0, "b" to 50.0), amount = 100.0, at = "2026-10-02T12:00:00")
        val theirs = cab.copy(id = "x", payerId = "b", shares = mapOf("me" to 40.0, "b" to 40.0), amount = 80.0)
        val flow = cashFlow(
            listOf(lunch, cab, theirs),
            listOf(Settlement("p", "g", "b", "me", 30.0, "2026-10-03T12:00:00", "upi")),
            "me", "2026-10-01", "2026-10-31",
        )
        assertEquals("money out counts the full bill you paid, not bills others paid", 150.0, flow.out, 0.0)
        assertEquals("repayments come off what you spent", 120.0, flow.net, 0.0)
        assertEquals("still coming back", 20.0, flow.owed, 0.0)
        assertEquals("real spend is your own spend plus your share", 100.0, flow.real, 0.0)
        assertEquals("calendar shows the full bill on the day you paid", 100.0, flow.byDay["2026-10-02"])
    }

    @Test
    fun upi() {
        assertEquals("UPI ID normalised", "asha.r@okaxis", cleanVpa(" Asha.R@OKAXIS "))
        assertNull("bare phone is not a UPI ID", cleanVpa("9876543210"))
        assertNull("too short", cleanVpa("a@b"))
        assertEquals(
            "UPI link is a plain P2P link",
            "upi://pay?pa=asha@okaxis&am=576.00&cu=INR&tn=Settle%20with%20Asha%20from%20Goa%20%26%20co",
            upiLink("asha@okaxis", 576.0, "Settle with Asha from Goa & co"),
        )
        assertEquals("UPI success", PayStatus.SUCCESS, readUpiResponse("txnId=AX1&responseCode=00&Status=SUCCESS&txnRef=kk1"))
        assertEquals("UPI failure", PayStatus.FAILED, readUpiResponse("txnId=&Status=FAILURE&responseCode=ZD"))
        assertEquals("UPI submitted", PayStatus.PENDING, readUpiResponse("Status=SUBMITTED"))
        assertEquals("backed out of UPI app", PayStatus.CANCELLED, readUpiResponse(""))
        assertEquals("no UPI app", PayStatus.NO_APP, readUpiResponse("NO_APP"))
    }

    @Test
    fun formatting() {
        assertEquals("1,23,456", inr(123456.4))
        assertEquals("85,000", inr(-85000.0))
        assertEquals("1,00,00,000", inr(10000000.0))
        assertEquals("AR", initials("Ananya Rao"))
        assertEquals("2026-09-19", dayKey("2026-09-19T12:00:00"))
        assertEquals(4, sampleData("abcdefghij").queue.count { !it.income && !it.transfer })
    }
}
