import { Platform } from 'react-native';
export { toCsv, daysCsv, entriesCsv } from './csv';
/** Web downloads through a blob link; native writes a cache file and opens the share sheet. */
export async function saveCsv(filename: string, contents: string) {
  if (Platform.OS === 'web') {
    const blob = new Blob([contents], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = filename; document.body.appendChild(link); link.click();
    link.remove(); URL.revokeObjectURL(url);
    return 'downloaded' as const;
  }
  const { File, Paths } = await import('expo-file-system');
  const file = new File(Paths.cache, filename);
  if (file.exists) file.delete();
  file.create();
  file.write(contents);
  const Sharing = await import('expo-sharing');
  if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is unavailable on this device. Your export is saved in the app cache.');
  await Sharing.shareAsync(file.uri, { mimeType: 'text/csv', dialogTitle: 'Export CalCamp data' });
  return 'shared' as const;
}
