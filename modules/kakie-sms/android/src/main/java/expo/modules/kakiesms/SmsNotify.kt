package expo.modules.kakiesms

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.RemoteInput
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.graphics.drawable.Icon
import android.os.Build
import android.provider.Telephony
import org.json.JSONArray
import org.json.JSONObject
import java.util.Locale

private const val PREFS = "kakei_notify"
private const val CHANNEL = "kakei-sms"
private const val KEY_ON = "enabled"
private const val KEY_TAGS = "tags"
private const val KEY_HINTS = "hints"
private const val KEY_ITEMS = "items"
private const val EXTRA_ID = "kakei.id"
private const val EXTRA_ACTION = "kakei.action"
private const val EXTRA_TAG = "kakei.tag"
private const val REPLY_KEY = "kakei.reply"
private const val KEEP_MS = 7L * 24 * 3600 * 1000
private const val MAX_ITEMS = 60

/** One bank message that has a notification. handed = JS already has it. action is set once the user answered. */
class NotifyItem(val id: String, val sender: String, val body: String, val ts: Long, var handed: Boolean = false, var action: String? = null, var tag: String? = null) {
  fun toJson(): JSONObject = JSONObject()
    .put("id", id).put("sender", sender).put("body", body).put("ts", ts)
    .put("handed", handed).put("action", action ?: JSONObject.NULL).put("tag", tag ?: JSONObject.NULL)

  companion object {
    fun from(o: JSONObject) = NotifyItem(
      o.getString("id"), o.getString("sender"), o.getString("body"), o.getLong("ts"),
      o.optBoolean("handed"), if (o.isNull("action")) null else o.optString("action"), if (o.isNull("tag")) null else o.optString("tag"),
    )
  }
}

/** The same reading of a bank message that src/lib/parser.ts does, cut down to what a notification needs. */
object QuickParse {
  class Hit(val amount: Double, val income: Boolean, val transfer: Boolean, val merchant: String)

  private val AMOUNT = Regex("""(?:rs\.?|inr|₹)\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)""", RegexOption.IGNORE_CASE)
  private val OTP = Regex("""\botp\b|one time password|do not share|verification code""", RegexOption.IGNORE_CASE)
  private val CREDITED = Regex("""\b(credited|credit of|received|deposited)\b""", RegexOption.IGNORE_CASE)
  private val DEBITED = Regex("""\b(debited|spent|withdrawn|purchase|paid)\b""", RegexOption.IGNORE_CASE)
  private val TRANSFER = Regex("""credit card[\s\S]{0,40}payment|towards[\s\S]{0,40}(?:credit card|\scc\s)|\scc\s[\s\S]{0,30}payment|card bill""", RegexOption.IGNORE_CASE)

  private val TAGS = listOf(
    Regex("starbucks|cafe|coffee|third wave") to "coffee",
    Regex("swiggy|zomato|deli|restaurant|canteen|thalassa") to "food",
    Regex("uber|ola|rapido|namma yatri") to "transport",
    Regex("amazon|myntra|flipkart|ajio") to "shopping",
    Regex("blinkit|zepto|bigbasket|instamart|grocery") to "groceries",
    Regex("netflix|spotify|bookmyshow|hotstar|prime video") to "entertainment",
    Regex("airtel|jio|vi\\b|electric|bescom|wifi|broadband") to "bills",
    Regex("petrol|fuel|hpcl|iocl|bpcl|indian oil") to "fuel",
    Regex("pharmacy|apollo|doctor|hospital|clinic") to "medical",
    Regex("rent") to "rent",
    Regex("salary|stipend") to "salary",
  )

  fun parse(body: String): Hit? {
    if (body.length < 12 || OTP.containsMatchIn(body)) return null
    val amount = AMOUNT.find(body)?.groupValues?.get(1)?.replace(",", "")?.toDoubleOrNull() ?: return null
    if (amount <= 0) return null
    val credited = CREDITED.containsMatchIn(body)
    val debited = DEBITED.containsMatchIn(body)
    if (!credited && !debited) return null
    val transfer = TRANSFER.containsMatchIn(body)
    return Hit(amount, credited && !debited, transfer, if (transfer) "Card bill" else merchant(body))
  }

