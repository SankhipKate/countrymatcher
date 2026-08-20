import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { applicationPresentationText, buildUserProfile, cityCategories, citySizeLabel, countryFlag, deduplicatedWorkRights, describeCityCostBasket, describeIncomeRequirement, describeResultIntro, enrichCityCategories, formatCityTemperatureRange, formatTemperatureRange, nextCitySortState, reorderCityComparisonRows, resolveProvableAmount, russianMonths, sortCitiesForComparison, sortCountriesForDisplay, sortRoutesForDisplay, uniqueRouteActions, validateAgainstSchema, validateUserProfile } from '../matcher/profile.js';
import { formatCurrency } from '../matcher/format.js';
import { APPLICATION_METHOD_LABELS_RU } from '../js/engine/rp4-engine.js';
import { STATUS_LABELS_RU } from '../js/engine/status-contract.js';
import { ROUTE_PRESENTATION_LABELS_RU, routePresentationGroup } from '../js/engine/route-presentation-contract.js';
import { countryOptions, parseCountryCode, searchCountries } from '../matcher/countries.js';
import { DOG_BREEDS, isKnownDogBreed, searchDogBreeds } from '../matcher/dog-breeds.js';

const profileSchema = JSON.parse(await readFile(new URL('../data/schemas/user-profile-v1.schema.json', import.meta.url), 'utf8'));
const universalProfiles = JSON.parse(await readFile(new URL('./fixtures/universal-profile-samples-v1.json', import.meta.url), 'utf8'));
const spainResearch = JSON.parse(await readFile(new URL('../data/ES-research-v4.0.json', import.meta.url), 'utf8'));
const uruguayResearch = JSON.parse(await readFile(new URL('../data/UY-research-v4.0.json', import.meta.url), 'utf8'));

