# Country Matcher — Боливия (BO): Research → Canon reconciliation

**Дата:** 2026-09-06
**Research input:** `BO_BOLIVIA_COUNTRY_RESEARCH_2026-09-06.md`, READY FOR RECONCILIATION
**Repository baseline:** commit `f14a558da36f55b99f5a3846538b33e484eefe21`, product `18.0.1`
**Canon:** Research Package 4.0, `canon_revision = 2026-08-08-final-lock`
**Scope:** mapping research facts into Canon/RP4 semantics. This document does not create RP4 JSON and does not integrate Bolivia.

## 1. Reconciliation verdict

**READY FOR RP4.** All material research facts have a defensible Canon mapping. No generic schema change and no country-specific runtime logic are required.

| Gate | Decision |
|---|---|
| Research completeness | PASS — 0 blocking gaps |
| 13-category coverage | PASS |
| Publishable routes | 4 |
| Hidden inventory/supporting routes | 4 |
| Family domain | PASS — all relationship inputs and child ages 0–25 mapped |
| City publication minimum | PASS — direct cost observation for every displayed city |
| LGBT publication minimum | PASS |
| Contract changes | None required |
| RP4 readiness | **READY** |

## 2. Route and publication mapping

| Proposed RP4 route_id | Research fact | Canon categories | Publishable | Rationale |
|---|---|---|---|---|
| `BO_EMPLOYED_WORK` | DIGEMIG t22, employed work, 1/2/3 years | `LOCAL_EMPLOYMENT` | true | Ordinary independent relocation strategy; requires Bolivian employer/invitation or contract. |
| `BO_SELF_EMPLOYED_WORK` | DIGEMIG t23, lucrative work without employment relationship, 1/2/3 years | `ENTREPRENEURSHIP_SELF_EMPLOYMENT` | true | Separate administrative procedure and materially different basis evidence from t22. |
| `BO_STUDY` | DIGEMIG t29/t30, study, 1/2/3 years | `STUDY` | true | Ordinary initial strategy, but does not itself lead to definitive residence. |
| `BO_INTERNATIONAL_PROTECTION` | Refugee protection under Ley 251 | `INTERNATIONAL_PROTECTION` | true | Canon category must remain represented; individual merits are not scored. |
| `BO_FAMILY` | DIGEMIG t27/t28 | `FAMILY` | false | Supporting/separate route requiring a family member already living in Bolivia; used by family scenarios, not shown as independent initial strategy. |
| `BO_HEALTH_HUMANITARIAN` | t31/t32 and statutory humanitarian grounds | `OTHER` | false | Narrow fact-specific basis; retained in inventory. |
| `BO_AGREEMENT_RELIGIOUS_WORK` | t24/t25/t26 and corresponding definitive routes | `OTHER` | false | Specialized institutional/religious basis within product publication boundary. It does not prove a general ICT route. |
| `BO_SHORT_BUSINESS_TRANSITORY` | multiple business visa and t15–t21 | `OTHER` | false | Entry/short-stay permission, not a residence-by-investment route. |

### 2.1 Thirteen Canon categories

| Canon category | Coverage decision |
|---|---|
| `DIGITAL_NOMAD_REMOTE_WORK` | `NO_ROUTE`; t23 is not mapped to foreign remote employment. |
| `INCOME_FINANCIALLY_INDEPENDENT` | `NO_ROUTE`; solvency is evidence, not an independent basis. |
| `RETIREMENT` | `NO_ROUTE`; pension can evidence funds but creates no route. |
| `LOCAL_EMPLOYMENT` | `BO_EMPLOYED_WORK`. |
| `HIGHLY_QUALIFIED_SPECIALIST` | `NO_ROUTE`; ordinary work route may apply, but there is no special category. |
| `INTRA_COMPANY_TRANSFER` | Covered only by hidden specialized inventory; no publishable general ICT strategy. |
| `ENTREPRENEURSHIP_SELF_EMPLOYMENT` | `BO_SELF_EMPLOYED_WORK`. |
| `INVESTMENT` | Hidden short business permission; no residence-by-investment strategy. |
| `STUDY` | `BO_STUDY`. |
| `FAMILY` | Hidden supporting `BO_FAMILY`. |
| `GENERAL_RESIDENCE` | `NO_ROUTE`; definitive residence is a later stage. |
| `INTERNATIONAL_PROTECTION` | `BO_INTERNATIONAL_PROTECTION`. |
| `OTHER` | Hidden health/humanitarian/religious/short-stay inventory. |

## 3. Requirement semantics

### 3.1 BO_EMPLOYED_WORK

