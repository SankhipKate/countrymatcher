import test from 'node:test';
import assert from 'node:assert/strict';
import { readActiveRp4Packages } from './helpers/active-country-manifest.mjs';

const packages = await readActiveRp4Packages();

test('active numeric SAVINGS alternatives with documentary history remain questionnaire-evaluable', () => {
  const audited = [];

  for (const pkg of packages) {
    for (const route of pkg.routes || []) {
      for (const requirement of route.requirements || []) {
        if (requirement.type !== 'FINANCIAL' || requirement.evaluation_mode !== 'ENGINE') continue;
        for (const alternative of requirement.financial?.alternatives || []) {
          if (alternative.kind !== 'SAVINGS') continue;
          if (!Number.isFinite(alternative.amount)) continue;
          if (!(Number.isFinite(alternative.history_months) && alternative.history_months > 0)) continue;

          audited.push(`${pkg.country_id}:${route.route_id}:${requirement.requirement_id}`);
          assert.equal(
            alternative.asked_in_questionnaire,
            true,
            `${pkg.country_id}:${route.route_id}:${requirement.requirement_id} numeric SAVINGS must remain evaluable even when filing requires history/seasoning`,
          );
        }
      }
    }
  }

  assert.deepEqual(audited.sort(), [
    'MX:MX_PR_RETIREE:MX_PR_RETIREE_FIN',
    'MX:MX_TEMP_SOLVENCY:MX_TEMP_SOLVENCY_FIN',
  ]);
});
