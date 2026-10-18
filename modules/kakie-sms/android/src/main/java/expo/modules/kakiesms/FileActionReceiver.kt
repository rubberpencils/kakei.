package expo.modules.kakiesms

import android.app.NotificationManager
import android.app.RemoteInput
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** File, Other, or Not mine, from the bank-message notification. The app applies the queue when it is next open. */
class FileActionReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val id = intent.getStringExtra("id") ?: return
    val kind = intent.getStringExtra("kind") ?: return
    val typed = RemoteInput.getResultsFromIntent(intent)?.getCharSequence("tag")?.toString()?.trim().orEmpty()
    val tag = if (typed.isNotEmpty()) typed else intent.getStringExtra("tag").orEmpty()
    SmsInbox.pushAction(context, id, kind, tag)
    val mgr = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    mgr.cancel(id.hashCode())
    KakieSmsModule.ping?.invoke()
  }
}
