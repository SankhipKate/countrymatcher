import { assertActiveResearchPackage, calculateActiveMatcher } from '../js/engine/rp4-engine.js?v=8.0.0';
import { ROUTE_PRESENTATION_LABELS_RU, routePresentationGroup } from '../js/engine/route-presentation-contract.js?v=8.0.0';
import { collectCurrencyCodes, hasCompleteFxOutage, loadCalculationContext, summarizeFxContext } from '../pilot/fx-context.js?v=8.0.0';
import { countryOptions, parseCountryCode, searchCountries } from './countries.js?v=8.0.0';
import { formatCurrency } from './format.js?v=8.0.0';
import {
  ACCESS_GRANTED_EVENT,
  ACCESS_STATES,
  hideAccessGate,
  resolveAccessState,
  showAccessTeaser,
} from './access-gate.js?v=8.0.0';
import { deriveFunnelPresentation, FUNNEL_STATES } from './funnel.js?v=8.0.0';
import { applicationPresentationText, buildUserProfile, cityCategories, citySizeLabel, countryFlag, deduplicatedWorkRights, describeCityCostBasket, describeIncomeRequirement, describeResultIntro, formatCityTemperatureRange, nextCitySortState, reorderCityComparisonRows, resolveProvableAmount, russianMonths, sortCountriesForDisplay, sortRoutesForDisplay, uniqueRouteActions, validateAgainstSchema, validateUserProfile } from './profile.js?v=8.0.0';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const form = $('#matcherForm');
const steps = $$('.wizard-step');
const TOTAL_STEPS = steps.length;
const DRAFT_KEY = 'immigration-matcher-universal-draft-v3';
const DATA_BASE = new URL('../data/', import.meta.url);
const ACTIVE_RP4_PACKAGES = [
  'ES-research-v4.0.json',
  'AR-research-v4.0.json',
  'UY-research-v4.0.json',
  'BR-research-v4.0.json',
  'PT-research-v4.0.json',
  'MX-research-v4.0.json',
  'PY-research-v4.0.json',
  'CO-research-v4.0.json',
];
const QUALITY_OF_LIFE_EDITORIAL_FILE = 'quality-of-life-ru.json';
let currentStep = 1;
let activeResearchPackages = [];
let qualityOfLifeEditorial = { countries: {} };
let calculationContext;
let currentProfile;
let currentAnswers;
let profileSchema;
let pendingCalculation = null;
let verifiedAccessActive = false;

