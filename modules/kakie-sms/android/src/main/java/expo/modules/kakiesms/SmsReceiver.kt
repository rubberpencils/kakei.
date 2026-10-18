package expo.modules.kakiesms

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
import java.util.regex.Pattern

/**
 * shortcut: the title amount is for the notification. Filing happens in JS from the action queue.
 */
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
    KakieSmsModule.ping?.invoke()
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
      val text = if (merchant.isNotEmpty()) merchant else "Tap to review"
      val fileLabel = if (tag.isNotEmpty()) "File as #$tag" else "File"
      val builder = if (Build.VERSION.SDK_INT >= 26) Notification.Builder(context, CHANNEL) else Notification.Builder(context)
      val other = Notification.Action.Builder(0, "Other", act(context, id, "file", "", 3, true))
        .addRemoteInput(RemoteInput.Builder("tag").setLabel("Tag").build())
        .build()
      builder
        .setSmallIcon(android.R.drawable.stat_notify_more)
        .setContentTitle(title)
        .setContentText(text)
        .setAutoCancel(true)
        .setContentIntent(open(context, id))
        .addAction(Notification.Action.Builder(0, fileLabel, act(context, id, "file", tag, 1, false)).build())
        .addAction(other)
        .addAction(Notification.Action.Builder(0, "Not mine", act(context, id, "drop", "", 2, false)).build())
        .let { mgr.notify(id.hashCode(), it.build()) }
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
        this.action = "expo.modules.kakiesms.FILE"
        putExtra("id", id)
        putExtra("kind", kind)
        putExtra("tag", tag)
      }
      val mutableFlag = if (mutable && Build.VERSION.SDK_INT >= 31) PendingIntent.FLAG_MUTABLE else if (mutable) 0 else PendingIntent.FLAG_IMMUTABLE
      val flags = PendingIntent.FLAG_UPDATE_CURRENT or mutableFlag
      return PendingIntent.getBroadcast(context, id.hashCode() + request, intent, flags)
    }

    private fun open(context: Context, id: String): PendingIntent {
      val view = Intent(Intent.ACTION_VIEW, Uri.parse("kakei://review?id=$id")).apply {
        setPackage(context.packageName)
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
      }
      return PendingIntent.getActivity(context, id.hashCode(), view, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }
  }
}
