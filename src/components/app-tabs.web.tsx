import { Tabs, TabList, TabTrigger, TabSlot, type TabTriggerSlotProps } from 'expo-router/ui';
import { Pressable, Text, View } from 'react-native';

function TabButton({ children, isFocused, ...props }: TabTriggerSlotProps) {
  return <Pressable {...props} className={isFocused ? 'flex-1 items-center rounded-xl bg-zinc-950 px-2 py-3' : 'flex-1 items-center rounded-xl px-2 py-3'}>
    <Text className={isFocused ? 'font-semibold text-white' : 'font-semibold text-zinc-500'}>{children}</Text>
  </Pressable>;
}

export default function AppTabs() {
  return <Tabs style={{ flex: 1 }}>
    <TabSlot style={{ flex: 1 }} />
    <TabList asChild>
      <View className="mx-auto w-full max-w-xl flex-row justify-center gap-1 border-t border-zinc-200 bg-white px-2 py-3">
          <TabTrigger name="dining" href="/" asChild><TabButton>Dining</TabButton></TabTrigger>
          <TabTrigger name="workout" href="/explore" asChild><TabButton>Workout</TabButton></TabTrigger>
          <TabTrigger name="walk" href="/walk" asChild><TabButton>Walk</TabButton></TabTrigger>
          <TabTrigger name="campus" href="/campus" asChild><TabButton>Campus</TabButton></TabTrigger>
          <TabTrigger name="settings" href="/settings" asChild><TabButton>Settings</TabButton></TabTrigger>
      </View>
    </TabList>
  </Tabs>;
}
