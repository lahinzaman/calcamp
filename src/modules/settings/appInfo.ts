import { Platform } from 'react-native';
import * as Application from 'expo-application';
import * as Updates from 'expo-updates';
import Constants from 'expo-constants';
export function appInfo() {
  return { os: Platform.OS, os_version: String(Platform.Version ?? 'unknown'),
    app_version: Application.nativeApplicationVersion ?? Constants.expoConfig?.version ?? 'unknown',
    build: Application.nativeBuildVersion ?? 'development', update_id: Updates.updateId ?? 'embedded',
    runtime: Updates.runtimeVersion ?? 'development', channel: Updates.channel ?? 'development' };
}
