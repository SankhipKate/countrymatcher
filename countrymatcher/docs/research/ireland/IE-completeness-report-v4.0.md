# IE — completeness v4.0

Research country-ready status: **READY**
Integration/release status: **READY FOR FINAL RELEASE VERIFICATION**

| Блок | Статус | Open items |
|---|---|---|
| ROUTE_COVERAGE | COMPLETE | — |
| ROUTES | COMPLETE | — |
| ENTRY_APPLICATION | COMPLETE | — |
| FAMILY | COMPLETE — questionnaire domain 0–25 and all three relationship inputs covered | — |
| WORK_RIGHTS | COMPLETE | — |
| LONG_TERM | COMPLETE | — |
| PROTECTION | COMPLETE | — |
| TAXES | COMPLETE | — |
| CITIES_COST | COMPLETE | — |
| CLIMATE | COMPLETE | — |
| SCHOOLS | COMPLETE | — |
| PETS | COMPLETE | — |
| LGBT | COMPLETE | — |
| SOURCES | COMPLETE | — |

Все исследовательские блоки закрыты; `open_items = []` остаётся корректным.

Targeted corrections 2026-09-05 закрыли STEP для граждан РФ, multi-source Study funding и действующее специальное правило Non-EEA family policy для qualifying overseas civil partnerships.

Targeted family migration 2026-09-06 закрыла ранее оставшийся family release gate:

- каждый IE route имеет прямое статическое coverage `MARRIED`, `REGISTERED_PARTNERSHIP`, `UNREGISTERED_PARTNERSHIP`;
- child-domain анкеты `0–25` покрыт без возрастных дыр;
- legal age boundary `18` подтверждён Age of Majority Act 1985;
- Category B routes (`CSEP`, `ICT`, researcher/Hosting Agreement) разделяют minor child `0–17` и dependent adult child `18+`; adult path — после 2 лет при специальной зависимости, с отдельным Stamp 0 и повышенным financial test;
- `GEP` как Category C: minor child — после 1 года, dependent adult child `18+` — после 5 лет;
- ordinary Study и independent Stamp 0 имеют явный `NOT_AVAILABLE` child outcome для всего диапазона, вместо отсутствующего scenario;
- international protection имеет отдельный statutory adult-dependent-child path после 2 лет;
- возраст 25 — только верхняя граница questionnaire domain; в RP4 adult scenarios не вводят выдуманный legal maximum и используют open upper bound.

Current package проходит обычный schema/integrity и строгий opt-in family coverage audit. Определено и используется **56/56 источников**. IE-specific regression — **14/14 PASS**; focused IE/family suite — **39/39 PASS**.
