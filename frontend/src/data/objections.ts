import type {
  CommissionAttendanceMember,
  CommissionMember,
  NewCaseInput,
  ObjectionCase,
} from "../types";
import {
  isPreventiveControlObjectionType,
  PREVENTIVE_CONTROL_ACT_OBJECTION,
} from "../modules/objections/appealTypes";
import { addWorkdays } from "../modules/objections/services/deadlines";

export const COMMISSION_ATTENDANCE_MEMBERS: CommissionAttendanceMember[] = [
  {
    id: "turegeldiev-ar",
    name: "Заместитель Председателя КВГА МФ РК - Турегельдиев А.Р.",
  },
  {
    id: "bukaev-zhb",
    name: "Руководитель УАО КВГА МФ РК - Букаев Ж.Б.",
  },
  {
    id: "ashanova-ak",
    name: "Руководитель УАС КВГА МФ РК - Ашанова А.К.",
  },
  {
    id: "kazikhanova-ab",
    name: "И.о. руководителя ЮУ КВГА МФ РК - Казиханова А.Б.",
  },
  {
    id: "dyusengalieva-azh",
    name: "И.о. руководителя УКСБУ КВГА МФ РК - Дюсенгалиева А.Ж.",
  },
];
export function members(): CommissionMember[] {
  return COMMISSION_ATTENDANCE_MEMBERS.map((member, index) => ({
    id: index === 0 ? "chair" : "member" + index,
    name: member.name,
    present: true,
    isChair: index === 0,
    recused: false,
    reason: "",
  }));
}
export function makeCase(c: NewCaseInput): ObjectionCase {
  const receivedViaSaq = c.channel === "SAQ";
  const intakeDate = c.intakeDate || c.registered;
  const registrationMethod = c.registrationMethod || "manual";
  const preventiveControl = isPreventiveControlObjectionType(c.appealType);
  return {
    ...c,
    intakeDate,
    registrationMethod,
    status: receivedViaSaq ? "received" : "accepted",
    assignee: receivedViaSaq ? "Не назначен" : "Исполнитель рабочего органа",
    secretaryDeadline: preventiveControl
      ? c.secretaryDeadline || addWorkdays(intakeDate, 10)
      : c.secretaryDeadline,
    unread: receivedViaSaq,
    extensionDays: 0,
    pauseDays: 0,
    documents: [],
    requests: [],
    members: members(),
    history: [
      {
        date: c.registered,
        actor: registrationMethod === "automatic" ? "Система SAQ" : "Секретарь комиссии",
        title: receivedViaSaq
          ? registrationMethod === "automatic"
            ? "Обращение поступило через SAQ"
            : "Обращение внесено вручную из источника SAQ"
          : "Обращение зарегистрировано вручную",
        text: receivedViaSaq
          ? registrationMethod === "automatic"
            ? "Обращение передано руководителю секретаря для выбора исполнителя."
            : "Источник поступления — SAQ. В текущем процессе карточка внесена вручную и передана руководителю секретаря для выбора исполнителя."
          : `Источник поступления — ${c.channel}. Карточка внесена секретарем вручную.`,
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

/** Общее тестовое возражение на акт о результате профилактического контроля. */
export function sharedPreventiveControlObjection(): ObjectionCase {
  const c = makeCase({
    id: "В-2026-001",
    type: "control",
    appealType: PREVENTIVE_CONTROL_ACT_OBJECTION,
    appealNumber: "В-2026-001",
    appealDate: "2026-09-08",
    org: 'Аудиторская организация "Auditor group"',
    bin: "001002003004",
    applicantIdentifierType: "БИН",
    address: "город Астана",
    applicant: "",
    registered: "2026-09-08",
    filed: "2026-09-08",
    channel: "SAQ",
    issuer: "ДВГА по г. Астана",
    authority: "Апелляционная комиссия при Министерстве финансов РК",
    document: {
      number: "57",
      date: "2026-09-01",
      received: "2026-09-08",
      name: "Акт о результате профилактического контроля",
    },
    agendaDetails: {
      auditObjectName: 'Аудиторская организация "Auditor group"',
      auditObjectBin: "001002003004",
      applicantIsAuditObjectRepresentative: false,
    },
    amount: 0,
    request: "О внеплановой проверке",
    issues: [
      {
        id: "preventive-control-point-4",
        number: "4",
        title: "Признать акт недействительным",
        finding: "",
        argument: [
          "1) Признать выводы Акта внеплановой проверки №57 от 02.06.2026г№ необоснованными:",
          "2) Исключить из Акта выводы о составлении заведомо недостоверных аудиторских отчетов:",
          "3) Исключить выводы о нарушении МСА 240,МСА 260, принципа объективности и Кодекса профессиональной этики аудиторов:",
          "4) Отменить Предписание №57 от 2 июня 2026г. как основанное на необоснованных выводах акта проверки:",
          "5) Прекратить дальнейшее производство по вопросу привлечения ТОО «Астана Аудит Сервис» и аудитора к ответственности по обстоятельствам изложенным в Акте проверки:",
          "6) Провести служебную и правовую оценку действии должностного лица ДВГА по городу Шымкент, осуществлявшего проверку и составившего акт, в части соблюдения принципов объективности, беспристрастности, достаточности доказательств и недопустимости формулирования выводов, не подтвержденных документально установленными обстоятельствами:",
          "7) Проверить обоснованность использования в Акте проверки формулировок, содержащие выводы о якобы умышленных действиях аудитора, составлении «заведомо недостоверных аудиторских отчетов», сознательном игнорировании обстоятельств, а также иных оценочных суждений, предполагающих наличие субъективной стороны поведения аудитора, без представления доказательств таких обстоятельств:",
          "8) Дать правовую оценку соответствия выводов Акта проверки требованиям Предпринимательского кодекса РК, принципам законности, объективности и обоснованности государственного контроля, а также требованиям к достаточности доказательственной базы при вынесении выводов нарушения:",
          "9) В случае установления нарушений при проведении проверки и составлении акта №57 от 2 июня 2026г. принять меры реагирования, предусмотренные законодательством РК.",
        ].join("\n\n"),
        evidence: "Доказательства 4.docx",
        amount: 0,
        disputed: true,
      },
      {
        id: "preventive-control-point-8",
        number: "8",
        title: "Тест",
        finding: "",
        argument: "Тест",
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
      dataUrl: "/test-documents/preventive-control-requirements.docx",
    },
    {
      name: "Доказательства 4.docx",
      filename: "Доказательства 4.docx",
      kind: "attachment",
      text: "Доказательства по оспариваемому пункту 4",
      author: "Заявитель",
      date: "2026-09-08",
      dataUrl: "/test-documents/preventive-control-evidence-4.docx",
    },
    {
      name: "Доказательства 8.docx",
      filename: "Доказательства 8.docx",
      kind: "attachment",
      text: "Доказательства по оспариваемому пункту 8",
      author: "Заявитель",
      date: "2026-09-08",
      dataUrl: "/test-documents/preventive-control-evidence-8.docx",
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
  return [sharedPreventiveControlObjection()];
}
