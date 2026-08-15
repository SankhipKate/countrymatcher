import { STATUS_LABELS_RU } from '../js/engine/status-contract.js?v=7.1.2';
import { assertActiveResearchPackage, calculateActiveMatcher } from '../js/engine/rp4-engine.js?v=7.1.2';
import { loadCalculationContext } from '../pilot/fx-context.js?v=7.1.2';
import { countryOptions, parseCountryCode, searchCountries } from './countries.js?v=7.1.2';
import { formatCurrency } from './format.js?v=7.1.2';
import { applicationPresentationText, buildUserProfile, cityCategories, countryFlag, deduplicatedWorkRights, describeCityCostBasket, describeIncomeRequirement, describeResultIntro, formatTemperatureRange, resolveProvableAmount, russianMonths, sortCountriesForDisplay, sortRoutesForDisplay, uniqueRouteActions, validateAgainstSchema, validateUserProfile } from './profile.js?v=7.1.2';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const form = $('#matcherForm');
const steps = $$('.wizard-step');
const TOTAL_STEPS = steps.length;
const DRAFT_KEY = 'immigration-matcher-universal-draft-v3';
const ACTIVE_RP4_PACKAGES = [
  'ES-research-v4.0.json',
  'AR-research-v4.0.json',
  'UY-research-v4.0.json',
];
let currentStep = 1;
let activeResearchPackages = [];
let calculationContext;
let currentProfile;
let profileSchema;

const value = (id) => $(`#${id}`)?.value ?? '';
const checked = (id) => Boolean($(`#${id}`)?.checked);
const radio = (name) => $(`input[name="${name}"]:checked`)?.value || '';
const checkboxValues = (name) => $$(`input[name="${name}"]:checked`).map((input) => input.value);
const html = (text) => String(text ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
const currency = formatCurrency;
const officialFinancialPeriodSuffix = (period) => ({ MONTHLY: '/мес', ANNUAL: '/год' })[period] || '';
const INCOME_FIELDS = (prefix, title) => `<h3>${title}</h3><div class="field-grid two-col">
  <label class="field"><span>Тип дохода *</span><select id="${prefix}Type"><option value="" disabled selected hidden>Выберите</option><option value="REMOTE_EMPLOYMENT">Удалённая работа по трудовому договору</option><option value="CONTRACTOR">Контракт с заказчиком (без трудовых отношений)</option><option value="FREELANCE_OR_SELF_EMPLOYED">Фриланс или самозанятость</option><option value="SOLE_PROPRIETOR">ИП</option><option value="COMPANY_OWNER">Владелец компании</option><option value="LOCAL_EMPLOYMENT">Работа в стране назначения</option><option value="PENSION">Пенсия</option><option value="PASSIVE_INCOME">Пассивный доход</option><option value="INVESTMENT_INCOME">Инвестиционный доход</option><option value="OTHER_REGULAR_INCOME">Другой регулярный доход</option><option value="NO_REGULAR_INCOME">Регулярного дохода сейчас нет</option></select><small id="${prefix}IncomeTypeHelp"></small></label>
  <label class="field"><span>География источников дохода *</span><select id="${prefix}SourceScope"><option value="" disabled selected hidden>Выберите</option><option value="SINGLE_COUNTRY">Одна страна</option><option value="MULTIPLE_COUNTRIES">Несколько стран</option><option value="NO_STABLE_PAYER">Нет постоянного плательщика</option></select></label>
  <label id="${prefix}SourceCountryField" class="field" hidden><span>Страна источника *</span><input id="${prefix}SourceCountry" list="countryOptions" placeholder="Начните вводить название"><small>Указывается только при выборе одной страны.</small></label>
  <label class="field"><span>Ваш регулярный доход в месяц *</span><div class="money-combo"><input id="${prefix}TotalAmount" type="number" min="0"><select id="${prefix}Currency"><option>USD</option><option>EUR</option><option>RUB</option></select></div></label>
  <label class="field"><span>Какую часть дохода можете подтвердить документами? *</span><select id="${prefix}Evidence"><option value="" disabled selected hidden>Выберите</option><option value="FULL">Весь доход</option><option value="PARTIAL">Только часть</option><option value="NONE">Пока не могу подтвердить</option></select><small>Подтверждаемая сумма сравнивается с финансовым порогом программы.</small></label>
  <label id="${prefix}AmountField" class="field income-partial-field" hidden><span>Какую сумму сможете подтвердить? *</span><div class="money-combo money-combo-fixed-currency"><input id="${prefix}Amount" type="number" min="0"><span>в той же валюте</span></div></label>
</div>`;

$('#additionalIncomeBlock').innerHTML = INCOME_FIELDS('additional', 'Дополнительный доход заявителя');
$('#partnerIncomeBlock').innerHTML = INCOME_FIELDS('partner', 'Доход партнёра');
$('#countryOptions').innerHTML = countryOptions().map(({ label }) => `<option value="${html(label)}"></option>`).join('');

const PASSIVE_INCOME_HELP = 'Доход от сдачи недвижимости в аренду, дивиденды, проценты по вкладам и облигациям, купонный доход, роялти и другие регулярные выплаты от имущества или капитала. Не включает зарплату, фриланс и оплату личной работы.';
const PENSION_HELP = 'Регулярная государственная или частная пенсия либо аналогичная постоянная выплата за ранее оказанные услуги.';
const COMPANY_OWNER_HELP = 'Регулярные выплаты от собственной компании, которые можно подтвердить. Этот вид дохода учитывается в маршрутах для удалённой работы и владельцев иностранного бизнеса, если правила конкретной страны его допускают.';
function syncIncomeTypeHelp(prefix) {
  const help = $(`#${prefix}IncomeTypeHelp`);
  if (!help) return;
  const type = value(`${prefix}Type`);
  help.textContent = type === 'PASSIVE_INCOME' ? PASSIVE_INCOME_HELP : type === 'PENSION' ? PENSION_HELP : type === 'COMPANY_OWNER' ? COMPANY_OWNER_HELP : '';
}

function enhanceCountrySearch(input) {
  if (input.dataset.searchReady) return;
  input.dataset.searchReady = 'true';
  input.removeAttribute('list');
  input.setAttribute('autocomplete', 'off');
  const control = document.createElement('span');
  control.className = 'country-search-control';
  const menu = document.createElement('div');
  menu.className = 'country-search-results';
  menu.setAttribute('role', 'listbox');
  menu.hidden = true;
  input.insertAdjacentElement('beforebegin', control);
  control.append(input, menu);
  const render = () => {
    const matches = searchCountries(input.value);
    menu.replaceChildren(...matches.map((country) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.setAttribute('role', 'option');
      button.textContent = country.label;
      button.addEventListener('mousedown', (event) => {
        event.preventDefault();
        input.value = country.label;
        menu.hidden = true;
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
      return button;
    }));
    menu.hidden = matches.length === 0;
    if (!menu.hidden) {
      const rect = input.getBoundingClientRect();
      const availableBelow = window.innerHeight - rect.bottom;
      const menuHeight = Math.min(menu.scrollHeight, window.innerHeight * 0.45, 280);
      control.classList.toggle('opens-upward', availableBelow < menuHeight + 12 && rect.top > availableBelow);
    }
  };
  input.addEventListener('input', render);
  input.addEventListener('focus', render);
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      menu.hidden = true;
      control.classList.remove('opens-upward');
    }
  });
  input.addEventListener('blur', () => setTimeout(() => { menu.hidden = true; }, 100));
}