const value = (id) => $(`#${id}`)?.value ?? '';
const checked = (id) => Boolean($(`#${id}`)?.checked);
const radio = (name) => $(`input[name="${name}"]:checked`)?.value || '';
const checkboxValues = (name) => $$(`input[name="${name}"]:checked`).map((input) => input.value);
const html = (text) => String(text ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
const currency = formatCurrency;
const questionnaireCurrencies = () => [...new Set(
  $$('select[id$="Currency"] option')
    .map((option) => String(option.value || option.textContent || '').trim())
    .filter((code) => /^[A-Z]{3}$/.test(code)),
)];
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
    savingsAmount: value('savingsAmount'), savingsCurrency: value('savingsCurrency'),
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
  if (step === 3) error = incomeError('primary') || (checked('hasAdditionalIncome') ? incomeError('additional') : null) || (radio('partnerIncluded') === 'YES' && checked('partnerHasIncome') ? incomeError('partner') : null)
    || (value('savingsAmount').trim() === '' || Number(value('savingsAmount')) < 0 ? fieldError(['savingsAmount'], 'Укажите подтверждаемые сбережения; если их нет, укажите 0.') : null);
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

const ANSWER_LABELS = {
  CITIZENSHIP: 'Гражданство', PERMANENT_RESIDENCE: 'ПМЖ', TEMPORARY_RESIDENCE: 'ВНЖ', WORK_OR_FAMILY_VISA: 'Рабочая или семейная виза', STUDENT_STATUS: 'Студенческий статус', TOURIST_OR_VISA_FREE: 'Туристическая виза или безвизовый въезд', OTHER_LEGAL_STATUS: 'Другой законный статус', NO_LEGAL_STATUS: 'Нет законного статуса', MARRIED: 'Официальный брак', REGISTERED_PARTNERSHIP: 'Зарегистрированное партнёрство', UNREGISTERED_PARTNERSHIP: 'Незарегистрированные отношения', REMOTE_EMPLOYMENT: 'Удалённая работа по трудовому договору', CONTRACTOR: 'Контракт с заказчиком', FREELANCE_OR_SELF_EMPLOYED: 'Фриланс или самозанятость', SOLE_PROPRIETOR: 'ИП', COMPANY_OWNER: 'Владелец компании', LOCAL_EMPLOYMENT: 'Работа в стране назначения', PENSION: 'Пенсия', PASSIVE_INCOME: 'Пассивный доход', INVESTMENT_INCOME: 'Инвестиционный доход', OTHER_REGULAR_INCOME: 'Другой регулярный доход', NO_REGULAR_INCOME: 'Регулярного дохода сейчас нет', SINGLE_COUNTRY: 'Одна страна', MULTIPLE_COUNTRIES: 'Несколько стран', NO_STABLE_PAYER: 'Нет постоянного плательщика', FULL: 'Весь доход', PARTIAL: 'Только часть', NONE: 'Пока не могу подтвердить', TEMPORARY_RESIDENCE_SUFFICIENT: 'Временного ВНЖ достаточно', PR_REQUIRED: 'ПМЖ обязательно', CITIZENSHIP_REQUIRED: 'Гражданство обязательно', REQUIRED: 'Обязательно', NOT_REQUIRED: 'Не обязательно',
};
const answerMoney = (amount, code, period = '') => amount === '' || amount == null || !code ? '' : `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(Number(amount))} ${{ EUR: '€', USD: '$', RUB: '₽' }[code] || code}${period}`;
const russianYears = (age) => {
  const number = Number(age);
  const mod100 = Math.abs(number) % 100;
  const mod10 = Math.abs(number) % 10;
  const unit = mod100 >= 11 && mod100 <= 14 ? 'лет' : mod10 === 1 ? 'год' : mod10 >= 2 && mod10 <= 4 ? 'года' : 'лет';
  return `${age} ${unit}`;
};
const countryDisplayName = (value) => {
  const code = parseCountryCode(value);
  return countryOptions().find((country) => country.code === code)?.name || String(value || '').trim();
};

function renderAnswersBlock(a) {
  if (!a) return '';
  const groups = [];
  const presentRows = (rows) => rows.filter(([, answer]) => answer !== '' && answer != null);
  const add = (title, items) => {
    const present = items.map((item) => Array.isArray(item) ? item : { ...item, rows: presentRows(item.rows) })
      .filter((item) => Array.isArray(item) ? item[1] !== '' && item[1] != null : item.rows.length);
    if (present.length) groups.push([title, present]);
  };
  const yesNo = (answer) => answer ? 'Да' : 'Нет';
  const income = (prefix, title) => {
    const type = a[`${prefix}Type`]; if (!type) return { title, rows: [] };
    const rows = [['Тип', ANSWER_LABELS[type]]];
    if (type !== 'NO_REGULAR_INCOME') rows.push(['География', ANSWER_LABELS[a[`${prefix}SourceScope`]]], ...(a[`${prefix}SourceScope`] === 'SINGLE_COUNTRY' ? [['Страна источника', countryDisplayName(a[`${prefix}SourceCountry`])]] : []), ['Подтверждение', ANSWER_LABELS[a[`${prefix}Evidence`]]], ['Сумма', answerMoney(a[`${prefix}TotalAmount`], a[`${prefix}Currency`], ' / мес')], ...(a[`${prefix}Evidence`] === 'PARTIAL' ? [['Подтверждаемая сумма', answerMoney(a[`${prefix}Amount`], a[`${prefix}Currency`], ' / мес')]] : []));
    return { title, rows };
  };
  add('О вас', [['Гражданство', 'Россия'], ['Сейчас в России', yesNo(a.inRussia)], ...(!a.inRussia ? [['Текущая страна', countryDisplayName(a.currentCountry)], ['Легальный статус', ANSWER_LABELS[a.currentStatus]]] : []), ['Возраст', a.applicantAge ? russianYears(a.applicantAge) : ''], ['Учитывать права и признание ЛГБТ', yesNo(a.lgbtEnabled)]]);
  add('Семья', [['Переезд с партнёром', yesNo(a.partnerIncluded)], ...(a.partnerIncluded ? [['Форма отношений', ANSWER_LABELS[a.relationshipType]], ['Возраст партнёра', a.partnerAge ? russianYears(a.partnerAge) : '']] : []), ['Переезд с детьми', yesNo(Boolean(a.childAges?.length))], ...(a.childAges?.length ? [['Возраст детей', a.childAges.map(russianYears).join(', ')]] : []), ['Домашние животные', yesNo(a.petTypes?.[0] !== 'NONE')]]);
  add('Работа и доход', [income('primary', 'Основной доход'), ['Дополнительный источник дохода', yesNo(a.hasAdditionalIncome)], ...(a.hasAdditionalIncome ? [income('additional', 'Дополнительный доход')] : []), ...(a.partnerIncluded ? [['Доход партнёра', yesNo(a.partnerHasIncome)]] : []), ...(a.partnerIncluded && a.partnerHasIncome ? [income('partner', 'Доход партнёра')] : [])]);
  add('Финансы', [['Накопления', answerMoney(a.savingsAmount, a.savingsCurrency)]]);
  add('Планы переезда', [['Цель', ANSWER_LABELS[a.longTermGoal]], ...(a.longTermGoal && a.longTermGoal !== 'TEMPORARY_RESIDENCE_SUFFICIENT' ? [['Сохранить гражданство РФ', ANSWER_LABELS[a.keepRuCitizenship]]] : [])]);
  const row = ([label, answer]) => `<div class="answer-row"><span>${html(label)}</span><b>${html(answer)}</b></div>`;
  const item = (entry) => Array.isArray(entry) ? row(entry) : `<section class="answer-subgroup"><h4>${html(entry.title)}</h4><div class="answer-subgroup-grid">${entry.rows.map(row).join('')}</div></section>`;
  return `<section class="answers-review surface"><h2>Ваши ответы</h2><p>Эти данные использованы для расчёта результатов.</p><div class="answers-groups">${groups.map(([title, items]) => `<section><h3>${html(title)}</h3><div class="answers-grid">${items.map(item).join('')}</div></section>`).join('')}</div></section>`;
}

function statusClass(group) { return ({ SUITABLE: 'positive', SUITABLE_WITH_CONDITIONS: 'conditional', REQUIRES_SEPARATE_BASIS: 'separate-basis', INTERNATIONAL_PROTECTION: 'protection', UNSUITABLE: 'negative' })[group] || 'negative'; }

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
  return `<section class="country-info-card country-info-lgbt lgbt-research"><div class="section-title-row"><div><h3>ЛГБТ: права, семья и практическая среда</h3><p>Оценки описывают право и среду, но не являются гарантией личной безопасности.</p></div></div><div class="lgbt-assessment-grid"><div><span>Правовое положение</span><b>${html(legalPosition)}</b></div><div><span>Практическая среда</span><b>${html(practicalEnvironment)}</b></div></div><p class="research-caveat">${html(practicalExplanation)}</p><div class="lgbt-list">${rows.map(([title, text]) => `<div class="lgbt-row"><h4>${html(title)}</h4><p>${html(text)}</p></div>`).join('')}${citiesBlock}${changesBlock}</div></section>`;
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
    ? `<p>Стоимость обучения: ${html(tuitionAmount)} в год.</p><p>Вступительные и регистрационные взносы не включены.</p>` : '';
  return `<section class="country-info-card country-info-schools school-research"><div class="section-title-row"><div><h3>Школы</h3></div></div><div class="school-subsection"><h4>Государственные школы</h4>${rules || '<p>Данных о государственных школах пока недостаточно.</p>'}</div><div class="school-subsection"><h4>Международные школы с обучением на английском</h4><p>${international}</p>${tuitionLines}</div></section>`;
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
  return lines ? `<section class="country-info-card country-info-pets"><div class="section-title-row"><div><h3>Домашние животные</h3></div></div>${lines}</section>` : '';
}

