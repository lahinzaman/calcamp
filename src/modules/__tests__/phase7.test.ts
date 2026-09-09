import assert from 'node:assert/strict';
import { test } from 'node:test';
import { UpdateController, type UpdateAPI, type UpdateState } from '../updates/controller';
import { validateFeedback } from '../feedback/model';
import { durableStorage } from '../sync/storage';
import { removeLocalAccountData } from '../account/localData';
test('OTA checks coalesce, failures preserve the app, and reload waits for an idle workout', async () => {
  const states: UpdateState[] = []; let checks = 0; let reloads = 0;
  const api: UpdateAPI = { isEnabled: true, checkForUpdateAsync: async () => { checks++; return { isAvailable: true }; }, fetchUpdateAsync: async () => ({ isNew: true, isRollBackToEmbedded: false }), reloadAsync: async () => { reloads++; } };
  const controller = new UpdateController(api, state => states.push(state));
  await Promise.all([controller.check(), controller.check()]); assert.equal(checks, 1); assert.deepEqual(states, ['checking','downloading','ready']);
  assert.equal(await controller.apply(() => false), false); assert.equal(reloads, 0);
  assert.equal(await controller.apply(() => true), true); assert.equal(reloads, 1);
  const unavailable = new UpdateController({ ...api, isEnabled: false }, () => {}); await unavailable.check(); assert.equal(unavailable.state, 'unavailable');
  const failed = new UpdateController({ ...api, fetchUpdateAsync: async () => { throw new Error('network'); } }, () => {}); await failed.check(); assert.equal(failed.state, 'error'); assert.equal(reloads, 1);
});
test('OTA embedded rollback is fetched and can be applied', async () => {
  let reloads = 0;
  const controller = new UpdateController({ isEnabled: true, checkForUpdateAsync: async () => ({ isAvailable: false, isRollBackToEmbedded: true }), fetchUpdateAsync: async () => ({ isNew: false, isRollBackToEmbedded: true }), reloadAsync: async () => { reloads++; } }, () => {});
  await controller.check(); assert.equal(controller.state, 'ready'); await controller.apply(() => true); assert.equal(reloads, 1);
});
test('feedback validates text and local account purge leaves other accounts intact', () => {
  assert.throws(() => validateFeedback({ id: 'id', category: 'bug', message: ' short ', context: {} }));
  durableStorage.set('account:alice', 'private'); durableStorage.set('profile:alice', 'private'); durableStorage.set('notification-cooldown:alice:gym:werblin','private');
  durableStorage.set('account:bob','keep'); durableStorage.set('active-sync-owner','bob');
  removeLocalAccountData('alice'); assert.equal(durableStorage.get('account:alice'), null); assert.equal(durableStorage.get('profile:alice'), null); assert.equal(durableStorage.get('notification-cooldown:alice:gym:werblin'), null);
  assert.equal(durableStorage.get('account:bob'),'keep'); assert.equal(durableStorage.get('active-sync-owner'),'bob');
});
