import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { applicationPresentationText, buildUserProfile, cityCategories, countryFlag, deduplicatedWorkRights, describeIncomeRequirement, describeResultIntro, enrichCityCategories, formatTemperatureRange, resolveProvableAmount, russianMonths, sortCountriesForDisplay, sortRoutesForDisplay, uniqueRouteActions, validateAgainstSchema, validateUserProfile } from '../matcher/profile.js';
import { formatCurrency } from '../matcher/format.js';
import { APPLICATION_METHOD_LABELS_RU } from '../js/engine/rp4-engine.js';
import { STATUS_LABELS_RU } from '../js/engine/status-contract.js';
import { countryOptions, parseCountryCode, searchCountries } from '../matcher/countries.js';
import { DOG_BREEDS, isKnownDogBreed, searchDogBreeds } from '../matcher/dog-breeds.js';

const profileSchema = JSON.parse(await readFile(new URL('../data/schemas/user-profile-v1.schema.json', import.meta.url), 'utf8'));
const universalProfiles = JSON.parse(await readFile(new URL('./fixtures/universal-profile-samples-v1.json', import.meta.url), 'utf8'));
const spainResearch = JSON.parse(await readFile(new URL('../data/ES-research-v4.0.json', import.meta.url), 'utf8'));

test('visible matcher version matches package version', async () => {
  const [matcherHtml, packageJson, fxContext] = await Promise.all([
    readFile(new URL('../index.html', import.meta.url), 'utf8'),
    readFile(new URL('../package.json', import.meta.url), 'utf8').then(JSON.parse),
    readFile(new URL('../pilot/fx-context.js', import.meta.url), 'utf8'),
  ]);
  assert.match(matcherHtml, new RegExp(`версия ${packageJson.version.replaceAll('.', '\\.')}`));
  assert.equal(packageJson.version, '7.1.1');
  assert.match(matcherHtml, /aria-label="COUNTRY MATCHER"/);
  assert.match(matcherHtml, /class="brand-mark"/);
  assert.equal(matcherHtml.includes('product-version'), false);
  assert.match(matcherHtml, /<title>COUNTRY MATCHER<\/title>/);
  assert.match(fxContext, /engine_version: '7\.1\.1'/);
});

test('country flags are derived generically from ISO alpha-2 codes', () => {
  assert.equal(countryFlag('ES'), '🇪🇸');
  assert.equal(countryFlag('AR'), '🇦🇷');
  assert.equal(countryFlag('BR'), '🇧🇷');
  assert.equal(countryFlag('INVALID'), '🌍');
});

test('active questionnaire enums match the Final Lock profile schema', async () => {
  const [matcher, app] = await Promise.all([
    readFile(new URL('../index.html', import.meta.url), 'utf8'),
    readFile(new URL('../matcher/app.js', import.meta.url), 'utf8'),
  ]);
  const values = (source, id) => {
    const start = source.indexOf(`<select id="${id}">`);
    const select = start < 0 ? '' : source.slice(start, source.indexOf('</select>', start) + 9);
    return select.matchAll(/<option value="([A-Z_]+)"/g);
  };
  const optionValues = (source, id) => [...(values(source, id) || [])].map((match) => match[1]);
  const defs = profileSchema.$defs.incomeSource.properties;
  assert.deepEqual(optionValues(matcher, 'primaryType'), defs.type.enum);
  assert.deepEqual(optionValues(matcher, 'primarySourceScope'), defs.source_geography.enum);
  assert.deepEqual(optionValues(matcher, 'relationshipType'), profileSchema.properties.family.properties.relationship_type.enum.filter(Boolean));
  assert.deepEqual(optionValues(matcher, 'longTermGoal'), profileSchema.properties.goal.properties.long_term.enum);
  assert.deepEqual([...matcher.matchAll(/name="keepRuCitizenship" value="([A-Z_]+)"/g)].map((match) => match[1]), profileSchema.properties.goal.properties.keep_russian_citizenship.enum);
  assert.deepEqual(optionValues(app, '${prefix}Type'), defs.type.enum);
  assert.deepEqual(optionValues(app, '${prefix}SourceScope'), defs.source_geography.enum);
  const active = `${matcher}\n${app}\n${await readFile(new URL('../matcher/profile.js', import.meta.url), 'utf8')}\n${JSON.stringify(profileSchema)}`;
  for (const legacy of ['ONE_COUNTRY', 'NO_PERMANENT_PAYER', 'MARRIAGE', 'UNREGISTERED_PARTNER', 'NOT_IMPORTANT', 'CITIZENSHIP_DESIRED', 'UNDECIDED', 'OTHER_REGULAR_REMOTE_INCOME']) {
    assert.equal(active.includes(`"${legacy}"`) || active.includes(`'${legacy}'`), false, legacy);
  }
});

test('active draft contract is v3 and does not restore v2', async () => {
  const app = await readFile(new URL('../matcher/app.js', import.meta.url), 'utf8');
  assert.match(app, /immigration-matcher-universal-draft-v3/);
  assert.match(app, /version:\s*3/);
  assert.match(app, /stored\?\.version !== 3/);
  assert.doesNotMatch(app, /immigration-matcher-universal-draft-v2/);
});

const answers = (overrides = {}) => ({
  currentCountry: 'PH', currentStatus: 'TOURIST_OR_VISA_FREE', applicationMethods: ['ANY'],
  hasPartner: false, partnerIncluded: false, relationshipType: '', lgbtEnabled: false, childAges: [], schoolNeeded: false,
  primaryType: 'REMOTE_EMPLOYMENT', primarySourceCountry: 'US', primaryBankCountry: 'GE', primaryTotalAmount: '4000', primaryAmount: '4000', primaryCurrency: 'USD', primaryEvidence: 'FULL',
  hasAdditionalIncome: false, partnerHasIncome: false,
  longTermGoal: 'TEMPORARY_RESIDENCE_SUFFICIENT', keepRuCitizenship: 'REQUIRED',
  budgetUnknown: false, monthlyBudget: '2500', budgetCurrency: 'USD', citySize: 'ANY', climate: 'ANY', petTypes: ['NONE'],
  specialCircumstances: ['NONE'], medicalEnabled: false, routeSpecificAnswers: {},
  ...overrides,
});

