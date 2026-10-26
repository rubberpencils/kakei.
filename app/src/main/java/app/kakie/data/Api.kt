package app.kakie.data

import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.util.concurrent.TimeUnit

class ApiError(val status: Int, message: String) : Exception(message)

private val jsonType = "application/json".toMediaType()
private val http = OkHttpClient.Builder().callTimeout(30, TimeUnit.SECONDS).build()

fun apiCall(base: String, token: String?, method: String, path: String, body: JSONObject? = null, timeoutMs: Long = 12_000): JSONObject {
    val client = http.newBuilder().callTimeout(timeoutMs, TimeUnit.MILLISECONDS).build()
    val req = Request.Builder().url(base.trimEnd('/') + path).method(method, if (method == "GET") null else (body ?: JSONObject()).toString().toRequestBody(jsonType))
    if (!token.isNullOrBlank()) req.header("Authorization", "Bearer $token")
    client.newCall(req.build()).execute().use { res ->
        val text = res.body?.string().orEmpty()
        if (res.code !in 200..299) {
            val message = try { JSONObject(text).optString("error").ifBlank { text } } catch (_: Exception) { text }
            throw ApiError(res.code, message.ifBlank { "Request failed" })
        }
        if (text.isBlank()) return JSONObject()
        return try { JSONObject(text) } catch (_: Exception) { JSONObject().put("raw", text) }
    }
}
