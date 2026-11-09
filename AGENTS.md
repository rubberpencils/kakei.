Native Android app in `app/`. Kotlin and Jetpack Compose. The API stays in `server/`.

Build with `./gradlew :app:installDebug`. `JAVA_HOME` is Android Studio's JBR when it is not already on PATH.

Default API is `https://kakei.169.58.42.62.sslip.io`. Override it with `KAKIE_API_URL` in `.env`.
