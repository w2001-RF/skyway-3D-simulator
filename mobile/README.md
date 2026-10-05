# SKYWAY mobile (Expo / React Native)

Android and iOS app for the SKYWAY flight simulator. The app is a native shell around the hosted game
(`GAME_URL` in [src/config.ts](src/config.ts)): a full-screen WebView plus the native features a browser tab
can't provide. Every push of `index.html` to GitHub Pages updates the app without a store release.

| Native feature | Where |
|---|---|
| Landscape lock, hidden status and navigation bars, screen kept awake | [App.tsx](App.tsx), [app.json](app.json) |
| Splash screen held until the game reports `ready` | [App.tsx](App.tsx), [src/GameScreen.tsx](src/GameScreen.tsx) |
| Android back button = Échap (close a window, pause) | [src/GameScreen.tsx](src/GameScreen.tsx) |
| Pause when the app goes to the background | [src/GameScreen.tsx](src/GameScreen.tsx) |
| Haptics on crash and landing | [src/GameScreen.tsx](src/GameScreen.tsx) |
| AdMob interstitials at the game's ad breaks, Google consent form (UMP) | [src/ads.ts](src/ads.ts) |
| External links (guide, privacy, GitHub) open in the phone's browser | [src/GameScreen.tsx](src/GameScreen.tsx) |
| Offline / error screen with retry | [src/GameScreen.tsx](src/GameScreen.tsx) |

Tilt steering uses the browser's own `deviceorientation` events inside the WebView (Android sends them
directly; iOS shows the usual motion permission prompt when the player taps « Inclinaison »).

## Page ↔ app protocol

The app injects `window.SKYWAY_APP = { platform, version }` before the page loads. The page (the
« EXTENSION PLATEFORME » script at the end of `index.html`) then skips AdSense and:

- posts JSON messages through `window.ReactNativeWebView.postMessage`: `ready`, `adBreak {name}`,
  `haptic {kind: 'crash'|'land'}`, `privacyOptions`;
- exposes `window.SKYWAY_PLATFORM` for the app to call: `back()`, `pause()`, `adShowing(on)`,
  `privacyLink(on)`.

Test the page side in a desktop browser with `?app=1`.

## Run it

AdMob is a native module, so the app needs a development build (it does not run in Expo Go).

```bash
cd mobile
npm install
npx expo run:android        # Android Studio / SDK installed, device or emulator connected
npx expo run:ios            # macOS + Xcode only
# or build in the cloud, no local SDK needed:
npx eas-cli@latest build --profile development --platform android
```

Checks: `npx tsc --noEmit`, `npx expo lint`, `npx expo-doctor`.

## Before publishing

1. **AdMob**: create the app in AdMob (one entry for Android, one for iOS) and an interstitial ad unit in each.
   - Put the two App IDs (`ca-app-pub-…~…`) in [app.json](app.json) (`react-native-google-mobile-ads` plugin).
     The current values are Google's public test IDs.
   - Put the two ad unit IDs (`ca-app-pub-…/…`) in `PROD_INTERSTITIAL` in [src/config.ts](src/config.ts).
     Until then, and in every development build, Google's test units are used.
   - In AdMob › Privacy & messaging, publish a GDPR consent message (and the IDFA explainer for iOS).
2. **Store listings**: privacy policy URL = `https://w2001-rf.github.io/skyway-3D-simulator/privacy.html`.
   Declare « contains ads » and the advertising ID (Google Play Data safety / App Store privacy labels).
3. **Identifiers**: `io.github.w2001rf.skyway` is used as the Android package and iOS bundle ID; change it in
   [app.json](app.json) before the first upload if you prefer another one (it can't change afterwards).
4. **Release builds**: `npx eas-cli@latest build --platform all`, then `npx eas-cli@latest submit`.

Apple can reject apps that are « only a website » (App Review guideline 4.2). The native features above help,
but expect questions on iOS; Google Play is usually fine with this kind of game shell.
