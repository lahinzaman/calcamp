import { useState } from 'react';
import { Modal, ScrollView, View } from 'react-native';
import { Text } from '../../theme/primitives';
import { Pressable } from '../../theme/Pressable';
import { SafeAreaView } from '../../theme/SafeArea';
import { Action } from '../../components/FormControls';
import { haptic } from '../../theme/haptics';
import { useT } from '../../i18n';

type Intent = 'finish' | 'cancel';

/**
 * Finishing writes a session to your history and cancelling destroys it. Both are one tap
 * from a screen you are tapping repeatedly, so both ask first, and the cancel sheet says
 * plainly what is about to be lost.
 */
export function SessionControls({ completedSets, volumeLbs, onFinish, onCancel }: {
  completedSets: number; volumeLbs: number; onFinish: () => void; onCancel: () => void;
}) {
  const t = useT();
  const [intent, setIntent] = useState<Intent | null>(null);
  const close = () => setIntent(null);
  const confirm = () => {
    const action = intent === 'finish' ? onFinish : onCancel;
    setIntent(null);
    haptic(intent === 'finish' ? 'success' : 'warning');
    action();
  };
  return <>
    <View className="mt-6 gap-3">
      <Pressable accessibilityRole="button" accessibilityLabel={t('train.finishSession')} onPress={() => { setIntent('finish'); haptic('selection'); }}
        weight="firm" className="min-h-14 items-center justify-center rounded-2xl bg-accent px-4">
        <Text className="font-bold">{t('train.finishSession')}</Text>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={t('train.cancelSession')} onPress={() => { setIntent('cancel'); haptic('selection'); }}
        weight="subtle" tone="warning" className="min-h-12 items-center justify-center rounded-2xl border border-border px-4">
        <Text className="font-semibold">{t('train.cancelSession')}</Text>
      </Pressable>
    </View>

    {intent && <Modal visible presentationStyle="pageSheet" animationType="slide" onRequestClose={close}>
      <SafeAreaView className="flex-1 bg-background"><ScrollView contentContainerStyle={{ padding: 24 }}>
        <Text className="mb-3 text-3xl font-bold">{intent === 'finish' ? t('train.finishConfirm') : t('train.cancelConfirm')}</Text>
        {intent === 'finish' ? <>
          <Text className="mb-5 leading-6">
            {completedSets === 0
              ? 'No sets are marked done yet, so this session will be saved empty. You can cancel instead and nothing is recorded.'
              : `${completedSets} completed ${completedSets === 1 ? 'set' : 'sets'} and ${Math.round(volumeLbs).toLocaleString()} lbs of volume will be saved to your history and counted towards your records.`}
          </Text>
          <Action label={t('train.finishAndSave')} onPress={confirm} tone="success" />
        </> : <>
          <Text className="mb-5 leading-6">
            {completedSets === 0
              ? 'Nothing has been logged yet, so nothing is lost.'
              : `${completedSets} completed ${completedSets === 1 ? 'set' : 'sets'} will be thrown away. This session will not appear in your history and will not count towards your records. It cannot be undone.`}
          </Text>
          <Action label={t('train.discard')} onPress={confirm} tone="none" />
        </>}
        <Action secondary label={t('train.keepTraining')} onPress={close} />
      </ScrollView></SafeAreaView>
    </Modal>}
  </>;
}
