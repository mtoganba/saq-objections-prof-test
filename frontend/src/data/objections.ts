import type {
  CommissionAttendanceMember,
  CommissionMember,
  NewCaseInput,
  ObjectionCase,
} from "../types";

export const COMMISSION_ATTENDANCE_MEMBERS: CommissionAttendanceMember[] = [
  { id: "alieva-at", name: "Директор ДМБУА Алиева А.Т." },
  { id: "urkhumbayeva-tzh", name: "Руководитель управления ДМБУА Урхумбаева Т.Ж." },
  { id: "abetova-ku", name: "Заместитель директора ДЮС Абетова К.У." },
  { id: "kenbeil-dm", name: "Вице-министр Кенбеил Д.М." },
  { id: "kurenbek-shb", name: "Директор ДАВГА Күреңбек тегі Ш.Б." },
  { id: "akhmetov-rk", name: "Заместитель Председателя КВГА Ахметов Р.К." },
  { id: "turgeldiev-ra", name: "Заместитель председателя КВГА Тургелдиев Р.А." },
  { id: "seitov-et", name: "Директор ДЗГЗ Сеитов Е.Т." },
  { id: "kaskenova-i", name: "Руководитель управления ДЗГЗ Каскенова И." },
  { id: "umertayev-bk", name: "Представитель НПО «Атамекен» Умертаев Б.К." },
  { id: "gusmanova-ab", name: "Представитель АО «ЩЮЛ Застройщики» Гусманова А.Б." },
  { id: "ten-vs", name: "Представитель АО «ОЮЛ застройщиков» ТЭН В.С." },
  { id: "mikrokov-v", name: "Представитель ОЮЛ «Микроков» В." },
];
export function members(): CommissionMember[] {
  return [
    { id: "chair", name: "Председатель комиссии" },
    { id: "deputy", name: "Заместитель председателя" },
    { id: "member1", name: "Член комиссии № 1" },
    { id: "member2", name: "Член комиссии № 2" },
    { id: "member3", name: "Член комиссии № 3" },
    { id: "member4", name: "Представитель НПП «Атамекен»" },
    { id: "member5", name: "Представитель отраслевой ассоциации" },
  ].map((m) => ({ ...m, present: true, recused: false, reason: "" }));
}
export function makeCase(c: NewCaseInput): ObjectionCase {
  const receivedViaSaq = c.channel === "SAQ";
  return {
    ...c,
    status: receivedViaSaq ? "received" : "accepted",
    assignee: receivedViaSaq ? "Не назначен" : "Исполнитель рабочего органа",
    unread: receivedViaSaq,
    extensionDays: 0,
    pauseDays: 0,
    documents: [],
    requests: [],
    members: members(),
    history: [
      {
        date: c.registered,
        actor: "Объект",
        title: receivedViaSaq
          ? "Обращение поступило через SAQ"
          : "Обращение создано вручную",
        text: receivedViaSaq
          ? "Обращение направлено директору ДАВГА для выбора исполнителя рабочего органа."
          : "Обращение зарегистрировано и сразу направлено на формирование запроса.",
      },
    ],
  };
}

/**
 * Общее тестовое обращение хранится в исходных данных приложения, а не в
 * локальном хранилище конкретного браузера.
 */
export function sharedAuditObjection(): ObjectionCase {
  const c = makeCase({
    id: "В-2026-001",
    type: "audit",
    appealType: "Возражение на аудиторский отчет",
    appealNumber: "В-1",
    appealDate: "2026-09-08",
    org: 'ТОО "Объект заявителя"',
    bin: "111111111111",
    applicantIdentifierType: "БИН",
    address: "город Астана, район Есиль",
    applicant: "",
    registered: "2026-09-08",
    filed: "2026-09-08",
    channel: "SAQ",
    issuer: "ДВГА по г. Астана",
    authority: "Апелляционная комиссия при Министерстве финансов РК",
    document: {
      number: "А-25",
      date: "2026-09-03",
      received: "2026-09-08",
      name: "Аудиторский отчет",
    },
    agendaDetails: {
      auditObjectName: 'АО "Объект аудита"',
      auditObjectBin: "222222222222",
      applicantIsAuditObjectRepresentative: true,
    },
    amount: 0,
    request:
      "Требования заявителя изложены в приложенном документе «Требования заявителя».",
    issues: [
      {
        id: "audit-objection-point-1",
        number: "1",
        title: "Касательно выполнения работ",
        finding: "",
        argument:
          "Работы выполнены и подтверждаются исполнительной документацией. Просим пересмотреть вывод о неподтверждённом объёме.",
        evidence: "Доказательства.docx",
        amount: 0,
        disputed: true,
      },
      {
        id: "audit-objection-point-5",
        number: "5",
        title: "Отмечено несвоевременное отражение имущества",
        finding: "",
        argument:
          "Часть имущества отражена в учёте до окончания аудита. Просим уточнить сумму и квалификацию нарушения.",
        evidence: "Доказательства.docx",
        amount: 0,
        disputed: true,
      },
    ],
  });
  c.documents = [
    {
      name: "Доверенность.docx",
      filename: "Доверенность.docx",
      kind: "attachment",
      text: "Доверенность представителя",
      author: "Заявитель",
      date: "2026-09-08",
      dataUrl: "/test-documents/power-of-attorney.docx",
    },
    {
      name: "Требования заявителя.docx",
      filename: "Требования заявителя.docx",
      kind: "attachment",
      text: "Требования заявителя",
      author: "Заявитель",
      date: "2026-09-08",
      dataUrl: "/test-documents/applicant-requirements.docx",
    },
    {
      name: "Доказательства.docx",
      filename: "Доказательства.docx",
      kind: "attachment",
      text: "Доказательства по оспариваемым пунктам 1 и 5",
      author: "Заявитель",
      date: "2026-09-08",
      dataUrl: "/test-documents/audit-evidence.docx",
    },
  ];
  c.history.push(
    {
      date: "2026-09-08",
      actor: "Заявитель",
      title: "Добавлена доверенность представителя",
      text: "Доверенность.docx",
    },
    {
      date: "2026-09-08",
      actor: "Заявитель",
      title: "Добавлены требования заявителя",
      text: "Требования заявителя.docx",
    },
    {
      date: "2026-09-08",
      actor: "Заявитель",
      title: "Добавлены доказательства по оспариваемым пунктам",
      text: "Доказательства.docx",
    },
  );
  return c;
}