function renderTaxPresentation(calculation) {
  const taxes = calculation.taxPresentation;
  if (!taxes) return '';
  const rows = [
    ['Налоговое резидентство', taxes.taxResidencyRule],
    ['Подоходный налог', taxes.personalIncomeTax],
    ['Доходы из-за рубежа', taxes.foreignIncome],
    ['Россия и двойное налогообложение', taxes.doubleTaxationWithRussia],
  ].filter(([, text]) => String(text || '').trim());
  if (!rows.length) return '';
  return `<section class="country-info-card country-info-taxes tax-research"><div class="section-title-row"><div><h3>Налоги</h3><p>Информация носит справочный характер и не рассчитывает персональные налоговые обязательства.</p></div></div><div class="lgbt-list">${rows.map(([title, text]) => `<div class="lgbt-row"><h4>${html(title)}</h4><p>${html(text)}</p></div>`).join('')}</div>${taxes.checkedAt ? `<p class="research-caveat">Проверено: ${html(taxes.checkedAt)}</p>` : ''}</section>`;
}

function longTermConditions(route) {
  if (!route.longTerm) return "";
  const items = [route.longTerm.renewal, route.longTerm.permanentResidence, route.longTerm.citizenship, route.longTerm.presence, route.longTerm.language].filter(Boolean);
  return items.length ? `<div class="route-client-items"><h4>Долгосрочная перспектива</h4><ul>${items.map((item) => `<li>${html(item)}</li>`).join("")}</ul></div>` : "";
}

