# Research backlog

Здесь находятся только проверяемые исследования стран, которые ещё не подключены к Country Matcher.

Для каждой страны создаётся отдельная папка. Для production-подключения:

1. действующий Research Package добавляется в `countrymatcher/data/`;
2. для страны добавляется запись в `countrymatcher/data/quality-of-life-ru.json`;
3. страна добавляется в `countrymatcher/data/active-countries.json`;
4. `countrymatcher/VERSION` обновляется по правилу `COUNTRIES.FEATURES.FIXES`;
5. в `countrymatcher/DEPLOYMENT.md` добавляется строка changelog релиза;
6. `npm run release:sync` из `countrymatcher/` синхронизирует статус `Подключена` и generated-секции maintained docs.

После подключения актуальные отчёты и источники хранятся в `countrymatcher/docs/research/<страна>/`, а завершённая рабочая папка страны удаляется из `research-backlog/`.

Старые версии и копии уже подключённых стран здесь не хранятся.
