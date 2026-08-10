# Исследования стран

## Основные документы

- [Единый стандарт исследования страны 4.0](../../../source-documents/COUNTRY_RESEARCH_STANDARD_v4.0.md)
- [Единый стандарт сопоставления и результата 4.0](../../../source-documents/MATCHING_AND_RESULT_STANDARD_v4.0.md)
- [JSON Schema Research Package 4.0](../../data/research-package-v4.0.schema.json)

## Подключённые страны

### Испания

- Активные машиночитаемые данные: `../../data/ES-research-v4.0.json`
- Статус: единственная подключённая страна Canon 4.0.

Аргентина, Бразилия, Мексика, Парагвай, Португалия и Уругвай ожидают миграции на Research Package 4.0. Их RP3.0-файлы сохранены как инертные исследования и не используются matcher.

## Исследование новой страны

Новые и пересобранные исследования создаются только по [единому стандарту 4.0](../../../source-documents/COUNTRY_RESEARCH_STANDARD_v4.0.md) и проверяются по [Research Package 4.0](../../data/research-package-v4.0.schema.json). Research Package 3.0 — прежний формат ещё не мигрированных исследований стран.

Для запуска исследования используйте [готовый промпт 4.0](../../../source-documents/NEW_COUNTRY_RESEARCH_PROMPT_v4.0.md). До подключения рабочие файлы находятся только в корневом `research-backlog/`; после подключения текущая версия переносится в `countrymatcher/docs/research/`, а пакет — в `countrymatcher/data/`.