| Requirement | Canon mapping | Effect |
|---|---|---|
| Bolivian invitation plus company documents, labor contract approved by labor authority, or notarized civil contract plus company documents | `EMPLOYMENT_BASIS`, `UNASKED_CONDITION`, `requires_separate_basis = true`, `BECOMES_CONDITION` | The questionnaire does not prove a qualifying Bolivian contract. |
| Solvency supported by 3-month statements, contract, rent/sale income or related evidence | `FINANCIAL`, `DISPLAY_ONLY`, `NO_FIXED_THRESHOLD` | No numeric PASS/FAIL. Presence of general income must not imply approval. |
| Passport, status, criminal/medical/yellow-fever/photo/payment documents | `DISPLAY_ONLY` | Filing checklist only. |

### 3.2 BO_SELF_EMPLOYED_WORK

| Requirement | Canon mapping | Effect |
|---|---|---|
| Sworn declaration describing the lucrative activity, its place and intended stay in Bolivia | `OTHER_BASIS`, `UNASKED_CONDITION`, `requires_separate_basis = true`, `BECOMES_CONDITION` | Self-employment income type alone does not prove the Bolivian activity plan. |
| Solvency evidence | `FINANCIAL`, `DISPLAY_ONLY`, `NO_FIXED_THRESHOLD` | No numeric screening. |
| General filing documents | `DISPLAY_ONLY` | No matching effect. |

`allowed_income_types` must not be used to convert foreign remote employment into a positive match. The route basis is a Bolivian lucrative activity, not a digital-nomad permission.

### 3.3 BO_STUDY

| Requirement | Canon mapping | Effect |
|---|---|---|
| Admission/enrolment in qualifying education | `STUDY_BASIS`, `UNASKED_CONDITION`, `requires_separate_basis = true`, `BECOMES_CONDITION` | Questionnaire does not verify admission. |
| Solvency evidence | `FINANCIAL`, `DISPLAY_ONLY`, `NO_FIXED_THRESHOLD` | No invented amount. |
| General documents | `DISPLAY_ONLY` | Filing checklist. |

### 3.4 BO_INTERNATIONAL_PROTECTION

| Requirement | Canon mapping | Effect |
|---|---|---|
| Individual protection facts under Ley 251 | `PROTECTION_BASIS`, `UNASKED_CONDITION`, `requires_separate_basis = true`, `BECOMES_CONDITION` | Russian nationality neither proves nor excludes eligibility. |

## 4. Finance reconciliation

| Route | Official comparison | Questionnaire mapping | Practical guidance | Screening threshold |
|---|---|---|---|---|
| `BO_EMPLOYED_WORK` | `NO_FIXED_THRESHOLD` | Not safely evaluable; `DISPLAY_ONLY` | Historical USD 300/month has LOW confidence | null |
| `BO_SELF_EMPLOYED_WORK` | `NO_FIXED_THRESHOLD` | Not safely evaluable; `DISPLAY_ONLY` | Same weak historical observation | null |
| `BO_STUDY` | `NO_FIXED_THRESHOLD` | Not safely evaluable; `DISPLAY_ONLY` | `NOT_FOUND` | null |
| `BO_FAMILY` | `NO_FIXED_THRESHOLD` | Not safely evaluable; `DISPLAY_ONLY` | `NOT_FOUND` | null |

Decision: no `practical_screening_threshold`. The only number found is old, unofficial, and not sufficient to defend an ENGINE boundary. It may be retained as a clearly dated LOW-confidence note only if the RP4 schema allows it without affecting matching; otherwise omit it rather than upgrade its authority.

## 5. Family coverage reconciliation

### 5.1 Common timing rule

For `BO_EMPLOYED_WORK`, `BO_SELF_EMPLOYED_WORK` and `BO_STUDY`, family members are not derivative applicants. The foreign sponsor must first reside in Bolivia and hold a CIE; partner/children then file separate t27/t28 applications. Proposed common values:

- `simultaneous_move = NO`;
- `separate_route_required = true`;
- `linked_route_id = BO_FAMILY`;
- `join_stage = SEPARATE_ROUTE`;
- separation months remain null because the only official processing SLA is 24 hours after a complete filing, not a guaranteed elapsed family-separation period.

### 5.2 Partner matrix — repeated for each ordinary publishable route

