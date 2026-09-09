export interface UpdateAPI {
  isEnabled: boolean;
  checkForUpdateAsync: () => Promise<{ isAvailable: boolean; isRollBackToEmbedded?: boolean }>;
  fetchUpdateAsync: () => Promise<{ isNew: boolean; isRollBackToEmbedded: boolean }>;
  reloadAsync: () => Promise<void>;
}
export type UpdateState = 'idle' | 'checking' | 'downloading' | 'ready' | 'current' | 'unavailable' | 'error';
export class UpdateController {
  state: UpdateState = 'idle'; private busy = false;
  constructor(private api: UpdateAPI, private changed: (state: UpdateState) => void) {}
  private set(state: UpdateState) { this.state = state; this.changed(state); }
  async check() {
    if (this.busy || this.state === 'ready') return;
    if (!this.api.isEnabled) { this.set('unavailable'); return; }
    this.busy = true; this.set('checking');
    try {
      const result = await this.api.checkForUpdateAsync();
      if (!result.isAvailable && !result.isRollBackToEmbedded) { this.set('current'); return; }
      this.set('downloading'); const fetched = await this.api.fetchUpdateAsync();
      this.set(fetched.isNew || fetched.isRollBackToEmbedded ? 'ready' : 'current');
    } catch { this.set('error'); } finally { this.busy = false; }
  }
  async apply(canReload: () => boolean) {
    if (this.busy || this.state !== 'ready' || !canReload()) return false;
    this.busy = true;
    try { await this.api.reloadAsync(); return true; }
    catch { this.set('error'); return false; }
    finally { this.busy = false; }
  }
}
