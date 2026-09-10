# NL — Research → Canon reconciliation

**Дата:** 2026-09-05
**Объект:** NL Research Package 4.0
**Фактически использованный repository snapshot:** `CountryMatcher-main-16.0.1`, marker `7ba9e1905b60f13cb47cdd58f3f8315f6b72929e`, `countrymatcher/VERSION = 16.0.1`.
**Обновление проверки:** 2026-09-04 пакет повторно проверен по schema, validator и активным финансовым возможностям движка из предоставленного main 16.0.1. После внешней критики исправлены подтверждённые NL-дефекты и повторены все проверки.

## Итог

**Статус: PASS**

Проверено 44 доступных гражданам РФ маршрута: 10 публикуемых и 34 скрытых. JSON syntax, официальный schema validator и integrity validator проходят. Все исправимые NL-дефекты закрыты; generic architecture не изменялась.

## Дефекты и решения

| Причина | Точное место | Влияние | Решение | Нужен пользователь |
|---|---|---|---|---|
| mapping | `route_coverage[OTHER].explanation_ru` | Утверждалось наличие open item при `open_items=[]` | Исправлен текст, данные не менялись | Нет |
| presentation | `NL_SELF_INCOME.condition_ru` | Доход self-employed ошибочно назывался зарплатой по трудовому договору | Исправлено на валовой доход от самостоятельной деятельности | Нет |
| mapping | `NL_HSM_SALARY` | Ранее был структурирован только €5 942 | Сохранены все три суммы: €3 122, €4 357 и €5 942; будущая зарплата остаётся не спрашиваемым условием | Нет |
| mapping | `NL_BLUE_SALARY` | Ранее отсутствовал reduced criterion €4 754 | Сохранены обе суммы: €4 754 и €5 942 | Нет |
| mapping | `NL_VOCATIONAL_STUDY` | Самостоятельный учебный маршрут был скрыт | Установлено `publishable=true`; paid-employment-only оставлен скрытым как набор специальных ситуаций | Нет |
| research/mapping | программа рабочего отпуска | Недоступный гражданину РФ маршрут находился в `routes[]` | Удалён из `routes[]`; факт недоступности сохранён в coverage OTHER | Нет |
| mapping | family scenarios публикуемых routes | Партнёр и ребёнок ссылались на один partner route | Разделены и связаны с `NL_FAMILY_PARTNER` и `NL_FAMILY_MINOR_CHILD` | Нет |
| research/mapping | `entry_for_russian_citizen` | Формулировка создавала впечатление доступности обычной туристической подачи в России | Добавлен закрытый перечень допустимых целей и указано, что обычная туристическая подача в России недоступна | Нет |
| mapping | `pending_changes` | Не было назначенного на 01.10.2026 прекращения признания российских небиометрических паспортов | Добавлено `NL_RU_NONBIOMETRIC_PASSPORT_2026`; консульский review перенесён на 20.09.2026 | Нет |
| research/mapping | application methods всех 44 маршрутов | Подача дела в IND ошибочно смешивалась с последующим получением MVV в Москве | Разделены страна гражданства, страна непрерывного проживания, условная подача в Нидерландах и дополнительный online/sponsor channel; Москва сохранена только как возможный этап получения MVV по письму IND, а не универсальное место подачи | Нет |
| presentation | `NL_STARTUP_FUNDS`, `NL_SELF_INCOME`, `NL_RESEARCHER_FUNDS` | Полугодовые суммы выглядели годовыми; суммы с отпускными и без отпускных можно было принять за разные нормы | Указан период 01.07–31.12.2026 и способ представления каждой суммы; review перенесён на 15.12.2026 | Нет |
| presentation | русские пользовательские поля | Обнаружены гибридные слова, непереведённые фразы и грамматические ошибки | Выполнена повторная очистка; официальные аббревиатуры и собственные названия сохранены | Нет |
| mapping/engine | family scenarios, дети 18+ | Движок 16.0.1 исключал все публикуемые маршруты как `DATA_CONTRACT_PROBLEM` | Для всех 44 маршрутов добавлена явная ветка 18+: редкая отдельная оценка по статье 8 ЕКПЧ либо запрет сопровождения, если семья по маршруту не допускается | Нет |
| presentation | city rent components | Оговорка о Гронингене была скопирована в остальные города; дата проверки выдавалась за период данных | Оговорка оставлена только у Гронингена; `price_date` аренды установлен на 30.06.2026 как конец II квартала | Нет |

## Разбор пунктов критики, которые не привели к изменению данных

| Пункт | Решение | Обоснование |
|---|---|---|
| Натурализация 5 → 10 лет в `pending_changes` | Не добавлять как pending change | Действующее правило остаётся пять лет. Официальный материал подтверждает законопроект после консультации, но не принятый закон и не назначенную дату вступления. Schema допускает только `ADOPTED_NOT_IN_FORCE` и `OFFICIALLY_SCHEDULED`. Риск добавлен в `citizenship_path_ru`, источник и review. |
| Гронинген `SMALL`, Эйндховен `MEDIUM` | Роли сохранить | Canon требует структурные сравнительные роли, а не единый числовой порог. Пояснение изменено так, чтобы не выдавать роли за официальную нидерландскую классификацию. |
| Неполная городская корзина | Не добавлять неподтверждённые суммы | Последнее прямое решение пользователя требует не добавлять неподтверждённые groceries/transport/utilities. Аренда и отдельно подтверждённая энергия сохранены; выдуманные значения не добавлялись. |
| `NL_ASYLUM.publishable=true` | Сохранить | Международная защита — самостоятельное широкое основание. Текущая product publication boundary скрывает узкие гуманитарные процедуры, но не устанавливает общего запрета публикации asylum для всех стран. ZA не является нормой для NL. |
| `linked_route_id` ведёт на скрытый family route | Сохранить | Движок 16.0.1 проверяет ссылку по полному `routes[]`, а не только по публикуемым маршрутам. Runtime-тест подтвердил отсутствие `DATA_CONTRACT_PROBLEM` и сохранение всех 10 публикуемых NL routes. |
| 54 источника без `published_or_updated_at` | Не считать дефектом | Поле допускает `null`; обязательна дата проверки `checked_at`. Дату публикации нельзя изобретать для страниц, где источник её не сообщает. |

