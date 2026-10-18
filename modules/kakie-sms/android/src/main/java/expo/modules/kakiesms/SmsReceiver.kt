package expo.modules.kakiesms

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Telephony
import java.util.regex.Pattern

/**
 * shortcut: the title amount is for the notification, the review screen uses the JS parser.
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
    notify(context, id, body)
    KakieSmsModule.ping?.invoke()
  }

  private fun notify(context: Context, id: String, body: String) {
    val mgr = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (Build.VERSION.SDK_INT >= 26) {
      mgr.createNotificationChannel(NotificationChannel(CHANNEL, "Bank messages", NotificationManager.IMPORTANCE_DEFAULT))
    }
    val amount = AMOUNT.matcher(body).let { if (it.find()) it.group(1) else null }
    val title = if (amount != null) "Rs $amount" else "Bank message"
    val builder = if (Build.VERSION.SDK_INT >= 26) Notification.Builder(context, CHANNEL) else Notification.Builder(context)
    val built = builder
      .setSmallIcon(android.R.drawable.stat_notify_more)
      .setContentTitle(title)
      .setContentText("Tap to file this payment")
      .setAutoCancel(true)
      .setContentIntent(open(context, id, "personal", 0))
      .addAction(Notification.Action(0, "Personal", open(context, id, "personal", 1)))
      .addAction(Notification.Action(0, "Split", open(context, id, "split", 2)))
      .build()
    mgr.notify(id.hashCode(), built)
  }

  private fun open(context: Context, id: String, file: String, request: Int): PendingIntent {
    val view = Intent(Intent.ACTION_VIEW, Uri.parse("kakei://review?id=$id&file=$file")).apply {
      setPackage(context.packageName)
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
    }
    val flags = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    return PendingIntent.getActivity(context, id.hashCode() + request, view, flags)
  }

  companion object {
    private const val CHANNEL = "kakei.sms"
    private val AMOUNT: Pattern = Pattern.compile("(?:rs\\.?|inr|₹)\\s*([0-9][0-9,]*(?:\\.[0-9]{1,2})?)", Pattern.CASE_INSENSITIVE)
  }
}