| Route | Questionnaire relationship_type | Proposed scenario_id | Researched outcome | RP4 representation | Sources | Coverage |
|---|---|---|---|---|---|---|
| `BO_EMPLOYED_WORK` | `MARRIED` | `BO_EMP_FAM_PARTNER_MARRIED` | Separate later t27 with legalized marriage certificate; for foreign same-sex marriage use recognized Bolivian unión libre path | Direct scenario with `relationship_types=[MARRIED]`; condition explains sequence/formalization where applicable | BO-S26, BO-S27, BO-S28 | COVERED |
| `BO_EMPLOYED_WORK` | `REGISTERED_PARTNERSHIP` | `BO_EMP_FAM_PARTNER_REGISTERED` | Available after Bolivian recognition/registration as unión libre | Explicit scenario with `relationship_types=[REGISTERED_PARTNERSHIP]`, conditional formalization in text | BO-S26, BO-S27, BO-S28 | COVERED |
| `BO_EMPLOYED_WORK` | `UNREGISTERED_PARTNERSHIP` | `BO_EMP_FAM_PARTNER_UNREGISTERED` | Available after registration/judicial recognition of unión libre | Explicit scenario with `relationship_types=[UNREGISTERED_PARTNERSHIP]` | BO-S26, BO-S27, BO-S28 | COVERED |
| `BO_SELF_EMPLOYED_WORK` | all three, separately | `BO_SELF_FAM_PARTNER_*` | Same t27 outcomes | Three explicit scenarios; no cross-type inference | BO-S26, BO-S27, BO-S28 | COVERED |
| `BO_STUDY` | all three, separately | `BO_STUDY_FAM_PARTNER_*` | Same t27 outcomes | Three explicit scenarios; no cross-type inference | BO-S26, BO-S27, BO-S28 | COVERED |
| `BO_INTERNATIONAL_PROTECTION` | all three | `BO_PROTECTION_FAMILY_UNITY` | Ley 251 extends protection to spouse or cohabiting partner | Explicit `PARTNER` scenarios per relationship type; condition/protection basis remains unasked | BO-S37 | COVERED |

Important contract decision: each input value is listed directly in its own scenario because the validator cannot infer formalization. This is data mapping, not a schema extension.

### 5.3 Child matrix — repeated for each ordinary publishable route

| Route group | Questionnaire age | Proposed scenario_id | Outcome | RP4 representation | Sources | Coverage |
|---|---:|---|---|---|---|---|
| Work/self-employed/study | 0–17 | `*_FAM_CHILD_MINOR` | Separate later t28 based on birth/adoption/guardianship evidence | `applies_to=CHILD`, `child_age_min=0`, `child_age_max=17` | BO-S26 | COVERED |
| Work/self-employed/study | 18–25 | `*_FAM_CHILD_ADULT_DEPENDENT` | Separate later t27 if economic dependency is documented by notarized sponsor letter and sworn declaration | `applies_to=CHILD`, `child_age_min=18`, `child_age_max=25`; condition states dependency | BO-S26 | COVERED |
| International protection | 0–25 | `BO_PROTECTION_CHILD` | Ley 251 extends status to descendants and economically dependent siblings, and to minors/adults under guardianship | Explicit child ranges 0–17 and 18–25 with the applicable descent/dependency/guardianship condition | BO-S37 | COVERED |

The adult-child scenario is conditional, not automatic. Student status, unmarried status and disability are not substituted for the published dependency test. Disability may support evidence of dependency but is not a separate age exception.

### 5.4 Combined partner-and-children profiles

The engine combines member-specific scenarios. Every profile containing partner only, children only, or partner plus children resolves because:

1. each relationship input has a direct partner scenario;
2. 0–17 and 18–25 form a complete, non-gapped age union;
3. every member uses the same linked `BO_FAMILY` sequence;
4. the presence of one qualifying member does not mask another non-qualifying member.

## 6. Entry and application process

| Fact | Canon mapping |
|---|---|
| Russian ordinary passport: visa-free 90 days in each 180-day period | Current entry rule for nationality RU; source BO-S08/BO-S09 |
| In-country status change from lawful tourist/visit admission | `application_process.in_country_application = AVAILABLE` for t22/t23/t27/t28/t29/t30 |
| Web ED-9 or departmental office | Filing channels, display only |
| Official SLA: 24 hours after complete requirements | `processing_time` with lower/upper 1 day only if schema permits an official post-completeness SLA; wording must exclude document preparation |
| Visa-free entry does not create work permission | Entry display rule; work begins under work status |

## 7. Work-rights mapping