## Обязательная reconciliation-матрица существенных требований

| Research fact | Questionnaire knowledge | Canon semantics | RP4 representation | Проверка | Решение |
|---|---|---|---|---|---|
| Нужен трудовой договор с работодателем, имеющим статус признанного спонсора IND в Нидерландах. | не собирается; самостоятельное основание | condition, не автоматический FAIL | `NL_HSM_JOB`; `UNASKED_CONDITION`; `BECOMES_CONDITION`; separate_basis=True | PASS | Сохранить |
| Будущая валовая зарплата без отпускных должна соответствовать применимой категории: 3 122 € по пониженному критерию, 4 357 € для заявителя младше 30 лет или 5 942 € по стандартному критерию от 30 лет. | не собирается; самостоятельное основание | condition, не автоматический FAIL | `NL_HSM_SALARY`; `UNASKED_CONDITION`; `BECOMES_CONDITION`; separate_basis=True | PASS | Сохранить |
| Нужна высококвалифицированная работа и контракт минимум на шесть месяцев. | не собирается; самостоятельное основание | condition, не автоматический FAIL | `NL_BLUE_JOB`; `UNASKED_CONDITION`; `BECOMES_CONDITION`; separate_basis=True | PASS | Сохранить |
| Требуется подходящее высшее образование не менее трёх лет либо допустимый профессиональный опыт. | не собирается; проверяется при подаче | не меняет статус | `NL_BLUE_QUAL`; `DISPLAY_ONLY`; `NONE`; separate_basis=False | PASS | Сохранить |
| Будущая валовая зарплата без отпускных должна быть не ниже 4 754 € по пониженному критерию недавнего выпускника либо 5 942 € по стандартному критерию Голубой карты ЕС. | не собирается; самостоятельное основание | condition, не автоматический FAIL | `NL_BLUE_SALARY`; `UNASKED_CONDITION`; `BECOMES_CONDITION`; separate_basis=True | PASS | Сохранить |
| Нужен нидерландский работодатель и работа, для которой пройдена применимая проверка рынка труда UWV. | не собирается; самостоятельное основание | condition, не автоматический FAIL | `NL_GVVA_JOB`; `UNASKED_CONDITION`; `BECOMES_CONDITION`; separate_basis=True | PASS | Сохранить |
| Будущая зарплата по нидерландскому договору должна достигать официального порога. | не собирается; самостоятельное основание | condition, не автоматический FAIL | `NL_GVVA_SALARY`; `UNASKED_CONDITION`; `BECOMES_CONDITION`; separate_basis=True | PASS | Сохранить |
| Нужны инновационный бизнес-план, надёжный куратор стартапа и поэтапный план создания компании. | не собирается; самостоятельное основание | condition, не автоматический FAIL | `NL_STARTUP_PLAN`; `UNASKED_CONDITION`; `BECOMES_CONDITION`; separate_basis=True | PASS | Сохранить |
| Нужно иметь достаточные средства на проживание; ориентир IND для стартапа/self-employed в 2026 году — 1 766,77 € в месяц. | не собирается; самостоятельное основание | condition, не автоматический FAIL | `NL_STARTUP_FUNDS`; `UNASKED_CONDITION`; `BECOMES_CONDITION`; separate_basis=True | PASS | Сохранить |
| Деятельность должна представлять существенный интерес для экономики Нидерландов и пройти RVO балльную оценку. | не собирается; самостоятельное основание | condition, не автоматический FAIL | `NL_SELF_INTEREST`; `UNASKED_CONDITION`; `BECOMES_CONDITION`; separate_basis=True | PASS | Сохранить |
| Для самозанятого специалиста нужны один или несколько заказов в Нидерландах. | не собирается; самостоятельное основание | condition, не автоматический FAIL | `NL_SELF_CLIENTS`; `UNASKED_CONDITION`; `BECOMES_CONDITION`; separate_basis=True | PASS | Сохранить |
| Будущий валовой доход от самостоятельной деятельности должен достигать официального порога. | не собирается; самостоятельное основание | condition, не автоматический FAIL | `NL_SELF_INCOME`; `UNASKED_CONDITION`; `BECOMES_CONDITION`; separate_basis=True | PASS | Сохранить |
| Нужно зачисление на очную аккредитованную программу у признанного образовательного спонсора. | не собирается; самостоятельное основание | condition, не автоматический FAIL | `NL_STUDY_ADMISSION`; `UNASKED_CONDITION`; `BECOMES_CONDITION`; separate_basis=True | PASS | Сохранить |
| Нужно подтверждать 1 130,77 € средств на проживание в месяц без платы за обучение. | не собирается; самостоятельное основание | condition, не автоматический FAIL | `NL_STUDY_FUNDS`; `UNASKED_CONDITION`; `BECOMES_CONDITION`; separate_basis=True | PASS | Сохранить |
| Нужны исследовательская должность, признанный научный спонсор и трудовой договор или соглашение с принимающей организацией с утверждённым исследовательским проектом. | не собирается; самостоятельное основание | condition, не автоматический FAIL | `NL_RESEARCHER_HOST`; `UNASKED_CONDITION`; `BECOMES_CONDITION`; separate_basis=True | PASS | Сохранить |
| Требуется высшее образование, открывающее доступ к докторантуру, либо подтверждение работодателем эквивалентного уровня. | не собирается; проверяется при подаче | не меняет статус | `NL_RESEARCHER_EDUCATION`; `DISPLAY_ONLY`; `NONE`; separate_basis=False | PASS | Сохранить |
| Средства могут подтверждаться зарплатой, грантом, финансированием спонсора или собственными средствами; денежный ориентир IND для исследователь в 2026 году — 1 635,90 € в месяц. | не собирается; самостоятельное основание | condition, не автоматический FAIL | `NL_RESEARCHER_FUNDS`; `UNASKED_CONDITION`; `BECOMES_CONDITION`; separate_basis=True | PASS | Сохранить |
| Подтвердить квалифицирующее основание, завершённое в течение 3 лет до подачи. Для образования в зарубежном вузе за пределами Нидерландов это master, PhD или post-master; вуз на дату выпуска должен входить в топ-200 минимум у 2 из 3 издателей рейтингов THE, QS и ShanghaiRanking. Также требуется оценка иностранного диплома Nuffic и выполнение одного из языковых критериев IND. Обычный зарубежный бакалавриат сам по себе не подходит. | не собирается; проверяется при подаче | не меняет статус | `NL_ORIENTATION_PRIOR_BASIS`; `DISPLAY_ONLY`; `NONE`; separate_basis=False | PASS | Уточнено 2026-09-10: зарубежный бакалавриат не покрывает foreign-degree branch; master/PhD/post-master + top-200 2/3 + Nuffic + язык |
| Нужна ключевая роль у соответствующего требованиям инновационного стартапа, соответствующая зарплата и долевое участие сотрудника. | не собирается; самостоятельное основание | condition, не автоматический FAIL | `NL_ESP_JOB`; `UNASKED_CONDITION`; `BECOMES_CONDITION`; separate_basis=True | PASS | Сохранить |
| Нужен сезонный договор в сельском хозяйстве максимум на 24 недели и применимое одобрение UWV. | не собирается; самостоятельное основание | condition, не автоматический FAIL | `NL_SEASONAL_JOB`; `UNASKED_CONDITION`; `BECOMES_CONDITION`; separate_basis=True | PASS | Сохранить |
| Нужны соответствующее требованиям соглашение о стажировке или профессиональной практике и связь с обучением либо профессиональной подготовкой. | не собирается; самостоятельное основание | condition, не автоматический FAIL | `NL_INTERN_BASIS`; `UNASKED_CONDITION`; `BECOMES_CONDITION`; separate_basis=True | PASS | Сохранить |
| Нужно очное зачисление у признанного спонсора; Нидерланды должны быть наиболее подходящей страной для этого обучения. | не собирается; самостоятельное основание | condition, не автоматический FAIL | `NL_VOCATIONAL_ADMISSION`; `UNASKED_CONDITION`; `BECOMES_CONDITION`; separate_basis=True | PASS | Сохранить |
| Нужно подтверждать средства на проживание; норматив IND для среднего/профессионального обучения в 2026 году — 928,58 € в месяц. | не собирается; самостоятельное основание | condition, не автоматический FAIL | `NL_VOCATIONAL_FUNDS`; `UNASKED_CONDITION`; `BECOMES_CONDITION`; separate_basis=True | PASS | Сохранить |
| Нужны признанный спонсор программы обмена и принимающая семья, соответствующая требованиям, возраст и выполнение условий временного программы культурного обмена. | не собирается; самостоятельное основание | condition, не автоматический FAIL | `NL_AUPAIR_BASIS`; `UNASKED_CONDITION`; `BECOMES_CONDITION`; separate_basis=True | PASS | Сохранить |
| Нужно участие в утверждённой программе обмена через признанного спонсора. | не собирается; самостоятельное основание | condition, не автоматический FAIL | `NL_EXCHANGE_BASIS`; `UNASKED_CONDITION`; `BECOMES_CONDITION`; separate_basis=True | PASS | Сохранить |
| Нужно участие иностранного и нидерландского работодателя в одобренном UWV торговой или проектной программе. | не собирается; самостоятельное основание | condition, не автоматический FAIL | `NL_TRADE_BASIS`; `UNASKED_CONDITION`; `BECOMES_CONDITION`; separate_basis=True | PASS | Сохранить |
| Требуется перевод внутри одной корпоративной группы как руководитель, специалист или стажёр. | не собирается; самостоятельное основание | condition, не автоматический FAIL | `NL_ICT_BASIS`; `UNASKED_CONDITION`; `BECOMES_CONDITION`; separate_basis=True | PASS | Сохранить |
| Нужна квалифицирующая связь со спонсором: брак, зарегистрированное партнёрство либо подтверждённые устойчивые незарегистрированные отношения. | не собирается; самостоятельное основание | condition, не автоматический FAIL | `NL_FAMILY_BASIS`; `UNASKED_CONDITION`; `BECOMES_CONDITION`; separate_basis=True | PASS | Сохранить |
| Нужен индивидуально доказуемый обоснованный риск преследования либо серьёзного вреда; гражданство РФ или ЛГБТ-флаг сами по себе не дают автоматический статус. | не собирается; самостоятельное основание | condition, не автоматический FAIL | `NL_ASYLUM_RISK`; `UNASKED_CONDITION`; `BECOMES_CONDITION`; separate_basis=True | PASS | Сохранить |
| Нужна конкретная оплачиваемая работа в ситуации, когда GVVA не применяется либо отдельный TWV не требуется. | не собирается; самостоятельное основание | condition, не автоматический FAIL | `NL_PAID_EMPLOYMENT_ONLY_BASIS`; `UNASKED_CONDITION`; `BECOMES_CONDITION`; separate_basis=True | PASS | Сохранить |
| Нужны действующее разрешение исследователя другой страны ЕС, принимающая организация и пребывание не более 180 дней. | не собирается; самостоятельное основание | condition, не автоматический FAIL | `NL_RESEARCHER_SHORT_MOBILITY_BASIS`; `UNASKED_CONDITION`; `BECOMES_CONDITION`; separate_basis=True | PASS | Сохранить |
| Нужна подходящая программа ЕС и соглашение о временной стажировке или практике. | не собирается; самостоятельное основание | condition, не автоматический FAIL | `NL_EU_PROGRAMME_TRAINEE_BASIS`; `UNASKED_CONDITION`; `BECOMES_CONDITION`; separate_basis=True | PASS | Сохранить |
| Заявитель законно работает у работодателя в ЕС/ЕЭЗ/Швейцарии и временно направляется к нидерландскому заказчику максимум на два года. | не собирается; самостоятельное основание | condition, не автоматический FAIL | `NL_CROSS_BORDER_SERVICE_BASIS`; `UNASKED_CONDITION`; `BECOMES_CONDITION`; separate_basis=True | PASS | Сохранить |
| Нужна работа членом экипажа морского судна в нидерландском морском порту на срок более 90 дней. | не собирается; самостоятельное основание | condition, не автоматический FAIL | `NL_SEAFARING_BASIS`; `UNASKED_CONDITION`; `BECOMES_CONDITION`; separate_basis=True | PASS | Сохранить |
| Нужны студенческий ВНЖ другой страны ЕС и обучение в Нидерландах как часть программы по Директиве 2016/801. | не собирается; самостоятельное основание | condition, не автоматический FAIL | `NL_STUDENT_EU_MOBILITY_BASIS`; `UNASKED_CONDITION`; `BECOMES_CONDITION`; separate_basis=True | PASS | Сохранить |
| Нужно соответствовать условиям пилота и пройти последний год очной программы mbo-4 в Нидерландах. | не собирается; самостоятельное основание | condition, не автоматический FAIL | `NL_MBO4_PILOT_BASIS`; `UNASKED_CONDITION`; `BECOMES_CONDITION`; separate_basis=True | PASS | Сохранить |
| Необходимость лечения и соответствие заключению BMA либо условиям после не менее года отсрочки выезда по статье 64. | не собирается; самостоятельное основание | condition, не автоматический FAIL | `NL_MEDICAL_BASIS`; `UNASKED_CONDITION`; `BECOMES_CONDITION`; separate_basis=True | PASS | Сохранить |
| Для обычной медицинской ветки нужны страхование и независимые достаточные средства; для ветки после статьи 64 опубликовано исключение. | не собирается; проверяется при подаче | не меняет статус | `NL_MEDICAL_PAYMENT`; `DISPLAY_ONLY`; `NONE`; separate_basis=False | PASS | Сохранить |
| Требуется доказать реальную серьёзную угрозу домашнего или честь-мотивированного насилия и отсутствие другого подходящего основания проживания. | не собирается; самостоятельное основание | condition, не автоматический FAIL | `NL_DOMESTIC_VIOLENCE_BASIS`; `UNASKED_CONDITION`; `BECOMES_CONDITION`; separate_basis=True | PASS | Сохранить |
| Исключительное основание применяется, когда семейная жизнь защищается статьёй 8 ЕКПЧ, а обычный семейный ВНЖ недоступен. | не собирается; самостоятельное основание | condition, не автоматический FAIL | `NL_ART8_FAMILY_LIFE_BASIS`; `UNASKED_CONDITION`; `BECOMES_CONDITION`; separate_basis=True | PASS | Сохранить |
| Нужна индивидуальная совокупность обстоятельств, при которой отказ нарушил бы право на частную жизнь по статье 8 ЕКПЧ. | не собирается; самостоятельное основание | condition, не автоматический FAIL | `NL_ART8_PRIVATE_LIFE_BASIS`; `UNASKED_CONDITION`; `BECOMES_CONDITION`; separate_basis=True | PASS | Сохранить |
| Требуется соответствовать одной из официальных веток возвращения бывших граждан Нидерландов или бывших долгосрочных резидентов. | не собирается; самостоятельное основание | condition, не автоматический FAIL | `NL_RETURNING_FORMER_RESIDENT_BASIS`; `UNASKED_CONDITION`; `BECOMES_CONDITION`; separate_basis=True | PASS | Сохранить |
| Нужен статус долгосрочного резидента ЕС другой страны ЕС и нидерландское трудовое основание; MVV и TB не требуются, TWV применяется только первые 12 месяцев. | не собирается; самостоятельное основание | condition, не автоматический FAIL | `NL_EU_LTR_EMPLOYMENT_BASIS`; `UNASKED_CONDITION`; `BECOMES_CONDITION`; separate_basis=True | PASS | Сохранить |
| Нужен статус долгосрочного резидента ЕС другой страны ЕС и допустимое нидерландское основание самостоятельной деятельности; MVV и TB не требуются. | не собирается; самостоятельное основание | condition, не автоматический FAIL | `NL_EU_LTR_SELF_EMPLOYED_BASIS`; `UNASKED_CONDITION`; `BECOMES_CONDITION`; separate_basis=True | PASS | Сохранить |
| Нужен статус долгосрочного резидента ЕС другой страны ЕС и зачисление на подходящую программу; MVV и TB не требуются. | не собирается; самостоятельное основание | condition, не автоматический FAIL | `NL_EU_LTR_STUDY_BASIS`; `UNASKED_CONDITION`; `BECOMES_CONDITION`; separate_basis=True | PASS | Сохранить |
| Нужны статус долгосрочного резидента ЕС другой страны ЕС и независимый достаточный доход; после выдачи пятилетнего ВНЖ работа разрешена без TWV. | не собирается; самостоятельное основание | condition, не автоматический FAIL | `NL_EU_LTR_INACTIVE_BASIS`; `UNASKED_CONDITION`; `BECOMES_CONDITION`; separate_basis=True | PASS | Сохранить |
| Несовершеннолетний ребёнок переезжает к родителю, имеющему допустимый статус в Нидерландах, при выполнении требований опеки и семейной связи. | не собирается; самостоятельное основание | condition, не автоматический FAIL | `NL_FAMILY_MINOR_CHILD_BASIS`; `UNASKED_CONDITION`; `BECOMES_CONDITION`; separate_basis=True | PASS | Сохранить |
| Требуются действительное усыновление и выполнение правил въезда усыновлённого ребёнка. | не собирается; самостоятельное основание | condition, не автоматический FAIL | `NL_FAMILY_ADOPTED_CHILD_BASIS`; `UNASKED_CONDITION`; `BECOMES_CONDITION`; separate_basis=True | PASS | Сохранить |
| Требуются подтверждённая приёмная семейная связь и выполнение специальных условий размещения ребёнка. | не собирается; самостоятельное основание | condition, не автоматический FAIL | `NL_FAMILY_FOSTER_CHILD_BASIS`; `UNASKED_CONDITION`; `BECOMES_CONDITION`; separate_basis=True | PASS | Сохранить |
| Заявитель является фактическим основным ухаживающим лицом несовершеннолетнего гражданина Нидерландов, который был бы вынужден покинуть ЕС без заявителя. | не собирается; самостоятельное основание | condition, не автоматический FAIL | `NL_FAMILY_CHAVEZ_BASIS`; `UNASKED_CONDITION`; `BECOMES_CONDITION`; separate_basis=True | PASS | Сохранить |
| Нужны квалифицирующая семейная связь и гражданин ЕС/ЕЭЗ/Швейцарии, реализующий право свободного передвижения. | не собирается; самостоятельное основание | condition, не автоматический FAIL | `NL_FAMILY_EU_LAW_BASIS`; `UNASKED_CONDITION`; `BECOMES_CONDITION`; separate_basis=True | PASS | Сохранить |
| Требуются реальное совместное проживание с гражданином Нидерландов в другой стране ЕС и возвращение в Нидерланды по правилам права ЕС. | не собирается; самостоятельное основание | condition, не автоматический FAIL | `NL_FAMILY_RETURN_DUTCH_BASIS`; `UNASKED_CONDITION`; `BECOMES_CONDITION`; separate_basis=True | PASS | Сохранить |
| Спонсор недавно получил убежище и подаёт на квалифицирующих членов семьи в установленный срок с доказательствами существовавшей семейной связи. | не собирается; самостоятельное основание | condition, не автоматический FAIL | `NL_ASYLUM_FAMILY_REUNIFICATION_BASIS`; `UNASKED_CONDITION`; `BECOMES_CONDITION`; separate_basis=True | PASS | Сохранить |
| Требуется ранее иметь одно из перечисленных гуманитарных или семейных оснований и соответствовать условиям продолжения проживания. | не собирается; самостоятельное основание | condition, не автоматический FAIL | `NL_HUMANITARIAN_NON_TEMPORARY_BASIS`; `UNASKED_CONDITION`; `BECOMES_CONDITION`; separate_basis=True | PASS | Сохранить |
| Охватывает опубликованные специальные случаи, включая торговлю людьми, невозможность выезда не по своей вине, терминальную болезнь и иные строго индивидуальные основания. | не собирается; самостоятельное основание | condition, не автоматический FAIL | `NL_OTHER_HUMANITARIAN_BASIS`; `UNASKED_CONDITION`; `BECOMES_CONDITION`; separate_basis=True | PASS | Сохранить |
| Повторное заявление требует новых фактов, документов либо существенно изменившихся личных обстоятельств или ситуации в стране происхождения. | не собирается; самостоятельное основание | condition, не автоматический FAIL | `NL_SECOND_ASYLUM_BASIS`; `UNASKED_CONDITION`; `BECOMES_CONDITION`; separate_basis=True | PASS | Сохранить |

