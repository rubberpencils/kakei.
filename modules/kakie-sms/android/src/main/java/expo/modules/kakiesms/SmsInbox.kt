package expo.modules.kakiesms

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID

/** App-private queue of bank messages the receiver accepted. JS drains it. Cap 50. */
object SmsInbox {
  private const val PREF = "kakei.sms"
  private const val KEY = "pending"

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
}
