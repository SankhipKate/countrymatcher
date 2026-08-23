import { parseCountryCode } from './countries.js';
import { ROUTE_PRESENTATION_RANK, routePresentationGroup } from '../js/engine/route-presentation-contract.js';

const money = (amount, currency) => amount === '' || amount == null ? null : ({ amount: Number(amount), currency });

export function countryFlag(countryId) {
  if (!/^[A-Z]{2}$/.test(countryId || '')) return '🌍';
  return [...countryId].map((letter) => String.fromCodePoint(letter.charCodeAt(0) + 127397)).join('');
}


export function resolveProvableAmount(totalAmount, evidenceLevel, partialAmount) {
  if (evidenceLevel === 'FULL') return totalAmount === '' || totalAmount == null ? null : Number(totalAmount);
  if (evidenceLevel === 'NONE') return 0;
  if (evidenceLevel === 'PARTIAL') return partialAmount === '' || partialAmount == null ? null : Number(partialAmount);
  return null;
}

const incomeSource = (prefix, owner, answers) => {
  if (answers[`${prefix}Type`] === 'NO_REGULAR_INCOME') return {
    owner,
    type: 'NO_REGULAR_INCOME',
    source_geography: 'NO_STABLE_PAYER',
    country_id: null,
    bank_country: null,
    monthly_total: { amount: 0, currency: 'USD' },
    monthly_provable: { amount: 0, currency: 'USD' },
    evidence_level: 'NONE',
    history_months: null,
    stability: null,
    continues_after_move: null,
    contract_remaining_months: null,
    business_age_months: null,
  };

  const sourceGeography = answers[`${prefix}SourceScope`] || null;
  return {
  owner,
  type: answers[`${prefix}Type`],
  source_geography: sourceGeography,
  country_id: sourceGeography === 'SINGLE_COUNTRY'
    ? parseCountryCode(answers[`${prefix}SourceCountry`]) : null,
  bank_country: null,
  monthly_total: money(answers[`${prefix}TotalAmount`] ?? answers[`${prefix}Amount`], answers[`${prefix}Currency`]),
  monthly_provable: money(resolveProvableAmount(
    answers[`${prefix}TotalAmount`] ?? answers[`${prefix}Amount`],
    answers[`${prefix}Evidence`],
    answers[`${prefix}Amount`],
  ), answers[`${prefix}Currency`]),
  evidence_level: answers[`${prefix}Evidence`],
  history_months: null,
  stability: null,
  continues_after_move: null,
  contract_remaining_months: null,
  business_age_months: null,
  };
};

