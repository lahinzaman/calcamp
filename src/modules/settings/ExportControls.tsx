import { useState } from 'react';
import { View } from 'react-native';
import { Text } from '../../theme/primitives';
import { Action } from '../../components/FormControls';
import { useAuthStore } from '../../store/authStore';
import { localDateKey } from '../../store/nutritionStore';
import { loadEntriesForRange, loadHistory, shiftDate } from '../../api/history';
import { daysCsv, entriesCsv, saveCsv } from './exportData';
import { haptic } from '../../theme/haptics';
const DAYS = 365;
export function ExportControls() {
  const owner = useAuthStore(s => s.session?.user.id);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const run = async (kind: 'days' | 'entries') => {
    if (!owner || busy) return;
    setBusy(kind); setNotice(null);
    const today = localDateKey(new Date()); const from = shiftDate(today, -(DAYS - 1));
    try {
      if (kind === 'days') {
        const days = await loadHistory(owner, from, today);
        if (!days.length) throw new Error('There is nothing to export yet.');
        const result = await saveCsv(`calcamp-days-${today}.csv`, daysCsv(days));
        setNotice(result === 'downloaded' ? `${days.length} days downloaded.` : `${days.length} days ready to share.`);
      } else {
        const grouped = await loadEntriesForRange(owner, from, today);
        const entries = Object.values(grouped).flat();
        if (!entries.length) throw new Error('No individual foods have been logged yet.');
        const result = await saveCsv(`calcamp-foods-${today}.csv`, entriesCsv(entries));
        setNotice(result === 'downloaded' ? `${entries.length} foods downloaded.` : `${entries.length} foods ready to share.`);
      }
      haptic('success');
    } catch (cause) { setNotice(cause instanceof Error ? cause.message : 'The export could not be created.'); haptic('error'); }
    finally { setBusy(null); }
  };
  return <View>
    <Text className="mb-3">Your data is yours. Export the last year as a spreadsheet at any time.</Text>
    <Action secondary label={busy === 'days' ? 'Preparing…' : 'Export daily totals (CSV)'} disabled={!!busy} onPress={() => void run('days')} />
    <Action secondary label={busy === 'entries' ? 'Preparing…' : 'Export every logged food (CSV)'} disabled={!!busy} onPress={() => void run('entries')} />
    {notice && <Text accessibilityLiveRegion="polite" className="mt-1 text-sm">{notice}</Text>}
  </View>;
}
