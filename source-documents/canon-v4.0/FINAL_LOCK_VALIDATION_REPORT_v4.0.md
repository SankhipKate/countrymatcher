# Country Matcher — Final Lock 4.0 validation report

Дата: 2026-08-08
Canon revision: `2026-08-08-final-lock`

## Статус

Этап 1 `Canon lock` завершён для MVP.

## Что зафиксировано

- Research Package runtime contract: `schema_version = 4.0` + `canon_revision = 2026-08-08-final-lock`.
- Все более ранние draft-пакеты с надписью `4.0` считаются superseded и должны быть пересобраны.
- Non-financial `ENGINE` использует `engine_rule`, а не `accepted_values` и не dot-path.
- INCOME alternatives имеют явный `income_owners`: `APPLICANT`, `PARTNER` или `SPONSOR`.
- `LOW` запрещён внутри финансового requirement.
- `ONLINE` — дополнительный канал, не географический способ подачи и не самостоятельный источник `SUITABLE`.
- `unmet_effect` применяется после оценки всей financial model, а неизвестная допустимая альтернатива не считается проваленной.
- `INCOME_OR_SAVINGS`: неизвестная альтернатива создаёт condition; окончательный fail модели может применить `unmet_effect`.
- `processing_time.official_days` сравнивается только как официальный числовой срок рассмотрения/решения одного смысла; отдельного `comparable` поля нет.
- «Самый прохладный» = min(`cold_min_c`), «Самый жаркий» = max(`hot_max_c`).
- Route-local blocking `open_item` скрывает конкретный route через `publishable=false`, но сам по себе не блокирует READY всей страны.
- `SUITABLE_WITH_CONDITIONS` без реального пользовательского condition запрещён как инвариант результата.

## Испания — миграционные правила Final Lock

- `ES_DNV_BASIS` и `ES_DNV_QUAL` остаются `DISPLAY_ONLY`.
- `ES_NLV_FIN` использует whole-model semantics: неизвестные savings не являются fail; если все допустимые альтернативы известны и fail, применяется `unmet_effect`.
- `ES_INTERNSHIP` временно `publishable=false` до закрытия blocking family gap.
- INCOME alternatives получают явного владельца. Для `ES_REUN_FIN` используется `SPONSOR`; финансовые `UNASKED_CONDITION` получают `asked_in_questionnaire=false`.
- Миграционный скрипт после записи обязан запускать schema + integrity validator и выдаёт PASS только после обоих PASS.

## Механические проверки этого Canon package

- все JSON-файлы разбираются;
- schema Draft 2020-12 проходит self-check;
- Python validator компилируется;
- Spain migration script компилируется;
- `canon_revision` присутствует в schema;
- `SPONSOR` допустим в `income_owners`;
- отсутствие `income_owners` у INCOME отклоняется;
- `LOW` у financial alternative отклоняется.

## Что ещё не является PASS

Полная миграция именно финального `ES-research-v3.0` от 2026-08-07 и validation получившегося `ES-research-v4.0.json` в этом окружении не запускались, потому что исходный пользовательский JSON находится вне локального sandbox Canon package. Это следующий контрольный шаг на рабочей копии проекта перед изменением core engine.

## Следующий этап

Этап 2: установить Final Lock Canon в локальную безопасную preview-копию, пересобрать Испанию 4.0 и получить schema + integrity PASS. Только затем менять core matching engine.


## Final Lock R2 — MVP role clarification

- `APPLICANT` = questionnaire respondent.
- `PARTNER` = accompanying adult.
- No new “main applicant” question was added.
- Spain migration uses explicit audited income-owner mapping.
- Unknown/new INCOME requirements fail migration instead of receiving a silent owner.


## Final Lock R3 — Partner Financial Shadow Check

Specification-only addition; no Research Package schema change.

Acceptance invariant:
- hint appears only when `partnerShadowFinancial = PASS` and `applicantFinancial != PASS`
  for at least one publishable route;
- the hint never changes route status or best-route selection;
- no full partner matching is performed.


## Final Lock R4 — wording lock

- Approved hint wording is present in MRS and Questionnaire & Results.
- Route names are not part of the user-facing hint.
- Shadow-check trigger wording now means “APPLICANT income is an allowed basis”, not “current applicant already passes”.


## Final Lock R5 — consistency check

PASS:
- approved generic hint wording retained;
- §8.11.11 no longer requires financial qualifiers in UI text;
- route names remain hidden;
- hint still does not claim partner route suitability;
- no non-financial-blocker filter added.
