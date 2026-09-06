# Франция — Research → Canon → RP4 reconciliation

Дата: 2026-09-03
Этап: только Stage B
Итоговый вердикт после closure 2026-09-04: **READY FOR RP4 MAPPING**

## Closure update — 2026-09-04

Все data fixes из этого reconciliation выполнены в исследовательском пакете: visitor дедуплицирован; финансовые смыслы income/savings/sponsor/scholarship/capital разделены; asylum filing и protection-specific path исправлены; student EU-LTR counting помечен `PARTIAL`; ICT/trainee/volunteer больше не обещают самостоятельный пятилетний EU-LTR path; аренда унифицирована для 60 м²; обязательный `GROCERIES` закрыт по единой месячной методике Numbeo для всех четырёх городов. Open items: 0. Повторная проверка дала Schema validation PASS и Integrity validation PASS. Разделы ниже сохраняют исходный audit trail: пометки `DATA FIX` описывают обнаруженное состояние до closure и считаются закрытыми этим update.

Финальное RP4 mapping уточнение: один юридический visitor представлен двумя RP4-ветками. `FR_VISITOR` оценивает известные анкете собственные income/savings и может дать `SUITABLE`; `FR_VISITOR_SPONSOR` сохраняет официально допустимую поддержку платежеспособного третьего лица как `UNASKED_CONDITION`. Это data-level OR decomposition, не изменение Canon или engine.

## 1. Executive summary

Исследование Франции достаточно по охвату, но текущий `FR-research-v4.0.json` нельзя переносить в runtime без исправлений. Schema PASS не доказывает semantic correctness: обнаружены повторяющиеся `requirement_id`, неверные финансовые модели, чрезмерно обобщённые family scenarios и long-term paths, а также отсутствие явного объяснения product publication boundary у скрытых маршрутов.

Это не требует изменения Canon, generic schema, validator, engine или анкеты. Текущая schema уже умеет хранить `CAPITAL`, `SPONSOR`, `SCHOLARSHIP`, `INVESTMENT_CAPITAL` и route-specific family/long-term data. Следовательно, настоящих generic contract gaps на Stage B не установлено. Требуются только правки данных Франции и targeted source re-check для нескольких route-specific деталей.

## 2. Provenance

| Проверка | Результат |
|---|---|
| Исследовательский пакет | `France-FR-research-v4.0-2026-09-03.zip`, 7 файлов |
| JSON | `schema_version=4.0`, `canon_revision=2026-08-08-final-lock`, `research_date=2026-09-03` |
| Validator | Schema validation PASS; Integrity validation PASS |
| Проектный ZIP | корневая папка `CountryMatcher-main-15.0.0`; `countrymatcher/VERSION=15.0.0`; embedded marker `5729de7c157a3d05ad1a5cfe01951a494ee4ddd5` |
| State-файл | заявляет production 14.0.0 и последний read-only checkpoint `5659636528440976b5c72a5aa331a3c324cd200c` |
| Git provenance | `.git` в ZIP отсутствует; фактический `origin/main`, branch и SHA по архиву подтвердить невозможно |
| Нормативная база | два Canon standard 4.0, operational prompt, schema, validator, RP4 engine и релевантные tests из предоставленного snapshot |

Расхождение версии project ZIP и state-файла зафиксировано как provenance limitation. Для machine-contract анализа использован более новый предоставленный snapshot 15.0.0; считать его подтверждённым GitHub main нельзя.

## 3. Полная reconciliation-таблица

Сокращения: Q — знания анкеты; UC — `UNASKED_CONDITION`; DO — `DISPLAY_ONLY`; ENG — `ENGINE`; PB — product publication boundary.

