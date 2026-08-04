import { STATUS_LABELS_RU } from '../js/spain-calculator.js?v=7.1.1';
import { calculateCountries } from '../js/engine/calculate-countries.js?v=7.1.1';
import { spainAdapter } from '../js/countries/spain-adapter.js?v=7.1.1';
import { argentinaAdapter } from '../js/countries/argentina-adapter.js?v=7.1.1';
import { paraguayAdapter } from '../js/countries/paraguay-adapter.js?v=7.1.1';
import { portugalAdapter } from '../js/countries/portugal-adapter.js?v=7.1.1';
import { mexicoAdapter } from '../js/countries/mexico-adapter.js?v=7.1.1';
import { brazilAdapter } from '../js/countries/brazil-adapter.js?v=7.1.1';
import { loadCalculationContext } from '../pilot/fx-context.js?v=7.1.1';
import { countryOptions, parseCountryCode, searchCountries } from './countries.js?v=7.1.1';
import { formatCurrency } from './format.js?v=7.1.1';
import { buildUserProfile, describeIncomeRequirement, describeResultIntro, enrichCityCategories, formatTemperatureRange, resolveProvableAmount, sortCountriesForDisplay, sortRoutesForDisplay, uniqueRouteActions, validateAgainstSchema, validateUserProfile } from './profile.js?v=7.1.1';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const form = $('#matcherForm');
const steps = $$('.wizard-step');
const TOTAL_STEPS = steps.length;
const DRAFT_KEY = 'immigration-matcher-universal-draft-v2';
let currentStep = 1;
let spainData;
let uruguayData;
let argentinaData;
let paraguayData;
let portugalData;
let mexicoData;
let brazilData;
let calculationContext;
let currentProfile;
let profileSchema;