test('new matcher creates a valid user-profile-v1 for one Russian citizen', () => {
  const profile = buildUserProfile(answers());
  assert.deepEqual(profile.citizenships, ['RU']);
  assert.equal(profile.schema_version, 'user-profile-v1');
  assert.equal(validateUserProfile(profile).valid, true);
  assert.deepEqual(validateAgainstSchema(profile, profileSchema), []);
});

test('partner and child remain separate family members', () => {
  const profile = buildUserProfile(answers({ hasPartner: true, partnerIncluded: true, relationshipType: 'MARRIED', childAges: ['7'], schoolNeeded: true }));
  assert.equal(profile.family.adults_count, 2);
  assert.deepEqual(profile.family.children, [{ age_years: 7 }]);
  assert.equal(profile.family.school_needed, true);
});

test('registered and unregistered partnerships are preserved', () => {
  for (const relationshipType of ['REGISTERED_PARTNERSHIP', 'UNREGISTERED_PARTNERSHIP']) {
    assert.equal(buildUserProfile(answers({ hasPartner: true, partnerIncluded: true, relationshipType })).family.relationship_type, relationshipType);
  }
});

test('LGBT safety personalization remains available without an included partner', () => {
  assert.equal(buildUserProfile(answers({ hasPartner: true, partnerIncluded: true, relationshipType: 'MARRIED', lgbtEnabled: true })).lgbt.consent_for_personalization, true);
  const solo = buildUserProfile(answers({ partnerIncluded: false, lgbtEnabled: true }));
  assert.equal(solo.lgbt.enabled, true);
  assert.equal(solo.lgbt.safety_relevant, true);
  assert.equal(solo.lgbt.family_recognition_relevant, null);
});

test('tourist status is not converted to residence', () => {
  assert.equal(buildUserProfile(answers()).residence.current_status, 'TOURIST_OR_VISA_FREE');
});

test('searchable country values are converted to ISO codes', () => {
  assert.equal(parseCountryCode('PH — Филиппины'), 'PH');
  assert.equal(parseCountryCode('Филиппины'), 'PH');
  assert.equal(parseCountryCode('RU'), 'RU');
  assert.equal(parseCountryCode('Филиппины / Philippines — PH'), 'PH');
  assert.match(countryOptions().find((country) => country.code === 'PH').label, /^Филиппины \/ Philippines — PH$/);
});

test('Russian prefix search ranks Philippines before Ethiopia', () => {
  assert.equal(searchCountries('фи')[0].code, 'PH');
  assert.equal(searchCountries('ph')[0].code, 'PH');
});


test('dog breed field uses a large searchable breed directory', () => {
  assert.ok(DOG_BREEDS.length >= 200);
  assert.equal(searchDogBreeds('в')[0], 'Веймаранер');
  assert.ok(searchDogBreeds('корги').includes('Вельш-корги пемброк'));
  assert.equal(isKnownDogBreed('Метис'), true);
  assert.equal(isKnownDogBreed('Не знаю'), true);
  assert.equal(isKnownDogBreed('Другая известная порода'), false);
});

test('public status labels expose exactly the three agreed statuses', () => {
  assert.deepEqual(Object.keys(STATUS_LABELS_RU).sort(), ['SUITABLE', 'SUITABLE_WITH_CONDITIONS', 'UNSUITABLE'].sort());
  assert.equal(STATUS_LABELS_RU.SUITABLE, 'Подходит');
  assert.equal(STATUS_LABELS_RU.SUITABLE_WITH_CONDITIONS, 'Подходит с условиями');
  assert.equal(STATUS_LABELS_RU.UNSUITABLE, 'Не подходит');
});

test('freelance income does not invent a source country', () => {
  const profile = buildUserProfile(answers({ primaryType: 'FREELANCE_OR_SELF_EMPLOYED', primarySourceCountry: '' }));
  assert.equal(profile.income.primary.country_id, null);
  assert.equal(validateUserProfile(profile).valid, true);
  assert.deepEqual(validateAgainstSchema(profile, profileSchema), []);
});

test('user can select current-country and in-country application methods together', () => {
  const profile = buildUserProfile(answers({ applicationMethods: ['CURRENT_COUNTRY', 'IN_COUNTRY_AFTER_ENTRY'] }));
  assert.deepEqual(profile.application_preferences.methods, ['CURRENT_COUNTRY', 'IN_COUNTRY_AFTER_ENTRY']);
  assert.equal(validateAgainstSchema(profile, profileSchema).length, 0);
});


test('public matcher evaluates all researched filing methods without asking willingness to return', async () => {
  const app = await readFile(new URL('../matcher/app.js', import.meta.url), 'utf8');
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(app, /const applicationMethods = \['ANY'\]/);
  assert.equal(html.includes('Готовы вернуться в Россию'), false);
});

test('income and budget retain their own currencies', () => {
  const profile = buildUserProfile(answers({ primaryTotalAmount: '300000', primaryAmount: '300000', primaryCurrency: 'RUB', monthlyBudget: '2200', budgetCurrency: 'EUR' }));
  assert.deepEqual(profile.income.primary.monthly_provable, { amount: 300000, currency: 'RUB' });
  assert.deepEqual(profile.preferences.monthly_budget, { amount: 2200, currency: 'EUR' });
});

test('profile builder derives provable income from evidence level', () => {
  const profile = buildUserProfile(answers({ primaryTotalAmount: '1000', primaryAmount: '777', primaryEvidence: 'NONE' }));
  assert.deepEqual(profile.income.primary.monthly_provable, { amount: 0, currency: 'USD' });
});

