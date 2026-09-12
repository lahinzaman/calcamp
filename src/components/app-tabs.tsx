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

      <NativeTabs.Trigger name="food">
        <NativeTabs.Trigger.Label>Food</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="fork.knife" md="restaurant" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="trends">
        <NativeTabs.Trigger.Label>Trends</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="chart.line.uptrend.xyaxis" md="trending_up" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="train">
        <NativeTabs.Trigger.Label>Train</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          src={require('@/assets/images/tabIcons/explore.png')}
          renderingMode="template"
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="profile">
        <NativeTabs.Trigger.Label>Profile</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="person.crop.circle" md="account_circle" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
