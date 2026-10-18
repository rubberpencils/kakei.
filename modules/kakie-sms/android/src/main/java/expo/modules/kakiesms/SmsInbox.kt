package expo.modules.kakiesms

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID

/** App-private queue of bank messages the receiver accepted. JS drains it. Cap 50. */
object SmsInbox {
  private const val PREF = "kakei.sms"
  private const val KEY = "pending"
  private const val ACTIONS = "actions"
  private const val TAGS = "tags"
  private const val NOTIFY = "notify"

  fun push(ctx: Context, sender: String, body: String, date: Long): String {
    val prefs = ctx.getSharedPreferences(PREF, Context.MODE_PRIVATE)
    val arr = JSONArray(prefs.getString(KEY, "[]"))
    val id = UUID.randomUUID().toString().replace("-", "").take(12)
    val row = JSONObject()
    row.put("id", id)
    row.put("sender", sender)
    row.put("body", body)
    row.put("date", date)
    arr.put(row)
    while (arr.length() > 50) arr.remove(0)
    prefs.edit().putString(KEY, arr.toString()).apply()
    return id
  }

  fun drain(ctx: Context): List<Map<String, Any>> {
    val prefs = ctx.getSharedPreferences(PREF, Context.MODE_PRIVATE)
    val raw = prefs.getString(KEY, "[]") ?: "[]"
    prefs.edit().remove(KEY).apply()
    val arr = JSONArray(raw)
    val out = ArrayList<Map<String, Any>>()
    for (i in 0 until arr.length()) {
      val row = arr.getJSONObject(i)
      out.add(
        mapOf(
          "id" to row.getString("id"),
          "sender" to row.getString("sender"),
          "body" to row.getString("body"),
          "date" to row.getLong("date"),
        ),
      )
    }
    return out
  }

  fun setNotify(ctx: Context, on: Boolean) {
    ctx.getSharedPreferences(PREF, Context.MODE_PRIVATE).edit().putBoolean(NOTIFY, on).apply()
  }

  fun notifyOn(ctx: Context) = ctx.getSharedPreferences(PREF, Context.MODE_PRIVATE).getBoolean(NOTIFY, false)

  fun setTags(ctx: Context, json: String) {
    ctx.getSharedPreferences(PREF, Context.MODE_PRIVATE).edit().putString(TAGS, json).apply()
  }

  fun tagFor(ctx: Context, merchant: String): String {
    if (merchant.isBlank()) return ""
    val raw = ctx.getSharedPreferences(PREF, Context.MODE_PRIVATE).getString(TAGS, "{}") ?: "{}"
    return try {
      JSONObject(raw).optString(merchant.lowercase(), "")
    } catch (_: Exception) {
      ""
    }
  }

  fun pushAction(ctx: Context, id: String, kind: String, tag: String) {
    val prefs = ctx.getSharedPreferences(PREF, Context.MODE_PRIVATE)
    val arr = JSONArray(prefs.getString(ACTIONS, "[]"))
    val row = JSONObject()
    row.put("id", id)
    row.put("kind", kind)
    row.put("tag", tag)
    arr.put(row)
    while (arr.length() > 50) arr.remove(0)
    prefs.edit().putString(ACTIONS, arr.toString()).apply()
  }

  fun drainActions(ctx: Context): List<Map<String, String>> {
    val prefs = ctx.getSharedPreferences(PREF, Context.MODE_PRIVATE)
    val raw = prefs.getString(ACTIONS, "[]") ?: "[]"
    prefs.edit().remove(ACTIONS).apply()
    val arr = JSONArray(raw)
    val out = ArrayList<Map<String, String>>()
    for (i in 0 until arr.length()) {
      val row = arr.getJSONObject(i)
      out.add(mapOf("id" to row.optString("id"), "kind" to row.optString("kind"), "tag" to row.optString("tag")))
    }
    return out
  }
}
