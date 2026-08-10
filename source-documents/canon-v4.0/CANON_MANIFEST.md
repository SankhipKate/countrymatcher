# Country Matcher — Canon 4.0

Current Canon version: 4.0

## Normative documents

1. [`COUNTRY_RESEARCH_STANDARD.md`](COUNTRY_RESEARCH_STANDARD.md) — что и как исследуется для страны.
2. [`MATCHING_AND_RESULT_STANDARD.md`](MATCHING_AND_RESULT_STANDARD.md) — как исследованные данные сопоставляются с анкетой и формируется пользовательский результат.

Только эти два документа являются normative standards Canon 4.0.

## Operational research prompt

[`NEW_COUNTRY_RESEARCH_PROMPT.md`](NEW_COUNTRY_RESEARCH_PROMPT.md) — рабочий prompt для исследования новой страны. Он не создаёт самостоятельных правил и обязан соответствовать двум normative standards.

## Machine contract

[`research-package-v4.0.schema.json`](../../countrymatcher/data/research-package-v4.0.schema.json)

## Validator

[`validate-v4.0.py`](../../countrymatcher/data/validate-v4.0.py)

## Research order

[`COUNTRY_RESEARCH_ORDER_v4.0.json`](../COUNTRY_RESEARCH_ORDER_v4.0.json)

## Supporting Canon artifacts

- [`FINAL_LOCK_VALIDATION_REPORT_v4.0.md`](FINAL_LOCK_VALIDATION_REPORT_v4.0.md)
- [`process/`](process/)

Supporting artifacts не являются третьим или дополнительным нормативным стандартом.

## Version lock

- `schema_version = 4.0`;
- `canon_revision = 2026-08-08-final-lock`;
- более ранние draft Research Package 4.0 без текущего `canon_revision` являются superseded;
- несовместимое изменение структуры Research Package требует новой версии формата.
