package expo.modules.kakiesms

import android.Manifest
import android.content.ActivityNotFoundException
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.provider.Telephony
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

private const val UPI_REQUEST = 4407

class KakieSmsModule : Module() {
  private var pendingPay: Promise? = null

  override fun definition() = ModuleDefinition {
    Name("KakieSms")

    AsyncFunction("readInbox") { limit: Int ->
      val context = appContext.reactContext ?: throw CodedException("No react context")
      val granted = context.checkSelfPermission(Manifest.permission.READ_SMS) == PackageManager.PERMISSION_GRANTED
      if (!granted) throw CodedException("READ_SMS not granted")
      val cap = limit.coerceIn(1, 200)
      val cursor = context.contentResolver.query(
        Telephony.Sms.Inbox.CONTENT_URI,
        arrayOf(Telephony.Sms.ADDRESS, Telephony.Sms.BODY, Telephony.Sms.DATE),
        null,
        null,
        "${Telephony.Sms.DATE} DESC"
      ) ?: return@AsyncFunction emptyList<Map<String, Any>>()
      val out = ArrayList<Map<String, Any>>()
      cursor.use {
        while (it.moveToNext() && out.size < cap) {
          val row = HashMap<String, Any>()
          row["sender"] = it.getString(0) ?: ""
          row["body"] = it.getString(1) ?: ""
          row["date"] = it.getLong(2)
          out.add(row)
        }
      }
      out
    }

    // Resolves with the UPI app's response string ("txnId=..&Status=SUCCESS.."), "" when backed out, "NO_APP" when none installed.
    // pkg targets one UPI app directly; null shows the chooser.
    AsyncFunction("payUpi") { uri: String, pkg: String?, promise: Promise ->
      val activity = appContext.currentActivity ?: throw CodedException("No activity")
      if (!uri.startsWith("upi://pay?")) throw CodedException("Not a UPI payment link")
      val intent = Intent(Intent.ACTION_VIEW, Uri.parse(uri))
      pendingPay?.resolve("")
      pendingPay = promise
      // No resolveActivity() pre-check: Android 11+ package visibility can hide installed UPI apps from it.
      try {
        activity.startActivityForResult(if (pkg.isNullOrEmpty()) Intent.createChooser(intent, "Pay with") else intent.setPackage(pkg), UPI_REQUEST)
      } catch (e: ActivityNotFoundException) {
        pendingPay = null
        promise.resolve("NO_APP")
      }
    }.runOnQueue(Queues.MAIN)

    OnActivityResult { _, payload ->
      if (payload.requestCode != UPI_REQUEST) return@OnActivityResult
      val promise = pendingPay ?: return@OnActivityResult
      pendingPay = null
      promise.resolve(payload.data?.getStringExtra("response") ?: "")
    }
  }
}
