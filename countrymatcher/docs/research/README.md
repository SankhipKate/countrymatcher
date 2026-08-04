# Исследования стран

## Основные документы

- [Единый стандарт исследования страны](../../../source-documents/COUNTRY_RESEARCH_STANDARD.md)
- [Единый стандарт сопоставления и результата](../../../source-documents/MATCHING_AND_RESULT_STANDARD.md)
- [JSON Schema Research Package 3.0](../../data/research-package-v3.0.schema.json)

## Подключённые страны

### Аргентина

- Машиночитаемые данные: `../../data/argentina-research-v3.0.json`
- Отчёты и рабочие материалы: `./argentina/`

### Испания

- Машиночитаемые данные: `../../data/spain-research-v3.0.json`

### Уругвай

- Машиночитаемые данные: `../../data/uruguay-research-v3.0.json`

### Парагвай

- Машиночитаемые данные: `../../data/paraguay-research-v3.0.json`
- Статус: подключены два публичных маршрута; Investor Pass скрыт

### Португалия

- Машиночитаемые данные: `../../data/portugal-research-v3.0.json`
- Отчёты и рабочие материалы: `./portugal/`
- Адаптер калькулятора: `../../js/countries/portugal-adapter.js`
- Статус: подключены D8, D7, D2 и D1; `PT_D3_HIGHLY_QUALIFIED` скрыт по `publishable: false`

### Мексика

- Машиночитаемые данные: `../../data/mexico-research-v3.0.json`
- Отчёты и рабочие материалы: `./mexico/`
- Адаптер калькулятора: `../../js/countries/mexico-adapter.js`
- Статус: подключены восемь публичных маршрутов

### Бразилия

- Машиночитаемые данные: `../../data/brazil-research-v3.0.json`
- Отчёты и рабочие материалы: `./brazil/`
- Адаптер калькулятора: `../../js/countries/brazil-adapter.js`
- Статус: подключены восемь публичных маршрутов и пять городов

## Исследование новой страны

Новые исследования создаются только по [единому стандарту](../../../source-documents/COUNTRY_RESEARCH_STANDARD.md) и проверяются по [Research Package 3.0](../../data/research-package-v3.0.schema.json).

Для запуска исследования используйте [готовый промпт](../../../source-documents/NEW_COUNTRY_RESEARCH_PROMPT.md). До подключения рабочие файлы находятся только в корневом `research-backlog/`; после подключения текущая версия переносится в `countrymatcher/docs/research/`, а пакет — в `countrymatcher/data/`.