const value = (id) => $(`#${id}`)?.value ?? '';
const checked = (id) => Boolean($(`#${id}`)?.checked);
const radio = (name) => $(`input[name="${name}"]:checked`)?.value || '';
const checkboxValues = (name) => $$(`input[name="${name}"]:checked`).map((input) => input.value);
const html = (text) => String(text ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
const currency = formatCurrency;
const INCOME_FIELDS = (prefix, title) => `<h3>${title}</h3><div class="field-grid two-col">
  <label class="field"><span>Тип дохода *</span><select id="${prefix}Type"><option value="" disabled selected hidden>Выберите</option><option value="NO_REGULAR_INCOME">Регулярного дохода сейчас нет</option><option value="REMOTE_EMPLOYMENT">Удалённая работа по трудовому договору</option><option value="CONTRACTOR">Контракт с заказчиком (без трудовых отношений)</option><option value="FREELANCE_OR_SELF_EMPLOYED">Фриланс или самозанятость</option><option value="SOLE_PROPRIETOR">ИП</option><option value="COMPANY_OWNER">Владелец компании</option><option value="PASSIVE_INCOME">Пассивный доход</option><option value="PENSION">Пенсия</option><option value="OTHER_REGULAR_REMOTE_INCOME">Другой регулярный доход</option></select><small id="${prefix}IncomeTypeHelp"></small></label>
  <label class="field"><span>География источников дохода *</span><select id="${prefix}SourceScope"><option value="" disabled selected hidden>Выберите</option><option value="ONE_COUNTRY">Одна страна</option><option value="MULTIPLE_COUNTRIES">Несколько стран</option><option value="NO_PERMANENT_PAYER">Нет постоянного плательщика</option></select></label>
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
    childAges: radio('hasChildren') === 'YES' ? childAges : [], schoolNeeded: radio('schoolType') === 'INTERNATIONAL', schoolType: radio('schoolType'), kindergartenNeeded: radio('kindergartenNeeded') === 'YES',
    primaryType: value('primaryType'), primarySourceScope: value('primarySourceScope'), primarySourceCountry: value('primarySourceCountry'), primaryTotalAmount: value('primaryTotalAmount'), primaryAmount: resolvedIncomeAmount('primary'), primaryCurrency: value('primaryCurrency'), primaryEvidence: value('primaryEvidence'),
    hasAdditionalIncome: checked('hasAdditionalIncome'), additionalType: value('additionalType'), additionalSourceScope: value('additionalSourceScope'), additionalSourceCountry: value('additionalSourceCountry'), additionalTotalAmount: value('additionalTotalAmount'), additionalAmount: resolvedIncomeAmount('additional'), additionalCurrency: value('additionalCurrency'), additionalEvidence: value('additionalEvidence'),
    partnerHasIncome: checked('partnerHasIncome'), partnerType: value('partnerType'), partnerSourceScope: value('partnerSourceScope'), partnerSourceCountry: value('partnerSourceCountry'), partnerTotalAmount: value('partnerTotalAmount'), partnerAmount: resolvedIncomeAmount('partner'), partnerCurrency: value('partnerCurrency'), partnerEvidence: value('partnerEvidence'),
    longTermGoal: value('longTermGoal'), keepRuCitizenship: value('longTermGoal') === 'TEMPORARY_RESIDENCE_SUFFICIENT' ? 'NOT_IMPORTANT' : (radio('keepRuCitizenship') || 'NOT_IMPORTANT'),
    budgetUnknown: checked('budgetUnknown'), monthlyBudget: value('monthlyBudget'), budgetCurrency: value('budgetCurrency'),
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
  $('#educationBlock').hidden = !hasChildren;
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
      $(`#${prefix}SourceScope`).value = 'NO_PERMANENT_PAYER';
      $(`#${prefix}TotalAmount`).value = '0';
      $(`#${prefix}Currency`).value = 'USD';
      $(`#${prefix}Evidence`).value = 'NONE';
    }
    for (const id of [`${prefix}SourceScope`, `${prefix}TotalAmount`, `${prefix}Evidence`]) {
      const field = $(`#${id}`)?.closest('.field');
      if (field) field.hidden = noIncome;
    }
    const sourceField = $(`#${prefix}SourceCountryField`);
    if (sourceField) sourceField.hidden = noIncome || value(`${prefix}SourceScope`) !== 'ONE_COUNTRY';
    const partialField = $(`#${prefix}AmountField`);
    const partialInput = $(`#${prefix}Amount`);
    const showPartial = value(`${prefix}Evidence`) === 'PARTIAL';
    if (partialField) partialField.hidden = !showPartial;
    if (partialInput) partialInput.disabled = !showPartial;
    syncIncomeTypeHelp(prefix);
  }
  $('#monthlyBudget').disabled = checked('budgetUnknown');
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
    if (value(`${prefix}SourceScope`) === 'ONE_COUNTRY' && !parseCountryCode(value(`${prefix}SourceCountry`))) return fieldError([`${prefix}SourceCountry`], 'Укажите страну источника дохода.');
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
  if (step === 5 && !checked('budgetUnknown') && Number(value('monthlyBudget')) <= 0) error = fieldError(['monthlyBudget'], 'Укажите комфортный бюджет или выберите «Пока не знаю».');
  else if (step === 5 && radio('hasChildren') === 'YES' && !radio('schoolType')) error = fieldError(['schoolType'], 'Выберите планируемый тип школы или вариант «Не нужна».');
  else if (step === 5 && radio('hasChildren') === 'YES' && !radio('kindergartenNeeded')) error = fieldError(['kindergartenNeeded'], 'Ответьте, нужен ли детский сад.');
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
    ['Семейный бюджет', p.preferences.monthly_budget ? `${p.preferences.monthly_budget.amount} ${p.preferences.monthly_budget.currency}/мес` : checked('budgetUnknown') ? 'Автоматически равен общему доходу' : 'Не указан'],
  ];
  $('#profileSummary').innerHTML = rows.map(([label, val]) => `<div class="summary-row"><span>${html(label)}</span><b>${html(val)}</b></div>`).join('');
}

function statusClass(status) { return status === 'SUITABLE' ? 'positive' : status === 'SUITABLE_WITH_CONDITIONS' ? 'conditional' : 'negative'; }

const LGBT_ROWS = {
  ES: [
    ['Брак и переезд с супругом', 'Однополый брак признаётся. Супруг или супруга может участвовать в семейной иммиграции на тех же условиях, что и в разнополом браке.'],
    ['Незарегистрированные отношения', 'Партнёра без брака можно включить в некоторые программы, но потребуется доказать устойчивые отношения.'],
    ['Защита от дискриминации', 'Закон защищает от дискриминации в работе, жилье, образовании, медицине и услугах — в том числе иностранцев.'],
    ['Международная защита', 'Можно просить убежище или дополнительную защиту, если есть личный риск преследования из-за сексуальной ориентации или гендерной идентичности и страна происхождения не может защитить. Решение принимают по обстоятельствам и доказательствам.'],
  ],
  UY: [
    ['Брак и переезд с супругом', 'Однополый брак признаётся. Супруг или супруга может участвовать в семейной иммиграции на тех же условиях, что и в разнополом браке.'],
    ['Незарегистрированные отношения', 'Без брака семейный союз обычно нужно официально признать. Для unión concubinaria требуется не менее пяти лет совместной жизни и судебное признание.'],
    ['Защита от дискриминации', 'Дискриминация по сексуальной ориентации и гендерной идентичности запрещена законом. Доступ к защите на практике может отличаться.'],
    ['Международная защита', 'Можно просить статус беженца, если есть личный риск преследования из-за сексуальной ориентации или гендерной идентичности. Решение принимают по обстоятельствам и доказательствам.'],
  ],
};

