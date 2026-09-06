# Ireland RP4 integration verification

Date updated: 2026-09-06
Target release: CountryMatcher 18.0.0
Base archive: CountryMatcher-main 17.0.2 (2026-09-06)

## Result

**IRELAND COUNTRY OVERLAY PASS.**

This artifact is built on the released 17.0.2 Family Coverage base. The generic family validator, generic family runtime tests, Canon standards and operational prompt are preserved from the supplied 17.0.2 archive without modification. The overlay adds only Ireland country data/research/test material plus the required country-registration, QoL, version and generated release-document updates.

No unresolved Ireland research, mapping, schema, questionnaire or country-specific engine blocker remains.

## Ireland corrections incorporated

- STEP is unavailable to Russian citizens and is not published as an IE route.
- Study finance does not false-block profiles that may use sponsor, government or scholarship funding.
- June 2026 Non-EEA family-policy treatment of qualifying overseas civil partnerships is reflected in IE data.
- Adult children are researched as country-specific dependent-adult paths rather than a mechanical extension of minor-child eligibility.
- All questionnaire child ages 0–25 and all three relationship inputs have direct structured outcomes.
- On the 17.0.2 base, the two `IE_FAMILY_NON_EEA` `SEPARATE_ROUTE` scenarios for partner/minor child link to `IE_FAMILY_NON_EEA` itself, matching the released generic contract that a separate family path must carry `linked_route_id` or `member_long_term_path`.

## Current integration facts

- Ireland Research Package: `data/IE-research-v4.0.json`.
- Routes: **8 total / 6 publishable / 2 hidden**.
- Family scenarios: **22**.
- Active-country manifest: Ireland is country **18**, introduced in `18.0.0`.
- Quality of Life editorial entry: present.
- Candidate `VERSION`: `18.0.0`.
- Sources: **56 defined / 56 referenced**, unused 0, undefined 0.
- Research open items: **0**.

## Verification on the 17.0.2-based overlay

| Check | Result |
|---|---|
| IE JSON schema | PASS |
| IE integrity/source references | PASS |
| IE strict `--family-coverage` audit | PASS |
| All active RP4 packages via normal Python validator | **18/18 PASS** |
| IE-specific Node regression | **14/14 PASS** |
| Generic family-entry runtime regression | **20/20 PASS** |
| Release/manifest/QoL + IE focused Node suite | **41/41 PASS** |
| Node suite excluding the 5 AJV-dependent files | **627/627 PASS** |
| `node scripts/release-sync.mjs --check` | PASS |
| Generic 17.0.2 validator/family tests/Canon files changed by overlay | **NO** |

## Full verifier note

The sandbox root `bash ./verify` reaches `VERIFY 3/7: NODE DEPENDENCIES` and then cannot finish `npm ci` because registry access is unavailable in this environment. The five AJV-dependent test files therefore require the normal Mac/CI environment with npm dependencies available.

The earlier Ireland RC completed the full verifier on the user's Mac, and Safari browser smoke passed 6/6 profiles with no HTTP errors. Because this overlay changes the base to 17.0.2 and makes one additional hidden-route data-contract correction, the exact final artifact should receive one final root `bash ./verify` in the normal local/CI environment before merge. No further generic Family Coverage migration is part of this Ireland overlay.
