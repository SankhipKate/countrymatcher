# Country Matcher — Боливия (BO): полное исследование страны

**Дата проверки:** 2026-09-06
**База проекта:** `main` commit `f14a558da36f55b99f5a3846538b33e484eefe21`, product version `18.0.1`, 18 active RP4 packages
**Этап:** Stage A — country research only
**Граница этапа:** этот документ не является RP4 JSON, не выполняет Research → Canon reconciliation и не интегрирует Боливию в приложение.

## A. Executive research status

| Показатель | Результат |
|---|---|
| Страна | Боливия |
| ISO-2 | BO |
| Валюта | боливиано (BOB) |
| Общий статус | **READY FOR RECONCILIATION** |
| Национальных миграционных процедур в актуальном Russia-specific inventory DIGEMIG | 33, включая 16 long-term temporary/definitive/citizenship procedures |
| Предварительных publishable candidates | 4: наёмная работа; самостоятельная деятельность; учёба; международная защита |
| Publication-boundary routes | family (отдельный/последующий путь), health, humanitarian, religious/agreement work, short transitory и business entry |
| Blocking research gaps | 0 |
| Contract gaps | 2 предварительных |

### Главный вывод

Для гражданина РФ въезд в Боливию безвизовый на срок до 90 дней в каждом периоде 180 дней. Боливийское право позволяет человеку, законно въехавшему как турист/посетитель, изменить статус внутри страны на временное пребывание по работе, учёбе, здоровью, семье или гуманитарному основанию. Временная резиденция по работе охватывает наёмную и самостоятельную доходную деятельность в Боливии. После минимум трёх лет подходящей временной резиденции возможна постоянная резиденция; общая натурализация требует **более трёх лет непрерывного законного пребывания**, экзамена по базовой истории и культуре и подтверждаемой деятельности.

Актуальный country-specific API DIGEMIG закрывает семейную матрицу: для несовершеннолетних действует t28, для взрослых — t27, причём t27 прямо допускает экономическую зависимость без верхней возрастной границы. Это покрывает возраст 0–25: 0–17 через minor family procedure, 18–25 — условно через adult dependency. Семья не включается автоматически в рабочую/учебную заявку: используется отдельная последовательная family procedure после того, как основной заявитель уже `radica en Bolivia` и имеет CIE. SERECI с 2023 года регистрирует свободные союзы однополых и разнополых пар по одинаковым требованиям; DIGEMIG принимает судебное решение о признании `unión libre`. Для иностранного брака/партнёрства безопасный подтверждённый сценарий — боливийское признание/оформление unión libre, а не предположение об автоматической homologación документа.

## B. Route inventory

| Research ID | Национальное основание | Основная Canon-категория | Доступность для граждан РФ | Предварительная публикация | Research status |
|---|---|---|---|---|---|
| BO_WORK_TEMPORARY | t22 наёмная работа / t23 самостоятельная доходная деятельность, 1–3 года | LOCAL_EMPLOYMENT + ENTREPRENEURSHIP_SELF_EMPLOYMENT | Да | Candidate | COMPLETE |
| BO_STUDY_TEMPORARY | t29/t30 временное пребывание по обучению, 1–3 года | STUDY | Да | Candidate | COMPLETE |
| BO_FAMILY_TEMPORARY | t27 взрослые / t28 несовершеннолетние, 1–3 года | FAMILY | Да при доказанной связи/зависимости | Нет: отдельный последовательный family route | COMPLETE |
| BO_REFUGEE | Статус беженца / международная защита по Закону №251 | INTERNATIONAL_PROTECTION | Формально без nationality exclusion | Candidate | COMPLETE на уровне основания; индивидуальная оценка не проводится |
| BO_HUMANITARIAN_TEMPORARY | Временное гуманитарное пребывание: non-refoulement, торговля людьми, сопровождающий больного, отдельные уголовно-процессуальные случаи | OTHER | Да при специальном факте | Нет: узкое специальное основание | COMPLETE на уровне inventory |
| BO_HEALTH_TEMPORARY | Временное пребывание для специализированного лечения | OTHER | Да | Нет: узкое медицинское основание | COMPLETE на уровне inventory |
| BO_MULTIPLE_BUSINESS | Многократная виза для инвестиций и бизнеса: 1 год, пребывание не более 90 дней непрерывно | INVESTMENT | Да при бизнес-основании | Нет: это entry/business permission, не самостоятельная residence path | COMPLETE с оговоркой |
| BO_RELIGIOUS_VOLUNTEER | t26 Catholic religious work; иные religious/volunteer cases — object-specific/other lawful basis | OTHER | Да при подтверждённой организации/деятельности | Нет: узкая конфессиональная/организационная категория | COMPLETE на publication-boundary level |

### Что не является самостоятельным маршрутом

- Отдельной digital-nomad visa или remote-work residence в действующей миграционной системе не найдено.
- Отдельной резиденции рантье/финансово независимого лица не найдено.
- Отдельной пенсионной визы/резиденции не найдено.
- Отдельной категории highly qualified specialist не найдено: специалист использует общую работу.
- Внутрикорпоративный перевод не выделен как самостоятельная национальная residence category; применима общая работа, а бизнес-виза не разрешает постоянное проживание.
- Отдельного иммиграционного маршрута «купить недвижимость/вложить фиксированную сумму и получить ВНЖ» не найдено.
- «Общая резиденция без основания» не найдена: для временного статуса требуется документально подтвердить цель пребывания.

