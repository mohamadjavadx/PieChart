import org.gradle.api.publish.maven.tasks.PublishToMavenRepository

plugins {
    alias(libs.plugins.android.library)
    `maven-publish`
    signing
}

// ---------------------------------------------------------------------------------------------
// Release details. Publishing to a remote repository refuses to run while any TODO/OWNER is left.
// ---------------------------------------------------------------------------------------------
group = "io.github.mohamadjavadx"
version = "2.0.1"

val pomName = "PieChart"
val pomDescription = "An animated pie / donut chart view for Android, with tap selection and " +
    "the selected slice's details drawn in the hole."
val pomUrl = "https://github.com/mohamadjavadx/PieChart"
val pomLicenseName = "The Apache License, Version 2.0"
val pomLicenseUrl = "https://www.apache.org/licenses/LICENSE-2.0.txt"
val pomDeveloperId = "mohamadjavadx"
val pomDeveloperName = "Mohamadjavad Pourmoradian"

android {
    namespace = "io.github.mohamadjavadx.piechart"
    // The library uses no API above minSdk, so this is only how new the Android APIs *available while building*
    // may be, not a requirement on anyone's device. compileSdk can't go below minSdk, so 24 is the lowest this
    // can be, and the lowest anyone's minCompileSdk error can therefore go (see docs/RELEASING.md). Not
    // installed on this machine (only 34, 35 and 36.1 are): building locally needs `sdkmanager
    // "platforms;android-24"` first, or CI, which has it. Raise it only when a change actually needs a newer API.
    compileSdk {
        version = release(24)
    }

    defaultConfig {
        minSdk = 24

        consumerProguardFiles("consumer-rules.pro")
    }

    publishing {
        singleVariant("release") {
            withSourcesJar()
            withJavadocJar()
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }
    compileOptions {
        // Java 9+ bytecode needs compileSdk 30 or above, whatever the code actually calls; 8 is what lets
        // compileSdk go all the way down to minSdk. The library has no Java source to begin with (it's Kotlin
        // only), and Java 8 is a language level every current AGP and JDK still fully supports.
        sourceCompatibility = JavaVersion.VERSION_1_8
        targetCompatibility = JavaVersion.VERSION_1_8
    }
}

kotlin {
    // Everything public in this library must be marked public on purpose.
    explicitApi()
}

dependencies {
    // Only for @MainThread; anything more would end up in the dependencies of every app that uses the chart.
    implementation(libs.androidx.annotation)
}

afterEvaluate {
    publishing {
        publications {
            register<MavenPublication>("release") {
                from(components["release"])
                artifactId = "piechart"

                pom {
                    name.set(pomName)
                    description.set(pomDescription)
                    url.set(pomUrl)
                    licenses {
                        license {
                            name.set(pomLicenseName)
                            url.set(pomLicenseUrl)
                        }
                    }
                    developers {
                        developer {
                            id.set(pomDeveloperId)
                            name.set(pomDeveloperName)
                        }
                    }
                    scm {
                        url.set(pomUrl)
                        connection.set("scm:git:$pomUrl.git")
                        developerConnection.set("scm:git:$pomUrl.git")
                    }
                }
            }
        }
    }

    // Signing is only switched on when a key is provided (Maven Central needs it, JitPack and
    // publishToMavenLocal do not): -PsigningInMemoryKey=... -PsigningInMemoryKeyPassword=...
    signing {
        val key = providers.gradleProperty("signingInMemoryKey").orNull
        if (key != null) {
            useInMemoryPgpKeys(key, providers.gradleProperty("signingInMemoryKeyPassword").orNull)
            sign(publishing.publications)
        }
    }
}

tasks.withType<PublishToMavenRepository>().configureEach {
    doFirst {
        val unset = mapOf(
            "pomUrl" to pomUrl,
            "pomLicenseName" to pomLicenseName,
            "pomLicenseUrl" to pomLicenseUrl,
            "pomDeveloperName" to pomDeveloperName,
        ).filterValues { it.contains("TODO") || it.contains("OWNER") }.keys
        check(unset.isEmpty()) {
            "Fill in the release details at the top of piechart/build.gradle.kts first: $unset"
        }
    }
}
