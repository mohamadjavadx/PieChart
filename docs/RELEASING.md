# Releasing

The library is `:piechart`; its coordinates come from `piechart/build.gradle.kts`
(`io.github.mohamadjavadx:piechart:<version>`). The repository is
<https://github.com/mohamadjavadx/PieChart> and the code is under the Apache License 2.0 (`LICENSE`).

## Building

`settings.gradle.kts` uses the standard repositories (`google()`, `mavenCentral()`, the Gradle plugin portal), so anyone,
and CI, can build the project. The GitHub workflow in `.github/workflows/build.yml` builds with those repositories only,
which is the check that it works for everyone. If your own network cannot reach them, add a mirror to your personal
Gradle setup (an init script under `~/.gradle/init.d/`) instead of to the repository.

## Check

```
./gradlew :piechart:lintRelease
./gradlew :piechart:publishToMavenLocal
```

`publishToMavenLocal` puts the `.aar`, sources, javadoc, `.pom` and `.module` in `~/.m2`; try the result from another
project with `mavenLocal()`.

## Release

Releases are made by `.github/workflows/release.yml`. To release:

1. Set `version` in `piechart/build.gradle.kts` (for example `1.1.0`) and add a `## 1.1.0` section to `CHANGELOG.md`.
   Its text becomes the release notes.
2. Commit, then tag with `v` plus the version and push the tag:

   ```
   git tag v1.1.0 && git push origin v1.1.0
   ```

The workflow then:

- checks that the tag matches the library version and that the changelog has a section for it;
- runs `lintRelease`, builds the library (`publishToMavenLocal`) and the demo app (`assembleRelease`, shrunk with R8);
- creates the GitHub Release (a tag with a `-` in it, such as `v1.1.0-rc1`, becomes a pre-release) with the notes and these
  files: `piechart-<version>.aar`, `-sources.jar`, `-javadoc.jar`, `.pom`, `.module`, `PieChart-demo-<version>.apk` and its
  R8 `-mapping.txt`;
- asks JitPack to build the tag and waits until it is available. The library is the only publication in the repository, so
  the coordinates are `com.github.mohamadjavadx:PieChart:<tag>` (not the ones in the POM). This job is allowed to fail
  without failing the release; if it does, open `https://jitpack.io/#mohamadjavadx/PieChart` and press *Get it* on the tag,
  or read the log at `https://jitpack.io/com/github/mohamadjavadx/PieChart/<tag>/build.log`.

If a run fails, fix the cause and start the workflow again from the *Actions* tab (*Run workflow*, with the tag). It updates
the release if it already exists. If the fix has to change the tagged commit, move the tag first:
`git tag -f v1.1.0 && git push -f origin v1.1.0`.

### Refreshing the demo app of a release

A fix to the demo app does not need a new version. `.github/workflows/demo.yml` rebuilds only the demo, from any branch,
tag or commit, and swaps it into a release that already exists:

1. Push the commit with the fix to `main` (the workflow is run from there, so its file has to be on the branch).
2. Open *Actions*, choose *Refresh demo app*, press *Run workflow*, and give the release's tag (for example `v2.0.0`)
   and, when it is not `main`, the branch, tag or commit to build from.

It replaces `PieChart-demo-<version>.apk` and its `-mapping.txt`, and writes the *Demo app* section of the release notes
again, saying which commit the demo was built from. The tag, the library files and the rest of the notes stay as they are.

The demo is versioned with the library, so the library version at the chosen ref has to be the release's; the run stops
with an error otherwise, for example when `main` has moved on to the next version (then build from the release's tag, or
from a branch that is still at that version). It uses the same signing secrets as a release: without them the APK is
signed with the throw-away debug key, so anyone who installed the earlier one has to uninstall it first.

### Signing the demo APK

Without any setup the demo APK is signed with the throw-away debug key of the CI machine, which is different on every run:
it installs, but a later release cannot update it in place. To sign every release with your own key, create a keystore once
and keep it safe (if it is lost, users have to uninstall before updating):

```
keytool -genkeypair -v -keystore piechart-demo.keystore -alias piechart -keyalg RSA -keysize 2048 -validity 10000
base64 -i piechart-demo.keystore | pbcopy
```

Then add these repository secrets (*Settings, Secrets and variables, Actions*): `ANDROID_KEYSTORE_BASE64` (the base64 text
just copied), `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` (`piechart` above) and `ANDROID_KEY_PASSWORD`. The
workflow uses them when `ANDROID_KEYSTORE_BASE64` exists. Do not commit the keystore.

## The web version

The web version (`web/`, the npm package `@mohamadjavadx/piechart`) is released on its own, with its own version and
changelog, by `.github/workflows/web-release.yml`. Its tags are `web-v<version>`, which the Android workflow (tags `v*`) does
not see. Every change to `web/` is also checked by `.github/workflows/web.yml`: types, tests, the build, and what would be
published.

### Check

```
cd web
npm ci
npm run verify      # types, tests, build, and a look at the tarball and the entry points
npm pack --dry-run  # the files that would be published
```

### Set up once

- The package name is the `name` in `web/package.json`. On npm, `@mohamadjavadx/...` is a scope, which has to belong to your
  npm user or organization: create the organization (or change the name to a scope or a plain name you own) before the first
  release.
- Create an npm *automation* access token that can publish that package, and add it as the repository secret `NPM_TOKEN`
  (*Settings, Secrets and variables, Actions*). Do not commit it. Without the secret a release still runs and attaches the
  package to the GitHub Release, but publishes nothing to npm (the run says so). Once the package exists on npm you can
  instead configure *trusted publishing* for this workflow in the package's settings on npmjs.com, and drop the token.

### Release

1. Set `version` in `web/package.json` (for example `0.2.0`) and add a `## 0.2.0` section to `web/CHANGELOG.md`; its text
   becomes the release notes.
2. Commit, then tag with `web-v` plus the version and push the tag:

   ```
   git tag web-v0.2.0 && git push origin web-v0.2.0
   ```

The workflow checks that the tag matches the version and that the changelog has a section for it; runs the types, tests and
build and the check of the package; publishes to npm with a provenance statement (a version with a `-` in it, such as
`0.2.0-rc.1`, goes to the `next` tag instead of `latest`, and its release is a pre-release); and creates the GitHub Release
with the packed `.tgz` attached. The release is never marked *latest*, so the repository's latest release stays the Android
library's. A version that is on npm already is left alone, so a failed run can be started again from the *Actions* tab
(*Run workflow*, with the tag). npm does not let a published version be replaced: to fix a bad release, publish the next one
(and `npm deprecate` the bad one).

## Other places to publish

- **GitHub Packages:** add a Maven repository `https://maven.pkg.github.com/mohamadjavadx/PieChart` (user name plus a token with
  `write:packages`; keep the token out of the repository, e.g. in an init script) and run
  `./gradlew :piechart:publishReleasePublicationTo<RepositoryName>Repository`. Consumers need a token to read from it, so
  JitPack is the easier choice for them.
- **Maven Central:** needs a Central Portal account with the `io.github.mohamadjavadx` namespace verified and a signing key;
  then publish with `-PsigningInMemoryKey="$(cat private.key)" -PsigningInMemoryKeyPassword=...` to the upload repository the
  portal documents. Signing is only enabled when `signingInMemoryKey` is provided.

Publishing to a remote repository refuses to run while any `TODO` or `OWNER` is left in the release details at the top
of `piechart/build.gradle.kts`.