## Все 44 доступных маршрута

| route_id | Официальное основание | route_type | publishable | Причина публикации/скрытия | Итог |
|---|---|---|---:|---|---|
| `NL_HSM` | Kennismigrant | `HIGHLY_QUALIFIED_SPECIALIST` | true | самостоятельная стратегия внутри publication boundary | PASS |
| `NL_BLUE_CARD` | Голубая карта ЕС | `HIGHLY_QUALIFIED_SPECIALIST` | true | самостоятельная стратегия внутри publication boundary | PASS |
| `NL_GVVA` | Gecombineerde vergunning verblijf en arbeid (GVVA) | `LOCAL_EMPLOYMENT` | true | самостоятельная стратегия внутри publication boundary | PASS |
| `NL_STARTUP` | Verblijfsvergunning voor start-up | `ENTREPRENEURSHIP_SELF_EMPLOYMENT` | true | самостоятельная стратегия внутри publication boundary | PASS |
| `NL_SELF_EMPLOYED` | Arbeid als zelfstandige | `ENTREPRENEURSHIP_SELF_EMPLOYMENT` | true | самостоятельная стратегия внутри publication boundary | PASS |
| `NL_STUDY` | Studievergunning hoger onderwijs | `STUDY` | true | самостоятельная стратегия внутри publication boundary | PASS |
| `NL_RESEARCHER` | Onderzoeker Richtlijn (EU) 2016/801 | `HIGHLY_QUALIFIED_SPECIALIST` | true | самостоятельная стратегия внутри publication boundary | PASS |
| `NL_ORIENTATION_YEAR` | Zoekjaar hoogopgeleiden | `GENERAL_RESIDENCE` | true | самостоятельная стратегия внутри publication boundary | PASS |
| `NL_ESSENTIAL_STARTUP_PERSONNEL` | Ключевой сотрудник стартапа | `LOCAL_EMPLOYMENT` | false | узкий корпоративный маршрут | PASS |
| `NL_SEASONAL_WORK` | Сезонная работа | `LOCAL_EMPLOYMENT` | false | узкая временная занятость | PASS |
| `NL_INTERN_APPRENTICE` | Практикант или стажёр | `OTHER` | false | узкая стажировка | PASS |
| `NL_VOCATIONAL_STUDY` | Secondary or vocational education residence permit | `STUDY` | true | самостоятельная стратегия внутри publication boundary | PASS |
| `NL_AU_PAIR` | Residence permit au pair | `OTHER` | false | узкая программа обмена | PASS |
| `NL_CULTURAL_EXCHANGE` | Residence permit cultural exchange | `OTHER` | false | узкая программа обмена | PASS |
| `NL_INTERNATIONAL_TRADE` | Международная торговая программа | `OTHER` | false | узкая корпоративная программа | PASS |
| `NL_ICT` | Внутрикорпоративный перевод (Directive 2014/66/EU) | `INTRA_COMPANY_TRANSFER` | false | внутрикорпоративный перевод | PASS |
| `NL_FAMILY_PARTNER` | ВНЖ для партнёра | `FAMILY` | false | самостоятельный семейный маршрут | PASS |
| `NL_ASYLUM` | Asylum residence permit | `INTERNATIONAL_PROTECTION` | true | самостоятельная стратегия внутри publication boundary | PASS |
| `NL_PAID_EMPLOYMENT_ONLY` | Оплачиваемая работа: только ВНЖ | `LOCAL_EMPLOYMENT` | false | product publication boundary | PASS |
| `NL_RESEARCHER_SHORT_MOBILITY` | Краткосрочная мобильность исследователей | `OTHER` | false | внутриевропейская мобильность | PASS |
| `NL_EU_PROGRAMME_TRAINEE` | Профессиональный опыт по программе ЕС | `OTHER` | false | узкая стажировка | PASS |
| `NL_CROSS_BORDER_SERVICE` | Трансграничное оказание услуг | `OTHER` | false | корпоративное направление персонала | PASS |
| `NL_SEAFARING` | Работа в морском судоходстве | `OTHER` | false | морской экипаж | PASS |
| `NL_STUDENT_EU_MOBILITY` | Внутриевропейская мобильность студента | `STUDY` | false | внутриевропейская мобильность | PASS |
| `NL_MBO4_PILOT` | Пилот входящей мобильности mbo-4 | `STUDY` | false | узкий пилот | PASS |
| `NL_MEDICAL_TREATMENT` | Residence permit medical treatment | `OTHER` | false | узкое медицинское основание | PASS |
| `NL_DOMESTIC_VIOLENCE` | Домашнее насилие или насилие во имя чести | `OTHER` | false | индивидуальное защитное основание | PASS |
| `NL_ART8_FAMILY_LIFE` | Семейная жизнь по статье 8 ЕКПЧ | `FAMILY` | false | исключительное семейное основание | PASS |
| `NL_ART8_PRIVATE_LIFE` | Частная жизнь по статье 8 ЕКПЧ | `OTHER` | false | исключительное индивидуальное основание | PASS |
| `NL_RETURNING_FORMER_RESIDENT` | Возвращение в Нидерланды | `GENERAL_RESIDENCE` | false | заранее существующий специальный статус | PASS |
| `NL_EU_LTR_EMPLOYMENT` | Long-term EU resident: employment in the Netherlands | `LOCAL_EMPLOYMENT` | false | мобильность долгосрочного резидента ЕС | PASS |
| `NL_EU_LTR_SELF_EMPLOYED` | Long-term EU resident: self-employment in the Netherlands | `ENTREPRENEURSHIP_SELF_EMPLOYMENT` | false | мобильность долгосрочного резидента ЕС | PASS |
| `NL_EU_LTR_STUDY` | Long-term EU resident: study in the Netherlands | `STUDY` | false | мобильность долгосрочного резидента ЕС | PASS |
| `NL_EU_LTR_INACTIVE` | Экономически неактивный долгосрочный резидент ЕС | `GENERAL_RESIDENCE` | false | мобильность долгосрочного резидента ЕС | PASS |
| `NL_FAMILY_MINOR_CHILD` | ВНЖ несовершеннолетнего ребёнка с родителем | `FAMILY` | false | самостоятельный семейный маршрут | PASS |
| `NL_FAMILY_ADOPTED_CHILD` | Усыновлённый ребёнок | `FAMILY` | false | самостоятельный семейный маршрут | PASS |
| `NL_FAMILY_FOSTER_CHILD` | Приёмный ребёнок | `FAMILY` | false | самостоятельный семейный маршрут | PASS |
| `NL_FAMILY_CHAVEZ` | Проживание с несовершеннолетним ребёнком — гражданином Нидерландов (Chavez) | `FAMILY` | false | самостоятельный семейный маршрут | PASS |
| `NL_FAMILY_EU_LAW` | Проверка права проживания по праву ЕС | `FAMILY` | false | самостоятельный семейный маршрут | PASS |
| `NL_FAMILY_RETURN_DUTCH` | Возвращение с гражданином Нидерландов из другой страны ЕС | `FAMILY` | false | самостоятельный семейный маршрут | PASS |
| `NL_ASYLUM_FAMILY_REUNIFICATION` | Воссоединение семьи получателя убежища | `FAMILY` | false | самостоятельный семейный маршрут | PASS |
| `NL_HUMANITARIAN_NON_TEMPORARY` | Гуманитарное невременное основание | `OTHER` | false | последующая стадия/узкое гуманитарное основание | PASS |
| `NL_OTHER_HUMANITARIAN` | Other humanitarian residence permits | `OTHER` | false | узкое гуманитарное основание | PASS |
| `NL_SECOND_ASYLUM` | Повторное заявление о предоставлении убежища | `INTERNATIONAL_PROTECTION` | false | повторная защитная процедура | PASS |

