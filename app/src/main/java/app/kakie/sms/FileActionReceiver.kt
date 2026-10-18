package app.kakie.sms

import android.app.NotificationManager
import android.app.RemoteInput
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

class FileActionReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val id = intent.getStringExtra("id") ?: return
        val kind = intent.getStringExtra("kind") ?: return
        val typed = RemoteInput.getResultsFromIntent(intent)?.getCharSequence("tag")?.toString()?.trim().orEmpty()
        val tag = typed.ifEmpty { intent.getStringExtra("tag").orEmpty() }
        SmsInbox.pushAction(context, id, kind, tag)
        (context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).cancel(id.hashCode())
        AppEvents.ping?.invoke()
    }
}
