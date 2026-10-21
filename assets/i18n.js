/* Shared, lightweight i18n for the partner-facing pages (public site + partner dashboard).
   The admin panel is intentionally left out of scope (internal use only).

   Usage:
   - Static HTML: add data-i18n="key" (sets textContent), data-i18n-html="key" (sets innerHTML,
     only for strings that are known-safe, e.g. contain a fixed <a> link), data-i18n-placeholder="key"
     (input placeholder) or data-i18n-title="key" (title attribute). Call I18N.apply() once the DOM
     is ready, and again after injecting new static chrome.
   - JS-generated strings: I18N.t("key") returns the translated string (falls back to English, then
     to the key itself if truly missing).
   - Language choice: I18N.getLang() / I18N.setLang(code). Before login this is stored in
     localStorage only. The partner dashboard additionally persists it to the partner's account
     (see assets/partner-dashboard.js) so it follows the partner across devices.
*/
(function (global) {
  var STORAGE_KEY = "pp_lang";
  // "ru" stays translated in DICT below (so nothing breaks if it's ever
  // re-enabled) but is deliberately left out of LANGS: that's what drives the
  // language switcher's options and auto-detection eligibility, so leaving it
  // out removes it from the selectable list and stops the site from
  // auto-selecting it for Russian-language browsers (they fall back to
  // English instead, same as any other unsupported browser language).
  var LANGS = ["en", "es", "el", "fr", "pt"];
  var LANG_NAMES = { en: "English", ru: "Русский", es: "Español", el: "Ελληνικά", fr: "Français", pt: "Português" };

  var DICT = {
    en: {
      nav_orders: "Orders", nav_company: "Company", nav_fleet: "Fleet", nav_finance: "Finance", nav_account: "Account",
      logout: "Log out",

      home_eyebrow: "Partner portal", home_title: "Fleet Partner Portal",
      home_lede: "Register your company, upload your documents, and receive orders assigned directly to you.",
      home_new_title: "New partner", home_new_sub: "Create your account, add your vehicles and drivers, and upload the required documents.",
      home_new_btn: "Create partner account",
      home_existing_title: "Already registered", home_existing_sub: "Sign in to see your orders and manage your documents.",
      home_existing_btn: "Sign in",
      home_how_title: "How it works", home_how_sub: "Everything a partner needs to get active and start receiving orders.",
      home_f1_title: "Direct order assignment", home_f1_body: "Orders go straight into your dashboard. Accept or decline before someone else is asked — no bidding, no marketplace in between.",
      home_f2_title: "Multi-country coverage", home_f2_body: "Register once, then list every city and airport your vehicles actually cover.",
      home_f3_title: "Clear document tracking", home_f3_body: "Upload vehicle and driver documents once and track review status for every slot, right in your account.",

      login_eyebrow: "Partner portal", login_title: "Sign in",
      login_lede_pre: "Not registered yet? ", login_lede_link: "Create a partner account", login_lede_post: ".",
      login_email: "Email", login_password: "Password", login_btn: "Sign in",

      register_eyebrow: "Partner registration", register_title: "Create your partner account",
      register_lede_pre: "Register your company account below. You'll add your vehicles, drivers and documents from your dashboard right after you sign in. Already registered? ",
      register_lede_link: "Sign in", register_lede_post: ".",
      register_section_account_title: "Company & account", register_section_account_sub: "Used to sign in to your partner dashboard right after you register.",
      register_company_name: "Company name", register_email: "Email", register_phone: "Contact phone number", register_password: "Password",
      register_country: "Country", register_city: "City of service",
      register_airports_label: "Airports you cover", register_airports_sub: "Select a country and city above, then search and add every airport your company serves there.",
      register_vehicle1_title: "Vehicle 1", register_vehicle2_title: "Vehicle 2", register_vehicle2_sub: "Only if this company has a second vehicle — otherwise leave blank.",
      register_plate: "Plate number",
      register_driver1_title: "Driver 1", register_driver2_title: "Driver 2", register_driver2_sub: "Only if this company has a second driver — otherwise leave blank.",
      register_driver_name: "Driver name",
      register_other_title: "Other document", register_other_sub: "Optional — anything that doesn't fit above.", register_other_desc: "What is this document?",
      register_submit_btn: "Create account",
      register_next_note: "Next: sign in and add your vehicles, drivers and documents from the dashboard.",
      register_success_title: "Application submitted", register_goto_login: "Go to sign in",

      dash_orders_title: "Orders", dash_orders_sub: "Orders assigned to you by the admin. Accept or decline before someone else is asked.",
      dash_company_title: "Company", dash_company_sub: "Your company profile and the documents we have on file.",
      dash_fleet_title: "Fleet", dash_fleet_sub: "Manage your vehicles and drivers. Click a card to edit details and documents.",
      dash_finance_title: "Finance", dash_finance_sub: "Your completed trips and earnings. Every completed order (including confirmed no-shows) counts here automatically.",
      fin_export_csv: "Export CSV", fin_print: "Print", fin_th_route: "Route", fin_th_price: "Price",
      trial_title: "Trial period", trial_sub: "Starts automatically with your first completed order and runs for 30 days.",
      fin_stat_noshows: "No-shows (confirmed)",
      dash_account_title: "Account", dash_account_sub: "Your company's details on file",

      stat_new: "New", stat_accepted: "Accepted", stat_completed: "Completed", stat_closed: "Declined / cancelled",

      th_order: "Order #", th_start: "Start point", th_dest: "Destination", th_date: "Date", th_time: "Time",
      th_vehicle: "Vehicle", th_passengers: "Passengers", th_price: "Price", th_action: "Action",

      empty_new: "No new orders right now.", empty_accepted: "Nothing in progress right now.", empty_completed: "No completed orders yet.",

      od_trip: "Trip", od_passenger_price: "Passenger & price", od_vehicle_driver: "Vehicle & driver", od_trip_progress: "Trip progress",
      fl_date: "Date", fl_pickup_time: "Pickup time", fl_buffer_time: "Waiting time", fl_vehicle_type: "Vehicle type", fl_meet_greet: "Meet & greet sign",
      btn_accept: "Accept", btn_decline: "Decline", btn_save: "Save", btn_more: "More", btn_back_to_orders: "Back to orders",
      no_show_pending: "Reported as a customer no-show — pending review.",
      report_no_show_btn: "Report customer no-show",

      stage_on_the_way: "On the way", stage_arrived: "Arrived at pickup", stage_in_car: "Passenger on board", stage_dropped_off: "Dropped off",

      company_details_title: "Company details", company_documents_title: "Company documents",
      company_documents_sub: "Click a box to upload a document. Click it again any time to replace the file.",
      other_documents_title: "Other documents", other_documents_sub: "Anything that doesn't fit the categories above",
      save_changes_btn: "Save changes",

      fleet_vehicles_tab: "Vehicles", fleet_drivers_tab: "Drivers",

      account_id_label: "Account ID", account_email_label: "Email", account_company_label: "Company",
      account_country_label: "Country", account_status_label: "Status", account_since_label: "Member since",
      contact_coverage_title: "Contact & coverage", contact_coverage_sub: "Shown to our team only — keep this up to date so we can reach you and route the right orders your way.",
      contact_phone_label: "Contact phone number", city_of_service_label: "City of service", airports_you_cover_label: "Airports you cover",
      language_label: "Dashboard language",

      pending_banner_title: "Your documents are still under review.",
      pending_banner_body: "You can use your dashboard, but you won't receive orders until an admin activates your account.",
      company_doc_alert_title: "Some company documents are still needed",
      company_doc_alert_body: "Upload them below — this notice clears once an admin approves them.",
    },
    ru: {
      nav_orders: "Заказы", nav_company: "Компания", nav_fleet: "Автопарк", nav_finance: "Финансы", nav_account: "Аккаунт",
      logout: "Выйти",

      home_eyebrow: "Портал партнёров", home_title: "Портал партнёров автопарка",
      home_lede: "Зарегистрируйте компанию, загрузите документы и получайте заказы напрямую.",
      home_new_title: "Новый партнёр", home_new_sub: "Создайте аккаунт, добавьте автомобили и водителей, загрузите необходимые документы.",
      home_new_btn: "Создать аккаунт партнёра",
      home_existing_title: "Уже зарегистрированы", home_existing_sub: "Войдите, чтобы увидеть свои заказы и управлять документами.",
      home_existing_btn: "Войти",
      home_how_title: "Как это работает", home_how_sub: "Всё, что нужно партнёру, чтобы начать получать заказы.",
      home_f1_title: "Прямое назначение заказов", home_f1_body: "Заказы сразу попадают в ваш личный кабинет. Принимайте или отклоняйте до того, как предложат другому — без торгов и посредников.",
      home_f2_title: "Работа в нескольких странах", home_f2_body: "Зарегистрируйтесь один раз и укажите все города и аэропорты, которые реально обслуживают ваши автомобили.",
      home_f3_title: "Понятный учёт документов", home_f3_body: "Загрузите документы на машины и водителей один раз и отслеживайте статус проверки по каждому пункту прямо в аккаунте.",

      login_eyebrow: "Портал партнёров", login_title: "Вход",
      login_lede_pre: "Ещё не зарегистрированы? ", login_lede_link: "Создать аккаунт партнёра", login_lede_post: ".",
      login_email: "Email", login_password: "Пароль", login_btn: "Войти",

      register_eyebrow: "Регистрация партнёра", register_title: "Создайте аккаунт партнёра",
      register_lede_pre: "Зарегистрируйте аккаунт компании. Автомобили, водителей и документы вы добавите в личном кабинете сразу после входа. Уже зарегистрированы? ",
      register_lede_link: "Войти", register_lede_post: ".",
      register_section_account_title: "Компания и аккаунт", register_section_account_sub: "Используется для входа в личный кабинет партнёра сразу после регистрации.",
      register_company_name: "Название компании", register_email: "Email", register_phone: "Контактный телефон", register_password: "Пароль",
      register_country: "Страна", register_city: "Город обслуживания",
      register_airports_label: "Аэропорты, которые вы обслуживаете", register_airports_sub: "Выберите страну и город выше, затем найдите и добавьте все аэропорты, которые обслуживает ваша компания.",
      register_vehicle1_title: "Автомобиль 1", register_vehicle2_title: "Автомобиль 2", register_vehicle2_sub: "Только если у компании есть второй автомобиль — иначе оставьте пустым.",
      register_plate: "Номерной знак",
      register_driver1_title: "Водитель 1", register_driver2_title: "Водитель 2", register_driver2_sub: "Только если у компании есть второй водитель — иначе оставьте пустым.",
      register_driver_name: "Имя водителя",
      register_other_title: "Другой документ", register_other_sub: "Необязательно — всё, что не подошло выше.", register_other_desc: "Что это за документ?",
      register_submit_btn: "Создать аккаунт",
      register_next_note: "Далее: войдите и добавьте автомобили, водителей и документы в личном кабинете.",
      register_success_title: "Заявка отправлена", register_goto_login: "Перейти ко входу",

      dash_orders_title: "Заказы", dash_orders_sub: "Заказы, назначенные вам админом. Принимайте или отклоняйте до того, как предложат другому.",
      dash_company_title: "Компания", dash_company_sub: "Профиль вашей компании и документы, которые у нас есть.",
      dash_fleet_title: "Автопарк", dash_fleet_sub: "Управляйте автомобилями и водителями. Нажмите на карточку, чтобы изменить данные и документы.",
      dash_finance_title: "Финансы", dash_finance_sub: "Ваши завершённые поездки и заработок. Каждый завершённый заказ (включая подтверждённые no-show) учитывается здесь автоматически.",
      fin_export_csv: "Экспорт CSV", fin_print: "Печать", fin_th_route: "Маршрут", fin_th_price: "Цена",
      trial_title: "Триал-период", trial_sub: "Начинается автоматически с вашего первого завершённого заказа и длится 30 дней.",
      fin_stat_noshows: "Неявки (подтверждённые)",
      dash_account_title: "Аккаунт", dash_account_sub: "Данные вашей компании в системе",

      stat_new: "Новые", stat_accepted: "Принятые", stat_completed: "Завершённые", stat_closed: "Отклонённые / отменённые",

      th_order: "№ заказа", th_start: "Откуда", th_dest: "Куда", th_date: "Дата", th_time: "Время",
      th_vehicle: "Авто", th_passengers: "Пассажиры", th_price: "Цена", th_action: "Действие",

      empty_new: "Пока нет новых заказов.", empty_accepted: "Сейчас ничего не в работе.", empty_completed: "Завершённых заказов пока нет.",

      od_trip: "Поездка", od_passenger_price: "Пассажир и цена", od_vehicle_driver: "Авто и водитель", od_trip_progress: "Статус поездки",
      fl_date: "Дата", fl_pickup_time: "Время подачи", fl_buffer_time: "Время ожидания", fl_vehicle_type: "Тип авто", fl_meet_greet: "Табличка для встречи",
      btn_accept: "Принять", btn_decline: "Отклонить", btn_save: "Сохранить", btn_more: "Ещё", btn_back_to_orders: "Назад к заказам",
      no_show_pending: "Заявлено как неявка пассажира — ожидает проверки.",
      report_no_show_btn: "Сообщить о неявке пассажира",

      stage_on_the_way: "В пути", stage_arrived: "Прибыл на подачу", stage_in_car: "Пассажир в машине", stage_dropped_off: "Высадка выполнена",

      company_details_title: "Данные компании", company_documents_title: "Документы компании",
      company_documents_sub: "Нажмите на поле, чтобы загрузить документ. Нажмите ещё раз в любой момент, чтобы заменить файл.",
      other_documents_title: "Другие документы", other_documents_sub: "Всё, что не подошло под категории выше",
      save_changes_btn: "Сохранить изменения",

      fleet_vehicles_tab: "Автомобили", fleet_drivers_tab: "Водители",

      account_id_label: "ID аккаунта", account_email_label: "Email", account_company_label: "Компания",
      account_country_label: "Страна", account_status_label: "Статус", account_since_label: "Дата регистрации",
      contact_coverage_title: "Контакты и зона покрытия", contact_coverage_sub: "Видно только нашей команде — держите это в актуальном состоянии, чтобы мы могли с вами связаться и направлять нужные заказы.",
      contact_phone_label: "Контактный телефон", city_of_service_label: "Город обслуживания", airports_you_cover_label: "Аэропорты, которые вы обслуживаете",
      language_label: "Язык кабинета",

      pending_banner_title: "Ваши документы ещё на проверке.",
      pending_banner_body: "Вы можете пользоваться кабинетом, но заказы не будут приходить, пока админ не активирует ваш аккаунт.",
      company_doc_alert_title: "Не хватает некоторых документов компании",
      company_doc_alert_body: "Загрузите их ниже — уведомление исчезнет, как только админ их подтвердит.",
    },
    es: {
      nav_orders: "Pedidos", nav_company: "Empresa", nav_fleet: "Flota", nav_finance: "Finanzas", nav_account: "Cuenta",
      logout: "Cerrar sesión",

      home_eyebrow: "Portal de socios", home_title: "Portal de socios de flota",
      home_lede: "Registra tu empresa, sube tus documentos y recibe pedidos asignados directamente a ti.",
      home_new_title: "Nuevo socio", home_new_sub: "Crea tu cuenta, añade tus vehículos y conductores, y sube los documentos requeridos.",
      home_new_btn: "Crear cuenta de socio",
      home_existing_title: "Ya registrado", home_existing_sub: "Inicia sesión para ver tus pedidos y gestionar tus documentos.",
      home_existing_btn: "Iniciar sesión",
      home_how_title: "Cómo funciona", home_how_sub: "Todo lo que un socio necesita para activarse y empezar a recibir pedidos.",
      home_f1_title: "Asignación directa de pedidos", home_f1_body: "Los pedidos llegan directo a tu panel. Acepta o rechaza antes de que se le pregunte a otro — sin subastas ni intermediarios.",
      home_f2_title: "Cobertura en varios países", home_f2_body: "Regístrate una vez y añade cada ciudad y aeropuerto que realmente cubren tus vehículos.",
      home_f3_title: "Seguimiento claro de documentos", home_f3_body: "Sube los documentos de vehículos y conductores una vez y sigue el estado de revisión de cada uno desde tu cuenta.",

      login_eyebrow: "Portal de socios", login_title: "Iniciar sesión",
      login_lede_pre: "¿Aún no te has registrado? ", login_lede_link: "Crea una cuenta de socio", login_lede_post: ".",
      login_email: "Correo electrónico", login_password: "Contraseña", login_btn: "Iniciar sesión",

      register_eyebrow: "Registro de socio", register_title: "Crea tu cuenta de socio",
      register_lede_pre: "Registra la cuenta de tu empresa. Añadirás tus vehículos, conductores y documentos desde tu panel justo después de iniciar sesión. ¿Ya estás registrado? ",
      register_lede_link: "Iniciar sesión", register_lede_post: ".",
      register_section_account_title: "Empresa y cuenta", register_section_account_sub: "Se usa para iniciar sesión en tu panel de socio justo después de registrarte.",
      register_company_name: "Nombre de la empresa", register_email: "Correo electrónico", register_phone: "Teléfono de contacto", register_password: "Contraseña",
      register_country: "País", register_city: "Ciudad de servicio",
      register_airports_label: "Aeropuertos que cubres", register_airports_sub: "Selecciona un país y una ciudad arriba, luego busca y añade cada aeropuerto que cubre tu empresa.",
      register_vehicle1_title: "Vehículo 1", register_vehicle2_title: "Vehículo 2", register_vehicle2_sub: "Solo si esta empresa tiene un segundo vehículo — si no, déjalo en blanco.",
      register_plate: "Matrícula",
      register_driver1_title: "Conductor 1", register_driver2_title: "Conductor 2", register_driver2_sub: "Solo si esta empresa tiene un segundo conductor — si no, déjalo en blanco.",
      register_driver_name: "Nombre del conductor",
      register_other_title: "Otro documento", register_other_sub: "Opcional — cualquier cosa que no encaje arriba.", register_other_desc: "¿Qué es este documento?",
      register_submit_btn: "Crear cuenta",
      register_next_note: "A continuación: inicia sesión y añade tus vehículos, conductores y documentos desde el panel.",
      register_success_title: "Solicitud enviada", register_goto_login: "Ir a iniciar sesión",

      dash_orders_title: "Pedidos", dash_orders_sub: "Pedidos que te asignó el administrador. Acepta o rechaza antes de que se le pregunte a otro.",
      dash_company_title: "Empresa", dash_company_sub: "El perfil de tu empresa y los documentos que tenemos registrados.",
      dash_fleet_title: "Flota", dash_fleet_sub: "Gestiona tus vehículos y conductores. Haz clic en una tarjeta para editar los detalles y documentos.",
      dash_finance_title: "Finanzas", dash_finance_sub: "Tus viajes completados y ganancias. Cada pedido completado (incluidos los no-shows confirmados) se contabiliza aquí automáticamente.",
      fin_export_csv: "Exportar CSV", fin_print: "Imprimir", fin_th_route: "Ruta", fin_th_price: "Precio",
      trial_title: "Período de prueba", trial_sub: "Comienza automáticamente con tu primer pedido completado y dura 30 días.",
      fin_stat_noshows: "No-shows (confirmados)",
      dash_account_title: "Cuenta", dash_account_sub: "Los datos de tu empresa registrados",

      stat_new: "Nuevos", stat_accepted: "Aceptados", stat_completed: "Completados", stat_closed: "Rechazados / cancelados",

      th_order: "N.º de pedido", th_start: "Origen", th_dest: "Destino", th_date: "Fecha", th_time: "Hora",
      th_vehicle: "Vehículo", th_passengers: "Pasajeros", th_price: "Precio", th_action: "Acción",

      empty_new: "No hay pedidos nuevos ahora mismo.", empty_accepted: "Nada en curso ahora mismo.", empty_completed: "Aún no hay pedidos completados.",

      od_trip: "Viaje", od_passenger_price: "Pasajero y precio", od_vehicle_driver: "Vehículo y conductor", od_trip_progress: "Progreso del viaje",
      fl_date: "Fecha", fl_pickup_time: "Hora de recogida", fl_buffer_time: "Tiempo de espera", fl_vehicle_type: "Tipo de vehículo", fl_meet_greet: "Cartel de bienvenida",
      btn_accept: "Aceptar", btn_decline: "Rechazar", btn_save: "Guardar", btn_more: "Más", btn_back_to_orders: "Volver a pedidos",
      no_show_pending: "Reportado como no presentación del pasajero — pendiente de revisión.",
      report_no_show_btn: "Reportar no presentación del pasajero",

      stage_on_the_way: "En camino", stage_arrived: "Llegó al punto de recogida", stage_in_car: "Pasajero a bordo", stage_dropped_off: "Dejado en destino",

      company_details_title: "Datos de la empresa", company_documents_title: "Documentos de la empresa",
      company_documents_sub: "Haz clic en una casilla para subir un documento. Vuelve a hacer clic en cualquier momento para reemplazar el archivo.",
      other_documents_title: "Otros documentos", other_documents_sub: "Cualquier cosa que no encaje en las categorías anteriores",
      save_changes_btn: "Guardar cambios",

      fleet_vehicles_tab: "Vehículos", fleet_drivers_tab: "Conductores",

      account_id_label: "ID de cuenta", account_email_label: "Correo electrónico", account_company_label: "Empresa",
      account_country_label: "País", account_status_label: "Estado", account_since_label: "Miembro desde",
      contact_coverage_title: "Contacto y cobertura", contact_coverage_sub: "Solo lo ve nuestro equipo — mantenlo actualizado para que podamos contactarte y asignarte los pedidos correctos.",
      contact_phone_label: "Teléfono de contacto", city_of_service_label: "Ciudad de servicio", airports_you_cover_label: "Aeropuertos que cubres",
      language_label: "Idioma del panel",

      pending_banner_title: "Tus documentos todavía están en revisión.",
      pending_banner_body: "Puedes usar tu panel, pero no recibirás pedidos hasta que un administrador active tu cuenta.",
      company_doc_alert_title: "Todavía faltan algunos documentos de la empresa",
      company_doc_alert_body: "Súbelos abajo — este aviso desaparecerá cuando un administrador los apruebe.",
    },
    el: {
      nav_orders: "Παραγγελίες", nav_company: "Εταιρεία", nav_fleet: "Στόλος", nav_finance: "Οικονομικά", nav_account: "Λογαριασμός",
      logout: "Αποσύνδεση",

      home_eyebrow: "Πύλη συνεργατών", home_title: "Πύλη συνεργατών στόλου",
      home_lede: "Καταχωρίστε την εταιρεία σας, ανεβάστε τα έγγραφά σας και λάβετε παραγγελίες απευθείας σε εσάς.",
      home_new_title: "Νέος συνεργάτης", home_new_sub: "Δημιουργήστε λογαριασμό, προσθέστε οχήματα και οδηγούς και ανεβάστε τα απαιτούμενα έγγραφα.",
      home_new_btn: "Δημιουργία λογαριασμού συνεργάτη",
      home_existing_title: "Ήδη εγγεγραμμένος", home_existing_sub: "Συνδεθείτε για να δείτε τις παραγγελίες σας και να διαχειριστείτε τα έγγραφά σας.",
      home_existing_btn: "Σύνδεση",
      home_how_title: "Πώς λειτουργεί", home_how_sub: "Όλα όσα χρειάζεται ένας συνεργάτης για να ενεργοποιηθεί και να αρχίσει να λαμβάνει παραγγελίες.",
      home_f1_title: "Άμεση ανάθεση παραγγελιών", home_f1_body: "Οι παραγγελίες πηγαίνουν απευθείας στον πίνακά σας. Αποδεχτείτε ή απορρίψτε πριν ρωτηθεί κάποιος άλλος — χωρίς δημοπρασίες, χωρίς μεσάζοντες.",
      home_f2_title: "Κάλυψη σε πολλές χώρες", home_f2_body: "Εγγραφείτε μία φορά και καταχωρίστε κάθε πόλη και αεροδρόμιο που πραγματικά καλύπτουν τα οχήματά σας.",
      home_f3_title: "Σαφής παρακολούθηση εγγράφων", home_f3_body: "Ανεβάστε τα έγγραφα οχημάτων και οδηγών μία φορά και παρακολουθήστε την κατάσταση ελέγχου για κάθε θέση μέσα από τον λογαριασμό σας.",

      login_eyebrow: "Πύλη συνεργατών", login_title: "Σύνδεση",
      login_lede_pre: "Δεν έχετε εγγραφεί ακόμα; ", login_lede_link: "Δημιουργήστε λογαριασμό συνεργάτη", login_lede_post: ".",
      login_email: "Email", login_password: "Κωδικός πρόσβασης", login_btn: "Σύνδεση",

      register_eyebrow: "Εγγραφή συνεργάτη", register_title: "Δημιουργήστε τον λογαριασμό συνεργάτη σας",
      register_lede_pre: "Καταχωρίστε τον λογαριασμό της εταιρείας σας. Θα προσθέσετε οχήματα, οδηγούς και έγγραφα από τον πίνακά σας αμέσως μετά τη σύνδεση. Έχετε ήδη εγγραφεί; ",
      register_lede_link: "Σύνδεση", register_lede_post: ".",
      register_section_account_title: "Εταιρεία και λογαριασμός", register_section_account_sub: "Χρησιμοποιείται για σύνδεση στον πίνακα συνεργάτη αμέσως μετά την εγγραφή.",
      register_company_name: "Όνομα εταιρείας", register_email: "Email", register_phone: "Τηλέφωνο επικοινωνίας", register_password: "Κωδικός πρόσβασης",
      register_country: "Χώρα", register_city: "Πόλη εξυπηρέτησης",
      register_airports_label: "Αεροδρόμια που καλύπτετε", register_airports_sub: "Επιλέξτε χώρα και πόλη παραπάνω, έπειτα αναζητήστε και προσθέστε κάθε αεροδρόμιο που εξυπηρετεί η εταιρεία σας.",
      register_vehicle1_title: "Όχημα 1", register_vehicle2_title: "Όχημα 2", register_vehicle2_sub: "Μόνο αν η εταιρεία έχει δεύτερο όχημα — διαφορετικά αφήστε το κενό.",
      register_plate: "Αριθμός πινακίδας",
      register_driver1_title: "Οδηγός 1", register_driver2_title: "Οδηγός 2", register_driver2_sub: "Μόνο αν η εταιρεία έχει δεύτερο οδηγό — διαφορετικά αφήστε το κενό.",
      register_driver_name: "Όνομα οδηγού",
      register_other_title: "Άλλο έγγραφο", register_other_sub: "Προαιρετικό — οτιδήποτε δεν ταιριάζει παραπάνω.", register_other_desc: "Τι είδους έγγραφο είναι αυτό;",
      register_submit_btn: "Δημιουργία λογαριασμού",
      register_next_note: "Επόμενο βήμα: συνδεθείτε και προσθέστε οχήματα, οδηγούς και έγγραφα από τον πίνακα.",
      register_success_title: "Η αίτηση υποβλήθηκε", register_goto_login: "Μετάβαση στη σύνδεση",

      dash_orders_title: "Παραγγελίες", dash_orders_sub: "Παραγγελίες που σας ανέθεσε ο διαχειριστής. Αποδεχτείτε ή απορρίψτε πριν ρωτηθεί κάποιος άλλος.",
      dash_company_title: "Εταιρεία", dash_company_sub: "Το προφίλ της εταιρείας σας και τα έγγραφα που έχουμε καταχωρήσει.",
      dash_fleet_title: "Στόλος", dash_fleet_sub: "Διαχειριστείτε τα οχήματα και τους οδηγούς σας. Κάντε κλικ σε μια κάρτα για να επεξεργαστείτε στοιχεία και έγγραφα.",
      dash_finance_title: "Οικονομικά", dash_finance_sub: "Οι ολοκληρωμένες διαδρομές και τα κέρδη σας. Κάθε ολοκληρωμένη παραγγελία (συμπεριλαμβανομένων των επιβεβαιωμένων no-show) προσμετράται εδώ αυτόματα.",
      fin_export_csv: "Εξαγωγή CSV", fin_print: "Εκτύπωση", fin_th_route: "Διαδρομή", fin_th_price: "Τιμή",
      trial_title: "Δοκιμαστική περίοδος", trial_sub: "Ξεκινά αυτόματα με την πρώτη ολοκληρωμένη παραγγελία σας και διαρκεί 30 ημέρες.",
      fin_stat_noshows: "Μη εμφανίσεις (επιβεβαιωμένες)",
      dash_account_title: "Λογαριασμός", dash_account_sub: "Τα καταχωρημένα στοιχεία της εταιρείας σας",

      stat_new: "Νέες", stat_accepted: "Αποδεκτές", stat_completed: "Ολοκληρωμένες", stat_closed: "Απορριφθείσες / ακυρωμένες",

      th_order: "Αρ. παραγγελίας", th_start: "Σημείο έναρξης", th_dest: "Προορισμός", th_date: "Ημερομηνία", th_time: "Ώρα",
      th_vehicle: "Όχημα", th_passengers: "Επιβάτες", th_price: "Τιμή", th_action: "Ενέργεια",

      empty_new: "Καμία νέα παραγγελία αυτή τη στιγμή.", empty_accepted: "Τίποτα σε εξέλιξη αυτή τη στιγμή.", empty_completed: "Καμία ολοκληρωμένη παραγγελία ακόμα.",

      od_trip: "Διαδρομή", od_passenger_price: "Επιβάτης & τιμή", od_vehicle_driver: "Όχημα & οδηγός", od_trip_progress: "Πρόοδος διαδρομής",
      fl_date: "Ημερομηνία", fl_pickup_time: "Ώρα παραλαβής", fl_buffer_time: "Χρόνος αναμονής", fl_vehicle_type: "Τύπος οχήματος", fl_meet_greet: "Πινακίδα υποδοχής",
      btn_accept: "Αποδοχή", btn_decline: "Απόρριψη", btn_save: "Αποθήκευση", btn_more: "Περισσότερα", btn_back_to_orders: "Πίσω στις παραγγελίες",
      no_show_pending: "Αναφέρθηκε ως μη εμφάνιση επιβάτη — σε αναμονή ελέγχου.",
      report_no_show_btn: "Αναφορά μη εμφάνισης επιβάτη",

      stage_on_the_way: "Καθ' οδόν", stage_arrived: "Έφτασε στο σημείο παραλαβής", stage_in_car: "Ο επιβάτης επιβιβάστηκε", stage_dropped_off: "Αποβιβάστηκε",

      company_details_title: "Στοιχεία εταιρείας", company_documents_title: "Έγγραφα εταιρείας",
      company_documents_sub: "Κάντε κλικ σε ένα πλαίσιο για να ανεβάσετε έγγραφο. Κάντε ξανά κλικ οποτεδήποτε για να αντικαταστήσετε το αρχείο.",
      other_documents_title: "Άλλα έγγραφα", other_documents_sub: "Οτιδήποτε δεν ταιριάζει στις παραπάνω κατηγορίες",
      save_changes_btn: "Αποθήκευση αλλαγών",

      fleet_vehicles_tab: "Οχήματα", fleet_drivers_tab: "Οδηγοί",

      account_id_label: "ID λογαριασμού", account_email_label: "Email", account_company_label: "Εταιρεία",
      account_country_label: "Χώρα", account_status_label: "Κατάσταση", account_since_label: "Μέλος από",
      contact_coverage_title: "Επικοινωνία & κάλυψη", contact_coverage_sub: "Ορατό μόνο στην ομάδα μας — κρατήστε το ενημερωμένο ώστε να μπορούμε να επικοινωνούμε μαζί σας και να σας στέλνουμε τις σωστές παραγγελίες.",
      contact_phone_label: "Τηλέφωνο επικοινωνίας", city_of_service_label: "Πόλη εξυπηρέτησης", airports_you_cover_label: "Αεροδρόμια που καλύπτετε",
      language_label: "Γλώσσα πίνακα",

      pending_banner_title: "Τα έγγραφά σας βρίσκονται ακόμη υπό έλεγχο.",
      pending_banner_body: "Μπορείτε να χρησιμοποιείτε τον πίνακά σας, αλλά δεν θα λαμβάνετε παραγγελίες μέχρι ένας διαχειριστής να ενεργοποιήσει τον λογαριασμό σας.",
      company_doc_alert_title: "Λείπουν ακόμη ορισμένα έγγραφα εταιρείας",
      company_doc_alert_body: "Ανεβάστε τα παρακάτω — η ειδοποίηση θα εξαφανιστεί μόλις τα εγκρίνει ένας διαχειριστής.",
    },
    fr: {
      nav_orders: "Commandes", nav_company: "Entreprise", nav_fleet: "Flotte", nav_finance: "Finances", nav_account: "Compte",
      logout: "Déconnexion",

      home_eyebrow: "Portail partenaires", home_title: "Portail partenaires flotte",
      home_lede: "Inscrivez votre entreprise, téléversez vos documents et recevez des commandes qui vous sont directement attribuées.",
      home_new_title: "Nouveau partenaire", home_new_sub: "Créez votre compte, ajoutez vos véhicules et chauffeurs, et téléversez les documents requis.",
      home_new_btn: "Créer un compte partenaire",
      home_existing_title: "Déjà inscrit", home_existing_sub: "Connectez-vous pour voir vos commandes et gérer vos documents.",
      home_existing_btn: "Se connecter",
      home_how_title: "Comment ça marche", home_how_sub: "Tout ce dont un partenaire a besoin pour être actif et commencer à recevoir des commandes.",
      home_f1_title: "Attribution directe des commandes", home_f1_body: "Les commandes arrivent directement sur votre tableau de bord. Acceptez ou refusez avant qu'un autre partenaire ne soit sollicité — sans enchères ni intermédiaire.",
      home_f2_title: "Couverture multi-pays", home_f2_body: "Inscrivez-vous une fois, puis indiquez chaque ville et aéroport réellement couverts par vos véhicules.",
      home_f3_title: "Suivi clair des documents", home_f3_body: "Téléversez une fois les documents des véhicules et des chauffeurs, et suivez le statut de vérification de chaque élément depuis votre compte.",

      login_eyebrow: "Portail partenaires", login_title: "Connexion",
      login_lede_pre: "Pas encore inscrit ? ", login_lede_link: "Créer un compte partenaire", login_lede_post: ".",
      login_email: "Email", login_password: "Mot de passe", login_btn: "Se connecter",

      register_eyebrow: "Inscription partenaire", register_title: "Créez votre compte partenaire",
      register_lede_pre: "Inscrivez le compte de votre entreprise. Vous ajouterez vos véhicules, chauffeurs et documents depuis votre tableau de bord juste après connexion. Déjà inscrit ? ",
      register_lede_link: "Se connecter", register_lede_post: ".",
      register_section_account_title: "Entreprise et compte", register_section_account_sub: "Utilisé pour vous connecter à votre tableau de bord partenaire juste après l'inscription.",
      register_company_name: "Nom de l'entreprise", register_email: "Email", register_phone: "Téléphone de contact", register_password: "Mot de passe",
      register_country: "Pays", register_city: "Ville de service",
      register_airports_label: "Aéroports que vous couvrez", register_airports_sub: "Sélectionnez un pays et une ville ci-dessus, puis recherchez et ajoutez chaque aéroport desservi par votre entreprise.",
      register_vehicle1_title: "Véhicule 1", register_vehicle2_title: "Véhicule 2", register_vehicle2_sub: "Seulement si l'entreprise a un second véhicule — sinon laissez vide.",
      register_plate: "Plaque d'immatriculation",
      register_driver1_title: "Chauffeur 1", register_driver2_title: "Chauffeur 2", register_driver2_sub: "Seulement si l'entreprise a un second chauffeur — sinon laissez vide.",
      register_driver_name: "Nom du chauffeur",
      register_other_title: "Autre document", register_other_sub: "Facultatif — tout ce qui ne correspond pas ci-dessus.", register_other_desc: "De quel document s'agit-il ?",
      register_submit_btn: "Créer le compte",
      register_next_note: "Ensuite : connectez-vous et ajoutez vos véhicules, chauffeurs et documents depuis le tableau de bord.",
      register_success_title: "Candidature envoyée", register_goto_login: "Aller à la connexion",

      dash_orders_title: "Commandes", dash_orders_sub: "Commandes qui vous sont attribuées par l'administrateur. Acceptez ou refusez avant qu'un autre partenaire ne soit sollicité.",
      dash_company_title: "Entreprise", dash_company_sub: "Le profil de votre entreprise et les documents que nous avons en dossier.",
      dash_fleet_title: "Flotte", dash_fleet_sub: "Gérez vos véhicules et chauffeurs. Cliquez sur une carte pour modifier les détails et documents.",
      dash_finance_title: "Finances", dash_finance_sub: "Vos trajets terminés et vos revenus. Chaque commande terminée (y compris les no-shows confirmés) est comptabilisée ici automatiquement.",
      fin_export_csv: "Exporter en CSV", fin_print: "Imprimer", fin_th_route: "Trajet", fin_th_price: "Prix",
      trial_title: "Période d'essai", trial_sub: "Commence automatiquement avec votre première commande terminée et dure 30 jours.",
      fin_stat_noshows: "No-shows (confirmés)",
      dash_account_title: "Compte", dash_account_sub: "Les informations de votre entreprise en dossier",

      stat_new: "Nouvelles", stat_accepted: "Acceptées", stat_completed: "Terminées", stat_closed: "Refusées / annulées",

      th_order: "N° commande", th_start: "Départ", th_dest: "Destination", th_date: "Date", th_time: "Heure",
      th_vehicle: "Véhicule", th_passengers: "Passagers", th_price: "Prix", th_action: "Action",

      empty_new: "Aucune nouvelle commande pour le moment.", empty_accepted: "Rien en cours pour le moment.", empty_completed: "Aucune commande terminée pour le moment.",

      od_trip: "Trajet", od_passenger_price: "Passager & prix", od_vehicle_driver: "Véhicule & chauffeur", od_trip_progress: "Progression du trajet",
      fl_date: "Date", fl_pickup_time: "Heure de prise en charge", fl_buffer_time: "Temps d'attente", fl_vehicle_type: "Type de véhicule", fl_meet_greet: "Pancarte d'accueil",
      btn_accept: "Accepter", btn_decline: "Refuser", btn_save: "Enregistrer", btn_more: "Plus", btn_back_to_orders: "Retour aux commandes",
      no_show_pending: "Signalé comme no-show du passager — en attente de vérification.",
      report_no_show_btn: "Signaler un no-show du passager",

      stage_on_the_way: "En route", stage_arrived: "Arrivé au point de prise en charge", stage_in_car: "Passager à bord", stage_dropped_off: "Dépose effectuée",

      company_details_title: "Détails de l'entreprise", company_documents_title: "Documents de l'entreprise",
      company_documents_sub: "Cliquez sur une case pour téléverser un document. Cliquez à nouveau à tout moment pour remplacer le fichier.",
      other_documents_title: "Autres documents", other_documents_sub: "Tout ce qui ne correspond pas aux catégories ci-dessus",
      save_changes_btn: "Enregistrer les modifications",

      fleet_vehicles_tab: "Véhicules", fleet_drivers_tab: "Chauffeurs",

      account_id_label: "ID du compte", account_email_label: "Email", account_company_label: "Entreprise",
      account_country_label: "Pays", account_status_label: "Statut", account_since_label: "Membre depuis",
      contact_coverage_title: "Contact & zone de couverture", contact_coverage_sub: "Visible uniquement par notre équipe — tenez ces informations à jour afin que nous puissions vous contacter et vous attribuer les bonnes commandes.",
      contact_phone_label: "Téléphone de contact", city_of_service_label: "Ville de service", airports_you_cover_label: "Aéroports que vous couvrez",
      language_label: "Langue du tableau de bord",

      pending_banner_title: "Vos documents sont encore en cours de vérification.",
      pending_banner_body: "Vous pouvez utiliser votre tableau de bord, mais vous ne recevrez pas de commandes tant qu'un administrateur n'a pas activé votre compte.",
      company_doc_alert_title: "Certains documents de l'entreprise manquent encore",
      company_doc_alert_body: "Téléversez-les ci-dessous — cet avis disparaîtra une fois qu'un administrateur les aura approuvés.",
    },
    pt: {
      nav_orders: "Pedidos", nav_company: "Empresa", nav_fleet: "Frota", nav_finance: "Finanças", nav_account: "Conta",
      logout: "Sair",

      home_eyebrow: "Portal de parceiros", home_title: "Portal de parceiros da frota",
      home_lede: "Registe a sua empresa, carregue os seus documentos e receba pedidos atribuídos diretamente a si.",
      home_new_title: "Novo parceiro", home_new_sub: "Crie a sua conta, adicione os seus veículos e motoristas, e carregue os documentos necessários.",
      home_new_btn: "Criar conta de parceiro",
      home_existing_title: "Já registado", home_existing_sub: "Inicie sessão para ver os seus pedidos e gerir os seus documentos.",
      home_existing_btn: "Iniciar sessão",
      home_how_title: "Como funciona", home_how_sub: "Tudo o que um parceiro precisa para ficar ativo e começar a receber pedidos.",
      home_f1_title: "Atribuição direta de pedidos", home_f1_body: "Os pedidos vão diretamente para o seu painel. Aceite ou recuse antes que outro parceiro seja contactado — sem leilões nem intermediários.",
      home_f2_title: "Cobertura em vários países", home_f2_body: "Registe-se uma vez e indique todas as cidades e aeroportos que os seus veículos realmente cobrem.",
      home_f3_title: "Acompanhamento claro de documentos", home_f3_body: "Carregue os documentos de veículos e motoristas uma vez e acompanhe o estado de revisão de cada um diretamente na sua conta.",

      login_eyebrow: "Portal de parceiros", login_title: "Iniciar sessão",
      login_lede_pre: "Ainda não se registou? ", login_lede_link: "Criar uma conta de parceiro", login_lede_post: ".",
      login_email: "Email", login_password: "Palavra-passe", login_btn: "Iniciar sessão",

      register_eyebrow: "Registo de parceiro", register_title: "Crie a sua conta de parceiro",
      register_lede_pre: "Registe a conta da sua empresa. Irá adicionar os seus veículos, motoristas e documentos no seu painel logo após iniciar sessão. Já está registado? ",
      register_lede_link: "Iniciar sessão", register_lede_post: ".",
      register_section_account_title: "Empresa e conta", register_section_account_sub: "Usado para iniciar sessão no seu painel de parceiro logo após o registo.",
      register_company_name: "Nome da empresa", register_email: "Email", register_phone: "Telefone de contacto", register_password: "Palavra-passe",
      register_country: "País", register_city: "Cidade de serviço",
      register_airports_label: "Aeroportos que cobre", register_airports_sub: "Selecione um país e uma cidade acima, depois procure e adicione todos os aeroportos que a sua empresa serve aí.",
      register_vehicle1_title: "Veículo 1", register_vehicle2_title: "Veículo 2", register_vehicle2_sub: "Só se esta empresa tiver um segundo veículo — caso contrário, deixe em branco.",
      register_plate: "Matrícula",
      register_driver1_title: "Motorista 1", register_driver2_title: "Motorista 2", register_driver2_sub: "Só se esta empresa tiver um segundo motorista — caso contrário, deixe em branco.",
      register_driver_name: "Nome do motorista",
      register_other_title: "Outro documento", register_other_sub: "Opcional — qualquer coisa que não se enquadre acima.", register_other_desc: "Que documento é este?",
      register_submit_btn: "Criar conta",
      register_next_note: "A seguir: inicie sessão e adicione os seus veículos, motoristas e documentos no painel.",
      register_success_title: "Candidatura enviada", register_goto_login: "Ir para iniciar sessão",

      dash_orders_title: "Pedidos", dash_orders_sub: "Pedidos atribuídos a si pelo administrador. Aceite ou recuse antes que outro parceiro seja contactado.",
      dash_company_title: "Empresa", dash_company_sub: "O perfil da sua empresa e os documentos que temos registados.",
      dash_fleet_title: "Frota", dash_fleet_sub: "Faça a gestão dos seus veículos e motoristas. Clique num cartão para editar detalhes e documentos.",
      dash_finance_title: "Finanças", dash_finance_sub: "As suas viagens concluídas e ganhos. Cada pedido concluído (incluindo no-shows confirmados) é contabilizado aqui automaticamente.",
      fin_export_csv: "Exportar CSV", fin_print: "Imprimir", fin_th_route: "Trajeto", fin_th_price: "Preço",
      trial_title: "Período de teste", trial_sub: "Começa automaticamente com o seu primeiro pedido concluído e dura 30 dias.",
      fin_stat_noshows: "Não comparências (confirmadas)",
      dash_account_title: "Conta", dash_account_sub: "Os dados da sua empresa em registo",

      stat_new: "Novos", stat_accepted: "Aceites", stat_completed: "Concluídos", stat_closed: "Recusados / cancelados",

      th_order: "N.º do pedido", th_start: "Origem", th_dest: "Destino", th_date: "Data", th_time: "Hora",
      th_vehicle: "Veículo", th_passengers: "Passageiros", th_price: "Preço", th_action: "Ação",

      empty_new: "Sem pedidos novos neste momento.", empty_accepted: "Nada em curso neste momento.", empty_completed: "Ainda não há pedidos concluídos.",

      od_trip: "Viagem", od_passenger_price: "Passageiro e preço", od_vehicle_driver: "Veículo e motorista", od_trip_progress: "Progresso da viagem",
      fl_date: "Data", fl_pickup_time: "Hora de recolha", fl_buffer_time: "Tempo de espera", fl_vehicle_type: "Tipo de veículo", fl_meet_greet: "Placa de boas-vindas",
      btn_accept: "Aceitar", btn_decline: "Recusar", btn_save: "Guardar", btn_more: "Mais", btn_back_to_orders: "Voltar aos pedidos",
      no_show_pending: "Reportado como não comparência do passageiro — a aguardar revisão.",
      report_no_show_btn: "Reportar não comparência do passageiro",

      stage_on_the_way: "A caminho", stage_arrived: "Chegou ao local de recolha", stage_in_car: "Passageiro a bordo", stage_dropped_off: "Largada efetuada",

      company_details_title: "Dados da empresa", company_documents_title: "Documentos da empresa",
      company_documents_sub: "Clique numa caixa para carregar um documento. Clique novamente a qualquer momento para substituir o ficheiro.",
      other_documents_title: "Outros documentos", other_documents_sub: "Qualquer coisa que não se enquadre nas categorias acima",
      save_changes_btn: "Guardar alterações",

      fleet_vehicles_tab: "Veículos", fleet_drivers_tab: "Motoristas",

      account_id_label: "ID da conta", account_email_label: "Email", account_company_label: "Empresa",
      account_country_label: "País", account_status_label: "Estado", account_since_label: "Membro desde",
      contact_coverage_title: "Contacto e cobertura", contact_coverage_sub: "Visível apenas para a nossa equipa — mantenha atualizado para podermos contactá-lo e encaminhar os pedidos certos para si.",
      contact_phone_label: "Telefone de contacto", city_of_service_label: "Cidade de serviço", airports_you_cover_label: "Aeroportos que cobre",
      language_label: "Idioma do painel",

      pending_banner_title: "Os seus documentos ainda estão em análise.",
      pending_banner_body: "Pode usar o seu painel, mas não vai receber pedidos até um administrador ativar a sua conta.",
      company_doc_alert_title: "Ainda faltam alguns documentos da empresa",
      company_doc_alert_body: "Carregue-os abaixo — este aviso desaparece assim que um administrador os aprovar.",
    },
  };

  function detectDefaultLang() {
    try {
      var nav = (global.navigator && (global.navigator.language || global.navigator.userLanguage)) || "en";
      var code = nav.slice(0, 2).toLowerCase();
      return LANGS.indexOf(code) !== -1 ? code : "en";
    } catch (e) { return "en"; }
  }

  function getLang() {
    try {
      var saved = global.localStorage && global.localStorage.getItem(STORAGE_KEY);
      if (saved && LANGS.indexOf(saved) !== -1) return saved;
    } catch (e) { /* ignore */ }
    return detectDefaultLang();
  }

  function setLang(code) {
    if (LANGS.indexOf(code) === -1) return;
    try { global.localStorage && global.localStorage.setItem(STORAGE_KEY, code); } catch (e) { /* ignore */ }
  }

  function t(key) {
    var lang = getLang();
    var d = DICT[lang] || DICT.en;
    if (d[key] != null) return d[key];
    if (DICT.en[key] != null) return DICT.en[key];
    return key;
  }

  function apply(root) {
    root = root || document;
    var nodes = root.querySelectorAll("[data-i18n]");
    for (var i = 0; i < nodes.length; i++) {
      nodes[i].textContent = t(nodes[i].getAttribute("data-i18n"));
    }
    var htmlNodes = root.querySelectorAll("[data-i18n-html]");
    for (var j = 0; j < htmlNodes.length; j++) {
      htmlNodes[j].innerHTML = t(htmlNodes[j].getAttribute("data-i18n-html"));
    }
    var phNodes = root.querySelectorAll("[data-i18n-placeholder]");
    for (var k = 0; k < phNodes.length; k++) {
      phNodes[k].setAttribute("placeholder", t(phNodes[k].getAttribute("data-i18n-placeholder")));
    }
    var titleNodes = root.querySelectorAll("[data-i18n-title]");
    for (var m = 0; m < titleNodes.length; m++) {
      titleNodes[m].setAttribute("title", t(titleNodes[m].getAttribute("data-i18n-title")));
    }
  }

  function renderLangSwitcher(containerId, onChange) {
    var el = document.getElementById(containerId);
    if (!el) return;
    var current = getLang();
    el.innerHTML = LANGS.map(function (code) {
      return '<option value="' + code + '"' + (code === current ? " selected" : "") + ">" + LANG_NAMES[code] + "</option>";
    }).join("");
    el.addEventListener("change", function () {
      setLang(el.value);
      apply(document);
      if (typeof onChange === "function") onChange(el.value);
    });
  }

  global.I18N = {
    LANGS: LANGS, LANG_NAMES: LANG_NAMES,
    getLang: getLang, setLang: setLang,
    t: t, apply: apply,
    renderLangSwitcher: renderLangSwitcher,
  };
})(typeof window !== "undefined" ? window : this);
