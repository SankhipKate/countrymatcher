# Ирландия (IE) — первичное исследование Country Matcher

Дата исследования и последней targeted correction: 2026-09-06

## Итог

Ирландия не имеет digital-nomad или нового пассивного investor route. Для граждан РФ основные доступные пути — квалифицированная и общая местная работа, Hosting Agreement исследователя, учёба, Stamp 0 для финансово независимого лица и международная защита. STEP существует, но Immigration Service Delivery прямо указывает, что новые заявления от граждан России и Беларуси не принимаются. Для граждан РФ требуется ирландская виза. Семейные правила существенно зависят от категории спонсора.

Статус research completeness: **READY**. Все 14 completeness-блоков имеют статус COMPLETE; открытых исследовательских пунктов нет. Family Coverage Completeness migration 2026-09-06 закрыта: IE напрямую покрывает все три relationship inputs и каждый questionnaire child age 0–25. Статус integration/release: **READY FOR FINAL RELEASE VERIFICATION**.

Структурированных основных маршрутов, доступных гражданину РФ: 8. Публикуемых: 6. Непубликуемых по product publication boundary: 2. STEP отражён только в route coverage как `UNAVAILABLE_TO_RU`.

## Route coverage

- **DIGITAL_NOMAD_REMOTE_WORK: NO_ROUTE.** Отдельного режима цифрового кочевника или удалённой работы не найдено.
- **INCOME_FINANCIALLY_INDEPENDENT: ROUTE_EXISTS.** Stamp 0 охватывает финансово независимых лиц.
- **RETIREMENT: ROUTE_EXISTS.** Тот же Stamp 0 используется для переезда на пенсии.
- **LOCAL_EMPLOYMENT: ROUTE_EXISTS.** Доступны CSEP и GEP.
- **HIGHLY_QUALIFIED_SPECIALIST: ROUTE_EXISTS.** Доступны CSEP и Hosting Agreement исследователя.
- **INTRA_COMPANY_TRANSFER: ROUTE_EXISTS.** Доступен специализированный ICT permit; скрыт product boundary.
- **ENTREPRENEURSHIP_SELF_EMPLOYMENT: UNAVAILABLE_TO_RU.** STEP существует, но новые заявления граждан РФ сейчас не принимаются; отдельного общего маршрута самозанятости для граждан РФ не найдено.
- **INVESTMENT: NO_ROUTE.** IIP закрыта для новых заявлений с 15 февраля 2023 года.
- **STUDY: ROUTE_EXISTS.** Доступно учебное разрешение Stamp 2.
- **FAMILY: ROUTE_EXISTS.** Семейные процедуры существуют, но самостоятельная route-card скрыта product boundary.
- **GENERAL_RESIDENCE: NO_ROUTE.** Stamp 4, Long Term Residency и Stamp 5 являются последующими стадиями, а не общим первоначальным маршрутом.
- **INTERNATIONAL_PROTECTION: ROUTE_EXISTS.** Доступна международная защита.
- **OTHER: ROUTE_EXISTS.** В OTHER структурирован Hosting Agreement исследователя. Остальные специальные permit/permission types перечислены ниже в полном statutory inventory с явным disposition; незакрытого остаточного open item нет.

## Ключевые маршруты

### Stamp 0 для финансово независимого лица или пенсионера

- Official term: Person of independent means / retire to Ireland — Stamp 0
- Publishable: true
- Основание: Предварительное индивидуальное разрешение на проживание для полностью финансово самостоятельного лица без права работы.
- Первый статус и путь: Ежегодно возобновляемый Stamp 0. Обычная натурализация требует 1825/1826 дней засчитываемого проживания: непрерывный последний год и ещё четыре года в предшествующие восемь лет.

### Разрешение на работу для критически важных квалификаций

- Official term: Critical Skills Employment Permit
- Publishable: true
- Основание: Двухлетняя оферта ирландского работодателя по квалифицирующей профессии и оплате.
- Первый статус и путь: Stamp 1 обычно на 12 месяцев; после 21 месяца квалифицирующей занятости возможен Stamp 4. Обычная натурализация требует 1825/1826 дней засчитываемого проживания: непрерывный последний год и ещё четыре года в предшествующие восемь лет.

