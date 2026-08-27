# Ecuador 10.0.0 — resolution of independent check

Дата: 2026-08-26

## Подтверждено и исправлено

1. Два отчётных Markdown-файла были ошибочно размещены в корне check-build и ломали `project-contract`. Они перенесены в `countrymatcher/docs/research/ecuador/`.
2. Восстановлен audit trail предыдущих раундов проверки Эквадора в `countrymatcher/docs/research/ecuador/`.
3. Из пользовательских `*_ru` полей Ecuador RP4 удалена оставшаяся внутренняя продуктовая лексика: `matching`, `presentation-only`, `engine/questionnaire`, «для движка».
4. Климатические `notes_ru` пяти городов заменены фактическими описаниями сохранённых температурных диапазонов.
5. Regression-тест Ecuador copy-contract расширен на весь выявленный класс внутренних терминов.
6. Название теста Jubilado уточнено: он проверяет актуальную карточку 2024 года и Reglamento a la LOMH.

## Проверки этой сборки

- Ecuador schema validation: PASS.
- Ecuador integrity validation: PASS.
- Ecuador focused regression: 23/23 PASS.
- Project contract: 20/20 PASS.
- Все доступные без Ajv repository tests: PASS (итоговая цифра зафиксирована в verification-файле после прогона).
- Полный Ajv-dependent suite в этой среде не воспроизводится из-за отсутствия сетевого доступа к npm registry. Независимая проверка предыдущего архива дала 482/483 с единственным падением root `project-contract`; этот конкретный дефект теперь воспроизводимо закрыт тестом 20/20.
