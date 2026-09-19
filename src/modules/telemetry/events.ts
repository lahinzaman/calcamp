export type TelemetryEvent = 'sync.queued' | 'sync.syncing' | 'sync.synced' | 'sync.retry' | 'sync.conflict' | 'health.permission' | 'health.merge' | 'health.conflict' | 'health.unavailable' | 'api.fallback' | 'notification.registration' | 'notification.received' | 'background.wake' | 'barcode.scanner';
type SafeData = { outcome?: 'ok' | 'unavailable' | 'denied' | 'stale' | 'requested'; count?: number; source?: 'health' | 'nutrislice' | 'campus' | 'geofence' | 'push' | 'camera' };
let sink: ((event: TelemetryEvent, data: SafeData) => void) | undefined;
let reporter: ((error: unknown) => void) | undefined;
export function setTelemetrySink(next: typeof sink, report?: typeof reporter) { sink = next; reporter = report; }
export function breadcrumb(event: TelemetryEvent, data: SafeData = {}) { try { sink?.(event, data); } catch { /* Telemetry cannot block an edit. */ } }
export function reportException(error: unknown) { try { reporter?.(error); } catch { /* Reporting is best effort. */ } }