  fun suggest(hit: Hit, hints: JSONObject, top: List<String>): String? {
    hints.optString(hit.merchant.lowercase(Locale.ROOT)).takeIf { it.isNotEmpty() }?.let { return it }
    if (hit.transfer) return "bills"
    if (hit.income) return "salary"
    val hay = hit.merchant.lowercase(Locale.ROOT)
    for ((re, tag) in TAGS) if (re.containsMatchIn(hay)) return tag
    return top.firstOrNull()
  }

  private fun titleCase(s: String) = s.lowercase(Locale.ROOT).replace(Regex("\\b[a-z]")) { it.value.uppercase(Locale.ROOT) }

  private fun clean(raw: String): String {
    var t = raw.replace(Regex("\\s+"), " ").replace(Regex("[.,]+$"), "").trim()
    t = t.replace(Regex("\\b(PVT LTD|PRIVATE LIMITED|LTD)\\b.*", RegexOption.IGNORE_CASE), "")
    t = t.replace(Regex("\\bSALARY\\b.*", RegexOption.IGNORE_CASE), "")
    t = t.replace(Regex("\\bPAY IN\\b.*", RegexOption.IGNORE_CASE), "")
    t = t.replace(Regex("\\s+"), " ").trim()
    if (t.isEmpty()) return "Payment"
    return if (t == t.uppercase(Locale.ROOT)) titleCase(t) else t
  }

  private fun merchant(body: String): String {
    Regex("vpa\\s+([a-z0-9._-]+)@", RegexOption.IGNORE_CASE).find(body)?.let {
      val head = it.groupValues[1].split('.')[0].replace(Regex("[^a-z]", RegexOption.IGNORE_CASE), "")
      if (head.isNotEmpty()) return titleCase(head)
    }
    Regex("NEFT-([A-Z][A-Z0-9 .&-]{2,48})", RegexOption.IGNORE_CASE).find(body)?.let { return clean(it.groupValues[1]) }
    Regex("\\bon\\s+([A-Z][A-Z0-9 .&-]{2,40})").find(body)?.let { return clean(it.groupValues[1]) }
    Regex("towards\\s+(.+?)(?:\\s+payment|\\.|$)", RegexOption.IGNORE_CASE).find(body)?.let {
      return clean(it.groupValues[1].replace(Regex("\\bXX\\d+\\b", RegexOption.IGNORE_CASE), ""))
    }
    return "Payment"
  }
}

/** Everything about the notification that lets you file a bank SMS without opening the app. */
object SmsNotify {
  private fun prefs(ctx: Context) = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  fun enabled(ctx: Context) = prefs(ctx).getBoolean(KEY_ON, false)

  @Synchronized
  fun setEnabled(ctx: Context, on: Boolean) {
    prefs(ctx).edit().putBoolean(KEY_ON, on).apply()
    if (!on) {
      val nm = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      for (item in load(ctx)) nm.cancel(item.id.hashCode())
    }
  }

  @Synchronized
  fun setHints(ctx: Context, tags: List<String>, hints: Map<String, String>) {
    prefs(ctx).edit().putString(KEY_TAGS, JSONArray(tags).toString()).putString(KEY_HINTS, JSONObject(hints).toString()).apply()
  }

  private fun load(ctx: Context): MutableList<NotifyItem> {
    val out = ArrayList<NotifyItem>()
    val raw = prefs(ctx).getString(KEY_ITEMS, null) ?: return out
    try {
      val arr = JSONArray(raw)
      for (i in 0 until arr.length()) out.add(NotifyItem.from(arr.getJSONObject(i)))
    } catch (_: Exception) {
    }
    return out
  }

  private fun save(ctx: Context, items: List<NotifyItem>) {
    val arr = JSONArray()
    val cutoff = System.currentTimeMillis() - KEEP_MS
    for (item in items.filter { it.ts >= cutoff }.takeLast(MAX_ITEMS)) arr.put(item.toJson())
    prefs(ctx).edit().putString(KEY_ITEMS, arr.toString()).apply()
  }

