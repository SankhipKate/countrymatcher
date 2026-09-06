# Франция — research log

- 2026-09-04: выполнен Research/Data Fix Closure после Research → Canon reconciliation.
- Удалены 8 повторных visitor requirements; страхование и запрет работы переведены в DISPLAY_ONLY.
- Visitor finance сохранён как условие с альтернативами income/savings/solvent family sponsor, чтобы неизвестный sponsor не создавал ложный FAIL.
- €300 000 investor исправлены с annual income на one-time investment capital; для talent business отдельно сохранено €30 000 project capital.
- Student finance разделён на income, savings, sponsor и scholarship; future employment salary отделена от текущего пользовательского дохода.
- Family reunification finance переведён на sponsor/household semantics и семейную формулу 100/110/120% SMIC.
- Asylum переведён с ошибочной консульской подачи VFS на IN_COUNTRY; family и long-term copy сделаны protection-specific.
- Student EU-LTR counting помечен PARTIAL; ICT, trainee и volunteer не представлены как самостоятельный пятилетний EU-LTR path.
- Аренда унифицирована как расчёт квартиры 60 м² по опубликованным средним ставкам за м²: Париж €1 980, Лион €1 020, Нант €840, Дижон €780.
- Добавлена обязательная единая продуктовая корзина Numbeo на одного человека в месяц: Париж €391,57; Лион €399,05; Нант €323,33; Дижон €317,13. Для Нанта и Дижона месячная сумма получена прозрачным умножением опубликованного дневного минимума на 31 день в соответствии с методикой источника.
- Финальная проверка: schema validation PASS; integrity validation PASS; open items 0; итог READY FOR RP4 MAPPING.
- 2026-09-04 RP4 mapping: юридический visitor разделён на `FR_VISITOR` для оцениваемых собственных income/savings и `FR_VISITOR_SPONSOR` для неизвестной анкете поддержки третьего лица. Это предотвращает как вечный conditional при достаточных собственных ресурсах, так и ложный FAIL при возможном sponsor.
- Добавлен `FR_REGRESSION_EXPECTATIONS_v4.0.json`; фактический RP4 engine smoke PASS: 17 веток, 12 publishable, 5 hidden.

- 2026-09-03: повторный содержательный аудит выявил, что прежний schema PASS не подтверждал полноту.
- Расширен statutory inventory с 9 до 16 маршрутов; OTHER исправлен с ложного NO_ROUTE на стажировку и волонтёрство.
- Требования visitor, employee, Blue Card, ICT, self-employed, investor, student, family reunification и asylum разнесены на самостоятельные поля.
- Добавлены пять самостоятельных talent-подмаршрутов с прямым официальным источником.
- Исправлена сравнительная городская корзина; добавлен отдельный SMALL-город Дижон.
- Удалены неподтверждённые school/cost привязки; международные школы и tuition подтверждены страницами организаций.
- Pet-блок сокращён до решающих ограничений, без перечисления стандартных ветеринарных процедур.
- После записи запускаются schema validator и отдельные content-integrity assertions.