export function buildUserProfile(answers) {
  const partnerIncluded = answers.partnerIncluded === true;
  const children = (answers.childAges || []).map((age) => ({ age_years: age === '' || age == null ? null : Number(age) }));
  const additional = answers.hasAdditionalIncome ? [incomeSource('additional', 'APPLICANT', answers)] : [];
  const partnerSources = partnerIncluded && answers.partnerHasIncome ? [incomeSource('partner', 'PARTNER', answers)] : [];
  const petTypes = answers.petTypes?.length ? answers.petTypes : ['NONE'];
  const medical = answers.medicalEnabled ? {
    specific_medicine_required: Boolean(answers.specificMedicineRequired),
    regular_care_required: Boolean(answers.regularCareRequired),
    prefer_not_to_say: false,
    details: answers.medicalDetails?.trim() || null,
  } : undefined;

  return {
    schema_version: 'user-profile-v1',
    citizenships: ['RU'],
    residence: {
      current_country: parseCountryCode(answers.currentCountry),
      current_status: answers.currentStatus,
    },
    application_preferences: { methods: answers.applicationMethods?.length ? answers.applicationMethods : answers.applicationMethod ? [answers.applicationMethod] : [] },
    family: {
      adults_count: partnerIncluded ? 2 : 1,
      adult_ages: [answers.applicantAge, ...(partnerIncluded ? [answers.partnerAge] : [])].map((age) => age === '' || age == null ? null : Number(age)),
      partner_included: partnerIncluded,
      relationship_type: partnerIncluded ? answers.relationshipType : null,
      children,
      school_needed: false,
    },
    lgbt: {
      enabled: Boolean(answers.lgbtEnabled),
      consent_for_personalization: Boolean(answers.lgbtEnabled),
      family_recognition_relevant: partnerIncluded && answers.lgbtEnabled ? true : null,
      safety_relevant: answers.lgbtEnabled ? true : null,
    },
    income: {
      primary: incomeSource('primary', 'APPLICANT', answers),
      has_additional_sources: Boolean(answers.hasAdditionalIncome),
      additional_sources: additional,
      partner: { has_income: partnerSources.length > 0, sources: partnerSources },
      savings: money(answers.savingsAmount, answers.savingsCurrency),
    },
    goal: {
      long_term: answers.longTermGoal,
      keep_russian_citizenship: answers.keepRuCitizenship,
    },
    preferences: {
      monthly_budget: null,
      city_size: 'ANY',
      climate: ['ANY'],
    },
    pets: {
      types: petTypes,
      dogs: petTypes.includes('DOG') ? [{ breed: answers.dogBreed?.trim() || null }] : [],
      other_pet_notes: petTypes.includes('CAT') ? answers.otherPetNotes?.trim() || null : null,
    },
    special_circumstances: answers.specialCircumstances?.length ? answers.specialCircumstances : ['NONE'],
    ...(medical ? { optional_modules: { medical } } : {}),
    route_specific_answers: answers.routeSpecificAnswers || {},
  };
}

const code = (value) => typeof value === 'string' && /^[A-Z]{2}$/.test(value);
const positiveMoney = (value) => value && Number(value.amount) >= 0 && /^[A-Z]{3}$/.test(value.currency || '');

export function validateUserProfile(profile) {
  const errors = [];
  const add = (field, message) => errors.push({ field, message });
  if (profile?.schema_version !== 'user-profile-v1') add('schema_version', 'Неверная версия профиля.');
  if (JSON.stringify(profile?.citizenships) !== '["RU"]') add('citizenships', 'Анкета предназначена только для граждан РФ.');
  if (!code(profile?.residence?.current_country)) add('currentCountry', 'Укажите двухбуквенный код текущей страны.');
  if (!profile?.residence?.current_status) add('currentStatus', 'Укажите ваш текущий статус.');
  if (!profile?.application_preferences?.methods?.[0]) add('applicationMethods', 'Выберите хотя бы один способ подачи.');
  if (![1, 2].includes(profile?.family?.adults_count)) add('partnerIncluded', 'Укажите, переезжает ли партнёр.');
  if ((profile?.family?.adult_ages || []).some((age) => age !== null && (!Number.isInteger(age) || age < 18 || age > 120))) add('adultAges', 'Возраст взрослого должен быть от 18 до 120 лет или оставлен пустым.');
  if (profile?.family?.partner_included && !profile.family.relationship_type) add('relationshipType', 'Укажите, как оформлены отношения.');
  if ((profile?.family?.children || []).some((child) => !Number.isInteger(child.age_years) || child.age_years < 0 || child.age_years > 25)) add('childAges', 'Укажите возраст каждого ребёнка от 0 до 25 лет.');
  const sources = [profile?.income?.primary, ...(profile?.income?.additional_sources || []), ...(profile?.income?.partner?.sources || [])];
  for (const source of sources) {
    if (!source?.type) add('primaryType', 'Укажите тип дохода.');
    if (!['SINGLE_COUNTRY', 'NO_STABLE_PAYER'].includes(source?.source_geography)) add('primarySourceScope', 'Укажите географию источников дохода.');
    if (source?.source_geography === 'SINGLE_COUNTRY' && !code(source?.country_id)) add('primarySourceCountry', 'Укажите страну источника дохода.');
    const noIncome = source?.type === 'NO_REGULAR_INCOME';
    const totalValid = noIncome || (Boolean(positiveMoney(source?.monthly_total)) && source.monthly_total.amount > 0);
    const provableValid = Boolean(positiveMoney(source?.monthly_provable));
    if (!totalValid) add('primaryTotalAmount', 'Укажите положительную сумму регулярного дохода.');
    if (!provableValid || source.monthly_provable.amount < 0 || (!noIncome && totalValid && source.monthly_provable.amount > source.monthly_total.amount)) add('primaryAmount', 'Подтверждаемая сумма должна быть от 0 до общего дохода.');
    if (!source?.evidence_level) add('primaryEvidence', 'Укажите полноту подтверждения дохода.');
  }
  if (!positiveMoney(profile?.income?.savings)) add('savingsAmount', 'Укажите подтверждаемые сбережения; если их нет, укажите 0.');
  if (!profile?.goal?.long_term) add('longTermGoal', 'Выберите долгосрочную цель.');
  if (!profile?.goal?.keep_russian_citizenship) add('keepRuCitizenship', 'Укажите важность сохранения гражданства РФ.');
  if (!profile?.pets?.types?.length) add('petTypes', 'Укажите домашних животных.');
  if (!profile?.special_circumstances?.length) add('specialCircumstances', 'Ответьте на вопрос об особых обстоятельствах.');
  return { valid: errors.length === 0, errors };
}