const LGBT_CHANGES = {
  ES: 'В Испании рассматривается законопроект об уголовной ответственности за конверсионные практики. Конгресс одобрил его и направил в Сенат, но закон пока не принят. На правила въезда, ВНЖ и семейной иммиграции этот проект не влияет.',
};

function renderLgbtResearch(calculation) {
  if (!calculation.lgbt?.rules?.length) return '';
  const countryId = calculation.country.countryId;
  const rows = (calculation.lgbt.rows || LGBT_ROWS[countryId] || []).filter(([title]) => title !== 'Международная защита');
  const legalPosition = calculation.lgbt.legalPosition;
  const practicalEnvironment = calculation.lgbt.practicalEnvironment;
  if (!legalPosition || !practicalEnvironment) return '';
  const practicalExplanation = calculation.lgbt.practicalExplanation || 'Оценка основана на правовом положении, применении норм и возможности открыто жить парой.';
  const loyalCities = Array.isArray(calculation.lgbt.loyalCities) ? calculation.lgbt.loyalCities : [];
  const pendingChanges = Array.isArray(calculation.lgbt.pendingChanges)
    ? calculation.lgbt.pendingChanges
    : LGBT_CHANGES[countryId] ? [{ summary_ru: LGBT_CHANGES[countryId] }] : [];
  const changesBlock = pendingChanges.length
    ? `<div class="lgbt-row"><h4>Что меняется</h4>${pendingChanges.map((change) => `<p>${html(change.summary_ru || change)}</p>`).join('')}</div>`
    : '';
  const citiesBlock = practicalEnvironment === 'Неоднородная'
    ? `<div class="lgbt-row"><h4>Наиболее лояльные города</h4><p>${loyalCities.length ? html(loyalCities.join(', ')) : 'Методологически надёжная оценка городов пока не найдена.'}</p></div>`
    : '';
  return `<section class="lgbt-research"><div class="section-title-row"><div><h3>ЛГБТ: права, семья и практическая среда</h3><p>Оценки описывают право и среду, но не являются гарантией личной безопасности.</p></div></div><div class="lgbt-assessment-grid"><div><span>Правовое положение</span><b>${html(legalPosition)}</b></div><div><span>Практическая среда</span><b>${html(practicalEnvironment)}</b></div></div><p class="research-caveat">${html(practicalExplanation)}</p><div class="lgbt-list">${rows.map(([title, text]) => `<div class="lgbt-row"><h4>${html(title)}</h4><p>${html(text)}</p></div>`).join('')}${citiesBlock}${changesBlock}</div></section>`;
}