### Общее разрешение на работу

- Official term: General Employment Permit
- Publishable: true
- Основание: Оферта ирландского работодателя по профессии вне списка исключённых, обычно после проверки рынка труда.
- Первый статус и путь: Stamp 1 обычно на 12 месяцев; после 57 месяцев квалифицирующей занятости возможен Stamp 4. Обычная натурализация требует 1825/1826 дней засчитываемого проживания: непрерывный последний год и ещё четыре года в предшествующие восемь лет.

### Внутрикорпоративный перевод

- Official term: Intra-Company Transfer Employment Permit
- Publishable: false
- Основание: Временный перевод руководителя, ключевого специалиста или стажёра между связанными иностранной и ирландской компаниями.
- Первый статус и путь: Stamp 1, привязанный к временному корпоративному переводу. Обычная натурализация требует 1825/1826 дней засчитываемого проживания: непрерывный последний год и ещё четыре года в предшествующие восемь лет.

### Start-up Entrepreneur Programme (STEP)

STEP существует как национальная программа, но в `routes[]` не включается: официальный ISD источник прямо говорит, что новые заявления от граждан России и Беларуси не принимаются. По Canon 4.0 юридически недоступный гражданину РФ маршрут отражается как `UNAVAILABLE_TO_RU` в route coverage, а не как publishable route.

### Учебное разрешение

- Official term: Student permission — Stamp 2
- Publishable: true
- Основание: Зачисление на подходящую очную программу в Ирландии с финансовым обеспечением.
- Первый статус и путь: Stamp 2 на срок учебной программы; после выпуска возможен ограниченный Stamp 1G. Обычная натурализация требует 1825/1826 дней засчитываемого проживания: непрерывный последний год и ещё четыре года в предшествующие восемь лет.

### Разрешение исследователя по Hosting Agreement

- Official term: Scientific researcher under Hosting Agreement
- Publishable: true
- Основание: Исследовательское основание через аккредитованную организацию и Hosting Agreement.
- Первый статус и путь: Stamp 1; после 21 месяца квалифицирующей работы возможен Stamp 4. Обычная натурализация требует 1825/1826 дней засчитываемого проживания: непрерывный последний год и ещё четыре года в предшествующие восемь лет.

### Присоединение к законно проживающему спонсору

- Official term: Join non-EEA family member
- Publishable: false
- Основание: Самостоятельная семейная процедура для супруга, civil partner, de facto partner, несовершеннолетнего ребёнка и подтверждённого dependent adult child спонсора в применимых категориях.
- Первый статус и путь: Семейный Stamp 1G/3/4 зависит от статуса спонсора. Обычная натурализация требует 1825/1826 дней засчитываемого проживания: непрерывный последний год и ещё четыре года в предшествующие восемь лет.

### Международная защита

- Official term: International protection
- Publishable: true
- Основание: Индивидуальное заявление о статусе беженца или дополнительной защите при доказанном риске.
- Первый статус и путь: Временное право оставаться на период рассмотрения; после положительного решения — статус беженца либо дополнительная защита. Обычная натурализация требует 1825/1826 дней засчитываемого проживания: непрерывный последний год и ещё четыре года в предшествующие восемь лет.

## Закрытые вопросы completion pass

