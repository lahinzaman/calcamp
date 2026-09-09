// Register before Expo Router mounts so cold background launches can resolve tasks.
import './src/modules/telemetry/sentry';
import './src/modules/sync/background';
import './src/modules/background/registry';
import 'expo-router/entry';
