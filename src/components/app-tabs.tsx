import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { useThemeStore } from '../theme/store';

import { Colors } from '@/constants/theme';

export default function AppTabs() {
  const scheme = useThemeStore(s => s.mode);
  const colors = Colors[scheme];

  return (
    <NativeTabs
      backgroundColor={colors.background}
      indicatorColor={colors.backgroundElement}
      labelStyle={{ color: colors.text, fontFamily: 'GoogleSansBold', fontSize: 12 }}>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>Today</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          src={require('@/assets/images/tabIcons/home.png')}
          renderingMode="template"
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="health">
        <NativeTabs.Trigger.Label>Health</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="heart.text.square" md="monitor_heart" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="explore">
        <NativeTabs.Trigger.Label>Workout</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          src={require('@/assets/images/tabIcons/explore.png')}
          renderingMode="template"
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="campus">
        <NativeTabs.Trigger.Label>Campus</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="building.2" md="domain" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="settings"><NativeTabs.Trigger.Label>Settings</NativeTabs.Trigger.Label><NativeTabs.Trigger.Icon sf="gearshape" md="settings" /></NativeTabs.Trigger>
    </NativeTabs>
  );
}