## Тематические проверки

### Routes и coverage

Все 13 глобальных категорий представлены ровно один раз; двусторонние связи coverage ↔ `covers_categories` проходят integrity validation. Юридически разные routes не объединены. Publication boundary последовательно скрывает ICT, corporate/service-posting, maritime, family, EU mobility и узкие humanitarian routes. Три исключения вынесены в таблицу дефектов.

### Evaluation semantics

ENGINE requirements в пакете отсутствуют: все будущие offer/admission/business/protection bases корректно не превращаются в автоматический FAIL, а представлены как `UNASKED_CONDITION`. Образование и опыт представлены `DISPLAY_ONLY`. Обычные документы не оформлены как условия. Все requirements имеют `subject`, `timing`, `unmet_effect`; `profile_path` не требуется для не-ENGINE.

### Финансы

Проверены суммы, EUR, месячный период, владельцы дохода, география источника, накопления, спонсор, стипендия и `asked_in_questionnaire`. Пороговые суммы находятся только в `requirements[].financial`. Для HSM сохранены €3 122, €4 357 и €5 942; для Blue Card — €4 754 и €5 942. Будущая зарплата остаётся `UNASKED_CONDITION` и не сравнивается с текущим доходом пользователя.

### Family

Во всех 44 routes есть семейные сценарии для партнёра, несовершеннолетнего ребёнка и возраста 18+. Для публикуемых маршрутов партнёр и ребёнок разделены и связаны с юридически соответствующими family routes. Профили с детьми 17, 18, 25 и 40 лет проверены на движке 16.0.1: все 10 публикуемых маршрутов остаются в результате, `DATA_CONTRACT_PROBLEM` отсутствует.

