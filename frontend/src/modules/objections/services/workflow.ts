import { CLOSED, OUTCOMES, ROLES } from "../../../data/constants";
import { DEMO_USER } from "../../../config";
import { formatDate } from "../../../utils/dateFormat";
import type {
  Action,
  ActionOption,
  CaseRequest,
  DecisionProjectRecipient,
  DemoState,
  MotivatedResponseRecipient,
  ObjectionCase,
  Outcome,
  RequestLifecycleStatus,
  Role,
} from "../../../types";
import {
  addWorkdays,
  dateObject,
  filingDeadline,
  reviewDeadline,
  workdaysBetween,
} from "./deadlines";
import {
  disputed,
  normalizeVoteChoice,
  overall,
  pointOutcomeFromVotes,
  presidingChairId,
  remainingIssues,
} from "./decisions";
import {
  hasSaqCabinetForIdentifier,
  hasSubjectSaqCabinet,
  isSubjectRole,
  subjectCabinetName,
  subjectRoleForIdentifier,
  subjectRoleForCase,
} from "./saqCabinets";

export const controlDecisions = [
  ["cancel", "Отменить административный акт"],
  ["replace", "Отменить акт и принять новый"],
  ["action", "Совершить административное действие"],
  ["reject", "Оставить жалобу без удовлетворения"],
  ["return", "Вернуть дело для устранения процедурных нарушений"],
  ["without", "Оставить жалобу без рассмотрения"],
] as const;

function isKvgaRequest(recipient: string) {
  return recipient.toUpperCase().includes("КВГА");
}

function isDvgaRequest(recipient: string) {
  return recipient.toUpperCase().includes("ДВГА");
}

function isDvgaOrKvgaRequest(recipient: string) {
  return isDvgaRequest(recipient) || isKvgaRequest(recipient);
}

function authorityRole(recipient: string): Role {
  return isKvgaRequest(recipient) ? "kvga" : "dvga";
}

function defaultDecisionProjectRecipients(c: ObjectionCase): DecisionProjectRecipient[] {
  const subjectChannel = hasSubjectSaqCabinet(c) ? "saq" : "external";
  return [
    {
      id: "subject",
      recipient: c.org || "Заявитель",
      recipientRole: subjectRoleForCase(c),
      purpose: "comments",
      channel: subjectChannel,
      status: "pending",
    },
  ];
}

function decisionProjectRecipients(c: ObjectionCase) {
  return c.decisionProjectRecipients?.length
    ? c.decisionProjectRecipients
    : defaultDecisionProjectRecipients(c);
}

/**
 * Мотивированный ответ направляется заявителю и, при наличии отдельного
 * БИН/ИИН, объекту аудита. Канал определяется не источником обращения, а
 * наличием соответствующего кабинета SAQ. Ручная фиксация внешнего
 * направления применяется только к заявителю.
 */
function defaultMotivatedResponseRecipients(
  c: ObjectionCase,
): MotivatedResponseRecipient[] {
  const recipients: MotivatedResponseRecipient[] = [
    {
      id: "applicant",
      recipient: c.org || "Заявитель",
      identifier: c.bin,
      recipientRole: subjectRoleForCase(c),
      channel: hasSubjectSaqCabinet(c) ? "saq" : "external",
      status: "pending",
    },
  ];
  const auditObjectIdentifier = c.agendaDetails?.auditObjectBin?.trim();
  const applicantIdentifier = (c.bin || "").replace(/\D/g, "");
  if (
    auditObjectIdentifier &&
    auditObjectIdentifier.replace(/\D/g, "") !== applicantIdentifier
  )
    recipients.push({
      id: "audit-object",
      recipient: c.agendaDetails?.auditObjectName || "Объект аудита",
      identifier: auditObjectIdentifier,
      recipientRole: subjectRoleForIdentifier(auditObjectIdentifier),
      channel: hasSaqCabinetForIdentifier(auditObjectIdentifier)
        ? "saq"
        : "external",
      status: "pending",
    });
  return recipients;
}

/**
 * Выбор канала для заявителя фиксируется при формировании мотивированного
 * ответа. Для объекта аудита канал по-прежнему определяется наличием его
 * кабинета SAQ, чтобы не смешивать реквизиты разных адресатов.
 */
function motivatedResponseRecipients(c: ObjectionCase) {
  const recipients = defaultMotivatedResponseRecipients(c);
  const savedApplicant = c.motivatedResponseRouting?.recipients.find(
    (recipient) => recipient.id === "applicant",
  );
  if (!savedApplicant) return recipients;

  return recipients.map((recipient) =>
    recipient.id === "applicant"
      ? { ...recipient, channel: savedApplicant.channel }
      : recipient,
  );
}

function isActiveRequest(request: CaseRequest) {
  return !request.cancelled;
}

/** Жалобы и заявления не получают отдельное уведомление о направлении запроса. */
function isComplaintOrStatement(c: ObjectionCase) {
  const appealType = (c.appealType || "").trim();
  return appealType.startsWith("Жалоба") || appealType === "Заявление";
}

export const REQUEST_LIFECYCLE_LABELS: Record<RequestLifecycleStatus, string> =
  {
    draft: "Черновик",
    approval: "На согласовании",
    signature: "На подписании",
    waiting_response: "Ожидается ответ",
    response_received: "Ответ получен",
  };

/**
 * Запросы хранят собственный статус, а для сохранённых ранее карточек
 * рассчитываем его по уже имеющимся датам и реквизитам.
 */
export function requestLifecycleStatus(
  request: CaseRequest,
): RequestLifecycleStatus {
  if (request.lifecycleStatus) return request.lifecycleStatus;
  if (request.responseSigned || request.responded) return "response_received";
  if (request.sent) return "waiting_response";
  if (request.approved) return "signature";
  return "draft";
}

function authorityRequestsForRole(c: ObjectionCase, role?: Role) {
  return c.requests.filter(
    (request) =>
      isActiveRequest(request) &&
      isDvgaOrKvgaRequest(request.recipient) &&
      Boolean(request.sent) &&
      ((role !== "dvga" && role !== "kvga") ||
        authorityRole(request.recipient) === role),
  );
}

function pendingDvgaOrKvgaRequest(c: ObjectionCase, role?: Role) {
  return authorityRequestsForRole(c, role).find(
    (request) => !request.responded,
  );
}

function pendingOtherRequest(c: ObjectionCase) {
  return c.requests.find(
    (request) =>
      isActiveRequest(request) &&
      request.template === "other" &&
      !request.saqRecipient &&
      requestLifecycleStatus(request) === "waiting_response",
  );
}

/** Рекомендации можно направлять сразу после подписания протокола и позднее,
 * в том числе после завершения рассмотрения. */
function recommendationsAvailable(c: ObjectionCase) {
  return Boolean(c.meeting?.signed) || c.status === "completed";
}

function canSuspendReview(c: ObjectionCase) {
  return (c.appealType || "").trim().startsWith("Возражение");
}

/** Все направленные и не отменённые запросы должны получить ответ.
 * Для органа без кабинета SAQ ответ переводится в этот статус действием
 * «Вложить ответ»; ответы из кабинетов SAQ фиксируются системой. */
function allResponsesReadyForConfirmation(c: ObjectionCase) {
  const requests = c.requests.filter(
    (request) => isActiveRequest(request) && Boolean(request.sent),
  );
  return (
    requests.length > 0 &&
    requests.every(
      (request) => requestLifecycleStatus(request) === "response_received",
    )
  );
}

/** Пока не подписаны все запросы, общий статус обращения остаётся на
 * согласовании или подписании. Это не мешает адресату уже подписанного
 * запроса заполнять ответ в своём кабинете. */
function requestRoutingStatus(
  c: ObjectionCase,
): ObjectionCase["status"] | null {
  const requests = c.requests.filter(isActiveRequest);
  if (!requests.some((request) => !request.sent)) return null;
  return requests.some((request) => !request.sent && !request.approved)
    ? "request_approval"
    : "request_signed";
}

/** Когда получен последний требуемый ответ, система сразу переводит
 * обращение к анализу и завершает приостановление срока, если оно применимо. */
function allResponsesReceived(c: ObjectionCase) {
  return allResponsesReadyForConfirmation(c);
}

function advanceAfterResponses(c: ObjectionCase, date: string) {
  if (!allResponsesReceived(c)) return null;

  c.requests
    .filter((request) => isActiveRequest(request) && request.sent)
    .forEach((request) => {
      request.confirmed ||= date;
    });

  let pausedDays = 0;
  if (c.requestPauseStartedAt && canSuspendReview(c)) {
    pausedDays = workdaysBetween(c.requestPauseStartedAt, date);
    if (pausedDays > 0) c.pauseDays += pausedDays;
  }
  c.requestPauseStartedAt = undefined;
  if (
    c.requestRoute === "additional-analysis" ||
    c.requestRoute === "additional-commission" ||
    c.requestRoute === "additional-hearing"
  ) {
    c.requestRouteCompletedAt = date;
  }
  c.status = "materials";
  return pausedDays;
}

function directedToDvgaOrKvga(c: ObjectionCase) {
  return c.requests.some(
    (request) =>
      isActiveRequest(request) && isDvgaOrKvgaRequest(request.recipient),
  );
}

function requiresEotinishDecisionProject(c: ObjectionCase) {
  // Для жалоб и заявлений действует единый административный маршрут независимо от
  // источника: портал, цифровая система или E-Otinish. После протокола
  // обязательно формируются проект решения и проводится заслушивание.
  // Проверяем сам вид обращения, а не его технический тип: это также включает
  // сохранённые карточки со старым наименованием вида жалобы.
  const appealType = (c.appealType || "").trim();
  return appealType.startsWith("Жалоба") || appealType === "Заявление";
}

/**
 * Мотивированный ответ направляется по единому маршруту: для жалоб,
 * заявлений и возражений на аудиторский отчёт. При этом проект решения и
 * заслушивание остаются отдельным маршрутом только для жалоб и заявлений.
 */
function requiresMotivatedResponse(c: ObjectionCase) {
  const appealType = (c.appealType || "").trim();
  return (
    appealType.startsWith("Жалоба") ||
    appealType === "Заявление" ||
    appealType === "Возражение на аудиторский отчет" ||
    appealType === "Возражение на аудиторский отчёт"
  );
}

function isStatement(c: ObjectionCase) {
  return (c.appealType || "").trim() === "Заявление";
}

const REQUEST_STAGE_STATUSES: ObjectionCase["status"][] = [
  "accepted",
  "requested",
  "request_approval",
  "request_signed",
  "request_approved",
  "response_approval",
  "response_signed",
  "response_ready",
];

const COMMISSION_STAGE_STATUSES: ObjectionCase["status"][] = [
  "certificate_approved",
  "documents_review",
  "commission_members",
  "commission_voting",
  "circulated",
  "meeting_certificate_approval",
  "meeting_certificate_signed",
  "meeting_certificate_approved",
];

function cameThroughSaq(c: ObjectionCase) {
  return (c.channel || "").trim().toUpperCase() === "SAQ";
}

function requiresConclusion(c: ObjectionCase) {
  const appealType = (c.appealType || "").trim();
  return (
    appealType === "Возражение на уведомление" ||
    appealType === "Возражение на уведомления" ||
    (!appealType && c.type === "notice")
  );
}

/** A member may vote differently on separate points. For the certificate we
 * show one concise overall position: mixed votes are treated as partial. */
function memberVoteOutcome(c: ObjectionCase, memberId: string): Outcome | "" {
  const choices = disputed(c)
    .map((point) => normalizeVoteChoice(c.votes?.[point.id]?.votes?.[memberId]))
    .filter(Boolean);
  if (!choices.length) return "";
  if (choices.every((choice) => choice === choices[0])) return choices[0] || "";
  return choices.some((choice) => choice === "accept" || choice === "partial")
    ? "partial"
    : "reject";
}

