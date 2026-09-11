import { Stack } from 'expo-router';
export default function OnboardingLayout() {
  return <Stack screenOptions={{ headerTitle: 'Set up CalCamp' }}>
    <Stack.Screen name="index" options={{ title: 'A few questions' }} />
    <Stack.Screen name="review" options={{ title: 'Your plan' }} />
  </Stack>;
}
