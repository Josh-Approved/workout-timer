/**
 * App root for Workout Timer. The shell (<AppShell/>) owns the chrome — gesture
 * root, safe area, error boundary, the themed NavigationContainer + status bar,
 * and the cold-start splash. App.tsx owns only the readiness gate, the screen
 * list, and this app's startup effects (audio engine init, portrait lock).
 */

import React, { useEffect } from 'react';
import { Linking } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createNavigationContainerRef } from '@react-navigation/native';
import * as ScreenOrientation from 'expo-screen-orientation';
import { RootStackParamList } from './src/types';
import { AudioEngine } from './src/audio/AudioEngine';
import { useAppFonts } from './src/theme';
import { AppShell } from './src/shell/AppShell';
import TimerListScreen from './src/screens/TimerListScreen';
import TimerEditorScreen from './src/screens/TimerEditorScreen';
import ActiveWorkoutScreen from './src/screens/ActiveWorkoutScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import ClassScreen from './src/screens/ClassScreen';
import ClassJoinScreen from './src/screens/ClassJoinScreen';
import Credits from './src/components/Credits';
import { IOS_APP_STORE_ID, ANDROID_PACKAGE } from './src/lib/links';
import { QA_MODE } from './src/qa/qaMode';

// Hold the native launch screen until the JS splash takes over (no icon blink).
// Skipped under QA_MODE so the e2e screenshot harness sees deterministic frames.
if (!QA_MODE) {
  SplashScreen.preventAutoHideAsync().catch(() => {});
}

const Stack = createNativeStackNavigator<RootStackParamList>();
const navigationRef = createNavigationContainerRef<RootStackParamList>();

// A class code opened from outside the app (the system camera, a tapped link)
// lands on the class scanner: only an in-app scan lines a phone's clock up.
// One workout at a time: a code opened mid-workout (say, scanned again with
// the system camera while already in that class) is ignored rather than
// stacking a second workout on top of the first.
function openClassLink(url: string | null) {
  if (!url || !url.startsWith('fwt://class?')) return;
  if (!navigationRef.isReady()) {
    setTimeout(() => openClassLink(url), 300);
    return;
  }
  if (navigationRef.getCurrentRoute()?.name === 'ActiveWorkout') return;
  navigationRef.navigate('ClassJoin', { link: url });
}

// Store identity for the canonical review prompt. Module scope on purpose — the
// shell's session effect keys off this prop, so a fresh object every render
// would re-run it. The shell owns the whole trigger (canon § Review prompt).
// waitForSuccessMoment: an eligible session asks at the first finished workout
// (useWorkoutPlayback calls onSuccessMoment() on completion), not at launch.
const REVIEW = {
  appName: 'Workout Timer',
  iosAppStoreId: IOS_APP_STORE_ID,
  androidPackageName: ANDROID_PACKAGE,
  waitForSuccessMoment: true,
};

export default function App() {
  const [fontsLoaded] = useAppFonts();

  useEffect(() => {
    AudioEngine.initialize().catch(() => {});
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
    Linking.getInitialURL().then(openClassLink).catch(() => {});
    const sub = Linking.addEventListener('url', ({ url }) => openClassLink(url));
    return () => sub.remove();
  }, []);

  // Fonts are the only readiness gate.
  const ready = fontsLoaded;

  return (
    <AppShell ready={ready} review={REVIEW} navigationRef={navigationRef}>
      <Stack.Navigator screenOptions={{ headerShown: false, animation: QA_MODE ? 'none' : undefined }}>
        <Stack.Screen name="TimerList" component={TimerListScreen} />
        <Stack.Screen name="TimerEditor" component={TimerEditorScreen} />
        <Stack.Screen
          name="ActiveWorkout"
          component={ActiveWorkoutScreen}
          options={{ gestureEnabled: false }}
        />
        <Stack.Screen name="Settings" component={SettingsScreen} />
        <Stack.Screen name="Class" component={ClassScreen} />
        <Stack.Screen name="ClassJoin" component={ClassJoinScreen} />
        <Stack.Screen name="Acknowledgements">
          {(props) => <Credits onBack={() => props.navigation.goBack()} />}
        </Stack.Screen>
      </Stack.Navigator>
    </AppShell>
  );
}