| Status | Outcome |
|---|---|
| `BO_EMPLOYED_WORK` | `ALLOWED` for the approved employed activity |
| `BO_SELF_EMPLOYED_WORK` | `ALLOWED` for the declared lucrative activity |
| `BO_STUDY` | `SEPARATE_PERMISSION_REQUIRED`: study is a distinct status and paid activity uses t22/t23/change of basis |
| `BO_FAMILY` | `SEPARATE_PERMISSION_REQUIRED`: family residence is not the work authorization; paid activity uses t22/t23 |
| `BO_INTERNATIONAL_PROTECTION` | `ALLOWED`: Ley 251 art. 35 gives the applicant and registered family/dependants education, health and work rights on the renewable temporary document |
| Tourist/business short stay | `NOT_ALLOWED` as a substitute for work residence |

For the three work-right dimensions, use the same legal distinction consistently: the approved t22 employed activity is `employment=ALLOWED`; t23 is `self_employment=ALLOWED`; activities outside the approved basis are `SEPARATE_PERMISSION_REQUIRED`. For study/family, employment and self-employment are `SEPARATE_PERMISSION_REQUIRED`; `remote_foreign_work` is also `SEPARATE_PERMISSION_REQUIRED`, with `allowed_remote_activity_types=[]`. These outcomes follow the category-specific structure of DS 1923 and current DIGEMIG procedures and do not affect eligibility for study/family residence itself.

## 8. Long-term path

| Route | Initial status | Renewal | PR | Citizenship |
|---|---|---|---|---|
| `BO_EMPLOYED_WORK` | 12/24/36 months | Available while basis continues | `AVAILABLE_AFTER_RESIDENCE`, 3 years temporary residence | General naturalization after more than 3 years lawful continuous residence; exam from age 12 |
| `BO_SELF_EMPLOYED_WORK` | 12/24/36 months | Available | Same work definitive path | Same general rule |
| `BO_STUDY` | 12/24/36 months | Available through studies | `REQUIRES_CHANGE_OF_BASIS`; study category does not lead directly to definitive residence | Do not promise a citizenship clock from study alone |
| `BO_INTERNATIONAL_PROTECTION` | Applicant document: 60 days, renewable; recognized refugee: indefinite stay with 5-year renewable foreign ID | Renewable while claim is pending | Recognition itself gives indefinite stay | Ley 251 instructs CONARE to facilitate naturalization; exact general/reduced clock must follow the applicable naturalization procedure |
| `BO_FAMILY` | 12/24/36 months | Available while family basis continues | Definitive family procedure after qualifying residence / extension rules | Reduced two-year route only where statutory spouse/Bolivian-child condition applies |

Presence rule: temporary residence is at risk after more than 90 days of absence in a year without authorization; definitive residence after two continuous years abroad. Renunciation is not required by Bolivian constitutional rules.

## 9. Cities, costs and climate

| city_id | Roles | Direct cost component retained | Climate mapping |
|---|---|---|---|
| `BO_LA_PAZ` | `CAPITAL`, `LARGE` | rent GBP 272/month, Wise 2026 | cold −2–14°C; warm 4–15°C; MEDIUM modeled evidence |
| `BO_SANTA_CRUZ` | `LARGE` | rent USD 461/month, Wise 2026 | cold 16–25°C; warm 22–30°C; MEDIUM |
| `BO_COCHABAMBA` | `MEDIUM` | transport BOB 3/one-way, Numbeo | cold 4–23°C; warm 12–26°C; MEDIUM |
| `BO_TARIJA` | `SMALL` | utilities BOB 251/month, Numbeo | cold 4–21°C; warm 16–24°C; MEDIUM |

No composite city cost score is calculated from unlike bases/currencies. `climate_normal_period` must transparently say modeled historical climate/source period not stated. The distinction between constitutional capital Sucre and seat of government La Paz belongs in text; it does not require country-specific UI logic.

## 10. Schools

- Public education: available under the universal/free constitutional and statutory framework; administrative enrollment documents remain display guidance.
- `international_school_cities`: La Paz, Santa Cruz de la Sierra and Cochabamba.
- Tuition observation: ACS La Paz USD 15,040 for KG5–Grade 5 and USD 16,580 for Grades 6–12, school year 2023/24; preserve date and do not present as 2026/27 tuition.
- No school cost enters matching or city cost extrema.

## 11. Pets

| Input | Canon outcome |
|---|---|
| Dog/cat | `AVAILABLE_WITH_CONDITIONS`: individual official export-health certificate, vaccination/health attestations and border verification |
| National breed restriction | `NONE_CONFIRMED_NATIONAL` |
| Quarantine | Not routine for every compliant pet; possible sanitary contingency |

Municipal ownership rules remain a location-specific practical check and do not create a national FAIL.

## 12. Taxes

