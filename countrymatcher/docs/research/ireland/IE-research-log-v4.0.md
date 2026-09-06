# IE — журнал первичного исследования

Дата полного completion pass: 2026-09-03

1. Прочитаны Canon 4.0, operational prompt, JSON Schema и validator фактически приложенного проекта 15.0.0 (`5729de7c157a3d05ad1a5cfe01951a494ee4ddd5`).
2. Проверено покрытие всех 13 route categories и официальный перечень девяти типов employment permits.
3. Семейная семантика Stamp 0 закрыта по перечню допустимых спонсоров Non-EEA Family Reunification Policy.
4. Международная защита актуализирована по International Protection Act 2026, действующему с 12 июня 2026 года.
5. Подтверждены Labour Market Access Permission после шести месяцев без first-instance decision, новый TARA и двухлетнее ожидание family reunification после предоставления защиты.
6. Семейные финансовые таблицы исследованы; возможная автоматизация сложной формулы классифицирована как product/contract decision, а не research gap.
7. Школьное покрытие приведено к фактическому требованию Canon: сохраняются подтверждённые города без недоказуемого требования исчерпать каждый малый населённый пункт.
8. Неизвестные значения не заменялись нулями или ложными отрицаниями.
9. ICT и standalone family остаются непубликуемыми по product publication boundary.
10. Выполнены JSON syntax, Schema validation, Integrity validation и содержательная сверка всех семи артефактов.
11. После независимого аудита раскрыт полный statutory inventory девяти employment permits и специальных permissions; удалено противоречивое упоминание несуществующего residual open item.
12. В package сохранены Category A/B/C, правило одного спонсора, детская таблица 2026 и dependent-adult table; automation оставлена reconciliation decision.
13. Для GEP зафиксировано 12 месяцев ожидания семьи; route approval отделён от последующей D visa в application methods employment routes.
14. Налоговый блок дополнен прямыми Revenue sources и официальным российским актом о DTA suspension.
15. На completion pass был зафиксирован общий post-16-May-2016 civil-partnership rule; targeted correction 2026-09-05 уточнил, что для Non-EEA Family Reunification Policy действует специальное marriage-equivalent treatment qualifying overseas civil partnerships.
16. Test-profile expectations дополнены base profile и конкретными input overrides.
17. Девять assertions исполнены против RP4 engine: 9/9 PASS; дополнительно проверены GEP 12 months, Stamp 0 family NOT_AVAILABLE и protection 24 months.
18. Климатические диапазоны привязаны к именованным станциям/явному regional proxy, а pet block дополнен полным operational entry appendix.

## 2026-09-05 targeted correction

1. Повторно проверен официальный STEP source: новые заявления от граждан РФ/Беларуси не принимаются; `IE_STEP` исключён из `routes[]`, coverage переведён в `UNAVAILABLE_TO_RU`.
2. Повторно проверено student finance: sponsor/government/scholarship funding официально допустимы; 10 000 € собственных savings перестали быть hard blocker.
3. Проверена June 2026 Non-EEA Family Reunification Policy: §7.10 приравнивает qualifying overseas civil partnership к браку для этой политики; старое blanket-правило post-2016 удалено из family copy.
4. На 2026-09-05 release оставался gated до внедрения generic family coverage contract; этот исторический gate закрыт targeted migration 2026-09-06.
5. На pre-migration этапе отдельные competing partner scenarios были отложены из-за риска смешения formalization alternatives; migration 2026-09-06 закрыла static completeness прямым перечислением всех трёх relationship inputs в каждом применимом partner scenario без country-specific engine branch.
6. Full verifier в sandbox не завершён из-за недоступности npm registry для AJV dependencies; все 17 RP4 packages проходят Python schema/integrity, IE regression 11/11 PASS, а весь Node suite без пяти AJV-dependent test files проходит 568/568.
## 2026-09-06 targeted Family Coverage Completeness migration

1. Принята системная семантика Family Coverage Completeness: child questionnaire domain `0–25`, прямое статическое coverage каждого из `MARRIED`, `REGISTERED_PARTNERSHIP`, `UNREGISTERED_PARTNERSHIP`, отсутствие scenario не считается legal NO.
2. Повторно исследованы official family materials для adult children. Age of Majority Act подтверждает full age с 18 лет; универсальный legal interval `18–25` не вводился.
3. Category B (`CSEP`, `ICT`, Hosting Agreement researcher): minor child `0–17` может идти с initial family path; dependent adult child `18+` имеет отдельный path после 24 месяцев при serious medical/psychological dependency, Stamp 0 и повышенном financial test.
4. Category C (`GEP`): minor child path после 12 месяцев; dependent adult child `18+` — после 60 месяцев.
5. `IE_FAMILY_NON_EEA` remapped как supporting inventory для minor и adult-dependent child.
6. International protection remapped отдельно: после текущего двухлетнего waiting period adult child может квалифицироваться при long-term dependency либо mental/physical disability.
7. Ordinary Study и independent Stamp 0 получили явный `NOT_AVAILABLE` child outcome с open upper bound, поэтому questionnaire ages 18–25 больше не дают missing-family data contract.
8. Все partner scenarios прямо перечисляют три questionnaire relationship values; validator не выводит coverage из `condition_ru` и не переносит его через formalization fallback.
9. IE strict family audit PASS; IE-specific regression 14/14 PASS; focused IE/family suite 39/39 PASS.
10. Sources: 56/56 referenced, unused/undefined 0/0. Research `open_items` остаётся пустым.
