import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.plugin.compose")
    id("org.jetbrains.kotlin.plugin.serialization")
}

val env = Properties().apply {
    rootProject.file(".env").takeIf { it.exists() }?.reader()?.use { load(it) }
}

android {
    namespace = "app.kakie"
    compileSdk = 37

    defaultConfig {
        applicationId = "app.kakie"
        minSdk = 24
        targetSdk = 37
        versionCode = 1
        versionName = "1.0.0"
        buildConfigField("String", "API_URL", "\"${env.getProperty("KAKIE_API_URL", "https://kakei.169.58.42.62.sslip.io")}\"")
    }

    buildTypes {
        debug {
            applicationIdSuffix = ".kt"
        }
        release {
            signingConfig = signingConfigs.getByName("debug")
        }
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    compileOptions {
        isCoreLibraryDesugaringEnabled = true
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

dependencies {
    implementation(platform("androidx.compose:compose-bom:2026.09.00"))
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.foundation:foundation")
    implementation("androidx.compose.animation:animation")
    implementation("androidx.activity:activity-compose:1.13.0")
    implementation("androidx.navigation:navigation-compose:2.10.2")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.11.0")
    implementation("androidx.core:core-ktx:1.19.1")
    implementation("androidx.core:core-splashscreen:1.2.0")
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.12.0")
    coreLibraryDesugaring("com.android.tools:desugar_jdk_libs:2.1.5")
    testImplementation("junit:junit:4.13.2")
}