function authorityResponseAction(
  c: ObjectionCase,
  role?: Role,
): ActionOption | null {
  const requests = authorityRequestsForRole(c, role);
  const toFill = requests.find((request) => !request.responded);
  if (toFill)
    return {
      action: "fill-request-response",
      label: "Заполнить ответ ДВГА/КВГА",
      role: authorityRole(toFill.recipient),
    };
  const toApprove = requests.find(
    (request) => !!request.responded && !request.responseApproved,
  );
  if (toApprove)
    return {
      action: "approve-response",
      label: "Согласовать",
      role: authorityRole(toApprove.recipient),
    };
  const toSign = requests.find(
    (request) => !!request.responseApproved && !request.responseSigned,
  );
  if (toSign)
    return {
      action: "sign-response",
      label: "Подписать",
      role: authorityRole(toSign.recipient),
    };
  return null;
}

function authorityStatus(c: ObjectionCase): ObjectionCase["status"] | null {
  const requests = authorityRequestsForRole(c);
  if (requests.some((request) => !request.responded)) return "request_approved";
  if (requests.some((request) => !request.responseApproved))
    return "response_approval";
  if (requests.some((request) => !request.responseSigned))
    return "response_signed";
  if (requests.length && !allResponsesReceived(c)) return "request_approved";
  return null;
}

export function nextAction(c: ObjectionCase, role?: Role): ActionOption | null {
  if (role === "demo-superuser") role = undefined;
  const reviewer: Role = "work";
  if (role === "dvga" || role === "kvga") {
    const authorityAction = authorityResponseAction(c, role);
    if (authorityAction) return authorityAction;
    return null;
  }
  const authorityInProgress = [
    "request_approved",
    "response_approval",
    "response_signed",
    "response_ready",
  ].includes(c.status);
  if (authorityInProgress) {
    if (role === "work") return null;
    const authorityAction = role ? null : authorityResponseAction(c);
    if (authorityAction) return authorityAction;
  }
  if (c.status === "request_approval") {
    const hasUnapprovedRequests = c.requests.some(
      (request) => !request.sent && !request.approved,
    );
    const hasApprovedUnsignedRequests = c.requests.some(
      (request) => Boolean(request.approved) && !request.sent,
    );
    if (role === "director" && hasApprovedUnsignedRequests)
      return {
        action: "sign-request",
        label: "Подписать запрос",
        role: "director",
      };
    if (role === "deputy" && hasUnapprovedRequests)
      return {
        action: "approve-request",
        label: "Согласовать запрос",
        role: "deputy",
      };
    if (!role && hasUnapprovedRequests)
      return {
        action: "approve-request",
        label: "Согласовать запрос",
        role: "deputy",
      };
    if (!role && hasApprovedUnsignedRequests)
      return {
        action: "sign-request",
        label: "Подписать запрос",
        role: "director",
      };
  }
  const map: Partial<Record<ObjectionCase["status"], ActionOption>> = {
    received: {
      action: "assign-work-executor",
      label: "Выбрать исполнителя рабочего органа",
      role: "director",
    },
    accepted: {
      action: "request",
      label: "Сформировать запрос в ДВГА/КВГА",
      role: "work",
    },
    requested: {
      action: "send-request-approval",
      label: "Отправить на согласование",
      role: "work",
    },
    request_approval: {
      action: "approve-request",
      label: "Согласовать запрос",
      role: "deputy",
    },
    request_signed: {
      action: "sign-request",
      label: "Подписать запрос",
      role: "director",
    },
    request_approved: undefined,
    certificate_approval: {
      action: "approve-certificate",
      label: "Согласовать справку",
      role: "deputy",
    },
    certificate_signed: {
      action: "sign-certificate",
      label: "Подписать справку",
      role: "work",
    },
    commission_voting: {
      action: "commission-vote",
      label: "Проголосовать",
      role: "commission",
    },
    meeting_certificate_approval: {
      action: "members",
      label: "Заседание по данному делу проведено",
      role: "work",
    },
    meeting_certificate_signed: {
      action: "members",
      label: "Заседание по данному делу проведено",
      role: "work",
    },
    meeting_certificate_approved: {
      action: "members",
      label: "Заседание по данному делу проведено",
      role: "work",
    },
    materials: {
      action: "analysis",
      label:
        c.hearingSupplements?.length
          ? "Сформировать справку по дополнительным доводам после заслушивания"
          : c.requestRoute === "additional-analysis" ||
              c.requestRoute === "additional-commission" ||
              c.requestRoute === "additional-hearing"
            ? "Обновить справку"
            : "Сформировать справку",
      role: reviewer,
    },
    forwarded: {
      action: "analysis",
      label: "Сформировать справку",
      role: reviewer,
    },
    circulated: {
      action: "members",
      label: "Заседание по данному делу проведено",
      role: "work",
    },
    hearing: {
      action: "hearing",
      label: "Организовать заслушивание",
      role: reviewer,
    },
    hearing_ready: {
      action: "hearing-held",
      label: "Зафиксировать заслушивание",
      role: reviewer,
    },
    meeting: {
      action: "vote",
      label: "Сформировать протокол заседания",
      role: "work",
    },
    protocol: {
      action: "sign",
      label: "Подписать протокол",
      role: "commission",
    },
    decision_project: {
      action: "create-decision-project",
      label: "Сформировать проект решения",
      role: "work",
    },
    decision_project_approval: {
      action: "approve-decision-project",
      label: "Согласовать проект решения",
      role: "deputy",
    },
    decision_project_signed: {
      action: "sign-decision-project",
      label: "Подписать проект решения",
      role: "director",
    },
    decision_project_delivery: {
      action: "record-decision-project-delivery",
      label: "Зафиксировать направление проекта решения",
      role: "work",
    },
    decision_project_eotinish: {
      action: "send-decision-project-eotinish",
      label: "Заслушивание назначено",
      role: "work",
    },
    decision_project_hearing: {
      action: "hearing-after-decision-project",
      label: "Заслушивание проведено",
      role: "work",
    },
    decided: {
      action:
        requiresConclusion(c) &&
        c.documents.some((document) => document.kind === "conclusion")
          ? "close-review"
          : "deliver",
      label: requiresConclusion(c)
        ? c.documents.some((document) => document.kind === "conclusion")
          ? "Завершить рассмотрение"
          : "Вложить заключение"
        : requiresMotivatedResponse(c)
          ? "Сформировать мотивированный ответ"
          : "Сформировать окончательный ответ",
      role: c.selfReview ? "dvga" : reviewer,
    },
    final_response_approval: {
      action: "approve-final-response",
      label: requiresMotivatedResponse(c)
        ? "Согласовать мотивированный ответ"
        : "Согласовать ответ",
      role: "deputy",
    },
    final_response_signed: {
      action: "sign-final-response",
      label: requiresMotivatedResponse(c)
        ? "Подписать мотивированный ответ"
        : "Подписать ответ",
      role: "director",
    },
    final_response_delivery: {
      action: "record-final-response-delivery",
      label: "Зафиксировать направление мотивированного ответа",
      role: "work",
    },
    paused: {
      action: "resume",
      label: "Зарегистрировать внешний ответ",
      role: "work",
    },
    court: {
      action: "court-result",
      label: "Учесть судебный акт",
      role: "work",
    },
  };
  return map[c.status] || null;
}

export function additionalActions(c: ObjectionCase): ActionOption[] {
  const options: ActionOption[] = [
    { action: "upload", label: "Добавить материал", role: subjectRoleForCase(c) },
  ];
  if (isStatement(c) && c.status === "materials") {
    options.push({
      action: "start-analysis-additional-request",
      label: "Направить дополнительный запрос",
      role: "work",
    });
  }
  if (isStatement(c) && COMMISSION_STAGE_STATUSES.includes(c.status)) {
    options.push({
      action: "start-commission-additional-request",
      label: "Направить дополнительный запрос",
      role: "work",
    });
  }
  if (
    c.requests.some(
      (request) =>
        request.template === "other" &&
        request.saqRecipient === "subject" &&
        Boolean(request.sent) &&
        requestLifecycleStatus(request) === "waiting_response",
    )
  )
    options.push({
      action: "subject-response",
      label: "Направить ответ",
      role: subjectRoleForCase(c),
    });
  if (
    c.status === "decision_project_comments" &&
    c.decisionProjectRouting &&
    c.decisionProjectRouting.channel === "saq"
  )
    options.push({
      action: "submit-decision-project-comment",
      label: "Направить замечание к проекту решения",
      role: subjectRoleForCase(c),
    });
  if (
    c.status === "decision_project_comments" &&
    c.decisionProjectRouting &&
    c.decisionProjectRouting.channel === "external"
  )
    options.push({
      action: "record-external-decision-project-comment",
      label: "Зафиксировать замечание к проекту решения",
      role: "work",
    });
  if (
    [
      "decision_project_comments",
      "decision_project_eotinish",
      "decision_project_hearing",
    ].includes(c.status)
  )
    options.push({
      action: "proceed-to-final-response",
      label: "Перейти на этап «Мотивированный ответ»",
      role: "work",
    });
  const canAddRequest = REQUEST_STAGE_STATUSES.includes(c.status);
  const hasDraftRequests = c.requests.some(
    (request) =>
      isActiveRequest(request) && requestLifecycleStatus(request) === "draft",
  );
  if (canAddRequest) {
    options.push(
      {
        action: "request",
        label: "Сформировать запрос в ДВГА/КВГА",
        role: "work",
      },
      {
        action: "request-saq",
        label: "Сформировать запрос в кабинет SAQ",
        role: "work",
      },
      {
        action: "request-other",
        label: "Зафиксировать запрос через другую систему",
        role: "work",
      },
    );
    if (directedToDvgaOrKvga(c) && hasDraftRequests)
      options.push({
        action: "send-request-approval",
        label: "Направить на согласование",
        role: "work",
      });
  }
  const active =
    !CLOSED.includes(c.status) &&
    !["protocol", "decided", "delivered", "court"].includes(c.status);
  if (active) {
    if (pendingOtherRequest(c))
      options.push({
        action: "record-external-response",
        label: "Вложить ответ другого органа",
        role: "work",
      });
    options.push({
      action: "supplement",
      label: "Дополнение к возражению",
      role: "work",
    });
    if (["commission_voting", "meeting"].includes(c.status)) {
      options.push({
        action: "vote",
        label: "Сформировать протокол заседания",
        role: "work",
      });
      if (c.certificate)
        options.push({
          action: "edit-certificate",
          label: "Редактировать справку",
          role: "work",
        });
    }
    if (["commission_voting", "circulated"].includes(c.status))
      options.push({
        action: "fill-meeting-certificate",
        label: "Заполнить справку",
        role: "work",
      });
    if (["circulated", "hearing", "hearing_ready"].includes(c.status))
      options.push({
        action: "return-analysis",
        label: "Вернуть на анализ",
        role: "work",
      });
  }
  if (recommendationsAvailable(c)) {
    options.push({
      action: "send-recommendations",
      label: "Направить рекомендации",
      role: "work",
    });
  }
  if (["delivered", "completed"].includes(c.status)) {
    options.push({
      action: "court",
      label: "Судебное обжалование",
      role: subjectRoleForCase(c),
    });
    if (!c.delivery?.received)
      options.push({
        action: "receipt",
        label: "Подтвердить получение результата",
        role: subjectRoleForCase(c),
      });
  }
  return options;
}

export function effect(c: ObjectionCase): string {
  const left = remainingIssues(c);
  if (c.type === "notice")
    return left.length
      ? `Уведомление сохраняется по пунктам ${left.map((p) => p.number).join(", ")}. Неоспоренные нарушения также остаются на исполнении.`
      : "Все нарушения уведомления оспорены и исключены. Уведомление подлежит полной отмене.";
  if (c.type === "audit")
    return left.length
      ? `Учитываются оставленные в силе пункты ${left.map((p) => p.number).join(", ")}; остаточная сумма определяется по каждому пункту.`
      : "Оспоренные выводы отчёта подлежат исключению; последствия учитываются в исходном аудиторском деле.";
  return (
    c.result?.effect ||
    "Последствия по акту определяются резолютивной частью решения компетентного органа."
  );
}

export function required(form: FormData, name: string, label = name): string {
  const value = String(form.get(name) || "").trim();
  if (!value) throw new Error(`Заполните поле «${label}»`);
  return value;
}

function checked(form: FormData, ...names: string[]) {
  if (names.some((name) => !form.has(name)))
    throw new Error("Подтвердите все обязательные проверки и действия");
}

