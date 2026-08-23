const html = (text) => String(text ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

export function mergeRouteSpecificAnswer(
  existingAnswers,
  routeId,
  questionId,
  value,
) {
  for (const [label, item] of [
    ['routeId', routeId],
    ['questionId', questionId],
    ['value', value],
  ]) {
    if (typeof item !== 'string' || !item.trim()) {
      throw new TypeError(`${label} must be a non-empty string`);
    }
  }

  const current =
    existingAnswers
    && typeof existingAnswers === 'object'
    && !Array.isArray(existingAnswers)
      ? existingAnswers
      : {};

  const routeAnswers =
    current[routeId]
    && typeof current[routeId] === 'object'
    && !Array.isArray(current[routeId])
      ? current[routeId]
      : {};

  return {
    ...current,
    [routeId]: {
      ...routeAnswers,
      [questionId]: value,
    },
  };
}

export function renderRouteSpecificFollowUps(route) {
  const followUps = Array.isArray(route?.routeSpecificFollowUps)
    ? route.routeSpecificFollowUps
    : [];

  if (!followUps.length) return '';

  const routeId = route.routeId;

  return followUps.map((question) => {
    const groupName =
      `route-follow-up-${routeId}-${question.questionId}`;

    const options = (question.options || []).map((option) =>
      `<label><input type="radio" name="${html(groupName)}" value="${html(option.value)}"><span>${html(option.label)}</span></label>`
    ).join('');

    return `<section class="follow-up-card" data-route-follow-up data-route-id="${html(routeId)}" data-question-id="${html(question.questionId)}">
      <h4>Уточните результат по этому маршруту</h4>
      <p>Ответ нужен только для проверки этого варианта переезда.</p>
      <fieldset class="choice-group route-follow-up-question">
        <legend>${html(question.prompt)}</legend>
        <div class="segmented route-follow-up-options">${options}</div>
      </fieldset>
      <button class="primary-button" type="button" data-route-follow-up-submit>Пересчитать маршрут</button>
      <p class="inline-field-error" data-route-follow-up-error role="alert" hidden>Выберите один вариант.</p>
    </section>`;
  }).join('');
}
