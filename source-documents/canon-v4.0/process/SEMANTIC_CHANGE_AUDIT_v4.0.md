# Semantic change audit — Country Matcher 4.0

Версия: 4.0

Дата: 2026-08-08
База: `FINAL_LOCKED 2026-08-07` + semantic diff против версии 1.0 + пилот Испании.

Этот файл фиксирует изменения, вошедшие в канон 4.0. Полный P1/P2 diff сохранён отдельным артефактом и отложен в post-MVP backlog.

| Область | FINAL_LOCKED 2026-08-07 | Решение MVP | Причина |
|---|---|---|---|
| Атомарность requirements | Было общее «каждый критерий отдельным объектом» | REWORDED/STRENGTHENED | Явно запретить упаковку независимо выполняемых оснований |
| ENGINE/profile_path | `profile_path` мог быть null | CHANGED | Автоматическая проверка без привязки к вопросу анкеты недетерминирована |
| INCOME_OR_SAVINGS | `unmet_effect` применялся слишком рано к известной альтернативе | CHANGED | Неизвестная допустимая альтернатива даёт condition; `unmet_effect` применяется только после окончательного провала всей модели |
| География дохода | Собиралась, но пользовательские состояния и правила сопоставления были неполны | RESTORED | Может менять статус DNV и других маршрутов |
| Application methods | Частичная логика | RESTORED/REWORDED | Один недоступный способ не должен блокировать маршрут; виза может быть condition |
| `visa_required_for_ru` | Требовался у всех methods | CHANGED | Самостоятельный смысл есть у THIRD_COUNTRY; для Испании въезд хранится отдельно |
| Семья / long-term | null был неоднозначен | REWORDED | Same-route семья наследует route.long_term_path; отдельный путь требует ссылки/собственной линии |
| Гражданство | `renunciation_required=true` автоматически блокировал сохранение РФ | CHANGED | Испанская декларация не равна автоматической утрате гражданства РФ |
| Сортировка | Учитывалось число conditions | CHANGED | Метрика зависит от дробления требований и подняла UGE над DNV |
| Hidden score | Явный запрет был потерян | RESTORED | MVP использует только последовательные объяснимые критерии |
| Semantic audit процесса | Не был обязательным артефактом | ADDED | Предотвращает повторную тихую потерю правил |
| Не спрашиваемые основания vs характеристики существующего основания | `UNASKED_CONDITION` применялся слишком широко | CHANGED/CLARIFIED | Зачисление/оферта/новое самостоятельное основание по умолчанию создают condition; длительность уже существующей работы/дохода и история текущего работодателя/заказчика не понижают статус; диплом/образование и профессиональный опыт также не понижают статус и выводятся как DISPLAY_ONLY. Новый обязательный профессиональный допуск/лицензия может оставаться condition только когда его действительно требуется получить |

## Осознанно не возвращено сейчас

Городская медиана, полный contract cost-of-living, визуальные/mobile требования, расширенная налоговая модель и остальные P1/P2-потери не отвергнуты. Они отложены в `POST_MVP_BACKLOG_v4.0.md`, потому что не являются условием корректного юридического статуса MVP.


## 2026-08-08 — Canon 4.0: образование и опыт

- Изменение: диплом/образование и профессиональный опыт, которые анкета 4.0 намеренно не спрашивает, переведены из `UNASKED_CONDITION` в `DISPLAY_ONLY`.
- Причина: продукт не должен считать отсутствующим диплом или опыт только из-за отсутствия вопроса в анкете; эти факты проверяются при подаче.
- Контрольный пример: DNV при подтверждённой удалённой работе и достаточном доходе не понижается из-за требования «образование ИЛИ N лет опыта» или длительности существующей работы/отношений.
- Не изменено: самостоятельные основания (зачисление, оферта, бизнес-проект и т. п.) по-прежнему считаются ещё не полученными и дают `condition`.
- Не изменено автоматически: профессия/официальное признание квалификации/лицензия могут быть условием, если это новый обязательный юридический допуск.


## Final Lock 2026-08-08

До этой фиксации Research Package 4.0 был draft. Final Lock сохраняет номер формата 4.0, но вводит обязательный `canon_revision = 2026-08-08-final-lock`. Ранее созданные 4.0-пакеты являются несовместимыми superseded draft и должны быть пересобраны. После Final Lock любое несовместимое изменение структуры/семантики Research Package требует новой версии формата.

Изменения Final Lock:

- non-financial ENGINE: обязательный `engine_rule`; `accepted_values` не используется;
- INCOME alternative: обязательный `income_owners`;
- `financialAlternative.confidence`: только HIGH/MEDIUM;
- ONLINE: только дополнительный канал, не место подачи и не участник географического ranking;
- `unmet_effect`: применяется после вычисления всей financial.model; неизвестная альтернатива не является fail;
- processing_time: сравнивается только официальный числовой срок одного смысла;
- климат: coolest = min(cold_min_c), hottest = max(hot_max_c).


## MVP role clarification

Final Lock R2 clarification:
- questionnaire respondent = `APPLICANT`;
- accompanying adult = `PARTNER`;
- no new question for selecting the main applicant;
- no automatic applicant/partner permutation;
- `income_owners` is researched per financial alternative and never uses a silent `APPLICANT` fallback.

This clarification does not add a questionnaire field.


## Final Lock R3 — Partner Financial Shadow Check

Добавлена MVP-функция без изменения Research Package schema:
- после основного результата допускается информационная shadow-проверка финансов партнёра;
- используется тот же financial evaluator, но полный matching за партнёра не выполняется;
- положительный триггер только `partnerShadowFinancial = PASS` при `applicantFinancial != PASS`;
- основной route status, best route и sorting не меняются;
- партнёр не объявляется подходящим на маршрут;
- новая анкета открывается только по явному действию пользователя и начинается с нуля.

Изменение не добавляет вопросов в анкету и не меняет `schema_version: 4.0`.


## Final Lock R4 — Partner hint wording

User-facing partner hint simplified to the approved product wording:

> **Хотите проверить вариант партнёра?**
> Данные второго взрослого соответствуют требованиям некоторых маршрутов, которые не проходят по вашим данным. Возможно, результат будет другим, если пройти анкету от его лица.

Route names remain internal and are not shown in this hint.

The normative shadow-check trigger was also clarified: the financial requirement must be one in which income of a potential `APPLICANT` is an allowed basis. This does not mean the current applicant already satisfies it.

No Research Package schema change.


## Final Lock R5 — generic partner hint consistency

Resolved the internal contradiction between the approved generic UI wording and §8.11.11.

- Shadow check remains financial-only internally.
- UI wording remains intentionally generic.
- UI does not list route names or partner route statuses.
- UI does not say that the partner is suitable for a route.
- No non-financial-blocker filter is added; such blockers belong to the current applicant and may not persist for the partner.

No Research Package schema change.
