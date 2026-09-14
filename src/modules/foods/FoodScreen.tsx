import { View } from 'react-native';
import { router } from 'expo-router';
import { Text } from '../../theme/primitives';
import { Pressable } from '../../theme/Pressable';
import { SafeAreaView } from '../../theme/SafeArea';
import { Reveal } from '../../theme/motion';
import { FoodLibrary } from './FoodSearchModal';
import { useT } from '../../i18n';

/** The food library as a tab. The + button opens the same component in a sheet. */
export default function FoodScreen() {
  const t = useT();
  return <SafeAreaView edges={['top', 'left', 'right']} className="flex-1 bg-background">
    <View className="flex-1 px-5 pt-2" style={{ maxWidth: 760, width: '100%', alignSelf: 'center' }}>
      <FoodLibrary onDone={() => {}}
        header={<Reveal index={0}>
          <Text className="text-sm font-bold tracking-widest">{t('food.eyebrow')}</Text>
          <Text className="mb-1 mt-2 text-4xl font-bold">{t('food.title')}</Text>
          <Text className="mb-4">{t('food.subtitle')}</Text>
        </Reveal>}
        footer={<Pressable accessibilityRole="button" accessibilityLabel={t('food.fullMenu')}
          onPress={() => router.push('/dining')} weight="subtle"
          className="mt-2 min-h-12 flex-row items-center justify-between gap-3 rounded-2xl border border-border bg-surface px-4 py-3">
          <Text className="flex-1 font-bold">{t('food.fullMenu')}</Text><Text>›</Text>
        </Pressable>} />
    </View>
  </SafeAreaView>;
}