- Stamp 0: независимый держатель не является допустимым спонсором по общей Non-EEA Family Reunification Policy; сценарий семьи зафиксирован как NOT_AVAILABLE, а маршрут снят с research hold.
- International protection: данные переведены на International Protection Act 2026; зафиксированы трудовой доступ после шести месяцев без решения первой инстанции, TARA и двухлетнее ожидание семейного воссоединения после предоставления защиты.
- OTHER inventory: официальный перечень девяти employment permits и дополнительные узкие permissions проверены и раскрыты в отдельном разделе этого отчёта. Узкие family/corporate/supporting и последующие основания не создают самостоятельные пользовательские карточки согласно product publication boundary; Internship, Sport and Cultural, Exchange Agreement, volunteer, Minister of Religion, visiting academic, nurse adaptation и locum doctor переданы в reconciliation как явные inventory dispositions, а не скрытый неизвестный остаток.
- Семейные финансы: официальные таблицы, категории спонсоров, периоды и правило дохода одного спонсора сохранены ниже полностью. Их возможная автоматизация остаётся отдельным product/contract вопросом и не является research gap.
- Study finance: собственные сбережения не являются исчерпывающим способом доказать средства. Официальные материалы допускают sponsor, government и scholarship funding; поэтому отсутствие 10 000 € собственных savings не может автоматически давать `UNSUITABLE`.
- Международные школы: Canon требует подтверждённые города и не требует доказывать отсутствие школы в каждом малом населённом пункте. Подтверждены Дублин, Грейстонс и Лимерик.
- Family Coverage Completeness 2026-09-06: официальный Age of Majority Act подтверждает совершеннолетие с 18 лет; Category B (CSEP/ICT/Hosting Agreement researcher) допускает dependent adult child после двух лет, Category C (GEP) — после пяти лет, при отдельной специальной зависимости, Stamp 0 и более строгом financial test; international protection имеет отдельный adult-dependent-child path после двух лет. Ordinary Study и independent Stamp 0 имеют явный `NOT_AVAILABLE` outcome для child domain, поэтому отсутствие family scenario больше не используется как отрицательный вывод.

## Въезд, города и практические блоки

## Полный statutory inventory работы и специальных permissions

### Девять employment permits

| Permit | Disposition в исследовании | Publication |
|---|---|---|
| Critical Skills Employment Permit | отдельный `IE_CSEP` | publishable |
| General Employment Permit | отдельный `IE_GEP` | publishable |
| Intra-Company Transfer Employment Permit | отдельный `IE_ICT` | false: corporate publication boundary |
| Dependant/Partner/Spouse Employment Permit | supporting family/employment stage, покрыт `IE_FAMILY_NON_EEA` и family scenarios | false: standalone family/supporting boundary |
| Contract for Services Employment Permit | service-posting иностранного подрядчика к ирландскому заказчику; corporate analogue ICT | false: corporate/service-posting boundary |
| Reactivation Employment Permit | восстановление уже существовавшего permit/status после выпадения из системы | false: second-stage remedial route |
| Internship Employment Permit | временная стажировка иностранного full-time student по Critical Skills discipline | inventory-only candidate для reconciliation; не смешивать с обычным Study |
| Sport and Cultural Employment Permit | специальная работа в sporting/cultural activity | inventory-only candidate для reconciliation |
| Exchange Agreement Employment Permit | employment по prescribed reciprocal/international agreement; применимость зависит от конкретного agreement | inventory-only candidate для reconciliation, не считать доступным автоматически |

### Другие permissions

| Permission | Disposition |
|---|---|
| Scientific researcher / Hosting Agreement | отдельный `IE_RESEARCHER`, publishable |
| Start-up Entrepreneur Programme | `UNAVAILABLE_TO_RU`; в `routes[]` не включается |
| Visiting academic | временное основание до 12 месяцев при иностранном финансировании; OTHER inventory |
| Volunteer | eligible organisation, обычно 12 месяцев с пределом 24 и возможным третьим годом; paid work и family sponsorship отсутствуют; OTHER inventory |
| Minister of Religion | специальное sponsor-based основание до 3 лет с возможным продлением; family предусмотрена; OTHER inventory |
| Nurse Clinical Adaptation and Assessment | профессиональная переходная permission; employment/OTHER inventory |
| Locum hospital doctor | профессиональная временная permission; employment/OTHER inventory |
| Atypical Working Scheme | преимущественно краткосрочная work permission и не общий long-term residence route |

Этот inventory не утверждает автоматическую product publication для узких оснований. Он устраняет скрытый research gap и передаёт mixed cases на reconciliation, как требует Canon.

## Семейные финансовые правила 2026

