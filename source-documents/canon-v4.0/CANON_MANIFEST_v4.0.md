# Country Matcher — Canon 4.0

**Версия канона:** 4.0
**Дата:** 2026-08-08

## Единое правило версий

С этого пакета номер `4.0` относится одновременно к текущей редакции нормативных документов и к формату новых/пересобранных Research Package. Окончательный формат дополнительно идентифицируется `canon_revision = 2026-08-08-final-lock`; более ранние пакеты с `schema_version = 4.0` являются superseded draft и невалидны после Final Lock. Текущие канонические имена файлов и папок содержат `v4.0` или `4.0`.

Старые обозначения `1.3`, `3.0`, `3.1`, `3.2` могут встречаться только как историческая ссылка на исходную/предыдущую версию в migration/audit-тексте. Они не обозначают текущий канон.

## Что входит

- `source-documents/` — нормативы исследования, сопоставления и промпт новой страны;
- `source-documents/` — актуальные проектные и рабочие документы;
- `countrymatcher/data/` — JSON Schema 4.0 и validator 4.0;
- `process-v4.0/` — решение по статусам, semantic audit и post-MVP backlog;
- `research-v4.0/spain-v4.0/` — миграция актуального финального исследования Испании в `ES-research-v4.0.json`.

## Испания

Финальный фактический Research Package Испании от 2026-08-07 существует как `ES-research-v3.0.json`. Для канона 4.0 он должен быть пересобран скриптом в `ES-research-v4.0.json`. Старый GitHub-файл Испании от 2026-07-18 не является допустимой заменой.

## Другие страны

Старые исследования других стран **не переименовываются автоматически** в v4.0. Каждая страна получает имя `*-research-v4.0.json` только после проверки/миграции по стандартам 4.0. Это предотвращает ложную маркировку старых исследований как соответствующих новому канону.


## Final Lock

Статус: **FINAL LOCK 2026-08-08**. После этой точки несовместимые изменения Research Package требуют новой версии формата.


## Final Lock R2 clarification

R2 does not change `schema_version: 4.0`.
It fixes MVP role semantics and migration safety:
`APPLICANT` is the questionnaire respondent, `PARTNER` is the accompanying adult,
and Spain migration no longer guesses `APPLICANT` for unknown INCOME requirements.


## Final Lock R3 clarification

R3 adds the MVP `Partner Financial Shadow Check`.

It does not change `schema_version: 4.0`, does not change country package structure,
does not add a questionnaire field, and does not modify applicant/partner role semantics.
The feature is informational only and belongs to the matching/result layer.


## Final Lock R4 clarification

R4 finalizes the user-facing Partner Financial Shadow Check wording and removes ambiguity from the normative trigger condition.

No `schema_version` or Research Package structure change.


## Final Lock R5 clarification

R5 aligns §8.11.11 with the approved generic Partner Financial Shadow Check wording.
The internal check remains financial-only; the UI wording stays generic by product decision.

No `schema_version` or Research Package structure change.