$$('input[list="countryOptions"]').forEach(enhanceCountrySearch);

const resolvedIncomeAmount = (prefix) => resolveProvableAmount(
  value(`${prefix}TotalAmount`),
  value(`${prefix}Evidence`),
  value(`${prefix}Amount`),
);

function collectAnswers() {
  const childAges = $$('#childAges input').map((input) => input.value);
  const inRussia = radio('inRussia') === 'YES';
  const applicationMethods = ['ANY'];
  return {
    inRussia, currentCountry: inRussia ? 'RU' : value('currentCountry'), currentStatus: inRussia ? 'CITIZENSHIP' : value('currentStatus'), applicationMethods,
    hasPartner: radio('partnerIncluded') === 'YES', partnerIncluded: radio('partnerIncluded') === 'YES', relationshipType: value('relationshipType'), applicantAge: value('applicantAge'), partnerAge: value('partnerAge'), lgbtEnabled: checked('lgbtEnabled'),
    childAges: radio('hasChildren') === 'YES' ? childAges : [],
    primaryType: value('primaryType'), primarySourceScope: value('primarySourceScope'), primarySourceCountry: value('primarySourceCountry'), primaryTotalAmount: value('primaryTotalAmount'), primaryAmount: resolvedIncomeAmount('primary'), primaryCurrency: value('primaryCurrency'), primaryEvidence: value('primaryEvidence'),
    hasAdditionalIncome: checked('hasAdditionalIncome'), additionalType: value('additionalType'), additionalSourceScope: value('additionalSourceScope'), additionalSourceCountry: value('additionalSourceCountry'), additionalTotalAmount: value('additionalTotalAmount'), additionalAmount: resolvedIncomeAmount('additional'), additionalCurrency: value('additionalCurrency'), additionalEvidence: value('additionalEvidence'),
    partnerHasIncome: checked('partnerHasIncome'), partnerType: value('partnerType'), partnerSourceScope: value('partnerSourceScope'), partnerSourceCountry: value('partnerSourceCountry'), partnerTotalAmount: value('partnerTotalAmount'), partnerAmount: resolvedIncomeAmount('partner'), partnerCurrency: value('partnerCurrency'), partnerEvidence: value('partnerEvidence'),
    longTermGoal: value('longTermGoal'), keepRuCitizenship: value('longTermGoal') === 'TEMPORARY_RESIDENCE_SUFFICIENT' ? 'NOT_REQUIRED' : (radio('keepRuCitizenship') || 'NOT_REQUIRED'),
    petTypes: radio('hasPets') === 'YES' ? ['DOG', 'CAT'] : ['NONE'], dogBreedChoice: null, dogBreed: null, otherPetNotes: null,
    specialCircumstances: ['NONE'], medicalEnabled: false, specificMedicineRequired: false, regularCareRequired: false, medicalDetails: '',
    routeSpecificAnswers: currentProfile?.route_specific_answers || {},
  };
}

function profile() { return buildUserProfile(collectAnswers()); }

function syncChildren() {
  const hasChildren = radio('hasChildren') === 'YES';
  const count = hasChildren ? Number(value('childrenCount') || 0) : 0;
  const existing = $$('#childAges input').map((input) => input.value);
  $('#childrenQuestionBlock').hidden = !hasChildren;
  $('#childAges').innerHTML = Array.from({ length: count }, (_, index) => `<label class="field"><span>Возраст ребёнка ${index + 1} *</span><input data-child-age type="number" min="0" max="25" value="${html(existing[index] || '')}" placeholder="Лет"></label>`).join('');
}

function syncConditional() {
  const inRussia = radio('inRussia') === 'YES';
  const partner = radio('partnerIncluded') === 'YES';
  $('#outsideRussiaBlock').hidden = inRussia || !radio('inRussia');
  $('#partnerBlock').hidden = !partner;
  $('#partnerAgeField').hidden = !partner;
  $('#partnerIncomeQuestion').hidden = !partner;
  $('#partnerIncomeBlock').hidden = !partner || !checked('partnerHasIncome');
  $('#additionalIncomeBlock').hidden = !checked('hasAdditionalIncome');
  $('#citizenshipRetentionBlock').hidden = !value('longTermGoal') || value('longTermGoal') === 'TEMPORARY_RESIDENCE_SUFFICIENT';
  for (const prefix of ['primary', 'additional', 'partner']) {
    const noIncome = value(`${prefix}Type`) === 'NO_REGULAR_INCOME';
    if (noIncome) {
      $(`#${prefix}SourceScope`).value = 'NO_STABLE_PAYER';
      $(`#${prefix}TotalAmount`).value = '0';
      $(`#${prefix}Currency`).value = 'USD';
      $(`#${prefix}Evidence`).value = 'NONE';
    }
    for (const id of [`${prefix}SourceScope`, `${prefix}TotalAmount`, `${prefix}Evidence`]) {
      const field = $(`#${id}`)?.closest('.field');
      if (field) field.hidden = noIncome;
    }
    const sourceField = $(`#${prefix}SourceCountryField`);
    if (sourceField) sourceField.hidden = noIncome || value(`${prefix}SourceScope`) !== 'SINGLE_COUNTRY';
    const partialField = $(`#${prefix}AmountField`);
    const partialInput = $(`#${prefix}Amount`);
    const showPartial = value(`${prefix}Evidence`) === 'PARTIAL';
    if (partialField) partialField.hidden = !showPartial;
    if (partialInput) partialInput.disabled = !showPartial;
    syncIncomeTypeHelp(prefix);
  }
}