test('profile supports no current regular income without inventing a positive amount', () => {
  const profile = buildUserProfile(answers({ primaryType: 'NO_REGULAR_INCOME', primarySourceCountry: '', primaryBankCountry: '', primaryTotalAmount: '', primaryAmount: '', primaryEvidence: '' }));
  assert.equal(profile.income.primary.type, 'NO_REGULAR_INCOME');
  assert.deepEqual(profile.income.primary.monthly_provable, { amount: 0, currency: 'USD' });
  assert.equal(validateUserProfile(profile).valid, true);
});

test('adult ages are optional and retained when provided', () => {
  const withoutAges = buildUserProfile(answers({ applicantAge: '', partnerAge: '' }));
  assert.deepEqual(withoutAges.family.adult_ages, [null]);
  const withPartner = buildUserProfile(answers({ partnerIncluded: true, relationshipType: 'MARRIED', applicantAge: '39', partnerAge: '41' }));
  assert.deepEqual(withPartner.family.adult_ages, [39, 41]);
  assert.equal(validateUserProfile(withPartner).valid, true);
});

test('income geography supports one country, several countries, or no permanent payer without a bank-country answer', () => {
  const one = buildUserProfile(answers({ primarySourceScope: 'SINGLE_COUNTRY', primarySourceCountry: 'US', primaryBankCountry: '' }));
  assert.equal(one.income.primary.country_id, 'US');
  assert.equal('source_country' in one.income.primary, false);
  assert.equal(one.income.primary.bank_country, null);
  const several = buildUserProfile(answers({ primarySourceScope: 'MULTIPLE_COUNTRIES', primarySourceCountry: '', primaryBankCountry: '' }));
  assert.equal(several.income.primary.country_id, null);
  assert.equal(several.income.primary.source_geography, 'MULTIPLE_COUNTRIES');
  assert.equal(validateUserProfile(several).valid, true);
});

test('canonical profile clears stale country and normalizes no regular income geography', () => {
  assert.equal(buildUserProfile(answers({ primarySourceScope: 'MULTIPLE_COUNTRIES', primarySourceCountry: 'US' })).income.primary.country_id, null);
  assert.equal(buildUserProfile(answers({ primarySourceScope: 'NO_STABLE_PAYER', primarySourceCountry: 'US' })).income.primary.country_id, null);
  const none = buildUserProfile(answers({ primaryType: 'NO_REGULAR_INCOME', primarySourceScope: 'SINGLE_COUNTRY', primarySourceCountry: 'US' })).income.primary;
  assert.equal(none.source_geography, 'NO_STABLE_PAYER');
  assert.equal(none.country_id, null);
  assert.equal(none.monthly_provable.amount, 0);
});

test('profile schema requires country_id only for SINGLE_COUNTRY geography', () => {
  const single = buildUserProfile(answers({ primarySourceScope: 'SINGLE_COUNTRY', primarySourceCountry: 'US' }));
  single.income.primary.country_id = null;
  assert.ok(validateAgainstSchema(single, profileSchema).some(({ path }) => path === '$.income.primary.country_id'));
  for (const source_geography of ['MULTIPLE_COUNTRIES', 'NO_STABLE_PAYER']) {
    const value = buildUserProfile(answers({ primarySourceScope: source_geography, primarySourceCountry: 'US' }));
    assert.equal(value.income.primary.country_id, null);
    assert.deepEqual(validateAgainstSchema(value, profileSchema), []);
  }
});

test('universal profile samples satisfy the active canonical schema', () => {
  for (const sample of universalProfiles) assert.deepEqual(validateAgainstSchema(sample, profileSchema), [], sample.profile_id);
});

test('profile validation reports a missing total instead of crashing', () => {
  const profile = buildUserProfile(answers());
  profile.income.primary.monthly_total = null;
  assert.doesNotThrow(() => validateUserProfile(profile));
  assert.equal(validateUserProfile(profile).valid, false);
  assert.ok(validateUserProfile(profile).errors.some(({ field }) => field === 'primaryTotalAmount'));
});

test('removed city and climate questions use neutral profile defaults', () => {
  const profile = buildUserProfile(answers({ climates: ['TEMPERATE', 'WARM'], climate: undefined }));
  assert.equal(profile.preferences.city_size, 'ANY');
  assert.deepEqual(profile.preferences.climate, ['ANY']);
  assert.deepEqual(validateAgainstSchema(profile, profileSchema), []);
});

test('unknown budget is null and does not become zero', () => {
  assert.equal(buildUserProfile(answers({ budgetUnknown: true, monthlyBudget: '' })).preferences.monthly_budget, null);
});

test('profile does not invent language-readiness or physical-presence answers', () => {
  const profile = buildUserProfile(answers({ longTermGoal: 'CITIZENSHIP_REQUIRED' }));
  const { goal } = profile;
  assert.equal('language_exam_readiness' in goal, false);
  assert.equal('physical_presence' in goal, false);
  assert.deepEqual(validateAgainstSchema(profile, profileSchema), []);
  assert.ok(validateAgainstSchema({
    ...profile,
    goal: { ...goal, language_exam_readiness: 'NO' },
  }, profileSchema).some((error) => error.path === '$.goal.language_exam_readiness'));
  assert.ok(validateAgainstSchema({
    ...profile,
    goal: { ...goal, physical_presence: 'LESS_THAN_6_MONTHS' },
  }, profileSchema).some((error) => error.path === '$.goal.physical_presence'));
});

test('optional medical module can be absent', () => {
  assert.equal('optional_modules' in buildUserProfile(answers()), false);
  assert.equal(validateUserProfile(buildUserProfile(answers())).valid, true);
});

test('route-specific follow-up answer is preserved outside the main questions', () => {
  const routeSpecificAnswers = { ES_DNV: { social_security_plan: 'REGISTER_IN_SPAIN' } };
  assert.deepEqual(buildUserProfile(answers({ routeSpecificAnswers })).route_specific_answers, routeSpecificAnswers);
});

test('income-type mismatch explicitly says that the amount is not the problem', () => {
  const message = describeIncomeRequirement({ incomeTypeFit: 'DOES_NOT_MEET', thresholdEur: null }, () => '');
  assert.ok(message.includes('Сумма дохода не является причиной'));
  assert.equal(message.includes('порог'), false);
});

