import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, ScrollView, View } from 'react-native';
import { SafeAreaView } from '../../theme/SafeArea';
import { Text } from '../../theme/primitives';
import { Action, Field } from '../../components/FormControls';
import { ScanProgress, useScanProgress } from '../../components/ScanProgress';
import { confirmToast } from '../../components/Toast';
import { haptic } from '../../theme/haptics';
import { useAuthStore } from '../../store/authStore';
import { metersToMiles } from '../../lib/units';
import { CameraScanner } from './CameraScanner';
import { LabelUnavailable } from './recognizeLabel';
import { estimateSteps, parseTreadmillDisplay, type TreadmillReading } from './treadmill';
import { validateSession } from './treadmillLog';

const number = (value: string) => value.trim() ? Number(value) : null;
const text = (value: number | null) => value === null ? '' : String(Number(value.toFixed(2)));
const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, '0')}`;

interface Draft { steps: string; miles: string; minutes: string; calories: string }

/**
 * A treadmill session, read off the console.
 *
 * Deliberately not part of the food quick-log: this adds steps and a walk, not an entry to the
 * diary, and routing it through a form built for macros would mean a screen that asks for
 * protein. It shares the camera and the OCR, and nothing else.
 */
export function TreadmillLogModal({ onClose }: { onClose: () => void }) {
  const profile = useAuthStore(s => s.profile);
  const [reading, setReading] = useState<TreadmillReading | null>(null);
  const [draft, setDraft] = useState<Draft>({ steps: '', miles: '', minutes: '', calories: '' });
  const [estimated, setEstimated] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scan = useScanProgress();
  const locked = useRef(false);

  const read = async (uri: string) => {
    if (locked.current) return;
    locked.current = true; setBusy(true); setError(null); scan.begin();
    try {
      scan.reach(.4);
      // The same on-device text recognition the nutrition label uses; a console is just text.
      const { recognizeRawText } = await import('./recognizeLabel');
      const raw = await recognizeRawText(uri);
      scan.reach(.85);
      const parsed = parseTreadmillDisplay(raw);
      const steps = estimateSteps(parsed, profile?.height_inches ?? null);
      scan.done();
      setReading(parsed);
      setEstimated(steps ? !steps.measured : false);
      setDraft({
        steps: steps ? String(steps.steps) : '',
        miles: parsed.distanceMeters === null ? '' : text(metersToMiles(parsed.distanceMeters)),
        minutes: parsed.durationSeconds === null ? '' : text(parsed.durationSeconds / 60),
        calories: text(parsed.calories),
      });
      if (!parsed.found.length) setError('Nothing on that photo read as a treadmill display. Fill in what it showed, or try again with the console filling the frame.');
    } catch (cause) {
      scan.reset();
      setReading({ distanceMeters: null, durationSeconds: null, calories: null, speedMph: null, inclinePercent: null, steps: null, found: [] });
      setError(cause instanceof LabelUnavailable ? cause.message : 'That display could not be read. Enter what it showed by hand.');
    } finally { setBusy(false); locked.current = false; }
  };

  const save = async () => {
    const steps = number(draft.steps);
    const miles = number(draft.miles);
    const minutes = number(draft.minutes);
    const session = {
      steps: steps === null ? 0 : Math.round(steps),
      estimated,
      distanceMeters: miles === null ? null : miles * 1609.344,
      durationSeconds: minutes === null ? null : Math.round(minutes * 60),
      calories: number(draft.calories),
    };
    const problem = validateSession(session);
    if (problem) { setError(problem); haptic('error'); return; }
    try {
      const { recordTreadmillSession } = await import('../sync/runtime');
      const day = recordTreadmillSession(session);
      confirmToast(`${session.steps.toLocaleString()} steps added · ${day.steps.toLocaleString()} from the treadmill today`);
      haptic('success'); onClose();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'That session could not be saved.'); haptic('error'); }
  };

  if (!reading) return <Modal visible animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose} statusBarTranslucent>
    <View style={{ flex: 1 }}>
      <CameraScanner mode="treadmill" busy={busy} notice={error}
        onBarcode={() => {}} onCapture={() => {}} onCaptureUri={uri => { void read(uri); }}
        onManual={() => { setReading({ distanceMeters: null, durationSeconds: null, calories: null, speedMph: null, inclinePercent: null, steps: null, found: [] }); }}
        onClose={onClose} />
      {busy && <View accessibilityViewIsModal style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,.6)' }}>
        <ScanProgress value={scan.value} label="Reading the display…" onDark />
      </View>}
    </View>
  </Modal>;

  const steps = number(draft.steps);
  return <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
    <SafeAreaView className="flex-1 bg-background"><KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 20, paddingBottom: 60 }}>
        <Text className="text-3xl font-bold">Treadmill session</Text>
        <Text className="mb-5 mt-2 text-sm">
          {reading.found.length
            ? `Read ${reading.found.join(', ')} off the display. Check every figure against the console before saving — OCR of a seven-segment display is not reliable enough to trust unread.`
            : 'Nothing was read automatically. Enter what the console showed.'}
        </Text>

        <Field label="Steps" value={draft.steps} keyboardType="number-pad"
          onChangeText={value => { setDraft(current => ({ ...current, steps: value })); setEstimated(false); }} />
        {estimated && <Text className="mb-3 mt-1 text-sm">
          Estimated from {draft.miles || '—'} miles at a stride worked out from your height
          {profile?.height_inches ? '' : ', which is not on file — this assumes an average build'}.
          The treadmill did not display a step count. Correct it if you know better.
        </Text>}

        <Field label="Distance · miles" value={draft.miles} keyboardType="decimal-pad"
          onChangeText={value => setDraft(current => ({ ...current, miles: value }))} />
        <Field label="Time · minutes" value={draft.minutes} keyboardType="decimal-pad"
          onChangeText={value => setDraft(current => ({ ...current, minutes: value }))} />
        <Field label="Calories the console showed (optional)" value={draft.calories} keyboardType="number-pad"
          onChangeText={value => setDraft(current => ({ ...current, calories: value }))} />

        {reading.durationSeconds !== null && <Text className="mt-1 text-sm">Console time read as {clock(reading.durationSeconds)}.</Text>}
        {reading.speedMph !== null && <Text className="text-sm">Speed {reading.speedMph} mph{reading.inclinePercent !== null ? ` at ${reading.inclinePercent}% incline` : ''}.</Text>}

        <View className="my-5 rounded-2xl bg-raised p-4">
          <Text className="text-sm font-bold">Before you save</Text>
          <Text className="mt-2 text-sm">
            These steps are added to your day on top of whatever your phone or watch counted. If you
            carried either while you walked, those steps are already counted and adding them again
            will overstate the day. This is for a treadmill your devices did not see.
          </Text>
          <Text className="mt-2 text-sm">Treadmill steps stay in CalCamp and are never written to Apple Health.</Text>
        </View>

        {error && <Text accessibilityRole="alert" className="mb-3 text-sm">{error}</Text>}
        <Action label={steps ? `Add ${Math.round(steps).toLocaleString()} steps to today` : 'Enter a step count'}
          disabled={!steps} tone={steps ? 'success' : 'none'} onPress={() => { void save(); }} />
        <Action secondary label="Cancel" onPress={onClose} />
      </ScrollView>
    </KeyboardAvoidingView></SafeAreaView>
  </Modal>;
}