function longTermConditions(route) {
  if (!route.longTerm) return '';
  if (currentProfile?.goal?.long_term === 'TEMPORARY_RESIDENCE_SUFFICIENT') return '';
  const rule = route.longTerm;
  const items = [];
  const countryId = route.routeId.startsWith('UY_') ? 'UY' : route.routeId.startsWith('ES_') ? 'ES' : route.routeId.startsWith('AR_') ? 'AR' : route.routeId.startsWith('PY_') ? 'PY' : route.routeId.startsWith('PT_') ? 'PT' : route.routeId.startsWith('MX_') ? 'MX' : route.routeId.startsWith('BR_') ? 'BR' : null;

  if (countryId === 'ES') {
    if (rule.path_to_pr === 'YES' && Number.isFinite(Number(rule.years_to_pr))) {
      items.push(`ПМЖ: обычно после ${Number(rule.years_to_pr)} лет законного проживания при соблюдении требований к непрерывности.`);
    } else if (rule.path_to_pr === 'CONDITIONAL') {
      items.push('ПМЖ: потребуется переход на статус, который засчитывается как резиденция; срок зависит от момента такого перехода.');
    }

    if (rule.residence_counted_for_citizenship === 'NO_AS_STAY_GENERAL_RULE') {
      items.push('Гражданство: студенческое пребывание обычно не засчитывается; после перехода на засчитываемую резиденцию действует общий срок 10 лет до подачи.');
    } else {
      items.push('Гражданство: обычно после 10 лет законного, непрерывного проживания непосредственно перед подачей.');
    }

    if (rule.language_exam_required === 'YES') {
      items.push(`Язык и экзамены: испанский ${rule.required_language_level || 'A2'} и экзамен CCSE.`);
    }
    if (rule.renunciation_rules) {
      items.push('Гражданство РФ: по испанскому праву требуется декларация отказа от прежнего гражданства; практические последствия для гражданства РФ нужно проверять отдельно.');
    }
  } else if (countryId === 'UY') {
    if (rule.path_to_pr === 'DIRECT') {
      items.push('ПМЖ: этот маршрут сразу ведёт к постоянной резиденции.');
    } else if (rule.path_to_pr === 'CONDITIONAL') {
      items.push('ПМЖ: автоматического перехода нет; для постоянной резиденции потребуется отдельное подходящее основание.');
    }

    const withFamily = route.routeId === 'UY_FAMILY_LINK' || Boolean(currentProfile?.family?.partner_included || currentProfile?.family?.children?.length);
    const years = withFamily ? 3 : 5;
    let citizenshipText = `Гражданство: обычно после ${years} лет обычного проживания ${withFamily ? 'при семье, фактически живущей с вами в Уругвае' : 'без семьи, живущей с вами в Уругвае'}.`;
    if (route.routeId === 'UY_DIGITAL_NOMAD' || route.routeId === 'UY_TEMPORARY') {
      citizenshipText += ' Нужно заранее подтвердить, засчитается ли весь период по этому разрешению как обычное проживание.';
    } else if (route.routeId === 'UY_FAMILY_LINK') {
      citizenshipText += ' Брак или семейная связь сами по себе не дают гражданство автоматически.';
    }
    items.push(citizenshipText);

    if (rule.language_exam_required === 'YES') {
      items.push('Язык: нужно понимать испанский и уметь объясняться; стандартизированный экзамен не указан.');
    }
    items.push('Выезды: отсутствие более 6 месяцев подряд обнуляет накопленный срок проживания.');
    if (rule.multiple_citizenship_allowed === 'YES') {
      items.push('Гражданство РФ: отказ не требуется.');
    }
  } else if (countryId === 'AR') {
    const cleanPrefix = (text, prefix) => String(text || '').replace(new RegExp(`^${prefix}:?\s*`, 'i'), '').trim();
    if (rule.pr_path_ru) items.push(`ПМЖ: ${cleanPrefix(rule.pr_path_ru, 'ПМЖ')}`);
    if (rule.citizenship_path_ru) items.push(`Гражданство: это отдельный путь; предварительно получать ПМЖ не требуется. ${cleanPrefix(rule.citizenship_path_ru, 'Гражданство')}`);
    if (rule.presence_rule_ru) items.push(`Присутствие: ${cleanPrefix(rule.presence_rule_ru, 'Присутствие')}`);
    if (rule.dual_citizenship_ru) items.push(`Гражданство РФ: ${cleanPrefix(rule.dual_citizenship_ru, 'Гражданство РФ')}`);
  } else if (['PY', 'PT', 'MX', 'BR'].includes(countryId)) {
    const cleanPrefix = (text, prefix) => String(text || '').replace(new RegExp(`^${prefix}:?\\s*`, 'i'), '').trim();
    if (rule.pr_path_ru) items.push(`ПМЖ: ${cleanPrefix(rule.pr_path_ru, 'ПМЖ')}`);
    if (rule.citizenship_path_ru) items.push(`Гражданство: ${cleanPrefix(rule.citizenship_path_ru, 'Гражданство')}`);
    if (rule.presence_rule_ru) items.push(`Присутствие: ${cleanPrefix(rule.presence_rule_ru, 'Присутствие')}`);
    if (rule.dual_citizenship_ru) items.push(`Гражданство РФ: ${cleanPrefix(rule.dual_citizenship_ru, 'Гражданство РФ')}`);
  } else {
    items.push('Путь к ПМЖ и гражданству нужно проверить для выбранного маршрута.');
  }

  return `<div class="route-client-items"><h4>Путь к ПМЖ и гражданству</h4><ul>${items.map((item) => `<li>${html(item)}</li>`).join('')}</ul></div>`;
}