test('local-currency threshold is displayed beside its dynamic USD equivalent', () => {
  const text = describeIncomeRequirement({
    incomeGuidance: 'Стандартный инвестиционный порог.',
    incomeRequirementConversion: {
      originalAmount: 500000,
      originalCurrency: 'BRL',
      targetCurrency: 'USD',
      convertedAmount: 90909.09,
      rateAsOf: '2026-08-01T00:00:00Z',
      rateSource: 'test-provider',
    },
  }, formatCurrency);
  assert.match(text, /500[\s\u00a0]000.*\(BRL\)/i);
  assert.doesNotMatch(text, /2026-08-01|test-provider/);
  assert.match(text, /90[\s\u00a0]909.*\(USD\)/i);
});

test('all unsuitable routes are not presented as the best option', () => {
  const intro = describeResultIntro([{ routeStatus: 'UNSUITABLE' }, { routeStatus: 'UNSUITABLE' }]);
  assert.equal(intro.heading, 'Сейчас подходящих вариантов не найдено');
  assert.equal(intro.routeLabel, 'Первый из проверенных неподходящих маршрутов');
});

test('empty route result uses neutral wording', () => {
  const intro = describeResultIntro([]);
  assert.equal(intro.heading, 'Сейчас нет маршрутов, доступных для надёжной оценки');
  assert.equal(intro.routeLabel, 'Сейчас нет маршрутов с завершёнными данными, которые можно надёжно оценить по вашим ответам.');
  assert.doesNotMatch(`${intro.heading} ${intro.routeLabel}`, /Подходит|Не подходит|Наиболее подходящий/);
});

test('result routes are ordered through the three-status contract', () => {
  const routes = [
    { routeId: 'no', routeStatus: 'UNSUITABLE' },
    { routeId: 'yes', routeStatus: 'SUITABLE' },
    { routeId: 'conditions', routeStatus: 'SUITABLE_WITH_CONDITIONS' },
  ];
  assert.deepEqual(sortRoutesForDisplay(routes).map(({ routeId }) => routeId), ['yes', 'conditions', 'no']);
  assert.equal(routes[0].routeId, 'no');
});

test('routes of the same status prefer simultaneous family fit and fewer conditions', () => {
  const routes = [
    { routeId: 'separate', routeStatus: 'SUITABLE_WITH_CONDITIONS', familyFit: 'UNKNOWN', goalFit: 'MEETS', conditions: ['A'] },
    { routeId: 'family-many', routeStatus: 'SUITABLE_WITH_CONDITIONS', familyFit: 'MEETS', goalFit: 'MEETS', conditions: ['A', 'B'] },
    { routeId: 'family-few', routeStatus: 'SUITABLE_WITH_CONDITIONS', familyFit: 'MEETS', goalFit: 'MEETS', conditions: ['A'] },
  ];
  assert.deepEqual(sortRoutesForDisplay(routes).map(({ routeId }) => routeId), ['family-few', 'family-many', 'separate']);
});

test('countries are stably ordered by the status of their best route', () => {
  const countries = [
    { country: { countryId: 'ES', group: 'SUITABLE' }, bestRoute: { routeStatus: 'UNSUITABLE' } },
    { country: { countryId: 'UY', group: 'UNSUITABLE' }, bestRoute: { routeStatus: 'SUITABLE' } },
    { country: { countryId: 'AR', group: 'SUITABLE_WITH_CONDITIONS' }, bestRoute: { routeStatus: 'SUITABLE_WITH_CONDITIONS' } },
    { country: { countryId: 'PY', group: 'SUITABLE' }, bestRoute: { routeStatus: 'SUITABLE' } },
    { country: { countryId: 'PT', group: 'SUITABLE_WITH_CONDITIONS' }, bestRoute: { routeStatus: 'SUITABLE_WITH_CONDITIONS' } },
  ];
  assert.deepEqual(
    sortCountriesForDisplay(countries).map(({ country }) => country.countryId),
    ['UY', 'PY', 'AR', 'PT', 'ES'],
  );
  assert.deepEqual(countries.map(({ country }) => country.countryId), ['ES', 'UY', 'AR', 'PY', 'PT']);
});

test('countries with equal legal, family, and goal fit keep stable input order', () => {
  const country = (countryId, costs) => ({
    country: { countryId, group: 'SUITABLE' },
    bestRoute: { routeStatus: 'SUITABLE', familyFit: 'MEETS', goalFit: 'MEETS' },
    cities: costs.map((costUsd) => ({ costUsd })),
  });
  assert.deepEqual(sortCountriesForDisplay([country('FIRST', [3000, 4000, 5000]), country('SECOND', [1000, 1500, 2000])]).map(({ country }) => country.countryId), ['FIRST', 'SECOND']);
});

test('route actions are deduplicated and omit actions already present in mandatory requirements', () => {
  const route = {
    actions: ['Получить договор с работодателем.', 'Собрать справку о несудимости.'],
    conditions: ['Получить договор с работодателем', 'Подготовить договор с работодателем.'],
    clientMissing: ['Собрать справку о несудимости.', 'Подтвердить доход выписками.'],
    initialPermitRequirements: ['Договор или обещание трудового договора с работодателем.', 'Собрать справку о несудимости.'],
  };
  assert.deepEqual(uniqueRouteActions(route), [
    'Подтвердить доход выписками.',
  ]);
});

test('currency formatter preserves positive sub-100 amounts and removes large-value decimals', () => {
  const small = formatCurrency(0.87, 'EUR');
  assert.match(small, /0,87/);
  assert.equal(small.includes('0 €'), false);
  assert.match(formatCurrency(0.001, 'EUR'), /0,01/);
  assert.equal(formatCurrency(3680.42, 'EUR').includes(',42'), false);
});

