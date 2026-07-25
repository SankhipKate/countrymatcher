# Paraguay Research Package 3.0

Пакет миграции исследования Парагвая из версии 2.2 в Research Package 3.0.

## Файлы

- `paraguay-research-v3.0.json` — машиночитаемый пакет, проверенный по JSON Schema 3.0.
- `paraguay-report-ru-v3.0.md` — полный человекочитаемый отчёт.
- `paraguay-completeness-report-v3.0.md` — аудит полноты и блокеры публикации.
- `paraguay-research-v3.0.xlsx` — рабочая таблица.
- `paraguay-test-profiles-v3.0.json` — сценарии ожидаемых статусов для будущего адаптера.
- `validation-report.txt` — результат автоматической проверки JSON.

## Решение

К будущему подключению готовы:

- `PY_TEMPORARY`;
- `PY_PERMANENT_AFTER_TEMP`.

Скрыт:

- `PY_INVESTOR_PASS`.

Пакет не изменяет код калькулятора и не должен автоматически заменять старые файлы до проверки.