### Work rights

Проверены employment, self-employment, foreign remote work, TWV, ограничения работодателем/проектом и partner rights. долгосрочный резидент ЕС employment хранит TWV первые 12 месяцев; economically inactive долгосрочный резидент ЕС — свободную работу после выдачи. Медицинское лечение запрещает работу; asylum, violence, study, год поиска работы после учёбы или исследования, au pair и exchange имеют отдельные правила.

### Application и entry

Для гражданина РФ отражены ограничения подачи на краткосрочную шенгенскую визу в России, обычная необходимость MVV для долгосрочного переезда, исключения и подача из страны гражданства или непрерывного законного проживания. Для получения MVV указаны Москва, условие письма IND, трёхмесячный срок записи и срок изготовления до десяти рабочих дней. Освобождение от MVV для долгосрочного резидента ЕС сохранено.

### Long-term path

У каждого route есть первый статус, renewal, зачёт, PR/citizenship path, integration/main-residence и renunciation warning. Отмена permanent asylum permit с 12 июня 2026 года отражена как отсутствие отдельной постоянной asylum стадии; действующий временный asylum path сохранён.

### Protection

Asylum требует индивидуального риска; LGBT toggle не создаёт eligibility. Повторное заявление, SOGI, admissibility/Dublin, safe-third-country, Article 8, domestic/honour violence, medical и humanitarian routes сохранены раздельно и скрыты/публикуются согласно boundary.