test('city size is the first approved category and uses the complete city label', () => {
  assert.deepEqual(cityCategories('SMALL', ['Самый недорогой', 'Самый прохладный']), [
    'Небольшой город',
    'Самый недорогой',
    'Самый прохладный',
  ]);
  assert.deepEqual(cityCategories('MEDIUM', ['Самый жаркий']), [
    'Средний город',
    'Самый жаркий',
  ]);
  assert.deepEqual(cityCategories('LARGE', ['Столица', 'Самый дорогой']), [
    'Большой город',
    'Столица',
    'Самый дорогой',
  ]);
  assert.deepEqual(cityCategories('ANY', ['Неутверждённая категория']), []);
  assert.deepEqual(cityCategories('LARGE', ['CAPITAL', 'LARGE']), ['Большой город', 'Столица']);
  assert.deepEqual(cityCategories(null, ['CAPITAL', 'LARGE', 'MEDIUM', 'SMALL']), [
    'Столица', 'Большой город', 'Средний город', 'Небольшой город',
  ]);
  assert.throws(() => cityCategories(null, ['UNKNOWN_ROLE']), /Unsupported RP4 city structural role/);
});

test('city comparison derives expensive, cool and hot categories from displayed data', () => {
  const cities = enrichCityCategories([
    { name: 'A', size: 'LARGE', cost: 2000, coldRange: 'примерно 8–16 °C', hotRange: 'примерно 20–30 °C' },
    { name: 'B', size: 'MEDIUM', cost: 1500, coldRange: 'примерно 12–20 °C', hotRange: 'примерно 24–36 °C' },
    { name: 'C', size: 'SMALL', cost: 1000, coldRange: 'примерно −1–5 °C', hotRange: 'примерно 5–15 °C' },
  ]);
  assert.ok(cities.find(({ name }) => name === 'A').categories.includes('Самый дорогой'));
  assert.ok(cities.find(({ name }) => name === 'C').categories.includes('Самый недорогой'));
  assert.ok(cities.find(({ name }) => name === 'B').categories.includes('Самый жаркий'));
  assert.ok(cities.find(({ name }) => name === 'C').categories.includes('Самый прохладный'));
});

test('non-comparable city baskets are never ranked by finite partial totals', () => {
  const cities = enrichCityCategories([
    { name: 'Partial A', size: 'LARGE', cost: 2000, costComparable: false },
    { name: 'Partial B', size: 'SMALL', cost: 500, costComparable: false },
  ]);
  assert.equal(cities.some(({ categories }) => categories.includes('Самый дорогой') || categories.includes('Самый недорогой')), false);
});

test('month duration and work-right presentation are generic and deduplicated by subject plus text', () => {
  assert.deepEqual([1, 2, 5, 11, 21, 22, 25].map(russianMonths), [
    '1 месяц', '2 месяца', '5 месяцев', '11 месяцев', '21 месяц', '22 месяца', '25 месяцев',
  ]);
  const sameRule = { rule: 'Работа разрешена.' };
  assert.deepEqual(deduplicatedWorkRights({
    applicant: [sameRule, sameRule, sameRule], partner: [sameRule, sameRule, sameRule],
  }), ['Заявитель: Работа разрешена.', 'Партнёр: Работа разрешена.']);
});

test('researched city roles are authoritative and are not duplicated by numeric derivation', () => {
  const cities = enrichCityCategories([
    { name: 'A', size: 'SMALL', roles: ['Самый прохладный'], cost: 1000, coldRange: '0–9', hotRange: '14–30' },
    { name: 'B', size: 'MEDIUM', roles: ['Самый жаркий'], cost: 1200, coldRange: '8–16', hotRange: '20–29' },
  ]);
  assert.equal(cities.find(({ name }) => name === 'A').categories.includes('Самый жаркий'), false);
  assert.equal(cities.find(({ name }) => name === 'B').categories.includes('Самый жаркий'), true);
});

test('climate formatter removes internal methodology from the short range', () => {
  assert.equal(formatTemperatureRange('примерно 7–25 °C для средних минимумов и максимумов июля'), 'примерно 7–25 °C');
  assert.equal(formatTemperatureRange('8,6–15,1'), 'примерно 8,6–15,1 °C');
});

test('missing child age is reported as a profile validation error', () => {
  const result = validateUserProfile(buildUserProfile(answers({ childAges: [''] })));
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.field === 'childAges'));
});

test('machine-readable schema rejects a profile with missing child age', () => {
  const errors = validateAgainstSchema(buildUserProfile(answers({ childAges: [''] })), profileSchema);
  assert.ok(errors.some((error) => error.path.endsWith('.age_years')));
});

test('main matcher has no Spain-specific social-security question', async () => {
  const [source, app] = await Promise.all([
    readFile(new URL('../index.html', import.meta.url), 'utf8'),
    readFile(new URL('../matcher/app.js', import.meta.url), 'utf8'),
  ]);
  assert.equal(source.includes('социального страхования Испании'), false);
  assert.ok(source.includes('У вас есть гражданство РФ?'));
  assert.match(source, /id="questionnaireView"[^>]*hidden/);
  assert.equal(source.includes('id="citySize"'), false);
  assert.equal(source.includes('name="climate"'), false);
  assert.doesNotMatch(`${source}\n${app}`, /kindergarten|daycare|preschool|детский сад|детсад/i);
  assert.match(source, /name="schoolType"/);
});

test('root is the public matcher and does not link to a pilot page', async () => {
  const root = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  assert.ok(root.includes('id="matcherForm"'));
  assert.doesNotMatch(root, /location\.replace/);
  assert.equal(root.includes('href="../"'), false);
  assert.equal(root.includes('href="./pilot/"'), false);
});