## C. Canon category coverage — все 13 категорий

| Canon category | Outcome | Linked research route / объяснение |
|---|---|---|
| DIGITAL_NOMAD_REMOTE_WORK | NO_ROUTE | Специальной nomad/remote visa нет. Работа по общей категории требует доходной деятельности в Боливии; допустимость работы исключительно на иностранного работодателя официально не подтверждена. |
| INCOME_FINANCIALLY_INDEPENDENT | NO_ROUTE | Официальные источники требуют цель пребывания; одной финансовой состоятельности как основания не найдено. |
| RETIREMENT | NO_ROUTE | Отдельной pensionado/retiree residence не найдено. Пенсия может быть доказательством средств, но не заменяет миграционное основание. |
| LOCAL_EMPLOYMENT | ROUTE_EXISTS | BO_WORK_TEMPORARY. |
| HIGHLY_QUALIFIED_SPECIALIST | NO_ROUTE | Отдельной категории нет; применяется BO_WORK_TEMPORARY. |
| INTRA_COMPANY_TRANSFER | NO_ROUTE | Самостоятельной категории нет; возможна общая рабочая процедура или business entry в зависимости от фактов. |
| ENTREPRENEURSHIP_SELF_EMPLOYMENT | ROUTE_EXISTS | BO_WORK_TEMPORARY прямо охватывает remunerated/l lucrative work «con o sin relación de dependencia» и работу por cuenta propia. |
| INVESTMENT | ROUTE_EXISTS | BO_MULTIPLE_BUSINESS существует, но не даёт самостоятельной временной резиденции и относится к publication boundary. |
| STUDY | ROUTE_EXISTS | BO_STUDY_TEMPORARY. |
| FAMILY | ROUTE_EXISTS | BO_FAMILY_TEMPORARY; family coverage пока блокирующе неполон. |
| GENERAL_RESIDENCE | NO_ROUTE | Временная резиденция требует конкретной цели. Постоянная резиденция — последующая стадия после трёх лет, а не первоначальный route. |
| INTERNATIONAL_PROTECTION | ROUTE_EXISTS | BO_REFUGEE; гуманитарный статус также поддерживает non-refoulement. |
| OTHER | ROUTE_EXISTS | BO_HEALTH_TEMPORARY, BO_HUMANITARIAN_TEMPORARY, BO_RELIGIOUS_VOLUNTEER. |

## D. Detailed route research

### D1. BO_WORK_TEMPORARY — работа и самостоятельная деятельность

**Legal basis.** Статья 13 DS №1923 определяет временное пребывание по работе для лиц, выполняющих оплачиваемую или доходную деятельность с трудовыми отношениями или без них, либо деятельность по государственным/частным соглашениям в Боливии. Закон №370 допускает временную резиденцию на 1, 2 или 3 года; фактическая длительность зависит от срока деятельности.

**Eligibility.** Нужны законный въезд/текущий законный статус, документ, подтверждающий цель и деятельность в Боливии, отсутствие требуемых судимостей, медицинские документы и документально подтверждённая экономическая состоятельность. Для наёмной работы ожидается местный договор/письмо и документы работодателя; для самостоятельной деятельности — документы о реальной деятельности. Простое наличие удалённой работы за рубежом официально не названо достаточным основанием.

**Nationality.** Специального запрета для граждан РФ не найдено.

**Filing.** Законно въехавший турист может изменить статус внутри Боливии. Заявления рассматривают центральный офис, департаментские администрации и уполномоченные миграционные пункты. Отдельная предварительная «visa de objeto determinado» существует, но статья 19 DS №1923 разрешает change of status после туристического въезда.

**Finance.** Фиксированного числа нет. Актуальные t22/t23 принимают любой релевантный вариант: именные банковские выписки за последние 3 месяца, трудовой/гражданский договор, доход от аренды/продажи либо иные связанные документы. Это `NO_FIXED_THRESHOLD`; USD 300/month остаётся только слабым историческим ориентиром и не является screening threshold.

**Work rights.** Сам статус выдается именно для доходной деятельности. До одобрения смены туристического статуса работа не разрешена.

**Initial status and renewal.** 1, 2 или 3 года в зависимости от деятельности; возможны продления в пределах конструкции Закона №370.

**PR.** Постоянная резиденция после минимум трёх лет временной резиденции. Временный резидент без предварительного разрешения не должен отсутствовать более 90 календарных дней суммарно или непрерывно за год, иначе статус подлежит отмене/прерыванию.

**Citizenship.** Более трёх лет непрерывного законного пребывания; экзамен с 12 лет; подтверждаемая деятельность; процедура через DIGEMIG, общая натурализация предоставляется президентской Resolución Suprema. Боливия не требует отказа от исходного гражданства.

**Material exclusions.** Иностранная remote employment сама по себе не названа: t22 ориентирован на боливийскую организацию/компанию, а t23 требует декларацию о доходной деятельности и месте её осуществления в Боливии. Семья оформляется отдельным последующим t27/t28.

### D2. BO_STUDY_TEMPORARY — учёба

**Basis and eligibility.** Обучение в начальной, средней школе или учреждении высшего профессионального образования. Студенческая виза обычно выдается на 60 дней и позволяет оформить временное пребывание; exchange categories могут иметь 180 дней.

**Validity.** До трёх лет с продлением периодами до трёх лет до завершения обучения.

**Work rights.** Общего официального разрешения студенту работать в исследованных нормах не найдено. Отсутствие запрета в найденном фрагменте не является разрешением.