export function actionDate(
  state: DemoState,
  c: ObjectionCase,
  form: FormData,
): string {
  const date = String(form.get("date") || state.date);
  dateObject(date);
  return date;
}

export function addDocument(
  c: ObjectionCase,
  role: Role,
  date: string,
  name: string,
  kind: string,
  text: string,
  requestId?: string,
) {
  c.documents.push({
    name,
    kind,
    text,
    date,
    author: ROLES[role],
    requestId,
    snapshot: structuredClone({
      issues: c.issues,
      result: c.result || null,
      members: c.members,
      votes: c.votes || null,
      meeting: c.meeting || null,
      hearing: c.hearing || null,
      delivery: c.delivery || null,
      certificate: c.certificate || null,
      requests: c.requests,
      hearingSupplements: c.hearingSupplements || [],
    }),
  });
}

/** Validate and apply one transaction. The original state remains untouched on error. */
export function applyAction(
  state: DemoState,
  caseId: string,
  action: Action,
  role: Role,
  form: FormData,
): DemoState {
  const next = structuredClone(state);
  const c = next.cases.find((item) => item.id === caseId);
  if (!c) throw new Error("Обращение не найдено");
  const available = [nextAction(c, role), ...additionalActions(c)].find(
    (item) => item?.action === action,
  );
  if (
    !available ||
    (role !== "demo-superuser" &&
      available.role !== role &&
      action !== "upload")
  )
    throw new Error("Действие недоступно на этом этапе или для выбранной роли");
  const date = actionDate(next, c, form);
  const text = (name: string, label?: string) => required(form, name, label);
  const doc = (
    name: string,
    kind: string,
    content: string,
    requestId?: string,
  ) => addDocument(c, role, date, name, kind, content, requestId);
  let title: string = available.label;
  let note = "";

  switch (action) {
    case "start-analysis-additional-request":
    case "start-commission-additional-request": {
      if (!isStatement(c))
        throw new Error(
          "Дополнительный маршрут в этой версии доступен только для заявления",
        );
      const reason = text(
        "reason",
        "Причина необходимости направления дополнительного запроса",
      );
      const fromCommission = action === "start-commission-additional-request";
      c.requestRoute = fromCommission
        ? "additional-commission"
        : "additional-analysis";
      c.requestRouteStartedAt = date;
      c.requestRouteCompletedAt = undefined;
      if (fromCommission) {
        c.repeatHearingStatus = "required";
        c.repeatHearingRound = (c.repeatHearingRound || 0) + 1;
        c.repeatHearingReason = reason;
        c.repeatHearingRequestedAt = date;
        c.repeatHearingReadyAt = undefined;
        c.repeatHearingMeetingId = undefined;
      }
      c.status = "accepted";
      title = fromCommission
        ? "Дополнительный запрос по решению Апелляционной комиссии сформирован"
        : "Дополнительный запрос по результатам анализа сформирован";
      note = fromCommission
        ? `Заседание отложено. Причина направления дополнительного запроса: ${reason}`
        : `Формирование справки приостановлено. Причина направления дополнительного запроса: ${reason}`;
      doc(
        fromCommission
          ? "Решение Апелляционной комиссии о направлении дополнительного запроса"
          : "Обоснование направления дополнительного запроса по результатам анализа",
        "additional-request-decision",
        reason,
      );
      break;
    }
    case "assign-work-executor": {
      c.assignee = text("assignee", "Исполнитель рабочего органа");
      c.unread = false;
      c.unreadForAssignee = true;
      c.status = "accepted";
      title = "Исполнитель рабочего органа назначен";
      note = `Директор ДАВГА назначил исполнителем: ${c.assignee}.`;
      next.notifications.push({
        id: `notification-${c.id}-${next.notifications.length + 1}`,
        caseId: c.id,
        recipient: c.assignee,
        date,
        read: false,
        text: `Вам назначено обращение №${c.appealNumber || c.id} от ${formatDate(c.appealDate || c.registered)}. Необходимо сформировать запрос в ДВГА/КВГА.`,
      });
      break;
    }
    case "screen": {
      checked(form, "identity", "document", "grounds", "competence");
      if (c.filed > filingDeadline(c)) {
        if (c.type !== "control")
          throw new Error(
            "Пропущен срок подачи. Формальный отказ оформляется комиссией отдельным действием.",
          );
        text(
          "restoration",
          "Результат рассмотрения вопроса восстановления срока",
        );
      }
      c.assignee = text("assignee", "Ответственный");
      c.authority = text("authority", "Компетентный орган");
      c.screening = text(
        "basis",
        "Основание компетенции и проверки допустимости",
      );
      if (c.type === "control")
        c.actEffect = text("actEffect", "Последствия по статье 96 АППК");
      c.status = "accepted";
      title = "Обращение принято; компетенция и допустимость проверены";
      note = c.screening;
      break;
    }
    case "request": {
      const recipient = text("recipient", "Кому направить запрос");
      const deadline = `${addWorkdays(date, 2)}T18:00`;
      const requestId = `request-${c.requests.length + 1}`;
      note = `Запрос сформирован для ${recipient}. Срок рассмотрения: ${deadline}.`;
      c.requests.push({
        id: requestId,
        recipient,
        date,
        text: note,
        deadline,
        route: c.requestRoute || "initial",
        template: "dvga",
        lifecycleStatus: "draft",
        author: String(form.get("executor") || DEMO_USER.fullName),
      });
      doc(`Запрос в ${recipient}`, "request", note, requestId);
      doc(
        `Приложение к запросу в ${recipient}`,
        "request-appendix",
        `Приложение к запросу в ${recipient}.`,
        requestId,
      );
      break;
    }
    case "request-saq": {
      const saqRecipient = text("saqRecipient", "Получатель SAQ") as Role;
      if (saqRecipient !== "subject")
        throw new Error("Выберите получателя с кабинетом SAQ");
      const recipient = `Кабинет ${subjectCabinetName(c)} SAQ`;
      const customText = text("customRequestText", "Текст запроса");
      const deadline = `${addWorkdays(date, 2)}T18:00`;
      const requestId = `request-${c.requests.length + 1}`;
      note = `Запрос сформирован для ${recipient}. Срок рассмотрения: ${deadline}.`;
      c.requests.push({
        id: requestId,
        recipient,
        date,
        text: note,
        deadline,
        route: c.requestRoute || "initial",
        template: "other",
        saqRecipient,
        lifecycleStatus: "draft",
        author: DEMO_USER.fullName,
        customText,
      });
      doc(`Запрос в ${recipient}`, "request", note, requestId);
      break;
    }
    case "request-other": {
      const recipient = text("recipient", "Кому направлен запрос");
      const sent = String(form.get("date") || date);
      dateObject(sent);
      const registrationNumber = String(
        form.get("registrationNumber") || "",
      ).trim();
      const deliveryPath = String(form.get("deliveryPath") || "").trim();
      const requestId = `request-${c.requests.length + 1}`;
      const firstSentRequest = !c.requests.some(
        (request) => isActiveRequest(request) && Boolean(request.sent),
      );
      note = `Направление запроса в ${recipient} зафиксировано: №${registrationNumber} от ${formatDate(sent)}, ${deliveryPath}. Ответ ожидается.`;
      c.requests.push({
        id: requestId,
        recipient,
        date: sent,
        text: note,
        deadline: "",
        route: c.requestRoute || "initial",
        template: "other",
        lifecycleStatus: "waiting_response",
        author: DEMO_USER.fullName,
        registrationNumber,
        deliveryPath,
        sent,
      });
      if (canSuspendReview(c) && !c.requestPauseStartedAt)
        c.requestPauseStartedAt = sent;
      if (firstSentRequest && !isComplaintOrStatement(c))
        next.notifications.push({
          id: `notification-${c.id}-${next.notifications.length + 1}`,
          caseId: c.id,
          recipient: c.org,
          date: sent,
          read: false,
          text: canSuspendReview(c)
            ? `По Вашему обращению №${c.appealNumber || c.id} от ${formatDate(c.appealDate)} направлен запрос о предоставлении необходимых материалов в соответствующий орган. Срок рассмотрения обращения приостанавливается до поступления последнего требуемого ответа.`
            : `По Вашему обращению №${c.appealNumber || c.id} от ${formatDate(c.appealDate)} направлен запрос о предоставлении необходимых материалов в соответствующий орган. Срок рассмотрения обращения не приостанавливается.`,
        });
      break;
    }
    case "send-request-approval": {
      if (!directedToDvgaOrKvga(c))
        throw new Error(
          "Сначала сформируйте обязательный запрос в ДВГА/КВГА и приложение к нему",
        );
      if (!c.requests.some((request) => !request.sent && !request.approved))
        throw new Error("Нет новых сформированных запросов для согласования");
      c.requests.forEach((request) => {
        if (
          isActiveRequest(request) &&
          requestLifecycleStatus(request) === "draft"
        )
          request.lifecycleStatus = "approval";
      });
      const isAdditionalBatch = c.requests.some((request) => request.sent);
      c.status = "request_approval";
      title = isAdditionalBatch
        ? "Новые запросы направлены на согласование"
        : "Сформированные запросы направлены на согласование";
      note = isAdditionalBatch
        ? "Новые сформированные запросы и приложения направлены заместителю директора ДАВГА."
        : "Сформированные запросы и приложения направлены заместителю директора ДАВГА.";
      next.notifications.push({
        id: `notification-${c.id}-${next.notifications.length + 1}`,
        caseId: c.id,
        recipient: ROLES.deputy,
        recipientRole: "deputy",
        date,
        read: false,
        text: `В ваш кабинет поступили запросы по обращению №${c.appealNumber || c.id} для согласования.`,
      });
      break;
    }
    case "approve-request": {
      checked(form, "approved");
      if (!c.requests.length) throw new Error("Запрос не сформирован");
      const pendingRequests = c.requests.filter(
        (item) => !item.sent && !item.approved,
      );
      const requestId = String(form.get("requestId") || "");
      const request = requestId
        ? c.requests.find((item) => item.id === requestId)
        : pendingRequests.length === 1
          ? pendingRequests[0]
          : undefined;
      if (!request) throw new Error("Выберите запрос для согласования");
      if (request.approved) throw new Error("Этот запрос уже согласован");
      request.approved = date;
      request.lifecycleStatus = "signature";
      const remainingRequests = c.requests.filter(
        (item) => !item.sent && !item.approved,
      );
      c.status = remainingRequests.length
        ? "request_approval"
        : "request_signed";
      title = `Запрос в ${request.recipient} согласован`;
      note = remainingRequests.length
        ? `Запрос направлен в кабинет директора ДАВГА для подписания. Осталось согласовать запросов: ${remainingRequests.length}.`
        : "Все запросы согласованы и направлены в кабинет директора ДАВГА для подписания.";
      next.notifications.push({
        id: `notification-${c.id}-${next.notifications.length + 1}`,
        caseId: c.id,
        recipient: ROLES.director,
        recipientRole: "director",
        date,
        read: false,
        text: `В ваш кабинет поступил согласованный запрос в ${request.recipient} по обращению №${c.appealNumber || c.id} для подписания.`,
      });
      break;
    }
    case "sign-request": {
      if (!c.requests.length) throw new Error("Запрос не сформирован");
      const unsignedRequests = c.requests.filter(
        (item) => Boolean(item.approved) && !item.sent,
      );
      const requestId = String(form.get("requestId") || "");
      const request = requestId
        ? c.requests.find((item) => item.id === requestId)
        : unsignedRequests.length === 1
          ? unsignedRequests[0]
          : undefined;
      if (!request) throw new Error("Выберите запрос для подписания");
      if (request.sent) throw new Error("Этот запрос уже подписан");
      if (!request.approved) throw new Error("Сначала согласуйте этот запрос");
      const firstSignedRequest = c.requests.every((item) => !item.sent);
      request.sent = date;
      request.lifecycleStatus = "waiting_response";
      if (isDvgaOrKvgaRequest(request.recipient))
        next.notifications.push({
          id: `notification-${c.id}-${next.notifications.length + 1}`,
          caseId: c.id,
          recipient: isKvgaRequest(request.recipient) ? "КВГА" : "ДВГА",
          recipientRole: authorityRole(request.recipient),
          date,
          read: false,
          text: `В ваш кабинет направлен запрос по обращению №${c.appealNumber || c.id} для подготовки мотивированного ответа.`,
        });
      if (request.template === "other" && request.saqRecipient === "subject")
        next.notifications.push({
          id: `notification-${c.id}-${next.notifications.length + 1}`,
          caseId: c.id,
          recipient: c.org,
          recipientRole: subjectRoleForCase(c),
          date,
          read: false,
          text: `В ваш кабинет направлен запрос по обращению №${c.appealNumber || c.id} для предоставления необходимых материалов.`,
        });
      if (firstSignedRequest) {
        if (canSuspendReview(c)) c.requestPauseStartedAt = date;
        if (!isComplaintOrStatement(c))
          next.notifications.push({
            id: `notification-${c.id}-${next.notifications.length + 1}`,
            caseId: c.id,
            recipient: c.org,
            date,
            read: false,
            text: canSuspendReview(c)
              ? `По Вашему обращению №${c.appealNumber || c.id} от ${formatDate(c.appealDate)} направлен запрос о предоставлении необходимых материалов в соответствующие органы. Срок рассмотрения обращения приостанавливается на период до поступления ответа на указанный запрос.`
              : `По Вашему обращению №${c.appealNumber || c.id} от ${formatDate(c.appealDate)} направлен запрос о предоставлении необходимых материалов в соответствующие органы. Срок рассмотрения обращения не приостанавливается.`,
          });
      }
      const unapprovedRequests = c.requests.filter(
        (item) => !item.sent && !item.approved,
      );
      const remainingSignedRequests = c.requests.filter((item) => !item.sent);
      c.status = remainingSignedRequests.length
        ? unapprovedRequests.length
          ? "request_approval"
          : "request_signed"
        : allResponsesReceived(c)
          ? "materials"
          : "request_approved";
      title = `Запрос в ${request.recipient} подписан`;
      note = remainingSignedRequests.length
        ? unapprovedRequests.length
          ? `Запрос направлен адресату. Осталось согласовать: ${unapprovedRequests.length}; подписать: ${remainingSignedRequests.length}.`
          : `Осталось подписать запросов: ${remainingSignedRequests.length}.`
        : directedToDvgaOrKvga(c)
          ? "Все подписанные запросы направлены отдельно в кабинеты ДВГА и КВГА для подготовки мотивированных ответов."
          : "Подписанные запросы ожидают поступления ответов.";
      break;
    }
    case "approve-certificate": {
      if (!c.certificate)
        throw new Error("Сначала сформируйте справку по доводам");
      c.status = "certificate_signed";
      title = "Справка согласована";
      note = "Справка согласована и ожидает подписи исполнителя ДАВГА.";
      break;
    }
    case "sign-certificate": {
      if (!c.certificate) throw new Error("Справка по доводам не сформирована");
      c.status = "certificate_approved";
      title = "Справка подписана";
      note =
        "Справка подписана. Опрос о присутствии направляется автоматически при создании заседания.";
      if (c.repeatHearingStatus === "required") {
        c.repeatHearingStatus = "ready";
        c.repeatHearingReadyAt = date;
        note =
          "Обновлённая справка подписана. Обращение отмечено как готовое к повторному заседанию и будет автоматически включено в ближайшее заседание.";
        next.notifications.push({
          id: `repeat-hearing-${c.id}-${next.notifications.length + 1}`,
          caseId: c.id,
          recipient: ROLES.work,
          recipientRole: "work",
          date,
          read: false,
          kind: "repeat-hearing",
          text: `Обращение №${c.appealNumber || c.id} готово к повторному заседанию. Система включит его в ближайшее заседание автоматически.`,
        });
      }
      break;
    }
    case "review-commission-documents": {
      c.status = "commission_voting";
      title = "Члены АК ознакомились с документами";
      note =
        "Ознакомление членов апелляционной комиссии со справкой и материалами обращения завершено. Состав участников определяется подтверждёнными ответами «Да» в опросе о присутствии.";
      doc("Ознакомление членов АК с документами", "commission-review", note);
      break;
    }
    case "choose-commission-members": {
      throw new Error(
        "Состав участников определяется ответами в опросе о присутствии",
      );
    }
    case "commission-vote": {
      const voterId = text("commissionMember", "Голосующий член АК");
      const voter = c.members.find((member) => member.id === voterId);
      if (!voter) throw new Error("Выберите участника АК из состава заседания");
      const chairId = presidingChairId(c.members);
      if (!chairId)
        throw new Error(
          "Для проведения голосования должен присутствовать Вице-министр или Директор ДАВГА",
        );
      c.votes ||= {};
      for (const point of disputed(c)) {
        const vote = normalizeVoteChoice(
          text(`commissionVote_${point.id}`, `Голос по пункту ${point.number}`),
        );
        if (!vote) throw new Error("Выберите вариант голоса по каждому пункту");
        const result = c.votes[point.id] || {
          yes: 0,
          no: 0,
          approved: false,
          chair: chairId,
          present: c.members.length,
          eligible: c.members.length,
          votes: {},
          voteReasons: {},
        };
        result.votes ||= {};
        result.voteReasons ||= {};
        result.votes[voter.id] = vote;
        result.voteReasons[voter.id] = String(
          form.get(`commissionReason_${point.id}`) || "",
        ).trim();
        const recordedVotes = c.members.map((member) =>
          normalizeVoteChoice(result.votes![member.id]),
        );
        result.yes = recordedVotes.filter((item) => item === "accept").length;
        result.no = recordedVotes.filter((item) => item === "reject").length;
        result.present = c.members.length;
        result.eligible = c.members.length;
        const allVoted = recordedVotes.every(Boolean);
        const outcome = allVoted
          ? pointOutcomeFromVotes(result.votes, chairId)
          : "";
        result.approved = outcome === "accept";
        c.votes[point.id] = result;
        if (allVoted && outcome) {
          point.proposal = outcome;
          point.final = outcome;
        }
      }
      const allVotesRecorded = disputed(c).every((point) =>
        c.members.every((member) => {
          const vote = c.votes?.[point.id]?.votes?.[member.id];
          return Boolean(normalizeVoteChoice(vote));
        }),
      );
      c.status = allVotesRecorded ? "circulated" : "commission_voting";
      title = allVotesRecorded
        ? "Голосование членов АК завершено"
        : `Голос ${voter.name} зафиксирован`;
      note = allVotesRecorded
        ? "Все участники АК проголосовали по оспариваемым пунктам. Обращение готово к проведению заседания."
        : "Ожидаются голоса остальных участников АК по каждому оспариваемому пункту.";
      doc("Голосование членов АК", "commission-vote", note);
      break;
    }
    case "fill-meeting-certificate": {
      if (!c.certificate)
        throw new Error("Сначала сформируйте и направьте справку членам АК");
      if (!c.members.length)
        throw new Error(
          "В последнем опросе о присутствии нет участников заседания",
        );
      const chairId = presidingChairId(c.members);
      if (!chairId)
        throw new Error(
          "Для заполнения справки должен присутствовать Вице-министр или Директор ДАВГА",
        );

      c.votes ||= {};
      for (const point of disputed(c)) {
        for (const member of c.members) {
          const manualResult = normalizeVoteChoice(
            String(
              form.get(`meetingCertificateResult_${point.id}_${member.id}`) ||
                form.get(`meetingCertificateResult_${member.id}`) ||
                "",
            ),
          );
          const comment = String(
            form.get(`meetingCertificateComment_${point.id}_${member.id}`) ||
              form.get(`meetingCertificateComment_${member.id}`) ||
              "",
          ).trim();
          if (!manualResult) continue;
          const result = c.votes[point.id] || {
            yes: 0,
            no: 0,
            approved: false,
            chair: chairId,
            present: c.members.length,
            eligible: c.members.length,
            votes: {},
            voteReasons: {},
          };
          result.votes ||= {};
          result.voteReasons ||= {};
          result.votes[member.id] = manualResult;
          result.voteReasons[member.id] = comment;
          const recordedVotes = c.members.map((item) =>
            normalizeVoteChoice(result.votes![item.id]),
          );
          result.yes = recordedVotes.filter((item) => item === "accept").length;
          result.no = recordedVotes.filter((item) => item === "reject").length;
          result.present = c.members.length;
          result.eligible = c.members.length;
          const allVoted = recordedVotes.every(Boolean);
          const outcome = allVoted
            ? pointOutcomeFromVotes(result.votes, chairId)
            : "";
          result.approved = outcome === "accept";
          c.votes[point.id] = result;
          if (allVoted && outcome) {
            point.proposal = outcome;
            point.final = outcome;
          }
        }
      }

      const savedPositions = new Map(
        c.certificate.memberPositions.map((position) => [
          `${position.pointId || "legacy"}_${position.id}`,
          position,
        ]),
      );
      c.certificate.memberPositions = disputed(c).flatMap((point) =>
        c.members.map((member) => ({
          id: member.id,
          name: member.name,
          pointId: point.id,
          pointNumber: point.number,
          result: normalizeVoteChoice(c.votes?.[point.id]?.votes?.[member.id]),
          comment: String(
            form.get(`meetingCertificateComment_${point.id}_${member.id}`) ||
              form.get(`meetingCertificateComment_${member.id}`) ||
              savedPositions.get(`${point.id}_${member.id}`)?.comment ||
              savedPositions.get(`legacy_${member.id}`)?.comment ||
              "",
          ).trim(),
        })),
      );

      const allVotesRecorded = disputed(c).every((point) =>
        c.members.every((member) =>
          Boolean(normalizeVoteChoice(c.votes?.[point.id]?.votes?.[member.id])),
        ),
      );
      if (allVotesRecorded) c.status = "meeting_certificate_approved";
      title = "Справка заполнена результатами голосования";
      note =
        "В справке зафиксированы голоса и комментарии участников заседания. Результаты, внесённые вручную, учитываются наравне с электронными голосами.";
      doc("Справка: результаты голосования членов АК", "certificate", note);
      break;
    }
    case "approve-meeting-certificate": {
      if (!c.certificate?.memberPositions.length)
        throw new Error(
          "Сначала заполните и сохраните справку результатами голосования",
        );
      c.status = "meeting_certificate_signed";
      title = "Справка согласована";
      note =
        "Справка по результатам голосования согласована и ожидает подписи исполнителя рабочего органа.";
      break;
    }
    case "sign-meeting-certificate": {
      if (!c.certificate?.memberPositions.length)
        throw new Error("Справка результатами голосования не заполнена");
      c.status = "meeting_certificate_approved";
      title = "Справка подписана";
      note =
        "Справка по результатам голосования подписана. Можно зафиксировать проведение заседания.";
      break;
    }
    case "fill-request-response": {
      const request = pendingDvgaOrKvgaRequest(c, role);
      if (!request)
        throw new Error("Это действие доступно только для запроса в ДВГА/КВГА");
      request.authorityResponses ||= {};
      for (const point of disputed(c)) {
        const finding = text(
          `authorityFinding_${point.id}`,
          `Нарушение по пункту ${point.number}`,
        );
        const response = text(
          `authorityResponse_${point.id}`,
          `Мотивированный ответ по пункту ${point.number}`,
        );
        request.authorityResponses[point.id] = { finding, response };
        point.authorityFinding = finding;
        point.position = response;
      }
      request.responded = date;
      doc(
        `Заполненное приложение к запросу в ${request.recipient}`,
        "authority-response-appendix",
        `Заполненное приложение к запросу в ${request.recipient}.`,
        request.id,
      );
      note =
        "Мотивированные ответы ДВГА/КВГА заполнены по всем оспариваемым пунктам.";
      c.status =
        requestRoutingStatus(c) || authorityStatus(c) || "response_approval";
      doc(
        request.route === "additional-hearing"
          ? "Дополнительный мотивированный ответ ДВГА/КВГА по дополнительному запросу"
          : "Мотивированный ответ ДВГА/КВГА",
        "authority-response",
        note,
        request.id,
      );
      break;
    }
    case "approve-response": {
      const request = authorityRequestsForRole(c, role).find(
        (item) => !!item.responded && !item.responseApproved,
      );
      if (!request) throw new Error("Нет ответа, ожидающего согласования");
      request.responseApproved = date;
      c.status =
        requestRoutingStatus(c) || authorityStatus(c) || "response_signed";
      title = "Ответ ДВГА/КВГА согласован";
      note = "Согласованный ответ ДВГА/КВГА ожидает подписания.";
      break;
    }
    case "sign-response": {
      const request = authorityRequestsForRole(c, role).find(
        (item) => !!item.responseApproved && !item.responseSigned,
      );
      if (!request) throw new Error("Нет согласованного ответа для подписания");
      request.responseSigned = date;
      request.lifecycleStatus = "response_received";
      const pausedDays = advanceAfterResponses(c, date);
      if (pausedDays === null)
        c.status =
          requestRoutingStatus(c) || authorityStatus(c) || "request_approved";
      title = "Ответ ДВГА/КВГА подписан";
      note =
        pausedDays === null
          ? "Ответ получен в кабинете SAQ. Обращение ожидает ответы по остальным направленным запросам."
          : "Все ответы поступили в SAQ. Обращение автоматически переведено на этап «Материалы».";
      if (pausedDays && pausedDays > 0)
        note += ` Срок рассмотрения продлён на ${pausedDays} раб. дн.`;
      next.notifications.push({
        id: `notification-${c.id}-${next.notifications.length + 1}`,
        caseId: c.id,
        recipient: ROLES.work,
        recipientRole: "work",
        date,
        read: false,
        kind: "request-response",
        text: `Поступил ответ ${request.recipient} на запрос по обращению №${c.appealNumber || c.id}. Откройте обращение для ознакомления.`,
      });
      break;
    }
    case "position": {
      if (!allResponsesReadyForConfirmation(c))
        throw new Error(
          "Зафиксировать получение можно после поступления ответов на все запросы",
        );
      const receivedRequests = c.requests.filter(
        (request) => !request.confirmed,
      );
      if (!receivedRequests.length)
        throw new Error("Все полученные ответы уже зафиксированы");
      receivedRequests.forEach((request) => {
        if (!isDvgaOrKvgaRequest(request.recipient) && !request.responded)
          request.responded = date;
        request.confirmed = date;
      });
      note = `Рабочий орган зафиксировал получение ответов: ${receivedRequests
        .map((request) => request.recipient)
        .join(", ")}.`;
      if (c.requestPauseStartedAt && canSuspendReview(c)) {
        const pausedDays = workdaysBetween(c.requestPauseStartedAt, date);
        if (pausedDays > 0) {
          c.pauseDays += pausedDays;
          note += ` Срок рассмотрения продлён на ${pausedDays} раб. дн.`;
        }
      }
      c.requestPauseStartedAt = undefined;
      if (
        c.requestRoute === "additional-analysis" ||
        c.requestRoute === "additional-commission" ||
        c.requestRoute === "additional-hearing"
      ) {
        c.requestRouteCompletedAt = date;
      }
      c.status = "materials";
      doc("Полученные материалы по запросам", "position", note);
      break;
    }
    case "record-external-response": {
      const requestId = text("externalRequestId", "Запрос другого органа");
      const request = c.requests.find(
        (item) =>
          item.id === requestId &&
          item.template === "other" &&
          !item.saqRecipient &&
          Boolean(item.sent) &&
          !item.responded,
      );
      if (!request)
        throw new Error(
          "Выберите подписанный запрос другого органа, ожидающий ответа",
        );
      request.responded = date;
      request.responseRegistrationNumber = String(
        form.get("responseRegistrationNumber") || "",
      ).trim();
      request.lifecycleStatus = "response_received";
      const pausedDays = advanceAfterResponses(c, date);
      title = `Ответ ${request.recipient} зафиксирован`;
      note =
        pausedDays === null
          ? `Ответ ${request.recipient} сохранён. Обращение ожидает ответы по остальным направленным запросам.`
          : "Получены ответы по всем направленным запросам. Обращение автоматически переведено на этап «Материалы».";
      if (pausedDays && pausedDays > 0)
        note += ` Срок рассмотрения продлён на ${pausedDays} раб. дн.`;
      doc(`Ответ ${request.recipient}`, "position", note, request.id);
      break;
    }
    case "subject-response": {
      if (
        (role !== "demo-superuser" && !isSubjectRole(role)) ||
        (role !== "demo-superuser" && role !== subjectRoleForCase(c))
      )
        throw new Error("Ответ может направить только Объект");
      const request = c.requests.find(
        (item) =>
          item.template === "other" &&
          item.saqRecipient === "subject" &&
          Boolean(item.sent) &&
          !item.responded,
      );
      if (!request) throw new Error("Нет запроса, ожидающего ответа Объекта");
      request.responded = date;
      request.lifecycleStatus = "response_received";
      const pausedDays = advanceAfterResponses(c, date);
      title = "Ответ направлен рабочему органу";
      note =
        pausedDays === null
          ? "Ответ Объекта направлен в кабинет рабочего органа."
          : "Все ответы поступили в SAQ. Обращение автоматически переведено на этап «Материалы».";
      if (pausedDays && pausedDays > 0)
        note += ` Срок рассмотрения продлён на ${pausedDays} раб. дн.`;
      next.notifications.push({
        id: `notification-${c.id}-${next.notifications.length + 1}`,
        caseId: c.id,
        recipient: ROLES.work,
        recipientRole: "work",
        date,
        read: false,
        kind: "request-response",
        text: `Из кабинета Объекта поступил ответ на запрос по обращению №${c.appealNumber || c.id}. Откройте обращение для ознакомления.`,
      });
      break;
    }
    case "analysis": {
      const points = disputed(c);
      const argumentNames = points.map((point) => `davgaArguments_${point.id}`);
      if (argumentNames.some((name) => form.has(name))) {
        c.certificate = {
          davgaArguments: "",
          davgaArgumentsByPoint: Object.fromEntries(
            points.map((point) => [
              point.id,
              text(
                `davgaArguments_${point.id}`,
                `Доводы ДАВГА по пункту ${point.number}`,
              ),
            ]),
          ),
          memberPositions: [],
        };
        c.status = "certificate_approval";
        c.result = null;
        c.votes = null;
        c.meeting = null;
        note =
          "Справка сформирована и направлена заместителю директора ДАВГА на согласование.";
        doc(
          "Справка по результатам изучения и анализа возражения",
          "certificate",
          note,
        );
        next.notifications.push({
          id: `notification-${c.id}-${next.notifications.length + 1}`,
          caseId: c.id,
          recipient: ROLES.deputy,
          recipientRole: "deputy",
          date,
          read: false,
          text: `В ваш кабинет поступила справка по обращению №${c.appealNumber || c.id} для согласования.`,
        });
        break;
      }
      for (const point of disputed(c)) {
        point.analysis = text(
          `analysis_${point.id}`,
          `Анализ пункта ${point.number}`,
        );
        point.legal = text(
          `legal_${point.id}`,
          `Норма по пункту ${point.number}`,
        );
        const value = text(`proposal_${point.id}`, "Проект результата");
        if (!(value in OUTCOMES))
          throw new Error("Выберите допустимый результат");
        point.proposal = value as Outcome;
        const amount =
          point.proposal === "accept"
            ? 0
            : point.proposal === "reject"
              ? point.amount
              : Number(text(`amount_${point.id}`, "Оставшаяся сумма"));
        if (!Number.isFinite(amount) || amount < 0 || amount > point.amount)
          throw new Error("Оставшаяся сумма должна быть в пределах исходной");
        point.remainingAmount = amount;
      }
      c.status = "circulated";
      c.result = null;
      c.votes = null;
      c.meeting = null;
      doc("Справка по доводам", "analysis", note);
      break;
    }
    case "edit-certificate": {
      if (!c.certificate) throw new Error("Справка ещё не сформирована");
      const points = disputed(c);
      const davgaArgumentsByPoint = Object.fromEntries(
        points.map((point) => [
          point.id,
          text(
            `certificateDavga_${point.id}`,
            `Доводы ДАВГА по пункту ${point.number}`,
          ),
        ]),
      );
      c.certificate = {
        ...c.certificate,
        davgaArguments:
          points
            .map((point) => davgaArgumentsByPoint[point.id])
            .find(Boolean) || c.certificate.davgaArguments,
        davgaArgumentsByPoint,
      };
      const resultCertificateName = "Справка: результаты голосования членов АК";
      const version = Math.max(
        2,
        c.documents.filter(
          (document) =>
            document.name === resultCertificateName ||
            document.name.startsWith(`${resultCertificateName}. Версия `),
        ).length + 1,
      );
      title = `Создана версия ${version} справки`;
      note =
        "Доводы ДАВГА обновлены. Предыдущая версия справки сохранена без изменений.";
      doc(`${resultCertificateName}. Версия ${version}`, "certificate", note);
      break;
    }
    case "control-analysis": {
      for (const point of disputed(c)) {
        point.analysis = text(
          `analysis_${point.id}`,
          `Анализ пункта ${point.number}`,
        );
        point.legal = text(
          `legal_${point.id}`,
          `Норма по пункту ${point.number}`,
        );
        const value = text(`proposal_${point.id}`, "Проект результата");
        if (!(value in OUTCOMES))
          throw new Error("Выберите допустимый результат");
        point.proposal = value as Outcome;
        const amount =
          point.proposal === "accept"
            ? 0
            : point.proposal === "reject"
              ? point.amount
              : Number(text(`amount_${point.id}`, "Оставшаяся сумма"));
        if (!Number.isFinite(amount) || amount < 0 || amount > point.amount)
          throw new Error("Оставшаяся сумма должна быть в пределах исходной");
        point.remainingAmount = amount;
      }
      checked(form, "fullCase", "noWorsening");
      note = text("scope", "Результат изучения всего административного дела");
      c.status = "hearing";
      c.result = null;
      c.votes = null;
      c.meeting = null;
      doc("Анализ административного дела", "analysis", note);
      break;
    }
    case "members":
      if (form.has("meetingConducted")) {
        if (!c.certificate?.memberPositions.length)
          throw new Error("Сначала заполните и сохраните справку");
        c.memberPosition = "Заседание по данному делу проведено.";
        c.status = "meeting";
        note =
          "Заседание по данному делу проведено. Обращение переведено на этап принятия решения.";
        doc("Сведения о проведении заседания", "members", note);
        break;
      }
      c.memberPosition = text("position", "Позиции членов комиссии");
      checked(form, "shared");
      c.status = "hearing";
      doc("Позиции членов комиссии", "members", c.memberPosition);
      break;
    case "hearing": {
      const mode = text("mode", "Порядок заслушивания");
      if (mode !== "hold") {
        if (mode === "favorable" && overall(c) !== "accept")
          throw new Error(
            "Проект не является полностью благоприятным для заявителя",
          );
        if (!["favorable", "request"].includes(mode))
          throw new Error("Недопустимое основание");
        c.hearing = {
          skip: true,
          reason: text("reason", "Документальное основание исключения"),
        };
        c.status = "meeting";
        doc(
          "Основание непроведения заслушивания",
          "hearing",
          c.hearing.reason!,
        );
      } else {
        const hearingDate = text("hearingDate", "Дата заслушивания");
        dateObject(hearingDate);
        if (hearingDate < addWorkdays(date, 3))
          throw new Error(
            "Извещение должно быть направлено не менее чем за 3 рабочих дня",
          );
        checked(form, "notified");
        if (c.type === "control") checked(form, "issuerNotified");
        c.hearing = {
          skip: false,
          notice: date,
          date: hearingDate,
          note: text("preliminary", "Предварительное решение"),
        };
        c.status = "hearing_ready";
        doc(
          "Извещение о заслушивании",
          "hearing",
          `Заслушивание ${hearingDate}. ${c.hearing.note}`,
        );
      }
      break;
    }
    case "hearing-held":
      if (!c.hearing?.date || date < c.hearing.date)
        throw new Error(
          "Дата проведения не может быть раньше назначенного заслушивания",
        );
      c.hearing.subject = text(
        "subject",
        "Позиция заявителя или сведения о неявке",
      );
      if (c.type === "control")
        c.hearing.issuer = text("issuer", "Позиция органа");
      c.hearing.note = text(
        "note",
        "Результат заслушивания и рассмотрения доводов",
      );
      c.hearing.held = date;
      checked(form, "recorded");
      c.status = "meeting";
      doc("Протокол заслушивания", "hearing", c.hearing.note);
      break;
    case "vote": {
      // New protocol forms use the participants of the latest attendance poll.
      // The fallback supports cases that were created before attendance polls.
      const legacyMembers = Array.from(form.entries())
        .filter(
          ([name, value]) =>
            name.startsWith("protocolMember_") &&
            typeof value === "string" &&
            value.trim().length > 0,
        )
        .map(([name, value]) => ({
          id: `protocol-member-${name.replace("protocolMember_", "")}`,
          name: String(value).trim(),
        }));
      if (legacyMembers.length) {
        c.members = legacyMembers.map((member) => ({
          id: member.id,
          name: member.name,
          present: true,
          isChair: member.id === legacyMembers[0]?.id,
          recused: false,
          reason: "",
        }));
      }
      if (!c.members.length)
        throw new Error(
          "В последнем опросе о присутствии нет участников с ответом «Да»",
        );
      c.votes = {};
      for (const point of disputed(c)) {
        const memberVotes = Object.fromEntries(
          c.members.map((member) => {
            const vote = normalizeVoteChoice(
              String(form.get(`protocolVote_${point.id}_${member.id}`) || ""),
            );
            if (!vote)
              throw new Error(
                "Выберите вариант голоса для каждого члена АК по всем пунктам",
              );
            return [member.id, vote];
          }),
        );
        const yes = Object.values(memberVotes).filter(
          (vote) => vote === "accept",
        ).length;
        const no = Object.values(memberVotes).filter(
          (vote) => vote === "reject",
        ).length;
        const chairId = presidingChairId(c.members);
        if (!chairId)
          throw new Error(
            "Для проведения голосования должен присутствовать Вице-министр или Директор ДАВГА",
          );
        const outcome = pointOutcomeFromVotes(memberVotes, chairId);
        if (!outcome)
          throw new Error("Не удалось определить результат голосования");
        c.votes[point.id] = {
          yes,
          no,
          approved: outcome === "accept",
          chair: chairId,
          present: c.members.length,
          eligible: c.members.length,
          votes: memberVotes,
          voteReasons: Object.fromEntries(
            c.members.map((member) => [
              member.id,
              String(
                form.get(`protocolReason_${point.id}_${member.id}`) || "",
              ).trim(),
            ]),
          ),
        };
        point.proposal = outcome;
        point.final = outcome;
      }
      const protocolDate = String(form.get("protocolDate") || date);
      const meetingFormat =
        String(form.get("meetingFormat") || "онлайн, Qosyl") === "офлайн"
          ? "офлайн"
          : "онлайн, Qosyl";
      const recommendationText = String(
        form.get("recommendations") || "",
      ).trim();
      dateObject(protocolDate);
      c.meeting = {
        date: protocolDate,
        // Номер присваивается только после подписания протокола.
        number: "",
        audio: "",
        format: meetingFormat,
        projectReceived: date,
        recommendations: recommendationText || undefined,
      };
      c.status = "protocol";
      doc(
        "Проект протокола заседания",
        "protocol",
        "Состав участников зафиксирован. Ожидаются подписи участников и секретаря.",
      );
      break;
    }
    case "sign": {
      checked(
        form,
        "secretary",
        ...c.members
          .filter((member) => member.present)
          .map((member) => `signed_${member.id}`),
      );
      if (!c.meeting) throw new Error("Протокол не сформирован");
      c.meeting.signed = date;
      const [year, month] = date.split("-");
      const signedProtocolCount = next.cases.filter((item) =>
        Boolean(item.meeting?.signed),
      ).length;
      c.meeting.number = `ПЗ-${month}/${year}-${signedProtocolCount}`;
      const result = overall(c);
      if (!result) throw new Error("Результат голосования не определён");
      c.result = {
        label: OUTCOMES[result],
        reason: text("reason", "Итоговая мотивировка"),
        effect: effect(c),
        date,
        number: c.meeting.number,
      };
      // Если заявление уже прошло первый проект решения и повторное
      // заседание было назначено после дополнительных доводов/запроса,
      // второй проект решения не формируется. После подписания повторного
      // протокола обращение сразу переходит к мотивированному ответу.
      const repeatHearingAfterDecisionProject =
        isStatement(c) &&
        Boolean(c.decisionProject) &&
        c.repeatHearingStatus === "scheduled";
      c.status =
        requiresEotinishDecisionProject(c) &&
        !repeatHearingAfterDecisionProject
          ? "decision_project"
          : "decided";
      if (repeatHearingAfterDecisionProject) {
        c.repeatHearingStatus = undefined;
        title = "Повторный протокол подписан";
        note =
          "Повторное заседание завершено. Второй проект решения не формируется; обращение переведено к формированию мотивированного ответа.";
      }
      doc("Подписанный протокол заседания", "protocol", c.result.reason);
      break;
    }
    case "create-decision-project": {
      const defaultChannel = hasSubjectSaqCabinet(c) ? "saq" : "external";
      const requestedSubjectChannel =
        String(form.get("projectSubjectChannel") || "") === "external"
          ? "external"
          : String(form.get("projectSubjectChannel") || "") === "saq"
            ? "saq"
            : defaultChannel;
      const subjectChannel =
        requestedSubjectChannel === "saq" && !hasSubjectSaqCabinet(c)
          ? "external"
          : requestedSubjectChannel;
      c.decisionProject = {
        date,
        // Для проекта решения исходящий номер не оформляется: его укажут
        // при направлении окончательного ответа.
        number: String(form.get("number") || ""),
        receipt: String(form.get("receipt") || ""),
        channel: String(form.get("channel") || ""),
        appealCourt: String(form.get("appealCourt") || ""),
        appealProcedure: String(form.get("appealProcedure") || ""),
      };
      c.decisionProjectRecipients = [
        {
          id: "subject",
          recipient: c.org || "Заявитель",
          recipientRole: subjectRoleForCase(c),
          purpose: "comments",
          channel: subjectChannel,
          status: "pending",
        },
      ];
      disputed(c).forEach((point) => {
        point.finalDecisionByMajority =
          form.get(`finalResponseMajority_${point.id}`) === "on";
      });
      c.status = "decision_project_approval";
      doc(
        c.appealType === "Заявление"
          ? "Проект решения по заявлению"
          : "Проект решения по жалобе",
        "decision-project",
        c.result?.reason || "",
      );
      break;
    }
    case "approve-decision-project":
      if (!c.decisionProject)
        throw new Error("Проект решения ещё не сформирован");
      c.status = "decision_project_signed";
      title = "Проект решения согласован";
      note = "Согласованный проект решения ожидает подписания.";
      break;
    case "sign-decision-project":
      if (!c.decisionProject)
        throw new Error("Проект решения ещё не сформирован");
      const recipients: DecisionProjectRecipient[] = decisionProjectRecipients(c)
        .filter((recipient) => recipient.purpose === "comments")
        .map((recipient) => ({
        ...recipient,
        status:
          recipient.channel === "saq"
            ? "sent"
            : recipient.channel === "none"
              ? "not_sent"
              : "pending",
        sentAt: recipient.channel === "saq" ? date : undefined,
        }));
      const subjectRecipient = recipients.find(
        (recipient) => recipient.purpose === "comments",
      );
      c.decisionProjectRouting = {
        recipients,
        ...(subjectRecipient?.channel === "saq"
          ? {
              channel: "saq" as const,
              sentAt: date,
              receivedAt: date,
              commentsDeadline: addWorkdays(date, 2),
            }
          : {}),
      };
      if (subjectRecipient?.channel === "saq" && subjectRecipient.recipientRole)
        next.notifications.push({
          id: `decision-project-subject-${c.id}-${next.notifications.length + 1}`,
          caseId: c.id,
          recipient: subjectRecipient.recipient,
          recipientRole: subjectRecipient.recipientRole,
          date,
          read: false,
          text: `В кабинет направлен проект решения по обращению №${c.appealNumber || c.id}. Замечания можно направить до ${c.decisionProjectRouting?.commentsDeadline}.`,
        });
      const pendingExternal = recipients.filter(
        (recipient) => recipient.channel === "external" && recipient.status === "pending",
      );
      if (pendingExternal.length) {
        c.status = "decision_project_delivery";
        title = "Проект решения подписан";
        note = "Зафиксируйте внешнее направление проекта решения заявителю.";
      } else {
        c.status = "decision_project_comments";
        title = "Проект решения подписан и направлен";
        note = `Проект решения автоматически направлен в кабинет SAQ. Срок для замечаний — до ${c.decisionProjectRouting?.commentsDeadline}.`;
      }
      doc("Подписанный проект решения", "decision-project", note);
      break;
    case "record-decision-project-delivery": {
      if (!c.decisionProject)
        throw new Error("Проект решения ещё не сформирован");
      c.decisionProjectRouting ??= { recipients: defaultDecisionProjectRecipients(c) };
      const recipient = c.decisionProjectRouting.recipients.find(
        (item) => item.id === "subject" && item.channel === "external" && item.status === "pending",
      );
      if (!recipient) throw new Error("Нет направления проекта решения заявителю для фиксации");
      const sentAt = text("projectSentDate", "Дата отправки");
      dateObject(sentAt);
      const deliveryPath = text("projectDeliveryPath", "Способ отправки");
      recipient.status = "sent";
      recipient.sentAt = sentAt;
      recipient.deliveryPath = deliveryPath;
      recipient.registrationNumber =
        String(form.get("projectRegistrationNumber") || "").trim() || undefined;
      c.decisionProjectRouting.channel = "external";
      c.decisionProjectRouting.sentAt = sentAt;
      c.decisionProjectRouting.receivedAt = sentAt;
      c.decisionProjectRouting.commentsDeadline = addWorkdays(sentAt, 2);
      c.decisionProjectRouting.deliveryPath = deliveryPath;
      c.decisionProjectRouting.registrationNumber = recipient.registrationNumber;
      c.status = "decision_project_comments";
      title = "Направление проекта решения зафиксировано";
      note = `Проект решения направлен заявителю ${sentAt} через ${deliveryPath}. Срок для замечаний — до ${c.decisionProjectRouting.commentsDeadline}.`;
      break;
    }
    case "submit-decision-project-comment": {
      if (c.decisionProjectRouting?.channel !== "saq")
        throw new Error("Замечание из кабинета SAQ недоступно");
      if (
        c.decisionProjectRouting.commentsDeadline &&
        date > c.decisionProjectRouting.commentsDeadline
      )
        throw new Error(
          "Срок для направления замечаний к проекту решения истёк",
        );
      const commentText = text("projectComment", "Замечание к проекту решения");
      c.decisionProjectRouting.commentReceivedAt = date;
      c.decisionProjectRouting.commentChannel = "Кабинет SAQ";
      c.decisionProjectRouting.commentText = commentText;
      c.status = "decision_project_eotinish";
      title = "Замечание к проекту решения направлено";
      note =
        "Замечание поступило рабочему органу. Доступно назначение заслушивания.";
      doc(
        "Замечание к проекту решения",
        "decision-project-comment",
        commentText,
      );
      next.notifications.push({
        id: `decision-project-comment-${c.id}-${next.notifications.length + 1}`,
        caseId: c.id,
        recipient: ROLES.work,
        recipientRole: "work",
        date,
        read: false,
        text: `Поступило замечание к проекту решения по обращению №${c.appealNumber || c.id}.`,
      });
      break;
    }
    case "record-external-decision-project-comment": {
      if (c.decisionProjectRouting?.channel !== "external")
        throw new Error(
          "Внешнее замечание доступно только после направления проекта решения вне SAQ",
        );
      const receivedAt = text(
        "projectCommentReceivedAt",
        "Дата поступления замечания",
      );
      dateObject(receivedAt);
      const commentText = text("projectComment", "Замечание к проекту решения");
      c.decisionProjectRouting.commentReceivedAt = receivedAt;
      c.decisionProjectRouting.commentChannel = text(
        "projectCommentChannel",
        "Канал поступления",
      );
      c.decisionProjectRouting.commentRegistrationNumber =
        String(form.get("projectCommentRegistrationNumber") || "").trim() ||
        undefined;
      c.decisionProjectRouting.commentText = commentText;
      c.status = "decision_project_eotinish";
      title = "Замечание к проекту решения зафиксировано";
      note = "Замечание зарегистрировано. Доступно назначение заслушивания.";
      doc(
        "Замечание к проекту решения",
        "decision-project-comment",
        commentText,
      );
      break;
    }
    case "proceed-to-final-response": {
      if (!c.decisionProjectRouting)
        throw new Error("Сначала зафиксируйте направление проекта решения");
      const reason = text("reason", "Причина перехода");
      c.hearing = { ...(c.hearing || {}), skip: true, reason };
      c.status = "decided";
      title = "Переход к мотивированному ответу зафиксирован";
      note = reason;
      break;
    }
    case "send-decision-project-eotinish":
      if (!c.decisionProject)
        throw new Error("Проект решения ещё не сформирован");
      if (!c.decisionProjectRouting?.commentReceivedAt)
        throw new Error(
          "Заслушивание назначается после поступления замечания к проекту решения",
        );
      const hearingDateTime = text(
        "hearingDateTime",
        "Дата и время заслушивания",
      );
      if (!hearingDateTime.includes("T"))
        throw new Error("Укажите дату и время заслушивания");
      const hearingLocation = text(
        "hearingLocation",
        "Место или формат проведения заслушивания",
      );
      const hearingNoticeDate = text(
        "hearingNoticeDate",
        "Дата направления уведомления",
      );
      c.status = "decision_project_hearing";
      c.hearing = {
        skip: false,
        date: hearingDateTime,
        location: hearingLocation,
        notice: hearingNoticeDate,
        noticeChannel: text(
          "hearingNoticeChannel",
          "Канал отправки уведомления",
        ),
      };
      title = "Заслушивание назначено";
      note = `Дата и время: ${hearingDateTime}. Место или формат: ${hearingLocation}. Уведомление направлено ${hearingNoticeDate} через ${c.hearing.noticeChannel}.`;
      doc("Извещение о назначении заслушивания", "hearing", note);
      if (hasSubjectSaqCabinet(c))
        next.notifications.push({
          id: `hearing-notice-${c.id}-${next.notifications.length + 1}`,
          caseId: c.id,
          recipient: ROLES[subjectRoleForCase(c)],
          recipientRole: subjectRoleForCase(c),
          date,
          read: false,
          text: `В кабинет направлено извещение о заслушивании по обращению №${c.appealNumber || c.id}: ${hearingDateTime}.`,
        });
      break;
    case "hearing-after-decision-project":
      if (!c.decisionProject)
        throw new Error("Проект решения ещё не сформирован");
      if (!form.has("hearingProtocolAttached"))
        throw new Error("Вложите протокол заслушивания");
      if (c.hearing) c.hearing.held = date;

      if (isStatement(c)) {
        const hearingOutcome = String(form.get("hearingOutcome") || "").trim();
        if (
          ![
            "additional-request",
            "without-request",
            "proceed",
          ].includes(hearingOutcome)
        )
          throw new Error("Выберите дальнейшее действие после заслушивания");

        if (hearingOutcome !== "proceed") {
          const reasonField =
            hearingOutcome === "additional-request"
              ? "additionalRequestReason"
              : "noRequestReason";
          const reason = text(
            reasonField,
            hearingOutcome === "additional-request"
              ? "Причина необходимости дополнительного запроса"
              : "Обоснование отсутствия необходимости в дополнительном запросе",
          );
          const byPoint: Record<string, string> = {};
          disputed(c).forEach((point) => {
            const value = String(
              form.get(`additionalArgument_${point.id}`) || "",
            ).trim();
            if (!value) return;
            byPoint[point.id] = value;
            point.additionalArguments = [
              ...(point.additionalArguments || []),
              value,
            ];
          });
          if (!Object.keys(byPoint).length)
            throw new Error(
              "Укажите дополнительные доводы хотя бы по одному оспариваемому пункту",
            );

          const round = (c.repeatHearingRound || 0) + 1;
          c.hearingSupplements = [
            ...(c.hearingSupplements || []),
            {
              round,
              date,
              reason,
              byPoint,
              requiresRequest: hearingOutcome === "additional-request",
            },
          ];
          c.repeatHearingStatus = "required";
          c.repeatHearingRound = round;
          c.repeatHearingReason = reason;
          c.repeatHearingRequestedAt = date;
          c.repeatHearingReadyAt = undefined;
          c.repeatHearingMeetingId = undefined;
          doc(
            "Дополнительные доводы объекта гос. аудита (заявителя)",
            "hearing-additional-arguments",
            reason,
          );

          if (hearingOutcome === "additional-request") {
            c.requestRoute = "additional-hearing";
            c.requestRouteStartedAt = date;
            c.requestRouteCompletedAt = undefined;
            c.status = "accepted";
            title = "Дополнительный запрос после заслушивания сформирован";
            note =
              `Новые доводы требуют дополнительного запроса. ${reason} ` +
              "Обращение возвращено на этап «Запрос».";
          } else {
            c.status = "materials";
            title = "Дополнительные доводы зафиксированы";
            note =
              `Новые доводы не требуют дополнительного запроса. ${reason} ` +
              "Обращение возвращено к формированию справки.";
          }
          break;
        }
      }
      c.status = "decided";
      title = "Заслушивание проведено";
      note =
        "Протокол заслушивания вложен. Обращение переведено к формированию мотивированного ответа.";
      break;
    case "forward": {
      checked(form, "materials");
      note = text("reason", "Основание передачи или удовлетворения");
      if (form.get("mode") === "satisfy") {
        checked(form, "full");
        c.selfReview = true;
        c.result = {
          label: "Жалоба полностью удовлетворена органом, принявшим акт",
          kind: "cancel",
          reason: note,
          effect: text("effect", "Резолютивная часть"),
          date,
        };
        c.issues
          .filter((point) => point.disputed)
          .forEach((point) => {
            point.final = "accept";
            point.remainingAmount = 0;
          });
        c.status = "decided";
        doc("Решение о полном удовлетворении жалобы", "result", note);
      } else {
        c.authority = text("authority", "Вышестоящий орган");
        c.status = "forwarded";
        doc("Сопроводительное письмо о передаче дела", "forward", note);
      }
      break;
    }
    case "control-decision": {
      checked(form, "competence");
      const kind = text("kind", "Вид решения");
      const decision = controlDecisions.find(([value]) => value === kind);
      if (!decision) throw new Error("Недопустимый вид решения");
      if (kind === "reject" && overall(c) !== "reject")
        throw new Error(
          "Отказ противоречит результатам по пунктам; верните материалы на анализ",
        );
      if (kind === "cancel" && overall(c) !== "accept")
        throw new Error(
          "Полная отмена противоречит результатам по пунктам; уточните проект",
        );
      c.result = {
        kind,
        label: decision[1],
        reason: text("reason", "Мотивировка"),
        effect: text("effect", "Резолютивная часть"),
        number: text("number", "Номер решения"),
        date,
      };
      if (kind !== "without" && kind !== "return")
        disputed(c).forEach((point) => {
          point.final = point.proposal;
        });
      c.status = "decided";
      doc("Решение по жалобе", "result", c.result.reason);
      break;
    }
    case "deliver":
      // The upload screen for a notice sends no delivery requisites: it only
      // stores the conclusion and leaves the case open for explicit closing.
      // Keep the former requisites flow for saved/legacy actions.
      if (requiresConclusion(c) && !form.get("sent")) {
        const registrationDate = text(
          "conclusionRegistrationDate",
          "Дата регистрации",
        );
        dateObject(registrationDate);
        const registrationNumber = text(
          "conclusionRegistrationNumber",
          "Номер регистрации",
        );
        c.conclusionRegistration = {
          date: registrationDate,
          number: registrationNumber,
        };
        note = `Заключение по обращению вложено: №${registrationNumber} от ${formatDate(registrationDate)}.`;
        break;
      }
      const isMotivatedResponse = requiresMotivatedResponse(c);
      c.delivery = {
        date,
        number: isMotivatedResponse
          ? String(form.get("number") || "")
          : text("number", "Исходящий номер"),
        // The receipt is no longer collected with the final response.
        // Preserve it only when replaying legacy form data.
        receipt: String(form.get("receipt") || "").trim(),
        channel: isMotivatedResponse
          ? String(form.get("channel") || "")
          : text("channel", "Канал"),
        // These requisites are no longer filled in the final-response form.
        // Keep optional legacy values so older saved actions continue to render.
        appealCourt: String(form.get("appealCourt") || ""),
        appealProcedure: String(form.get("appealProcedure") || ""),
        published: requiresConclusion(c) ? date : null,
      };
      if (isMotivatedResponse) {
        const defaultChannel = hasSubjectSaqCabinet(c) ? "saq" : "external";
        const requestedSubjectChannel = String(
          form.get("motivatedResponseApplicantChannel") || "",
        );
        const subjectChannel =
          requestedSubjectChannel === "external"
            ? "external"
            : requestedSubjectChannel === "saq" && hasSubjectSaqCabinet(c)
              ? "saq"
              : defaultChannel;
        c.motivatedResponseRouting = {
          recipients: defaultMotivatedResponseRecipients(c).map((recipient) =>
            recipient.id === "applicant"
              ? { ...recipient, channel: subjectChannel }
              : recipient,
          ),
        };
      }
      // Галочка «с большинством голосов» редактируется и при формировании
      // мотивированного ответа, в том числе если ранее был создан проект решения.
      disputed(c).forEach((point) => {
        point.finalDecisionByMajority =
          form.get(`finalResponseMajority_${point.id}`) === "on";
      });
      c.status = "final_response_approval";
      doc(
        isMotivatedResponse
          ? "Проект мотивированного ответа"
          : "Проект окончательного ответа",
        "final-response",
        c.result?.reason ||
          (isMotivatedResponse
            ? "Мотивированный ответ сформирован и ожидает согласования."
            : "Окончательный ответ сформирован и ожидает согласования."),
      );
      doc(
        requiresConclusion(c)
          ? "Заключение по результатам рассмотрения возражения"
          : "Письменный результат рассмотрения",
        "result",
        c.result?.reason || "",
      );
      break;
    case "approve-final-response":
      if (!c.delivery)
        throw new Error(
          requiresMotivatedResponse(c)
            ? "Мотивированный ответ ещё не сформирован"
            : "Окончательный ответ ещё не сформирован",
        );
      c.status = "final_response_signed";
      title = requiresMotivatedResponse(c)
        ? "Мотивированный ответ согласован"
        : "Окончательный ответ согласован";
      note = requiresMotivatedResponse(c)
        ? "Согласованный мотивированный ответ ожидает подписания."
        : "Согласованный окончательный ответ ожидает подписания.";
      break;
    case "sign-final-response":
      if (!c.delivery)
        throw new Error(
          requiresMotivatedResponse(c)
            ? "Мотивированный ответ ещё не сформирован"
            : "Окончательный ответ ещё не сформирован",
        );
      c.delivery.date = date;
      if (requiresMotivatedResponse(c)) {
        const recipients: MotivatedResponseRecipient[] = motivatedResponseRecipients(c).map(
          (recipient) => ({
            ...recipient,
            status: (recipient.channel === "saq"
              ? "sent"
              : recipient.id === "audit-object"
                ? "not_tracked"
                : "pending") as "sent" | "pending" | "not_tracked",
            sentAt: recipient.channel === "saq" ? date : undefined,
          }),
        );
        c.motivatedResponseRouting = { recipients };
        const saqRecipientRoles = recipients
          .filter(
            (recipient) =>
              recipient.channel === "saq" &&
              recipient.status === "sent" &&
              recipient.recipientRole,
          )
          .map((recipient) => recipient.recipientRole!);
        c.delivery.recipientRoles = [
          ...new Set<Role>([authorityRole(c.issuer), ...saqRecipientRoles]),
        ];
        const pendingExternal = recipients.filter(
          (recipient) =>
            recipient.id === "applicant" &&
            recipient.channel === "external" &&
            recipient.status === "pending",
        );
        const auditObjectWithoutTracking = recipients.some(
          (recipient) =>
            recipient.id === "audit-object" &&
            recipient.status === "not_tracked",
        );
        c.status = pendingExternal.length
          ? "final_response_delivery"
          : "completed";
        title = pendingExternal.length
          ? "Мотивированный ответ подписан"
          : "Мотивированный ответ подписан и направлен";
        note = pendingExternal.length
          ? "Ответ автоматически направлен в доступные кабинеты SAQ. Зафиксируйте направление через другую систему для заявителя."
          : auditObjectWithoutTracking
            ? "Мотивированный ответ направлен в доступные кабинеты SAQ. Направление объекту аудита через другую систему не требует фиксации."
            : "Мотивированный ответ направлен в кабинеты SAQ адресатов.";
        doc("Подписанный мотивированный ответ", "final-response", note);
        c.delivery.recipientRoles.forEach((recipientRole) => {
          const recipient = isSubjectRole(recipientRole)
            ? recipients.find(
                (item) =>
                  item.recipientRole === recipientRole &&
                  item.channel === "saq",
              )?.recipient || ROLES[recipientRole]
            : recipientRole === "kvga"
              ? "КВГА"
              : "ДВГА";
          next.notifications.push({
            id: `notification-${c.id}-${next.notifications.length + 1}`,
            caseId: c.id,
            recipient,
            recipientRole,
            date,
            read: false,
            kind: "final-response",
            text: isSubjectRole(recipientRole)
              ? `В кабинет направлен мотивированный ответ по обращению №${c.appealNumber || c.id} от ${formatDate(c.appealDate || c.registered)}.`
              : `Направлен мотивированный ответ на обращение №${c.appealNumber || c.id} от ${formatDate(c.appealDate || c.registered)}.`,
          });
        });
      } else {
        // Для возражения на уведомление сохраняется прежнее направление
        // подписанного окончательного ответа одновременно обоим адресатам.
        c.delivery.recipientRoles = [
          authorityRole(c.issuer),
          subjectRoleForCase(c),
        ];
        c.status = "completed";
        title = "Окончательный ответ подписан";
        note =
          "Окончательный ответ подписан и направлен органу аудита и заявителю.";
        doc("Подписанный окончательный ответ", "final-response", note);
        c.delivery.recipientRoles.forEach((recipientRole) => {
          const recipient = isSubjectRole(recipientRole)
            ? c.org
            : recipientRole === "kvga"
              ? "КВГА"
              : "ДВГА";
          next.notifications.push({
            id: `notification-${c.id}-${next.notifications.length + 1}`,
            caseId: c.id,
            recipient,
            recipientRole,
            date,
            read: false,
            kind: "final-response",
            text: `Направлен окончательный ответ на обращение №${c.appealNumber || c.id} от ${formatDate(c.appealDate || c.registered)}.`,
          });
        });
      }
      break;
    case "record-final-response-delivery": {
      const routing = c.motivatedResponseRouting;
      if (!routing)
        throw new Error("Маршрут мотивированного ответа ещё не сформирован");
      const recipientId = text("motivatedResponseRecipient", "Адресат");
      const recipient = routing.recipients.find(
        (item) =>
          item.id === "applicant" &&
          item.id === recipientId &&
          item.channel === "external" &&
          item.status === "pending",
      );
      if (!recipient)
        throw new Error("Нет внешнего направления мотивированного ответа для фиксации");
      const sentAt = text("motivatedResponseSentAt", "Дата отправки");
      dateObject(sentAt);
      const deliveryPath = text(
        "motivatedResponseDeliveryPath",
        "Способ отправки",
      );
      recipient.status = "sent";
      recipient.sentAt = sentAt;
      recipient.deliveryPath = deliveryPath;
      recipient.registrationNumber =
        String(form.get("motivatedResponseRegistrationNumber") || "").trim() ||
        undefined;
      if (recipient.recipientRole && c.delivery) {
        c.delivery.recipientRoles = [
          ...new Set<Role>([
            ...(c.delivery.recipientRoles || []),
            recipient.recipientRole,
          ]),
        ];
      }
      const remainingExternal = routing.recipients.some(
        (item) =>
          item.id === "applicant" &&
          item.channel === "external" &&
          item.status === "pending",
      );
      c.status = remainingExternal ? "final_response_delivery" : "completed";
      title = "Направление мотивированного ответа зафиксировано";
      note = remainingExternal
        ? `Мотивированный ответ направлен ${recipient.recipient} ${sentAt} через ${deliveryPath}. Зафиксируйте направление для остальных адресатов.`
        : `Мотивированный ответ направлен ${recipient.recipient} ${sentAt} через ${deliveryPath}. Направление всем адресатам завершено.`;
      break;
    }
    case "send-recommendations": {
      if (!recommendationsAvailable(c))
        throw new Error(
          "Рекомендации можно направить после подписания протокола",
        );
      const recommendationText = text(
        "recommendationText",
        "Текст рекомендации",
      );
      const channel =
        String(form.get("recommendationChannel") || "saq") === "external"
          ? "external"
          : "saq";
      const dueDate = text(
        "recommendationDueDate",
        "Срок исполнения рекомендации",
      );
      dateObject(dueDate);
      const saqRecipients: Record<string, Role> = {
        dvga: "dvga",
        kvga: "kvga",
        subject: "subject",
        higher: "higher",
        "Кабинет ДВГА": "dvga",
        "Кабинет КВГА": "kvga",
        "Кабинет Объекта": "subject",
        "Кабинет вышестоящего органа": "higher",
      };
      const recipientValue = String(
        form.get(
          channel === "saq"
            ? "recommendationSaqRecipient"
            : "recommendationExternalRecipient",
        ) || "",
      ).trim();
      const recipientRole =
        channel === "saq" ? saqRecipients[recipientValue] : undefined;
      if (channel === "saq" && !recipientRole)
        throw new Error("Выберите получателя из кабинетов SAQ");
      if (channel === "external" && !recipientValue)
        throw new Error("Заполните поле «Кому направлена рекомендация»");
      const sentAt =
        channel === "external"
          ? text("recommendationSentAt", "Дата направления рекомендации")
          : date;
      dateObject(sentAt);
      if (dueDate < sentAt)
        throw new Error(
          "Срок исполнения не может быть раньше даты направления",
        );
      const recipient = recipientRole ? ROLES[recipientRole] : recipientValue;
      const deliveryPath =
        channel === "external"
          ? text("recommendationDeliveryPath", "Способ отправки")
          : undefined;
      const registrationNumber =
        channel === "external"
          ? text("recommendationRegistrationNumber", "Номер направления")
          : undefined;
      const recommendationId = `recommendation-${c.id}-${next.recommendations.length + 1}`;
      next.recommendations.push({
        id: recommendationId,
        text: recommendationText,
        recipient,
        recipientRole,
        channel,
        status: channel === "saq" ? "approval" : "sent",
        answer: "",
        caseId: c.id,
        caseReference: c.appealNumber || c.id,
        executor: c.assignee,
        createdAt: date,
        sentAt: channel === "external" ? sentAt : undefined,
        dueDate,
        deliveryPath,
        registrationNumber,
        activity: [
          {
            id: `${recommendationId}-created`,
            date,
            actor: ROLES[role],
            type: "created",
            title:
              channel === "external"
                ? "Рекомендация направлена"
                : "Рекомендация подготовлена и направлена на согласование",
            text: `Получатель: ${recipient}.`,
            dueDate,
          },
        ],
      });
      doc(
        `Рекомендация для ${recipient}`,
        "recommendation",
        `${recommendationText}\n\nКому направлена: ${recipient}.\n${
          channel === "saq"
            ? "Рекомендация подготовлена для направления через кабинет SAQ."
            : `Дата направления: ${formatDate(sentAt)}.`
        }\nСрок исполнения: ${formatDate(dueDate)}.${
          channel === "external"
            ? `\nСпособ отправки: ${deliveryPath}.\nНомер направления: ${registrationNumber}.`
            : ""
        }`,
      );
      if (channel === "saq") {
        next.notifications.push({
          id: `recommendation-${c.id}-${next.notifications.length + 1}`,
          caseId: c.id,
          recipient: ROLES.deputy,
          recipientRole: "deputy",
          date,
          read: false,
          kind: "recommendation",
          text: `Поступила рекомендация по обращению №${c.appealNumber || c.id} для согласования перед направлением в ${recipient}.`,
        });
      }
      title =
        channel === "external"
          ? "Направление рекомендации зафиксировано"
          : "Рекомендация направлена на согласование";
      note = `${
        channel === "external"
          ? "Направление рекомендации зафиксировано"
          : "Рекомендация направлена на согласование"
      }: ${recipient}. Срок исполнения — ${formatDate(dueDate)}.`;
      break;
    }
    case "close-review":
      if (!requiresConclusion(c))
        throw new Error(
          "Закрытие доступно только для возражения на уведомление",
        );
      if (!c.documents.some((document) => document.kind === "conclusion"))
        throw new Error("Сначала вложите заключение по обращению");
      c.status = "completed";
      note = "Рассмотрение закрыто после вложения заключения";
      break;
    case "receipt":
      if (!c.delivery) throw new Error("Результат ещё не направлен");
      c.delivery.received = date;
      note = text("receipt", "Подтверждение вручения");
      doc("Подтверждение вручения результата", "receipt", note);
      break;
    case "supplement":
      checked(form, "formal", "notified");
      c.extensionDays += 15;
      note = text("text", "Содержание дополнения");
      doc(
        "Дополнение " + text("number", "Номер дополнения"),
        "supplement",
        note,
      );
      note += ` Новый срок: ${reviewDeadline(c)}. Извещение о продлении учтено.`;
      break;
    case "pause":
      if (!canSuspendReview(c))
        throw new Error("Срок рассмотрения жалоб не приостанавливается");
      checked(form, "notified");
      c.pause = {
        date,
        recipient: text("recipient", "Адресат"),
        text: text("text", "Внешний запрос"),
      };
      c.resumeStatus = c.status;
      c.status = "paused";
      doc(
        "Внешний запрос и извещение о приостановлении",
        "pause",
        c.pause.text,
      );
      break;
    case "resume":
      if (!canSuspendReview(c))
        throw new Error("Срок рассмотрения жалоб не приостанавливается");
      if (!c.pause || !c.resumeStatus)
        throw new Error("Приостановление не зарегистрировано");
      c.pauseDays += workdaysBetween(c.pause.date, date);
      c.status = c.resumeStatus;
      note = text("text", "Ответ на запрос");
      c.pause = null;
      doc("Ответ на внешний запрос", "response", note);
      break;
    case "withdraw":
    case "refuse":
      checked(form, "notice");
      note = text("reason", "Мотивировка и реквизиты основания");
      c.status = action === "refuse" ? "refused" : "withdrawn";
      c.result = {
        label:
          action === "refuse"
            ? "Отказано в рассмотрении"
            : "Оставлено без рассмотрения",
        kind: text("kind", "Основание"),
        reason: note,
        effect: "Решение по существу доводов не принималось.",
        date,
      };
      doc("Извещение о результате", "result", note);
      break;
    case "return-analysis":
      note = text("reason", "Причина возврата");
      c.status = "materials";
      c.hearing = null;
      c.meeting = null;
      c.votes = null;
      c.result = null;
      disputed(c).forEach((point) => {
        delete point.final;
      });
      doc("Возврат материалов на анализ", "return", note);
      break;
    case "postpone":
      note = text("reason", "Причина переноса");
      doc("Извещение о переносе заседания", "postpone", note);
      break;
    case "court":
      c.court = {
        number: text("number", "Номер судебного дела"),
        date,
        note: text("note", "Подтверждение судебного обжалования"),
        effect:
          c.type === "control"
            ? text("effect", "Последствия для исполнения")
            : "Исполнение решения комиссии приостановлено до решения суда (ст. 58-4 п. 7).",
      };
      c.status = "court";
      doc("Судебное обжалование", "court", c.court.note);
      break;
    case "court-result":
      if (!c.court || !c.result)
        throw new Error("Судебное дело не зарегистрировано");
      note = text("note", "Судебный акт и последствия");
      c.court.result = note;
      c.result.effect = note;
      c.status = "completed";
      doc("Судебный акт", "court", note);
      break;
    case "upload":
      throw new Error("Для вложений используется отдельный метод репозитория");
  }

  c.history.push({
    date,
    actor: ROLES[role],
    title,
    text: note || "Действие учтено в деле.",
  });
  next.date = date;
  return next;
}