test('result UI shows city comparisons and a human-readable row-based LGBT section', async () => {
  const [app, profileSource, styles] = await Promise.all([
    readFile(new URL('../matcher/app.js', import.meta.url), 'utf8'),
    readFile(new URL('../matcher/profile.js', import.meta.url), 'utf8'),
    readFile(new URL('../matcher/styles.css', import.meta.url), 'utf8'),
  ]);
  assert.match(profileSource, /Самый жаркий/);
  assert.match(profileSource, /Самый прохладный/);
  assert.match(profileSource, /Самый дорогой/);
  assert.match(profileSource, /Самый недорогой/);
  assert.match(app, /ЛГБТ: права, семья и практическая среда/);
  assert.match(app, /calculation\.lgbt\.rows/);
  assert.match(app, /Правовое положение/);
  assert.match(app, /Практическая среда/);
  assert.equal(app.includes('Недостаточно надёжных данных'), false);
  assert.equal(app.includes('Достаточно безопасно'), false);
  assert.match(app, /Что меняется/);
  assert.equal(app.includes('Дети и родительство'), false);
  assert.equal(app.includes('Права транс-людей'), false);
  assert.equal(app.includes('Отдельной «ЛГБТ-визы» нет'), false);
  assert.equal(app.includes('Что не равно'), false);
  assert.equal(styles.includes('.lgbt-grid'), false);
  assert.match(styles, /\.lgbt-row\{display:grid/);
  assert.equal(app.includes('средние дневные минимумы и максимумы'), false);
  assert.equal(app.includes('Одна анкета независимо проверена'), false);
  assert.equal(app.includes('Все варианты ниже относятся только к стране'), false);
  assert.equal(app.includes('Школа: без платной международной школы'), false);
  assert.equal(app.includes('Разрешение цифрового кочевника само по себе не гарантирует гражданство'), false);
  assert.equal(app.includes('Требуется функциональный испанский'), false);
  assert.equal(app.includes('items.push(rule.notes)'), false);
  assert.match(app, /route\.longTerm\.citizenship/);
  assert.match(app, /route\.longTerm\.language/);
  assert.match(app, /renderSchoolPresentation\(calculation\)/);
  assert.match(app, /Международные школы: найдены в/);
  assert.match(app, /school\.rules\.map/);
  assert.doesNotMatch(app, /internationalSchoolCost|internationalSchoolNames|schoolLine|needsInternationalSchool/);
  assert.match(app, /ANNUAL: '\/год'/);
  assert.match(app, /ACADEMIC_YEAR: '\/учебный год'/);
  assert.match(app, /schoolTuitionPeriodLabel\(rule\.tuition\.period\)/);
  assert.match(app, /Международные школы: наличие подтверждено\./);
  assert.ok(app.indexOf("school.status === 'AVAILABLE'") < app.indexOf("school.status === 'RESEARCHED_NONE_FOUND'"));

  assert.equal(app.includes('Для выбранного размера города в пакете пока нет отдельной модели'), false);
  assert.match(styles, /\.country-workspace\{display:grid/);
  assert.match(styles, /\.country-tabs\{position:sticky/);
  assert.match(styles, /@media\(max-width:900px\)[\s\S]*overflow-x:auto/);
  assert.equal(app.includes('Ваш бюджет не указан'), false);
  assert.match(app, /budgetDerivedFromIncome/);
  assert.match(app, /data-country-tab/);
  assert.doesNotMatch(app, /enrichCityCategories/);
  assert.match(app, /cityCategories\(city\.populationCategory/);
  assert.equal(app.includes('Самый дорогой по индексу Expatistan'), false);
  assert.equal(app.includes('Сравнение стран'), false);
  assert.equal(app.includes('Страна расчёта'), false);
  assert.match(styles, /\.country-tab \.status-pill\{grid-column:2/);
});

test('school UI preserves tuition periods and handles AVAILABLE without city names', async () => {
  const app = await readFile(new URL('../matcher/app.js', import.meta.url), 'utf8');
  const schoolSource = app.slice(app.indexOf('const publicSchoolAccessLabel'), app.indexOf('function longTermConditions'));
  const renderSchool = Function('currency', 'html', `${schoolSource}; return renderSchoolPresentation;`)(
    (amount, currencyCode) => `${amount} ${currencyCode}`,
    (value) => String(value),
  );
  const publicRule = (period) => ({
    jurisdiction: 'Тестовая юрисдикция', foreignChildAccess: 'AVAILABLE', language: 'Тестовый язык',
    compulsoryAgeMin: 6, compulsoryAgeMax: 16, isFree: false,
    tuition: { amount: 1200, currency: 'EUR', period },
  });
  assert.match(renderSchool({ schoolPresentation: { type: 'PUBLIC', rules: [publicRule('ANNUAL')] } }), /1200 EUR \/год/);
  assert.match(renderSchool({ schoolPresentation: { type: 'PUBLIC', rules: [publicRule('ACADEMIC_YEAR')] } }), /1200 EUR \/учебный год/);

  const available = renderSchool({ schoolPresentation: { type: 'INTERNATIONAL', status: 'AVAILABLE', cities: [] } });
  assert.match(available, /Международные школы: наличие подтверждено\./);
  assert.doesNotMatch(available, /не исследованы/);
});

test('country navigation omits route names and unsuitable cards are collapsed blocker-only details', async () => {
  const app = await readFile(new URL('../matcher/app.js', import.meta.url), 'utf8');
  const tabSource = app.slice(app.indexOf('function renderCountryTab'), app.indexOf('function renderCountryResult'));
  assert.match(tabSource, /html\(countryName\)/);
  assert.match(tabSource, /STATUS_LABELS_RU\[best\.routeStatus\]/);
  assert.equal(tabSource.includes('best.routeName'), false);
  const cardSource = app.slice(app.indexOf('function routeCard'), app.indexOf('function countryPresentation'));
  assert.match(cardSource, /if \(unsuitable\) return `<article class="route-result compact"><details><summary>/);
  assert.match(cardSource, /<div class="route-card-body">\$\{blockersBlock\}<\/div><\/details>/);
  assert.match(cardSource, /Почему не подходит/);
  assert.match(cardSource, /unsuitable \? `<span class="route-expand-label">Показать подробности<\/span>` : main \?/);
  assert.equal(/if \(unsuitable\)[^\n]*\$\{body\}/.test(cardSource), false);
});

test('result UI renders localized methods, entry guidance, duration, and deduplicated work rights', async () => {
  const app = await readFile(new URL('../matcher/app.js', import.meta.url), 'utf8');
  assert.match(app, /route\.application\?\.map\(applicationPresentationText\)/);
  assert.match(app, /Срок первого разрешения:/);
  assert.match(app, /russianMonths\(route\.firstPermit\.months\)/);
  assert.match(app, /deduplicatedWorkRights\(route\.workRights\)/);
  assert.doesNotMatch(app, /return `\$\{item\.kind\}:/);
  assert.match(app, /return `\$\{item\.kindLabel\}:/);
});

test('official financial periods render consistently in route cards and the best-route KPI', async () => {
  const app = await readFile(new URL('../matcher/app.js', import.meta.url), 'utf8');
  assert.match(app, /const officialFinancialPeriodSuffix = \(period\) => \(\{ MONTHLY: '\/мес', ANNUAL: '\/год' \}\)\[period\] \|\| ''/);
  assert.match(app, /currency\(item\.threshold, item\.currency\).*officialFinancialPeriodSuffix\(item\.period\)/);
  assert.match(app, /currency\(primaryFinancial\.threshold, primaryFinancial\.currency\).*officialFinancialPeriodSuffix\(primaryFinancial\.period\)/);
  assert.equal((app.match(/officialFinancialPeriodSuffix\(/g) || []).length, 2);
});

test('application presentation suppresses only normalized not-applicable sentinels', () => {
  const item = { methodLabel: 'Способ', guidance: 'Основное правило.' };
  assert.equal(applicationPresentationText(item), 'Способ: Основное правило.');
  assert.equal(applicationPresentationText({ ...item, entryGuidance: 'Нужно законно находиться в месте подачи.' }),
    'Способ: Основное правило. Нужно законно находиться в месте подачи.');
  for (const sentinel of ['Не применимо', ' Не применимо. ', 'Не применимо ;', 'Не применимо;']) {
    assert.equal(applicationPresentationText({ ...item, entryGuidance: sentinel }), 'Способ: Основное правило.');
  }
  const meaningful = 'Электронный этап не заменяет требуемое личное завершение процедуры.';
  assert.ok(applicationPresentationText({ ...item, entryGuidance: meaningful }).includes(meaningful));
});

test('all current Spain available application sentinels are suppressed across affected method types', () => {
  const affected = spainResearch.routes.flatMap(({ application_methods = [] }) => application_methods)
    .filter(({ availability, entry_condition_ru: entry }) => availability === 'AVAILABLE'
      && String(entry || '').trim().replace(/[\s.!?;:]+$/u, '').toLocaleLowerCase('ru') === 'не применимо');
  assert.equal(affected.length, 10);
  assert.deepEqual([...new Set(affected.map(({ method }) => method))].sort(), ['CURRENT_LEGAL_RESIDENCE', 'ONLINE']);
  for (const method of affected) {
    const rendered = applicationPresentationText({
      methodLabel: APPLICATION_METHOD_LABELS_RU[method.method],
      guidance: method.condition_ru,
      entryGuidance: method.entry_condition_ru,
    });
    assert.doesNotMatch(rendered, /Не применимо/u);
    assert.match(rendered, new RegExp(APPLICATION_METHOD_LABELS_RU[method.method]));
  }
  assert.equal(APPLICATION_METHOD_LABELS_RU.ONLINE, 'Электронная подача или электронный этап процедуры');
  assert.doesNotMatch(APPLICATION_METHOD_LABELS_RU.ONLINE, /полностью|без въезда|дистанционно/u);
});

test('LGBT neutral city state is wired while pending changes rendering remains deferred', async () => {
  const [app, engine] = await Promise.all([
    readFile(new URL('../matcher/app.js', import.meta.url), 'utf8'),
    readFile(new URL('../js/engine/rp4-engine.js', import.meta.url), 'utf8'),
  ]);
  assert.match(engine, /loyalCities: \(value\.friendly_cities \|\| \[\]\)\.map\(\(city\) => city\.city_ru\)/);
  assert.match(app, /Методологически надёжная оценка городов пока не найдена/);
  assert.match(app, /pendingChanges/);
  assert.match(app, /Что меняется/);
  assert.doesNotMatch(engine, /pendingChanges:/);
});

test('result UI keeps one corrective-action section and maps country tabs to matching panels', async () => {
  const app = await readFile(new URL('../matcher/app.js', import.meta.url), 'utf8');
  assert.equal(app.includes('Что потребуется для этого маршрута'), false);
  assert.match(app, /Что нужно выполнить, чтобы маршрут подходил/);
  assert.match(app, /data-country-tab="\$\{html\(countryId\)\}"/);
  assert.match(app, /data-country-panel="\$\{html\(countryId\)\}"/);
  assert.match(app, /panel\.dataset\.countryPanel !== countryId/);
  assert.match(app, /const countries = sortCountriesForDisplay\(calculation\.results \|\| \[\]\)/);
  assert.equal((app.match(/Курс валют:/g) || []).length, 1);
  assert.match(app, /\$\{calculationNote\}/);
});

test('every questionnaire answer enforced by step validation is visibly marked required', async () => {
  const [matcher, app] = await Promise.all([
    readFile(new URL('../index.html', import.meta.url), 'utf8'),
    readFile(new URL('../matcher/app.js', import.meta.url), 'utf8'),
  ]);
  for (const label of [
    'Переезжаете с детьми? *',
    'Переезжают домашние животные? *',
    'Какой результат вам нужен? *',
    'Комфортный семейный бюджет в месяц *',
    'Сохранить гражданство РФ? *',
  ]) assert.ok(matcher.includes(label), label);
  for (const label of [
    'Возраст ребёнка ${index + 1} *',
    'Ваш регулярный доход в месяц *',
    'Какую часть дохода можете подтвердить документами? *',
    'Какую сумму сможете подтвердить? *',
  ]) assert.ok(app.includes(label), label);
});

test('result UI reserves corrective actions for conditional routes', async () => {
  const app = await readFile(new URL('../matcher/app.js', import.meta.url), 'utf8');
  assert.equal(app.includes('Что должно измениться для повторной оценки'), false);
  assert.match(app, /route\.routeStatus === ["']SUITABLE_WITH_CONDITIONS["']/);
});

test('result UI handles no evaluable routes and filters family presentation by scenarioId', async () => {
  const app = await readFile(new URL('../matcher/app.js', import.meta.url), 'utf8');
  assert.doesNotMatch(app, /STATUS_LABELS_RU\[best\?\.routeStatus\]\s*\|\|\s*'Подходит с условиями'/);
  assert.match(app, /Нет маршрутов для надёжной оценки/);
  assert.match(app, /if \(!sortedRoutes\.length \|\| !best\) return/);
  assert.match(app, /familyEvaluation\?\.state === 'NOT_APPLICABLE'/);
  assert.match(app, /applicableScenarioIds\?\.includes\(item\.scenarioId\)/);
});

test('city cards grow with content, wrap long text, and constrain mobile overflow', async () => {
  const [app, styles] = await Promise.all([
    readFile(new URL('../matcher/app.js', import.meta.url), 'utf8'),
    readFile(new URL('../matcher/styles.css', import.meta.url), 'utf8'),
  ]);
  assert.match(app, /city-role-list[^`]*city\.categories\.map/);
  assert.equal(app.includes('citySizeLabels'), false);
  assert.equal(app.includes('<small>${html(city'), false);
  assert.match(styles, /html,body\{max-width:100%;overflow-x:clip\}/);
  assert.match(styles, /\.city-budget-grid\{[^}]*align-items:start;max-width:100%/);
  assert.match(styles, /\.city-budget-grid \.city-card\{height:auto;min-height:0;min-width:0;overflow-wrap:anywhere/);
  assert.match(styles, /\.city-role-list\{display:flex;flex-wrap:wrap/);
  assert.match(styles, /@media\(max-width:760px\)[\s\S]*\.city-budget-grid\{grid-template-columns:1fr\}/);
  assert.match(styles, /@media\(max-width:600px\)\{\.secure-note\{display:none\}\}/);
  assert.equal(/\.city-budget-grid \.city-card\{[^}]*(?:^|;)height:\s*\d/.test(styles), false);
});


test('income confirmation mode resolves one visible amount flow', () => {
  assert.equal(resolveProvableAmount('4000', 'FULL', ''), 4000);
  assert.equal(resolveProvableAmount('4000', 'PARTIAL', '2500'), 2500);
  assert.equal(resolveProvableAmount('4000', 'PARTIAL', ''), null);
  assert.equal(resolveProvableAmount('4000', 'NONE', '2500'), 0);
  assert.equal(resolveProvableAmount('4000', '', '2500'), null);
});

test('income step uses total income plus a conditional partial amount field', async () => {
  const [matcher, app] = await Promise.all([
    readFile(new URL('../index.html', import.meta.url), 'utf8'),
    readFile(new URL('../matcher/app.js', import.meta.url), 'utf8'),
  ]);
  assert.match(matcher, /Какую часть дохода можете подтвердить документами\?/);
  assert.match(matcher, /value="FULL">Весь доход/);
  assert.match(matcher, /value="PARTIAL">Только часть/);
  assert.match(matcher, /value="NONE">Пока не могу подтвердить/);
  assert.match(matcher, /id="primaryAmountField"[^>]*hidden/);
  assert.match(app, /partial\.trim\(\) === ''/);
  assert.match(app, /Выберите, какую часть дохода можете подтвердить/);
});

test('income controls align and share one control radius', async () => {
  const styles = await readFile(new URL('../matcher/styles.css', import.meta.url), 'utf8');
  assert.match(styles, /--control-radius:12px/);
  assert.match(styles, /\.income-block \.field>span:first-child\{[^}]*min-height:48px/);
  assert.match(styles, /\.field input,\.field select,\.field textarea\{border-radius:var\(--control-radius\)!important\}/);
  assert.match(styles, /\.money-combo\{[^}]*border-radius:var\(--control-radius\)/);
});

test('matcher cache keys include the current release for code and country data', async () => {
  const [matcher, app, packageJson] = await Promise.all([
    readFile(new URL('../index.html', import.meta.url), 'utf8'),
    readFile(new URL('../matcher/app.js', import.meta.url), 'utf8'),
    readFile(new URL('../package.json', import.meta.url), 'utf8').then(JSON.parse),
  ]);
  const version = packageJson.version.replaceAll('.', '\\.');
  assert.match(matcher, new RegExp(`styles\\.css\\?v=${version}`));
  assert.match(matcher, new RegExp(`app\\.js\\?v=${version}`));
  assert.match(app, /'ES-research-v4\.0\.json'/);
  assert.match(app, new RegExp(`fetch\\(\`\\.\\.\\/data\\/\\$\\{filename\\}\\?v=${version}\``));
  assert.equal(app.includes("-research-v3.0.json"), false);
  assert.equal(app.includes("-adapter.js"), false);
});

test('README describes the live matcher and maintenance rule', async () => {
  const [readme, packageJson] = await Promise.all([
    readFile(new URL('../README.md', import.meta.url), 'utf8'),
    readFile(new URL('../package.json', import.meta.url), 'utf8').then(JSON.parse),
  ]);
  assert.match(readme, /sankhipkate\.github\.io\/countrymatcher\//);
  assert.match(readme, /sankhipkate\.github\.io\/countrymatcher\/landing\//);
  assert.match(readme, /README обновляется при каждом изменении/);
  assert.ok(readme.includes(packageJson.version));
  assert.match(readme, /Испания/);
  assert.equal(readme.includes('Рабочий пилот Испании'), false);
});


test('country KPI uses applicant provable income instead of the selected route income', async () => {
  const app = await readFile(new URL('../matcher/app.js', import.meta.url), 'utf8');
  assert.match(app, /const incomeAmount = calculation\.applicantProvableIncome\?\.amount/);
  assert.equal(app.includes("incomeCurrency === 'EUR' ? best?.incomeEur : best?.incomeUsd"), false);
  assert.equal(app.includes('Не применяется к этому маршруту'), false);
  assert.equal(app.includes('Не рассчитан'), false);
});
