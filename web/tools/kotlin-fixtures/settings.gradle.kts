// Not part of the Android build: a small JVM program that runs the library's pure Kotlin code (as it is,
// from ../../../piechart) on many inputs and writes what it answers to ../../test/fixtures/core.json.
// The TypeScript core is tested against that file. Run it from the repository root:
//
//   ./gradlew -p web/tools/kotlin-fixtures run

pluginManagement {
    repositories {
        mavenCentral()
        gradlePluginPortal()
    }
}
dependencyResolutionManagement {
    repositories {
        mavenCentral()
    }
}

rootProject.name = "kotlin-fixtures"