const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const typeMatches = (value, type) => type === 'null' ? value === null
  : type === 'array' ? Array.isArray(value)
    : type === 'object' ? value !== null && typeof value === 'object' && !Array.isArray(value)
      : type === 'integer' ? Number.isInteger(value)
        : typeof value === type;

export function validateAgainstSchema(value, schema, rootSchema = schema, path = '$') {
  if (!schema || typeof schema !== 'object') return [];
  if (schema.$ref?.startsWith('#/')) {
    const target = schema.$ref.slice(2).split('/').reduce((current, key) => current?.[key], rootSchema);
    return validateAgainstSchema(value, target, rootSchema, path);
  }
  const errors = [];
  const add = (message) => errors.push({ path, message });
  if ('const' in schema && !same(value, schema.const)) add('Значение не соответствует контракту.');
  if (schema.enum && !schema.enum.some((item) => same(item, value))) add('Значение отсутствует в списке допустимых.');
  if (schema.type) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.some((type) => typeMatches(value, type))) {
      add('Неверный тип значения.');
      return errors;
    }
  }
  if (schema.anyOf && !schema.anyOf.some((candidate) => validateAgainstSchema(value, candidate, rootSchema, path).length === 0)) add('Значение не соответствует ни одному допустимому варианту.');
  if (schema.allOf) {
    for (const candidate of schema.allOf) {
      if (candidate.if) {
        const matches = validateAgainstSchema(value, candidate.if, rootSchema, path).length === 0;
        errors.push(...validateAgainstSchema(value, matches ? candidate.then : candidate.else, rootSchema, path));
      } else errors.push(...validateAgainstSchema(value, candidate, rootSchema, path));
    }
  }
  if (typeof value === 'number') {
    if (schema.minimum != null && value < schema.minimum) add(`Значение должно быть не меньше ${schema.minimum}.`);
    if (schema.maximum != null && value > schema.maximum) add(`Значение должно быть не больше ${schema.maximum}.`);
  }
  if (typeof value === 'string') {
    if (schema.minLength != null && value.length < schema.minLength) add('Значение слишком короткое.');
    if (schema.maxLength != null && value.length > schema.maxLength) add('Значение слишком длинное.');
    if (schema.pattern && !(new RegExp(schema.pattern)).test(value)) add('Неверный формат значения.');
  }
  if (Array.isArray(value)) {
    if (schema.minItems != null && value.length < schema.minItems) add(`Нужно выбрать не меньше ${schema.minItems}.`);
    if (schema.maxItems != null && value.length > schema.maxItems) add(`Допустимо не больше ${schema.maxItems}.`);
    if (schema.uniqueItems && new Set(value.map(JSON.stringify)).size !== value.length) add('Значения не должны повторяться.');
    if (schema.items) value.forEach((item, index) => errors.push(...validateAgainstSchema(item, schema.items, rootSchema, `${path}[${index}]`)));
    if (schema.contains && !value.some((item, index) => validateAgainstSchema(item, schema.contains, rootSchema, `${path}[${index}]`).length === 0)) add('Не найдено обязательное значение.');
  }
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    for (const key of schema.required || []) if (!(key in value)) errors.push({ path: `${path}.${key}`, message: 'Обязательное поле отсутствует.' });
    for (const [key, child] of Object.entries(value)) {
      if (schema.properties?.[key]) errors.push(...validateAgainstSchema(child, schema.properties[key], rootSchema, `${path}.${key}`));
      else if (schema.additionalProperties === false) errors.push({ path: `${path}.${key}`, message: 'Поле не предусмотрено контрактом.' });
      else if (schema.additionalProperties && typeof schema.additionalProperties === 'object') errors.push(...validateAgainstSchema(child, schema.additionalProperties, rootSchema, `${path}.${key}`));
    }
  }
  return errors;
}