  /** What JS has not seen yet: new messages, and answers given from the notification. Answers are handed over once. */
  @Synchronized
  fun drain(ctx: Context): JSONObject {
    val items = load(ctx)
    val fresh = JSONArray()
    val decided = JSONArray()
    val keep = ArrayList<NotifyItem>()
    for (item in items) {
      if (item.action != null) {
        decided.put(item.toJson())
        continue
      }
      if (!item.handed) {
        fresh.put(item.toJson())
        item.handed = true
      }
      keep.add(item)
    }
    save(ctx, keep)
    return JSONObject().put("fresh", fresh).put("decided", decided)
  }

  @Synchronized
  fun onSms(ctx: Context, sender: String, body: String, ts: Long, force: Boolean = false) {
    if (!force && !enabled(ctx)) return
    val hit = QuickParse.parse(body) ?: return
    val items = load(ctx)
    // Two parts of one message, or a resend, must not make two notifications.
    if (items.any { it.sender == sender && it.body == body && ts - it.ts < 60_000 }) return
    val item = NotifyItem("$ts-${(sender + body).hashCode().toUInt()}", sender, body, ts)
    items.add(item)
    save(ctx, items)
    post(ctx, item, hit)
  }

  @Synchronized
  fun answer(ctx: Context, id: String, action: String, tag: String?) {
    val items = load(ctx)
    val item = items.firstOrNull { it.id == id } ?: return
    item.action = action
    item.tag = tag
    save(ctx, items)
    val nm = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (action == "ignore") {
      nm.cancel(id.hashCode())
      return
    }
    val hit = QuickParse.parse(item.body)
    val what = if (hit == null) "Saved" else "${money(hit.amount)} ${if (hit.income) "in" else "spent"}"
    val done = builder(ctx)
      .setContentTitle("$what, filed under #$tag")
      .setContentText("Added to Kakei. ${hit?.merchant?.let { "· $it" } ?: ""}".trim())
      .setContentIntent(openApp(ctx, "kakei://"))
      .setAutoCancel(true)
      .setTimeoutAfter(6000)
      .setOnlyAlertOnce(true)
      .build()
    nm.notify(id.hashCode(), done)
  }

  private fun money(v: Double): String {
    val whole = v % 1.0 == 0.0
    val s = if (whole) String.format(Locale.US, "%,d", v.toLong()) else String.format(Locale.US, "%,.2f", v)
    return "₹$s"
  }

  private fun builder(ctx: Context): Notification.Builder {
    val nm = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    val b = if (Build.VERSION.SDK_INT >= 26) {
      if (nm.getNotificationChannel(CHANNEL) == null) {
        val ch = NotificationChannel(CHANNEL, "Bank messages", NotificationManager.IMPORTANCE_HIGH)
        ch.description = "File a bank SMS as an expense from the notification"
        nm.createNotificationChannel(ch)
      }
      Notification.Builder(ctx, CHANNEL)
    } else {
      @Suppress("DEPRECATION") Notification.Builder(ctx)
    }
    val res = ctx.resources.getIdentifier("ic_kakei_notify", "drawable", ctx.packageName)
    return b.setSmallIcon(if (res != 0) res else ctx.applicationInfo.icon).setCategory(Notification.CATEGORY_MESSAGE)
  }

