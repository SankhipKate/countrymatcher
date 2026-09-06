# IE — Research → Canon reconciliation

Дата последней targeted reconciliation: 2026-09-06
Страна: Ирландия (`IE`)
Research package: v4.0, research date 2026-09-06
Canon revision: `2026-08-08-final-lock`
Режим: Ireland country migration поверх принятого generic Family Coverage Completeness contract; без изменения RP4 schema, questionnaire, family engine или UI.

## Итоговый вердикт

**COUNTRY RECONCILIATION PASS; FAMILY RELEASE GATE CLOSED.**

Исследовательских `open_items` по Ирландии нет. STEP, Study financing, June 2026 overseas-civil-partnership treatment и полный questionnaire family domain сопоставлены с Canon/RP4.

Family migration не вводит универсального правила `18–25`: возраст 18 используется только как подтверждённая граница совершеннолетия в Ирландии, а legal conditions adult-dependent child приходят из конкретных family regimes. Adult scenarios имеют `child_age_min = 18` и open upper bound; значение 25 остаётся только границей текущей анкеты.

## 1. Targeted corrections 2026-09-05

### 1.1 STEP недоступен гражданам РФ

Официальный ISD STEP source устанавливает, что новые заявления от граждан России и Беларуси не принимаются.

Final mapping:

- `IE_STEP` отсутствует из `routes[]`;
- coverage `ENTREPRENEURSHIP_SELF_EMPLOYMENT = UNAVAILABLE_TO_RU`;
- STEP сохраняется в statutory/research inventory и источниках;
- 50 000 € STEP не участвуют в matching целевой аудитории Country Matcher.

Generic engine change не требуется.

### 1.2 Study financing не сводится к личным savings

Официальные правила допускают self funding, sponsor support, government/other funding и scholarship. Анкета не устанавливает sponsor/government/scholarship funding, поэтому отсутствие 10 000 € личных savings не может автоматически давать `UNSUITABLE`.

Final mapping:

- `IE_STUDY_FIN.evaluation_mode = UNASKED_CONDITION`;
- `unmet_effect = BECOMES_CONDITION`;
- alternatives включают `SAVINGS`, `SPONSOR`, `SCHOLARSHIP`;
- неизвестный допустимый источник funding не превращается в FAIL.

### 1.3 Overseas civil partnership

Non-EEA Family Reunification Policy от 12 июня 2026 года устанавливает: overseas civil partnership, законно заключённое в юрисдикции, где такая форма признаётся, для этой policy рассматривается как эквивалент брака. De facto partnership отдельно требует genuine/durable relationship и как минимум два года совместного проживания.

Поэтому blanket post-2016 fallback удалён из Non-EEA family mapping. Country-level labels остаются `registered_partnership_recognized = PARTIAL` и `foreign_documents_recognized = CONDITIONAL`, поскольку общий civil-law status и специальное immigration-policy treatment не смешиваются.

## 2. Family Coverage Completeness migration 2026-09-06

### 2.1 Static research completeness vs runtime formalization

Принятый generic contract требует статического доказательства coverage каждого questionnaire relationship input прямым присутствием конкретного значения в `scenario.relationship_types`. Runtime formalization fallback не считается доказательством research completeness.

IE выполняет это требование без country-specific engine logic: каждый partner scenario прямо перечисляет:

- `MARRIED`;
- `REGISTERED_PARTNERSHIP`;
- `UNREGISTERED_PARTNERSHIP`.

Физически отдельные competing partner scenarios не нужны для доказательства completeness. Один scenario допустим, когда он прямо покрывает все три inputs и его legal/copy semantics корректно описывают различия формы отношений. Это одновременно избегает ложного объединения equal-rank formalization alternatives текущим generic resolver.

### 2.2 Child coverage matrix

| Route | 0–17 | 18+ | Questionnaire 0–25 resolved |
|---|---|---|---|
| `IE_STAMP0_INDEPENDENT` | `NOT_AVAILABLE` | `NOT_AVAILABLE` | PASS |
| `IE_CSEP` | simultaneous minor child | dependent adult child after 24 months, special dependency + Stamp 0 + higher finance | PASS |
| `IE_GEP` | later family join after 12 months | dependent adult child after 60 months, special dependency + Stamp 0 + higher finance | PASS |
| `IE_ICT` | simultaneous minor child | dependent adult child after 24 months | PASS |
| `IE_STUDY` | `NOT_AVAILABLE` for ordinary Study route | `NOT_AVAILABLE` | PASS |
| `IE_RESEARCHER` | simultaneous minor child | dependent adult child after 24 months | PASS |
| `IE_FAMILY_NON_EEA` | separate family path | dependent adult child, Category B/C timing 24/60 months | PASS |
| `IE_PROTECTION` | statutory later family path after 24 months | statutory adult-dependent-child path after 24 months | PASS |

No questionnaire child age `0…25` is left without an applicable researched scenario.

### 2.3 Adult child evidence and semantics