function routeCard(route, countryName, main = false) {
  const unsuitable = route.routeStatus === 'UNSUITABLE';
  const incomeTypeBlocked = route.incomeTypeFit === 'DOES_NOT_MEET';
  const requirement = describeIncomeRequirement(route, currency);
  const visibleBlockers = (route.blockers || []).filter((item) => !incomeTypeBlocked || !item.includes('Тип дохода несовместим'));
  const reasons = [...(incomeTypeBlocked ? [requirement] : []), ...visibleBlockers];
  const reasonsBlock = reasons.length ? `<div class="route-reasons"><h4>${reasons.length > 1 ? 'Почему не подходит — несколько независимых причин' : 'Почему не подходит'}</h4><ul>${reasons.map((item) => `<li>${html(item)}</li>`).join('')}</ul></div>` : '';
  const countryMissing = route.countryMissing || route.missing || [];
  const missingBlock = !unsuitable && countryMissing.length ? `<div class="route-open-items"><h4>Что ещё не подтверждено для этого варианта</h4><ul>${countryMissing.map((item) => `<li>${html(item)}</li>`).join('')}</ul></div>` : '';
  const actions = uniqueRouteActions(route);
  const actionsBlock = actions.length && route.routeStatus === 'SUITABLE_WITH_CONDITIONS' ? `<div class="route-actions"><h4>Что нужно выполнить, чтобы маршрут подходил</h4><ol>${actions.map((item) => `<li>${html(item)}</li>`).join('')}</ol></div>` : '';
  const permitRequirementsBlock = route.initialPermitRequirements?.length ? `<div class="route-requirements"><h4>Обязательные документы и действия для первоначального ВНЖ</h4><ul>${route.initialPermitRequirements.map((item) => `<li>${html(item)}</li>`).join('')}</ul></div>` : '';
  const sourceBlock = route.primarySource?.url ? `<p class="route-source"><a href="${html(route.primarySource.url)}" target="_blank" rel="noopener">Официальные требования: ${html(route.primarySource.title || route.primarySource.title_ru || route.routeName)}</a></p>` : '';
  const applicationBlock = route.applicationGuidance ? `<div class="route-requirements"><h4>Где и как подаваться</h4><p>${html(route.applicationGuidance)}</p></div>` : '';
  const exampleSourceBlock = route.incomeGuidance && route.incomeExampleSource?.url ? `<p class="route-source"><a href="${html(route.incomeExampleSource.url)}" target="_blank" rel="noopener">Неофициальный личный опыт о принятой сумме</a></p>` : '';
  const workBlock = route.work?.rule_ru ? `<div class="route-requirements"><h4>Право на работу после выдачи ВНЖ</h4><p>Разрешены: ${html(route.work.rule_ru)}.</p></div>` : '';
  const familyBlock = route.family?.rule_ru ? `<div class="route-requirements"><h4>Переезд семьи</h4><p>${html(route.family.rule_ru)}</p>${route.family.partner_work_rights_ru ? `<p><b>Работа партнёра:</b> ${html(route.family.partner_work_rights_ru)}</p>` : ''}</div>` : '';
  const finance = incomeTypeBlocked || route.incomeTypeFit === 'NOT_APPLICABLE' ? '' : `<p class="financial-rule">${html(requirement)}</p>`;
  const header = `<div class="route-card-heading"><span class="status-pill ${statusClass(route.routeStatus)}">${html(STATUS_LABELS_RU[route.routeStatus])}</span><h3>${html(route.routeName)}</h3>${main ? '<span class="best-route-label">Лучший маршрут исходя из ваших ответов</span>' : unsuitable ? '' : '<span class="route-expand-label">Показать подробности</span>'}</div>`;
  const body = unsuitable
    ? reasonsBlock
    : `${actionsBlock}${finance}${applicationBlock}${familyBlock}${workBlock}${permitRequirementsBlock}${missingBlock}${sourceBlock}${exampleSourceBlock}${longTermConditions(route)}`;
  if (unsuitable) return `<article class="route-result compact">${header}<div class="route-card-body">${body}</div></article>`;
  return main
    ? `<article class="route-result best">${header}<div class="route-card-body">${body}</div></article>`
    : `<article class="route-result compact"><details><summary>${header}</summary><div class="route-card-body">${body}</div></details></article>`;
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
    flag: countryId === 'ES' ? '🇪🇸' : countryId === 'UY' ? '🇺🇾' : countryId === 'AR' ? '🇦🇷' : countryId === 'PY' ? '🇵🇾' : countryId === 'PT' ? '🇵🇹' : countryId === 'MX' ? '🇲🇽' : countryId === 'BR' ? '🇧🇷' : '🌍',
  };
}

function renderCountryTab(calculation, active = false) {
  const { best, countryId, countryName, flag } = countryPresentation(calculation);
  return `<button class="country-tab${active ? ' is-active' : ''}" type="button" role="tab" data-country-tab="${html(countryId)}" aria-controls="country-panel-${html(countryId)}" aria-selected="${active}"><span class="country-tab-flag" aria-hidden="true">${flag}</span><span class="country-tab-copy"><strong>${html(countryName)}</strong><small>${html(best?.routeName || 'Маршрут не определён')}</small></span><span class="status-pill ${statusClass(best?.routeStatus)}">${html(STATUS_LABELS_RU[best?.routeStatus] || 'Подходит с условиями')}</span></button>`;
}

