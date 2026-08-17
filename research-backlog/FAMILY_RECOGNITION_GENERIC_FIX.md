# FAMILY_RECOGNITION — generic fix признания формы отношений

Статус: спроектирован, реализация отложена
Приоритет: высокий, но не аварийный
Спецификация: `research-backlog/COUNTRY_MATCHER_FAMILY_RECOGNITION_DECISIONS_2026-08-16.md`
Ветка: `feature/family-recognition` (база `15e59b5`, бэкап `backup/family-recognition-base-20260816-220324`)

## Проблема

Контракт различает форму отношений (`MARRIED` / `REGISTERED_PARTNERSHIP` / `UNREGISTERED_PARTNERSHIP`), но не различает, признаётся ли эта форма конкретной миграционной процедурой для однополой пары. Профиль не содержит состава пары; `lgbt.family_recognition_relevant` является display-флагом и для юридического матчинга непригоден.

## Следствия сегодня

1. `familyPathResult` может советовать «оформить признаваемый брак» там, где это для пары юридически невозможно.
2. Семейный путь может получить PASS для однополой пары там, где recognition не подтверждено.

В Paraguay это временно выражено информационным текстом и open item `PY_GAP_FAMILY_RECOGNITION_MACHINE`, без изменения generic contract.

## Согласованное решение

- optional `family.relationship_composition = SAME_SEX / DIFFERENT_SEX / UNKNOWN`; отсутствие нормализуется в `UNKNOWN`, без партнёра — `null`;
- optional recognition field на `familyScenario`: `RECOGNIZED / UNCONFIRMED / NOT_USED`;
- `NOT_USED` допустим только при `separate_route_required=true` или `join_stage=SEPARATE_ROUTE`, но это условие необходимое, не достаточное;
- relationship-form и recognition оцениваются независимо; `UNCONFIRMED` создаёт CONDITION даже если текущая форма отношений разрешена;
- recognition не наследуется из country-level LGBT block;
- одно recognition value относится ко всем `relationship_types` одного scenario; разные outcomes требуют разных scenarios;
- подтверждённое `NOT_RECOGNIZED` пока не маскируется как `UNCONFIRMED`: если такой факт установлен, это generic contract blocker;
- principal family basis остаётся `UNASKED_CONDITION`; `family_basis_alternatives[]` сейчас не вводится.

## Предусловие запуска

Запускать после объединения параллельных country/funnel работ в едином trunk. До этого generic branch не развивать: diff затрагивает schema, profile, engine, questionnaire, tests и все country packages.

## Порядок работ

1. prototype в отдельной ветке без заранее назначенной смены `schema_version`/`canon_revision`;
2. явный backfill всех active partner scenarios;
3. regressions active countries;
4. Paraguay как acceptance case и замена text workaround на machine semantics;
5. semantic/version audit;
6. только затем — отдельное согласование Canon и версии формата.

## Связанный технический долг

Признание юридического родительства в однополой семье в этот fix не входит; это отдельный класс проблемы.