export function collectEligibleFollowUps(calculation) {
  const eligibleStatuses = new Set(['SUITABLE', 'SUITABLE_WITH_CONDITIONS']);
  const entries = (calculation?.routes || []).filter((route) => eligibleStatuses.has(route.routeStatus))
    .flatMap((route) => (route.followUpQuestions || []).map((question) => [question.code, { ...question, routeName: route.routeName }]));
  return [...new Map(entries).values()];
}

export function describeIncomeRequirement(route, formatCurrency) {
  const conversion = route?.incomeRequirementConversion;
  if (conversion?.originalCurrency && conversion?.targetCurrency
    && conversion.originalCurrency !== conversion.targetCurrency) {
    const official = `${formatCurrency(conversion.originalAmount, conversion.originalCurrency)} (${conversion.originalCurrency})`;
    const equivalent = `${formatCurrency(conversion.convertedAmount, conversion.targetCurrency)} (${conversion.targetCurrency})`;
    return `Официальная сумма: ${official}; примерно ${equivalent}.${route?.incomeGuidance ? ` ${route.incomeGuidance}` : ''}`;
  }
  if (route?.incomeGuidance) return route.incomeGuidance;
  if (route?.incomeTypeFit === 'DOES_NOT_MEET') {
    const acceptedByRoute = {
      ES_DNV: 'Подойдут удалённая работа по трудовому договору, договоры с иностранными заказчиками или доход владельца иностранной компании.',
      ES_NLV: 'Нужен пассивный доход, который не требует работы: например, аренда, дивиденды или пенсия.',
      ES_SELF_EMPLOYED: 'Нужен план самостоятельной деятельности или бизнеса в Испании.',
      ES_ENTREPRENEUR: 'Нужен инновационный предпринимательский проект, проходящий индивидуальную оценку.',
      ES_HIGHLY_QUALIFIED: 'Нужно предложение квалифицированной работы от работодателя в Испании.',
      ES_STUDENT: 'Нужно основание для обучения и средства на проживание; текущий рабочий доход сам по себе не создаёт студенческий маршрут.',
      UY_DIGITAL_NOMAD: 'Подойдут удалённая работа по найму, договоры с иностранными заказчиками или доход владельца иностранной компании.',
    };
    const change = acceptedByRoute[route.routeId] || 'Для этого маршрута требуется другой юридически допустимый источник средств.';
    return `Ваш текущий тип дохода не принимается для этого варианта. ${change} Сумма дохода не является причиной отказа.`;
  }
  if (route?.thresholdUsd != null) return `Подтверждаемый доход должен быть больше ${formatCurrency(route.thresholdUsd, 'USD')} в месяц.`;
  if (route?.thresholdEur == null) return 'Финансовое требование для этого варианта не выражено единым порогом и проверяется по документам.';
  return `Минимальный подтверждаемый доход: ${formatCurrency(route.thresholdEur, 'EUR')} в месяц.`;
}