**PR/citizenship.** DS №1923 прямо говорит, что по учебной категории нельзя получить постоянную резиденцию. Поэтому учебный период нельзя автоматически считать прямым PR route. Влияние учебных лет на более чем трёхлетний citizenship clock требует отдельной официальной квалификации, особенно при последующей смене статуса.

**Family.** Автоматического derivative inclusion нет. После выдачи студенту временного статуса/CIE партнёр и дети используют отдельный последующий t27/t28 на общих правилах.

### D3. BO_FAMILY_TEMPORARY — семейная связь

**Basis.** Кровное родство, гражданско-правовое родство/усыновление, экономическая зависимость, свойство или брак с лицом, находящимся в Боливии. Отдельная family visa на въезд выдается на 30 дней и позволяет перейти к временному статусу; турист также может менять категорию внутри страны.

**Timing.** t27 и t28 выдаются на 1, 2 или 3 года и стоят соответственно 260/360/460 UFV для взрослого и 160/210/260 UFV для несовершеннолетнего. SLA — 24 часа с момента подачи полного комплекта через ED-9 или очно.

**PR.** Закон №370 позволяет распространить уже полученную постоянную резиденцию на супруга, зависимых детей и находящихся на содержании родителей без собственного трёхлетнего ожидания. Это правило не доказывает аналогичную производную временную резиденцию на стадии первоначального переезда.

**Relationship forms.** t27 принимает легализованное свидетельство о браке либо судебное решение о признании unión libre. После SCP 0577/2022-S2 и Reglamento SERECI 2023 свободные союзы однополых и разнополых пар регистрируются на одинаковых условиях. Поэтому foreign registered/unregistered partner имеет подтверждённый conditional formalization path через боливийскую unión libre; автоматическое признание иностранного partnership не заявляется.

**Children.** t28 закрывает несовершеннолетних; t27 отдельно допускает взрослого экономически зависимого родственника без установленного maximum age. Поэтому ages 0–17 доступны как minors, ages 18–25 — условно при документированной economic dependency.

**Work rights.** Семейное пребывание не является рабочим основанием в перечне DIGEMIG. Консервативный product outcome: `NOT_AVAILABLE` без отдельной смены/получения t22 или t23; не выводить автоматическое право на работу из CIE.

### D4. BO_REFUGEE — международная защита

Закон №251 о защите беженцев регулирует признание статуса через CONARE и закрепляет non-refoulement. Это индивидуальное основание, требующее обоснованного страха преследования либо применения расширенного регионального определения; гражданство РФ само по себе не даёт и не исключает статус. Гуманитарная виза/временное гуманитарное пребывание может обеспечивать законность нахождения во время защиты. Практический шанс конкретного лица Country Matcher не оценивает.

### D5. BO_HUMANITARIAN_TEMPORARY

До одного года с возможными продлениями для необходимости международной защиты, жертв торговли людьми/эксплуатации, сопровождающего человека на специализированном лечении и отдельных лиц после освобождения в период процесса/исполнения наказания. Категория исключительная, не образует непрерывную резиденцию для PR. Относится к product publication boundary.

### D6. BO_HEALTH_TEMPORARY

Для специализированного лечения в Боливии: один год с продлениями до завершения лечения. После двух лет пребывание не считается непрерывным; постоянная резиденция из этой категории прямо исключена. Узкий непубликуемый route.

### D7. BO_MULTIPLE_BUSINESS — инвестиции и бизнес

Многократная виза предназначена для периодической деятельности по инвестициям и бизнесу, действует один год с продлением, но каждое непрерывное пребывание ограничено 90 днями. Требуются документы компании/налоговая регистрация и подтверждение деловой цели. Фиксированного minimum investment в найденных официальных правилах нет. Это не самостоятельная residence-by-investment program и не должно показываться как путь к ПМЖ.

### D8. BO_RELIGIOUS_VOLUNTEER

Visa de objeto determinado официально перечисляет религиозную и волонтёрскую цель. Для долгосрочного статуса необходима квалификация цели по действующей категории временного пребывания и документы принимающей организации. Самостоятельная непрерывная PR semantics не установлена в доступной guidance; маршрут остаётся research hold.

## E. Family coverage matrix

### E1. Relationship types

Для всех обычных основных маршрутов применяется один и тот же **отдельный последовательный** family path t27/t28; это не derivative inclusion в заявку основного заявителя.

| Questionnaire input | Подтверждённый outcome | Условие/представление |
|---|---|---|
| MARRIED | AVAILABLE_SEPARATE_LATER | t27 принимает легализованное свидетельство о браке и CIE иностранного супруга, уже проживающего в Боливии. Для иностранного однополого брака безопасный путь — признанная в Боливии unión libre. |
| REGISTERED_PARTNERSHIP | AVAILABLE_WITH_FORMALIZATION | Иностранная регистрация сама по себе не названа DIGEMIG; пара оформляет/признаёт unión libre в Боливии, затем представляет судебное решение по t27. SERECI применяет одинаковые требования к same-sex и different-sex couples. |
| UNREGISTERED_PARTNERSHIP | AVAILABLE_WITH_FORMALIZATION | Сначала регистрация/судебное признание unión libre, затем t27; без этой формализации одного фактического сожительства недостаточно. |

Для health, humanitarian и short business/transitory categories generic dependent entitlement не найден: член семьи использует t27/t28, собственное основание либо получает явный `NOT_AVAILABLE` outcome, если sponsor ещё не имеет статуса/CIE. В refugee cases действует family unity по специальному режиму защиты.