function routeCard(route, countryName, main = false) {
  const unsuitable = route.routeStatus === "UNSUITABLE";
  const presentationGroup = routePresentationGroup(route);
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
  const practicalGuidanceSeen = new Set();
  const practicalGuidanceItems = financialRequirements.flatMap(({ summary }) => summary?.alternatives || [])
    .filter((item) => item.practicalGuidance)
    .map((item) => item.practicalGuidance)
    .filter((guidance) => {
      const identity = JSON.stringify(guidance);
      if (practicalGuidanceSeen.has(identity)) return false;
      practicalGuidanceSeen.add(identity);
      return true;
    });
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
        const source = evidence.sourceUrl
          ? ` · <a href="${html(evidence.sourceUrl)}" target="_blank" rel="noopener">${html(evidence.sourceTitle || 'Источник')}</a>` : '';
        return `${html(label)} · Дата источника: ${html(sourceDate)}${source}.`;
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
  const header = `<div class="route-card-heading"><span class="status-pill ${statusClass(presentationGroup)}">${html(ROUTE_PRESENTATION_LABELS_RU[presentationGroup])}</span><div class="route-title-content"><h3>${html(route.routeName)}</h3>${route.routeOfficialName ? `<p class="route-official-name">${html(route.routeOfficialName)}</p>` : ""}<span class="route-expand-label"><span class="when-closed">Показать подробности</span><span class="when-open">Скрыть подробности</span></span></div></div>`;
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
  const status = best ? `<span class="status-pill ${statusClass(routePresentationGroup(best))}">${html(ROUTE_PRESENTATION_LABELS_RU[routePresentationGroup(best)])}</span>` : '';
  return `<button class="country-tab${active ? ' is-active' : ''}" type="button" role="tab" data-country-tab="${html(countryId)}" aria-controls="country-panel-${html(countryId)}" aria-selected="${active}"><span class="country-tab-flag" aria-hidden="true">${flag}</span><span class="country-tab-copy"><strong>${html(countryName)}</strong>${summary}</span>${status}</button>`;
}

