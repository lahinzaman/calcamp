import { Stack } from 'expo-router';
import { useOnboardingStore } from '../../store/onboardingStore';
export default function OnboardingLayout() {
  const advanced = useOnboardingStore(s => s.draft.is_advanced_track);
  return <Stack screenOptions={{ headerTitle: 'Set up CalCamp' }}>
    <Stack.Screen name="index" options={{ title: 'Choose a track' }} />
    <Stack.Screen name="basics" options={{ title: 'Your basics' }} />
    <Stack.Protected guard={advanced}><Stack.Screen name="advanced" options={{ title: 'Training preferences' }} /></Stack.Protected>
    <Stack.Screen name="review" options={{ title: 'Review & save' }} />
  </Stack>;
}
