package app.kakie.core

import org.bouncycastle.crypto.generators.SCrypt
import java.security.SecureRandom
import java.util.Base64
import javax.crypto.Cipher
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec

private const val N = 16384
private const val R = 8
private const val P = 1

/** AES-256-GCM. The sealed bytes are a 12-byte nonce, then ciphertext and tag. */
fun sealBytes(plain: ByteArray, key: ByteArray): String {
    val iv = ByteArray(12).also { SecureRandom().nextBytes(it) }
    val cipher = Cipher.getInstance("AES/GCM/NoPadding")
    cipher.init(Cipher.ENCRYPT_MODE, SecretKeySpec(key, "AES"), GCMParameterSpec(128, iv))
    val sealed = cipher.doFinal(plain)
    return b64(iv + sealed)
}

fun openBytes(combined: String, key: ByteArray): ByteArray {
    val raw = unb64(combined)
    if (raw.size < 12 + 16) throw IllegalArgumentException("That backup cannot be opened")
    val iv = raw.copyOfRange(0, 12)
    val sealed = raw.copyOfRange(12, raw.size)
    val cipher = Cipher.getInstance("AES/GCM/NoPadding")
    cipher.init(Cipher.DECRYPT_MODE, SecretKeySpec(key, "AES"), GCMParameterSpec(128, iv))
    return cipher.doFinal(sealed)
}

fun sealBackup(payload: String, password: String): Pair<String, String> {
    val dataKey = ByteArray(32).also { SecureRandom().nextBytes(it) }
    val blob = sealBytes(payload.toByteArray(Charsets.UTF_8), dataKey)
    val salt = ByteArray(16).also { SecureRandom().nextBytes(it) }
    val wrapKey = SCrypt.generate(password.toByteArray(Charsets.UTF_8), salt, N, R, P, 32)
    val wrap = "${b64(salt)}.${sealBytes(dataKey, wrapKey)}"
    return wrap to blob
}

fun openBackup(wrap: String, blob: String, password: String): String {
    val dot = wrap.indexOf('.')
    if (dot < 0) throw IllegalArgumentException("That backup cannot be opened")
    val wrapKey = SCrypt.generate(password.toByteArray(Charsets.UTF_8), unb64(wrap.substring(0, dot)), N, R, P, 32)
    val dataKey = openBytes(wrap.substring(dot + 1), wrapKey)
    return openBytes(blob, dataKey).toString(Charsets.UTF_8)
}

private fun b64(bytes: ByteArray) = Base64.getEncoder().encodeToString(bytes)

private fun unb64(s: String): ByteArray {
    val padded = s + "=".repeat((4 - s.length % 4) % 4)
    return Base64.getDecoder().decode(padded)
}
