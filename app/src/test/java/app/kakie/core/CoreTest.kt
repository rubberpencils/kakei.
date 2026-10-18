package app.kakie.core

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class CoreTest {
    @Test fun parserMatchesTheBankMessages() {
        data class Sample(val sender: String, val body: String, val expect: Map<String, Any>)
        val samples = listOf(
            Sample("VM-HDFCBK", "Rs.1240.00 debited from A/c XX4521 on 28-09-26 to VPA swiggy@icici. UPI Ref 426781234.", mapOf("amount" to 1240.0, "income" to false, "rail" to "upi", "merchant" to "Swiggy", "tag" to "food", "account" to "4521", "bank" to "HDFC")),
            Sample("AD-ICICIT", "INR 3,499.00 spent using ICICI Bank Card XX9012 on 28-Sep-26 on AMAZON PAY IN.", mapOf("amount" to 3499.0, "income" to false, "rail" to "credit", "merchant" to "Amazon", "tag" to "shopping", "account" to "9012")),
            Sample("VM-HDFCBK", "Rs.2499.00 spent on HDFC Bank CC XX1234 on 28-09-26 at AMAZON.", mapOf("amount" to 2499.0, "rail" to "credit", "account" to "1234")),
            Sample("AX-AXISBK", "INR 5,000.00 debited from A/c no. XX3308 on 27-09-26 towards HDFC Bank CC XX2207 payment.", mapOf("amount" to 5000.0, "transfer" to true)),
            Sample("VM-HDFCBK", "Rs.386.00 debited from A/c XX4521 on 28-09-26 to VPA uber.india@axisbank.", mapOf("amount" to 386.0, "rail" to "upi", "merchant" to "Uber", "tag" to "transport")),
            Sample("JD-SBIINB", "Your A/c XX7710 is credited Rs.85,000.00 on 25/09/26 by NEFT-ACME TECHNOLOGIES PVT LTD SALARY SEP26.", mapOf("amount" to 85000.0, "income" to true, "rail" to "neft", "merchant" to "Acme Technologies", "tag" to "salary")),
            Sample("VM-HDFCBK", "Rs.2150.00 debited from A/c XX4521 on 27-09-26 to VPA blinkit.payu@hdfcbank.", mapOf("merchant" to "Blinkit", "tag" to "groceries", "rail" to "upi")),
            Sample("AX-AXISBK", "INR 12,340.00 debited from A/c no. XX3308 on 27-09-26 towards HDFC Bank Credit Card XX2207 payment.", mapOf("amount" to 12340.0, "transfer" to true, "tag" to "bills", "merchant" to "Card bill", "account" to "3308")),
            Sample("VM-HDFCBK-T", "Sent Rs.508.20\nFrom HDFC Bank A/C *3737\nTo OwnLy\nOn 18/10/26\nRef 131484730917\nNot You?\nCall 18002586161/SMS BLOCK UPI to 7308080808", mapOf("amount" to 508.2, "income" to false, "rail" to "upi", "merchant" to "OwnLy", "account" to "3737", "bank" to "HDFC")),
        )
        for (s in samples) {
            val got = parseSms(s.sender, s.body) ?: error(s.body)
            val fields = mapOf(
                "amount" to got.amount, "income" to got.income, "rail" to got.rail, "merchant" to got.merchant,
                "tag" to got.tag, "account" to got.account, "bank" to got.bank, "transfer" to got.transfer,
            )
            for ((k, v) in s.expect) assertEquals("$k in ${s.body}", v, fields[k])
        }
        assertNull(parseSms("VM-HDFCBK", "OTP is 482913. Do not share it with anyone."))
        assertNull(parseSms("VM-HDFCBK", "Rs.120.00 debit failed for A/c XX4521. Transaction unsuccessful."))
        val refund = parseSms("VM-HDFCBK", "Rs.250.00 credited to A/c XX4521 on 02-10-26 towards refund from SWIGGY.")
        assertEquals(true, refund?.income)
        assertEquals("Swiggy", refund?.merchant)
        assertEquals("entertainment", parseSms("AX-AXISBK", "INR 199.00 debited from A/c XX3308 on 01-10-26 towards Netflix Autopay.")?.tag)
        assertEquals("upi", parseSms("VM-HDFCBK", "Rs.40.00 debited from UPI Lite on 03-10-26 to VPA chai@okhdfcbank.")?.rail)
        assertEquals(true, parseSms("VM-HDFCBK", "Rs.499.00 credited to A/c XX4521 on 02-10-26. Transaction reversed for SWIGGY.")?.income)
        assertEquals(508.2, readMoney("Rs.508.20")!!, 0.0)
        assertNull(readMoney("18/10/26"))
        assertEquals("Swiggy", cleanMerchant("SWIGGY UPI 123456789012"))
        val taughtBody = "Wallet paid CAFE MOCHA at the counter ref 80.00 done"
        val nextBody = "Wallet paid CAFE MOCHA at the counter ref 90.00 done"
        val amountAt = spanContext(taughtBody, "80.00") ?: error("span")
        val merchantAt = spanContext(taughtBody, "CAFE MOCHA") ?: error("span")
        val taught = parseWithRules("VM-NEWBK", nextBody, listOf(FormatRule("VM-NEWBK", amountAt.first, amountAt.second, merchantAt.first, merchantAt.second)), listOf(MerchantRule("cafe mocha", "coffee")))
        assertEquals(90.0, taught?.amount)
        assertEquals("coffee", taught?.tag)
        assertTrue(isRecentDupe(listOf(Hit("swiggy", 100.0, 1_000)), "Swiggy", 100.0, 20_000))
        assertFalse(isRecentDupe(listOf(Hit("swiggy", 100.0, 1_000)), "Swiggy", 100.0, 200_000))
    }

    @Test fun sharesKeepTheOddPaisa() {
        val three = equalShares(100.0, listOf("a", "b", "c"))
        assertEquals(33.33, three["a"]!!, 0.0)
        assertEquals(33.34, three["c"]!!, 0.0)
        assertEquals(100.0, round2(three.values.sum()), 0.0)
        val shares = equalShares(4800.0, listOf("ananya", "aarav", "meera", "kabir"))
        assertEquals(4800.0, round2(shares.values.sum()), 0.0)
        assertEquals("508.20", inr(508.2))
        assertEquals("1,240", inr(1240.0))
        assertEquals("85,000", inr(85000.0))
    }

    @Test fun ledgerMatchesThePhoneChecks() {
        val shares = equalShares(4800.0, listOf("ananya", "aarav", "meera", "kabir"))
        val dinner = Expense("d", "Dinner", 4800.0, "2026-09-19T12:00:00", "food", "upi", groupId = "goa", payerId = "ananya", shares = shares)
        val sets = listOf(Settlement("s", "goa", "aarav", "ananya", 1200.0, "2026-09-25T12:00:00"))
        val rem = remainingOwed(listOf(dinner), sets)
        assertEquals(2400.0, owedBack(dinner, "ananya", rem), 0.0)
        assertEquals(1200.0, pocket(dinner, "ananya"), 0.0)
        assertEquals(0.0, pocket(dinner.copy(reflect = false), "ananya"), 0.0)
        val sub = detectSubs(listOf(
            dinner.copy(id = "n1", groupId = null, payerId = null, shares = null, merchant = "Netflix", amount = 199.0, at = "2026-01-15T12:00:00"),
            dinner.copy(id = "n2", groupId = null, payerId = null, shares = null, merchant = "Netflix", amount = 199.0, at = "2026-02-15T12:00:00"),
            dinner.copy(id = "n3", groupId = null, payerId = null, shares = null, merchant = "Netflix", amount = 210.0, at = "2026-03-16T12:00:00"),
        ))
        assertEquals("Netflix", sub.first().first)
        val debts = pairDebts(listOf(dinner), sets, "goa")
        assertTrue(debts.none { it.fromId == "aarav" })
        assertEquals(debts.size, simplify(debts).size)
        val chain = listOf(
            dinner.copy(id = "c1", groupId = "trip", amount = 100.0, payerId = "a", shares = mapOf("b" to 100.0)),
            dinner.copy(id = "c2", groupId = "trip", amount = 100.0, payerId = "b", shares = mapOf("c" to 100.0)),
        )
        val trip = Group("trip", "Trip", "beach", listOf("b", "c"))
        assertEquals(1, groupDebts(chain, emptyList(), trip).size)
        assertEquals(2, groupDebts(chain, emptyList(), trip.copy(simplify = false)).size)
        assertEquals(100.0, friendBalances(chain, emptyList(), listOf(trip), "a").find { it.id == "c" }?.net)
        assertEquals(100.0, friendBalances(chain, emptyList(), listOf(trip.copy(simplify = false)), "a").find { it.id == "b" }?.net)
        val multi = dinner.copy(id = "m", groupId = "trip", amount = 1000.0, payerId = "a", payers = listOf(Payer("a", 600.0), Payer("b", 400.0)), shares = mapOf("a" to 400.0, "b" to 300.0, "c" to 300.0))
        val multiDebts = pairDebts(listOf(multi), emptyList(), "trip")
        assertEquals(200.0, multiDebts.find { it.fromId == "c" && it.toId == "a" }?.amount)
        assertEquals(100.0, multiDebts.find { it.fromId == "c" && it.toId == "b" }?.amount)
        assertEquals(0.0, memberNets(pairDebts(chain, emptyList(), "trip"))["b"] ?: error("b"), 0.0)
        val pairs40 = listOf(Debt("a", "b", 100.0), Debt("b", "c", 40.0))
        val hop = exactSteps(pairs40, simplify(pairs40)).find { it.toId == "c" }
        assertEquals(40.0, hop?.amount)
        assertEquals("b", hop?.because?.first()?.viaId)
        assertTrue(whyYouPay("ananya", "aarav", listOf(dinner), sets, "goa").any { it.direction == "owed" && it.amount == 1200.0 })
        assertEquals(1000.0, round2(percentShares(1000.0, mapOf("a" to 33.3, "b" to 33.3, "c" to 33.4)).values.sum()), 0.0)
        val rent = dinner.copy(id = "r0", groupId = null, payerId = null, shares = null, recurring = "monthly", recurId = "rent", at = "2026-07-01T12:00:00")
        val due = dueRecurring(listOf(rent), "2026-10-02T12:00:00")
        assertEquals(3, due.size)
        assertEquals("rent-20261001", due[2].id)
        assertEquals(0, dueRecurring(listOf(rent) + due, "2026-10-02T12:00:00").size)
        val hops = listOf(Debt("a", "b", 500.0), Debt("b", "c", 500.0), Debt("c", "d", 500.0))
        val hopRoutes = reroutes(hops, simplify(hops))
        assertEquals(1, hopRoutes.size)
        assertEquals("a>b>d", "${hopRoutes[0].fromId}>${hopRoutes[0].viaId}>${hopRoutes[0].toId}")
        val fan = listOf(Debt("k", "m", 300.0), Debt("k", "r", 200.0), Debt("r", "m", 500.0))
        assertEquals("k>r>m", reroutes(fan, simplify(fan)).joinToString(",") { "${it.fromId}>${it.viaId}>${it.toId}" })
        assertEquals(0, reroutes(fan, fan).size)
        val lunch = dinner.copy(id = "l", groupId = null, payerId = null, shares = null, amount = 50.0, at = "2026-10-01T12:00:00")
        val cab = dinner.copy(id = "cab", groupId = "g", payerId = "me", shares = mapOf("me" to 50.0, "b" to 50.0), amount = 100.0, at = "2026-10-02T12:00:00")
        val theirs = cab.copy(id = "x", payerId = "b", shares = mapOf("me" to 40.0, "b" to 40.0), amount = 80.0)
        val pay = listOf(Settlement("p", "g", "b", "me", 30.0, "2026-10-03T12:00:00"))
        val flow = cashFlow(listOf(lunch, cab, theirs), pay, "me", "2026-10-01", "2026-10-31")
        assertEquals(140.0, flow.spent, 0.0)
        assertEquals(20.0, flow.owed, 0.0)
        assertEquals(90.0, flow.byDay["2026-10-02"]!!, 0.0)
        val month = spendIn(listOf(lunch, cab, theirs), pay, "me", "2026-10-01", "2026-10-31")
        assertEquals(140.0, month.total, 0.0)
        assertEquals(20.0, month.back, 0.0)
        val friendsOnly = spendIn(listOf(cab.copy(id = "pf", shares = mapOf("b" to 100.0), amount = 100.0)), emptyList(), "me", "2026-10-01", "2026-10-31")
        assertEquals(0.0, friendsOnly.total, 0.0)
        assertEquals(100.0, friendsOnly.back, 0.0)
        assertEquals(0.0, spendIn(listOf(cab.copy(reflect = false)), emptyList(), "me", "2026-10-01", "2026-10-31").back, 0.0)
        val tripGroup = Group("g", "Trip", "beach", listOf("b"))
        val owed = youBalances(listOf(cab), emptyList(), listOf(tripGroup), "me")
        assertEquals(50.0, owed.owedTotal, 0.0)
        assertEquals("b", owed.owed[0].id)
        assertEquals("g", owed.owed[0].lines[0].groupId)
        assertEquals(0.0, owed.oweTotal, 0.0)
        val owe = youBalances(listOf(theirs), emptyList(), listOf(tripGroup), "me")
        assertEquals(40.0, owe.oweTotal, 0.0)
        assertEquals("b", owe.owe[0].id)
        val swipe1 = lunch.copy(id = "c1", rail = "credit", amount = 780.0, account = "9012", bank = "ICICI", at = "2026-10-01T12:00:00")
        val swipe2 = swipe1.copy(id = "c2", amount = 2799.0, at = "2026-10-02T12:00:00")
        val cardPay = lunch.copy(id = "pay", transfer = true, rail = "upi", amount = 1000.0, account = "3308", bank = "HDFC", at = "2026-10-05T12:00:00")
        assertEquals(3579.0, cardBills(listOf(swipe1, swipe2), "me")[0].due, 0.0)
        assertEquals(2579.0, cardBills(listOf(swipe1, swipe2, cardPay), "me")[0].due, 0.0)
        assertEquals(0, cardBills(listOf(swipe1, swipe2, cardPay.copy(amount = 3579.0)), "me").size)
        assertEquals(0, cardBills(listOf(cab.copy(id = "fc", rail = "credit", payerId = "b", amount = 500.0)), "me").size)
        assertEquals(100.0, cardBills(listOf(cab.copy(id = "mc", rail = "credit")), "me")[0].due, 0.0)
        assertEquals(0, cardBills(listOf(lunch), "me").size)
    }

    @Test fun aBackupOpensWithTheSamePassword() {
        val (wrap, blob) = sealBackup("""{"budget":60000}""", "secret1")
        assertEquals("""{"budget":60000}""", openBackup(wrap, blob, "secret1"))
    }

    @Test fun inputRulesAndSenders() {
        assertEquals("12.50", cleanAmount("12.509"))
        assertEquals(".5", cleanAmount(".5"))
        assertEquals("1.23", cleanAmount("1.2.3"))
        assertEquals("7", cleanAmount("007"))
        assertEquals("12", cleanAmount("a1b2"))
        assertEquals("1234567890", cleanAmount("12345678901"))
        assertEquals("0.5", cleanAmount("0.5"))
        assertEquals("15", cleanNumber("1.5"))
        assertEquals("+919876", cleanPhone("+91 98a76"))
        assertFalse(isPersonalSender("VM-HDFCBK"))
        assertTrue(isPersonalSender("+919876543210"))
        assertTrue(isPersonalSender("9876543210"))
        assertTrue(isPersonalSender("+91 98765 43210"))
    }

    @Test fun mcpReadsTheLedgerWithoutAccountNumbers() {
        val dinner = Expense("d", "Dinner", 4800.0, "2026-09-19T12:00:00", groupId = "goa", payerId = "ananya", shares = equalShares(4800.0, listOf("ananya", "aarav")))
        val lunch = dinner.copy(id = "l", groupId = null, payerId = null, shares = null, amount = 50.0, at = "2026-10-01T12:00:00")
        val cab = dinner.copy(id = "cab", groupId = "g", payerId = "me", shares = mapOf("me" to 50.0, "b" to 50.0), amount = 100.0, at = "2026-10-02T12:00:00")
        val theirs = cab.copy(id = "x", payerId = "b", shares = mapOf("me" to 40.0, "b" to 40.0), amount = 80.0)
        val data = McpData(
            Person("me", "Me", "ME"),
            listOf(Person("b", "Bela", "BE")),
            listOf(Group("g", "Airport cab", "call-split", listOf("b"), kind = "split")),
            listOf(lunch, cab, theirs),
            listOf(Settlement("p", "g", "b", "me", 30.0, "2026-10-03T12:00:00")),
            1000.0,
            "2026-10-15T12:00:00",
        )
        fun rpc(method: String, params: JSONObject? = null, id: Int? = 1): McpReply {
            val body = JSONObject().put("jsonrpc", "2.0").put("method", method)
            if (id != null) body.put("id", id)
            if (params != null) body.put("params", params)
            return handleMcp(body.toString(), data)
        }
        fun asked(name: String, args: JSONObject = JSONObject()): JSONObject {
            val reply = rpc("tools/call", JSONObject().put("name", name).put("arguments", args))
            val text = JSONObject(reply.body).getJSONObject("result").getJSONArray("content").getJSONObject(0).getString("text")
            return JSONObject(text)
        }
        assertEquals("2025-03-26", JSONObject(rpc("initialize", JSONObject().put("protocolVersion", "2025-03-26")).body).getJSONObject("result").getString("protocolVersion"))
        assertEquals("2025-06-18", JSONObject(rpc("initialize", JSONObject().put("protocolVersion", "1999-01-01")).body).getJSONObject("result").getString("protocolVersion"))
        assertEquals(202, handleMcp(JSONObject().put("jsonrpc", "2.0").put("method", "notifications/initialized").toString(), data).status)
        assertEquals(5, JSONObject(rpc("tools/list").body).getJSONObject("result").getJSONArray("tools").length())
        assertEquals(-32601, JSONObject(rpc("nope").body).getJSONObject("error").getInt("code"))
        assertEquals(-32700, JSONObject(handleMcp("{bad", data).body).getJSONObject("error").getInt("code"))
        assertEquals(140.0, asked("get_summary").getDouble("spent"), 0.0)
        assertEquals(20.0, asked("get_summary").getDouble("toGetBack"), 0.0)
        assertEquals(0.0, asked("get_summary", JSONObject().put("month", "2026-09")).getDouble("spent"), 0.0)
        assertEquals(3, asked("list_transactions", JSONObject().put("query", "dinner")).getInt("count"))
        assertEquals(0, asked("list_transactions", JSONObject().put("query", "zzz")).getInt("count"))
        val rows = asked("list_transactions").getJSONArray("transactions")
        val cabRow = (0 until rows.length()).map { rows.getJSONObject(it) }.first { it.getString("id") == "cab" }
        assertEquals(50.0, cabRow.getDouble("yourShare"), 0.0)
        assertEquals("quick split", asked("list_groups").getJSONArray("groups").getJSONObject(0).getString("kind"))
        assertEquals(-20.0, asked("get_balances").getJSONArray("balances").getJSONObject(0).getDouble("net"), 0.0)
        assertEquals("you owe them", asked("get_balances").getJSONArray("balances").getJSONObject(0).getString("meaning"))
        assertTrue(JSONObject(rpc("tools/call", JSONObject().put("name", "get_summary").put("arguments", JSONObject().put("month", "oct"))).body).getJSONObject("result").getBoolean("isError"))
        assertFalse(rpc("tools/call", JSONObject().put("name", "list_transactions")).body.contains("4521"))
    }
}