### E2. Children 0–25

| Возраст | Подтверждённый outcome |
|---|---|
| 0–17 | AVAILABLE_SEPARATE_LATER по t28: свидетельство о рождении/усыновлении/опеке; до 14 лет не требуется справка о несудимости. |
| 18–25 | AVAILABLE_WITH_CONDITION по t27: нотариальное письмо sponsor и декларация, что взрослый заявитель экономически зависит от проживающего в Боливии лица. Верхний возраст не установлен; решает доказанная зависимость. |
| Disability | Отдельное age exception не требуется для покрытия анкеты: инвалидность может поддерживать доказательство зависимости, но юридическое основание остаётся adult economic dependency. |

**Timing:** совместный безвизовый въезд возможен, но одновременное одобрение не подтверждено. t27/t28 требуют, чтобы иностранный родственник уже проживал в Боливии и предъявил CIE; поэтому сначала основной заявитель получает временное пребывание/CIE, затем семья подаёт отдельные заявления. Официальный SLA каждого полного заявления — 24 часа. **Family verdict: COMPLETE; весь domain MARRIED/REGISTERED/UNREGISTERED и ages 0–25 имеет явный outcome.**

## F. Finance research

| Route | Official rule | Fixed numeric threshold | Permitted evidence | Practical pass |
|---|---|---|---|---|
| BO_WORK_TEMPORARY | Solvencia económica + activity evidence | Нет | Выписки за 3 месяца; labor/civil contract; rent/sale income; other related evidence | NO_FIXED_THRESHOLD |
| BO_STUDY_TEMPORARY | Solvencia económica и подтверждение учёбы | Нет | Выписки/доход и admission/enrolment | NO_FIXED_THRESHOLD |
| BO_FAMILY_TEMPORARY | t27/t28 прямо требуют solvencia | Нет | Выписки за 3 месяца; contract; rent/sale income; other related evidence | NO_FIXED_THRESHOLD |
| BO_MULTIPLE_BUSINESS | Реальная компания/инвестиционная или деловая деятельность | Нет minimum investment | Учредительные/налоговые документы | Числовой capital threshold не найден |
| BO_PERMANENT | Документ о деятельности + solvencia económica | Нет | Documentary evidence | Защищаемая сумма не найдена |

### Practical screening assessment

USD 300/month имеет LOW confidence и годится лишь как historical display note. Решение для reconciliation: `NO_FIXED_THRESHOLD`, `practical_screening_threshold = null`; family formula отсутствует и не должна выдумываться.

## G. Entry, application and work rights

- Обычный российский паспорт: без визы до **90 календарных дней в каждом периоде 180 дней**, соглашение действует с 3 октября 2016 года.
- Биометричность паспорта отдельным условием соглашения не названа; требуется действительный обычный паспорт.
- Безвизовый въезд не даёт права на оплачиваемую работу.
- Change of status внутри Боливии разрешён из tourist/visit status в study, work, health, family или humanitarian status при выполнении требований.
- Консульская filing route существует через систему Cancillería; для гражданина РФ она не является единственным способом начать residence process из-за допустимого in-country change.
- Работа законна после одобрения подходящего рабочего статуса; бизнес multiple visa и tourist status не заменяют рабочую резиденцию.
- Student/family status не является рабочей категорией; для оплачиваемой деятельности безопасный outcome — отдельная t22/t23 либо смена основания, пока DIGEMIG не опубликует иной прямой entitlement.

## H. Processing, PR and citizenship

| Этап | Правило |
|---|---|
| Temporary residence | 1, 2 или 3 года в зависимости от категории/деятельности; study может продлеваться до завершения программы. |
| Continuity | Для temporary status отсутствие без разрешения свыше 90 дней в году ведёт к отмене/прерыванию; для definitive status предел — 2 года непрерывно. |
| Permanent residence | После минимум 3 лет временной резиденции; health и study прямо не ведут к definitive status; humanitarian не считается непрерывной резиденцией. |
| PR family extension | Супруг, зависимые дети и находящиеся на содержании родители могут получить расширение definitive status без собственного трёхлетнего срока. |
| General citizenship | Более 3 лет непрерывного законного пребывания, экзамен с 12 лет, подтверждаемая деятельность, проверки и Resolución Suprema. Формулировка «более трёх лет» означает, что подача ровно в день трёхлетия требует осторожности. |
| Reduced citizenship | 2 года непрерывного проживания при браке с гражданином/гражданкой Боливии либо наличии боливийского ребёнка; также при военной службе. |
| Language | Отдельного языкового сертификата в DS №4828 не найдено; есть экзамен культуры и элементарной истории. Практический язык процедуры — испанский. |
| Dual citizenship | Конституция Боливии не требует от натурализованного иностранца отказаться от исходного гражданства. Последствия по российскому праву требуют отдельной персональной проверки. |
| Processing time | Russia-specific DIGEMIG pages для t22, t23, t27, t28, t29/t30 и definitive/citizenship процедур указывают 24 часа после подачи полного комплекта; это SLA обработки, не включая сбор/легализацию документов. |

## I. Cities, costs and climate

### City coverage

