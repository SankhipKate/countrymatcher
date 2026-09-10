# NL — отчёт о полноте после целевой корректировки

Статус страны: **READY**

Дата повторной проверки: **2026-09-05**.

Техническая проверка: **JSON parse PASS / Schema PASS / Integrity PASS**.

| Блок | Статус | Open items |
|---|---|---|
| ROUTE_COVERAGE | COMPLETE | — |
| ROUTES | COMPLETE | — |
| ENTRY_APPLICATION | COMPLETE | — |
| FAMILY | COMPLETE | — |
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

Маршрутов, доступных гражданам РФ: 44. Публикуемых: 10. Специальных непубликуемых: 34.

Семантическая проверка охватила все 44 маршрута: application methods, route-specific processing time и renewal. Отдельно повторно проверены asylum, asylum family reunification, финансовые альтернативы start-up/study/researcher, права студентов на работу и различия между long-term EU residence и натурализацией.

## Targeted refresh 2026-09-10

Перед интеграцией в release 20.0.0 повторно проверены официальные страницы IND и исправлены оставшиеся semantic defects: route-specific filing для GVVA/Blue Card/seasonal/intern/MBO4, продление International Trade/Cross-border/Intern, MBO4 self-employment и срок permit, Blue Card self-employment, а также отдельные нормы для финансирующего студента лица, живущего в Нидерландах. Canon/schema/engine/questionnaire не изменялись. Runtime `NL-research-v4.0.json` и его копия в research docs синхронизированы.
