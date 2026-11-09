package app.kakie.lib

import java.net.HttpURLConnection
import java.net.URL
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonPrimitive

class ApiError(val status: Int, message: String) : Exception(message)

fun cleanBase(raw: String): String {
    val t = raw.trim().replace(Regex("/+$"), "")
    return if (Regex("^https?://").containsMatchIn(t)) t else "http://$t"
}

suspend fun call(base: String, token: String?, method: String, path: String, body: JsonElement? = null): JsonElement =
    withContext(Dispatchers.IO) {
        val code: Int
        val text: String
        try {
            val conn = URL(base + path).openConnection() as HttpURLConnection
            conn.requestMethod = method
            conn.connectTimeout = 12_000
            conn.readTimeout = 12_000
            conn.setRequestProperty("Content-Type", "application/json")
            if (token != null) conn.setRequestProperty("Authorization", "Bearer $token")
            // POST with no body still needs doOutput or Android turns it into GET.
            if (body != null || method == "POST") {
                conn.doOutput = true
                conn.outputStream.use { if (body != null) it.write(body.toString().toByteArray()) }
            }
            code = conn.responseCode
            text = (if (code >= 400) conn.errorStream else conn.inputStream)?.bufferedReader()?.use { it.readText() }.orEmpty()
        } catch (e: Exception) {
            throw ApiError(0, "Cannot reach the server at $base")
        }
        val parsed = runCatching { json.parseToJsonElement(text) }.getOrDefault(JsonObject(emptyMap()))
        if (code !in 200..299) {
            val error = (parsed as? JsonObject)?.get("error")?.jsonPrimitive?.contentOrNull
            throw ApiError(code, error ?: "Server said $code")
        }
        parsed
    }
