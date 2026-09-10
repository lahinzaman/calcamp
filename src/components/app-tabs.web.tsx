import { Tabs, TabList, TabTrigger, TabSlot, type TabTriggerSlotProps } from 'expo-router/ui';
import { View } from 'react-native';
import { Pressable } from '../theme/Pressable';
import { Text } from '../theme/primitives';

function TabButton({ children, isFocused, ...props }: TabTriggerSlotProps) {
  return <Pressable {...props} className={isFocused ? 'flex-1 items-center rounded-xl bg-background px-2 py-3' : 'flex-1 items-center rounded-xl px-2 py-3'}>
    <Text className={isFocused ? 'text-xs font-semibold text-ink' : 'text-xs font-semibold text-ink'}>{children}</Text>
  </Pressable>;
}

export default function AppTabs() {
  return <Tabs style={{ flex: 1 }}>
    <TabSlot style={{ flex: 1 }} />
    <TabList asChild>
      <View className="mx-auto w-full max-w-xl flex-row justify-center gap-1 border-t border-border bg-surface px-2 py-3">
          <TabTrigger name="today" href="/" asChild><TabButton>Today</TabButton></TabTrigger>
          <TabTrigger name="dining" href="/dining" asChild><TabButton>Dining</TabButton></TabTrigger>
          <TabTrigger name="workout" href="/explore" asChild><TabButton>Workout</TabButton></TabTrigger>

          <TabTrigger name="campus" href="/campus" asChild><TabButton>Campus</TabButton></TabTrigger>
          <TabTrigger name="settings" href="/settings" asChild><TabButton>Settings</TabButton></TabTrigger>
      </View>
    </TabList>
  </Tabs>;
}
