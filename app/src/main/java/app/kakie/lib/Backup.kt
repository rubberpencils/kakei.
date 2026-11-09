package app.kakie.lib

import com.lambdaworks.crypto.SCrypt
import java.security.SecureRandom
import java.util.Base64
import javax.crypto.Cipher
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec
import kotlinx.serialization.Serializable

@Serializable
data class BackupPayload(
    val expenses: List<Expense> = emptyList(),
    val settlements: List<Settlement> = emptyList(),
    val groups: List<Group> = emptyList(),
    val people: List<Person> = emptyList(),
    val budget: Double = 0.0,
    val tags: List<String> = emptyList(),
    val rules: List<MerchantRule> = emptyList(),
    val history: List<MonthSnapshot> = emptyList(),
    val tagBudgets: Map<String, Double> = emptyMap(),
)

data class PackedBackup(val wrap: String, val blob: String)

private val random = SecureRandom()

/** AES-GCM, 12-byte IV prefixed to the ciphertext, standard Base64. Matches Expo's combined seal. */
private fun seal(plain: ByteArray, key: ByteArray): String {
    val iv = ByteArray(12).also { random.nextBytes(it) }
    val cipher = Cipher.getInstance("AES/GCM/NoPadding")
    cipher.init(Cipher.ENCRYPT_MODE, SecretKeySpec(key, "AES"), GCMParameterSpec(128, iv))
    return Base64.getEncoder().encodeToString(iv + cipher.doFinal(plain))
}

private fun openSeal(combined: String, key: ByteArray): ByteArray {
    val raw = Base64.getDecoder().decode(combined)
    if (raw.size < 13) error("That backup cannot be opened")
    val cipher = Cipher.getInstance("AES/GCM/NoPadding")
    cipher.init(Cipher.DECRYPT_MODE, SecretKeySpec(key, "AES"), GCMParameterSpec(128, raw.copyOfRange(0, 12)))
    return cipher.doFinal(raw.copyOfRange(12, raw.size))
}

private fun scrypt(password: String, salt: ByteArray) =
    SCrypt.scrypt(password.toByteArray(Charsets.UTF_8), salt, 16384, 8, 1, 32)

fun sealBackup(payload: BackupPayload, password: String): PackedBackup {
    val dataKey = ByteArray(32).also { random.nextBytes(it) }
    val blob = seal(json.encodeToString(payload).toByteArray(Charsets.UTF_8), dataKey)
    val salt = ByteArray(16).also { random.nextBytes(it) }
    val wrap = Base64.getEncoder().encodeToString(salt) + "." + seal(dataKey, scrypt(password, salt))
    return PackedBackup(wrap, blob)
}

fun openBackup(wrap: String, blob: String, password: String): BackupPayload {
    val dot = wrap.indexOf('.')
    if (dot < 0) error("That backup cannot be opened")
    val salt = Base64.getDecoder().decode(wrap.substring(0, dot))
    val dataKey = openSeal(wrap.substring(dot + 1), scrypt(password, salt))
    return json.decodeFromString(openSeal(blob, dataKey).toString(Charsets.UTF_8))
}