function renderLockedCountryTab(country) {
  const flag = country.countryId ? countryFlag(country.countryId) : '';
  return `<button class="country-tab is-locked" type="button" role="tab" aria-disabled="true" tabindex="-1"><span class="country-tab-flag" aria-hidden="true">${flag}</span><span class="country-tab-copy"><strong>${html(country.name)}</strong><small>Доступно после оплаты</small></span><span class="country-tab-lock" aria-hidden="true">🔒</span></button>`;
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
      }));
  const comparisonComponents = comparisonCities[0]?.comparisonComponents || [];
  const basketDescription = `<p class="research-caveat">${html(describeCityCostBasket(comparisonComponents, comparisonCities[0]?.comparisonScenarios))}</p>`;
  const citySection = comparisonCities.length
    ? `${basketDescription}<div class="cities-comparison"><table><thead><tr><th scope="col">Город</th>${[
        ['size', 'Тип города', 'Сортировать по типу города'],
        ['cost', 'Расходы в мес', 'Сортировать по расходам в месяц'],
        ['cold', 'Холодный сезон', 'Сортировать по холодному сезону'],
        ['hot', 'Жаркий сезон', 'Сортировать по жаркому сезону'],
      ].map(([key, label, ariaLabel]) => `<th scope="col" aria-sort="none"><button type="button" data-city-sort="${key}" aria-label="${ariaLabel}">${label}<span class="sort-direction" aria-hidden="true"> ↕</span></button></th>`).join('')}</tr></thead><tbody>${comparisonCities.map((city, index) => {
        const comparisonCost = Number.isFinite(city.comparisonCost) ? Math.round(city.comparisonCost) : null;
        const coldValue = city.coldRange ?? city.avgTempColdestMonthC;
        const hotValue = city.hotRange ?? city.avgTempHottestMonthC;
        const badges = city.categories.filter((category) => !/^(Большой|Средний|Небольшой) город$/u.test(category));
        const numberList = (value) => String(value ?? '').replaceAll(',', '.').match(/[−-]?\d+(?:\.\d+)?/g)?.map((item) => Number(item.replace('−', '-'))) || [];
        const coldBounds = numberList(coldValue);
        const hotBounds = numberList(hotValue);
        return `<tr data-city-index="${index}" data-size="${city.size || ''}" data-cost="${comparisonCost ?? ''}" data-cold-low="${coldBounds[0] ?? ''}" data-cold-high="${coldBounds[1] ?? coldBounds[0] ?? ''}" data-hot-low="${hotBounds[0] ?? ''}" data-hot-high="${hotBounds[1] ?? hotBounds[0] ?? ''}"><td data-label="Город"><div class="city-name">${html(city.name)}</div><div class="city-role-list">${badges.map((category) => `<span>${html(category)}</span>`).join('')}</div></td><td data-label="Тип города">${html(citySizeLabel(city.size))}</td><td data-label="Расходы в мес" class="city-cost">${comparisonCost == null ? 'Нет данных' : currency(comparisonCost)}</td><td data-label="Холодный сезон">${coldValue == null ? 'Нет данных' : html(formatCityTemperatureRange(coldValue))}</td><td data-label="Жаркий сезон">${hotValue == null ? 'Нет данных' : html(formatCityTemperatureRange(hotValue))}</td></tr>`;
      }).join('')}</tbody></table></div>`
    : '<p>Для этой страны пока нет городской модели.</p>';
  return `<article id="country-panel-${html(countryId)}" class="country-detail-panel" role="tabpanel" data-country-panel="${html(countryId)}"${active ? '' : ' hidden'}><div class="country-result-banner"><span class="country-flag" aria-hidden="true">${flag}</span><div class="country-summary-text"><h2>${html(countryName)}</h2><p>${routeLabel}: <b>${html(best?.routeName || 'не определён')}</b></p></div></div><div class="country-comparison-body">
    <div class="kpi-grid three"><div class="kpi"><span>Состав семьи</span><b>${html(family)}</b></div><div class="kpi"><span>Подтверждаемый доход</span><b>${incomeValue}</b></div><div class="kpi"><span>${thresholdLabel}</span><b>${thresholdValue}</b></div></div>
    <section><div class="section-title-row"><div><h3>Все проверенные варианты</h3></div></div><div class="alternative-routes">${sortedRoutes.map((route) => routeCard(route, countryName, route.routeId === best?.routeId)).join('')}</div></section>
    ${entryBlock}
    <section class="country-info-card country-info-cities"><div class="section-title-row"><div><h3>Города, климат и расходы</h3></div></div>${citySection}</section>
    ${renderSchoolPresentation(calculation)}
    ${renderLgbtResearch(calculation)}${renderPetPresentation(calculation)}${renderTaxPresentation(calculation)}${renderQualityOfLife(calculation)}</div></article>`;
}

function renderQualityOfLife(calculation) {
  const editorial = qualityOfLifeEditorial?.countries?.[calculation.country.countryId];
  if (!editorial) return '';
  const score = Number(editorial.score);
  const scoreText = Number.isFinite(score) ? `${score.toFixed(1).replace('.', ',')}/10` : null;
  const paragraphs = Array.isArray(editorial.narrative_ru)
    ? editorial.narrative_ru.filter((text) => String(text || '').trim()).map((text) => `<p>${html(text)}</p>`).join('')
    : '';
  const formula = String(editorial.formula_ru || '').trim();
  if (!scoreText && !paragraphs && !formula) return '';
  const scoreBlock = scoreText ? `<p class="quality-of-life-score">Субъективная редакционная оценка качества жизни: <b>${html(scoreText)}</b></p>` : '';
  const disclaimer = 'Оценка отражает общее качество повседневной жизни в стране. Она не показывает, насколько эта страна подходит именно вам, насколько легко получить ВНЖ, ПМЖ или гражданство, насколько легко интегрироваться в общество или стоит ли вам туда переезжать.';
  const formulaBlock = formula ? `<p class="quality-of-life-formula"><b>Формула страны:</b> ${html(formula)}</p>` : '';
  return `<section class="country-info-card country-info-quality-of-life"><div class="section-title-row"><div><h3>Качество жизни в стране</h3></div></div>${scoreBlock}<p class="quality-of-life-disclaimer">${html(disclaimer)}</p><div class="quality-of-life-narrative">${paragraphs}</div>${formulaBlock}</section>`;
}

function calculateActiveCountries() {
  return calculateActiveMatcher(currentProfile, activeResearchPackages, calculationContext);
}

