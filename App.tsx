import React, { useEffect, useState } from 'react';
import { useColorScheme } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import { NavigationContainer, DefaultTheme, DarkTheme, Theme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import * as ScreenOrientation from 'expo-screen-orientation';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { RootStackParamList } from './src/types';
import { AudioEngine } from './src/audio/AudioEngine';
import { useAppFonts, lightColors, darkColors, fontFamily, useApplyThemePreference } from './src/theme';
import { useApplyLocalePreference, useLocaleVersion } from './src/i18n/localePreference';
import TimerListScreen from './src/screens/TimerListScreen';
import TimerEditorScreen from './src/screens/TimerEditorScreen';
import ActiveWorkoutScreen from './src/screens/ActiveWorkoutScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import Credits from './src/components/Credits';
import AnimatedSplash from './src/components/AnimatedSplash';
import { QA_MODE } from './src/qa/qaMode';

// Hold the native launch screen until the JS splash takes over (no icon blink).
// Skipped under QA_MODE so the e2e screenshot harness sees deterministic frames.
if (!QA_MODE) {
  SplashScreen.preventAutoHideAsync().catch(() => {});
}

const Stack = createNativeStackNavigator<RootStackParamList>();

function buildNavTheme(isDark: boolean): Theme {
  const c = isDark ? darkColors : lightColors;
  const base = isDark ? DarkTheme : DefaultTheme;
  return {
    ...base,
    colors: {
      ...base.colors,
      background: c.bg,
      card: c.bg,
      text: c.fg,
      border: c.hairline,
      primary: c.fg,
    },
    fonts: {
      regular: { fontFamily: fontFamily.sans, fontWeight: '400' },
      medium: { fontFamily: fontFamily.sansMedium, fontWeight: '500' },
      bold: { fontFamily: fontFamily.sansSemibold, fontWeight: '600' },
      heavy: { fontFamily: fontFamily.sansSemibold, fontWeight: '600' },
    },
  };
}

export default function App() {
  // Restore + apply the saved appearance preference (System/Light/Dark) before
  // first paint; drives useColorScheme() here and in every screen.
  useApplyThemePreference();
  // Restore + apply the saved language; the version keys <NavigationContainer>
  // below so a language switch re-renders the whole app (canon § Translations).
  useApplyLocalePreference();
  const localeVersion = useLocaleVersion();
  const isDark = useColorScheme() === 'dark';
  const [fontsLoaded] = useAppFonts();
  const [splashDone, setSplashDone] = useState(false);

  useEffect(() => {
    AudioEngine.initialize().catch(() => {});
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
  }, []);

  // Fonts are the only readiness gate. The animated splash overlays until its
  // intro has played AND fonts are in, then crossfades out. Skipped under
  // QA_MODE (the native splash auto-hides there, as before).
  const ready = fontsLoaded;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        {ready && (
          <NavigationContainer key={localeVersion} theme={buildNavTheme(isDark)}>
            <StatusBar style={isDark ? 'light' : 'dark'} />
            <Stack.Navigator screenOptions={{ headerShown: false, animation: QA_MODE ? 'none' : undefined }}>
              <Stack.Screen name="TimerList" component={TimerListScreen} />
              <Stack.Screen name="TimerEditor" component={TimerEditorScreen} />
              <Stack.Screen
                name="ActiveWorkout"
                component={ActiveWorkoutScreen}
                options={{ gestureEnabled: false }}
              />
              <Stack.Screen name="Settings" component={SettingsScreen} />
              <Stack.Screen name="Acknowledgements">
                {(props) => <Credits onBack={() => props.navigation.goBack()} />}
              </Stack.Screen>
            </Stack.Navigator>
          </NavigationContainer>
        )}
        {!QA_MODE && !splashDone && (
          <AnimatedSplash ready={ready} onFinish={() => setSplashDone(true)} />
        )}
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
