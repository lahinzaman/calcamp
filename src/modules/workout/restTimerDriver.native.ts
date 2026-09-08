import { NativeModules } from 'react-native';

/** One app-level owner; native code is intentionally not loaded in Expo Go. */
export function startRestTicker(tick: () => void): () => void {
  if (!NativeModules.RNBackgroundTimer) {
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }
  const BackgroundTimer = (require('react-native-background-timer') as typeof import('react-native-background-timer')).default;
  BackgroundTimer.start();
  const id = BackgroundTimer.setInterval(tick, 500);
  return () => {
    BackgroundTimer.clearInterval(id);
    BackgroundTimer.stop();
  };
}