function renderCalculationErrors(errors = []) {
  if (!errors.length) return '';
  const rows = errors.map((error) => {
    const currencies = Array.isArray(error.currencies) ? error.currencies.join(', ') : '';
    const detail = currencies ? `Нет доступного курса: ${currencies}.` : 'Нет доступного валютного курса.';
    return `<div class="country-fx-error"><b>${html(error.countryName || error.countryId || 'Страна')}</b><span>${html(detail)}</span></div>`;
  }).join('');
  return `<section class="country-info-card country-fx-errors"><div class="section-title-row"><div><h3>Временно не рассчитано</h3></div></div>${rows}</section>`;
}

function calculationErrorText(errors = []) {
  if (!errors.length) return 'Не удалось сформировать результат. Проверьте ответы и попробуйте выполнить расчёт ещё раз.';
  return errors.map((error) => error.message || `${error.countryName || error.countryId}: нет доступного валютного курса.`).join(' ');
}

function calculationNoteHtml(country) {
  const calculatedAt = country?.calculatedAt?.slice(0, 10) || calculationContext.calculation_date?.slice(0, 10);
  const fxSummary = summarizeFxContext(calculationContext.fx, country?.fxUsedCurrencies || []);
  const fxNote = fxSummary.as_of && fxSummary.source
    ? ` Курс валют: ${html(fxSummary.as_of.slice(0, 10))}, источник ${html(fxSummary.source)}.`
    : '';
  return `Юридические правила маршрутов проверены по указанным источникам. Расчёт: ${html(calculatedAt)}.${fxNote} Результат носит информационный характер и не является юридическим обещанием.`;
}

function renderResult(calculation, changed = false, lockedCountries = [], answers = null) {
  const countries = sortCountriesForDisplay(calculation.results || []);
  const calculationNote = `<p id="calculationResultNote" class="result-note">${calculationNoteHtml(countries[0])}</p>`;
  $('#result').innerHTML = `<div class="country-workspace"><nav class="country-tabs" role="tablist" aria-label="Страны">${countries.map((country, index) => renderCountryTab(country, index === 0)).join('')}${lockedCountries.map(renderLockedCountryTab).join('')}</nav><div class="country-detail-pane">${countries.map((country, index) => renderCountryResult(country, changed, index === 0)).join('')}</div></div>${renderCalculationErrors(calculation.errors || [])}${calculationNote}${answers ? renderAnswersBlock(answers) : ''}`;
  const countryById = new Map(countries.map((country) => [country.country.countryId, country]));
  const activateCountry = (countryId) => {
    $$('[data-country-tab]', $('#result')).forEach((tab) => {
      const active = tab.dataset.countryTab === countryId;
      tab.classList.toggle('is-active', active);
      tab.setAttribute('aria-selected', String(active));
    });
    $$('[data-country-panel]', $('#result')).forEach((panel) => { panel.hidden = panel.dataset.countryPanel !== countryId; });
    const note = $('#calculationResultNote', $('#result'));
    if (note) note.innerHTML = calculationNoteHtml(countryById.get(countryId));
    requestAnimationFrame(() => {
      $('.country-workspace', $('#result'))?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    });
  };
  $$('[data-country-tab]', $('#result')).forEach((tab) => tab.addEventListener('click', () => activateCountry(tab.dataset.countryTab)));
  $$('.cities-comparison', $('#result')).forEach((comparison) => {
    const sourceCities = [...comparison.querySelectorAll('tbody tr')];
    const body = comparison.querySelector('tbody');
    let sortState = {};
    $$('[data-city-sort]', comparison).forEach((button) => button.addEventListener('click', () => {
      const key = button.dataset.citySort;
      sortState = nextCitySortState(sortState, key);
      const { direction } = sortState;
      reorderCityComparisonRows(body, sourceCities, key, direction);
      $$('[data-city-sort]', comparison).forEach((control) => {
        const selected = control === button;
        control.closest('th').setAttribute('aria-sort', selected ? (direction === 'asc' ? 'ascending' : 'descending') : 'none');
        $('.sort-direction', control).textContent = selected ? (direction === 'asc' ? ' ↑' : ' ↓') : ' ↕';
      });
    }));
  });
}