  private fun openApp(ctx: Context, uri: String): PendingIntent {
    val intent = Intent(Intent.ACTION_VIEW, android.net.Uri.parse(uri)).setPackage(ctx.packageName).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    return PendingIntent.getActivity(ctx, 0, intent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
  }

  private fun act(ctx: Context, id: String, action: String, tag: String?, mutable: Boolean): PendingIntent {
    val intent = Intent(ctx, NotifyActionReceiver::class.java)
      .putExtra(EXTRA_ID, id).putExtra(EXTRA_ACTION, action).putExtra(EXTRA_TAG, tag)
    val flags = PendingIntent.FLAG_UPDATE_CURRENT or if (mutable && Build.VERSION.SDK_INT >= 31) PendingIntent.FLAG_MUTABLE else PendingIntent.FLAG_IMMUTABLE
    // Each button of each message needs its own request code, or Android hands every button the same intent.
    return PendingIntent.getBroadcast(ctx, (id + action + tag).hashCode(), intent, flags)
  }

  private fun button(ctx: Context, title: String, pi: PendingIntent): Notification.Action.Builder {
    val icon = Icon.createWithResource(ctx, ctx.applicationInfo.icon)
    return Notification.Action.Builder(icon, title, pi)
  }

  private fun post(ctx: Context, item: NotifyItem, hit: QuickParse.Hit) {
    val p = prefs(ctx)
    val top = ArrayList<String>()
    try {
      val arr = JSONArray(p.getString(KEY_TAGS, "[]"))
      for (i in 0 until arr.length()) top.add(arr.getString(i))
    } catch (_: Exception) {
    }
    val hints = try { JSONObject(p.getString(KEY_HINTS, "{}")) } catch (_: Exception) { JSONObject() }
    val pick = QuickParse.suggest(hit, hints, top)

    val verb = if (hit.income) "received" else "spent"
    val title = if (hit.transfer) "${money(hit.amount)} card bill paid" else if (hit.income) "${money(hit.amount)} received" else "${money(hit.amount)} $verb at ${hit.merchant}"
    val hint = if (pick != null) "Looks like #$pick. One tap files it." else "Pick a tag to file it."
    val b = builder(ctx)
      .setContentTitle(title)
      .setContentText(hint)
      .setStyle(Notification.BigTextStyle().bigText("$hint\nTap Other to type any tag.\n\n${item.body}"))
      .setContentIntent(openApp(ctx, "kakei://review"))
      .setAutoCancel(true)
      .setWhen(item.ts)

    if (pick != null) b.addAction(button(ctx, "#$pick", act(ctx, item.id, "tag", pick, false)).build())
    val reply = RemoteInput.Builder(REPLY_KEY).setLabel("Tag, like groceries").build()
    b.addAction(button(ctx, "Other", act(ctx, item.id, "tag", null, true)).addRemoteInput(reply).build())
    b.addAction(button(ctx, "Not mine", act(ctx, item.id, "ignore", null, false)).build())

    val nm = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    nm.notify(item.id.hashCode(), b.build())
  }

  fun clean(tag: String?): String? {
    val t = (tag ?: "").trim().lowercase(Locale.ROOT).replace(Regex("[^a-z0-9-]"), "").take(24)
    return t.ifEmpty { null }
  }

  fun replyOf(intent: Intent): String? = RemoteInput.getResultsFromIntent(intent)?.getCharSequence(REPLY_KEY)?.toString()
  fun idOf(intent: Intent): String? = intent.getStringExtra(EXTRA_ID)
  fun actionOf(intent: Intent): String? = intent.getStringExtra(EXTRA_ACTION)
  fun tagOf(intent: Intent): String? = intent.getStringExtra(EXTRA_TAG)
}

class SmsReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action != Telephony.Sms.Intents.SMS_RECEIVED_ACTION) return
    val parts = Telephony.Sms.Intents.getMessagesFromIntent(intent) ?: return
    // One long message arrives as several parts from the same sender. Join them back into one.
    val bySender = LinkedHashMap<String, StringBuilder>()
    var ts = System.currentTimeMillis()
    for (m in parts) {
      bySender.getOrPut(m.originatingAddress ?: "") { StringBuilder() }.append(m.messageBody ?: "")
      ts = System.currentTimeMillis()
    }
    for ((sender, body) in bySender) {
      try { SmsNotify.onSms(context, sender, body.toString(), ts) } catch (_: Exception) {}
    }
  }
}

class NotifyActionReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val id = SmsNotify.idOf(intent) ?: return
    val action = SmsNotify.actionOf(intent) ?: return
    if (action == "ignore") return SmsNotify.answer(context, id, "ignore", null)
    // The Other button carries what was typed. The suggestion button carries its tag.
    val tag = SmsNotify.clean(SmsNotify.replyOf(intent) ?: SmsNotify.tagOf(intent)) ?: return
    SmsNotify.answer(context, id, "tag", tag)
  }
}
