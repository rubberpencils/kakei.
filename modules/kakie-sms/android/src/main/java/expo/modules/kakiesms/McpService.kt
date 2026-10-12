package expo.modules.kakiesms

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.os.PowerManager

private const val CHANNEL = "kakei-mcp"
private const val NOTIFICATION_ID = 4410

// Holds no logic. It only keeps the app process alive, with a visible notification, so the MCP listener
// keeps answering after the user leaves the app. The socket itself lives in KakieSmsModule.
class McpService : Service() {
  private var lock: PowerManager.WakeLock? = null

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (Build.VERSION.SDK_INT >= 26) {
      val channel = NotificationChannel(CHANNEL, "MCP server", NotificationManager.IMPORTANCE_LOW)
      channel.description = "Shown while Kakei serves your data to your own tools"
      (getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).createNotificationChannel(channel)
    }
    val launch = packageManager.getLaunchIntentForPackage(packageName)
    val open = PendingIntent.getActivity(this, 0, launch, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
    val builder = if (Build.VERSION.SDK_INT >= 26) Notification.Builder(this, CHANNEL) else Notification.Builder(this)
    val notification = builder
      .setContentTitle("Kakei MCP server is on")
      .setContentText("Your data is served from this phone. Tap to open.")
      .setSmallIcon(applicationInfo.icon)
      .setContentIntent(open)
      .setOngoing(true)
      .build()
    if (Build.VERSION.SDK_INT >= 34) {
      startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
    } else {
      startForeground(NOTIFICATION_ID, notification)
    }
    if (lock == null) {
      val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
      lock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "kakei:mcp").apply {
        setReferenceCounted(false)
        acquire()
      }
    }
    return START_NOT_STICKY
  }

  override fun onDestroy() {
    lock?.let { if (it.isHeld) it.release() }
    lock = null
    super.onDestroy()
  }
}
