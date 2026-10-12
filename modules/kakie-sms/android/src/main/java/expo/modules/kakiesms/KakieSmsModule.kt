package expo.modules.kakiesms

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import android.provider.Telephony
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.BufferedInputStream
import java.io.ByteArrayOutputStream
import java.net.InetAddress
import java.net.NetworkInterface
import java.net.ServerSocket
import java.net.Socket
import java.security.MessageDigest
import java.util.UUID
import java.util.concurrent.CompletableFuture
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.ArrayBlockingQueue
import java.util.concurrent.RejectedExecutionException
import java.util.concurrent.ThreadPoolExecutor
import java.util.concurrent.TimeUnit

private const val MAX_BODY = 1_000_000

private class McpReply(val status: Int, val body: String)

class KakieSmsModule : Module() {
  private var mcpSocket: ServerSocket? = null
  private var mcpToken = ""
  // 4 workers and a short queue. Extra connections are dropped instead of piling up, so a flood cannot exhaust memory.
  private val mcpPool = ThreadPoolExecutor(4, 4, 0L, TimeUnit.MILLISECONDS, ArrayBlockingQueue<Runnable>(8))
  private val waiting = ConcurrentHashMap<String, CompletableFuture<McpReply>>()

  override fun definition() = ModuleDefinition {
    Name("KakieSms")

    Events("onMcpRequest")

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

    // Starts a tiny HTTP listener. Every request is handed to JS, which answers with mcpReply().
    // lan=false binds to loopback only, so nothing on the Wi-Fi can reach it (use `adb reverse` from a computer).
    AsyncFunction("startMcp") { port: Int, token: String, lan: Boolean ->
      if (token.length < 16) throw CodedException("Token too short")
      stopListener()
      mcpToken = token
      val bind = if (lan) InetAddress.getByName("0.0.0.0") else InetAddress.getLoopbackAddress()
      val socket = try {
        ServerSocket(port, 16, bind)
      } catch (e: Exception) {
        throw CodedException("Port $port is busy")
      }
      mcpSocket = socket
      startHostService()
      Thread {
        while (!socket.isClosed) {
          val client = try { socket.accept() } catch (_: Exception) { break }
          try {
            mcpPool.execute { serve(client) }
          } catch (_: RejectedExecutionException) {
            try { client.close() } catch (_: Exception) {}
          }
        }
      }.apply { isDaemon = true; name = "kakei-mcp" }.start()
      socket.localPort
    }

    AsyncFunction("stopMcp") {
      stopListener()
    }

    AsyncFunction("mcpReply") { id: String, status: Int, body: String ->
      waiting.remove(id)?.complete(McpReply(status, body))
      null
    }

    AsyncFunction("localAddresses") {
      // Carriers hand mobile data out of the same 100.64.0.0/10 block Tailscale uses, so the range alone proves nothing.
      // Tailscale lives on a VPN tunnel interface (tun0 / tailscale0). Mobile data is rmnet / ccmni / v4-*.
      val out = ArrayList<Map<String, String>>()
      try {
        for (nic in NetworkInterface.getNetworkInterfaces()) {
          if (!nic.isUp || nic.isLoopback) continue
          val name = nic.name.lowercase()
          for (addr in nic.inetAddresses) {
            if (addr !is java.net.Inet4Address || addr.isLoopbackAddress || addr.isLinkLocalAddress) continue
            val host = addr.hostAddress ?: continue
            val b = addr.address
            val cgnat = (b[0].toInt() and 0xff) == 100 && (b[1].toInt() and 0xc0) == 0x40
            val kind = when {
              cgnat && (name.startsWith("tun") || name.startsWith("tailscale") || name.startsWith("wg")) -> "tailscale"
              name.startsWith("rmnet") || name.startsWith("ccmni") || name.startsWith("v4-") ||
                name.startsWith("pdp") || name.startsWith("wwan") || name.startsWith("clat") -> "cellular"
              else -> "lan"
            }
            out.add(mapOf("ip" to host, "kind" to kind, "iface" to nic.name))
          }
        }
      } catch (_: Exception) {
      }
      out.sortedBy { if (it["kind"] == "tailscale") 0 else if (it["kind"] == "lan") 1 else 2 }
    }

    // Notification filing. The receiver in SmsNotify.kt does the work while the app is closed. JS only toggles it,
    // teaches it the user's tags, and drains what happened since it last looked.
    AsyncFunction("notifyEnabled") {
      val ctx = appContext.reactContext ?: return@AsyncFunction false
      SmsNotify.enabled(ctx)
    }

    AsyncFunction("notifySetEnabled") { on: Boolean ->
      val ctx = appContext.reactContext ?: throw CodedException("No react context")
      SmsNotify.setEnabled(ctx, on)
      null
    }

    AsyncFunction("notifySetHints") { tags: List<String>, hints: Map<String, String> ->
      val ctx = appContext.reactContext ?: throw CodedException("No react context")
      SmsNotify.setHints(ctx, tags, hints)
      null
    }

    // A pretend bank message, so the notification can be tried without waiting for a real one. JS never files it.
    AsyncFunction("notifyTest") {
      val ctx = appContext.reactContext ?: throw CodedException("No react context")
      SmsNotify.onSms(ctx, "KAKEI-TEST", "Rs 349.00 spent on SWIGGY via UPI on 01-01-26. Ref 000000000000. Not a real message.", System.currentTimeMillis(), true)
      null
    }

    AsyncFunction("notifyDrain") {
      val ctx = appContext.reactContext ?: throw CodedException("No react context")
      SmsNotify.drain(ctx).toString()
    }

    AsyncFunction("batteryExempt") {
      val ctx = appContext.reactContext ?: return@AsyncFunction false
      (ctx.getSystemService(Context.POWER_SERVICE) as PowerManager).isIgnoringBatteryOptimizations(ctx.packageName)
    }

    // Opens the system "let this app run in the background" prompt. Without it Doze can cut the network when the screen is off.
    AsyncFunction("requestBatteryExemption") {
      val ctx = appContext.reactContext ?: throw CodedException("No react context")
      val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:${ctx.packageName}"))
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      ctx.startActivity(intent)
      null
    }

    OnDestroy { stopListener() }
  }

