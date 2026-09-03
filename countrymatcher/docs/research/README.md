# Исследования стран

## Основные документы

- [Единый стандарт исследования страны 4.0](../../../source-documents/canon-v4.0/COUNTRY_RESEARCH_STANDARD.md)
- [Единый стандарт сопоставления и результата 4.0](../../../source-documents/canon-v4.0/MATCHING_AND_RESULT_STANDARD.md)
- [JSON Schema Research Package 4.0](../../data/research-package-v4.0.schema.json)

## Подключённые страны

В активный matcher подключены пятнадцать Research Package 4.0:

- Испания — `../../data/ES-research-v4.0.json`;
- Аргентина — `../../data/AR-research-v4.0.json`;
- Уругвай — `../../data/UY-research-v4.0.json`;
- Бразилия — `../../data/BR-research-v4.0.json`;
- Португалия — `../../data/PT-research-v4.0.json`;
- Мексика — `../../data/MX-research-v4.0.json`;
- Парагвай — `../../data/PY-research-v4.0.json`;
- Колумбия — `../../data/CO-research-v4.0.json`;
- Черногория — `../../data/ME-research-v4.0.json`;
- Чили — `../../data/CL-research-v4.0.json`;
- Греция — `../../data/GR-research-v4.0.json`;
- Коста-Рика — `../../data/CR-research-v4.0.json`;
- Эквадор — `../../data/EC-research-v4.0.json`;
- Таиланд — `../../data/TH-research-v4.0.json`;
- Мальта — `../../data/MT-research-v4.0.json`.

Файлы Research Package 3.0 и старые country reports сохраняются только как архивные материалы и не используются активным matcher.

Quality of Life хранится отдельно в `../../data/quality-of-life-ru.json`. Это editorial presentation layer, а не Research Package и не источник route status.

## Исследование новой страны

Новые исследования создаются только по [единому стандарту 4.0](../../../source-documents/canon-v4.0/COUNTRY_RESEARCH_STANDARD.md) и проверяются по [Research Package 4.0](../../data/research-package-v4.0.schema.json).

Для запуска исследования используется [готовый промпт 4.0](../../../source-documents/canon-v4.0/NEW_COUNTRY_RESEARCH_PROMPT.md). До подключения рабочие исследовательские материалы находятся в корневом `research-backlog/`; после интеграции активный пакет находится в `countrymatcher/data/`, а необходимые отчёты могут сохраняться в `countrymatcher/docs/research/`.
