package app.kakie.sms

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.RemoteInput
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Telephony
import java.util.UUID
import java.util.regex.Pattern
import org.json.JSONArray
import org.json.JSONObject

object SmsBus {
    var onSms: (() -> Unit)? = null
}

fun isPersonalSender(address: String): Boolean {
    val cleaned = address.filter { !it.isWhitespace() }.removePrefix("+")
    return cleaned.length in 8..15 && cleaned.all { it.isDigit() }
}

data class LiveSms(val id: String, val sender: String, val body: String, val date: Long)
data class FileAction(val id: String, val kind: String, val tag: String)

object SmsInbox {
    private const val PREF = "kakei.sms"
    private const val KEY = "pending"
    private const val ACTIONS = "actions"
    private const val TAGS = "tags"
    private const val NOTIFY = "notify"

    fun push(ctx: Context, sender: String, body: String, date: Long): String {
        val prefs = ctx.getSharedPreferences(PREF, Context.MODE_PRIVATE)
        val arr = JSONArray(prefs.getString(KEY, "[]"))
        val id = UUID.randomUUID().toString().replace("-", "").take(12)
        arr.put(JSONObject().put("id", id).put("sender", sender).put("body", body).put("date", date))
        while (arr.length() > 50) arr.remove(0)
        prefs.edit().putString(KEY, arr.toString()).apply()
        return id
    }

    fun drain(ctx: Context): List<LiveSms> {
        val prefs = ctx.getSharedPreferences(PREF, Context.MODE_PRIVATE)
        val raw = prefs.getString(KEY, "[]") ?: "[]"
        prefs.edit().remove(KEY).apply()
        val arr = JSONArray(raw)
        return (0 until arr.length()).map { i ->
            val row = arr.getJSONObject(i)
            LiveSms(row.getString("id"), row.getString("sender"), row.getString("body"), row.getLong("date"))
        }
    }

    fun setNotify(ctx: Context, on: Boolean) {
        ctx.getSharedPreferences(PREF, Context.MODE_PRIVATE).edit().putBoolean(NOTIFY, on).apply()
    }

    fun notifyOn(ctx: Context) = ctx.getSharedPreferences(PREF, Context.MODE_PRIVATE).getBoolean(NOTIFY, false)

    fun setTags(ctx: Context, tags: Map<String, String>) {
        val obj = JSONObject()
        tags.forEach { (k, v) -> obj.put(k, v) }
        ctx.getSharedPreferences(PREF, Context.MODE_PRIVATE).edit().putString(TAGS, obj.toString()).apply()
    }

    fun tagFor(ctx: Context, merchant: String): String {
        if (merchant.isBlank()) return ""
        val raw = ctx.getSharedPreferences(PREF, Context.MODE_PRIVATE).getString(TAGS, "{}") ?: "{}"
        return runCatching { JSONObject(raw).optString(merchant.lowercase(), "") }.getOrDefault("")
    }

    fun pushAction(ctx: Context, id: String, kind: String, tag: String) {
        val prefs = ctx.getSharedPreferences(PREF, Context.MODE_PRIVATE)
        val arr = JSONArray(prefs.getString(ACTIONS, "[]"))
        arr.put(JSONObject().put("id", id).put("kind", kind).put("tag", tag))
        while (arr.length() > 50) arr.remove(0)
        prefs.edit().putString(ACTIONS, arr.toString()).apply()
    }

    fun drainActions(ctx: Context): List<FileAction> {
        val prefs = ctx.getSharedPreferences(PREF, Context.MODE_PRIVATE)
        val raw = prefs.getString(ACTIONS, "[]") ?: "[]"
        prefs.edit().remove(ACTIONS).apply()
        val arr = JSONArray(raw)
        return (0 until arr.length()).map { i ->
            val row = arr.getJSONObject(i)
            FileAction(row.optString("id"), row.optString("kind"), row.optString("tag"))
        }
    }
}

class SmsReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Telephony.Sms.Intents.SMS_RECEIVED_ACTION) return
        val parts = Telephony.Sms.Intents.getMessagesFromIntent(intent)
        if (parts.isEmpty()) return
        val sender = parts[0].displayOriginatingAddress ?: return
        if (isPersonalSender(sender)) return
        val body = parts.joinToString("") { it.messageBody ?: "" }
        if (body.isBlank()) return
        val id = SmsInbox.push(context, sender, body, System.currentTimeMillis())
        if (SmsInbox.notifyOn(context)) post(context, id, body)
        SmsBus.onSms?.invoke()
    }

    companion object {
        private const val CHANNEL = "kakei.sms"
        private val AMOUNT: Pattern = Pattern.compile("(?:rs\\.?|inr|₹)\\s*([0-9][0-9,]*(?:\\.[0-9]{1,2})?)", Pattern.CASE_INSENSITIVE)
        private val VPA: Pattern = Pattern.compile("vpa\\s+([a-z0-9._-]+)@", Pattern.CASE_INSENSITIVE)
        private val TO: Pattern = Pattern.compile("\\bto\\s+([A-Za-z][A-Za-z0-9.&'-]{1,24})", Pattern.CASE_INSENSITIVE)

        fun post(context: Context, id: String, body: String) {
            val mgr = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            if (Build.VERSION.SDK_INT >= 26) {
                mgr.createNotificationChannel(NotificationChannel(CHANNEL, "Bank messages", NotificationManager.IMPORTANCE_DEFAULT))
            }
            val amount = AMOUNT.matcher(body).let { if (it.find()) it.group(1) else null }
            val merchant = merchantOf(body)
            val tag = SmsInbox.tagFor(context, merchant)
            val title = if (amount != null) "Rs $amount" else "Bank message"
            val text = merchant.ifEmpty { "Tap to review" }
            val fileLabel = if (tag.isNotEmpty()) "File as #$tag" else "File"
            val builder = if (Build.VERSION.SDK_INT >= 26) Notification.Builder(context, CHANNEL) else Notification.Builder(context)
            @Suppress("DEPRECATION")
            val other = Notification.Action.Builder(0, "Other", act(context, id, "file", "", 3, true))
                .addRemoteInput(RemoteInput.Builder("tag").setLabel("Tag").build())
                .build()
            builder.setSmallIcon(android.R.drawable.stat_notify_more)
                .setContentTitle(title).setContentText(text).setAutoCancel(true)
                .setContentIntent(open(context, id))
                .addAction(@Suppress("DEPRECATION") Notification.Action.Builder(0, fileLabel, act(context, id, "file", tag, 1, false)).build())
                .addAction(other)
                .addAction(@Suppress("DEPRECATION") Notification.Action.Builder(0, "Not mine", act(context, id, "drop", "", 2, false)).build())
            mgr.notify(id.hashCode(), builder.build())
        }

        fun note(context: Context, title: String, body: String, id: Int) {
            val mgr = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            if (Build.VERSION.SDK_INT >= 26) {
                mgr.createNotificationChannel(NotificationChannel(CHANNEL, "Bank messages", NotificationManager.IMPORTANCE_DEFAULT))
            }
            val builder = if (Build.VERSION.SDK_INT >= 26) Notification.Builder(context, CHANNEL) else Notification.Builder(context)
            mgr.notify(id, builder.setSmallIcon(android.R.drawable.stat_notify_more).setContentTitle(title).setContentText(body).setAutoCancel(true).build())
        }

        private fun merchantOf(body: String): String {
            val vpa = VPA.matcher(body)
            if (vpa.find()) {
                val head = vpa.group(1)?.substringBefore('.')?.replace(Regex("[^a-zA-Z]"), "") ?: ""
                if (head.isNotEmpty()) return head.replaceFirstChar { it.uppercase() }
            }
            val to = TO.matcher(body)
            if (to.find()) {
                val name = to.group(1) ?: ""
                if (!name.equals("vpa", true)) return name
            }
            return ""
        }

        private fun act(context: Context, id: String, kind: String, tag: String, request: Int, mutable: Boolean): PendingIntent {
            val intent = Intent(context, FileActionReceiver::class.java).apply {
                action = "app.kakie.sms.FILE"
                putExtra("id", id)
                putExtra("kind", kind)
                putExtra("tag", tag)
            }
            val mutableFlag = if (mutable && Build.VERSION.SDK_INT >= 31) PendingIntent.FLAG_MUTABLE else if (mutable) 0 else PendingIntent.FLAG_IMMUTABLE
            return PendingIntent.getBroadcast(context, id.hashCode() + request, intent, PendingIntent.FLAG_UPDATE_CURRENT or mutableFlag)
        }

        private fun open(context: Context, id: String): PendingIntent {
            val view = Intent(Intent.ACTION_VIEW, Uri.parse("kakie://review?id=$id")).apply {
                setPackage(context.packageName)
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
            }
            return PendingIntent.getActivity(context, id.hashCode(), view, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        }
    }
}

class FileActionReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val id = intent.getStringExtra("id") ?: return
        val kind = intent.getStringExtra("kind") ?: return
        val typed = RemoteInput.getResultsFromIntent(intent)?.getCharSequence("tag")?.toString()?.trim().orEmpty()
        val tag = typed.ifEmpty { intent.getStringExtra("tag").orEmpty() }
        SmsInbox.pushAction(context, id, kind, tag)
        (context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).cancel(id.hashCode())
        SmsBus.onSms?.invoke()
    }
}
