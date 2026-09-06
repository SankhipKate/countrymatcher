# France — Country Matcher 19.0.0 release verification

**Дата:** 2026-09-06
**База:** предоставленный source archive CountryMatcher main 18.0.1
**Итоговая версия:** 19.0.0
**Страна:** Франция (`FR`)

## Выполненная интеграция

- `FR-research-v4.0.json` добавлен как девятнадцатый активный RP4-пакет.
- Франция добавлена в единый `data/active-countries.json` manifest с `introduced_version: 19.0.0`.
- Runtime и Pages artifact получают список RP4-пакетов из этого manifest; отдельные FR-hardcode списки не добавлялись.
- `release:sync` синхронизировал generated sections в README / research README / project overview и перевёл Францию в статус `Подключена` в `COUNTRY_RESEARCH_ORDER_v4.0.json`.
- Добавлен отдельный Quality of Life editorial entry; он не участвует в matching или sorting.
- В repository research docs сохранены финальные материалы исследования, reconciliation, RP4 verification и regression expectations.
- Добавлен `france-rp4.test.mjs` с 14 целевыми проверками после post-audit correction.
- `VERSION` установлен в `19.0.0`, `DEPLOYMENT.md` дополнен release history для девятнадцатой страны.

## Зафиксированная семантика

- 17 исследованных RP4-веток: 12 публикуемых и 5 скрытых по product publication boundary.
- Visitor с собственным доходом или накоплениями оценивается в `FR_VISITOR`.
- Поддержка платёжеспособного третьего лица представлена отдельной веткой `FR_VISITOR_SPONSOR` как `UNASKED_CONDITION`.
- Будущий французский трудовой договор и его зарплата не подменяются текущим иностранным доходом.
- Инвестиция хранится как `CAPITAL / ONE_TIME`, а student finance сохраняет отдельные `INCOME / SAVINGS / SPONSOR / SCHOLARSHIP` альтернативы.
- Для Парижа, Лиона, Нанта и Дижона присутствует единая корзина `RENT_STANDARD + UTILITIES + GROCERIES + TRANSPORT`.
- Студенческий срок сохраняет `PARTIAL` counting для EU long-term resident path и требует смены основания для самого long-term-resident route.
- Adult child 18+ не создаёт `DATA_CONTRACT_PROBLEM`: используется отдельное основание.
- Ordinary regroupement familial и talent-famille не расширены автоматически с marriage на PACS; соответствующая семантика подтверждена источниками.

## Проверки в этой сборке

- `npm run release:sync -- --check`: PASS.
- France schema validation: PASS.
- France integrity validation: PASS.
- France focused Node regression: 16/16 PASS.
- Все 19 RP4-пакетов прошли schema + integrity validation.
- Full Node suite на предыдущем France 19.0.0 worktree дал 688/689; единственным failure был старый Ireland regression, жёстко сравнивавший глобальную VERSION с 18.0.0. В базе main 18.0.1 этот Ireland-тест исправлен и больше не содержит такой проверки.
- Финальный pre-push `bash ./verify` должен быть запущен в Git worktree exact France 19.0.0 candidate, чтобы закрыть Git provenance и полный release gate.
- Git-specific checks неприменимы к распакованному source ZIP без `.git` metadata.

## Границы

Schema, validator, generic engine, questionnaire и matching semantics не изменялись. Generic presentation объединяет финансовые альтернативы одного requirement в один пользовательский пункт. France интегрирована поверх main 18.0.1 без замены данных Ирландии, Германии и остальных активных стран.
