# Франция — финальная проверка RP4 mapping

Дата: 2026-09-04
Файл: `FR-research-v4.0.json`
Вердикт: **RP4 JSON READY**

## Provenance

Файл создан из закрытого France research package и `FR_RESEARCH_TO_CANON_RECONCILIATION_2026-09-03.md`. Проверка выполнена против предоставленного project snapshot `15.0.0`. В ZIP отсутствует `.git`, поэтому фактический `origin/main` и SHA этим этапом не подтверждаются.

## Структура

- Canon/schema: `4.0`; revision `2026-08-08-final-lock`.
- Statutory concepts: 16.
- RP4 branches: 17.
- Publishable branches: 12.
- Hidden by existing product boundary: 5 (`FR_ICT`, `FR_FAMILY_REUNIFICATION`, `FR_ASYLUM`, `FR_STUDENT_TRAINEE`, `FR_VOLUNTEER`).
- Open items: 0.
- Cities: 4; у каждого полный basket `RENT_STANDARD`, `UTILITIES`, `GROCERIES`, `TRANSPORT`.

## Существенное mapping-решение

Visitor разделён на две RP4-ветки без изменения юридического inventory:

1. `FR_VISITOR` — собственный допустимый регулярный доход или накопления; `ENGINE`.
2. `FR_VISITOR_SPONSOR` — поддержка платежеспособного третьего лица; `UNASKED_CONDITION`.

Так достаточные собственные ресурсы дают `SUITABLE`, а неизвестная анкете sponsor-возможность не превращается в ложный FAIL.

## Проверки

- Schema validation: PASS.
- Integrity validation: PASS.
- Unique route and requirement identifiers: PASS.
- Source-reference integrity: PASS.
- Full city basket: PASS.
- Active RP4 package assertion: PASS.
- Engine smoke: PASS.
- Visitor income at €1,477.93/month: `SUITABLE`.
- Visitor savings at €17,735.19: `SUITABLE`.
- Below own-resource threshold: own branch `UNSUITABLE`, sponsor branch `SUITABLE_WITH_CONDITIONS`.
- Current foreign salary does not satisfy future French employment/Blue Card salary: PASS.
- Investment represented as `INVESTMENT_CAPITAL/CAPITAL/ONE_TIME`: PASS.
- Student EU-LTR counting `PARTIAL` + `REQUIRES_CHANGE_OF_BASIS`: PASS.
- Specialised routes remain unpublished: PASS.

## Scope

Это standalone RP4 artifact. Франция не добавлялась в `ACTIVE_RP4_PACKAGES`; repository, version, generic schema, validator, engine, questionnaire, QoL и GitHub не изменялись.

- Adult child 18+ own-basis scenario: PASS.
- Registered partnership is not silently treated as spouse for ordinary/talent family mechanisms: PASS.
- User-facing FR package has no `statutory inventory` / `product publication boundary` Ruglish: PASS.
