package app.kakie.sms

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
import app.kakie.MainActivity
import app.kakie.core.McpData
import app.kakie.core.handleMcp
import java.io.BufferedInputStream
import java.io.ByteArrayOutputStream
import java.net.InetAddress
import java.net.ServerSocket
import java.net.Socket
import java.security.MessageDigest
import java.util.concurrent.Executors

/** On-phone MCP. Loopback unless the user turns on LAN. Bearer token required. */
object LocalMcp {
    private var socket: ServerSocket? = null
    private val pool = Executors.newFixedThreadPool(2)
    @Volatile var token: String = ""
    @Volatile var data: () -> McpData = { error("no ledger") }

    fun start(context: Context, port: Int, token: String, lan: Boolean) {
        if (token.length < 16) throw IllegalArgumentException("Token too short")
        stop(context)
        this.token = token
        val bind = if (lan) InetAddress.getByName("0.0.0.0") else InetAddress.getLoopbackAddress()
        val server = ServerSocket(port, 16, bind)
        socket = server
        context.startForegroundService(Intent(context, McpService::class.java))
        Thread {
            while (!server.isClosed) {
                val client = try { server.accept() } catch (_: Exception) { break }
                try { pool.execute { serve(client) } } catch (_: Exception) { client.close() }
            }
        }.apply { isDaemon = true; name = "kakei-mcp" }.start()
    }

    fun stop(context: Context) {
        try { socket?.close() } catch (_: Exception) {}
        socket = null
        try { context.stopService(Intent(context, McpService::class.java)) } catch (_: Exception) {}
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
                val headers = lines.drop(1).mapNotNull { line ->
                    val i = line.indexOf(':')
                    if (i > 0) line.substring(0, i).trim().lowercase() to line.substring(i + 1).trim() else null
                }.toMap()
                if (headers.containsKey("origin")) return write(sock, 403, "forbidden")
                if (parts[1].substringBefore('?') != "/mcp") return write(sock, 404, "not found")
                if (parts[0] != "POST") return write(sock, 405, "POST only")
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
                val reply = handleMcp(String(buf, Charsets.UTF_8), data())
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
        val text = when (status) { 200 -> "OK"; 202 -> "Accepted"; 401 -> "Unauthorized"; 403 -> "Forbidden"; 404 -> "Not Found"; 405 -> "Method Not Allowed"; else -> "Error" }
        val head = buildString {
            append("HTTP/1.1 $status $text\r\n")
            append("Content-Type: ${if (json) "application/json" else "text/plain; charset=utf-8"}\r\n")
            append("Content-Length: ${bytes.size}\r\nCache-Control: no-store\r\nConnection: close\r\n")
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
            (getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).createNotificationChannel(channel)
        }
        val open = PendingIntent.getActivity(this, 0, Intent(this, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        val builder = if (Build.VERSION.SDK_INT >= 26) Notification.Builder(this, "kakei-mcp") else @Suppress("DEPRECATION") Notification.Builder(this)
        val notification = builder.setContentTitle("Kakei MCP server is on").setContentText("Your data is served from this phone.").setSmallIcon(android.R.drawable.stat_notify_sync).setContentIntent(open).setOngoing(true).build()
        if (Build.VERSION.SDK_INT >= 34) startForeground(4410, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE) else startForeground(4410, notification)
        if (lock == null) {
            val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
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
