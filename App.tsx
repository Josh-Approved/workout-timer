import React, { useEffect } from 'react';
import { useColorScheme } from 'react-native';
import { NavigationContainer, DefaultTheme, DarkTheme, Theme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import * as ScreenOrientation from 'expo-screen-orientation';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { RootStackParamList } from './src/types';
import { AudioEngine } from './src/audio/AudioEngine';
import { useAppFonts, lightColors, darkColors, fontFamily } from './src/theme';
import TimerListScreen from './src/screens/TimerListScreen';
import TimerEditorScreen from './src/screens/TimerEditorScreen';
import ActiveWorkoutScreen from './src/screens/ActiveWorkoutScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import Credits from './src/components/Credits';
import { QA_MODE } from './src/qa/qaMode';

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
  const isDark = useColorScheme() === 'dark';
  const [fontsLoaded] = useAppFonts();

  useEffect(() => {
    AudioEngine.initialize().catch(() => {});
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
  }, []);

  if (!fontsLoaded) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <NavigationContainer theme={buildNavTheme(isDark)}>
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
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
