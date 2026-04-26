import React, { useEffect } from 'react';
import { useColorScheme } from 'react-native';
import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { RootStackParamList } from './src/types';
import { AudioEngine } from './src/audio/AudioEngine';
import TimerListScreen from './src/screens/TimerListScreen';
import TimerEditorScreen from './src/screens/TimerEditorScreen';
import ActiveWorkoutScreen from './src/screens/ActiveWorkoutScreen';
import SettingsScreen from './src/screens/SettingsScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  const colorScheme = useColorScheme();

  useEffect(() => {
    AudioEngine.initialize().catch(() => {});
  }, []);

  return (
    <NavigationContainer theme={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="TimerList" component={TimerListScreen} />
        <Stack.Screen name="TimerEditor" component={TimerEditorScreen} />
        <Stack.Screen
          name="ActiveWorkout"
          component={ActiveWorkoutScreen}
          options={{ gestureEnabled: false }}
        />
        <Stack.Screen name="Settings" component={SettingsScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
