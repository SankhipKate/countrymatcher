import { routePresentationGroup } from '../js/engine/route-presentation-contract.js';

const INCOME_TYPES = [
  'REMOTE_EMPLOYMENT',
  'CONTRACTOR',
  'FREELANCE_OR_SELF_EMPLOYED',
  'SOLE_PROPRIETOR',
  'COMPANY_OWNER',
  'LOCAL_EMPLOYMENT',
  'PENSION',
  'PASSIVE_INCOME',
  'INVESTMENT_INCOME',
  'OTHER_REGULAR_INCOME',
];

function incomeProfile(profile, type, sourceGeography, amount) {
  const candidate = structuredClone(profile);
  candidate.income.primary = {
    owner: 'APPLICANT',
    type,
    source_geography: sourceGeography,
    country_id: sourceGeography === 'SINGLE_COUNTRY' ? profile.residence.current_country : null,
    bank_country: null,
    monthly_total: { amount, currency: 'USD' },
    monthly_provable: { amount, currency: 'USD' },
    evidence_level: 'FULL',
    history_months: null,
    stability: null,
    continues_after_move: true,
    contract_remaining_months: null,
    business_age_months: null,
  };
  return candidate;
}

export function countAdditionalSuitableCountriesAtIncome({
  profile,
  packages,
  context,
  calculate,
  existingSuitableCountryIds = new Set(),
  incomeUsd = 1000,
}) {
  if (!profile || typeof calculate !== 'function') return 0;
  const suitableCountryIds = new Set();
  for (const type of INCOME_TYPES) {
    for (const sourceGeography of ['SINGLE_COUNTRY', 'NO_STABLE_PAYER']) {
      const calculation = calculate(incomeProfile(profile, type, sourceGeography, incomeUsd), packages, context);
      for (const country of calculation.results || []) {
        if (routePresentationGroup(country.bestRoute) === 'SUITABLE') suitableCountryIds.add(country.country.countryId);
      }
    }
  }
  for (const countryId of existingSuitableCountryIds) suitableCountryIds.delete(countryId);
  return suitableCountryIds.size;
}