function switchToResult(calculation, changed = false) {
  hideAccessGate();
  $('#previewBottomCta').hidden = true;
  $('#citizenshipGate').hidden = true;
  renderResult(calculation, changed);
  $('#questionnaireView').hidden = true;
  $('#resultView').hidden = false;
  $('#heroTitle').textContent = 'Ваш результат';
  $('#heroSubtitle').hidden = false;
  $('#heroSubtitle').textContent = 'По вашим ответам рассчитаны доступные варианты переезда и условия для семьи.';
  $('#editProfile').hidden = false;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function showUnpaidResult(presentation, accessState, changed = false) {
  const { teaser } = presentation;
  $('#citizenshipGate').hidden = true;
  $('#questionnaireView').hidden = true;
  const hasFreeCountry = presentation.state === FUNNEL_STATES.FREE_COUNTRY;
  if (hasFreeCountry) renderResult(presentation.previewCalculation, changed, presentation.lockedCountries, currentAnswers);
  $('#resultView').hidden = !hasFreeCountry;
  $('#heroTitle').textContent = 'Результат расчёта';
  $('#heroSubtitle').textContent = '';
  $('#heroSubtitle').hidden = true;
  $('#editProfile').hidden = true;
  const fxErrorText = !hasFreeCountry && presentation.errors?.length ? calculationErrorText(presentation.errors) : '';
  showAccessTeaser({
    heading: teaser.heading,
    text: [teaser.text, fxErrorText].filter(Boolean).join(' '),
    breakdown: teaser.breakdown,
    freeCountryMessage: presentation.freeCountryMessage,
    lockedCountryCount: presentation.lockedCountryCount || 0,
    accessState,
    hasFreeCountry,
  });
}

function showCalculationFailure(errors = []) {
  pendingCalculation = null;
  hideAccessGate();
  $('#result').innerHTML = '';
  $('#previewBottomCta').hidden = true;
  $('#resultView').hidden = true;
  $('#questionnaireView').hidden = false;
  $('#heroTitle').textContent = 'Подберём вариант иммиграции';
  $('#heroSubtitle').hidden = false;
  $('#heroSubtitle').textContent = 'Ответьте на вопросы о вашей ситуации — анкета рассчитает доступные страны и программы.';
  $('#formError').hidden = false;
  $('#formError').textContent = calculationErrorText(errors);
}

async function accessStateForResult() {
  if (verifiedAccessActive) return { state: ACCESS_STATES.ACTIVE, source: 'session' };
  const accessState = await resolveAccessState();
  if (accessState.state === ACCESS_STATES.ACTIVE) verifiedAccessActive = true;
  return accessState;
}

async function handleCalculatedResult(calculation, { changed = false, accessState = null } = {}) {
  const presentation = deriveFunnelPresentation(calculation, sortCountriesForDisplay);
  if (presentation.state === FUNNEL_STATES.ERROR) {
    showCalculationFailure(presentation.errors || calculation.errors || []);
    return;
  }
  pendingCalculation = { calculation, changed, answers: currentAnswers };
  const resolvedAccessState = accessState || await accessStateForResult();

  if (resolvedAccessState.state === ACCESS_STATES.ACTIVE) {
    verifiedAccessActive = true;
    pendingCalculation = null;
    switchToResult(calculation, changed);
    return;
  }

  showUnpaidResult(presentation, resolvedAccessState, changed);
}

function returnToQuestionnaire() {
  pendingCalculation = null;
  hideAccessGate();
  $('#result').innerHTML = '';
  $('#previewBottomCta').hidden = true;
  $('#citizenshipGate').hidden = true;
  $('#resultView').hidden = true;
  $('#questionnaireView').hidden = false;
  $('#heroTitle').textContent = 'Подберём вариант иммиграции';
  $('#heroSubtitle').hidden = false;
  $('#heroSubtitle').textContent = 'Ответьте на вопросы о вашей ситуации — анкета рассчитает доступные страны и программы.';
  $('#editProfile').hidden = true;
  showStep(1);
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
    const simple = ['currentCountry','currentStatus','relationshipType','applicantAge','partnerAge','primaryType','primarySourceScope','primarySourceCountry','primaryTotalAmount','primaryAmount','primaryCurrency','primaryEvidence','additionalType','additionalSourceScope','additionalSourceCountry','additionalTotalAmount','additionalAmount','additionalCurrency','additionalEvidence','partnerType','partnerSourceScope','partnerSourceCountry','partnerTotalAmount','partnerAmount','partnerCurrency','partnerEvidence','savingsAmount','savingsCurrency','longTermGoal'];
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
form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!validateStep(currentStep)) return;
  if (!activeResearchPackages.length || !calculationContext) {
    const availabilityError = $('#calculationAvailabilityError');
    availabilityError.hidden = false;
    availabilityError.textContent = 'Расчёт временно недоступен: не удалось загрузить необходимый расчётный контекст.';
    return;
  }
  currentAnswers = collectAnswers();
  currentProfile = buildUserProfile(currentAnswers);
  const validation = validateUserProfile(currentProfile);
  if (!validation.valid) { $('#formError').hidden = false; $('#formError').textContent = validation.errors[0].message; return; }
  const schemaErrors = validateAgainstSchema(currentProfile, profileSchema);
  if (schemaErrors.length) { $('#formError').hidden = false; $('#formError').textContent = `Проверьте ответы: ${schemaErrors[0].message}`; return; }

  localStorage.setItem(DRAFT_KEY, JSON.stringify(draft()));
  pendingCalculation = null;

  try {
    const calculation = calculateActiveCountries();
    await handleCalculatedResult(calculation);
  } catch (error) {
    $('#formError').hidden = false;
    $('#formError').textContent = `Не удалось выполнить расчёт: ${error.message}`;
  }
});
$('#saveDraft').addEventListener('click', () => { localStorage.setItem(DRAFT_KEY, JSON.stringify(draft())); showToast('Ответы сохранены только в этом браузере. Можно вернуться позже.'); });
$('#clearDraft').addEventListener('click', clearAll);
$('#editProfile').addEventListener('click', returnToQuestionnaire);
window.addEventListener(ACCESS_GRANTED_EVENT, () => {
  verifiedAccessActive = true;
  if (!pendingCalculation) return;
  const pending = pendingCalculation;
  pendingCalculation = null;
  currentAnswers = pending.answers;
  switchToResult(pending.calculation, pending.changed);
});