- Учитывается доход только одного спонсора; доход партнёра или другого родственника не суммируется с ним.
- Sponsor не должен в основном зависеть от Irish State supports непрерывно два года или дольше непосредственно перед подачей.
- Category A: не менее 75 000 € cumulative gross income за три предшествующих года с ожиданием сохранения уровня.
- Category B: отдельного общего числового порога для nuclear family нет; qualifying status уже предполагает финансовый уровень. Сюда входят CSEP, ICT, full-time non-locum doctors, Hosting Agreement researchers, STEP для тех национальностей, которым программа доступна, IIP legacy, approved scholarship students, PhD students и Ministers of Religion.
- Category C: более 30 000 € gross income в предыдущем году с ожиданием сохранения уровня. GEP и Reactivation holders входят в Category C.
- Category C может подать на nuclear family после одного года; Category B — одновременно или без ожидания после въезда.

### Category C — несовершеннолетние дети

| Детей | Minimum annual net 2026 | Indicative gross 2026 |
|---:|---:|---:|
| 1 | 39 780 € | 50 200 € |
| 2 | 45 032 € | 60 200 € |
| 3 | 50 284 € | 70 100 € |
| 4 | 55 016 € | 80 000 € |
| 5 | 61 568 € | 93 700 € |
| 6 | 67 600 € | 106 300 € |
| 7 | 74 672 € | 121 100 € |
| 8+ | 79 664 € | 131 600 € |

### Зависимые взрослые родственники и совершеннолетние дети

Возраст совершеннолетия в Ирландии — 18 лет. Для family mapping взрослый ребёнок не считается продолжением обычной minor-child категории: требуется отдельное подтверждённое основание зависимости. В Non-EEA policy serious medical/psychological dependency ведёт к dependent-adult path; Category B допускает такой путь после двух лет sponsorship, Category C — после пяти. Первичное разрешение оформляется как Stamp 0 из-за пределов Ирландии и применяется повышенный financial test. Для adult-dependent-relatives policy gross income одного спонсора должен превышать соответствующую сумму в каждом из трёх предыдущих лет: 96 929 € для одного взрослого, 130 985 € для двух, 165 042 € для трёх. Adult scenarios в RP4 имеют open upper bound; 25 — лишь верхняя граница анкеты, а не юридический предел.

## International Protection Act 2026 — контрольные факты

- новый режим применяется к заявлениям с 12 июня 2026 года;
- заявления подаются лично в Ирландии или при обращении на границе;
- допустимость, previous applications, safe-country concepts, Dublin responsibility, accelerated и border procedures проверяются по Act 2026 и применимым актам ЕС с индивидуальной оценкой предусмотренных исключений;
- заявитель вправе оставаться до завершения процедуры и доступного обжалования;
- Labour Market Access Permission охватывает employment и self-employment, доступно после шести месяцев без first-instance decision при отсутствии задержки по вине заявителя, действует 12 месяцев и продлевается до final decision;
- TARA рассматривает appeals по заявлениям с 12 июня 2026 года, IPAT сохраняет дела по заявлениям до этой даты;
- после положительного решения предоставляется refugee status или subsidiary protection;
- family reunification имеет двухлетний waiting period, financial self-support test и специальные waiver rules для применимого unaccompanied minor; adult child может иметь отдельный path при long-term dependency либо mental/physical disability.

## Налоги — уточнённая source matrix

- tax residence: 183 дня за один год либо 280 дней за текущий и предыдущий годы; год с 30 днями или менее не создаёт residence по combined test;
- ordinary residence возникает с начала четвёртого года после трёх последовательных resident years и обычно сохраняется три года после выезда;
- resident and domiciled person обычно облагается с worldwide income;
- resident non-domiciled person может применять remittance basis к соответствующему foreign income;
- employment duties, физически выполняемые в Ирландии, облагаются в Ирландии через PAYE даже при оплате иностранной компанией; применяются Income Tax, PRSI и USC;
- USC 2026: 0,5% на первые 12 012 €, 2% на следующие 16 688 €, 3% на следующие 41 344 €, 8% на остаток, с отдельными exemption/reduced-rate rules;
- Ирландия публикует DTA с Россией, но Указ Президента РФ №585 от 08.08.2023 приостановил перечисленные материальные положения со стороны России. Итог зависит от вида дохода, сохранившихся статей и доступного Irish credit; общего обещания устранения двойного налога нет.