- Irish Age of Majority Act confirms full age at 18; therefore `0–17` minor / `18+` adult is evidence-based for the Irish mapping.
- Non-EEA Family Reunification Policy treats an adult child as a separate dependent category where dependency arises from a serious medical or psychological condition; Category B sponsorship is after 2 years, Category C after 5 years, with Stamp 0 / higher financial requirements.
- International protection uses its own statutory family regime: adult child may qualify on long-term dependency or mental/physical disability; current regime has a 2-year waiting period after protection grant.
- Adult scenarios use `child_age_max = null`; Country Matcher tests ages through 25 only because that is the questionnaire domain, not because Irish law creates a universal age-25 limit.

### 2.4 Why no schema / questionnaire / engine change is required

Existing RP4 fields already represent:

- `child_age_min` / `child_age_max`;
- direct relationship inputs;
- later/separate family paths;
- explicit `NOT_AVAILABLE`;
- source-backed conditions.

The accepted system change therefore belongs to Canon/validator/tests plus country data migration. IE does not require a new dependency question or a country-specific runtime branch. Conditions such as medical/psychological dependency remain legal conditions in the route result; they are not silently assumed satisfied.

## 3. Route/publication reconciliation

| Research fact / route | Final RP4 representation | Status |
|---|---|---|
| Digital Nomad route отсутствует | `route_coverage = NO_ROUTE`; route не создаётся | CONFIRMED |
| `IE_STAMP0_INDEPENDENT` | publishable; 50 000 €/год допустимого индивидуального дохода остаются `ENGINE`; family explicit NOT_AVAILABLE | CONFIRMED |
| `IE_CSEP` | publishable; future offer/salary = `UNASKED_CONDITION`; Category B family coverage complete | CONFIRMED |
| `IE_GEP` | publishable; future offer/salary = `UNASKED_CONDITION`; Category C family coverage complete | CONFIRMED |
| `IE_ICT` | `publishable = false` по product publication boundary; family inventory complete | CONFIRMED |
| STEP | `UNAVAILABLE_TO_RU`; `IE_STEP` отсутствует в `routes[]` | CONFIRMED |
| `IE_STUDY` | publishable; admission и multi-source finance = `UNASKED_CONDITION`; ordinary route has explicit family NOT_AVAILABLE | CONFIRMED |
| `IE_RESEARCHER` | publishable; Hosting Agreement = `UNASKED_CONDITION`; Category B family complete | CONFIRMED |
| `IE_FAMILY_NON_EEA` | `publishable = false`; minor/adult-dependent inventory retained | CONFIRMED |
| `IE_PROTECTION` | publishable; individual protection basis = `UNASKED_CONDITION`; statutory family coverage complete | CONFIRMED |
| IIP закрыта для новых заявок | `route_coverage = NO_ROUTE`; route не создаётся | CONFIRMED |
| Stamp 4 / LTR / Stamp 5 | long-term stages, не initial user routes | CONFIRMED |

Итого: **8 routes, 6 publishable, 2 hidden**.

## 4. Finance reconciliation

| Fact | RP4 mapping | Guardrail |
|---|---|---|
| Stamp 0 около 50 000 €/год | annual EUR, applicant-only income; `ENGINE`, `BLOCKS` | savings не заменяют annual income |
| Stamp 0 contingency/lump sum | `DISPLAY_ONLY`, без выдуманного fixed threshold | не превращать housing price в legal threshold |
| CSEP salary | future local salary; `UNASKED_CONDITION` | не сравнивать с current foreign income |
| GEP salary | future local salary; `UNASKED_CONDITION` | специальные lower thresholds не выдавать за universal |
| Study 10 000 € | `UNASKED_CONDITION`; `SAVINGS` / `SPONSOR` / `SCHOLARSHIP` | отсутствие личных savings не = FAIL |
| Category B family | separate adult-dependency financial test retained as legal condition | не invent universal nuclear-family amount |
| Category C family | sponsor-policy condition + official tables | partner income автоматически не суммировать |

Official monetary amounts остаются в EUR; hardcoded legal USD отсутствует.

## 5. Publication boundary

Publishable routes:

- `IE_STAMP0_INDEPENDENT`;
- `IE_CSEP`;
- `IE_GEP`;
- `IE_STUDY`;
- `IE_RESEARCHER`;
- `IE_PROTECTION`.

Hidden по product publication boundary:

- `IE_ICT`;
- `IE_FAMILY_NON_EEA`.

STEP не hidden route: он полностью отсутствует из `routes[]` как `UNAVAILABLE_TO_RU`.

## 6. Acceptance status

| Check | Result |
|---|---|
| Research blocks complete | PASS |
| Research open items | 0 |
| STEP RU availability mapping | PASS |
| Study sponsor/scholarship finance mapping | PASS |
| June 2026 Non-EEA civil-partnership legal fact | PASS |
| Direct coverage of all 3 relationship inputs | PASS |
| Child questionnaire domain 0–25 | PASS |
| Adult-child evidence / route-specific timing | PASS |
| RP4 schema change required | NO |
| Questionnaire change required | NO |
| Country-specific engine logic added | NO |
| Current RP4 schema validation | PASS |
| Current RP4 integrity validation | PASS |
| Strict family-coverage audit | PASS |
| IE-specific regression | 14/14 PASS |
| Focused IE/family regression | 39/39 PASS |
| Ready for final release verification | **YES** |
