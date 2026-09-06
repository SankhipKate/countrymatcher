# IE — RP4 build validation

Дата последней проверки: 2026-09-06
Файл: `IE-research-v4.0.json`
Target release: CountryMatcher 18.0.0

## Вердикт

**RP4 / FAMILY MIGRATION PASS; READY FOR FINAL RELEASE VERIFICATION.**

IE package валиден по current schema/integrity, проходит strict opt-in Family Coverage Completeness audit и полный targeted runtime matrix questionnaire family domain.

## Current RP4 state

- Routes: **8**.
- Publishable: **6**.
- Hidden product-boundary routes: **2** (`IE_ICT`, `IE_FAMILY_NON_EEA`).
- `IE_STEP` отсутствует: entrepreneurship/self-employment coverage = `UNAVAILABLE_TO_RU`.
- Family scenarios: **22**.
- Child domain: every integer questionnaire age **0–25 resolved**; adult scenarios use open legal upper bound rather than inventing age 25 as a legal limit.
- Partner domain: all three questionnaire relationship values are directly present in each partner scenario.
- Sources: **56/56 referenced**.
- Open research items: **0**.

## Corrections retained from 2026-09-05

1. STEP excluded from `routes[]` for current RU audience.
2. Study finance supports permissible non-self funding without false hard failure.
3. Non-EEA family/LGBT copy follows June 2026 policy for qualifying overseas civil partnerships.
4. Blanket post-16-May-2016 de-facto fallback removed from Non-EEA family semantics.

## Family migration 2026-09-06

1. Added evidence-backed age-majority boundary: full age at 18.
2. Category B (`CSEP`, `ICT`, researcher) now has minor `0–17` plus dependent-adult `18+` scenarios; adult path after 24 months with special dependency / Stamp 0 / higher finance conditions.
3. Category C (`GEP`) has minor path after 12 months and dependent-adult path after 60 months.
4. `IE_FAMILY_NON_EEA` retains both minor and adult-dependent inventory.
5. International protection has separate minor/adult dependent scenarios under current statutory regime.
6. Ordinary Study and independent Stamp 0 explicitly cover all child ages with `NOT_AVAILABLE` instead of leaving data gaps.
7. All partner scenarios directly enumerate `MARRIED`, `REGISTERED_PARTNERSHIP`, `UNREGISTERED_PARTNERSHIP` for static completeness; no validator text heuristics are used.
8. No RP4 schema, questionnaire or country-specific engine change was required.

## Checks completed before full release gate

| Check | Result |
|---|---|
| JSON parse | PASS |
| Current RP4 schema | PASS |
| Integrity/source references | PASS |
| Strict family coverage audit | PASS |
| Defined sources | 56 |
| Referenced sources | 56 |
| Undefined/unused sources | 0 / 0 |
| Route count | 8 |
| Publishable / hidden | 6 / 2 |
| Family scenarios | 22 |
| IE-specific Node regression | 14/14 PASS |
| Focused IE/family suite | 39/39 PASS |
| Ages 0–25 produce no IE family data-contract gap | PASS |
| All three relationship inputs direct-covered | PASS |

Final repository-wide release verification is recorded separately in `IE_INTEGRATION_VERIFICATION_18.0.0_2026-09-06.md`.