function isSuccessfulPaymentReturn() {
  return new URLSearchParams(window.location.search).get('payment') === 'success';
}

async function handlePaymentReturn(restoredDraft) {
  if (!isSuccessfulPaymentReturn()) return;

  const accessState = await resolveAccessState();
  if (accessState.state === ACCESS_STATES.ACTIVE) verifiedAccessActive = true;
  if (!restoredDraft) return;

  currentAnswers = collectAnswers();
  currentProfile = buildUserProfile(currentAnswers);
  const validation = validateUserProfile(currentProfile);
  const schemaErrors = validation.valid ? validateAgainstSchema(currentProfile, profileSchema) : [];
  if (!validation.valid || schemaErrors.length) {
    returnToQuestionnaire();
    return;
  }

  try {
    const calculation = calculateActiveCountries();
    await handleCalculatedResult(calculation, { accessState });
  } catch (error) {
    returnToQuestionnaire();
    $('#formError').hidden = false;
    $('#formError').textContent = `Не удалось выполнить расчёт: ${error.message}`;
  }
}

async function init() {
  const restoredDraft = restoreDraft();
  syncChildren(); syncConditional(); showStep(1, false);
  try {
    const [packages, schemaResponse, editorial] = await Promise.all([
      Promise.all(ACTIVE_RP4_PACKAGES.map(async (filename) => {
        const response = await fetch(new URL(`${filename}?v=8.0.0`, DATA_BASE));
        if (!response.ok) throw new Error(`HTTP ${response.status}: ${filename}`);
        const pkg = await response.json();
        assertActiveResearchPackage(pkg);
        return pkg;
      })),
      fetch(new URL('schemas/user-profile-v1.schema.json?v=8.0.0', DATA_BASE)),
      fetch(new URL(`${QUALITY_OF_LIFE_EDITORIAL_FILE}?v=8.0.0`, DATA_BASE))
        .then((response) => response.ok ? response.json() : { countries: {} })
        .catch(() => ({ countries: {} })),
    ]);
    if (!schemaResponse.ok) throw new Error(`HTTP ${schemaResponse.status}: user-profile schema`);
    const fxCurrencies = [...new Set([...collectCurrencyCodes(packages), ...questionnaireCurrencies()])];
    const context = await loadCalculationContext({ currencies: fxCurrencies });
    activeResearchPackages = packages;
    profileSchema = await schemaResponse.json();
    calculationContext = context;
    qualityOfLifeEditorial = editorial?.countries && typeof editorial.countries === 'object' ? editorial : { countries: {} };
    const availabilityError = $('#calculationAvailabilityError');
    if (hasCompleteFxOutage(context.fx)) {
      availabilityError.hidden = false;
      availabilityError.textContent = 'Курсы валют сейчас недоступны. Расчёт стран, где нужна конвертация валют, временно может быть недоступен.';
    } else {
      availabilityError.hidden = true;
      availabilityError.textContent = '';
    }
    await handlePaymentReturn(restoredDraft);
  } catch (error) {
    $('#calculationAvailabilityError').hidden = false;
    $('#calculationAvailabilityError').textContent = `Не удалось загрузить данные: ${error.message}`;
  }
}

init();