### Cities и cost

Роли: Amsterdam CAPITAL+LARGE, Rotterdam LARGE, Eindhoven MEDIUM, Groningen SMALL. Аренда воспроизводится: 28,69×60=1 721,40; 22,79×60=1 367,40; 20,25×60=1 215,00; 20,94×60=1 256,40 EUR/month. Groningen использует national rate с MEDIUM confidence. Энергия €1 993/12=€166,08 показана отдельно как energy, не полный utilities basket. Неподтверждённые groceries/transport не добавлены.

### Остальные блоки

Климат содержит числовые диапазоны и норму 1991–2020. Государственные и международные школы, а также опубликованные значения стоимости обучения представлены. Правила ввоза животных отделены от ограничений после въезда. Налоги различают Box 1, Box 2 и рассчитанную доходность Box 3; налоговое соглашение с РФ указано как недействующее с 01.01.2022. Правовой и практический блоки ЛГБТ, источники, предстоящие изменения и восемь дат пересмотра представлены.

## Машинные проверки

| Проверка | Результат |
|---|---|
| JSON syntax | PASS |
| Official schema validator | PASS |
| Integrity validator | PASS |
| Повторная проверка на main 16.0.1 | PASS: schema и integrity |
| Unique route IDs | PASS (44/44) |
| Unique requirement IDs per route | PASS |
| Unique source IDs | PASS (75/75) |
| Question IDs / option values | PASS: route-specific questions отсутствуют |
| All source references resolve | PASS |
| routes ↔ route coverage | PASS |
| Специальные routes publishable=false | PASS |
| Незарегистрированные contract gaps | PASS: отсутствуют |
| Family runtime, ages 17/18/25/40 | PASS: 10/10 publishable routes, 0 exclusions |
| Русские пользовательские тексты | PASS: гибридные слова и выявленные грамматические дефекты исправлены; официальные аббревиатуры и собственные названия сохранены |
| Markdown reports vs JSON | PASS |

