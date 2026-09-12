import { ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { Text } from '../../theme/primitives';
import { Pressable } from '../../theme/Pressable';
import { SafeAreaView } from '../../theme/SafeArea';
import { Reveal } from '../../theme/motion';
import { FoodLibrary } from './FoodSearchModal';

/** The food library as a tab. The + button opens the same component in a sheet. */
export default function FoodScreen() {
  return <SafeAreaView edges={['top', 'left', 'right']} className="flex-1 bg-background">
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 20, paddingBottom: 110, maxWidth: 760, width: '100%', alignSelf: 'center' }}>
      <Reveal index={0}>
        <Text className="text-sm font-bold tracking-widest">FOOD</Text>
        <Text className="mb-1 mt-2 text-4xl font-bold">Find it once</Text>
        <Text className="mb-4">Search, campus dining, your recipes and the foods you log most.</Text>
      </Reveal>
      <View className="mb-4">
        <FoodLibrary onDone={() => {}} footer={
          <Pressable accessibilityRole="button" accessibilityLabel="Browse the full campus menu"
            onPress={() => router.push('/dining')} weight="subtle"
            className="mt-2 min-h-12 flex-row items-center justify-between gap-3 rounded-2xl border border-border bg-surface px-4 py-3">
            <Text className="flex-1 font-bold">Browse the full campus menu</Text><Text>›</Text>
          </Pressable>} />
      </View>
    </ScrollView>
  </SafeAreaView>;
}