| Блок | Research fact | Источник и дата | Questionnaire knowledge | Canon semantics | Предлагаемое RP4 representation | Matching effect | Publication effect | Статус | Gap / решение |
|---|---|---|---|---|---|---|---|---|---|
| Coverage | Все 13 Canon-категорий перечислены | FR JSON + official inventory, 2026-09-03 | Q не определяет inventory | Полный statutory inventory обязателен | `route_coverage[13]` | Нет прямого effect | Полный inventory хранится | CONFIRMED | GENERAL_RESIDENCE следует описать как coverage через family/residence status, не как самостоятельный initial route |
| Visitor | Residence visitor существует | Service-Public F302, 2026-09-03 | Текущий доход, тип, owner, geography, savings | Основной financially-independent route | `FR_VISITOR`, publishable=true | ENG только для реально оцениваемых ресурсов | Публикуется | DATA FIX | Удалить 8 дубликатов requirements |
| Visitor finance | €1,477.93 net/month for one person over one year; возможны собственные ресурсы и ресурсы платежеспособного family member | Service-Public F302, checked 2026-09-03 | Q знает applicant/partner income и savings, но не произвольного внешнего sponsor | Разные financial alternatives нельзя сжимать в applicant income | ENG для applicant income/savings; UC для внешнего sponsor | PASS/FAIL только для asked alternatives | Показывать legal alternatives | DATA FIX | Текущий один `INCOME/APPLICANT` теряет savings и family sponsor; добавить корректные alternatives |
| Visitor work | Обязательство не осуществлять профессиональную деятельность | Service-Public F302 | Q знает текущую работу, но не будущее обязательство | Route restriction, не основание для текущего FAIL | DO или route restriction; work rights NOT_ALLOWED | Не ухудшает eligibility сверх выбора route | Явно показывается | DATA FIX | Сейчас UC создаёт condition каждому пользователю; лучше DO, поскольку это характеристика статуса |
| Digital nomad | Отдельного DN route нет; visitor запрещает professional activity | Visitor + entrepreneur official pages, 2026-09-03 | Q знает remote income | `NO_ROUTE`, remote work не маскируется visitor | coverage record only | DN не получает PASS | Нет отдельной card | CONFIRMED | Формулировка корректна |
| Employment | `salarié` для CDI, `travailleur temporaire` для CDD; обычно нужен contract и work authorization | France-Visas activité salariée, 2026-09-03 | Q не знает будущий contract/authorization | Самостоятельный future employment basis | `FR_EMPLOYEE`; contract UC; employer authorization DO/UC | Conditional, не FAIL по текущему профилю | Публикуется | CONFIRMED WITH FIX | Professional recognition только для regulated profession; лучше applicability/DO, а не универсальная UC condition |
| Blue Card | Degree/experience, contract ≥6 months, salary €59,373 gross/year | Service-Public talent / EU portal, 2026-09-03 | Q не знает offer, future salary, degree/experience | Future employment basis | `FR_BLUE_CARD`; contract UC; qualification DO; salary UC, asked=false | Route conditional; текущий доход не сравнивается | Публикуется | DATA FIX | `allowed_income_types` и geography не должны описывать future salary; copy должен говорить salary under contract |
| ICT | Transfer within group; specialised corporate route | CESEDA, 2026-09-03 | Q не знает group transfer | Узкий corporate basis + PB | `FR_ICT`, publishable=false, explicit PB note | Не участвует в matching | Скрыт без blocking open item | DATA FIX | Добавить `publication_notes_ru`; перепроверить family, duration и LTR exclusion/counting route-specifically |
| Entrepreneur/liberal | Economically viable activity, qualifications/licence when applicable, resources tied to viability | Service-Public F35795, 2026-09-03 | Q не знает project, licence or forecast | Future business basis; projected viability ≠ current income | UC project/viability; DO qualifications/licence where conditional | Conditional | Публикуется | DATA FIX | €1,867.02 как ordinary `INCOME_ONLY` asked=false и generic income types искажает projected result/resources |
| Talent investor | Direct economic investment ≥€300,000 plus control/influence and employment condition | Business France / CESEDA, 2026-09-03 | Q не спрашивает investment capital | Investment capital ≠ income | model `INVESTMENT_CAPITAL`, kind `CAPITAL`, asked=false, UC | Conditional only | Публикуется | DATA FIX | Сейчас ошибочно `INCOME_ONLY/INCOME/ANNUAL`; исправить без schema change |
| Talent qualified | French degree/qualification, employment contract and salary threshold €39,582 gross/year | Service-Public F16922, 2026-09-03 | Q не знает future contract/degree | Future offer + credential | UC contract/salary; DO education evidence | Conditional | Публикуется | DATA FIX | Salary representation must not accept freelance/other current income |
| Talent innovative employee | Innovative-company employment, relevant duties, salary €39,582 gross/year | Service-Public F16922, 2026-09-03 | Q не знает company designation/offer | Future special employment basis | UC company/contract/salary; DO duties detail | Conditional | Публикуется | DATA FIX | Financial qualifiers currently generic and misleading |
| Talent researcher | Master-equivalent and hosting agreement for research/teaching | Service-Public F16922, 2026-09-03 | Q не знает hosting agreement | Future research basis | UC hosting/mission; DO degree evidence | Conditional | Публикуется | CONFIRMED WITH FIX | Degree is evidence of basis, not separate unknown gate if hosting agreement already establishes route |
| Talent business creator | Master/5 years experience, real and serious project, annual resources ≥SMIC, project financing ≥€30,000 | Service-Public/Business France, 2026-09-03 | Q knows savings but not earmarked capital/project | Two distinct financial concepts | resources alternative + separate CAPITAL requirement, both asked=false/UC | Conditional only | Публикуется | DATA FIX | Current single INCOME requirement stores €22,404.20 but drops €30,000 financing |
| Talent medical | French practice authorization + employment remuneration threshold €41,386.48 | Service-Public F16922, 2026-09-03 | Q не знает licence/offer | Professional licence + future salary | UC licence/contract salary, asked=false | Conditional | Публикуется | DATA FIX | Salary cannot be represented as current multi-type income; source id should be medical/talent source, not generic Blue Card work-right copy |
| Student | Admission + at least €877.50/month; possible own funds, sponsor, scholarship, work income | Service-Public F2231, current page checked 2026-09-03 | Q knows applicant income/savings; not sponsor/scholarship | Admission UC; finance has alternative means | model matching alternatives; INCOME/SAVINGS possibly ENG only if route evaluation policy permits; SPONSOR/SCHOLARSHIP asked=false UC | Unknown unasked alternatives cannot FAIL | Публикуется | DATA FIX | Current one `INCOME` alternative loses savings, sponsor and scholarship |
| Family reunification | Ordinary regroupement familial follows prior residence, qualifying spouse/minor children, resources and housing | Service-Public F11166, 2026-09-03 | Q knows relationship and family composition; not sponsor’s French status/residence/housing | Standalone narrow pre-existing family basis, PB | `FR_FAMILY_REUNIFICATION`, publishable=false, requirements UC/DO | Не участвует как initial strategy | Скрыт | DATA FIX | Explicit PB note; finance is sponsor household resources, not applicant `INCOME_ONLY`; family formula varies by family size |
| Talent family | Spouse and minor children may accompany/join talent holder and adult partner can work | Service-Public F35792, 2026-09-03 | Q knows spouse/partner/children | Route-specific accompanying-family scenario | YES simultaneous/with initial; partner employment allowed | Family ranking benefit | Inside talent route | CONFIRMED WITH FIX | Confirm relationship set beyond `MARRIED` and child age wording from source; current blanket 0–17 may be too rigid |
| Ordinary route family | Usually later regroupement after qualifying residence; housing/resources tests | F11166, 2026-09-03 | Q knows family but not future sponsor residence/housing | Later join, route-specific | family scenario later join; unknown eligibility details in copy | May rank behind simultaneous family | Inside main route | DATA FIX | Same 18-month template must be rechecked against 2026 sponsor categories and exemptions, not copied to every route |
| Asylum | Individual protection ground and Dublin responsibility | OFPRA/Service-Public, 2026-09-03 | Q does not and should not adjudicate persecution | Highly individual protection basis; product boundary | `FR_ASYLUM`, publishable=false | No automated PASS/FAIL | Statutory inventory only | DATA FIX | Family scenario, Russian consular filing method and ordinary 5-year template are inapplicable; replace with protection-specific facts |
| Trainee | Convention de stage within study | France-Visas, 2026-09-03 | Q не знает convention | Narrow OTHER basis, PB | `FR_STUDENT_TRAINEE`, false + PB note | No matching | Hidden | DATA FIX | Volunteer/trainee family and 5-year path templates lack route-specific proof |
| Volunteer | Volunteer agreement/program; visa/status depends on programme and duration | France-Visas volunteering, 2026-09-03 | Q не знает programme/agreement | Narrow OTHER basis, PB | `FR_VOLUNTEER`, false + PB note | No matching | Hidden | DATA FIX | Current single generic route collapses materially different VLS-T/visitor outcomes; describe variants or narrow scope |
| Entry RU | Russian citizen needs Schengen short-stay visa; >90 days requires long-stay visa before travel | France-Visas, 2026-09-03 | Q knows nationality/location/legal status | Country-level entry + route application | `entry_for_russian_citizen`; route application methods | Information, not automatic blocker unless filing impossible | Display | CONFIRMED WITH FIX | `maximum_stay_days=90` needs 90/180 wording; VFS availability/centres dynamic |
| Application | Most initial long-stay applications from country of lawful residence; asylum is not consular | France-Visas/OFPRA, 2026-09-03 | Q knows current country/status | Route-specific method | application method per route | Usually no eligibility effect | Display | DATA FIX | Blanket Russian VFS `ORIGIN_COUNTRY` incorrectly copied into asylum and may overstate city/network availability |
| Applicant work rights | Visitor none; employee/talent limited to authorised activity; student statutory limited work; trainee/volunteer only programme activity | Route sources, 2026-09-03 | Q does not need to establish future work right | Separate from eligibility | route-specific `applicant_work_rights` | No status effect | Display | CONFIRMED WITH FIX | Avoid saying employment ALLOWED for self-employed route without route-specific basis; keep activity scope precise |
| Partner work rights | Talent-family work allowed; ordinary regroupement depends on issued status | F35792/F11166, 2026-09-03 | Q knows partner exists | Route-specific family consequence | `partner_work_rights` by scenario | Ranking/presentation only | Display | DATA FIX | Blanket `available_after_months=18` conflates sponsor waiting time with partner’s right after admission |
| Renewal | Depends on retained route basis; permit duration differs by route | Route sources, 2026-09-03 | Q does not know future compliance | Route-specific long-term data | specific `renewal_*` fields | Long-term goal/ranking where Canon permits | Display | DATA FIX | Current copy is nearly identical across all 16 routes and often not sufficiently researched |
| Long-term EU residence | Generally 5 years legal uninterrupted residence; student periods count only half; temporary statuses and protection have special rules; absences and resources/language matter | Service-Public F17359 / EU law, checked 2026-09-03 | Q knows long-term goal but not future residence history | Not identical for all permits | route-specific `residence_counts_for_pr`, years and explanation | Can affect mandatory goal | Display | DATA FIX | Student, ICT, trainee, volunteer, refugee/subsidiary protection cannot share the same generic conditional five-year promise |
| Citizenship | Ordinary naturalisation commonly after 5 years habitual residence, subject to integration, language B2 from 2026, civic exam and other conditions; France permits multiple nationality | Service-Public F11926/F39426, 2026-09-03 | Q knows citizenship goal/retention RU | Separate from EU-LTR | citizenship fields, conditional | Long-term goal effect | Display | CONFIRMED WITH FIX | Route status alone never guarantees citizenship; protection/student residence implications need route-specific language |
| Taxes | Residence determined by home, main stay, professional activity or centre of economic interests; 183 days not sole test | impots.gouv.fr, 2026-09-03 | Q lacks tax facts | Editorial only | top-level taxes | No matching/sorting | Display | CONFIRMED | Keep personalised caveat |
| Tax treaty RU | Treaty ceased applying for tax periods from 2024; double-tax risk | BOFiP, checked 2026-09-03 | Q not enough for tax result | Editorial warning | `double_taxation_with_russia_ru` | None | Display | CONFIRMED | Review on tax schedule |
| City roles | Paris CAPITAL+LARGE; Lyon LARGE; Nantes MEDIUM; Dijon SMALL | Research sources, 2026-09-03 | Q has no city-size preference | Exactly one size role, CAPITAL optional | current `structural_roles` | No matching | City presentation | CONFIRMED | Size-role contract satisfied |
| City basket | Rent 85m² furnished ordinary area, utilities 2 people/85m², transit per person; groceries absent | Expatistan, dates 2025-03-28/2026-09-02 | Q no budget | Components must be comparable; target includes groceries | components with date/confidence | No matching | Display only | DATA FIX | Basket is incomplete (no GROCERIES); rent scenario also differs from prior stated 60m² research decision and must be standardised before integration |
| City confidence | Nantes/Dijon LOW; Dijon stale and small sample | Expatistan, 2025/2026 | Q irrelevant | LOW dynamic data must remain caveated/open | keep non-blocking open item | None | Display caveat | CONFIRMED | Do not use LOW prices as official facts or cross-country rank |
| Climate | Numeric cold/hot normal ranges 1991–2020 | Météo-France station pages, checked 2026-09-03 | Q no climate preference | Editorial numeric station data | city `climate` | None | Display | CONFIRMED WITH FIX | Paris exact values supported; rounded Lyon/Nantes values should be tied to exact station table evidence in sources file |
| Public schools | Compulsory 3–16 and public access for foreign children; French-language support | Service-Public F1898, 2026-09-03 | Q knows children, not school preference | Editorial | top-level schools | None | Display | CONFIRMED | No matching effect |
| International schools | ISP and IS Lyon exist; ISP observed tuition €31,400 first grade / €39,000 final grade | School pages, checked 2026-09-03 | Q no school preference | Observations, not national price | school objects + dated tuition observations | None | Display | CONFIRMED WITH FIX | IS Lyon has no tuition figure; do not imply completeness; retain only availability until fee source obtained |
| Pets | Third-country import rules; category-1 dogs prohibited, category-2 restrictions | agriculture.gouv.fr + Service-Public F1839, 2026-09-03 | Q knows pet and dog breed | Pet restrictions may affect fit | top-level pets; breed/morphology limitation in copy | Relevant pet warning/status per generic engine | Display | CONFIRMED WITH FIX | Morphological category may not map perfectly from breed-only questionnaire; state individual classification uncertainty |
| LGBT legal | Same-sex relations/marriage legal; PACS exists; family routes available | Legifrance + official pages, 2026-09-03 | Q has LGBT personalization and relationship type | Legal assessment separate from practical | top-level LGBT | Personalised presentation, not route invention | Display | CONFIRMED | Foreign document recognition remains conditional |
| LGBT practical | Anti-discrimination protection exists; incidents mean practical risk not zero; city-comparable evidence absent | ILGA-Europe 2026 | Q LGBT toggle only | Practical evidence separate, no invented city ranking | HETEROGENEOUS, no friendly cities | No status effect | Display | CONFIRMED | Current cautious wording is appropriate |
| Sources/review | 49 source records checked 2026-09-03; dynamic and legal review schedules present | Package metadata | Q irrelevant | Provenance mandatory | source ids/dates/confidence/review schedule | None | Internal/display provenance | CONFIRMED WITH FIX | Source publisher fields are empty; fill when schema supports current source object; recheck dynamic official pages before Stage C |
| Completeness | Package declares READY and no blockers | completeness/open items files | Q irrelevant | READY must reflect semantic completeness, not schema pass | change status after fixes | Gate only | Internal | DATA FIX | Current READY claim is premature due to detected semantic defects |