| Город | Роли | Обоснование |
|---|---|---|
| Ла-Пас | CAPITAL + LARGE | Административная столица и крупный высокогорный городской центр. Конституционная столица Боливии — Сукре, поэтому presentation должен ясно объяснять двойную столичную функцию. |
| Санта-Крус-де-ла-Сьерра | LARGE | Крупнейший низменный экономический центр. |
| Кочабамба | MEDIUM | Крупный региональный центр; для Canon внутри этого country set используется MEDIUM относительно Санта-Крус/Ла-Паса. |
| Тариха | SMALL | Меньший региональный центр, выбранный для size coverage. |

### Direct cost observations

Публикационный минимум закрыт прямым наблюдением для каждого города; это не полный семейный бюджет и не интерполированный city score.

| Город | Component | Observation | Basis/date/source |
|---|---|---:|---|
| Ла-Пас | RENT_STANDARD | GBP 272/month | Wise average 1-person rent, 2026; сохранять в observed currency либо конвертировать только на reconciliation-date FX |
| Санта-Крус | RENT_STANDARD | USD 461/month | Wise average rent, 2026 |
| Кочабамба | TRANSPORT | BOB 3/one-way trip | Numbeo city observation, checked 2026-09-06 |
| Тариха | UTILITIES | BOB 251/month | Numbeo observation for 915 sq ft apartment, 2026-06-19 |

Нельзя суммировать разные basis/currencies в единую корзину. Полное target-component coverage остаётся неблокирующим улучшением; обязательное условие «не менее одного прямого component на отображаемый город» выполнено.

### Climate ranges

| Город | Холодный сезон, типичный диапазон | Тёплый сезон, типичный диапазон | Климатический смысл |
|---|---|---|---|
| Ла-Пас | −2–14 °C (июль) | 4–15 °C (типичный самый тёплый день в ноябре) | Высокогорье; Weather Spark/El Alto station model |
| Санта-Крус | 16–25 °C (июль) | 22–30 °C (январь) | Жаркие влажные низменности; возможны surazos |
| Кочабамба | 4–23 °C (июнь/холодная точка) | 12–26 °C (октябрь/тёплая точка) | Сухая долина, большая суточная амплитуда |
| Тариха | 4–21 °C (июль) | 16–24 °C (декабрь) | Умеренная долина, прохладные зимние ночи |

Источник — Weather Spark year-round climate model, сверенный 2026-09-06; поля представляют типичные average daily low/high самых холодных и тёплых периодов, не прогноз. `climate_normal_period` следует записать как `modeled historical climate (Weather Spark; source-period not stated)`, confidence MEDIUM, без ложного обозначения WMO normal.

## J. Schools

### Public schools

Конституция Боливии и Закон №070 закрепляют всеобщий характер образования и бесплатность государственного образования; обязательное школьное образование охватывает начальную и среднюю ступени. Язык обучения преимущественно испанский с многоязычным/межкультурным компонентом. Прямой административный checklist зачисления иностранного ребёнка и обращение с неподтверждёнными документами требуют локальной проверки, но общего nationality exclusion не найдено.

### International / English-medium

Подтверждены как минимум:

- Ла-Пас — American Cooperative School, American curriculum, Early Childhood–Grade 12.
- Санта-Крус-де-ла-Сьерра — Santa Cruz Cooperative School, American education, English instruction.
- Кочабамба — Cochabamba Cooperative School и American International School of Bolivia.

Для Сукре/Тарихи релевантная полноценная English-medium K–12 school не подтверждена. Country-wide directory указывает 7 international schools, но не даёт достаточной первичной полноты по городам.

**Tuition observations.** Для American Cooperative School в официальном fact sheet 2023/24 опубликовано USD 15,040 для KG5–Grade 5 и USD 16,580 для Grades 6–12. Это пригодно как историческое наблюдение по Grade 1 и Grade 12, но устарело для цены 2026/27. Актуальные line-by-line 2026/27 tuition figures публично не найдены; интерполяция запрещена.

## K. Pets

SENASAG/REGENSA требует для каждого ввозимого companion animal официальный экспортный зоосанитарный сертификат страны происхождения, проверяемый в пункте въезда. Для третьих стран действуют отдельные health/vaccination attestations для собак и кошек; разрешение на импорт для обычного passenger pet не подменяет сертификат. Национального blanket breed ban в проверенном актуальном REGENSA не найдено. Карантин фигурирует как contingency при несоответствии/санитарном риске, а не как обязательный режим для любого compliant pet. Итог: `DOG/CAT_IMPORT_AVAILABLE_WITH_CONDITIONS`; breed restriction `NONE_CONFIRMED_NATIONAL`, municipal ownership rules проверяются по месту.

## L. LGBT

| Тема | Research finding |
|---|---|
| Same-sex relations | Законны; уголовного запрета consensual same-sex relations нет. |
| Marriage | Конституционный текст определяет брак/свободный союз через мужчину и женщину; равный гражданский брак национальным законом не установлен. |
| Registered/free union | Reglamento SERECI, утверждённый RA 175/2023, охватывает пары одного или разного пола с одинаковыми требованиями и сроками. |
| Foreign same-sex marriage/union | Автоматическая homologación не утверждается. Подтверждён условный путь: оформить/признать unión libre в Боливии и подать судебное решение по t27. |
| Family immigration | t27 прямо принимает судебное решение о признании unión libre; в сочетании с gender-neutral Reglamento SERECI это закрывает same-sex partner scenario через formalization. |
| Adoption/parenthood | Равный совместный режим для однополой пары не подтверждён; требуется отдельная family-law проверка, если переносить в RP4. |
| Anti-discrimination | Конституция запрещает дискриминацию, включая сексуальную ориентацию и гендерную идентичность; Закон №045 содержит антидискриминационный режим. |
| Practical context | Правовое признание продвинулось через судебные решения, но отсутствие marriage equality и административная неопределённость означают системное неравенство. Отдельные преступления и общая crime statistics не использовались как LGBT safety verdict. |
| Friendly cities | Методологически пригодный национальный сравнительный рейтинг городов не найден; список должен оставаться пустым, а не выдумываться. |

