plugins {
    alias(libs.plugins.android.application)
}

// The demo is versioned with the library, so that the APK of a release can update the one before it.
evaluationDependsOn(":piechart")
val libraryVersion = project(":piechart").version.toString()

/** 1.2.3 (or 1.2.3-rc1) becomes 10203: a later version always has a higher version code. */
fun String.toVersionCode(): Int {
    val (major, minor, patch) = substringBefore('-').split('.').map { it.toInt() }
    return major * 10_000 + minor * 100 + patch
}

android {
    namespace = "io.github.mohamadjavadx.piechart.sample"
    compileSdk {
        version = release(36) {
            minorApiLevel = 1
        }
    }

    defaultConfig {
        applicationId = "io.github.mohamadjavadx.piechart.sample"
        minSdk = 24
        targetSdk = 36
        versionCode = libraryVersion.toVersionCode()
        versionName = libraryVersion
    }

    // A release key can be provided through the environment (the release workflow does this from
    // repository secrets); without one the release build is signed with the debug key instead.
    val releaseKeystorePath: String? = System.getenv("RELEASE_KEYSTORE_PATH")
    signingConfigs {
        if (releaseKeystorePath != null) {
            create("release") {
                storeFile = file(releaseKeystorePath)
                storePassword = System.getenv("RELEASE_KEYSTORE_PASSWORD")
                keyAlias = System.getenv("RELEASE_KEY_ALIAS")
                keyPassword = System.getenv("RELEASE_KEY_PASSWORD")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            // A demo app: without a release key it is signed with the debug key so that the release
            // build can still be installed as it is.
            signingConfig = signingConfigs.findByName("release") ?: signingConfigs.getByName("debug")
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_11
        targetCompatibility = JavaVersion.VERSION_11
    }
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.appcompat)
    implementation(libs.androidx.activity)
    implementation(libs.androidx.recyclerview)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(libs.kotlinx.coroutines.core)
    implementation(libs.kotlinx.coroutines.android)
    implementation(project(":piechart"))
}