/**
 * Общее тестовое заявление, зарегистрированное из ОДО.
 * Хранится в исходных данных приложения, чтобы карточка была доступна
 * после публикации в любом новом браузере, а не только в localStorage.
 */
export function sharedStatementApplication(): ObjectionCase {
  const c = makeCase({
    id: "З-2026-002",
    type: "control",
    appealType: "Заявление",
    appealNumber: "002-ОДО",
    appealDate: "2026-09-03",
    org: 'Товарищество с ограниченной ответственностью "Building group"',
    bin: "000000000001",
    applicantIdentifierType: "БИН",
    address: "город Астана",
    applicant: "",
    registered: "2026-09-08",
    filed: "2026-09-08",
    channel: "ОДО",
    issuer: "КВГА",
    authority: "Вышестоящий орган — определить компетенцию",
    document: {
      number: "",
      date: "2026-09-03",
      received: "2026-09-08",
      name: "Оспариваемый документ",
    },
    agendaDetails: {
      auditObjectName:
        'Товарищество с ограниченной ответственностью "Building group"',
      auditObjectBin: "000000000001",
      applicantIsAuditObjectRepresentative: false,
    },
    amount: 0,
    request: "о расчете сметы по стройке здания",
    issues: [
      {
        id: "statement-point-4",
        number: "4",
        title: "Коэффициент использован неправильно",
        finding: "",
        argument:
          "Согласно НПА коэффициент в 2026 году увеличен, в связи с этим расчет был неверен.",
        evidence: "Доказательства 4.docx",
        amount: 0,
        disputed: true,
      },
      {
        id: "statement-point-8",
        number: "8",
        title: "Отчет не рассмотрен в полном объеме",
        finding: "",
        argument: "Отчет не рассмотрен в полном объеме после аудита.",
        evidence: "Доказательства 8.docx",
        amount: 0,
        disputed: true,
      },
    ],
  });
  c.documents = [
    {
      name: "Требования заявителя(1).docx",
      filename: "Требования заявителя(1).docx",
      kind: "attachment",
      text: "Требования заявителя",
      author: "Заявитель",
      date: "2026-09-08",
      dataUrl: "/test-documents/statement-requirements.docx",
    },
    {
      name: "Доказательства 4.docx",
      filename: "Доказательства 4.docx",
      kind: "attachment",
      text: "Доказательства по оспариваемому пункту 4",
      author: "Заявитель",
      date: "2026-09-08",
      dataUrl: "/test-documents/statement-evidence-4.docx",
    },
    {
      name: "Доказательства 8.docx",
      filename: "Доказательства 8.docx",
      kind: "attachment",
      text: "Доказательства по оспариваемому пункту 8",
      author: "Заявитель",
      date: "2026-09-08",
      dataUrl: "/test-documents/statement-evidence-8.docx",
    },
  ];
  c.history.push(
    {
      date: "2026-09-08",
      actor: "Заявитель",
      title: "Добавлены требования заявителя",
      text: "Требования заявителя(1).docx",
    },
    {
      date: "2026-09-08",
      actor: "Заявитель",
      title: "Добавлены доказательства по оспариваемому пункту 4",
      text: "Доказательства 4.docx",
    },
    {
      date: "2026-09-08",
      actor: "Заявитель",
      title: "Добавлены доказательства по оспариваемому пункту 8",
      text: "Доказательства 8.docx",
    },
  );
  return c;
}

/**
 * Второе тестовое заявление, поступившее через SAQ.
 * Основано на общем заявлении из ОДО, но имеет отдельный системный номер,
 * номер обращения, канал поступления и БИН заявителя.
 */
export function sharedSaqStatementApplication(): ObjectionCase {
  const c = sharedStatementApplication();
  c.id = "З-2026-003";
  c.appealNumber = "003-SAQ";
  c.channel = "SAQ";
  c.bin = "001002003004";
  c.status = "received";
  c.assignee = "Не назначен";
  c.unread = true;
  if (c.history[0]) {
    c.history[0] = {
      ...c.history[0],
      actor: "Объект",
      title: "Обращение поступило через SAQ",
      text: "Обращение направлено директору ДАВГА для выбора исполнителя рабочего органа.",
    };
  }
  return c;
}

export function seed(): ObjectionCase[] {
  return [
    sharedAuditObjection(),
    sharedStatementApplication(),
    sharedSaqStatementApplication(),
  ];
}
