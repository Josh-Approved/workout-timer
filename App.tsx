/**
 * App root for Workout Timer. The shell (<AppShell/>) owns the chrome — gesture
 * root, safe area, error boundary, the themed NavigationContainer + status bar,
 * and the cold-start splash. App.tsx owns only the readiness gate, the screen
 * list, and this app's startup effects (audio engine init, portrait lock).
 */

import React, { useEffect } from 'react';
import * as SplashScreen from 'expo-splash-screen';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import * as ScreenOrientation from 'expo-screen-orientation';
import { RootStackParamList } from './src/types';
import { AudioEngine } from './src/audio/AudioEngine';
import { useAppFonts } from './src/theme';
import { AppShell } from './src/shell/AppShell';
import TimerListScreen from './src/screens/TimerListScreen';
import TimerEditorScreen from './src/screens/TimerEditorScreen';
import ActiveWorkoutScreen from './src/screens/ActiveWorkoutScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import Credits from './src/components/Credits';
import { QA_MODE } from './src/qa/qaMode';

// Hold the native launch screen until the JS splash takes over (no icon blink).
// Skipped under QA_MODE so the e2e screenshot harness sees deterministic frames.
if (!QA_MODE) {
  SplashScreen.preventAutoHideAsync().catch(() => {});
}

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  const [fontsLoaded] = useAppFonts();

  useEffect(() => {
    AudioEngine.initialize().catch(() => {});
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
  }, []);

  // Fonts are the only readiness gate.
  const ready = fontsLoaded;

  return (
    <AppShell ready={ready}>
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
    </AppShell>
  );
}
