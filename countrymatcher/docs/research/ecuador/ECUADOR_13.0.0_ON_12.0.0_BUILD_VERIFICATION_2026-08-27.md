# Ecuador 13.0.0 on Country Matcher 12.0.0 — build verification

Дата: 2026-08-27

База: приложенный проект Country Matcher 12.0.0 с активными Грецией и Коста-Рикой.

Release candidate: `13.0.0`.

## Состав

- Эквадор активирован как тринадцатый RP4 package.
- `EC_PR_21_MONTHS` остаётся `publishable=false` как второй этап temporary residence → permanent residence.
- `EC_FISCAL_TEMP_5Y` остаётся `publishable=false` из-за blocking open items.
- Публичных Ecuador routes: 20 из 22.
- Derivative spouse/minor-child family filing закодирован как administrative-only и сам по себе не понижает стартовый маршрут.
- Греция, Коста-Рика и остальные активные страны сохранены из базы 12.0.0.

## Проверки в сборочной среде

- Все 13 активных RP4 packages: Schema PASS + Integrity PASS.
- Ecuador + family semantics + project contract + Quality of Life focused suite: 54/54 PASS.
- Расширенный Node suite без четырёх Ajv-dependent файлов выполнил остальные тесты; отдельный canonical `bash ./verify` должен быть выполнен на release worktree с `npm ci`, чтобы установить Ajv и закрыть полный gate.
- Отдельный browser smoke должен выполняться на release worktree до commit/merge.