- Territorial/source-based system; remote payment origin alone does not make physically performed Bolivian work foreign-source.
- RC-IVA nominal 13% is not a flat tax on all worldwide income.
- Employee social contribution: 12.71% base plus solidarity contribution at higher salary levels, source dated 2026-07-21.
- No newcomer tax regime found.
- No Russia–Bolivia DTA: current Bolivia treaty list excludes Russia.
- Tax data is display-only and must not affect route/country ranking.

## 13. LGBT mapping

| Field | Reconciled value |
|---|---|
| Same-sex relations | Legal |
| Constitutional anti-discrimination | Sexual orientation and gender identity protected |
| Marriage equality | Not established nationally |
| Same-sex free union | Recognized and registerable under SERECI 2023 on equal procedural terms |
| Family immigration | Available through t27 after recognized unión libre; foreign document is not assumed automatically homologated |
| Friendly cities | Empty list; no defensible comparative city ranking found |

The national LGBT block is complete even though the legal regime is unequal: completeness means the material facts and migration consequence are resolved, not that the outcome is favorable.

## 14. Source carry-forward

All material RP4 facts must cite the research source IDs. Mandatory high-value carry-forward set:

- BO-S01–BO-S04: migration law, regulation and constitution;
- BO-S08–BO-S09: Russia visa-free entry;
- BO-S15, BO-S27–BO-S28: same-sex union recognition and registration;
- BO-S26: Russia-specific DIGEMIG procedure data;
- BO-S29–BO-S30: SENASAG pet requirements;
- BO-S17: population/city context;
- BO-S20–BO-S22: international-school cities;
- BO-S23, BO-S36: tax/social contribution and treaty facts;
- BO-S37: refugee eligibility, family unity, work rights and indefinite status;
- BO-S31–BO-S35: climate and direct city costs.

LOW sources BO-S12/BO-S13 cannot support a matching threshold or material eligibility requirement.

## 15. Open items and contract gaps

### Open items

No blocking or non-blocking research items remain. Foreign remote employment has a completed negative finding and maps to `NO_ROUTE`. All four cities now share a directly observed `RENT_STANDARD`; climate keeps a transparent `MEDIUM` evidence limitation rather than an unanswered gap.

### Contract gaps

None. The earlier observations about one work category covering two activity modes and Bolivia's two-capital distinction are resolved through ordinary route splitting/text representation. No schema or engine change is justified.

## 16. RP4 construction checklist

- [x] Four publishable routes selected.
- [x] All eight inventory routes retained or represented by `NO_ROUTE`/hidden coverage.
- [x] All 13 categories mapped.
- [x] No fixed financial amount invented.
- [x] No LOW-confidence practical threshold promoted.
- [x] Every publishable route has family outcomes.
- [x] All three relationship values appear explicitly in reconciliation scenarios.
- [x] Child ages 0–25 have no gap.
- [x] Formalization transitions documented without schema extension.
- [x] Entry, work rights and long-term paths mapped.
- [x] Four city roles and minimum cost evidence mapped.
- [x] Climate provenance/confidence stated.
- [x] Schools, pets, taxes and LGBT mapped.
- [x] No country-specific hardcode proposed.
- [x] No repository mutation performed.

# FINAL DECISION: READY FOR RP4

The next stage may construct `BO-research-v4.0.json` and its source-linked supporting documents from this reconciliation. Integration, registration, tests and release remain later stages.


## 17. Final reconciliation correction — 2026-09-07

Повторная проверка первичных норм изменила только подтверждённые mapping outcomes:

| Fact | Canon semantics | RP4 outcome |
|---|---|---|
| Study cannot obtain PR, but Article 20 permits naturalization from 3+ years continuous temporary residence | PR and citizenship are independent | PR requires change of basis; study residence counts for citizenship; 3-year general path |
| Family residence is ordinary temporary residence | Count unless a law excludes it | PR/citizenship available after 3 years; 2-year citizenship only for Bolivian-family statutory cases |
| Health after year 2 and humanitarian residence do not constitute uninterrupted residence | No independent accumulation | PR/citizenship unavailable on the same basis |
| Agreement/religious activity is within temporary work | Ordinary work counting | PR/citizenship available after 3 years |
| Transitory/business permission is short-term, up to 180 days | Not residence accumulation | No independent PR/citizenship path |
| 2026 school regulation protects foreign pupils regardless of status | Confirmed public-school access | Ages 6–17; foreign documents or good-faith declaration; foreign study equivalence |
| Same-sex marriage first recognized by an individual 2026 judgment | Individual case is not nationwide availability | Nationwide marriage remains NO; wording records the case and barriers |

All prior non-blocking boundaries are resolved as completed negative/limited-evidence findings. open_items remains empty because no unanswered fact can change eligibility, family outcome, matching, or required presentation.
