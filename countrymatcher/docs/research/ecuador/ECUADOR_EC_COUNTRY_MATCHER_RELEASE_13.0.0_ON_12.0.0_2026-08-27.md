# Эквадор (EC) — production integration 13.0.0 on 12.0.0

**Дата:** 27 августа 2026 года
**База:** приложенный проект Country Matcher `12.0.0`
**Release candidate:** `13.0.0`
**Canon:** 4.0, `canon_revision = 2026-08-08-final-lock`

## Research source

Фактическая страновая база берётся из ранее завершённого и аудированного исследования `ECUADOR_EC_COUNTRY_MATCHER_COMPLETE_V10_2026-08-26.md` вместе с последующими audit-resolution материалами этой папки. Перенос на 12.0.0 не переисследует страну и не меняет подтверждённые legal facts; меняется production integration layer.

## Production semantics

- В RP4 сохранено 22 исследованных маршрута.
- 20 стартовых/пользовательских маршрутов имеют `publishable=true`.
- `EC_PR_21_MONTHS` имеет `publishable=false`: это второй этап temporary residence → permanent residence, а не самостоятельный способ переезда. Его условия отражены в `long_term_path` стартовых маршрутов.
- `EC_FISCAL_TEMP_5Y` имеет `publishable=false` из-за незакрытых route-specific research gaps.
- Для DNV, Rentista и Jubilado сохраняются семейные финансовые формулы с доплатой `250 USD` за иждивенца там, где это подтверждено исследованием.
- Оформление признанного супруга/партнёра и несовершеннолетнего ребёнка по derivative family/amparo не трактуется как самостоятельное миграционное основание только из-за отдельной административной подачи.
- Незарегистрированное партнёрство не превращается в unconditional family fit: признание `unión de hecho`/применимое основание остаётся отдельной проверкой.
- Country-specific engine logic не добавляется; Эквадор использует общий Canon 4.0 runtime.

## Integration into 12.0.0

Сохранены обе уже активные страны поверх прежнего 10.0.1 baseline: Греция (`11.0.0`) и Коста-Рика (`12.0.0`). Эквадор добавляется тринадцатым package без отката их RP4, тестов, Pages allowlist semantics или production status fixes.

Синхронизируются `VERSION`, active-country manifest, matcher package list, Pages allowlist, Quality of Life, project/research docs и regression contracts.