function renderCountryResult(calculation, changed = false, active = false) {
  const { sortedRoutes, best, countryId, countryName, flag } = countryPresentation(calculation);
  const children = calculation.profile.children?.length || 0;
  const family = `${calculation.profile.adults} ${calculation.profile.adults === 1 ? 'взрослый' : 'взрослых'}${children ? `, ${children} ${children === 1 ? 'ребёнок' : 'детей'}` : ''}`;
  const { routeLabel } = describeResultIntro(calculation.routes, changed);
  const incomeCurrency = calculation.country.resultCurrency || 'USD';
  const incomeAmount = calculation.applicantProvableIncome?.amount;
  const thresholdAmount = incomeCurrency === 'EUR' ? best?.thresholdEur : best?.thresholdUsd;
  const thresholdLabel = best?.incomeTypeFit === 'DOES_NOT_MEET' ? 'Финансовый порог' : 'Необходимый доход';
  const thresholdValue = best?.incomeTypeFit === 'DOES_NOT_MEET'
    ? 'Не оценивается: тип дохода не подходит'
    : thresholdAmount != null
      ? currency(thresholdAmount, incomeCurrency)
      : 'Единый числовой порог не установлен';
  const incomeValue = incomeAmount == null ? 'Не указан' : currency(incomeAmount, incomeCurrency);
  const entry = calculation.entryForRussianCitizen;
  const entryCostAndTiming = entry
    ? [entry.fee_local_ru, entry.processing_time_ru]
      .map((text) => String(text || '').trim().replace(/[.;]+$/u, ''))
      .filter(Boolean)
      .join('; ')
    : '';
  const entryBlock = entry ? `<div class="route-requirements practical-warning"><h4>Как гражданину РФ законно въехать</h4><p>${html(entry.summary_ru)}</p><p><b>Самолётом:</b> ${html(entry.air_entry_ru)}</p><p><b>По суше или морю:</b> ${html(entry.land_sea_entry_ru)}</p><p><b>Стоимость и срок:</b> ${html(entryCostAndTiming)}.</p><p><b>Переход к ВНЖ:</b> ${html(entry.in_country_residence_application_ru)}</p></div>` : '';
  const petInfo = calculation.petSummary ? `<div class="route-requirements practical-warning"><h4>Домашние животные</h4><p>${html(calculation.petSummary)}</p></div>` : '';
  const comparisonCities = enrichCityCategories((calculation.cities || []).map((city) => ({
        name: city.cityName,
        size: city.populationCategory,
        roles: city.roles || [],
        cost: city.costUsd,
        costIsFamilySpecific: Boolean(city.costIsFamilySpecific),
        coldRange: city.coldRange,
        hotRange: city.hotRange,
        avgTempColdestMonthC: city.avgTempColdestMonthC,
        avgTempHottestMonthC: city.avgTempHottestMonthC,
        climate: city.climate,
        internationalSchoolStatus: city.internationalSchoolStatus,
        internationalSchoolCost: city.internationalSchoolCost,
      })));
  const familyFactor = 1 + Math.max(0, calculation.profile.adults - 1) * 0.6 + children * 0.4;
  const budgetUsd = calculation.profile.monthlyBudgetUsd;
  const budgetSourceNote = calculation.profile.budgetDerivedFromIncome && budgetUsd != null
    ? `<p class="budget-source-note">Бюджет не указан отдельно, поэтому для сравнения использован общий регулярный доход: <b>${currency(budgetUsd)}</b> в месяц.</p>`
    : '';
  const needsInternationalSchool = Boolean(currentProfile?.family?.school_needed);
  const estimatedEducationCost = needsInternationalSchool ? (countryId === 'ES' ? 900 : countryId === 'UY' ? 700 : 0) : 0;
  const daycareNote = radio('kindergartenNeeded') === 'YES' ? 'Детский сад: цена зависит от города и возраста; пока показан отдельно как требующий проверки.' : '';
  const cityCostSuffix = calculation.profile.adults === 1 && children === 0 ? '/мес' : '/мес на семью';
  const schoolSummary = calculation.schoolSummary ? `<p class="research-caveat">${html(calculation.schoolSummary)}</p>` : '';
  const citySection = comparisonCities.length
    ? `<div class="city-budget-grid climate-grid">${comparisonCities.map((city) => {
        const living = city.costIsFamilySpecific ? Math.round(city.cost) : Math.round(city.cost * familyFactor);
        const numericSchoolCost = Number(city.internationalSchoolCost);
        const knownSchoolCost = needsInternationalSchool
          ? Number.isFinite(numericSchoolCost) ? numericSchoolCost : Number(estimatedEducationCost || 0)
          : 0;
        const total = living + knownSchoolCost;
        const delta = budgetUsd == null || !Number.isFinite(total) ? null : budgetUsd - total;
        const schoolLine = !needsInternationalSchool ? ''
          : city.internationalSchoolStatus
            ? `<span>Международная школа: <b>${html(city.internationalSchoolStatus)}</b></span>`
            : knownSchoolCost ? `<span>Международная школа: ориентир <b>+${currency(knownSchoolCost)}/мес</b></span>` : '';
        const budgetLine = delta == null ? '' : Number.isFinite(delta) && delta >= 0
          ? '<span class="budget-ok">В бюджет укладывается</span>'
          : '<span class="budget-short">Выше бюджета</span>';
        const coldValue = city.coldRange ?? city.avgTempColdestMonthC;
        const hotValue = city.hotRange ?? city.avgTempHottestMonthC;
        const coldLine = coldValue != null ? `<span>Холодный период: <b>${html(formatTemperatureRange(coldValue))}</b></span>` : '';
        const hotLine = hotValue != null ? `<span>Жаркий период: <b>${html(formatTemperatureRange(hotValue))}</b></span>` : '';
        const climateLine = city.climate ? `<span>Климат: <b>${html(city.climate)}</b></span>` : '';
        return `<article class="city-card"><div class="city-role-list">${city.categories.map((category) => `<span>${html(category)}</span>`).join('')}</div><h4>${html(city.name)}</h4><strong>${currency(living)}${cityCostSuffix}</strong>${schoolLine}${budgetLine}${climateLine}${coldLine}${hotLine}</article>`;
      }).join('')}</div>${schoolSummary}${daycareNote ? `<p class="research-caveat">${html(daycareNote)}</p>` : ''}<p class="research-caveat">Стоимость жизни — текущий сравнительный ориентир в USD. Она оценивает комфорт и не меняет юридическую пригодность ВНЖ.</p>`
    : '<p>Для этой страны пока нет городской модели.</p>';
  return `<article id="country-panel-${html(countryId)}" class="country-detail-panel" role="tabpanel" data-country-panel="${html(countryId)}"${active ? '' : ' hidden'}><div class="country-result-banner"><span class="country-flag" aria-hidden="true">${flag}</span><div class="country-summary-text"><h2>${html(countryName)}</h2><p>${routeLabel}: <b>${html(best?.routeName || 'не определён')}</b></p></div></div><div class="country-comparison-body">
    <div class="kpi-grid three"><div class="kpi"><span>Состав семьи</span><b>${html(family)}</b></div><div class="kpi"><span>Подтверждаемый доход</span><b>${incomeValue}</b></div><div class="kpi"><span>${thresholdLabel}</span><b>${thresholdValue}</b></div></div>
    <section><div class="section-title-row"><div><h3>Все проверенные варианты</h3></div></div><div class="alternative-routes">${sortedRoutes.map((route) => routeCard(route, countryName, route.routeId === best?.routeId)).join('')}</div></section>
    ${entryBlock}
    <section><div class="section-title-row"><div><h3>Города, климат и бюджет</h3></div></div>${budgetSourceNote}${citySection}</section>
    ${renderLgbtResearch(calculation)}${petInfo}</div></article>`;
}