test('visible matcher version matches package version', async () => {
  const [matcherHtml, packageJson, fxContext] = await Promise.all([
    readFile(new URL('../index.html', import.meta.url), 'utf8'),
    readFile(new URL('../package.json', import.meta.url), 'utf8').then(JSON.parse),
    readFile(new URL('../pilot/fx-context.js', import.meta.url), 'utf8'),
  ]);
  assert.match(matcherHtml, new RegExp(`версия ${packageJson.version.replaceAll('.', '\\.')}`));
  assert.equal(packageJson.version, '8.0.0');
  assert.match(matcherHtml, /aria-label="COUNTRY MATCHER"/);
  assert.match(matcherHtml, /<img class="brand-logo" src="\.\/assets\/images\/countrymatcher-logo\.png"/);
  assert.doesNotMatch(matcherHtml, /class="brand-mark"/);
  assert.equal(matcherHtml.includes('product-version'), false);
  assert.match(matcherHtml, /<title>COUNTRY MATCHER<\/title>/);
  assert.match(fxContext, /engine_version: '8\.0\.0'/);
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
  savingsAmount: '0', savingsCurrency: 'USD',
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

test('questionnaire maps documented savings separately from investment capital', () => {
  const withSavings = buildUserProfile(answers({ savingsAmount: '28800', savingsCurrency: 'EUR' }));
  assert.deepEqual(withSavings.income.savings, { amount: 28800, currency: 'EUR' });
  assert.equal(withSavings.investment_capital, undefined);
  assert.deepEqual(buildUserProfile(answers({ savingsAmount: '0', savingsCurrency: 'USD' })).income.savings, { amount: 0, currency: 'USD' });
  assert.equal(validateUserProfile(buildUserProfile(answers({ savingsAmount: '', savingsCurrency: 'EUR' }))).valid, false);
});

test('savings helper describes one documented family-application total without automatic partner acceptance', async () => {
  const htmlSource = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(htmlSource, /Укажите общую сумму сбережений, которую сможете документально подтвердить и использовать для подачи\./);
  assert.match(htmlSource, /Если часть средств находится у партнёра, включайте её только если сможете подтвердить доступность этих средств для подачи\./);
  assert.match(htmlSource, /<input id="savingsAmount"[^>]*\bvalue="0"/);
  assert.doesNotMatch(htmlSource, /средства партнёра[^<]*(?:автоматически|всегда) принимаются/i);
});

test('persistent calculation availability error is separate from step validation and submit is never silent', async () => {
  const [htmlSource, appSource] = await Promise.all([
    readFile(new URL('../index.html', import.meta.url), 'utf8'),
    readFile(new URL('../matcher/app.js', import.meta.url), 'utf8'),
  ]);
  assert.match(htmlSource, /id="calculationAvailabilityError"/);
  const validateStepSource = appSource.slice(appSource.indexOf('function validateStep'), appSource.indexOf('function showStep'));
  const showStepSource = appSource.slice(appSource.indexOf('function showStep'), appSource.indexOf('function familyLabel'));
  assert.doesNotMatch(validateStepSource, /calculationAvailabilityError/);
  assert.doesNotMatch(showStepSource, /calculationAvailabilityError/);
  assert.match(appSource, /if \(!activeResearchPackages\.length \|\| !calculationContext\) \{[\s\S]*?calculationAvailabilityError[\s\S]*?return;/);
  assert.match(appSource, /hasCompleteFxOutage\(context\.fx\)[\s\S]*?Курсы валют сейчас недоступны/);
  assert.doesNotMatch(appSource, /!calculationContext\) return;/);
});

test('result FX note is country-specific and guarded when no rate metadata was used', async () => {
  const appSource = await readFile(new URL('../matcher/app.js', import.meta.url), 'utf8');
  const noteSource = appSource.slice(appSource.indexOf('function calculationNoteHtml'), appSource.indexOf('function renderResult'));
  const resultSource = appSource.slice(appSource.indexOf('function renderResult'), appSource.indexOf('function switchToResult'));
  assert.match(noteSource, /summarizeFxContext\(calculationContext\.fx, country\?\.fxUsedCurrencies \|\| \[\]\)/);
  assert.match(noteSource, /fxSummary\.as_of && fxSummary\.source/);
  assert.match(resultSource, /countryById/);
  assert.match(resultSource, /calculationResultNote/);
  assert.match(resultSource, /calculationNoteHtml\(countryById\.get\(countryId\)\)/);
});

test('five presentation groups have distinct semantic UI classes and stable responsive badges', async () => {
  const [appSource, matcherCss, pilotCss] = await Promise.all([
    readFile(new URL('../matcher/app.js', import.meta.url), 'utf8'),
    readFile(new URL('../matcher/styles.css', import.meta.url), 'utf8'),
    readFile(new URL('../pilot/styles.css', import.meta.url), 'utf8'),
  ]);
  for (const [group, cssClass] of Object.entries({ SUITABLE: 'positive', SUITABLE_WITH_CONDITIONS: 'conditional', REQUIRES_SEPARATE_BASIS: 'separate-basis', INTERNATIONAL_PROTECTION: 'protection', UNSUITABLE: 'negative' })) {
    assert.match(appSource, new RegExp(`${group}: '${cssClass}'`));
  }
  assert.match(appSource, /statusClass\(presentationGroup\)/);
  assert.match(appSource, /statusClass\(routePresentationGroup\(best\)\)/);
  assert.match(pilotCss, /\.status-pill\.separate-basis\{background:#f0e7ff;color:#5b2c83\}/);
  assert.match(pilotCss, /\.status-pill\.protection\{background:#e7f0ff;color:#1d4f91\}/);
  assert.match(matcherCss, /\.route-card-heading>\.status-pill\{flex:0 0 220px;width:220px\}/);
  assert.match(matcherCss, /@media\(max-width:760px\)[\s\S]*?\.route-card-heading>\.status-pill\{flex:0 0 auto;width:auto\}/);
});

test('tax block renders four factual headings and no internal research commentary', async () => {
  const appSource = await readFile(new URL('../matcher/app.js', import.meta.url), 'utf8');
  for (const heading of ['Налоговое резидентство', 'Подоходный налог', 'Доходы из-за рубежа', 'Россия и двойное налогообложение']) assert.ok(appSource.includes(heading));
  assert.match(appSource, /<h3>Налоги<\/h3>/);
  assert.match(appSource, /Проверено:/);
  for (const pkg of [spainResearch, JSON.parse(await readFile(new URL('../data/AR-research-v4.0.json', import.meta.url), 'utf8')), uruguayResearch]) {
    const taxText = Object.entries(pkg.taxes).filter(([key, value]) => key.endsWith('_ru') && typeof value === 'string').map(([, value]) => value).join(' ');
    assert.doesNotMatch(taxText, /v3\.0|ranking|Country Matcher/i);
    const renderedTaxText = [pkg.taxes.tax_residency_rule_ru, pkg.taxes.personal_income_tax_ru, pkg.taxes.foreign_income_ru, pkg.taxes.double_taxation_with_russia_ru].join(' ');
    assert.doesNotMatch(renderedTaxText, /research bundle|Tax residence|tax residents|vital interests|qualifying foreign|years IRNR/i);
  }
  const uyTaxText = Object.entries(uruguayResearch.taxes).filter(([key, value]) => key.endsWith('_ru') && typeof value === 'string').map(([, value]) => value).join(' ');
  assert.doesNotMatch(uyTaxText, /research bundle|Tax residence|tax residents|vital interests|qualifying foreign|years IRNR/i);
  const taxSource = appSource.slice(appSource.indexOf('function renderTaxPresentation'), appSource.indexOf('function longTermConditions'));
  assert.doesNotMatch(taxSource, /socialContributions|social_contributions/);
});

test('five country-information sections share one card system with distinct pastel modifiers', async () => {
  const [appSource, styles] = await Promise.all([
    readFile(new URL('../matcher/app.js', import.meta.url), 'utf8'),
    readFile(new URL('../matcher/styles.css', import.meta.url), 'utf8'),
  ]);
  const classes = {
    cities: 'country-info-card country-info-cities',
    schools: 'country-info-card country-info-schools school-research',
    lgbt: 'country-info-card country-info-lgbt lgbt-research',
    pets: 'country-info-card country-info-pets',
    taxes: 'country-info-card country-info-taxes tax-research',
  };
  for (const value of Object.values(classes)) assert.ok(appSource.includes(value), value);
  assert.match(styles, /\.country-info-card\{[^}]*box-sizing:border-box[^}]*width:100%[^}]*padding:20px[^}]*border:1px solid[^}]*border-radius:16px/);
  const backgrounds = [...styles.matchAll(/\.country-info-(cities|schools|lgbt|pets|taxes)\{background:(#[0-9a-f]{6});border-color:(#[0-9a-f]{6})\}/g)];
  assert.equal(backgrounds.length, 5);
  assert.equal(new Set(backgrounds.map((match) => match[2])).size, 5);
  assert.match(styles, /@media\(max-width:760px\)[\s\S]*?\.country-info-card\{padding:15px\}/);
  assert.doesNotMatch(appSource, /Расходы по городам/);
  assert.match(appSource, /Города, климат и расходы/);
});

test('partner and child remain separate family members', () => {
  const profile = buildUserProfile(answers({ hasPartner: true, partnerIncluded: true, relationshipType: 'MARRIED', childAges: ['7'], schoolNeeded: true }));
  assert.equal(profile.family.adults_count, 2);
  assert.deepEqual(profile.family.children, [{ age_years: 7 }]);
  assert.equal(profile.family.school_needed, false);
});

test('school_needed is schema-only compatibility and always false in public profiles', () => {
  assert.equal(buildUserProfile(answers({ childAges: [] })).family.school_needed, false);
  assert.equal(buildUserProfile(answers({ childAges: ['7'], schoolNeeded: true })).family.school_needed, false);
  assert.deepEqual(validateAgainstSchema(buildUserProfile(answers({ childAges: ['7'] })), profileSchema), []);
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

test('public profile retains legal income and always nulls living-cost budget', () => {
  const profile = buildUserProfile(answers({ primaryTotalAmount: '300000', primaryAmount: '300000', primaryCurrency: 'RUB', monthlyBudget: '2200', budgetCurrency: 'EUR' }));
  assert.deepEqual(profile.income.primary.monthly_provable, { amount: 300000, currency: 'RUB' });
  assert.equal(profile.preferences.monthly_budget, null);
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

test('living-cost budget is null regardless of obsolete answer-shaped input', () => {
  assert.equal(buildUserProfile(answers({ budgetUnknown: false, monthlyBudget: '9999' })).preferences.monthly_budget, null);
});

test('public questionnaire has no living-cost budget controls or summary plumbing', async () => {
  const [app, html] = await Promise.all([
    readFile(new URL('../matcher/app.js', import.meta.url), 'utf8'),
    readFile(new URL('../index.html', import.meta.url), 'utf8'),
  ]);
  for (const text of ['monthlyBudget', 'budgetCurrency', 'budgetUnknown', 'Комфортный семейный бюджет', 'Не знаю бюджет', 'Семейный бюджет']) {
    assert.equal(html.includes(text), false);
    assert.equal(app.includes(text), false);
  }
  const built = buildUserProfile(answers());
  assert.equal(built.preferences.monthly_budget, null);
  assert.deepEqual(validateAgainstSchema(built, profileSchema), []);
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

test('result routes use five presentation groups without changing the three-status contract', () => {
  const routes = [
    { routeId: 'no', routeStatus: 'UNSUITABLE' },
    { routeId: 'protection', routeStatus: 'SUITABLE_WITH_CONDITIONS', presentationGroup: 'INTERNATIONAL_PROTECTION' },
    { routeId: 'yes', routeStatus: 'SUITABLE' },
    { routeId: 'basis', routeStatus: 'SUITABLE_WITH_CONDITIONS', presentationGroup: 'REQUIRES_SEPARATE_BASIS' },
    { routeId: 'conditions', routeStatus: 'SUITABLE_WITH_CONDITIONS' },
  ];
  assert.deepEqual(sortRoutesForDisplay(routes).map(({ routeId }) => routeId), ['yes', 'conditions', 'basis', 'protection', 'no']);
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


test('route display sorting uses the real family migration class before long-term goal', () => {
  const routes = [
    { routeId: 'later-but-goal', routeStatus: 'SUITABLE_WITH_CONDITIONS', familyFit: 'DOES_NOT_MEET', familyEvaluation: { sortRank: 2 }, goalFit: 'MEETS', conditions: ['A'] },
    { routeId: 'combination', routeStatus: 'SUITABLE_WITH_CONDITIONS', familyFit: 'MEETS', familyEvaluation: { sortRank: 1 }, goalFit: 'UNKNOWN', conditions: ['A'] },
    { routeId: 'direct', routeStatus: 'SUITABLE_WITH_CONDITIONS', familyFit: 'MEETS', familyEvaluation: { sortRank: 0 }, goalFit: 'UNKNOWN', conditions: ['A'] },
  ];
  assert.deepEqual(sortRoutesForDisplay(routes).map(({ routeId }) => routeId), ['direct', 'combination', 'later-but-goal']);
});

test('country display sorting distinguishes direct family move from route combination and later join', () => {
  const country = (countryId, sortRank, goalFit = 'UNKNOWN') => ({
    country: { countryId, group: 'SUITABLE_WITH_CONDITIONS' },
    bestRoute: { routeStatus: 'SUITABLE_WITH_CONDITIONS', familyFit: 'MEETS', familyEvaluation: { sortRank }, goalFit },
  });
  assert.deepEqual(sortCountriesForDisplay([
    country('LATER', 2, 'MEETS'),
    country('COMBO', 1),
    country('DIRECT', 0),
  ]).map(({ country: item }) => item.countryId), ['DIRECT', 'COMBO', 'LATER']);
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

test('countries follow the same five-level presentation order as routes', () => {
  const country = (countryId, presentationGroup, routeStatus = 'SUITABLE_WITH_CONDITIONS') => ({
    country: { countryId, group: routeStatus }, bestRoute: { routeStatus, presentationGroup },
  });
  const countries = [
    country('NO', 'UNSUITABLE', 'UNSUITABLE'),
    country('PROT', 'INTERNATIONAL_PROTECTION'),
    country('BASIS', 'REQUIRES_SEPARATE_BASIS'),
    country('COND', 'SUITABLE_WITH_CONDITIONS'),
    country('YES', 'SUITABLE', 'SUITABLE'),
  ];
  assert.deepEqual(sortCountriesForDisplay(countries).map(({ country: item }) => item.countryId), ['YES', 'COND', 'BASIS', 'PROT', 'NO']);
});

test('comparisonCostUsd never changes cross-country ordering', () => {
  const country = (countryId, comparisonComponents, costs) => ({
    country: { countryId, group: 'SUITABLE' },
    bestRoute: { routeStatus: 'SUITABLE', familyFit: 'MEETS', goalFit: 'MEETS' },
    cities: costs.map((comparisonCostUsd) => ({ comparisonCostUsd, comparisonComponents })),
  });
  assert.deepEqual(sortCountriesForDisplay([
    country('FIRST', ['RENT_STANDARD'], [99999, 99998]),
    country('SECOND', ['RENT_STANDARD', 'UTILITIES'], [1, 2]),
  ]).map(({ country }) => country.countryId), ['FIRST', 'SECOND']);
});

test('city-cost presentation describes the shared basket once without source metadata', async () => {
  const scenarios = [{ component: 'RENT_STANDARD', condition: '1 спальня в центре.' }];
  assert.equal(
    describeCityCostBasket(['RENT_STANDARD', 'UTILITIES'], scenarios),
    'В расчёт входит: аренда квартиры с 1 спальней в центре + коммунальные расходы на 1 человека. Это ориентир для сравнения городов между собой, а не расчёт бюджета вашей семьи.',
  );
  assert.equal(
    describeCityCostBasket(['RENT_STANDARD'], [{ component: 'RENT_STANDARD', condition: 'Однокомнатная квартира в центре.' }]),
    'В расчёт входит: аренда квартиры с 1 спальней в центре на 1 человека. Это ориентир для сравнения городов между собой, а не расчёт бюджета вашей семьи.',
  );
  assert.equal(
    describeCityCostBasket(['RENT_STANDARD', 'TRANSPORT'], [{ component: 'RENT_STANDARD', condition: 'Сценарий Expatistan.' }]),
    'В расчёт входит: аренда квартиры с 1 спальней в центре + транспорт на 1 человека. Это ориентир для сравнения городов между собой, а не расчёт бюджета вашей семьи.',
  );
  assert.equal(
    describeCityCostBasket(['RENT_STANDARD', 'UTILITIES', 'GROCERIES', 'TRANSPORT'], [{ component: 'RENT_STANDARD', condition: 'Однокомнатная квартира в центре.' }]),
    'В расчёт входит: аренда квартиры с 1 спальней в центре + коммунальные расходы + продукты + транспорт на 1 человека. Это ориентир для сравнения городов между собой, а не расчёт бюджета вашей семьи.',
  );
  const app = await readFile(new URL('../matcher/app.js', import.meta.url), 'utf8');
  const citySection = app.slice(app.indexOf('function renderCountryResult'), app.indexOf('function calculateActiveCountries'));
  assert.match(citySection, /describeCityCostBasket\(comparisonComponents, comparisonCities\[0\]\?\.comparisonScenarios\)/u);
  assert.equal((citySection.match(/describeCityCostBasket/g) || []).length, 1);
  assert.doesNotMatch(citySection, /research observation|price_date|Numbeo|Livingcost|Expatistan/u);
});

test('city comparison sorting is semantic, stable, reversible, and keeps missing values last', () => {
  const cities = [
    { name: 'B', size: 'MEDIUM', comparisonCost: 1500, coldRange: '1–10', hotRange: '20–31' },
    { name: 'Missing', size: null, comparisonCost: null, coldRange: null, hotRange: null },
    { name: 'A', size: 'LARGE', comparisonCost: 900, coldRange: '1–8', hotRange: '18–31' },
    { name: 'C', size: 'SMALL', comparisonCost: 2100, coldRange: '5–12', hotRange: '19–35' },
  ];
  assert.deepEqual(sortCitiesForComparison(cities, 'cost').map(({ name }) => name), ['A', 'B', 'C', 'Missing']);
  assert.deepEqual(sortCitiesForComparison(cities, 'cost', 'desc').map(({ name }) => name), ['C', 'B', 'A', 'Missing']);
  assert.deepEqual(sortCitiesForComparison(cities, 'size').map(({ name }) => name), ['A', 'B', 'C', 'Missing']);
  assert.deepEqual(sortCitiesForComparison(cities, 'size', 'desc').map(({ name }) => name), ['C', 'B', 'A', 'Missing']);
  assert.deepEqual(sortCitiesForComparison(cities, 'cold').map(({ name }) => name), ['A', 'B', 'C', 'Missing']);
  assert.deepEqual(sortCitiesForComparison(cities, 'hot').map(({ name }) => name), ['A', 'B', 'C', 'Missing']);
  assert.deepEqual(sortCitiesForComparison(cities, null).map(({ name }) => name), cities.map(({ name }) => name));
  assert.equal(citySizeLabel('LARGE'), 'Большой');
  assert.equal(citySizeLabel('MEDIUM'), 'Средний');
  assert.equal(citySizeLabel('SMALL'), 'Небольшой');
  assert.deepEqual(nextCitySortState({}, 'cost'), { key: 'cost', direction: 'asc' });
  assert.deepEqual(nextCitySortState({ key: 'cost', direction: 'asc' }, 'cost'), { key: 'cost', direction: 'desc' });
  assert.deepEqual(nextCitySortState({ key: 'cost', direction: 'desc' }, 'size'), { key: 'size', direction: 'asc' });
});

test('city comparison click flow appends rows to tbody in the selected DOM order across rerenders', () => {
  const row = (name, size, cost, coldLow, coldHigh, hotLow, hotHigh) => ({ name, dataset: {
    size, cost, coldLow, coldHigh, hotLow, hotHigh,
  } });
  const rows = [
    row('Medium', 'MEDIUM', '1500', '1', '10', '20', '31'),
    row('Missing', '', '', '', '', '', ''),
    row('Large', 'LARGE', '900', '1', '8', '18', '31'),
    row('Small', 'SMALL', '2100', '5', '12', '19', '35'),
  ];
  const renderedNames = [];
  const body = { append: (item) => renderedNames.push(item.name) };
  let state = nextCitySortState({}, 'cost');
  reorderCityComparisonRows(body, rows, state.key, state.direction);
  assert.deepEqual(renderedNames.splice(0), ['Large', 'Medium', 'Small', 'Missing']);
  state = nextCitySortState(state, 'cost');
  reorderCityComparisonRows(body, rows, state.key, state.direction);
  assert.deepEqual(renderedNames.splice(0), ['Small', 'Medium', 'Large', 'Missing']);
  state = nextCitySortState(state, 'size');
  reorderCityComparisonRows(body, rows, state.key, state.direction);
  assert.deepEqual(renderedNames.splice(0), ['Large', 'Medium', 'Small', 'Missing']);
  const rerenderedBody = { append: (item) => renderedNames.push(item.name) };
  const rerenderedState = nextCitySortState({}, 'cold');
  reorderCityComparisonRows(rerenderedBody, rows, rerenderedState.key, rerenderedState.direction);
  assert.deepEqual(renderedNames.splice(0), ['Large', 'Medium', 'Small', 'Missing']);
});

test('AR and UY city gap handling uses one common intersection without affordability wording', async () => {
  for (const code of ['AR', 'UY']) {
    const pkg = JSON.parse(await readFile(new URL(`../data/${code}-research-v4.0.json`, import.meta.url), 'utf8'));
    const gap = pkg.open_items.find(({ block }) => block === 'CITIES_COST');
    assert.match(gap.handling_ru, /единому пересечению сопоставимых компонентов/u);
    assert.match(gap.handling_ru, /без подстановки нуля или интерполяции/u);
    assert.doesNotMatch(gap.handling_ru, /budget-fit|бюджет|affordability|каждого города/u);
  }
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
    { name: 'A', size: 'LARGE', comparisonCostUsd: 2000, coldRange: 'примерно 8–16 °C', hotRange: 'примерно 20–30 °C' },
    { name: 'B', size: 'MEDIUM', comparisonCostUsd: 1500, coldRange: 'примерно 12–20 °C', hotRange: 'примерно 24–36 °C' },
    { name: 'C', size: 'SMALL', comparisonCostUsd: 1000, coldRange: 'примерно −1–5 °C', hotRange: 'примерно 5–15 °C' },
  ]);
  assert.ok(cities.find(({ name }) => name === 'A').categories.includes('Самый дорогой'));
  assert.ok(cities.find(({ name }) => name === 'C').categories.includes('Самый недорогой'));
  assert.ok(cities.find(({ name }) => name === 'B').categories.includes('Самый жаркий'));
  assert.ok(cities.find(({ name }) => name === 'C').categories.includes('Самый прохладный'));
});

test('cities without comparisonCostUsd are never price-ranked', () => {
  const cities = enrichCityCategories([
    { name: 'Partial A', size: 'LARGE', comparisonCostUsd: null },
    { name: 'Partial B', size: 'SMALL', comparisonCostUsd: null },
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
  assert.deepEqual(deduplicatedWorkRights({
    applicant: [{ rule: 'Правило A.' }, { rule: 'Правило B.' }, { rule: 'Правило A.' }],
    partner: [{ rule: 'Правило C.' }, { rule: 'Правило D.' }],
  }), ['Заявитель: Правило A.; Правило B.', 'Партнёр: Правило C.; Правило D.']);
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
  assert.equal(formatTemperatureRange([1, 11]), 'примерно 1–11 °C');
  assert.equal(formatTemperatureRange([-1, 8]), 'примерно -1–8 °C');
  assert.equal(formatCityTemperatureRange([1, 11]), '1–11 °C');
  assert.equal(formatCityTemperatureRange('около 18 °C'), '18 °C');
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
  assert.doesNotMatch(source, /name="schoolType"|Какую школу планируете\?|educationBlock/u);
  assert.doesNotMatch(app, /schoolType|schoolNeeded|educationBlock/u);
  assert.equal((source.match(/class="wizard-step(?: is-active)?"/g) || []).length, 4);
  assert.deepEqual([...source.matchAll(/data-step="(\d+)"/g)].map((match) => Number(match[1])), [1, 2, 3, 4]);
  assert.match(app, /const TOTAL_STEPS = steps\.length/u);
  assert.doesNotMatch(app, /step === 5/u);
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
  assert.match(app, /Государственные школы/);
  assert.match(app, /Международные школы с обучением на английском/);
  assert.match(app, /school\.public\.rules\.map/);
  assert.doesNotMatch(app, /internationalSchoolCost|internationalSchoolNames|schoolLine|needsInternationalSchool/);
  assert.match(app, /ANNUAL: '\/год'/);
  assert.match(app, /ACADEMIC_YEAR: '\/учебный год'/);
  assert.match(app, /schoolTuitionPeriodLabel\(rule\.tuition\.period\)/);
  assert.match(app, /Подтверждены в:/);
  assert.match(app, /В ходе исследования международные школы с обучением на английском не найдены\./);
  assert.match(app, /Данных о международных школах с обучением на английском пока недостаточно\./);

  assert.equal(app.includes('Для выбранного размера города в пакете пока нет отдельной модели'), false);
  assert.match(styles, /\.country-workspace\{display:grid/);
  assert.match(styles, /\.country-tabs\{position:sticky/);
  assert.match(styles, /@media\(max-width:900px\)[\s\S]*overflow-x:auto/);
  assert.equal(app.includes('Ваш бюджет не указан'), false);
  assert.doesNotMatch(app, /budgetDerivedFromIncome|monthlyBudgetUsd|cityBudgetVerdict/);
  assert.match(app, /data-country-tab/);
  assert.doesNotMatch(app, /enrichCityCategories/);
  assert.match(app, /cityCategories\(city\.populationCategory/);
  assert.equal(app.includes('Самый дорогой по индексу Expatistan'), false);
  assert.equal(app.includes('Сравнение стран'), false);
  assert.equal(app.includes('Страна расчёта'), false);
  assert.match(styles, /\.country-tab \.status-pill\{grid-column:2/);
});

test('school UI renders international tuition range without exposing legacy tariff rows', async () => {
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
  const presentation = (period, international = {}) => ({ schoolPresentation: {
    public: { rules: [publicRule(period)] },
    international: { status: 'AVAILABLE', cities: ['Тестовый город'], ...international },
  } });
  const annual = renderSchool(presentation('ANNUAL'));
  assert.match(annual, /Государственные школы/);
  assert.match(annual, /1200 EUR \/год/);
  assert.match(annual, /Международные школы с обучением на английском/);
  assert.match(annual, /Подтверждены в: Тестовый город\./);
  assert.match(renderSchool(presentation('ACADEMIC_YEAR')), /1200 EUR \/учебный год/);

  const ranged = renderSchool(presentation('ANNUAL', { tuitionRangeUsd: { minimum: 10000, maximum: 20000 } }));
  assert.match(ranged, /Стоимость обучения: 10000 USD–20000 USD в год\./);
  assert.match(ranged, /Вступительные и регистрационные взносы не включены\./);
  const equal = renderSchool(presentation('ANNUAL', { tuitionRangeUsd: { minimum: 15000, maximum: 15000 } }));
  assert.match(equal, /Стоимость обучения: 15000 USD в год\./);
  assert.doesNotMatch(equal, /15000 USD–15000 USD/);

  const available = renderSchool(presentation('ANNUAL', { cities: [] }));
  assert.match(available, /Наличие подтверждено\./);
  const none = renderSchool(presentation('ANNUAL', { status: 'RESEARCHED_NONE_FOUND', cities: [] }));
  assert.match(none, /В ходе исследования международные школы с обучением на английском не найдены\./);
  const unknown = renderSchool(presentation('ANNUAL', { status: 'NOT_RESEARCHED', cities: [] }));
  assert.match(unknown, /Данных о международных школах с обучением на английском пока недостаточно\./);
  assert.doesNotMatch(unknown, /не найдены/u);
  assert.doesNotMatch(app, /admissionFee|admission_fee/u);
  assert.match(annual, /<section class="country-info-card country-info-schools school-research">[\s\S]*Государственные школы[\s\S]*Международные школы с обучением на английском[\s\S]*<\/section>/u);
  assert.equal((annual.match(/school-research/g) || []).length, 1);
  assert.equal((annual.match(/class="school-subsection"/g) || []).length, 2);
  assert.equal(renderSchool({ schoolPresentation: null }), '');
});

test('UY public-school Russian data renders without mixed-language residues', async () => {
  const rule = uruguayResearch.schools.public_school_rules[0];
  const russianFields = [rule.jurisdiction_ru, rule.language_ru, rule.rule_ru].join(' ');
  assert.doesNotMatch(russianFields, /public education|migrant students/i);
  assert.match(rule.language_ru, /Национальной администрации государственного образования Уругвая \(ANEP\)/u);
  const app = await readFile(new URL('../matcher/app.js', import.meta.url), 'utf8');
  const schoolSource = app.slice(app.indexOf('const publicSchoolAccessLabel'), app.indexOf('function renderEntryPresentation'));
  const renderSchool = Function('currency', 'html', `${schoolSource}; return renderSchoolPresentation;`)(
    (amount, currencyCode) => `${amount} ${currencyCode}`,
    (value) => String(value),
  );
  const output = renderSchool({ schoolPresentation: {
    public: { rules: [{
      jurisdiction: rule.jurisdiction_ru, foreignChildAccess: rule.foreign_child_access,
      language: rule.language_ru, compulsoryAgeMin: rule.compulsory_age_min,
      compulsoryAgeMax: rule.compulsory_age_max, isFree: rule.is_free, tuition: rule.tuition,
    }] },
    international: { status: uruguayResearch.schools.international_school_status, cities: ['Монтевидео', 'Мальдонадо'] },
  } });
  assert.doesNotMatch(output, /public education|migrant students/i);
  assert.match(output, /Национальной администрации государственного образования Уругвая \(ANEP\)/u);
});

test('route cards deduplicate financial actions by requirement identity', async () => {
  const app = await readFile(new URL('../matcher/app.js', import.meta.url), 'utf8');
  const routeSource = app.slice(app.indexOf('function longTermConditions'), app.indexOf('function countryPresentation'));
  const renderRoute = Function(
    'ROUTE_PRESENTATION_LABELS_RU', 'routePresentationGroup', 'statusClass', 'html', 'currency', 'officialFinancialPeriodSuffix',
    'applicationPresentationText', 'russianMonths', 'deduplicatedWorkRights',
    `${routeSource}; return routeCard;`,
  )(
    ROUTE_PRESENTATION_LABELS_RU, routePresentationGroup, () => 'status', (value) => String(value),
    (amount, code = 'USD') => `${amount} ${code}`, (period) => ({ MONTHLY: '/мес', ANNUAL: '/год' })[period] || '',
    () => '', () => '', () => [],
  );
  const alternative = (label, threshold, thresholdUsd) => ({
    requirementLabel: label, kind: 'INCOME', kindLabel: 'Доход', threshold, thresholdUsd,
    currency: 'EUR', period: 'MONTHLY', state: 'UNKNOWN', practicalGuidance: null,
  });
  const base = {
    routeName: 'Маршрут', routeOfficialName: null, description: 'Описание маршрута.',
    blockers: [], conditions: [], displayOnlyRequirements: [], application: [], family: [],
    familyEvaluation: { state: 'NOT_APPLICABLE' }, workRights: {}, longTerm: null,
    processing: null, firstPermit: null, officialSource: null,
  };
  const satisfied = { requirementId: 'FIN_OK', effect: 'NONE', summary: {
    alternatives: [alternative('Удовлетворённое требование', 1000, 1110)],
  } };
  const conditional = { requirementId: 'FIN_FIX', effect: 'CONDITION', summary: {
    alternatives: [alternative('Условное требование', 2000, 2220)],
  } };

  const suitable = renderRoute({ ...base, routeStatus: 'SUITABLE', financialSummary: satisfied.summary, financialRequirements: [satisfied], conditionActions: [] }, 'Страна');
  assert.match(suitable, /Финансовое требование/u);
  assert.match(suitable, /Удовлетворённое требование/u);

  const guidance = {
    status: 'FOUND', summary_ru: 'Практические значения.', disclaimer_ru: 'Не официальный порог.',
    figures: [{ amount: 2500, currency: 'USD', period: 'MONTHLY', family_context_ru: 'Пара', note_ru: 'Отдельное значение.', evidence: [{ evidence_type: 'REPORTED_PRACTICE', source_date: '2026-08-10', sourceTitle: 'Практический источник', sourceUrl: 'https://example.test/practice' }] }],
  };
  const laterGuidance = { requirementId: 'FIN_LATER', effect: 'NONE', summary: { alternatives: [{ ...alternative('Позднее требование', null, null), state: 'PASS', practicalGuidance: guidance }] } };
  const guidanceAcrossRequirements = renderRoute({ ...base, routeStatus: 'SUITABLE', financialSummary: satisfied.summary, financialRequirements: [satisfied, laterGuidance], conditionActions: [] }, 'Страна');
  assert.match(guidanceAcrossRequirements, /Практический финансовый ориентир[\s\S]*2 500 USD/u);
  assert.match(guidanceAcrossRequirements, /href="https:\/\/example\.test\/practice"[\s\S]*Практический источник/u);
  const duplicateGuidance = renderRoute({ ...base, routeStatus: 'SUITABLE', financialSummary: laterGuidance.summary, financialRequirements: [laterGuidance, structuredClone(laterGuidance)], conditionActions: [] }, 'Страна');
  assert.equal((duplicateGuidance.match(/Практические значения\./gu) || []).length, 1);
  const distinctSameSummary = structuredClone(laterGuidance);
  distinctSameSummary.requirementId = 'FIN_DISTINCT';
  distinctSameSummary.summary.alternatives[0].practicalGuidance.figures[0].amount = 2000;
  const structurallyDistinctGuidance = renderRoute({ ...base, routeStatus: 'SUITABLE', financialSummary: laterGuidance.summary, financialRequirements: [laterGuidance, distinctSameSummary], conditionActions: [] }, 'Страна');
  assert.equal((structurallyDistinctGuidance.match(/Практические значения\./gu) || []).length, 2);
  const unsuitableGuidance = renderRoute({ ...base, routeStatus: 'UNSUITABLE', blockers: ['Конкретная причина.'], financialSummary: laterGuidance.summary, financialRequirements: [laterGuidance], conditionActions: [] }, 'Страна');
  assert.match(unsuitableGuidance, /Почему не подходит[\s\S]*Конкретная причина/u);
  assert.doesNotMatch(unsuitableGuidance, /Практический финансовый ориентир|Что это за маршрут/u);

  const mixed = renderRoute({
    ...base, routeStatus: 'SUITABLE_WITH_CONDITIONS', conditions: ['Исправить финансы.'],
    financialSummary: conditional.summary, financialRequirements: [conditional, satisfied],
    conditionActions: [{ requirementId: 'FIN_FIX', requirementType: 'FINANCIAL', text: 'Исправить финансы.', financialSummary: conditional.summary }],
  }, 'Страна');
  assert.match(mixed, /Что нужно выполнить, чтобы маршрут подходил[\s\S]*Исправить финансы — доход 2000 EUR\/мес \(≈ 2220 USD\/мес\)/u);
  assert.equal((mixed.match(/Исправить финансы/g) || []).length, 1);
  assert.match(mixed, /Финансовое требование[\s\S]*Удовлетворённое требование/u);
  assert.doesNotMatch(mixed.slice(mixed.indexOf('Финансовое требование')), /Условное требование/u);

  const nonFinancial = renderRoute({
    ...base, routeStatus: 'SUITABLE_WITH_CONDITIONS', conditions: ['Получить документ.'],
    financialSummary: satisfied.summary, financialRequirements: [satisfied],
    conditionActions: [{ requirementId: 'DOC', requirementType: 'OTHER_BASIS', text: 'Получить документ.', financialSummary: null }],
  }, 'Страна');
  assert.match(nonFinancial, /Что нужно выполнить[\s\S]*Получить документ/u);
  assert.match(nonFinancial, /Финансовое требование[\s\S]*Удовлетворённое требование/u);

  const sameTextA = { requirementId: 'FIN_A', effect: 'CONDITION', summary: {
    alternatives: [alternative('Одинаковый текст', 1200, 1330)],
  } };
  const sameTextB = { requirementId: 'FIN_B', effect: 'CONDITION', summary: {
    alternatives: [alternative('Одинаковый текст', 2400, 2670)],
  } };
  const identicalText = renderRoute({
    ...base, routeStatus: 'SUITABLE_WITH_CONDITIONS', conditions: ['Одинаковое действие.'],
    financialSummary: sameTextA.summary, financialRequirements: [sameTextA, sameTextB],
    conditionActions: [
      { requirementId: 'FIN_A', requirementType: 'FINANCIAL', text: 'Одинаковое действие.', financialSummary: sameTextA.summary },
      { requirementId: 'FIN_B', requirementType: 'FINANCIAL', text: 'Одинаковое действие.', financialSummary: sameTextB.summary },
    ],
  }, 'Страна');
  assert.equal((identicalText.match(/Одинаковое действие/g) || []).length, 2);
  assert.match(identicalText, /Одинаковое действие — доход 1200 EUR\/мес \(≈ 1330 USD\/мес\)/u);
  assert.match(identicalText, /Одинаковое действие — доход 2400 EUR\/мес \(≈ 2670 USD\/мес\)/u);
  assert.doesNotMatch(identicalText, /Финансовое требование/u);

  const separate = renderRoute({
    ...base, routeStatus: 'SUITABLE_WITH_CONDITIONS', presentationGroup: 'REQUIRES_SEPARATE_BASIS',
    conditions: ['Получить основание.'], conditionActions: [{ text: 'Получить основание.', requirementId: 'BASIS', financialSummary: null }],
  }, 'Страна', true);
  assert.match(separate, /Требует отдельного основания/u);
  assert.match(separate, /Получить основание/u);
  assert.doesNotMatch(separate, /Лучший маршрут исходя из ваших ответов/u);

  const protection = renderRoute({
    ...base, routeStatus: 'SUITABLE_WITH_CONDITIONS', presentationGroup: 'INTERNATIONAL_PROTECTION',
    conditions: ['Подтвердить обстоятельства.'], conditionActions: [{ text: 'Подтвердить обстоятельства.', requirementId: 'PROT', financialSummary: null }],
  }, 'Страна', true);
  assert.match(protection, /Международная защита/u);
  assert.doesNotMatch(protection, /Лучший маршрут исходя из ваших ответов/u);
  assert.match(mixed, /Подходит с условиями/u);
  const ordinaryConditional = renderRoute({
    ...base, routeStatus: 'SUITABLE_WITH_CONDITIONS', conditions: ['Обычное условие.'],
    conditionActions: [{ text: 'Обычное условие.', requirementId: 'COND', financialSummary: null }],
  }, 'Страна', true);
  assert.doesNotMatch(ordinaryConditional, /Лучший маршрут исходя из ваших ответов/u);
});

test('ES NLV route description stays concise in researched data and UI input', () => {
  const route = spainResearch.routes.find(({ route_id }) => route_id === 'ES_NLV');
  assert.equal(route.basis_ru, 'Проживание в Испании без трудовой или профессиональной деятельности при достаточных средствах.');
  assert.doesNotMatch(route.basis_ru, /IPREM|600 EUR|2 400 EUR/u);
});

test('entry UI uses RP4 fields and city UI has no affordability matching', async () => {
  const app = await readFile(new URL('../matcher/app.js', import.meta.url), 'utf8');
  const entrySource = app.slice(app.indexOf('function renderEntryPresentation'), app.indexOf('function renderPetPresentation'));
  const renderEntry = Function('html', `${entrySource}; return renderEntryPresentation;`)((value) => String(value));
  const es = renderEntry({ entryForRussianCitizen: {
    visaRequired: true, maximumStayDays: 90, processingTime: 'Официальный срок.', rule: 'Полное правило.',
  } });
  assert.match(es, /Въезд для граждан РФ/);
  assert.match(es, /Виза: требуется\./);
  assert.match(es, /Максимальный срок пребывания: 90 дней\./);
  assert.match(es, /Срок оформления: Официальный срок\./);
  assert.match(es, /Полное правило\./);

  const noTiming = renderEntry({ entryForRussianCitizen: {
    visaRequired: false, maximumStayDays: 90, processingTime: null, rule: 'Правило.',
  } });
  assert.match(noTiming, /Виза: не требуется\./);
  assert.doesNotMatch(noTiming, /Срок оформления/);
  const unknownVisa = renderEntry({ entryForRussianCitizen: {
    visaRequired: null, maximumStayDays: null, processingTime: '', rule: 'Правило.',
  } });
  assert.doesNotMatch(unknownVisa, /Виза:/);

  assert.doesNotMatch(app, /cityBudgetVerdict|budgetDerivedFromIncome|monthlyBudgetUsd|familyFactor|costIsFamilySpecific|\/мес на семью/);
  assert.doesNotMatch(app, /В бюджет укладывается|выше бюджета|Стоимость жизни — ориентировочная/);
  assert.match(app, /Города, климат и расходы/);
  assert.doesNotMatch(app, /Расходы по городам/);
  assert.match(app, /comparisonCost: city\.comparisonCostUsd/);
  assert.match(app, /comparisonCost == null \? 'Нет данных' : currency\(comparisonCost\)/);
  assert.match(app, /country-info-card country-info-cities/);
  assert.match(app, /\$\{basketDescription\}<div class="cities-comparison"><table>/);
  assert.doesNotMatch(app, /city-budget-grid|city-card/);
  assert.doesNotMatch(app, /city-direct Livingcost/);
  assert.doesNotMatch(entrySource, /summary_ru|air_entry_ru|land_sea_entry_ru|fee_local_ru|in_country_residence_application_ru/);
  assert.doesNotMatch(app, /internationalSchoolCost|knownSchoolCost|numericSchoolCost/);
});

test('pets UI consumes generic presentation after LGBT and never reads petSummary', async () => {
  const app = await readFile(new URL('../matcher/app.js', import.meta.url), 'utf8');
  const petSource = app.slice(app.indexOf('function renderPetPresentation'), app.indexOf('function longTermConditions'));
  const renderPets = Function('html', `${petSource}; return renderPetPresentation;`)((value) => String(value));
  assert.equal(renderPets({ petPresentation: null }), '');
  const block = renderPets({ petPresentation: {
    importText: 'Ограничений на ввоз домашних животных не выявлено.',
    afterEntryText: 'Конкретное правило после въезда.',
  } });
  assert.match(block, /Домашние животные/);
  assert.match(block, /Ввоз в страну:/);
  assert.match(block, /После въезда:/);
  assert.match(block, /country-info-card country-info-pets/);
  assert.doesNotMatch(app, /calculation\.petSummary/);
  assert.match(app, /calculation\.petPresentation/);
  assert.ok(app.indexOf('renderLgbtResearch(calculation)') < app.lastIndexOf('renderPetPresentation(calculation)'));
});

test('country navigation omits route names and every route uses native collapsible details', async () => {
  const app = await readFile(new URL('../matcher/app.js', import.meta.url), 'utf8');
  const tabSource = app.slice(app.indexOf('function renderCountryTab'), app.indexOf('function renderCountryResult'));
  assert.match(tabSource, /html\(countryName\)/);
  assert.match(tabSource, /ROUTE_PRESENTATION_LABELS_RU\[routePresentationGroup\(best\)\]/);
  assert.equal(tabSource.includes('best.routeName'), false);
  const cardSource = app.slice(app.indexOf('function routeCard'), app.indexOf('function countryPresentation'));
  assert.match(cardSource, /<details\$\{main \? ' open' : ''\}>/);
  assert.doesNotMatch(cardSource, /Лучший маршрут исходя из ваших ответов/u);
  assert.match(cardSource, /when-closed">Показать подробности/);
  assert.match(cardSource, /when-open">Скрыть подробности/);
  assert.match(cardSource, /Почему не подходит/);
  assert.match(cardSource, /unsuitable \? blockersBlock : body/);
  assert.equal(/if \(unsuitable\)[^\n]*\$\{body\}/.test(cardSource), false);
});

test('result UI renders localized methods, entry guidance, duration, and deduplicated work rights', async () => {
  const app = await readFile(new URL('../matcher/app.js', import.meta.url), 'utf8');
  assert.match(app, /route\.application\?\.map\(applicationPresentationText\)/);
  assert.match(app, /Срок первого разрешения:/);
  assert.match(app, /russianMonths\(route\.firstPermit\.months\)/);
  assert.match(app, /deduplicatedWorkRights\(route\.workRights\)/);
  assert.doesNotMatch(app, /return `\$\{item\.kind\}:/);
  assert.match(app, /item\.requirementLabel \|\| item\.kindLabel/);
});

test('official financial periods render consistently in route cards and the best-route KPI', async () => {
  const app = await readFile(new URL('../matcher/app.js', import.meta.url), 'utf8');
  assert.match(app, /const officialFinancialPeriodSuffix = \(period\) => \(\{ MONTHLY: '\/мес', ANNUAL: '\/год' \}\)\[period\] \|\| ''/);
  assert.match(app, /currency\(item\.threshold, item\.currency\).*officialFinancialPeriodSuffix\(item\.period\)/);
  assert.match(app, /currency\(primaryFinancial\.threshold, primaryFinancial\.currency\).*officialFinancialPeriodSuffix\(primaryFinancial\.period\)/);
  assert.match(app, /currency\(item\.thresholdUsd, "USD"\).*officialFinancialPeriodSuffix\(item\.period\)/);
  assert.equal((app.match(/officialFinancialPeriodSuffix\(/g) || []).length, 3);
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
  assert.equal(affected.length, 11);
  assert.deepEqual([...new Set(affected.map(({ method }) => method))].sort(), ['CURRENT_LEGAL_RESIDENCE', 'ONLINE', 'ORIGIN_COUNTRY']);
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
  assert.doesNotMatch(app, /Методологически надёжная оценка городов пока не найдена/);
  assert.match(app, /practicalEnvironment === 'Неоднородная' && loyalCities\.length/);
  assert.match(app, /pendingChanges/);
  assert.match(app, /Что меняется/);
  assert.doesNotMatch(engine, /pendingChanges:/);
});

test('result UI keeps one corrective-action section and maps country tabs to matching panels', async () => {
  const app = await readFile(new URL('../matcher/app.js', import.meta.url), 'utf8');
  assert.equal(app.includes('Что потребуется для этого маршрута'), false);
  assert.equal(app.includes('Условия и ограничения статуса'), false);
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

test('city comparison has five accessible columns and a responsive non-grid layout', async () => {
  const [app, styles] = await Promise.all([
    readFile(new URL('../matcher/app.js', import.meta.url), 'utf8'),
    readFile(new URL('../matcher/styles.css', import.meta.url), 'utf8'),
  ]);
  assert.match(app, /<table><thead><tr><th scope="col">Город<\/th>/);
  assert.match(app, /Тип города/);
  assert.match(app, /Расходы в мес/);
  assert.doesNotMatch(app, /Расходы \/ мес/);
  assert.match(app, /Холодный сезон/);
  assert.match(app, /Жаркий сезон/);
  assert.doesNotMatch(app, /❄︎|☀︎/);
  assert.match(app, /> ↕<\/span>/);
  assert.match(app, /reorderCityComparisonRows\(body, sourceCities, key, direction\)/);
  assert.doesNotMatch(app, /comparison\.tBodies/);
  assert.match(app, /formatCityTemperatureRange\(coldValue\)/);
  assert.match(app, /formatCityTemperatureRange\(hotValue\)/);
  assert.match(app, /aria-sort="none"/);
  assert.match(app, /data-city-sort/);
  assert.match(app, /badges = city\.categories\.filter/);
  assert.match(app, /badges\.map\(\(category\) => `<span>\$\{html\(category\)\}<\/span>`\)\.join\(''\)/);
  assert.doesNotMatch(app, /climateLine|climate\.notes_ru|Климат:/);
  assert.doesNotMatch(app, /city-budget-grid|city-card/);
  assert.match(styles, /html,body\{max-width:100%;overflow-x:clip\}/);
  assert.match(styles, /\.cities-comparison table\{[^}]*width:100%[^}]*border-collapse:collapse/);
  assert.match(styles, /\.city-role-list\{display:flex;flex-direction:column;align-items:flex-start/);
  assert.match(styles, /\.city-role-list span\{display:block\}/);
  assert.doesNotMatch(styles, /city-role-list[^\n]*·/);
  assert.doesNotMatch(styles, /\.city-role-list span\{[^}]*background:/);
  assert.match(styles, /\.cities-comparison th:not\(:first-child\)\{text-align:center\}/);
  assert.match(styles, /\.cities-comparison th button\{[^}]*justify-content:center[^}]*width:100%[^}]*text-align:center/);
  assert.match(styles, /\.city-cost\{[^}]*text-align:right!important/);
  assert.match(styles, /@media\(max-width:760px\)[\s\S]*\.cities-comparison tbody tr\{display:grid;grid-template-columns:1fr 1fr/);
  assert.match(styles, /@media\(max-width:600px\)\{\.secure-note\{display:none\}\}/);
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
  assert.match(app, new RegExp(`fetch\\(new URL\\(\`\\$\\{filename\\}\\?v=${version}\`, DATA_BASE\\)\\)`));
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
