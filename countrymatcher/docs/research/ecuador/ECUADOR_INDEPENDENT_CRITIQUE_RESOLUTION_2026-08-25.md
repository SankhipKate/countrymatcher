# Эквадор — разбор независимой критики и исправления

Дата: 2026-08-25

## Итог

Критика принята по пунктам 4.1–4.5 с уточнением по 4.4. Пункт 5 о якобы неподтверждённом исключении граждан РФ из обычной +90-дневной туристической пролонгации отклонён после дополнительной проверки: актуальная официальная процедура Ministerio del Interior MDI-45 прямо говорит, что пролонгация не применяется к российским гражданам и повторяет двустороннее правило 90 дней в каждом 180-дневном периоде.

## Исправления

1. `EC08`, `EC09`, `EC12`: dev-host заменён на production `www.gob.ec`.
2. Корневые ссылки заменены прямыми официальными страницами/документами для `EC05`, `EC18`, `EC20`, `EC22`, `EC23`, `EC24`, `EC33`, `EC45`.
3. `EC34`–`EC41`: специализированные маршруты больше не используют один общий URL; назначены отдельные route-specific источники.
4. Добавлены `EC48`–`EC51`: прямые источники для DNV, Rentista, Jubilado, Student; их `official_source_id` обновлены.
5. DNV annual dependent formula: числовое `3 000 USD` сохранено только как машинное арифметическое представление `250 USD × 12`; confidence годовой альтернативы понижен до `MEDIUM`, текст прямо называет значение производным.
6. Добавлен `EC52`: актуальная официальная процедура MDI-45 Министерства внутренних дел; `entry_for_russian_citizen.source_ids = [EC14, EC52]`.
7. Добавлены regression tests на dev-host, generic duplicate sources, direct evidence links, route-specific official sources и российскую пролонгацию.
8. Research provenance обновлён: текущий production reference `a55558f / 10.0.0`; сама изолированная check-build остаётся технической сборкой на 9.1.1 и не является базой production-интеграции.

## Проверки

- RP4 Schema validation: PASS
- RP4 Integrity validation: PASS
- Ecuador focused regression: 19/19 PASS
- Non-Ajv repository suite в текущей среде: 427/427 PASS
- Четыре Ajv-dependent test files в этой среде не запускаются из-за отсутствия `ajv` / `ajv-formats`; независимая проверка исходной check-build ранее закрыла этот environment gap полным 462/462 PASS до добавления четырёх новых source-audit regression tests.

## Непубликуемый маршрут

`EC_FISCAL_TEMP_5Y` остаётся `publishable=false`. Два прежних open item сохраняются и этой source-quality правкой не закрываются.
