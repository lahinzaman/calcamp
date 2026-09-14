import assert from 'node:assert/strict';
import { test } from 'node:test';

import { saveProblem } from '../profile';

test('a rejected save names what the database objected to, never a connection it did not use', () => {
  // The regression this exists for: an app that allows any training schedule, talking to a
  // database still holding the four-day rule. "Check your connection" sends people nowhere.
  const stale = saveProblem({ code: '23514', message: 'new row for relation "users" violates check constraint "onboarding_profile_complete"' });
  assert.match(stale, /database is a version behind/);
  assert.doesNotMatch(stale, /connection/);

  assert.match(saveProblem({ code: '23514', message: 'violates check constraint "training_days_valid"' }), /one and seven/);
  assert.match(saveProblem({ code: '23514', message: 'violates check constraint "preworkout_allocation_valid"' }), /pre-workout/);
  assert.match(saveProblem({ code: '23503', message: 'foreign key violation' }), /Confirm your email/);
  assert.match(saveProblem({ code: '42501', message: 'permission denied' }), /Sign out and back in/);

  // An unrecognised failure keeps the database's own words rather than discarding them.
  assert.match(saveProblem({ code: 'PGRST204', message: "column 'nonsense' does not exist" }), /column 'nonsense' does not exist/);
  assert.match(saveProblem({}), /could not be saved/);

  // The constraint name can arrive in details rather than message.
  assert.match(saveProblem({ code: '23514', details: 'Failing row violates "onboarding_profile_complete"' }), /migration/);
});
