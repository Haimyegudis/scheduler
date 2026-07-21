# Android TWA (sideload APK)

Thin Trusted Web Activity wrapper around https://scheduler-theta-seven.vercel.app.
Website deploys update the app automatically — rebuild the APK only when changing
app identity (name, icon, package id, signing key) in `twa-manifest.json`.

Deliverable: `app-release-signed.apk` (~1.2 MB), sent to workers/technicians for
sideload install. A copy is kept at `../dist-android/HP-Indigo-Scheduler.apk`.

## Prerequisites (already set up on this machine)

- JDK 17: `%USERPROFILE%\.bubblewrap\jdk-17.0.19+10`
- Android SDK: `%USERPROFILE%\.bubblewrap\android_sdk` (standard layout: `platforms/`,
  `build-tools/`, `licenses/`, `cmdline-tools/latest/`, plus a `bin/` copy so
  Bubblewrap's path validator accepts it)
- `%USERPROFILE%\.bubblewrap\config.json` points at both
- Signing keystore: `C:\APPS\keys\scheduler-twa.keystore` + `scheduler-twa-credentials.txt`
  (NOT in repo — back these up; losing the keystore means workers must reinstall)

## Rebuild steps (PowerShell)

```powershell
cd android-twa
# regenerate project after twa-manifest.json changes (also reverts the fixes below!)
npx @bubblewrap/cli update --skipVersionUpgrade

# gotcha 1: generated build.gradle uses dead jcenter() — replace with mavenCentral()
(Get-Content build.gradle) -replace 'jcenter\(\)', 'mavenCentral()' | Set-Content build.gradle

# gotcha 2: bubblewrap spawns bare "gradlew.bat" — put project dir on PATH
$env:PATH = "$PWD;$env:PATH"

$env:BUBBLEWRAP_KEYSTORE_PASSWORD = ((Get-Content C:\APPS\keys\scheduler-twa-credentials.txt | Select-String '^password=').Line -replace '^password=','')
$env:BUBBLEWRAP_KEY_PASSWORD = $env:BUBBLEWRAP_KEYSTORE_PASSWORD
npx @bubblewrap/cli build --skipPwaValidation
```

If gradle fails with "maxBuffer length exceeded" (huge first-run output), run
`.\gradlew.bat assembleRelease` once manually with `JAVA_HOME`/`ANDROID_HOME` set,
then re-run `bubblewrap build`.

If AGP reports "Failed to find target android-XX", install it:
`cmdline-tools\latest\bin\sdkmanager.bat "platforms;android-XX" --sdk_root=%USERPROFILE%\.bubblewrap\android_sdk`
(AGP requires the standard SDK root layout — packages must sit at the SDK root,
not under `cmdline-tools\latest`.)

### Note on this project's first build

At the time this project was generated, production (`scheduler-theta-seven.vercel.app`)
had not yet been redeployed with the PWA manifest/icon (Task 22). Bubblewrap's
`update` step downloads the icon and the web manifest to bake them into the
Android project, so generation temporarily pointed `iconUrl`/`webManifestUrl` at
the raw GitHub copies of `public/pwa-512.png` and `public/manifest.json` on the
`feature/shift-scheduler` branch, ran `update`, then restored the canonical
production URLs in `twa-manifest.json` (and in `app/build.gradle`'s
`webManifestUrl` resValue) before building. The baked-in icon/manifest bytes are
identical to what production serves once deployed, so no further action is
needed — but if you rerun `update` before production is live, expect the same
404 and repeat this workaround (or wait until the site is deployed).

## Changing the signing key — DON'T

`public/.well-known/assetlinks.json` on the site pins the certificate SHA-256.
A new key => update assetlinks.json AND every phone must uninstall/reinstall.

## Version bumps

Only needed when shipping a new APK: raise `appVersionCode`/`appVersionName`
in `twa-manifest.json`, then rebuild.

## Worker install instructions

1. Send `app-release-signed.apk` (WhatsApp/Drive).
2. Tap the file -> allow "install from unknown apps" once -> install.
3. Open "Scheduler" — login/data identical to the website.