## 4. Requirement-by-requirement semantics audit

### 4.1 Correct or directionally correct

| Requirement(s) | Current mode | Verdict | Reason |
|---|---|---|---|
| `FR_VISITOR_FUNDS` | ENG/BLOCKS | PARTIAL | Applicant resources are evaluable, but sponsor and savings alternatives are missing; family-member resources cannot be silently treated as applicant income |
| `FR_EMPLOYEE_CONTRACT` | UC/CONDITION | CONFIRMED | Future French contract is an unasked route basis |
| `FR_EMPLOYEE_AUTH` | UC/CONDITION | ACCEPTABLE | Employer-side authorization is unasked; DO may produce cleaner copy once contract exists |
| `FR_BC_CONTRACT`, `FR_BC_SALARY` | UC/CONDITION | CONFIRMED | Future offer and salary are not current income |
| `FR_ICT_GROUP`, `FR_ICT_SENIORITY` | UC/CONDITION | CONFIRMED | Special corporate basis is outside Q; route is hidden PB |
| `FR_SELF_ACTIVITY`, `FR_SELF_VIABLE` | UC/CONDITION | CONFIRMED IN PRINCIPLE | Business project/viability are future basis; financial structure needs correction |
| `FR_INV_CONTROL`, `FR_INV_JOBS`, `FR_INV_AMOUNT` | UC/CONDITION | CONFIRMED MODE | Investment is unasked; financial model/kind is wrong |
| `FR_STUDENT_ADMISSION`, `FR_STUDENT_FUNDS` | UC/CONDITION | CONFIRMED MODE | Admission and complete means-of-support determination are not known; alternatives need expansion |
| `FR_FAM_*` | UC/CONDITION | CONFIRMED FOR HIDDEN ROUTE | Route is PB; finance subject/model and family formula need correction |
| `FR_ASYLUM_*` | UC/CONDITION | ACCEPTABLE ONLY IN INVENTORY | Protection cannot be adjudicated by matcher and route is hidden |
| Talent contract/project/licence requirements | UC/CONDITION | GENERALLY CONFIRMED | Q intentionally does not establish future basis |
| Trainee/volunteer basis | UC/CONDITION | CONFIRMED FOR PB | Convention/agreement is unasked; hidden statutory inventory |