export function describeResultIntro(routes, changed = false) {
  if (!routes?.length) return {
    heading: changed ? 'Результат обновлён после уточнения' : 'Сейчас нет маршрутов, доступных для надёжной оценки',
    routeLabel: 'Сейчас нет маршрутов с завершёнными данными, которые можно надёжно оценить по вашим ответам.',
  };
  const allUnsuitable = routes?.length > 0 && routes.every((route) => route.routeStatus === 'UNSUITABLE');
  return {
    heading: changed ? 'Результат обновлён после уточнения' : allUnsuitable ? 'Сейчас подходящих вариантов не найдено' : 'Результат по стране',
    routeLabel: allUnsuitable ? 'Первый из проверенных неподходящих маршрутов' : 'Наиболее подходящий вариант по вашим ответам',
  };
}

const routeFamilySortRank = (route, fallbackRank) => Number.isInteger(route?.familyEvaluation?.sortRank)
  ? route.familyEvaluation.sortRank : (fallbackRank[route?.familyFit] ?? 1);

export function sortRoutesForDisplay(routes = []) {
  const familyRank = { MEETS: 0, NOT_APPLICABLE: 0, UNKNOWN: 1, DOES_NOT_MEET: 2 };
  const goalRank = { MEETS: 0, NOT_APPLICABLE: 0, UNKNOWN: 1, DOES_NOT_MEET: 2 };
  return routes
    .map((route, originalIndex) => ({ route, originalIndex }))
    .sort((left, right) => {
      const a = left.route;
      const b = right.route;
      const statusDifference = (ROUTE_PRESENTATION_RANK[routePresentationGroup(a)] ?? 99)
        - (ROUTE_PRESENTATION_RANK[routePresentationGroup(b)] ?? 99);
      if (statusDifference) return statusDifference;
      const familyDifference = routeFamilySortRank(a, familyRank) - routeFamilySortRank(b, familyRank);
      if (familyDifference) return familyDifference;
      const goalDifference = (goalRank[a.goalFit] ?? 1) - (goalRank[b.goalFit] ?? 1);
      if (goalDifference) return goalDifference;
      if (routePresentationGroup(a) === 'UNSUITABLE') {
        const blockerDifference = (a.blockers?.length || 0) - (b.blockers?.length || 0);
        if (blockerDifference) return blockerDifference;
      }
      const conditionsDifference = (a.conditions?.length || 0) - (b.conditions?.length || 0);
      return conditionsDifference || left.originalIndex - right.originalIndex;
    })
    .map(({ route }) => route);
}

export function sortCountriesForDisplay(countries = []) {
  const familyRank = { MEETS: 0, NOT_APPLICABLE: 0, UNKNOWN: 1, DOES_NOT_MEET: 2 };
  const goalRank = { MEETS: 0, NOT_APPLICABLE: 0, UNKNOWN: 1, DOES_NOT_MEET: 2 };
  return countries
    .map((country, originalIndex) => ({ country, originalIndex }))
    .sort((left, right) => {
      const leftStatus = routePresentationGroup(left.country?.bestRoute) ?? left.country?.country?.group;
      const rightStatus = routePresentationGroup(right.country?.bestRoute) ?? right.country?.country?.group;
      const leftRank = ROUTE_PRESENTATION_RANK[leftStatus] ?? 99;
      const rightRank = ROUTE_PRESENTATION_RANK[rightStatus] ?? 99;
      if (leftRank !== rightRank) return leftRank - rightRank;
      const leftBest = left.country?.bestRoute;
      const rightBest = right.country?.bestRoute;
      const familyDifference = routeFamilySortRank(leftBest, familyRank) - routeFamilySortRank(rightBest, familyRank);
      if (familyDifference) return familyDifference;
      const goalDifference = (goalRank[leftBest?.goalFit] ?? 1) - (goalRank[rightBest?.goalFit] ?? 1);
      if (goalDifference) return goalDifference;
      return left.originalIndex - right.originalIndex;
    })
    .map(({ country }) => country);
}