function calculateAllCountries() {
  const adapterFor = (countryPackage) => {
    const countryId = countryPackage.country?.country_id ?? countryPackage.country_id;
    if (countryId === 'AR') return argentinaAdapter;
    if (countryId === 'PY') return paraguayAdapter;
    if (countryId === 'PT') return portugalAdapter;
    if (countryId === 'MX') return mexicoAdapter;
    if (countryId === 'BR') return brazilAdapter;
    return spainAdapter;
  };
  return calculateCountries(currentProfile, [spainData, uruguayData, argentinaData, paraguayData, portugalData, mexicoData, brazilData], calculationContext, adapterFor);
}

function renderResult(calculation, changed = false) {
  const countries = sortCountriesForDisplay(calculation.results || []);
  const calculatedAt = countries[0]?.calculatedAt?.slice(0, 10) || calculationContext.calculation_date?.slice(0, 10);
  const calculationNote = `<p class="result-note">Юридические правила маршрутов проверены по указанным источникам. Стоимость жизни — ориентировочная практическая оценка. Расчёт: ${html(calculatedAt)}. Курс валют: ${html(calculationContext.fx.as_of?.slice(0, 10))}, источник ${html(calculationContext.fx.source)}. Результат предварительный и не является юридическим обещанием.</p>`;
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

function draft() { return { version: 2, savedAt: new Date().toISOString(), answers: collectAnswers() }; }

function setRadio(name, val) { const input = $(`input[name="${name}"][value="${CSS.escape(String(val))}"]`); if (input) input.checked = true; }
function setCheckboxes(name, values = []) { $$(`input[name="${name}"]`).forEach((input) => { input.checked = values.includes(input.value); }); }

function restoreDraft() {
  try {
    const stored = JSON.parse(localStorage.getItem(DRAFT_KEY));
    if (stored?.version !== 2 || !stored.answers) return false;
    const a = stored.answers;
    const simple = ['currentCountry','currentStatus','relationshipType','applicantAge','partnerAge','primaryType','primarySourceScope','primarySourceCountry','primaryTotalAmount','primaryAmount','primaryCurrency','primaryEvidence','additionalType','additionalSourceScope','additionalSourceCountry','additionalTotalAmount','additionalAmount','additionalCurrency','additionalEvidence','partnerType','partnerSourceScope','partnerSourceCountry','partnerTotalAmount','partnerAmount','partnerCurrency','partnerEvidence','longTermGoal','monthlyBudget','budgetCurrency'];
    simple.forEach((id) => { if ($(`#${id}`) && a[id] != null) $(`#${id}`).value = a[id]; });
    setRadio('inRussia', a.inRussia || parseCountryCode(a.currentCountry) === 'RU' ? 'YES' : 'NO'); setRadio('partnerIncluded', a.partnerIncluded ? 'YES' : 'NO'); setRadio('hasChildren', a.childAges?.length ? 'YES' : 'NO'); setRadio('hasPets', a.petTypes?.[0] && a.petTypes[0] !== 'NONE' ? 'YES' : 'NO'); setRadio('keepRuCitizenship', a.keepRuCitizenship); setRadio('schoolType', a.schoolType); setRadio('kindergartenNeeded', a.kindergartenNeeded ? 'YES' : 'NO');
    ['lgbtEnabled','hasAdditionalIncome','partnerHasIncome','budgetUnknown'].forEach((id) => { if ($(`#${id}`)) $(`#${id}`).checked = Boolean(a[id]); });
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
  if (!validateStep(currentStep) || !spainData || !uruguayData || !argentinaData || !paraguayData || !portugalData || !mexicoData || !brazilData || !calculationContext) return;
  currentProfile = profile();
  const validation = validateUserProfile(currentProfile);
  if (!validation.valid) { $('#formError').hidden = false; $('#formError').textContent = validation.errors[0].message; return; }
  const schemaErrors = validateAgainstSchema(currentProfile, profileSchema);
  if (schemaErrors.length) { $('#formError').hidden = false; $('#formError').textContent = `Проверьте ответы: ${schemaErrors[0].message}`; return; }
  try { switchToResult(calculateAllCountries()); }
  catch (error) { $('#formError').hidden = false; $('#formError').textContent = `Не удалось выполнить расчёт: ${error.message}`; }
});
$('#saveDraft').addEventListener('click', () => { localStorage.setItem(DRAFT_KEY, JSON.stringify(draft())); showToast('Ответы сохранены только в этом браузере. Можно вернуться позже.'); });
$('#clearDraft').addEventListener('click', clearAll);
$('#editProfile').addEventListener('click', () => { $('#resultView').hidden = true; $('#questionnaireView').hidden = false; $('#heroTitle').textContent = 'Подберём вариант иммиграции'; $('#heroSubtitle').textContent = 'Ответьте на вопросы о вашей ситуации — анкета рассчитает доступные страны и программы.'; $('#editProfile').hidden = true; showStep(1); });

async function init() {
  restoreDraft(); syncChildren(); syncConditional(); showStep(1, false);
  try {
    const [spainResponse, uruguayResponse, argentinaResponse, paraguayResponse, portugalResponse, mexicoResponse, brazilResponse, schemaResponse] = await Promise.all([
      fetch('../data/spain-research-v3.0.json?v=7.1.1'),
      fetch('../data/uruguay-research-v3.0.json?v=7.1.1'),
      fetch('../data/argentina-research-v3.0.json?v=7.1.1'),
      fetch('../data/paraguay-research-v3.0.json?v=7.1.1'),
      fetch('../data/portugal-research-v3.0.json?v=7.1.1'),
      fetch('../data/mexico-research-v3.0.json?v=7.1.1'),
      fetch('../data/brazil-research-v3.0.json?v=7.1.1'),
      fetch('../data/schemas/user-profile-v1.schema.json?v=7.1.1'),
    ]);
    if (!spainResponse.ok || !uruguayResponse.ok || !argentinaResponse.ok || !paraguayResponse.ok || !portugalResponse.ok || !mexicoResponse.ok || !brazilResponse.ok || !schemaResponse.ok) {
      throw new Error(`HTTP ${spainResponse.status}/${uruguayResponse.status}/${argentinaResponse.status}/${paraguayResponse.status}/${portugalResponse.status}/${mexicoResponse.status}/${brazilResponse.status}/${schemaResponse.status}`);
    }
    [spainData, uruguayData, argentinaData, paraguayData, portugalData, mexicoData, brazilData, profileSchema] = await Promise.all([
      spainResponse.json(),
      uruguayResponse.json(),
      argentinaResponse.json(),
      paraguayResponse.json(),
      portugalResponse.json(),
      mexicoResponse.json(),
      brazilResponse.json(),
      schemaResponse.json(),
    ]);
    calculationContext = await loadCalculationContext();
  } catch (error) {
    $('#formError').hidden = false;
    $('#formError').textContent = error.code === 'CALCULATION_CONTEXT_INCOMPLETE' ? 'Расчёт временно недоступен: не удалось получить актуальный курс валют.' : `Не удалось загрузить данные: ${error.message}`;
  }
}

init();
