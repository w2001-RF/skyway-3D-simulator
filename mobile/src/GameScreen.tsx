import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, BackHandler, Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useKeepAwake } from 'expo-keep-awake';
import * as SplashScreen from 'expo-splash-screen';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import type { ShouldStartLoadRequest } from 'react-native-webview/lib/WebViewTypes';
import { maybeShowInterstitial, privacyOptionsRequired, showPrivacyOptions } from './ads';
import { GAME_URL } from './config';

// Set before the page's scripts run: the game then skips AdSense, talks to this app through
// window.ReactNativeWebView.postMessage and exposes window.SKYWAY_PLATFORM for the calls below.
const BOOT = `window.SKYWAY_APP = { platform: ${JSON.stringify(Platform.OS)}, version: 1 }; true;`;

// Messages sent by the page (see the « EXTENSION PLATEFORME » script in index.html)
type PageMessage =
  | { type: 'ready'; version: number }
  | { type: 'adBreak'; name: string }
  | { type: 'haptic'; kind: 'crash' | 'land' }
  | { type: 'privacyOptions' };

const call = (js: string) => `try { window.SKYWAY_PLATFORM && ${js}; } catch (e) {} true;`;

// The game page itself stays in the app; any other link (guide, privacy, GitHub) opens in the browser.
const isGamePage = (url: string) => url === GAME_URL || url.startsWith(GAME_URL + '?') || url.startsWith(GAME_URL + 'index.html') || url.startsWith(GAME_URL + '#');

export default function GameScreen() {
  useKeepAwake();
  const web = useRef<WebView>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const run = useCallback((js: string) => web.current?.injectJavaScript(call(js)), []);

  // Android back button = Échap in the game (close a window, or pause)
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      run('SKYWAY_PLATFORM.back()');
      return true;
    });
    return () => sub.remove();
  }, [run]);

  // Pause the flight when the app goes to the background
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s !== 'active') run('SKYWAY_PLATFORM.pause()');
    });
    return () => sub.remove();
  }, [run]);

  const onMessage = useCallback(async (e: WebViewMessageEvent) => {
    let msg: PageMessage;
    try {
      msg = JSON.parse(e.nativeEvent.data);
    } catch {
      return;
    }
    switch (msg.type) {
      case 'ready':
        setLoading(false);
        SplashScreen.hideAsync().catch(() => {});
        if (await privacyOptionsRequired()) run('SKYWAY_PLATFORM.privacyLink(true)');
        break;
      case 'adBreak':
        maybeShowInterstitial(
          () => run('SKYWAY_PLATFORM.adShowing(true)'),
          () => run('SKYWAY_PLATFORM.adShowing(false)'),
        );
        break;
      case 'haptic':
        Haptics.notificationAsync(
          msg.kind === 'crash' ? Haptics.NotificationFeedbackType.Error : Haptics.NotificationFeedbackType.Success,
        ).catch(() => {});
        break;
      case 'privacyOptions':
        run('SKYWAY_PLATFORM.adShowing(true)');
        await showPrivacyOptions();
        run('SKYWAY_PLATFORM.adShowing(false)');
        break;
    }
  }, [run]);

  const onShouldStart = useCallback((req: ShouldStartLoadRequest) => {
    const { url } = req;
    if (req.isTopFrame === false || isGamePage(url) || /^(about:|data:|blob:)/.test(url)) return true;
    Linking.openURL(url).catch(() => {});
    return false;
  }, []);

  const retry = () => {
    setFailed(false);
    setLoading(true);
    web.current?.reload();
  };

  return (
    <View style={styles.root}>
      <WebView
        ref={web}
        style={styles.web}
        source={{ uri: GAME_URL }}
        injectedJavaScriptBeforeContentLoaded={BOOT}
        onMessage={onMessage}
        onShouldStartLoadWithRequest={onShouldStart}
        onOpenWindow={(e) => Linking.openURL(e.nativeEvent.targetUrl).catch(() => {})}
        onError={() => setFailed(true)}
        onHttpError={(e) => { if (e.nativeEvent.statusCode >= 500) setFailed(true); }}
        onContentProcessDidTerminate={() => web.current?.reload()}
        onRenderProcessGone={() => web.current?.reload()}
        javaScriptEnabled
        domStorageEnabled
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        allowsBackForwardNavigationGestures={false}
        bounces={false}
        overScrollMode="never"
        scrollEnabled={false}
        pullToRefreshEnabled={false}
        setBuiltInZoomControls={false}
        textZoom={100}
        androidLayerType="hardware"
        contentInsetAdjustmentBehavior="never"
        automaticallyAdjustContentInsets={false}
        webviewDebuggingEnabled={__DEV__}
      />
      {(loading || failed) && (
        <View style={styles.overlay}>
          <Text style={styles.brand}>
            SKY<Text style={styles.brandAccent}>WAY</Text>
          </Text>
          {failed ? (
            <>
              <Text style={styles.msg}>Impossible de charger le simulateur. Vérifiez votre connexion Internet.</Text>
              <Pressable style={styles.btn} onPress={retry}>
                <Text style={styles.btnTxt}>Réessayer</Text>
              </Pressable>
            </>
          ) : (
            <>
              <ActivityIndicator color="#5ad1ff" size="large" />
              <Text style={styles.msg}>Préparation du vol…</Text>
            </>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0b1118' },
  web: { flex: 1, backgroundColor: '#0b1118' },
  overlay: {
    position: 'absolute', top: 0, right: 0, bottom: 0, left: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    padding: 24,
    backgroundColor: '#0b1118',
  },
  brand: { color: '#e6eef7', fontSize: 44, fontWeight: '800', letterSpacing: 4 },
  brandAccent: { color: '#5ad1ff' },
  msg: { color: '#8aa0b6', fontSize: 16, textAlign: 'center' },
  btn: { backgroundColor: '#5ad1ff', paddingHorizontal: 22, paddingVertical: 10, borderRadius: 8 },
  btnTxt: { color: '#04121c', fontWeight: '700', fontSize: 16 },
});
