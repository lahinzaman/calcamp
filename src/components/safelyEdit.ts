import { useSyncStatus } from '../store/syncStore';
/** Keep native input events usable if an atomic device write fails. */
export function safelyEdit(action: () => unknown) {
  try { action(); }
  catch { useSyncStatus.setState({ error: 'This edit could not be saved. Check device storage and try again.' }); }
}
