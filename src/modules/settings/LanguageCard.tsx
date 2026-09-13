import { View } from 'react-native';
import { Text } from '../../theme/primitives';
import { Choice } from '../../components/FormControls';
import { haptic } from '../../theme/haptics';
import { LOCALES, SYSTEM, currentPreference, needsRestartForDirection, setLocale, useT } from '../../i18n';
import { useLocale } from '../../i18n';

export function LanguageCard() {
  const t = useT();
  useLocale();
  const preference = currentPreference();
  return <View>
    <Text className="mb-3">{t('language.explainer')}</Text>
    <View className="mb-2 flex-row flex-wrap">
      <Choice label={t('language.system')} selected={preference === SYSTEM} onPress={() => { setLocale(SYSTEM); haptic('selection'); }} />
      {LOCALES.map(locale => <Choice key={locale.tag} label={locale.native}
        selected={preference === locale.tag} onPress={() => { setLocale(locale.tag); haptic('selection'); }} />)}
    </View>
    {needsRestartForDirection() && <Text className="text-sm">Restart CalCamp to finish switching the layout direction for this language.</Text>}
  </View>;
}