## Черногорское партнёрство

Здесь нужно различать общее признание иностранного civil partnership в ирландском праве и специальную иммиграционную политику для Non-EEA family reunification. Действующая с 12 июня 2026 года Family Reunification Policy в §7.10 прямо устанавливает: overseas civil partnership, заключённое в соответствии с правом юрисдикции, где такие партнёрства признаются, для этой политики рассматривается как эквивалент брака. Поэтому один лишь post-2016 cut-off нельзя использовать как основание автоматически переводить зарегистрированное партнёрство в de facto path по Non-EEA family routes. Для незарегистрированного союза §7.12–7.13 требуют genuine/durable relationship и не менее двух лет совместного проживания.

## Практический ввоз домашних животных

Для собаки, кошки или хорька из третьей страны рабочая последовательность такова: сначала идентифицирующий микрочип, затем действующая вакцинация против бешенства; после первичной вакцинации — ожидание не менее 21 дня. Нужны применимый ветеринарный сертификат и сопроводительные документы, предварительное уведомление и прибытие через разрешённый travellers’ point of entry для проверки.

Если страна происхождения не входит в установленный список, дополнительно требуется тест титра антител к бешенству: забор крови не ранее чем через 30 дней после вакцинации и не менее чем за три месяца до перемещения. Для собак требуется обработка против `Echinococcus multilocularis` в предусмотренное правилами окно до прибытия, если не действует исключение. Отдельно действует запрет ввоза XL Bully с 1 октября 2024 года; после въезда применяются лицензирование и правила restricted breeds.

## Школы и климат — operational notes

- Обязательное образование охватывает возраст 6–16 лет. Государственно финансируемые начальные и средние школы не взимают обычную tuition, но семья может нести расходы на форму, книги, транспорт и мероприятия; конкретное место зависит от admissions policy и доступности школы.
- Международные школы подтверждены в Дублине, Грейстонсе и Лимерике; отсутствие записи по Корку или Килкенни не интерпретируется как юридическое отсутствие любых международных программ.
- Климат Дублина привязан к станции Dublin Airport, Корка — к Cork Airport. Для Килкенни используется явно маркированный региональный proxy ближайшей внутренней станции юго-востока. Все диапазоны — нормы 1991–2020, а не прогноз и не исторические экстремумы.

Гражданину РФ требуется ирландская виза до поездки; заявления из России принимает визовый офис Ирландии в Москве. Ирландия не входит в Шенгенскую зону.

Города для сравнения: Дублин, Корк, Килкенни. Для каждого сохранены аренда, коммунальные услуги, продукты, транспорт и климат.

Международные школы подтверждены в: Дублин, Грейстонс, Лимерик.

Ввоз XL Bully в Ирландию запрещён с 1 октября 2024 года; стандартные ветеринарные процедуры для остальных собак и кошек не считаются product restriction.

Однополый брак и широкая антидискриминационная защита признаны национальным правом; практическая среда в целом открыта, при сохранении отдельных проблем.

Лицо обычно считается налоговым резидентом при 183 днях в одном налоговом году либо 280 днях суммарно в текущем и предыдущем годах; год с 30 днями или менее не используется для создания резидентства по 280-day test.

## Итоговая оценка

Исследование и targeted Family Coverage Completeness migration доведены до country-ready состояния по Canon 4.0. IE RP4 разрешает весь questionnaire family domain 0–25 и напрямую покрывает `MARRIED`, `REGISTERED_PARTNERSHIP`, `UNREGISTERED_PARTNERSHIP`; взрослые дети представлены отдельными source-backed legal paths, а не механическим расширением minor-child диапазона. Country-specific schema/engine/questionnaire changes не потребовались. Следующий шаг — только финальный repository-wide release verification кандидата 18.0.0.