## M. Taxes

- Боливия в основном применяет территориальный/source-based подход: налоговый фокус — доход из боливийского источника; сам факт иностранной выплаты не гарантирует foreign-source treatment, если работа физически выполняется в Боливии.
- Зарплатный режим RC-IVA имеет номинальную ставку 13% после предусмотренных расчётов/кредитов и удержаний; это не означает плоские 13% от любого мирового дохода.
- Наёмные работники платят пенсионные/социальные взносы; PwC на 21 июля 2026 года указывает базовую совокупную employee contribution 12.71% от gross salary плюс solidarity contribution для более высоких зарплат.
- Специального newcomer tax regime для новых резидентов не найдено.
- Действующего DTA Россия—Боливия нет: актуальный перечень PwC для Боливии (21 июля 2026) исчерпывающе называет CAN/Колумбию, Эквадор, Перу, Аргентину, Францию, Германию, Испанию, Швецию и Великобританию; России в перечне нет.
- Налоги остаются информационным блоком и не участвуют в matching/ranking.

## N. Source register

Все ссылки проверены 2026-09-06.

| ID | Тип | Источник | Подтверждает | Confidence |
|---|---|---|---|---|
| BO-S01 | LAW_OR_REGULATION | [Ley Nº 370 de Migración](https://www.lexivox.org/norms/BO-L-N370.html) | Категории пребывания, временная и постоянная резиденция, права мигрантов | HIGH |
| BO-S02 | LAW_OR_REGULATION | [DS Nº 1923 — Reglamento de la Ley de Migración](https://www.lexivox.org/norms/BO-DS-N1923.html) | Визы, work/study/family/health/humanitarian statuses, filing, continuity | HIGH |
| BO-S03 | LAW_OR_REGULATION | [DS Nº 4828](https://www.lexivox.org/norms/BO-DS-N4828.html) | Действующие изменения entry и naturalization procedure | HIGH |
| BO-S04 | LAW_OR_REGULATION | [Constitución Política del Estado](https://www.lexivox.org/norms/BO-CPE-20090207.html) | Натурализация, dual citizenship, equality, marriage wording | HIGH |
| BO-S05 | OFFICIAL_GOVERNMENT_RULE | [Cancillería — Visas](https://consulados.cancilleria.gob.bo/base/visas/) | Visa types, multiple visa, object-specific/student/humanitarian purposes | HIGH |
| BO-S06 | OFFICIAL_GOVERNMENT_RULE | [DIGEMIG — trámites para extranjeros](https://migracion.gob.bo/tramites_ext) | Current official procedures; сайт помечает информацию как обновляемую | MEDIUM |
| BO-S07 | LAW_OR_REGULATION | [Официальный PDF DS Nº1923 на Aduana](https://www.aduana.gob.bo/sites/default/files/NormativaVigente/otros/Decreto%20Supremo%20N%C2%B0%201923%20de%2008-05-2013%20Que%20reglamenta%20la%20Ley%20N%C2%B0%20370%20de%2008-05-2013%20Ley%20de%20migraci%C3%B3n.pdf) | Первичный текст миграционного регламента | HIGH |
| BO-S08 | OFFICIAL_GOVERNMENT_RULE | [МИД РФ — визовые вопросы в Боливии](https://bolivia.mid.ru/ru/consular-services/bolivia/vizovye_voprosy/) | Действующее соглашение о безвизовых поездках | HIGH |
| BO-S09 | LAW_OR_REGULATION | [Текст российско-боливийского соглашения](https://bolivia.mid.ru/upload/iblock/b16/b161f7d511ec24e275207dac21d7f665.pdf) | 90 дней в каждом периоде 180 дней | HIGH |
| BO-S10 | OFFICIAL_GOVERNMENT_RULE | [Консульская guidance — visa requirements](https://consulados.cancilleria.gob.bo/miami/visas/) | Выписка/карта как solvency evidence; object-specific visa evidence | MEDIUM |
| BO-S11 | OFFICIAL_FORM_OR_INSTRUCTION | [Консульский тариф](https://consulados.cancilleria.gob.bo/base/arancel-consular/) | Стоимость консульских виз | MEDIUM |
| BO-S12 | RELIABLE_SECONDARY | [Bolivian Life — 1-year temporary residency](https://www.bolivianlife.com/the-1-year-temporary-residency-visa/) | Практический USD 300/month, bank statement; материал старый | LOW |
| BO-S13 | RELIABLE_SECONDARY | [GoResident — Bolivia residency](https://goresident.com/residency/bolivia) | Повторение practical USD 300/month в 2026; не первичный источник | LOW/MEDIUM |
| BO-S14 | RELIABLE_SECONDARY | [Newland Chase — Bolivia immigration summary](https://newlandchase.com/locations/the-americas/bolivia/) | In-country change; work only after approval | MEDIUM |
| BO-S15 | LAW_OR_REGULATION | [SCP 0577/2022-S2](https://jurisprudencia.tcpbolivia.bo/Fichas/ObtieneResolucion?idFicha=64314) | Однополый свободный союз и недискриминация | HIGH |
| BO-S16 | INTERNATIONAL_OR_RIGHTS_ORGANIZATION | [IACHR Annual Report 2023](https://www.oas.org/en/iachr/docs/annual/2023/chapters/IA2023_Intro_ENG.PDF) | Международное подтверждение признания same-sex unions в Боливии | MEDIUM |
| BO-S17 | OFFICIAL_STATISTICS | [INE — Censo Bolivia 2024](https://cpv2024.ine.gob.bo/) | Население и city/municipal size context | HIGH |
| BO-S18 | RELIABLE_SECONDARY | [Numbeo — Bolivia](https://www.numbeo.com/cost-of-living/country_result.jsp?country=Bolivia) | Текущие crowdsourced city costs; требует фиксации exact observations | MEDIUM для cost observation |
| BO-S19 | OFFICIAL_GOVERNMENT_RULE | [American Cooperative School — State Department fact sheet](https://2021-2025.state.gov/american-cooperative-school-fact-sheet/) | Программа, grades, tuition 2023/24 | HIGH для даты 2023/24 |
| BO-S20 | OFFICIAL_SCHOOL | [American Cooperative School La Paz](https://acslp.org/) | International school in La Paz, EC–Grade 12 | HIGH |
| BO-S21 | OFFICIAL_SCHOOL | [Santa Cruz Cooperative School](https://sccs.edu.bo/) | American/English-medium school in Santa Cruz | HIGH |
| BO-S22 | OFFICIAL_SCHOOL | [Cochabamba Cooperative School](https://ccs.edu.bo/) | English/American school in Cochabamba | HIGH |
| BO-S23 | RELIABLE_SECONDARY | [PwC Worldwide Tax Summaries — other taxes](https://taxsummaries.pwc.com/bolivia/individual/other-taxes) | Employee social contributions as of 2026-07-21 | HIGH/MEDIUM |
| BO-S24 | OFFICIAL_GOVERNMENT_RULE | [SEGIP — Cédula de Identidad de Extranjeros](https://www.segip.gob.bo/cedulas-de-identidad-de-extranjeros/) | Foreign ID after temporary/permanent residence | HIGH |
| BO-S25 | INTERNATIONAL_OR_RIGHTS_ORGANIZATION | [CEPAL-hosted Ley Nº370 PDF](https://oig.cepal.org/sites/default/files/2013_ley370_bol.pdf) | Independent copy of the migration law, including PR family extension | HIGH |
| BO-S26 | OFFICIAL_GOVERNMENT_DATA | [DIGEMIG API — Russia-specific procedures](https://migracion.gob.bo:3004/api/tramites_ext/pais/rus) | 33 актуальные процедуры, requirements, fees, filing places и 24-hour SLA | HIGH |
| BO-S27 | OFFICIAL_GOVERNMENT_RULE | [TSE/SERECI RA 175/2023](https://web.oep.org.bo/wp-content/uploads/2023/07/RESOLUCION-ADM-175-22-06-2023.pdf) | Регистрация unión libre для пар одного/разного пола | HIGH |
| BO-S28 | OFFICIAL_GOVERNMENT_NOTICE | [TSE — same-sex free-union regulation](https://web.oep.org.bo/institucional-institucional/el-tse-modifica-reglamento-de-uniones-libres-para-que-parejas-del-mismo-sexo-legalicen-su-union/) | Одинаковые требования и сроки; административное применение | HIGH |
| BO-S29 | OFFICIAL_GOVERNMENT_RULE | [SENASAG — import permits / companion animals](https://www.senasag.gob.bo/index.php/tramites-y-servicios/convocatorias/regensa-en-linea/494-capitulo-7-1-emision-de-permisos-zoosanitarios-de-importacion) | Individual official export-health certificate checked at entry | HIGH |
| BO-S30 | OFFICIAL_GOVERNMENT_RULE | [SENASAG — third-country dog/cat requirements](https://www.senasag.gob.bo/index.php/institucional/unidades-nacionales/administracion/area-nacional-de-recursos-humano/category/5349-sanidad-animal?download=2278%3Arequisitos-sanitarios-para-importar-animales-de-compania-terceros-paises) | Health/vaccination attestations and sanitary contingencies | HIGH |
| BO-S31 | RELIABLE_SECONDARY | [Weather Spark — Bolivia cities](https://weatherspark.com/countries/BO) | Modeled year-round temperature ranges | MEDIUM |
| BO-S32 | RELIABLE_SECONDARY | [Wise — La Paz cost](https://wise.com/gb/cost-of-living/bolivia/la-paz) | 2026 average rent observation | MEDIUM |
| BO-S33 | RELIABLE_SECONDARY | [Wise — Santa Cruz cost](https://wise.com/au/cost-of-living/bolivia/santa-cruz) | 2026 average rent observation | MEDIUM |
| BO-S34 | RELIABLE_SECONDARY | [Numbeo — Cochabamba](https://www.numbeo.com/cost-of-living/in/Cochabamba) | Direct local transport observation | MEDIUM |
| BO-S35 | RELIABLE_SECONDARY | [Numbeo — Tarija comparison observation](https://www.numbeo.com/cost-of-living/) | Direct utilities observation dated 2026-06-19 | MEDIUM |
| BO-S36 | RELIABLE_SECONDARY | [PwC — Bolivia tax treaties](https://taxsummaries.pwc.com/bolivia/corporate/withholding-taxes) | In-force DTA list; Russia absent, updated 2026-07-21 | HIGH/MEDIUM |
| BO-S37 | LAW_OR_REGULATION | [Ley Nº251 — protección a personas refugiadas](https://www.lexivox.org/norms/BO-L-N251.html) | Eligibility, non-refoulement, family unity, temporary documents, work rights and indefinite status | HIGH |

## O. Open items

Открытых исследовательских пунктов нет.

- По удалённой работе выполнен завершённый отрицательный поиск: отдельный иностранный remote-work режим не подтверждён, поэтому категория получает `NO_ROUTE`, а не открытый пробел.
- Для всех четырёх городов получен единый сопоставимый `RENT_STANDARD`. Климатические данные сохраняют `MEDIUM` confidence и прямо указывают, что источник не публикует WMO normal period; это предел доказательности найденного источника, а не незавершённый поиск.

## P. Contract gaps

### BO-CG-01 — Одна национальная work category закрывает local employment и self-employment

Подтверждённый факт: BO_WORK_TEMPORARY юридически охватывает работу с трудовыми отношениями и без них/самостоятельную доходную деятельность. Canon позволяет одному route закрывать несколько категорий через `covers_categories`, поэтому schema gap, вероятно, отсутствует. Но reconciliation должна предотвратить дублирование одного национального разрешения двумя route cards и определить requirements alternatives для employee/self-employed basis.

### BO-CG-02 — Две столицы

Подтверждённый факт: Сукре — конституционная столица и место судебной власти; Ла-Пас — seat of government/administrative capital. Current city role допускает `CAPITAL` как дополнительный признак, но product copy может ожидать одну столицу. Reconciliation должна решить data representation без country-specific UI logic: либо обеим дать CAPITAL с поясняющими ролями, либо зафиксировать generic distinction `constitutional capital`/`seat of government`, если schema это позволяет.

## Q. Research completeness verdict

| Обязательный блок | Статус |
|---|---|
| ROUTES | COMPLETE |
| ROUTE_COVERAGE | COMPLETE |
| FINANCE | COMPLETE — NO_FIXED_THRESHOLD where applicable |
| FAMILY | COMPLETE |
| ENTRY_APPLICATION | COMPLETE |
| WORK_RIGHTS | COMPLETE with conservative separate-work-basis outcome |
| PROCESSING_LONG_TERM | COMPLETE |
| CITIES_COST | COMPLETE at publication minimum; richer basket non-blocking |
| CLIMATE | COMPLETE at MEDIUM modeled evidence |
| SCHOOLS | COMPLETE |
| PETS | COMPLETE |
| LGBT | COMPLETE |
| TAXES | COMPLETE |
| SOURCES_OPEN_ITEMS | COMPLETE |

# READY FOR RECONCILIATION

Все обязательные исследовательские блоки закрыты, country-level blocking gaps отсутствуют, у каждого отображаемого города есть прямой cost component, а family/LGBT domain имеет явные outcomes. Следующий разрешённый этап — **Research → Canon reconciliation**. Этот отчёт намеренно не создаёт RP4, не меняет репозиторий и не смешивает исследовательские выводы с финальным product mapping.


## R. Финальный аудит полноты — 2026-09-07

Повторный аудит после технической интеграции выявил и закрыл все ранее скрытые пробелы.

- **Study:** учебная резиденция не ведёт к permanent residence, но статья 20 DS Nº1923 допускает общую натурализацию после более чем трёх лет непрерывной временной резиденции. Поэтому период учёбы засчитывается для citizenship path при сохранении непрерывного законного статуса.
- **Family:** обычная семейная временная резиденция засчитывается к общему трёхлетнему пути permanent residence и натурализации. Двухлетняя натурализация относится только к прямо указанной связи с гражданином Боливии.
- **Health/humanitarian:** медицинская резиденция после двух лет и исключительная гуманитарная резиденция не образуют непрерывного проживания; самостоятельного PR/citizenship path на этих основаниях нет.
- **Agreement/religious work:** это рабочая временная резиденция; применяется общий трёхлетний PR/citizenship path.
- **Short business/transitory:** краткосрочный статус до 180 дней сам по себе не ведёт к PR или citizenship.
- **Schools:** RM Nº0001/2026 подтверждает начало первого класса с шести лет, зачисление иностранцев независимо от миграционного статуса, допустимость иностранных документов и процедуру при их отсутствии. Начальная и средняя ступени длятся по шесть лет; обязательный школьный диапазон отражён как 6–17.
- **Cities:** все четыре города теперь имеют единый сопоставимый RENT_STANDARD — однокомнатная квартира вне центра в BOB: Ла-Пас 2 000; Санта-Крус 2 169,36; Кочабамба 1 200; Тариха 1 800.
- **LGBT:** учтён первый однополый брак августа 2026 года как индивидуальный судебный outcome, а не общенациональное marriage equality; практическая оценка подкреплена отдельным источником о дискриминации.
- **Remote work:** завершённый отрицательный поиск остаётся NO_ROUTE, а не open gap: действующая work residence требует remunerated/lucrative activity in Bolivia и не подтверждает отдельный foreign-remote режим.
- **Climate:** поиск завершён с MEDIUM modeled evidence и прозрачной оговоркой об отсутствии заявленного WMO normal period; это ограничение доказательности, а не незавершённый research item.

**Финальный verdict:** все обязательные блоки Canon исследованы; NOT_RESEARCHED в активном и скрытом route inventory отсутствует; blocking и non-blocking research gaps отсутствуют.
