import org.jetbrains.kotlin.gradle.dsl.KotlinJvmProjectExtension

// The Kotlin plugin is put on the build classpath directly, not through the `plugins {}` block, which
// looks for the plugin's marker artifact first and needs one more repository round trip for nothing.
buildscript {
    repositories {
        mavenCentral()
    }
    dependencies {
        classpath("org.jetbrains.kotlin:kotlin-gradle-plugin:2.2.10")
    }
}

apply(plugin = "org.jetbrains.kotlin.jvm")
apply(plugin = "application")

repositories {
    mavenCentral()
}

extensions.configure<KotlinJvmProjectExtension> {
    sourceSets.getByName("main").kotlin.apply {
        srcDir("src")
        // The library's own files, not copies: only the ones that need no Android classes.
        srcDir("../../../piechart/src/main/java")
        include(
            "Fixtures.kt",
            "**/PieChartData.kt",
            "**/geometry/SliceMath.kt",
            "**/geometry/Grouping.kt",
            "**/geometry/Morph.kt",
            "**/utils/MathExtensions.kt",
        )
    }
}

extensions.configure<JavaApplication> {
    mainClass.set("FixturesKt")
}

tasks.named<JavaExec>("run") {
    args(layout.projectDirectory.file("../../test/fixtures/core.json").asFile.absolutePath)
}