const CITY_COST_COMPONENT_LABELS = {
  RENT_STANDARD: 'аренда квартиры с 1 спальней в центре',
  UTILITIES: 'коммунальные расходы',
  GROCERIES: 'продукты',
  TRANSPORT: 'транспорт',
};

export function describeCityCostBasket(components = []) {
  if (!components.includes('RENT_STANDARD')) return 'Сопоставимый сценарий аренды для всех городов пока не подтверждён.';
  const labels = components.map((component) => CITY_COST_COMPONENT_LABELS[component] || component);
  return `В расчёт входит: ${labels.join(' + ')} на 1 человека. Это ориентир для сравнения городов между собой, а не расчёт бюджета вашей семьи.`;
}

const CITY_SIZE_LABELS = new Map([
  ['SMALL', 'Небольшой город'],
  ['MEDIUM', 'Средний город'],
  ['LARGE', 'Большой город'],
]);

const CITY_SIZE_SHORT_LABELS = new Map([
  ['LARGE', 'Большой'],
  ['MEDIUM', 'Средний'],
  ['SMALL', 'Небольшой'],
]);

export function citySizeLabel(size) {
  return CITY_SIZE_SHORT_LABELS.get(size) || 'Нет данных';
}

const cityTemperatureBounds = (city, field, fallback) => {
  const values = Array.isArray(city[field])
    ? city[field].map(Number).filter(Number.isFinite)
    : temperatureNumbers(city[field]);
  if (values.length >= 2) return values.slice(0, 2);
  const value = Number(city[fallback]);
  return Number.isFinite(value) ? [value, value] : null;
};

export function sortCitiesForComparison(cities = [], key, direction = 'asc') {
  const rank = { LARGE: 0, MEDIUM: 1, SMALL: 2 };
  const value = (city) => {
    if (key === 'size') return Object.hasOwn(rank, city.size) ? [rank[city.size]] : null;
    if (key === 'cost') {
      const cost = Number(city.comparisonCost);
      return city.comparisonCost != null && Number.isFinite(cost) ? [cost] : null;
    }
    if (key === 'cold') return cityTemperatureBounds(city, 'coldRange', 'avgTempColdestMonthC');
    if (key === 'hot') {
      const bounds = cityTemperatureBounds(city, 'hotRange', 'avgTempHottestMonthC');
      return bounds ? [bounds[1], bounds[0]] : null;
    }
    return null;
  };
  const factor = direction === 'desc' ? -1 : 1;
  return cities.map((city, index) => ({ city, index, value: value(city) })).sort((a, b) => {
    if (!a.value) return b.value ? 1 : a.index - b.index;
    if (!b.value) return -1;
    for (let index = 0; index < Math.max(a.value.length, b.value.length); index += 1) {
      const difference = (a.value[index] ?? 0) - (b.value[index] ?? 0);
      if (difference) return difference * factor;
    }
    return a.index - b.index;
  }).map(({ city }) => city);
}

