import { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationBar } from 'expo-navigation-bar';
import * as ScreenOrientation from 'expo-screen-orientation';
import * as SplashScreen from 'expo-splash-screen';
import GameScreen from './src/GameScreen';
import { initAds } from './src/ads';

// Keep the splash screen until the game page reports it is ready (GameScreen hides it)
SplashScreen.preventAutoHideAsync().catch(() => {});
// Never keep the player on the splash screen if the page cannot report back (offline, old page)
setTimeout(() => SplashScreen.hideAsync().catch(() => {}), 12_000);

export default function App() {
  useEffect(() => {
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE).catch(() => {});
    initAds();
  }, []);

  return (
    <>
      <StatusBar hidden />
      <NavigationBar hidden />
      <GameScreen />
    </>
  );
}