### 4.2 Modes that should change

| Requirement | Current | Recommended | Why |
|---|---|---|---|
| Repeated `FR_VISITOR_INSURANCE` ×5 | UC | one DO | Insurance is a filing requirement; five duplicate conditions are a defect |
| Repeated `FR_VISITOR_NO_WORK` ×5 | UC | one DO / route restriction | It describes the legal character of visitor; repeated conditions distort the result |
| Education/experience evidence across Blue Card/talent | UC | DO where it is evidence attached to an otherwise unasked offer; UC only if it is a genuinely independent alternative basis | Current blanket UC multiplies conditions and can misstate matching |
| Regulated-profession qualifications | UC universally | DO with “when applicable”, or applicability gate if supported | Not every employee/self-employed applicant is in a regulated profession |
| Future salary amounts | UC, asked=false (keep) | keep UC but describe as contract salary; narrow allowed type to local employment semantics | Current income types/geography are semantically wrong even though runtime does not evaluate them |
| Investment €300,000 | UC, `INCOME_ONLY/INCOME` | UC, `INVESTMENT_CAPITAL/CAPITAL` | Capital is not annual income |
| Business creator €30,000 | absent | separate UC capital requirement | Confirmed material fact is currently lost |
| Student means | one UC income alternative | alternatives for INCOME, SAVINGS, SPONSOR, SCHOLARSHIP, preserving asked flags | Official source expressly accepts multiple means |

