import test from 'node:test';
import assert from 'node:assert/strict';
import { countAdditionalSuitableCountriesAtIncome } from '../matcher/income-opportunity.js';

test('income opportunity counts each additional suitable country once across any income type', () => {
  const seenTypes = new Set();
  const count = countAdditionalSuitableCountriesAtIncome({
    profile: { residence: { current_country: 'PH' }, income: { primary: {} } },
    packages: [],
    context: {},
    existingSuitableCountryIds: new Set(['PY']),
    calculate(profile) {
      seenTypes.add(profile.income.primary.type);
      assert.equal(profile.income.primary.monthly_provable.amount, 1000);
      return {
        results: [
          { country: { countryId: 'PY' }, bestRoute: { routeStatus: 'SUITABLE' } },
          { country: { countryId: profile.income.primary.type === 'PENSION' ? 'EC' : 'CL' }, bestRoute: { routeStatus: 'SUITABLE' } },
        ],
      };
    },
  });
  assert.equal(count, 2);
  assert.ok(seenTypes.has('PENSION'));
  assert.ok(seenTypes.has('REMOTE_EMPLOYMENT'));
});
