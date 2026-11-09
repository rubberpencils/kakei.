package app.kakie.lib

import android.Manifest
import android.app.AlertDialog
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.provider.Telephony
import androidx.activity.ComponentActivity
import androidx.activity.result.ActivityResultLauncher
import androidx.activity.result.contract.ActivityResultContracts
import kotlin.coroutines.resume
import kotlinx.coroutines.CancellableContinuation
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext

data class InboxRow(val sender: String, val body: String, val date: Long)

enum class SmsError { DENIED, FAILED }

class SmsResult(val rows: List<InboxRow>, val error: SmsError?)

/** SMS inbox and UPI apps; the activity attaches its result launchers on create. */
class Device(val appContext: Context) {
    private var activity: ComponentActivity? = null
    private var permissionLauncher: ActivityResultLauncher<String>? = null
    private var payLauncher: ActivityResultLauncher<Intent>? = null
    private var permissionWait: CancellableContinuation<Boolean>? = null
    private var payWait: CancellableContinuation<String>? = null

    fun activity() = activity

    fun attach(activity: ComponentActivity) {
        this.activity = activity
        permissionLauncher = activity.registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
            permissionWait?.resume(granted)
            permissionWait = null
        }
        payLauncher = activity.registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
            payWait?.resume(result.data?.getStringExtra("response").orEmpty())
            payWait = null
        }
    }

    private fun smsGranted() = appContext.checkSelfPermission(Manifest.permission.READ_SMS) == PackageManager.PERMISSION_GRANTED

    // Same flow as PermissionsAndroid.request: the rationale shows only after a previous denial, and either button goes on to ask.
    private suspend fun requestSms(): Boolean {
        if (smsGranted()) return true
        val act = activity ?: return false
        if (act.shouldShowRequestPermissionRationale(Manifest.permission.READ_SMS)) {
            suspendCancellableCoroutine { cont ->
                AlertDialog.Builder(act)
                    .setTitle("Allow kakie. to read SMS messages?")
                    .setMessage("Only bank transaction messages are accessed. Personal chats are never read.")
                    .setPositiveButton("Allow", null)
                    .setNegativeButton("Don't allow", null)
                    .setOnDismissListener { if (cont.isActive) cont.resume(Unit) }
                    .show()
            }
        }
        val launcher = permissionLauncher ?: return false
        return suspendCancellableCoroutine { cont ->
            permissionWait = cont
            launcher.launch(Manifest.permission.READ_SMS)
        }
    }

    suspend fun readSms(limit: Int = 80, quiet: Boolean = false): SmsResult {
        val granted = if (quiet) smsGranted() else requestSms()
        if (!granted) return SmsResult(emptyList(), SmsError.DENIED)
        return runCatching { SmsResult(readInbox(limit), null) }.getOrElse { SmsResult(emptyList(), SmsError.FAILED) }
    }

    private suspend fun readInbox(limit: Int): List<InboxRow> = withContext(Dispatchers.IO) {
        val cap = limit.coerceIn(1, 200)
        val out = ArrayList<InboxRow>()
        appContext.contentResolver.query(
            Telephony.Sms.Inbox.CONTENT_URI,
            arrayOf(Telephony.Sms.ADDRESS, Telephony.Sms.BODY, Telephony.Sms.DATE),
            null,
            null,
            "${Telephony.Sms.DATE} DESC",
        )?.use {
            while (it.moveToNext() && out.size < cap) out += InboxRow(it.getString(0).orEmpty(), it.getString(1).orEmpty(), it.getLong(2))
        }
        out
    }

    /**
     * The UPI app's response string ("txnId=..&Status=SUCCESS.."), "" when backed out, "NO_APP" when none is installed.
     * [pkg] targets one UPI app directly; null shows the chooser.
     */
    suspend fun payUpi(uri: String, pkg: String? = null): String {
        val launcher = payLauncher ?: error("No activity")
        require(uri.startsWith("upi://pay?")) { "Not a UPI payment link" }
        val intent = Intent(Intent.ACTION_VIEW, Uri.parse(uri))
        payWait?.resume("")
        return suspendCancellableCoroutine { cont ->
            payWait = cont
            // No resolveActivity() pre-check: Android 11+ package visibility can hide installed UPI apps from it.
            try {
                launcher.launch(if (pkg.isNullOrEmpty()) Intent.createChooser(intent, "Pay with") else intent.setPackage(pkg))
            } catch (e: ActivityNotFoundException) {
                payWait = null
                cont.resume("NO_APP")
            }
        }
    }

    suspend fun payWithUpi(uri: String): PayStatus =
        runCatching { readUpiResponse(payUpi(uri)) }.getOrDefault(PayStatus.UNSUPPORTED)
}