No `profile_path` should be invented for UC/DO items. ENG requires `asked_in_questionnaire=true`, a supported financial kind/model, and an exact profile fact. `unmet_effect=BLOCKS` is justified only for an ENG rule actually evaluated from Q; UC uses `BECOMES_CONDITION`; DO must not lower status.

## 5. Finance reconciliation

| Route | Confirmed financial meaning | Current JSON | Correct representation |
|---|---|---|---|
| Visitor | Current own resources, savings/bank evidence, pension/rent income, or solvent family-member support | applicant INCOME only | Separate INCOME/SAVINGS/SPONSOR alternatives; apply one-person €1,477.93 rule without inventing family scaling |
| Blue Card | Future gross salary in qualifying French contract | generic current income types | asked=false UC future salary; no current profile comparison |
| Self-employed | Forecast economic viability/resources tied to proposed activity | INCOME €1,867.02 | asked=false UC, wording/model representing project result/resources, not current income |
| Investor | Earmarked economic investment €300,000 | INCOME annual | INVESTMENT_CAPITAL/CAPITAL |
| Student | Means may come from own balance, income/work, sponsor or scholarship | INCOME only | Alternative kinds INCOME/SAVINGS/SPONSOR/SCHOLARSHIP; unasked alternatives keep route conditional |
| Family reunification | Sponsor’s stable/sufficient resources and household-size formula | applicant INCOME €1,867.02 | sponsor/household semantics; official formula/copy, asked=false |
| Talent employee variants | Future contract salary | broad income types | UC future local-employment salary |
| Talent business | annual personal resources plus ≥€30,000 project financing | only annual income | two distinct requirements; resources + CAPITAL |
| Talent medical | future contract remuneration | broad income types | UC future employment salary |