function fieldError(ids, message) {
  const key = ids[0];
  const first = ids.map((id) => $(`#${id}`) || $(`[name="${id}"]`)).find(Boolean);
  return { first, key, message };
}

function clearInlineErrors() {
  $$('.inline-field-error').forEach((node) => node.remove());
  $$('.has-field-error').forEach((node) => node.classList.remove('has-field-error'));
}

function showInlineError(error) {
  clearInlineErrors();
  const control = error?.first;
  if (!control) return;
  const container = control.closest('fieldset, label.field, .conditional-card') || control.parentElement;
  container.classList.add('has-field-error');
  const message = document.createElement('p');
  message.className = 'inline-field-error';
  message.setAttribute('role', 'alert');
  message.textContent = error.message;
  container.append(message);
  control.focus();
  message.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function validateStep(step) {
  let error;
  if (step === 1 && !radio('inRussia')) error = fieldError(['inRussia'], 'Ответьте, находитесь ли вы сейчас в России.');
  else if (step === 1 && radio('inRussia') === 'NO' && !parseCountryCode(value('currentCountry'))) error = fieldError(['currentCountry'], 'Укажите страну, где вы сейчас находитесь.');
  else if (step === 1 && radio('inRussia') === 'NO' && !value('currentStatus')) error = fieldError(['currentStatus'], 'Укажите ваш легальный статус в этой стране.');
  if (step === 2) {
    if (!radio('partnerIncluded')) error = fieldError(['partnerIncluded'], 'Ответьте, переезжаете ли вы с партнёром.');
    else if (radio('partnerIncluded') === 'YES' && !value('relationshipType')) error = fieldError(['relationshipType'], 'Укажите, как оформлены отношения.');
    else if (!radio('hasChildren')) error = fieldError(['hasChildren'], 'Ответьте, переезжаете ли вы с детьми.');
    else if (radio('hasChildren') === 'YES' && (!Number.isInteger(Number(value('childrenCount'))) || Number(value('childrenCount')) < 1 || Number(value('childrenCount')) > 12)) error = fieldError(['childrenCount'], 'Укажите количество детей от 1 до 12.');
    else if ($$('#childAges input').some((input) => input.value === '' || Number(input.value) < 0 || Number(input.value) > 25)) error = fieldError(['childAges'], 'Укажите возраст каждого ребёнка от 0 до 25 лет.');
    else if (!radio('hasPets')) error = fieldError(['hasPets'], 'Ответьте, переезжают ли с вами домашние животные.');
  }
  const incomeError = (prefix) => {
    if (!value(`${prefix}Type`)) return fieldError([`${prefix}Type`], 'Укажите тип дохода.');
    if (value(`${prefix}Type`) === 'NO_REGULAR_INCOME') return null;
    if (!value(`${prefix}SourceScope`)) return fieldError([`${prefix}SourceScope`], 'Укажите географию источников дохода.');
    if (value(`${prefix}SourceScope`) === 'SINGLE_COUNTRY' && !parseCountryCode(value(`${prefix}SourceCountry`))) return fieldError([`${prefix}SourceCountry`], 'Укажите страну источника дохода.');
    if (value(`${prefix}TotalAmount`).trim() === '' || Number(value(`${prefix}TotalAmount`)) <= 0) return fieldError([`${prefix}TotalAmount`], 'Укажите ваш регулярный доход.');
    const evidence = value(`${prefix}Evidence`);
    if (!evidence) return fieldError([`${prefix}Evidence`], 'Выберите, какую часть дохода можете подтвердить.');
    if (evidence === 'PARTIAL') {
      const partial = value(`${prefix}Amount`);
      if (partial.trim() === '' || Number(partial) <= 0) return fieldError([`${prefix}Amount`], 'Укажите сумму, которую сможете подтвердить.');
      if (Number(partial) > Number(value(`${prefix}TotalAmount`))) return fieldError([`${prefix}Amount`], 'Подтверждаемая сумма не может быть больше общего дохода.');
    }
    return null;
  };
  if (step === 3) error = incomeError('primary') || (checked('hasAdditionalIncome') ? incomeError('additional') : null) || (radio('partnerIncluded') === 'YES' && checked('partnerHasIncome') ? incomeError('partner') : null);
  if (step === 4 && !value('longTermGoal')) error = fieldError(['longTermGoal'], 'Выберите долгосрочную цель.');
  else if (step === 4 && value('longTermGoal') !== 'TEMPORARY_RESIDENCE_SUFFICIENT' && !radio('keepRuCitizenship')) error = fieldError(['keepRuCitizenship'], 'Укажите, обязательно ли сохранить гражданство РФ.');
  const root = $('#formError');
  root.hidden = true;
  root.textContent = '';
  if (error) showInlineError(error); else clearInlineErrors();
  return !error;
}

function showStep(step, scroll = true) {
  currentStep = Math.max(1, Math.min(TOTAL_STEPS, step));
  steps.forEach((section, index) => { section.hidden = index + 1 !== currentStep; section.classList.toggle('is-active', index + 1 === currentStep); });
  $('#stepLabel').textContent = `Шаг ${currentStep} из ${TOTAL_STEPS}`;
  $('#progressBar').style.width = `${currentStep / TOTAL_STEPS * 100}%`;
  $('#prevStep').hidden = currentStep === 1;
  $('#nextStep').hidden = currentStep === TOTAL_STEPS;
  $('#calculate').hidden = currentStep !== TOTAL_STEPS;
  $('#formError').hidden = true;
  clearInlineErrors();
  renderProfileSummary(profile());
  if (scroll) form.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function familyLabel(p, allowPending = false) {
  if (allowPending && (!radio('partnerIncluded') || !radio('hasChildren'))) return 'Не указан';
  const adults = `${p.family.adults_count} ${p.family.adults_count === 1 ? 'взрослый' : 'взрослых'}`;
  const children = p.family.children.length;
  return children ? `${adults}, ${children} ${children === 1 ? 'ребёнок' : 'детей'}` : adults;
}

function renderProfileSummary(p) {
  const rows = [
    ['Гражданство', 'РФ'], ['Семья', familyLabel(p, true)],
    ['Доход', p.income.primary.monthly_provable?.amount ? `${p.income.primary.monthly_provable.amount} ${p.income.primary.monthly_provable.currency}/мес` : 'Не указан'],
    ['Цель', value('longTermGoal') ? $('#longTermGoal').selectedOptions[0].textContent : 'Не указана'],
  ];
  $('#profileSummary').innerHTML = rows.map(([label, val]) => `<div class="summary-row"><span>${html(label)}</span><b>${html(val)}</b></div>`).join('');
}

function statusClass(status) { return status === 'SUITABLE' ? 'positive' : status === 'SUITABLE_WITH_CONDITIONS' ? 'conditional' : 'negative'; }

function renderLgbtResearch(calculation) {
  if (!calculation.lgbt) return '';
  const rows = calculation.lgbt.rows || [];
  const legalPosition = calculation.lgbt.legalPosition;
  const practicalEnvironment = calculation.lgbt.practicalEnvironment;
  if (!legalPosition || !practicalEnvironment) return '';
  const practicalExplanation = calculation.lgbt.practicalExplanation || 'Оценка основана на правовом положении, применении норм и возможности открыто жить парой.';
  const loyalCities = Array.isArray(calculation.lgbt.loyalCities) ? calculation.lgbt.loyalCities : [];
  const pendingChanges = Array.isArray(calculation.lgbt.pendingChanges) ? calculation.lgbt.pendingChanges : [];
  const changesBlock = pendingChanges.length
    ? `<div class="lgbt-row"><h4>Что меняется</h4>${pendingChanges.map((change) => `<p>${html(change.summary_ru || change)}</p>`).join('')}</div>`
    : '';
  const citiesBlock = practicalEnvironment === 'Неоднородная' && loyalCities.length
    ? `<div class="lgbt-row"><h4>Наиболее лояльные города</h4><p>${html(loyalCities.join(', '))}</p></div>` : '';
  return `<section class="lgbt-research"><div class="section-title-row"><div><h3>ЛГБТ: права, семья и практическая среда</h3><p>Оценки описывают право и среду, но не являются гарантией личной безопасности.</p></div></div><div class="lgbt-assessment-grid"><div><span>Правовое положение</span><b>${html(legalPosition)}</b></div><div><span>Практическая среда</span><b>${html(practicalEnvironment)}</b></div></div><p class="research-caveat">${html(practicalExplanation)}</p><div class="lgbt-list">${rows.map(([title, text]) => `<div class="lgbt-row"><h4>${html(title)}</h4><p>${html(text)}</p></div>`).join('')}${citiesBlock}${changesBlock}</div></section>`;
}

const publicSchoolAccessLabel = (value) => ({
  AVAILABLE: 'доступно',
  CONDITIONAL: 'доступно с условиями',
  NOT_AVAILABLE: 'недоступно',
  NOT_RESEARCHED: 'не исследовано',
})[value] || 'не исследовано';

const schoolTuitionPeriodLabel = (period) => ({
  ONE_TIME: 'единовременно',
  MONTHLY: '/мес',
  ANNUAL: '/год',
  ACADEMIC_YEAR: '/учебный год',
  SEMESTER: '/семестр',
  TERM: '/учебный период',
  WEEKLY: '/неделю',
  DAILY: '/день',
})[period] || '';

function renderSchoolPresentation(calculation) {
  const school = calculation.schoolPresentation;
  if (!school) return '';
  const rules = school.public.rules.map((rule) => {
    const age = rule.compulsoryAgeMin == null || rule.compulsoryAgeMax == null
      ? 'не подтверждён'
      : `${rule.compulsoryAgeMin}–${rule.compulsoryAgeMax} лет`;
    const fee = rule.isFree === true ? 'бесплатно'
      : rule.isFree === false ? rule.tuition?.amount != null
        ? `${currency(rule.tuition.amount, rule.tuition.currency)} ${schoolTuitionPeriodLabel(rule.tuition.period)}`.trim()
        : 'платно'
      : 'не подтверждено';
    return `<div class="school-rule"><h5>${html(rule.jurisdiction)}</h5><p><b>Доступ иностранным детям:</b> ${html(publicSchoolAccessLabel(rule.foreignChildAccess))}</p><p><b>Язык обучения:</b> ${html(rule.language)}</p><p><b>Обязательное обучение:</b> ${html(age)}</p><p><b>Стоимость:</b> ${html(fee)}</p></div>`;
  }).join('');
  const international = school.international.status === 'AVAILABLE'
    ? school.international.cities.length
      ? `Подтверждены в: ${school.international.cities.map(html).join(', ')}.`
      : 'Наличие подтверждено.'
    : school.international.status === 'RESEARCHED_NONE_FOUND'
      ? 'В ходе исследования международные школы с обучением на английском не найдены.'
      : 'Данных о международных школах с обучением на английском пока недостаточно.';
  const tuition = school.international.tuitionRangeUsd;
  const tuitionAmount = tuition ? tuition.minimum === tuition.maximum
    ? currency(tuition.minimum, 'USD')
    : `${currency(tuition.minimum, 'USD')}–${currency(tuition.maximum, 'USD')}` : null;
  const tuitionLines = tuitionAmount
    ? `<p>Стоимость по найденным школам: ${html(tuitionAmount)} в год.</p><p>Вступительные и регистрационные взносы не включены.</p>` : '';
  return `<section class="school-research"><div class="section-title-row"><div><h3>Школы</h3></div></div><div class="school-subsection"><h4>Государственные школы</h4>${rules || '<p>Данных о государственных школах пока недостаточно.</p>'}</div><div class="school-subsection"><h4>Международные школы с обучением на английском</h4><p>${international}</p>${tuitionLines}</div></section>`;
}

function renderEntryPresentation(calculation) {
  const entry = calculation.entryForRussianCitizen;
  const lines = entry ? [
    entry.visaRequired === true ? 'Виза: требуется.' : entry.visaRequired === false ? 'Виза: не требуется.' : null,
    entry.maximumStayDays != null ? `Максимальный срок пребывания: ${entry.maximumStayDays} дней.` : null,
    String(entry.processingTime || '').trim() ? `Срок оформления: ${entry.processingTime}` : null,
    entry.rule,
  ].filter(Boolean) : [];
  return lines.length ? `<div class="route-requirements practical-warning"><h4>Въезд для граждан РФ</h4>${lines.map((line) => `<p>${html(line)}</p>`).join('')}</div>` : '';
}

function renderPetPresentation(calculation) {
  const pets = calculation.petPresentation;
  if (!pets) return '';
  const lines = [
    pets.importText ? `<p><b>Ввоз в страну:</b> ${html(pets.importText)}</p>` : '',
    pets.afterEntryText ? `<p><b>После въезда:</b> ${html(pets.afterEntryText)}</p>` : '',
  ].filter(Boolean).join('');
  return lines ? `<section><div class="section-title-row"><div><h3>Домашние животные</h3></div></div>${lines}</section>` : '';
}

function longTermConditions(route) {
  if (!route.longTerm) return "";
  const items = [route.longTerm.renewal, route.longTerm.permanentResidence, route.longTerm.citizenship, route.longTerm.presence, route.longTerm.language].filter(Boolean);
  return items.length ? `<div class="route-client-items"><h4>Долгосрочная перспектива</h4><ul>${items.map((item) => `<li>${html(item)}</li>`).join("")}</ul></div>` : "";
}

function routeCard(route, countryName, main = false) {
  const unsuitable = route.routeStatus === "UNSUITABLE";
  const list = (items = []) => `<ul>${items.map((item) => `<li>${html(item)}</li>`).join("")}</ul>`;
  const blockersBlock = route.blockers?.length ? `<div class="route-reasons"><h4>Почему не подходит</h4>${list(route.blockers)}</div>` : "";
  const formatFinancialAlternative = (item) => {
    const official = `${currency(item.threshold, item.currency)}${officialFinancialPeriodSuffix(item.period)}`;
    const equivalent = item.currency !== "USD" && item.thresholdUsd != null ? ` (≈ ${currency(item.thresholdUsd, "USD")}${officialFinancialPeriodSuffix(item.period)})` : "";
    return `${String(item.kindLabel || '').toLocaleLowerCase('ru')} ${official}${equivalent}`.trim();
  };
  const conditionActions = route.conditionActions?.length
    ? route.conditionActions
    : (route.conditions || []).map((text) => ({ text, requirementId: null, financialSummary: null }));
  const financialActionSeen = new Set();
  const actionItems = conditionActions.map((action) => {
    const alternatives = action.requirementId && !financialActionSeen.has(action.requirementId)
      ? action.financialSummary?.alternatives?.filter((item) => item.threshold != null) || [] : [];
    if (alternatives.length) financialActionSeen.add(action.requirementId);
    return alternatives.length
      ? `${String(action.text).replace(/[.;:\s]+$/u, '')} — ${alternatives.map(formatFinancialAlternative).join(' или ')}.`
      : action.text;
  });
  const actionsBlock = route.routeStatus === "SUITABLE_WITH_CONDITIONS" && actionItems.length
    ? `<div class="route-actions"><h4>Что нужно выполнить, чтобы маршрут подходил</h4>${list(actionItems)}</div>` : "";
  const preparation = route.displayOnlyRequirements?.map((item) => item.condition_ru) || [];
  const preparationBlock = preparation.length ? `<div class="route-requirements"><h4>Что понадобится подтвердить при подаче</h4>${list(preparation)}</div>` : "";
  const financialRequirements = route.financialRequirements || (route.financialSummary ? [{ requirementId: null, effect: 'NONE', summary: route.financialSummary }] : []);
  const financialItems = financialRequirements.filter(({ effect }) => effect !== 'CONDITION').flatMap(({ summary }) =>
    summary.alternatives?.filter((item) => item.threshold != null).map((item) => `${item.requirementLabel || item.kindLabel} — ${formatFinancialAlternative(item)}`) || []);
  const financeBlock = financialItems.length ? `<div class="route-requirements financial-rule"><h4>Финансовое требование</h4>${list(financialItems)}</div>` : "";
  const practicalPeriod = { MONTHLY: 'в месяц', YEARLY: 'в год', ONE_TIME: 'единовременно', OTHER: '' };
  const practicalEvidenceLabel = {
    PRACTITIONER_GUIDANCE: 'Практическая рекомендация специалиста',
    REPORTED_PRACTICE: 'Опубликованная практика',
    INDIVIDUAL_CASE: 'Индивидуальный кейс',
  };
  const formatPracticalSourceDate = (sourceDate) => {
    const [year, month, day] = sourceDate.split('-');
    return `${day}.${month}.${year}`;
  };
  const practicalGuidanceItems = route.financialSummary?.alternatives
    ?.filter((item) => item.state !== 'FAIL' && item.practicalGuidance)
    .map((item) => item.practicalGuidance) || [];
  const practicalGuidanceBlock = !unsuitable && practicalGuidanceItems.length ? `<div class="route-requirements practical-warning"><h4>Практический финансовый ориентир</h4>${practicalGuidanceItems.map((guidance) => {
    if (guidance.status === 'NOT_FOUND') return `<p>${html(guidance.summary_ru)}</p><p>Официального фиксированного порога нет; надёжную практическую сумму найти не удалось.</p><p>${html(guidance.disclaimer_ru)}</p>`;
    const figures = guidance.figures.map((figure) => {
      const number = (value) => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(value);
      const value = figure.amount != null
        ? `Около ${number(figure.amount)} ${figure.currency}`
        : `${number(figure.amount_min)}–${number(figure.amount_max)} ${figure.currency}`;
      const period = practicalPeriod[figure.period] ? ` ${practicalPeriod[figure.period]}` : '';
      const evidenceLines = figure.evidence.map((evidence) => {
        const label = practicalEvidenceLabel[evidence.evidence_type];
        const sourceDate = formatPracticalSourceDate(evidence.source_date);
        return `${html(label)} · Дата источника: ${html(sourceDate)}.`;
      }).join('<br>');
      return `<li><b>${html(value)}${html(period)}</b> — ${html(figure.family_context_ru)}.<br>${evidenceLines}<br>${html(figure.note_ru)}</li>`;
    }).join('');
    return `<p>${html(guidance.summary_ru)}</p><ul>${figures}</ul><p><b>Это не официальный минимальный порог.</b> ${html(guidance.disclaimer_ru)}</p>`;
  }).join('')}</div>` : "";
  const applicationItems = route.application?.map(applicationPresentationText) || [];
  const applicationBlock = applicationItems.length ? `<div class="route-requirements"><h4>Как можно подать заявление</h4>${list(applicationItems)}</div>` : "";
  const firstPermitBlock = route.firstPermit?.description ? `<div class="route-requirements"><h4>Первый статус</h4><p>${html(route.firstPermit.description)}</p>${route.firstPermit.months != null ? `<p>Срок первого разрешения: ${html(russianMonths(route.firstPermit.months))}.</p>` : ''}</div>` : "";
  const applicableFamily = route.familyEvaluation?.state === 'NOT_APPLICABLE' ? []
    : (route.family || []).filter((item) => route.familyEvaluation?.applicableScenarioIds?.includes(item.scenarioId));
  const familyBlock = applicableFamily.length ? `<div class="route-requirements"><h4>Семья</h4>${list(applicableFamily.map((item) => item.description))}</div>` : "";
  const workItems = deduplicatedWorkRights(route.workRights);
  const workBlock = workItems.length ? `<div class="route-requirements"><h4>Право на работу</h4>${list(workItems)}</div>` : "";
  const processingBlock = route.processing?.officialRule ? `<div class="route-requirements"><h4>Срок рассмотрения</h4><p>${html(route.processing.officialRule)}</p></div>` : "";
  const sourceBlock = route.officialSource?.url ? `<p class="route-source"><a href="${html(route.officialSource.url)}" target="_blank" rel="noopener">Официальный источник: ${html(route.officialSource.title)}</a></p>` : "";
  const header = `<div class="route-card-heading"><span class="status-pill ${statusClass(route.routeStatus)}">${html(STATUS_LABELS_RU[route.routeStatus])}</span><div class="route-title-content"><h3>${html(route.routeName)}</h3>${route.routeOfficialName ? `<p class="route-official-name">${html(route.routeOfficialName)}</p>` : ""}${main ? `<span class="best-route-label">Лучший маршрут исходя из ваших ответов</span>` : ''}<span class="route-expand-label"><span class="when-closed">Показать подробности</span><span class="when-open">Скрыть подробности</span></span></div></div>`;
  const descriptionBlock = route.description ? `<div class="route-requirements"><h4>Что это за маршрут</h4><p>${html(route.description)}</p></div>` : "";
  const body = `${descriptionBlock}${financeBlock}${practicalGuidanceBlock}${actionsBlock}${preparationBlock}${applicationBlock}${firstPermitBlock}${familyBlock}${workBlock}${longTermConditions(route)}${processingBlock}${sourceBlock}`;
  return `<article class="route-result ${main ? 'best' : 'compact'}"><details${main ? ' open' : ''}><summary>${header}</summary><div class="route-card-body">${unsuitable ? blockersBlock : body}</div></details></article>`;
}

function countryPresentation(calculation) {
  const sortedRoutes = sortRoutesForDisplay(calculation.routes);
  const best = sortedRoutes[0] || calculation.bestRoute;
  const countryId = calculation.country.countryId;
  return {
    sortedRoutes,
    best,
    countryId,
    countryName: calculation.country.name,
    flag: countryFlag(countryId),
  };
}

function renderCountryTab(calculation, active = false) {
  const { best, countryId, countryName, flag } = countryPresentation(calculation);
  const summary = best ? '' : '<small>Нет маршрутов для надёжной оценки</small>';
  const status = best ? `<span class="status-pill ${statusClass(best.routeStatus)}">${html(STATUS_LABELS_RU[best.routeStatus])}</span>` : '';
  return `<button class="country-tab${active ? ' is-active' : ''}" type="button" role="tab" data-country-tab="${html(countryId)}" aria-controls="country-panel-${html(countryId)}" aria-selected="${active}"><span class="country-tab-flag" aria-hidden="true">${flag}</span><span class="country-tab-copy"><strong>${html(countryName)}</strong>${summary}</span>${status}</button>`;
}

function renderCountryResult(calculation, changed = false, active = false) {
  const { sortedRoutes, best, countryId, countryName, flag } = countryPresentation(calculation);
  const children = calculation.profile.children?.length || 0;
  const family = `${calculation.profile.adults} ${calculation.profile.adults === 1 ? 'взрослый' : 'взрослых'}${children ? `, ${children} ${children === 1 ? 'ребёнок' : 'детей'}` : ''}`;
  const { routeLabel } = describeResultIntro(calculation.routes, changed);
  if (!sortedRoutes.length || !best) return `<article id="country-panel-${html(countryId)}" class="country-detail-panel" role="tabpanel" data-country-panel="${html(countryId)}"${active ? '' : ' hidden'}><div class="country-result-banner"><span class="country-flag" aria-hidden="true">${flag}</span><div class="country-summary-text"><h2>${html(countryName)}</h2><p>${html(routeLabel)}</p></div></div></article>`;
  const incomeCurrency = calculation.country.resultCurrency || 'USD';
  const incomeAmount = calculation.applicantProvableIncome?.amount;
  const incomeUsd = calculation.applicantProvableIncome?.amountUsd;
  const primaryFinancial = best?.financialSummary?.alternatives?.find((item) => item.kind === 'INCOME')
    || best?.financialSummary?.alternatives?.find((item) => item.threshold != null);
  const thresholdLabel = 'Финансовый порог';
  const thresholdValue = primaryFinancial?.threshold != null
    ? `${currency(primaryFinancial.threshold, primaryFinancial.currency)}${officialFinancialPeriodSuffix(primaryFinancial.period)}`
    : 'Числовой порог не применяется';
  const incomeValue = incomeAmount == null ? 'Не указан' : `${currency(incomeAmount, incomeCurrency)}${incomeCurrency !== 'USD' && Number.isFinite(incomeUsd) ? ` (≈ ${currency(incomeUsd, 'USD')})` : ''}`;
  const entryBlock = renderEntryPresentation(calculation);
  const comparisonCities = (calculation.cities || []).map((city) => ({
        name: city.cityName,
        size: city.populationCategory,
        roles: [...(city.roles || []), ...(city.labels || [])],
        categories: cityCategories(city.populationCategory, [...(city.roles || []), ...(city.labels || [])]),
        comparisonCost: city.comparisonCostUsd,
        comparisonComponents: city.comparisonComponents,
        comparisonScenarios: city.comparisonScenarios,
        coldRange: city.coldRange,
        hotRange: city.hotRange,
        avgTempColdestMonthC: city.avgTempColdestMonthC,
        avgTempHottestMonthC: city.avgTempHottestMonthC,
        climate: city.climate,
      }));
  const comparisonComponents = comparisonCities[0]?.comparisonComponents || [];
  const basketDescription = `<p class="research-caveat">${html(describeCityCostBasket(comparisonComponents, comparisonCities[0]?.comparisonScenarios))}</p>`;
  const citySection = comparisonCities.length
    ? `<h4>Расходы по городам</h4>${basketDescription}<div class="city-budget-grid climate-grid">${comparisonCities.map((city) => {
        const comparisonCost = Number.isFinite(city.comparisonCost) ? Math.round(city.comparisonCost) : null;
        const coldValue = city.coldRange ?? city.avgTempColdestMonthC;
        const hotValue = city.hotRange ?? city.avgTempHottestMonthC;
        const coldLine = coldValue != null ? `<span>Холодный период: <b>${html(formatTemperatureRange(coldValue))}</b></span>` : '';
        const hotLine = hotValue != null ? `<span>Жаркий период: <b>${html(formatTemperatureRange(hotValue))}</b></span>` : '';
        const climateLine = city.climate ? `<span>Климат: <b>${html(city.climate)}</b></span>` : '';
        const costLine = comparisonCost == null ? '' : `<strong>≈ ${currency(comparisonCost)}/мес</strong>`;
        return `<article class="city-card"><div class="city-role-list">${city.categories.map((category) => `<span>${html(category)}</span>`).join('')}</div><h4>${html(city.name)}</h4>${costLine}${climateLine}${coldLine}${hotLine}</article>`;
      }).join('')}</div>`
    : '<p>Для этой страны пока нет городской модели.</p>';
  return `<article id="country-panel-${html(countryId)}" class="country-detail-panel" role="tabpanel" data-country-panel="${html(countryId)}"${active ? '' : ' hidden'}><div class="country-result-banner"><span class="country-flag" aria-hidden="true">${flag}</span><div class="country-summary-text"><h2>${html(countryName)}</h2><p>${routeLabel}: <b>${html(best?.routeName || 'не определён')}</b></p></div></div><div class="country-comparison-body">
    <div class="kpi-grid three"><div class="kpi"><span>Состав семьи</span><b>${html(family)}</b></div><div class="kpi"><span>Подтверждаемый доход</span><b>${incomeValue}</b></div><div class="kpi"><span>${thresholdLabel}</span><b>${thresholdValue}</b></div></div>
    <section><div class="section-title-row"><div><h3>Все проверенные варианты</h3></div></div><div class="alternative-routes">${sortedRoutes.map((route) => routeCard(route, countryName, route.routeId === best?.routeId)).join('')}</div></section>
    ${entryBlock}
    <section><div class="section-title-row"><div><h3>Города, климат и расходы</h3></div></div>${citySection}</section>
    ${renderSchoolPresentation(calculation)}
    ${renderLgbtResearch(calculation)}${renderPetPresentation(calculation)}</div></article>`;
}

function calculateActiveCountries() {
  return calculateActiveMatcher(currentProfile, activeResearchPackages, calculationContext);
}

function renderResult(calculation, changed = false) {
  const countries = sortCountriesForDisplay(calculation.results || []);
  const calculatedAt = countries[0]?.calculatedAt?.slice(0, 10) || calculationContext.calculation_date?.slice(0, 10);
  const calculationNote = `<p class="result-note">Юридические правила маршрутов проверены по указанным источникам. Расчёт: ${html(calculatedAt)}. Курс валют: ${html(calculationContext.fx.as_of?.slice(0, 10))}, источник ${html(calculationContext.fx.source)}. Результат предварительный и не является юридическим обещанием.</p>`;
  $('#result').innerHTML = `<div class="country-workspace"><nav class="country-tabs" role="tablist" aria-label="Страны">${countries.map((country, index) => renderCountryTab(country, index === 0)).join('')}</nav><div class="country-detail-pane">${countries.map((country, index) => renderCountryResult(country, changed, index === 0)).join('')}</div></div>${calculationNote}`;
  const activateCountry = (countryId) => {
    $$('[data-country-tab]', $('#result')).forEach((tab) => {
      const active = tab.dataset.countryTab === countryId;
      tab.classList.toggle('is-active', active);
      tab.setAttribute('aria-selected', String(active));
    });
    $$('[data-country-panel]', $('#result')).forEach((panel) => { panel.hidden = panel.dataset.countryPanel !== countryId; });
    requestAnimationFrame(() => {
      $('.country-workspace', $('#result'))?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    });
  };
  $$('[data-country-tab]', $('#result')).forEach((tab) => tab.addEventListener('click', () => activateCountry(tab.dataset.countryTab)));
}

function switchToResult(calculation, changed = false) {
  renderResult(calculation, changed);
  $('#questionnaireView').hidden = true;
  $('#resultView').hidden = false;
  $('#heroTitle').textContent = 'Ваш результат';
  $('#heroSubtitle').textContent = 'По вашим ответам рассчитаны доступные варианты переезда и условия для семьи.';
  $('#editProfile').hidden = false;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function showToast(message) { const toast = $('#toast'); toast.textContent = message; toast.hidden = false; clearTimeout(showToast.timer); showToast.timer = setTimeout(() => { toast.hidden = true; }, 2600); }

function draft() { return { version: 3, savedAt: new Date().toISOString(), answers: collectAnswers() }; }

function setRadio(name, val) { const input = $(`input[name="${name}"][value="${CSS.escape(String(val))}"]`); if (input) input.checked = true; }
function setCheckboxes(name, values = []) { $$(`input[name="${name}"]`).forEach((input) => { input.checked = values.includes(input.value); }); }

function restoreDraft() {
  try {
    const stored = JSON.parse(localStorage.getItem(DRAFT_KEY));
    if (stored?.version !== 3 || !stored.answers) return false;
    const a = stored.answers;
    const simple = ['currentCountry','currentStatus','relationshipType','applicantAge','partnerAge','primaryType','primarySourceScope','primarySourceCountry','primaryTotalAmount','primaryAmount','primaryCurrency','primaryEvidence','additionalType','additionalSourceScope','additionalSourceCountry','additionalTotalAmount','additionalAmount','additionalCurrency','additionalEvidence','partnerType','partnerSourceScope','partnerSourceCountry','partnerTotalAmount','partnerAmount','partnerCurrency','partnerEvidence','longTermGoal'];
    simple.forEach((id) => { if ($(`#${id}`) && a[id] != null) $(`#${id}`).value = a[id]; });
    setRadio('inRussia', a.inRussia || parseCountryCode(a.currentCountry) === 'RU' ? 'YES' : 'NO'); setRadio('partnerIncluded', a.partnerIncluded ? 'YES' : 'NO'); setRadio('hasChildren', a.childAges?.length ? 'YES' : 'NO'); setRadio('hasPets', a.petTypes?.[0] && a.petTypes[0] !== 'NONE' ? 'YES' : 'NO'); setRadio('keepRuCitizenship', a.keepRuCitizenship);
    ['lgbtEnabled','hasAdditionalIncome','partnerHasIncome'].forEach((id) => { if ($(`#${id}`)) $(`#${id}`).checked = Boolean(a[id]); });
    $('#childrenCount').value = a.childAges?.length ? String(a.childAges.length) : ''; syncChildren(); $$('#childAges input').forEach((input, index) => { input.value = a.childAges[index] ?? ''; });
    currentProfile = a.routeSpecificAnswers ? { route_specific_answers: a.routeSpecificAnswers } : null;
    syncConditional(); return true;
  } catch { localStorage.removeItem(DRAFT_KEY); return false; }
}

function clearAll() { localStorage.removeItem(DRAFT_KEY); form.reset(); $('#childAges').innerHTML = ''; currentProfile = null; syncChildren(); syncConditional(); showStep(1, false); showToast('Анкета очищена'); }

$('#gateYes').addEventListener('click', () => { $('#citizenshipGate').hidden = true; $('#questionnaireView').hidden = false; showStep(1); });
$('#gateNo').addEventListener('click', () => { $('#gateNotice').hidden = false; $('#gateNotice').focus(); });
$('#nextStep').addEventListener('click', () => { if (validateStep(currentStep)) showStep(currentStep + 1); });
$('#prevStep').addEventListener('click', () => showStep(currentStep - 1));
$('#childrenCount').addEventListener('input', () => { syncChildren(); renderProfileSummary(profile()); });
form.addEventListener('change', (event) => { if (event.target?.name === 'hasChildren') syncChildren(); syncConditional(); renderProfileSummary(profile()); });
form.addEventListener('input', () => renderProfileSummary(profile()));
form.addEventListener('submit', (event) => {
  event.preventDefault();
  if (!validateStep(currentStep) || !activeResearchPackages.length || !calculationContext) return;
  currentProfile = profile();
  const validation = validateUserProfile(currentProfile);
  if (!validation.valid) { $('#formError').hidden = false; $('#formError').textContent = validation.errors[0].message; return; }
  const schemaErrors = validateAgainstSchema(currentProfile, profileSchema);
  if (schemaErrors.length) { $('#formError').hidden = false; $('#formError').textContent = `Проверьте ответы: ${schemaErrors[0].message}`; return; }
  try { switchToResult(calculateActiveCountries()); }
  catch (error) { $('#formError').hidden = false; $('#formError').textContent = `Не удалось выполнить расчёт: ${error.message}`; }
});
$('#saveDraft').addEventListener('click', () => { localStorage.setItem(DRAFT_KEY, JSON.stringify(draft())); showToast('Ответы сохранены только в этом браузере. Можно вернуться позже.'); });
$('#clearDraft').addEventListener('click', clearAll);
$('#editProfile').addEventListener('click', () => { $('#resultView').hidden = true; $('#questionnaireView').hidden = false; $('#heroTitle').textContent = 'Подберём вариант иммиграции'; $('#heroSubtitle').textContent = 'Ответьте на вопросы о вашей ситуации — анкета рассчитает доступные страны и программы.'; $('#editProfile').hidden = true; showStep(1); });

async function init() {
  restoreDraft(); syncChildren(); syncConditional(); showStep(1, false);
  try {
    const [packages, schemaResponse, context] = await Promise.all([
      Promise.all(ACTIVE_RP4_PACKAGES.map(async (filename) => {
        const response = await fetch(`../data/${filename}?v=7.1.2`);
        if (!response.ok) throw new Error(`HTTP ${response.status}: ${filename}`);
        const pkg = await response.json();
        assertActiveResearchPackage(pkg);
        return pkg;
      })),
      fetch('../data/schemas/user-profile-v1.schema.json?v=7.1.2'),
      loadCalculationContext(),
    ]);
    if (!schemaResponse.ok) throw new Error(`HTTP ${schemaResponse.status}: user-profile schema`);
    activeResearchPackages = packages;
    profileSchema = await schemaResponse.json();
    calculationContext = context;
  } catch (error) {
    $('#formError').hidden = false;
    $('#formError').textContent = error.code === 'CALCULATION_CONTEXT_INCOMPLETE' ? 'Расчёт временно недоступен: не удалось получить актуальный курс валют.' : `Не удалось загрузить данные: ${error.message}`;
  }
}

init();
