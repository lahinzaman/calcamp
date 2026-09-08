import type { ConfigContext, ExpoConfig } from 'expo/config';
export default ({ config }: ConfigContext): ExpoConfig => {
  const variant = process.env.APP_VARIANT ?? process.env.EAS_BUILD_PROFILE ?? 'development';
  if (!['development', 'preview', 'production'].includes(variant)) throw new Error('Use a development, preview, or production app variant.');
  const development = variant === 'development';
  const suffix = variant === 'production' ? '' : `.${variant}`;
  const projectId = process.env.EAS_PROJECT_ID ?? config.extra?.eas?.projectId;
  const plugins = (config.plugins ?? []).map(plugin => {
    if (Array.isArray(plugin) && plugin[0] === 'expo-build-properties') return [plugin[0], {
      ...plugin[1], android: { ...plugin[1]?.android, minSdkVersion: 26, usesCleartextTraffic: development },
    }] as [string, Record<string, unknown>];
    return plugin;
  });
  return {
    ...config, name: variant === 'production' ? 'RULocked' : `RULocked ${development ? 'Dev' : 'Preview'}`, slug: 'rulocked',
    ...(process.env.EXPO_OWNER ? { owner: process.env.EXPO_OWNER } : {}),
    ios: { ...config.ios, bundleIdentifier: process.env.IOS_BUNDLE_IDENTIFIER ?? `com.rulocked.app${suffix}`,
      infoPlist: { ...config.ios?.infoPlist, ITSAppUsesNonExemptEncryption: false,
        NSAppTransportSecurity: { NSAllowsArbitraryLoads: development, NSAllowsLocalNetworking: development } } },
    android: { ...config.android, package: process.env.ANDROID_PACKAGE ?? `com.rulocked.app${suffix}` },
    plugins,
    extra: { ...config.extra, ...(projectId ? { eas: { projectId } } : {}) },
  };
};