## 6. Family and long-term corrections

1. Talent family scenarios may remain simultaneous and partner-work-allowed, subject to exact relationship/child eligibility wording from the official talent-family source.
2. Ordinary regroupement familial must be linked only to routes whose sponsor status is eligible and must preserve sponsor-residence duration, resources, housing, spouse and minor-child rules. The same copied 18-month scenario is not evidence for every route.
3. Asylum/protection uses protection-specific family unity/reunification rules. Russian VFS filing, ordinary regroupement familial and the generic route template do not apply.
4. Student residence counts at a reduced rate for EU long-term residence; this must be explicit rather than generic `CONDITIONAL` text.
5. ICT/temporary posting, trainee and volunteer statuses require a route-specific determination of whether/how residence counts. An identical five-year promise is not defensible.
6. Citizenship and long-term EU residence remain separate. A five-year naturalisation reference is conditional and does not mean every temporary status produces the same path.

## 7. Data-only fixes before Stage C

1. Deduplicate `FR_VISITOR.requirements` to three unique items.
2. Reclassify visitor insurance and no-work rule so they do not generate repeated/universal conditions.
3. Correct visitor finance alternatives for own savings and external family support.
4. Replace investor `INCOME_ONLY/INCOME` with `INVESTMENT_CAPITAL/CAPITAL`.
5. Split talent business personal resources and €30,000 project capital.
6. Expand student finance to own funds, income/work, sponsor and scholarship.
7. Correct family-reunification finance subject, kind and household formula.
8. Narrow all future-salary semantics so current freelance/passive/other income cannot appear to satisfy them.
9. Add explicit PB explanation to ICT, family reunification, asylum, trainee and volunteer; no blocking open item.
10. Replace copied family scenarios with route-specific facts, especially asylum and ICT.
11. Replace copied long-term paths for student, ICT, asylum/refugee/subsidiary protection, trainee and volunteer.
12. Remove Russian consular application method from asylum.
13. Complete or explicitly mark incomplete the target city basket (GROCERIES absent) and reconcile the rent standard with the approved 60m² scenario.
14. Update completeness/report claims after the semantic fixes; “11 separate visitor requirements” is false.
15. Add validator/regression coverage for duplicate `requirement_id` only after a separate product decision if treated as generic validator work; the France file itself can be corrected without this change.

