import * as Updates from 'expo-updates';
import * as Sentry from '@sentry/react-native';
import { setTelemetrySink } from './events';
const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN?.trim();
const enabled = !!dsn && /^https:\/\/[^@\s]+@[^\s]+\/\d+$/.test(dsn);
Sentry.init({ dsn: enabled ? dsn : undefined, enabled, sendDefaultPii: false,
  enableNative: enabled, enableNativeCrashHandling: enabled, enableAutoSessionTracking: enabled,
  tracesSampleRate: 0, attachScreenshot: false, attachViewHierarchy: false,
  // Omit automatic network/console breadcrumbs: tokens, coordinates and meal inputs can occur there.
  beforeBreadcrumb: crumb => crumb.category?.startsWith('rulocked.') ? crumb : null,
  beforeSend: event => {
    delete event.user; delete event.request; delete event.extra;
    if (event.exception?.values) for (const exception of event.exception.values) {
      exception.value = 'Application exception';
      for (const frame of exception.stacktrace?.frames ?? []) { delete frame.vars; if (frame.filename) frame.filename = frame.filename.split('?')[0]; }
    }
    if (event.message) event.message = 'Application diagnostic';
    return event;
  },
});
if (enabled) {
  Sentry.setTag('expo-update-id', Updates.updateId ?? 'embedded');
  Sentry.setTag('expo-update-channel', Updates.channel ?? 'development');
  Sentry.setTag('expo-runtime', Updates.runtimeVersion ?? 'development');
}
if (enabled) setTelemetrySink((event, data) => Sentry.addBreadcrumb({ category: `rulocked.${event}`, level: 'info', data }), error => Sentry.captureException(error));
export const wrapWithTelemetry = Sentry.wrap;
