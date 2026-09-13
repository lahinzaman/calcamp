import { useState } from 'react';
import { Image, ScrollView, View } from 'react-native';
import { Text } from '../../theme/primitives';
import { Pressable } from '../../theme/Pressable';
import { Card } from '../insights/AnalyticsCards';
import { haptic } from '../../theme/haptics';
import { useAuthStore } from '../../store/authStore';
import { comparison, deleteCapture, readPhotoDays, removePhoto, type PhotoDay } from './photos';

const signed = (value: number) => `${value > 0 ? '+' : value < 0 ? '−' : ''}${Math.abs(value).toFixed(1)} lbs`;
const dayLabel = (date: string) => new Date(`${date}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

export function ProgressPhotoCard({ index }: { index: number }) {
  const owner = useAuthStore(s => s.session?.user.id) ?? 'anonymous';
  const [days, setDays] = useState<PhotoDay[]>(() => readPhotoDays(owner));
  if (!days.length) return null;
  const change = comparison(days);
  return <Card title="Progress photos" index={index}>
    {change && <Text className="mb-4">
      {change.days} {change.days === 1 ? 'day' : 'days'} between your first and latest photo
      {change.weightChangeLbs === null ? '.' : `, and ${signed(change.weightChangeLbs)} on the scale.`}
    </Text>}
    {days.slice(0, 8).map(day => <View key={day.date} className="mb-4">
      <View className="mb-2 flex-row items-baseline justify-between gap-3">
        <Text className="flex-1 text-sm font-bold">{dayLabel(day.date)}</Text>
        {day.photos[0]?.weightLbs !== null && day.photos[0] !== undefined
          && <Text className="text-sm">{day.photos[0].weightLbs!.toFixed(1)} lbs</Text>}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {day.photos.map(photo => <Pressable key={photo.id} accessibilityRole="button"
          accessibilityLabel={`Delete progress photo from ${dayLabel(day.date)}`}
          onLongPress={() => { void deleteCapture(photo.uri); setDays(removePhoto(owner, day.date, photo.id)); haptic('warning'); }}
          weight="subtle">
          <Image source={{ uri: photo.uri }} style={{ height: 160, width: 120, borderRadius: 12, backgroundColor: '#222' }} accessibilityIgnoresInvertColors />
        </Pressable>)}
      </ScrollView>
    </View>)}
    <Text className="text-xs">Photos live on this device only — they are never uploaded, and a reinstall clears them. Press and hold one to delete it.</Text>
  </Card>;
}