export function nextCitySortState(current = {}, key) {
  return { key, direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc' };
}

export function reorderCityComparisonRows(body, rows = [], key, direction) {
  const cityForRow = (row) => ({
    row,
    size: row.dataset.size,
    comparisonCost: row.dataset.cost === '' ? null : Number(row.dataset.cost),
    coldRange: row.dataset.coldLow === '' ? null : [Number(row.dataset.coldLow), Number(row.dataset.coldHigh)],
    hotRange: row.dataset.hotLow === '' ? null : [Number(row.dataset.hotLow), Number(row.dataset.hotHigh)],
  });
  const sorted = sortCitiesForComparison(rows.map(cityForRow), key, direction);
  sorted.forEach(({ row }) => body.append(row));
  return sorted.map(({ row }) => row);
}

const RP4_CITY_ROLE_LABELS = new Map([
  ['CAPITAL', 'Столица'],
  ['LARGE', 'Большой город'],
  ['MEDIUM', 'Средний город'],
  ['SMALL', 'Небольшой город'],
]);

const CITY_ROLE_LABELS = new Map([
  // Display labels produced by presentCities() enter the RP4 UI through this mapping.
  ['столица', 'Столица'],
  ['самый недорогой', 'Самый недорогой'],
  ['самый дорогой', 'Самый дорогой'],
  ['самый прохладный', 'Самый прохладный'],
  ['самый холодный', 'Самый прохладный'],
  ['самый жаркий', 'Самый жаркий'],
]);

export function cityCategories(size, roles = []) {
  const roleLabel = (role) => {
    const value = String(role).trim();
    if (RP4_CITY_ROLE_LABELS.has(value)) return RP4_CITY_ROLE_LABELS.get(value);
    const legacy = CITY_ROLE_LABELS.get(value.toLocaleLowerCase('ru'));
    if (legacy) return legacy;
    if (/^[A-Z_]+$/.test(value)) throw new TypeError(`Unsupported RP4 city structural role: ${value}`);
    return null;
  };
  const categories = [
    CITY_SIZE_LABELS.get(size),
    ...roles.map(roleLabel),
  ].filter(Boolean);
  return [...new Set(categories)];
}

export function russianMonths(value) {
  const months = Number(value);
  const mod100 = months % 100;
  const mod10 = months % 10;
  const word = mod100 >= 11 && mod100 <= 14 ? 'месяцев'
    : mod10 === 1 ? 'месяц' : mod10 >= 2 && mod10 <= 4 ? 'месяца' : 'месяцев';
  return `${months} ${word}`;
}

export function deduplicatedWorkRights(workRights = {}) {
  return [['Заявитель', workRights.applicant], ['Партнёр', workRights.partner]].flatMap(([subject, rights]) => {
    const rules = [...new Set((rights || []).map(({ rule }) => String(rule || '').trim()).filter(Boolean))];
    return rules.length ? [`${subject}: ${rules.join('; ')}`] : [];
  });
}

const normalizedApplicationSentinel = (value) => String(value || '').trim()
  .replace(/[\s.!?;:]+$/u, '')
  .toLocaleLowerCase('ru');

export function applicationPresentationText(item = {}) {
  const guidance = String(item.guidance || '').trim();
  const rawEntryGuidance = String(item.entryGuidance || '').trim();
  const entryGuidance = normalizedApplicationSentinel(rawEntryGuidance) === 'не применимо' ? '' : rawEntryGuidance;
  const details = [guidance, entryGuidance && entryGuidance !== guidance ? entryGuidance : null].filter(Boolean).join(' ');
  return `${item.methodLabel || ''}${details ? `: ${details}` : ''}`;
}

const temperatureNumbers = (value) => String(value ?? '')
  .replaceAll(',', '.')
  .match(/[−-]?\d+(?:\.\d+)?/g)
  ?.map((item) => Number(item.replace('−', '-')))
  .filter(Number.isFinite) || [];

export function formatTemperatureRange(value) {
  const numbers = Array.isArray(value) ? value.map(Number).filter(Number.isFinite) : temperatureNumbers(value);
  if (numbers.length >= 2) return `примерно ${numbers[0].toLocaleString('ru-RU')}–${numbers[1].toLocaleString('ru-RU')} °C`;
  if (numbers.length === 1) return `около ${numbers[0].toLocaleString('ru-RU')} °C`;
  return value ? String(value) : '';
}

export function formatCityTemperatureRange(value) {
  return formatTemperatureRange(value).replace(/^(?:примерно|около)\s+/u, '');
}

export function enrichCityCategories(cities = []) {
  if (!cities.length) return [];
  const researchedCategories = new Set(cities.flatMap((city) =>
    cityCategories(city.size ?? city.populationCategory, city.roles)));
  const cost = (city) => city.comparisonCostUsd == null ? Number.NaN : Number(city.comparisonCostUsd);
  const cold = (city) => temperatureNumbers(city.coldRange)[0] ?? Number(city.avgTempColdestMonthC);
  const hot = (city) => temperatureNumbers(city.hotRange).at(-1) ?? Number(city.avgTempHottestMonthC);
  const finite = (selector) => cities.filter((city) => Number.isFinite(selector(city)));
  const comparableCosts = cities.length > 1 && cities.every((city) => Number.isFinite(cost(city)));
  const mostExpensive = comparableCosts ? finite(cost).sort((a, b) => cost(b) - cost(a))[0] : null;
  const cheapest = comparableCosts ? finite(cost).sort((a, b) => cost(a) - cost(b))[0] : null;
  const coolest = finite(cold).sort((a, b) => cold(a) - cold(b))[0];
  const hottest = finite(hot).sort((a, b) => hot(b) - hot(a))[0];
  return cities.map((city) => ({
    ...city,
    categories: [...new Set([
      ...cityCategories(city.size ?? city.populationCategory, city.roles),
      !researchedCategories.has('Самый дорогой') && city === mostExpensive ? 'Самый дорогой' : null,
      !researchedCategories.has('Самый недорогой') && city === cheapest ? 'Самый недорогой' : null,
      !researchedCategories.has('Самый прохладный') && city === coolest ? 'Самый прохладный' : null,
      !researchedCategories.has('Самый жаркий') && city === hottest ? 'Самый жаркий' : null,
    ].filter(Boolean))],
  }));
}

const normalizedRouteText = (text) => String(text || '')
  .toLocaleLowerCase('ru')
  .replace(/[ё]/g, 'е')
  .replace(/[^\p{L}\p{N}]+/gu, ' ')
  .trim();

const routeTextTokens = (text) => new Set(normalizedRouteText(text)
  .split(' ')
  .filter((word) => word.length > 3)
  .map((word) => word.length > 6 ? word.slice(0, 6) : word));

const similarRouteText = (left, right) => {
  const a = normalizedRouteText(left);
  const b = normalizedRouteText(right);
  if (!a || !b) return false;
  if (a === b || a.includes(b) || b.includes(a)) return true;
  const aWords = routeTextTokens(a);
  const bWords = routeTextTokens(b);
  const shared = [...aWords].filter((word) => bWords.has(word)).length;
  return shared >= 2 && shared / Math.max(Math.min(aWords.size, bWords.size), 1) >= 0.6;
};

export function uniqueRouteActions(route = {}) {
  const requirements = route.initialPermitRequirements || [];
  const actionBackedConditions = new Set((route.checks || [])
    .filter((check) => check?.action && check?.condition)
    .map((check) => normalizedRouteText(check.condition)));
  const unpairedConditions = (route.conditions || [])
    .filter((condition) => !actionBackedConditions.has(normalizedRouteText(condition)));
  const unpairedMissing = (route.clientMissing || route.preliminary || [])
    .filter((condition) => !actionBackedConditions.has(normalizedRouteText(condition)));
  const candidates = [
    ...(route.actions || []),
    ...unpairedConditions,
    ...unpairedMissing,
  ];
  return candidates.reduce((items, candidate) => {
    if (!candidate) return items;
    if (requirements.some((requirement) => similarRouteText(candidate, requirement))) return items;
    if (items.some((item) => similarRouteText(item, candidate))) return items;
    items.push(candidate);
    return items;
  }, []);
}
