# Ecuador check-build 10.0.0 — verification after independent review

Дата: 2026-08-26
База: Country Matcher 10.0.0 / a55558f, check-build; production manifest остаётся без EC.

## Исправления последнего review

- два отчётных `.md` перенесены из корня в `countrymatcher/docs/research/ecuador/`;
- восстановлен audit trail предыдущих Ecuador-проверок;
- оставшиеся внутренние self-reference удалены из Ecuador `*_ru` полей;
- climate `notes_ru` пяти городов теперь содержат фактические температурные характеристики;
- Ecuador copy regression расширен на `matching`, `presentation-only`, `engine`, `questionnaire`, «движк» и прежние паттерны;
- название Jubilado regression уточнено: проверяется актуальная карточка 2024 года и Reglamento a la LOMH.

## Воспроизводимые проверки на исправленном дереве

- Ecuador schema validation: PASS.
- Ecuador integrity validation: PASS.
- Ecuador focused regression: 23/23 PASS.
- project-contract: 20/20 PASS.
- repository tests без прямого Ajv/Ajv-formats import: 444/444 PASS.
- Pages artifact build: PASS.
- Ecuador `*_ru` internal self-reference violations: 0.
- видимые элементы корня репозитория: `countrymatcher`, `research-backlog`, `source-documents`, `verify`.

## Полный Ajv gate

В этой среде npm registry недоступен, поэтому четыре test-файла с прямой зависимостью от Ajv/Ajv-formats здесь не запускались. Независимая проверка предыдущего выданного архива выполнила полный suite и получила 482/483 с единственным FAIL в root `project-contract`. Этот конкретный дефект на исправленном дереве теперь воспроизводимо закрыт: `project-contract` 20/20 PASS.

Полный результат 483/483 здесь не заявляется до повторного запуска Ajv-зависимых файлов в среде с установленными devDependencies.
