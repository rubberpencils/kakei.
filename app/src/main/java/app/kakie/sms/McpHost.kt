package app.kakie.sms

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.net.Uri
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import android.provider.Settings
import app.kakie.lib.McpReply
import java.io.BufferedInputStream
import java.io.ByteArrayOutputStream
import java.net.Inet4Address
import java.net.InetAddress
import java.net.NetworkInterface
import java.net.ServerSocket
import java.net.Socket
import java.security.MessageDigest
import java.util.concurrent.ArrayBlockingQueue
import java.util.concurrent.RejectedExecutionException
import java.util.concurrent.ThreadPoolExecutor
import java.util.concurrent.TimeUnit

data class NetAddr(val ip: String, val kind: String)

/** Answers MCP on this phone from a snapshot the store keeps current. */
object McpHost {
    @Volatile var answer: ((String) -> McpReply)? = null
    private var socket: ServerSocket? = null
    private var token = ""
    private val pool = ThreadPoolExecutor(4, 4, 0L, TimeUnit.MILLISECONDS, ArrayBlockingQueue(8))

    fun start(context: Context, port: Int, token: String, lan: Boolean): Int {
        if (token.length < 16) error("Token too short")
        stop(context)
        this.token = token
        val bind = if (lan) InetAddress.getByName("0.0.0.0") else InetAddress.getLoopbackAddress()
        val server = ServerSocket(port, 16, bind)
        socket = server
        startService(context)
        Thread {
            while (!server.isClosed) {
                val client = try { server.accept() } catch (_: Exception) { break }
                try {
                    pool.execute { serve(client) }
                } catch (_: RejectedExecutionException) {
                    runCatching { client.close() }
                }
            }
        }.apply { isDaemon = true; name = "kakei-mcp" }.start()
        return server.localPort
    }

    fun stop(context: Context) {
        runCatching { socket?.close() }
        socket = null
        runCatching { context.stopService(Intent(context, McpService::class.java)) }
    }

    fun listening() = socket?.isClosed == false

    fun addresses(): List<NetAddr> {
        val out = mutableListOf<NetAddr>()
        runCatching {
            for (nic in NetworkInterface.getNetworkInterfaces()) {
                if (!nic.isUp || nic.isLoopback) continue
                val name = nic.name.lowercase()
                for (addr in nic.inetAddresses) {
                    if (addr !is Inet4Address || addr.isLoopbackAddress || addr.isLinkLocalAddress) continue
                    val host = addr.hostAddress ?: continue
                    val b = addr.address
                    val cgnat = (b[0].toInt() and 0xff) == 100 && (b[1].toInt() and 0xc0) == 0x40
                    val kind = when {
                        cgnat && (name.startsWith("tun") || name.startsWith("tailscale") || name.startsWith("wg")) -> "tailscale"
                        name.startsWith("rmnet") || name.startsWith("ccmni") || name.startsWith("v4-") ||
                            name.startsWith("pdp") || name.startsWith("wwan") || name.startsWith("clat") -> "cellular"
                        else -> "lan"
                    }
                    out += NetAddr(host, kind)
                }
            }
        }
        return out.sortedBy { if (it.kind == "tailscale") 0 else if (it.kind == "lan") 1 else 2 }
    }

    fun batteryExempt(context: Context) =
        (context.getSystemService(Context.POWER_SERVICE) as PowerManager).isIgnoringBatteryOptimizations(context.packageName)

    fun requestBattery(context: Context) {
        val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:${context.packageName}"))
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        context.startActivity(intent)
    }

    private fun startService(context: Context) {
        val intent = Intent(context, McpService::class.java)
        runCatching { if (Build.VERSION.SDK_INT >= 26) context.startForegroundService(intent) else context.startService(intent) }
    }

    private fun serve(client: Socket) {
        client.use { sock ->
            runCatching {
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
                if (headers.containsKey("origin")) return write(sock, 403, "forbidden")
                if (path != "/mcp") return write(sock, 404, "not found")
                if (method != "POST") return write(sock, 405, "POST only")
                val auth = headers["authorization"] ?: ""
                val sent = auth.removePrefix("Bearer ").trim()
                if (!auth.startsWith("Bearer ") || !MessageDigest.isEqual(sent.toByteArray(), token.toByteArray())) {
                    return write(sock, 401, "bad token", "WWW-Authenticate: Bearer")
                }
                val length = headers["content-length"]?.toIntOrNull() ?: return write(sock, 411, "length required")
                if (length !in 0..1_000_000) return write(sock, 413, "too large")
                val buf = ByteArray(length)
                var got = 0
                while (got < length) {
                    val n = input.read(buf, got, length - got)
                    if (n < 0) return
                    got += n
                }
                val reply = answer?.invoke(String(buf, Charsets.UTF_8)) ?: McpReply(503, "Kakei is not awake. Open the app.")
                write(sock, reply.status, reply.body, json = reply.status == 200)
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
            200 -> "OK"; 202 -> "Accepted"; 400 -> "Bad Request"; 401 -> "Unauthorized"; 403 -> "Forbidden"
            404 -> "Not Found"; 405 -> "Method Not Allowed"; 411 -> "Length Required"; 413 -> "Payload Too Large"
            503 -> "Service Unavailable"; else -> "Error"
        }
        val type = if (json) "application/json" else "text/plain; charset=utf-8"
        val head = buildString {
            append("HTTP/1.1 $status $text\r\nContent-Type: $type\r\nContent-Length: ${bytes.size}\r\nCache-Control: no-store\r\nConnection: close\r\n")
            if (extra != null) append(extra).append("\r\n")
            append("\r\n")
        }
        val out = sock.getOutputStream()
        out.write(head.toByteArray(Charsets.ISO_8859_1))
        out.write(bytes)
        out.flush()
    }
}

class McpService : Service() {
    private var lock: PowerManager.WakeLock? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (Build.VERSION.SDK_INT >= 26) {
            val channel = NotificationChannel("kakei-mcp", "MCP server", NotificationManager.IMPORTANCE_LOW)
            (getSystemService(NOTIFICATION_SERVICE) as NotificationManager).createNotificationChannel(channel)
        }
        val launch = packageManager.getLaunchIntentForPackage(packageName)
        val open = PendingIntent.getActivity(this, 0, launch, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        val builder = if (Build.VERSION.SDK_INT >= 26) Notification.Builder(this, "kakei-mcp") else Notification.Builder(this)
        val notification = builder.setContentTitle("kakie. MCP server is on")
            .setContentText("Your data is served from this phone. Tap to open.")
            .setSmallIcon(applicationInfo.icon).setContentIntent(open).setOngoing(true).build()
        if (Build.VERSION.SDK_INT >= 34) startForeground(4410, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
        else startForeground(4410, notification)
        if (lock == null) {
            val pm = getSystemService(POWER_SERVICE) as PowerManager
            lock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "kakei:mcp").apply { setReferenceCounted(false); acquire() }
        }
        return START_NOT_STICKY
    }

    override fun onDestroy() {
        lock?.let { if (it.isHeld) it.release() }
        lock = null
        super.onDestroy()
    }
}