  private fun startHostService() {
    val ctx = appContext.reactContext ?: return
    val intent = Intent(ctx, McpService::class.java)
    try {
      if (Build.VERSION.SDK_INT >= 26) ctx.startForegroundService(intent) else ctx.startService(intent)
    } catch (_: Exception) {
    }
  }

  private fun stopListener() {
    try { mcpSocket?.close() } catch (_: Exception) {}
    mcpSocket = null
    appContext.reactContext?.let { ctx ->
      try { ctx.stopService(Intent(ctx, McpService::class.java)) } catch (_: Exception) {}
    }
    for (f in waiting.values) f.complete(McpReply(503, ""))
    waiting.clear()
  }

  private fun serve(client: Socket) {
    client.use { sock ->
      try {
        sock.soTimeout = 10_000
        val input = BufferedInputStream(sock.getInputStream())
        val head = readHead(input) ?: return
        val lines = head.split("\r\n")
        val parts = lines[0].split(" ")
        if (parts.size < 2) return write(sock, 400, "bad request")
        val method = parts[0]
        val path = parts[1].substringBefore('?')
        val headers = HashMap<String, String>()
        for (line in lines.drop(1)) {
          val i = line.indexOf(':')
          if (i > 0) headers[line.substring(0, i).trim().lowercase()] = line.substring(i + 1).trim()
        }

        // Browsers send Origin. A page on the web must never be able to talk to your data.
        if (headers.containsKey("origin")) return write(sock, 403, "forbidden")
        if (path != "/mcp") return write(sock, 404, "not found")
        if (method != "POST") return write(sock, 405, "POST only")
        val auth = headers["authorization"] ?: ""
        val sent = auth.removePrefix("Bearer ").trim()
        if (!auth.startsWith("Bearer ") || !MessageDigest.isEqual(sent.toByteArray(), mcpToken.toByteArray())) {
          return write(sock, 401, "bad token", "WWW-Authenticate: Bearer")
        }
        val length = headers["content-length"]?.toIntOrNull() ?: return write(sock, 411, "length required")
        if (length < 0 || length > MAX_BODY) return write(sock, 413, "too large")
        val buf = ByteArray(length)
        var got = 0
        while (got < length) {
          val n = input.read(buf, got, length - got)
          if (n < 0) return
          got += n
        }

        val id = UUID.randomUUID().toString()
        val future = CompletableFuture<McpReply>()
        waiting[id] = future
        sendEvent("onMcpRequest", mapOf("id" to id, "body" to String(buf, Charsets.UTF_8)))
        val reply = try {
          future.get(25, TimeUnit.SECONDS)
        } catch (_: Exception) {
          waiting.remove(id)
          McpReply(504, "Kakei is not awake. Open the app and keep it on screen.")
        }
        write(sock, reply.status, reply.body, json = reply.status == 200)
      } catch (_: Exception) {
      }
    }
  }

  private fun readHead(input: BufferedInputStream): String? {
    val out = ByteArrayOutputStream()
    var tail = 0
    while (out.size() < 16_384) {
      val b = input.read()
      if (b < 0) return null
      out.write(b)
      tail = (tail shl 8) or b
      if (tail == 0x0D0A0D0A) return String(out.toByteArray(), Charsets.ISO_8859_1).trimEnd()
    }
    return null
  }

  private fun write(sock: Socket, status: Int, body: String, extra: String? = null, json: Boolean = false) {
    val bytes = body.toByteArray(Charsets.UTF_8)
    val text = when (status) {
      200 -> "OK"
      202 -> "Accepted"
      400 -> "Bad Request"
      401 -> "Unauthorized"
      403 -> "Forbidden"
      404 -> "Not Found"
      405 -> "Method Not Allowed"
      411 -> "Length Required"
      413 -> "Payload Too Large"
      503 -> "Service Unavailable"
      504 -> "Gateway Timeout"
      else -> "Error"
    }
    val type = if (json) "application/json" else "text/plain; charset=utf-8"
    val head = StringBuilder()
      .append("HTTP/1.1 $status $text\r\n")
      .append("Content-Type: $type\r\n")
      .append("Content-Length: ${bytes.size}\r\n")
      .append("Cache-Control: no-store\r\n")
      .append("Connection: close\r\n")
    if (extra != null) head.append(extra).append("\r\n")
    head.append("\r\n")
    val out = sock.getOutputStream()
    out.write(head.toString().toByteArray(Charsets.ISO_8859_1))
    out.write(bytes)
    out.flush()
  }
}