## Решение

Research → Canon reconciliation завершён. RP4-пакет готов к отдельному этапу интеграции страны в приложение. Открытых research gaps и незакрытых generic contract gaps нет.
# Дополнение к reconciliation после целевой корректировки — 2026-09-05

| Исправленный факт | Questionnaire knowledge | Canon semantics | RP4 representation |
|---|---|---|---|
| Подача из страны гражданства или непрерывного проживания; sponsor-led/online channel отдельно | Текущее законное проживание известно частично; sponsor basis не устанавливается анкетой | География и канал не смешиваются | `ORIGIN_COUNTRY`, `CURRENT_LEGAL_RESIDENCE`, условный `IN_COUNTRY`, дополнительный `ONLINE`; `country_id: null` |
| Сроки различаются по типу заявления и иногда выражены в месяцах или диапазонах категорий | Анкета не определяет процессуальную категорию во всех случаях | Нельзя фабриковать единый day value | Один подтверждённый срок — число; переменный/месячный — `official_days: null` плюс точное правило |
| Study funds имеют несколько способов доказательства | Анкета не проверяет admission package и все sponsor arrangements | Самостоятельное основание остаётся condition, доказательства не сводятся к savings | Альтернативы `SAVINGS`, `SCHOLARSHIP`, `SPONSOR` |
| Researcher funds: salary/grant/sponsor/bank funds | Будущий research basis не подтверждается текущим доходом | `UNASKED_CONDITION`; не создавать ложный FAIL | Альтернативы `INCOME`, `SCHOLARSHIP`, `SPONSOR`, `SAVINGS` |
| Start-up funds: разрешённый bank arrangement или facilitator financing | Start-up basis не устанавливается анкетой | `UNASKED_CONDITION`; не требовать обычный monthly income | Альтернативы `SAVINGS` и `SPONSOR` |
| Study: 50% периода только для long-term EU residence; для naturalisation действует непрерывность и qualifying current status | Цель пользователя известна, будущая смена статуса нет | PR и citizenship counting разделяются | PR `PARTIAL` + change of basis; citizenship `YES` + current-status condition |
| Orientation year не считается для long-term EU residence, но может входить в непрерывность для натурализации | Будущий статус неизвестен | Не смешивать два режима зачёта | PR `NO`; citizenship `YES` с обязательной сменой статуса |
| Asylum family reunification после 12 июня 2026 года ограничен супругом и детьми до 18; для subsidiary protection дополнительные условия | Статус защиты и семейная связь могут быть неполно известны | Обычный asylum-family path отделяется от Article 8 ECHR | Сценарии linked to `NL_ASYLUM_FAMILY_REUNIFICATION`; excluded family linked to `NL_ART8_FAMILY_LIFE` |

## Targeted refresh 2026-09-10

Перед интеграцией в release 20.0.0 повторно проверены официальные страницы IND и исправлены оставшиеся semantic defects: route-specific filing для GVVA/Blue Card/seasonal/intern/MBO4, продление International Trade/Cross-border/Intern, MBO4 self-employment и срок permit, Blue Card self-employment, а также отдельные нормы для финансирующего студента лица, живущего в Нидерландах. Canon/schema/engine/questionnaire не изменялись. Runtime `NL-research-v4.0.json` и его копия в research docs синхронизированы.