## 8. Generic contract gaps

**None proven.** The current schema already exposes the constructs needed for the identified facts. A duplicate-ID validator check would be a useful generic hardening, but it is not required to represent France and therefore is outside Stage B and behind the architecture/product gate.

## 9. Decision memo

### DM-1 — Is a product decision required before correcting France?

**No.** All required changes preserve existing Canon semantics and use existing RP4 fields/enums.

- Option A: correct France data only. Advantages: smallest scope, accurate mapping, no architecture risk. Disadvantage: validator still permits similar duplicates elsewhere. Risk: future packages may repeat the defect.
- Option B: correct France and add generic duplicate-ID validation now. Advantages: systemic prevention. Disadvantages: expands Stage B into validator development and requires regression/release handling. Risk: may expose latent defects across active packages.

**Recommendation:** Option A for the next stage. Raise duplicate-ID validator hardening as a separate generic task after France mapping is clean.

### DM-2 — Should asylum be published as a selectable route?

Existing product policy already answers this: **no**, keep it in statutory inventory with `publishable=false`. Individual protection grounds are not safely evaluated by the questionnaire. No new user decision is required.

### DM-3 — Should narrow ICT/family/trainee/volunteer routes be published?

Existing product publication boundary already answers this: **no**. Add explicit PB notes and keep complete inventory. No blocking open item and no new user decision are required.

## 10. Confirmed mappings

- All 13 coverage categories can be represented.
- Visitor is the publishable financially-independent route; France has no standalone digital-nomad route.
- Employee, Blue Card, entrepreneur/liberal, investment, student and material talent routes fit existing route types.
- ICT, standalone family reunification, asylum, trainee and volunteer belong in inventory but remain hidden under existing product policy.
- Current future-offer/admission/project/investment facts remain UC and must not become current-user FAIL.
- Entry for Russian citizens, taxes, city/climate, schools, pets and LGBT blocks fit current top-level RP4 structures.
- QoL is excluded from Stage B.

## 11. Final gate

Обновлённый `FR-research-v4.0.json` имеет статус **READY FOR RP4 MAPPING**. Data-correction pass завершён 2026-09-04; повторный schema/integrity audit прошёл. Интеграция в runtime остаётся отдельным следующим этапом.

Stop gate applies: no project files, ACTIVE_RP4_PACKAGES, version, QoL, tests, release docs, GitHub branch, commit, push or PR were changed during this Stage B.
