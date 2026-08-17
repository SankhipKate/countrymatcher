# Country Matcher — family recognition: принятые решения и вопрос Canon

Дата: 2026-08-16

## 1. Зачем понадобилось менять family contract

Проблема обнаружилась на Парагвае.

Country Matcher должен понимать не только форму отношений (`MARRIED`, `REGISTERED_PARTNERSHIP`, `UNREGISTERED_PARTNERSHIP`), но и признаётся ли эта форма отношений именно в конкретной миграционной семейной процедуре для однополой пары.

Общий национальный LGBT-блок для этого недостаточен: признание брака в стране в целом не гарантирует автоматически применимость конкретной migration procedure.

Существующие поля `family_scenarios[]` этот факт не выражают.

Пример:
- `AR_NOMAD_FAM` — партнёру нужно собственное независимое основание;
- `AR_FAMILY_DERIV` — партнёру нужна именно семейная связь.

При этом они могут иметь одинаковые `separate_route_required`, `join_stage` и `relationship_types`.

Поэтому факт «используется ли признание пары в этом scenario» должен храниться отдельно.

## 2. Принятые состояния

Для partner-applicable `familyScenario` нужен отдельный route-specific факт признания отношений:

- `RECOGNIZED` — семейный механизм использует связь пары, и её применимость к однополой паре подтверждена;
- `UNCONFIRMED` — семейный механизм использует связь пары, но применимость к однополой паре не подтверждена;
- `NOT_USED` — этот scenario вообще не использует связь пары как миграционное основание партнёра; партнёру нужен собственный/иной независимый статус.

`NOT_USED` выбрано вместо `NOT_APPLICABLE`, потому что `NOT_APPLICABLE` уже используется в `FAMILY_STATES` в другом смысле.

## 3. Защита для `NOT_USED`

`NOT_USED` допустим только если:

- `separate_route_required=true`, или
- `join_stage=SEPARATE_ROUTE`.

Это необходимое, но не достаточное условие.

То есть нельзя автоматически поставить `NOT_USED` только потому, что используется отдельный маршрут: `AR_FAMILY_DERIV` тоже формально соответствует этому условию, но семейная связь там является основанием и recognition relevant.

## 4. Поведение evaluator

Проверка формы отношений и проверка recognition — независимые проверки.

- `RECOGNIZED`: recognition-condition не создаётся; дальше действует обычная логика `relationship_types`.
- `UNCONFIRMED`: для `SAME_SEX` или `UNKNOWN` создаётся отдельный `CONDITION`, даже если текущий `relationship_type` уже разрешён. Formalization advice при этом не должен предлагать «оформить признаваемый брак/партнёрство».
- `NOT_USED`: recognition не оценивается и formalization advice по `relationship_types` не запускается. Остаются только реальные operational conditions scenario.

## 5. Новый факт профиля

Нужен optional:

`family.relationship_composition`

Значения:
- `SAME_SEX`
- `DIFFERENT_SEX`
- `UNKNOWN`

Его нельзя выводить из `lgbtEnabled` или `family_recognition_relevant`.

Старые профили без поля должны продолжать работать и runtime-нормализоваться в `UNKNOWN`.

## 6. Backfill активных стран

Active runtime сейчас включает:

- ES
- AR
- UY
- BR
- PT
- MX

Для исследованных partner-applicable scenarios новое значение должно быть задано явно.

Fail-safe default `UNCONFIRMED` нужен только для backward compatibility, а не вместо явного backfill.

Уже выявлены явные `NOT_USED`:
- `AR_NOMAD_FAM`
- `UY_DIGITAL_NOMAD_FAM`

## 7. Парагвай

Для Paraguay direct family route:

- семейная связь используется;
- признание иностранного same-sex marriage в текущей DNM procedure не подтверждено;
- значит нужно `UNCONFIRMED`, а не `NOT_USED`.

Если исследование когда-либо положительно установит именно непризнание, это нельзя маскировать как `UNCONFIRMED`. Это будет contract blocker, потому что текущая модель пока не выражает подтверждённое `NOT_RECOGNIZED`.

## 8. Почему возник вопрос об изменении Canon

Потому что новые правила затрагивают не только JSON, но и общую семантику matching:

1. появляется новый route-specific юридический факт;
2. определяется, когда он создаёт `CONDITION`;
3. вводится отдельная семантика `NOT_USED`;
4. меняется formalization advice;
5. запрещается выводить route recognition из общего LGBT-блока;
6. задаётся backward-compatible обработка старых профилей;
7. задаётся contract blocker для подтверждённого непризнания.

Это generic правило Research → RP4 → Engine, а не частный workaround для Парагвая.

Отсюда и возникло предположение, что Canon в финале, вероятно, придётся обновить.

## 9. Можно ли обойтись без изменения Canon

### Временно — да

Можно сначала сделать технический prototype:

- schema/profile;
- evaluator;
- backfill;
- tests;
- проверку Paraguay;

и Canon не менять.

Это позволяет доказать техническую корректность решения до нормативной правки.

### Как финальное состояние — нежелательно

Если код и пакеты используют новые правила, а Canon их не описывает, возникает расхождение:

- research standard не объясняет новое поле;
- новые исследования не знают, когда ставить `RECOGNIZED / UNCONFIRMED / NOT_USED`;
- reconciliation не знает про новый contract blocker;
- engine содержит нормативное поведение, которого нет в Canon.

То есть технически система может работать, но Canon перестаёт быть источником истины.

## 10. Принятый порядок дальше

Canon автоматически не менять.

Сначала:

1. технический prototype в отдельной ветке;
2. без заранее придуманной смены `schema_version` или `canon_revision`;
3. schema/integrity/engine/profile/full tests;
4. проверка backfill active packages;
5. Paraguay как acceptance case;
6. semantic/version audit;
7. отдельно показать, какие именно изменения Canon реально требуются;
8. менять Canon только после отдельного явного согласования.

## 11. Текущая Git-точка

Рабочая ветка:

`feature/family-recognition`

Base:

`15e59b5 Integrate Mexico RP4`

Backup:

`backup/family-recognition-base-20260816-220324`

Последний предложенный большой блок с правками Canon не был запущен.
