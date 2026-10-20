import { Button, Notice } from "../../../components/ui";
import { ROLES, STATUS } from "../../../data/constants";
import type {
  Action,
  CaseRecommendation,
  CaseStatus,
  ObjectionCase,
  Role,
} from "../../../types";
import { formatDate } from "../../../utils/dateFormat";
import {
  additionalActions,
  nextAction,
  requestLifecycleStatus,
  REQUEST_LIFECYCLE_LABELS,
} from "../services/workflow";

type ProcessStage = {
  label: string;
  description: string;
  statuses: CaseStatus[];
};

const OBJECTION_STAGES: ProcessStage[] = [
  {
    label: "Приём",
    description: "Допустимость и компетенция",
    statuses: ["received"],
  },
  {
    label: "Запрос",
    description: "Подготовка и направление запросов, получение ответов",
    statuses: [
      "accepted",
      "forwarded",
      "requested",
      "request_approval",
      "request_signed",
      "request_approved",
      "response_approval",
      "response_signed",
      "response_ready",
    ],
  },
  {
    label: "Анализ обращения",
    description: "Формирование, согласование и подписание справки",
    statuses: ["materials", "certificate_approval", "certificate_signed"],
  },
  {
    label: "Заседание",
    description: "Ознакомление, голосование и проведение заседания по делу",
    statuses: [
      "certificate_approved",
      "documents_review",
      "commission_members",
      "commission_voting",
      "circulated",
      "meeting_certificate_approval",
      "meeting_certificate_signed",
      "meeting_certificate_approved",
    ],
  },
  {
    label: "Решение",
    description: "Голоса и протокол",
    statuses: ["hearing", "hearing_ready", "meeting", "protocol"],
  },
  {
    label: "Исполнение",
    description: "Направление результата и исполнение",
    statuses: [
      "decided",
      "final_response_approval",
      "final_response_signed",
      "final_response_delivery",
      "decision_project",
      "decision_project_approval",
      "decision_project_signed",
      "decision_project_delivery",
      "decision_project_comments",
      "decision_project_eotinish",
      "decision_project_hearing",
      "delivered",
      "completed",
    ],
  },
];

const REQUEST_SUBSTEPS = [
  "Формирование запроса",
  "Согласование запроса",
  "Подписание запроса",
  "Ожидание ответа",
] as const;

const REQUEST_ROUTE_LABELS = {
  initial: "Основной запрос",
  "additional-analysis": "Дополнительный запрос по результатам анализа",
  "additional-commission":
    "Дополнительный запрос по решению Апелляционной комиссии",
  "additional-hearing": "Дополнительный запрос после заслушивания",
} as const;

const REPEAT_HEARING_LABELS = {
  required: "Требуется повторное заседание",
  ready: "Готово к повторному заседанию",
  scheduled: "Включено в повторное заседание",
} as const;

function requestRouteLabel(c: ObjectionCase) {
  return c.requestRoute ? REQUEST_ROUTE_LABELS[c.requestRoute] : "Основной запрос";
}

function requestRouteLabelForRequest(
  request: ObjectionCase["requests"][number],
) {
  if (request.route === "additional-analysis")
    return REQUEST_ROUTE_LABELS["additional-analysis"];
  if (request.route === "additional-commission")
    return REQUEST_ROUTE_LABELS["additional-commission"];
  if (request.route === "additional-hearing")
    return REQUEST_ROUTE_LABELS["additional-hearing"];
  return REQUEST_ROUTE_LABELS.initial;
}

function isAuthorityRequest(request: ObjectionCase["requests"][number]) {
  return request.template === "dvga" || /ДВГА|КВГА/i.test(request.recipient);
}

const ANALYSIS_SUBSTEPS = [
  "Сформировать справку",
  "Согласовать справку",
  "Подписать справку",
] as const;

const DECISION_SUBSTEPS = [
  "Сформировать протокол заседания",
  "Подписать протокол заседания",
] as const;

const EXECUTION_SUBSTEPS = [
  "Сформировать проект решения",
  "Направить проект решения",
  "Рассмотреть замечания и провести заслушивание",
  "Мотивированный ответ",
] as const;

function requestSubstep(status: CaseStatus) {
  if (["accepted", "requested", "forwarded"].includes(status)) return 0;
  if (status === "request_approval") return 1;
  if (status === "request_signed") return 2;
  if (
    [
      "request_approved",
      "response_approval",
      "response_signed",
      "response_ready",
    ].includes(
      status,
    )
  )
    return 3;
  return null;
}

function requestKind(request: ObjectionCase["requests"][number]) {
  if (request.template === "dvga" || /ДВГА|КВГА/i.test(request.recipient))
    return "Запрос в КВГА/ДВГА";
  if (request.saqRecipient) return "Запрос в кабинет SAQ";
  return "Запрос через другую систему";
}

function responseDate(request: ObjectionCase["requests"][number]) {
  return request.responded || request.responseSigned;
}

function RequestResponsesPanel({
  c,
  role,
  onAction,
}: {
  c: ObjectionCase;
  role: Role;
  onAction: (action: Action, role: Role, requestId?: string) => void;
}) {
  const requests = c.requests.filter((request) => !request.cancelled);
  if (!requests.length) return null;
  const received = requests.filter(
    (request) => requestLifecycleStatus(request) === "response_received",
  ).length;
  const hasAuthorityRequest = requests.some(isAuthorityRequest);
  return (
    <Notice tone="amber">
      <div className="request-response-heading">
        <div>
          <span className="request-response-eyebrow">Информационный блок</span>
          <strong>Запросы и ответы</strong>
        </div>
        <span className="request-response-summary">
          Ответов получено: <b>{received}/{requests.length}</b>
        </span>
      </div>
      <ul className="request-response-status-list">
        {requests.map((request) => {
          const status = requestLifecycleStatus(request);
          const answerDate = responseDate(request);
          const canAttachExternalResponse =
            (role === "demo-superuser" || role === "work") &&
            request.template === "other" &&
            !request.saqRecipient &&
            status === "waiting_response";
          const canSendRequestApproval =
            (role === "demo-superuser" || role === "work") &&
            hasAuthorityRequest &&
            status === "draft";
          return (
            <li
              className={status === "response_received" ? "is-received" : "is-pending"}
              key={request.id}
            >
              <span className="request-response-marker" aria-hidden="true">
                {status === "response_received" ? "✓" : "…"}
              </span>
              <span className="request-response-recipient">
                <strong>{requestKind(request)}</strong>
                <small>Кому: {request.recipient}</small>
                <small>Маршрут: {requestRouteLabelForRequest(request)}</small>
              </span>
              <span className="request-response-dates">
                <small>
                  Дата направления: {request.sent ? formatDate(request.sent) : "—"}
                </small>
                <small>
                  Дата ответа: {answerDate ? formatDate(answerDate) : "—"}
                  {request.responseRegistrationNumber
                    ? `, №${request.responseRegistrationNumber}`
                    : ""}
                </small>
              </span>
              <span className="request-response-status-actions">
                <span
                  className={
                    status === "response_received"
                      ? "response-received"
                      : "response-pending"
                  }
                >
                  <span className="response-status-dot" aria-hidden="true" />
                  {REQUEST_LIFECYCLE_LABELS[status]}
                </span>
                {canSendRequestApproval && (
                  <Button
                    className="request-response-action"
                    primary
                    title="Направить сформированные запросы на согласование"
                    onClick={() => onAction("send-request-approval", "work")}
                  >
                    Направить на согласование
                  </Button>
                )}
              </span>
              {canAttachExternalResponse && (
                <Button
                  className="request-response-action"
                  primary
                  onClick={() =>
                    onAction("record-external-response", "work", request.id)
                  }
                >
                  Вложить ответ
                </Button>
              )}
            </li>
          );
        })}
      </ul>
    </Notice>
  );
}

function isMotivatedResponseCase(c: ObjectionCase) {
  const appealType = (c.appealType || "").trim();
  return (
    appealType.startsWith("Жалоба") ||
    appealType === "Заявление" ||
    appealType === "Возражение на аудиторский отчет" ||
    appealType === "Возражение на аудиторский отчёт"
  );
}

function FinalResponseApprovalPanel({ c }: { c: ObjectionCase }) {
  const awaitingApproval = c.status === "final_response_approval";
  const awaitingSignature = c.status === "final_response_signed";
  if (!awaitingApproval && !awaitingSignature) return null;

  const finalResponse = c.documents
    .filter((document) => document.kind === "final-response")
    .at(-1);
  const motivated = isMotivatedResponseCase(c);
  const status = awaitingApproval ? "На согласовании" : "На подписании";
  const responsible = awaitingApproval
    ? "Заместитель директора ДАВГА"
    : "Директор ДАВГА";

  return (
    <Notice tone="amber">
      <div className="request-response-heading">
        <div>
          <span className="request-response-eyebrow">Информационный блок</span>
          <strong>{motivated ? "Мотивированный ответ" : "Окончательный ответ"}</strong>
        </div>
        <span className="request-response-summary">
          Документов: <b>1</b>
        </span>
      </div>
      <ul className="request-response-status-list">
        <li className="is-pending">
          <span className="request-response-marker" aria-hidden="true">
            …
          </span>
          <span className="request-response-recipient">
            <strong>
              {finalResponse?.name ||
                (motivated
                  ? "Проект мотивированного ответа"
                  : "Проект окончательного ответа")}
            </strong>
            <small>Ответственный: {responsible}</small>
          </span>
          <span className="request-response-dates">
            <small>
              Дата формирования: {finalResponse?.date ? formatDate(finalResponse.date) : "—"}
            </small>
          </span>
          <span className="response-pending">
            <span className="response-status-dot" aria-hidden="true" />
            {status}
          </span>
        </li>
      </ul>
    </Notice>
  );
}

function DecisionProjectApprovalPanel({ c }: { c: ObjectionCase }) {
  const awaitingApproval = c.status === "decision_project_approval";
  const awaitingSignature = c.status === "decision_project_signed";
  if (!awaitingApproval && !awaitingSignature) return null;

  const decisionProject = c.documents
    .filter((document) => document.kind === "decision-project")
    .at(-1);
  const status = awaitingApproval ? "На согласовании" : "На подписании";
  const responsible = awaitingApproval
    ? "Согласующий руководитель"
    : "Директор ДАВГА";

  return (
    <Notice tone="amber">
      <div className="request-response-heading">
        <div>
          <span className="request-response-eyebrow">Информационный блок</span>
          <strong>Проект решения</strong>
        </div>
        <span className="request-response-summary">
          Документов: <b>1</b>
        </span>
      </div>
      <ul className="request-response-status-list">
        <li className="is-pending">
          <span className="request-response-marker" aria-hidden="true">
            …
          </span>
          <span className="request-response-recipient">
            <strong>{decisionProject?.name || "Проект решения"}</strong>
            <small>Ответственный: {responsible}</small>
          </span>
          <span className="request-response-dates">
            <small>
              Дата формирования: {decisionProject?.date ? formatDate(decisionProject.date) : "—"}
            </small>
          </span>
          <span className="response-pending">
            <span className="response-status-dot" aria-hidden="true" />
            {status}
          </span>
        </li>
      </ul>
    </Notice>
  );
}

function RecommendationStatusPanel({
  recommendations,
}: {
  recommendations: CaseRecommendation[];
}) {
  if (!recommendations.length) return null;
  const labels: Record<CaseRecommendation["status"], string> = {
    approval: "На согласовании",
    signature: "На подписании",
    sent: "Направлена",
    answered: "Ответ получен",
    acceptance_approval: "Принятие на согласовании",
    acceptance_signature: "Принятие на подписании",
    return_approval: "Возврат на согласовании",
    return_signature: "Возврат на подписании",
    executed: "Исполнена",
    returned: "Возвращена на доработку",
  };
  return (
    <Notice tone="amber">
      <div className="request-response-heading">
        <div>
          <span className="request-response-eyebrow">Информационный блок</span>
          <strong>Рекомендации</strong>
        </div>
        <span className="request-response-summary">
          Всего: <b>{recommendations.length}</b>
        </span>
      </div>
      <ul className="request-response-status-list">
        {recommendations.map((recommendation) => (
          <li
            className={
              recommendation.status === "executed" ? "is-received" : "is-pending"
            }
            key={recommendation.id}
          >
            <span className="request-response-marker" aria-hidden="true">
              {recommendation.status === "executed" ? "✓" : "…"}
            </span>
            <span className="request-response-recipient">
              <strong>{recommendation.recipient}</strong>
              <small>{recommendation.channel === "external" ? "Через другую систему" : "Кабинет SAQ"}</small>
            </span>
            <span className="request-response-dates">
              <small>
                Дата направления: {formatDate(recommendation.sentAt || recommendation.createdAt)}
              </small>
              <small>
                Срок исполнения: {formatDate(recommendation.revisionDueDate || recommendation.dueDate)}
              </small>
            </span>
            <span
              className={
                recommendation.status === "executed"
                  ? "response-received"
                  : "response-pending"
              }
            >
              <span className="response-status-dot" aria-hidden="true" />
              {labels[recommendation.status]}
            </span>
          </li>
        ))}
      </ul>
    </Notice>
  );
}

function analysisSubstep(status: CaseStatus) {
  if (status === "materials") return 0;
  if (status === "certificate_approval") return 1;
  if (status === "certificate_signed") return 2;
  return null;
}

function decisionSubstep(status: CaseStatus) {
  if (status === "meeting") return 0;
  if (status === "protocol") return 1;
  return null;
}

function executionSubstep(status: CaseStatus) {
  if (
    [
      "decision_project",
      "decision_project_approval",
      "decision_project_signed",
    ].includes(status)
  )
    return 0;
  if (status === "decision_project_delivery") return 1;
  if (
    [
      "decision_project_comments",
      "decision_project_eotinish",
      "decision_project_hearing",
    ].includes(status)
  )
    return 2;
  if (
    [
      "decided",
      "final_response_approval",
      "final_response_signed",
      "final_response_delivery",
    ].includes(status)
  )
    return 3;
  return null;
}

const TASK_HELP: Partial<Record<Action, string>> = {
  "assign-work-executor":
    "Выберите исполнителя рабочего органа. После назначения обращение будет передано ему для формирования запроса.",
  screen:
    "Проверьте заявителя, исходный документ, срок подачи и компетенцию органа. Назначьте ответственного и зафиксируйте основание принятия к рассмотрению.",
  request:
    "Сформируйте один или оба вида запросов. Когда все документы готовы, направьте их заместителю директора ДАВГА на согласование.",
  "send-request-approval":
    "Проверьте сформированные запросы и приложения, затем направьте их заместителю директора ДАВГА на согласование.",
  "approve-request":
    "Согласуйте каждый сформированный запрос отдельно. После согласования всех запросов они поступят директору ДАВГА для подписания.",
  "sign-request":
    "Подпишите каждый согласованный запрос отдельно. Каждый подписанный запрос сразу будет направлен адресату.",
  "fill-request-response":
    "Заполните мотивированный ответ по каждому пункту и приложите подтверждающие документы.",
  "approve-response": "Согласуйте заполненный ответ ДВГА/КВГА.",
  "sign-response": "Подпишите согласованный ответ ДВГА/КВГА.",
  position:
    "Вложите полученные файлы в материалы дела, затем подтвердите поступление ответа.",
  analysis:
    "Заполните доводы ДВГА и позиции членов апелляционной комиссии. Система сформирует справку по шаблону.",
  "approve-certificate":
    "Проверьте сформированную справку и согласуйте её для направления членам апелляционной комиссии.",
  "sign-certificate":
    "Подпишите согласованную справку. После этого она будет готова к направлению вместе с материалами членам апелляционной комиссии.",
  "commission-vote":
    "Выберите вариант решения по каждому оспариваемому пункту и сохраните результаты голосования.",
  "fill-meeting-certificate":
    "Проверьте голоса участников заседания, при необходимости внесите результат вручную и добавьте комментарии. Печатная форма справки обновляется сразу.",
  "approve-meeting-certificate":
    "Проверьте справку, заполненную по результатам голосования, и согласуйте её.",
  "sign-meeting-certificate":
    "Подпишите согласованную справку. После этого можно зафиксировать проведение заседания.",
  members:
    "Подтвердите, что заседание по данному делу проведено. После этого обращение перейдёт на этап принятия решения.",
  hearing:
    "Укажите порядок извещения и дату заслушивания. Если применяется предусмотренное основание для его непроведения, зафиксируйте его в форме.",
  "hearing-held":
    "Зафиксируйте участие сторон, их позиции и результаты состоявшегося заслушивания.",
  vote: "Отметьте присутствующих и отводы, внесите голоса по каждому пункту. Система проверит кворум и результаты голосования.",
  sign: "Проверьте результаты голосования и зарегистрируйте подписание протокола. После этого оформляется результат рассмотрения.",
  "create-decision-project":
    "Сформируйте проект решения по той же форме, что и окончательный ответ. Далее он будет согласован и подписан.",
  "approve-decision-project":
    "Проверьте сформированный проект решения и согласуйте его для подписания.",
  "sign-decision-project":
    "Подпишите согласованный проект решения. В SAQ он будет направлен автоматически; для внешнего канала направление фиксирует рабочий орган.",
  "record-decision-project-delivery":
    "Зафиксируйте направление подписанного проекта решения через внешнюю систему.",
  "submit-decision-project-comment":
    "Направьте замечание к проекту решения в течение двух рабочих дней со дня его получения.",
  "record-external-decision-project-comment":
    "Зарегистрируйте замечание, поступившее к проекту решения через внешнюю систему.",
  "proceed-to-final-response":
    "В любой момент зафиксируйте причину перехода к мотивированному ответу; поступление замечания не блокирует действие.",
  "send-decision-project-eotinish":
    "Укажите реквизиты заслушивания и канал направления извещения заявителю.",
  "hearing-after-decision-project":
    "Зафиксируйте проведение заслушивания. После этого станет доступно формирование окончательного ответа.",
  "approve-final-response":
    "Проверьте сформированный окончательный ответ и согласуйте его для подписания.",
  "sign-final-response":
    "Подпишите согласованный окончательный ответ. После подписи рассмотрение будет завершено.",
  deliver:
    "Оформите окончательный ответ. После этого он будет направлен на согласование и подписание.",
  "close-review": "Заключение по обращению вложено. Закройте рассмотрение.",
  forward:
    "Проверьте возможность удовлетворения жалобы органом, чей акт обжалуется, либо оформите передачу дела вышестоящему органу.",
  "control-analysis":
    "Изучите административное дело, доводы и доказательства. Зафиксируйте анализ и проект решения по пунктам.",
  "control-decision":
    "Оформите мотивированное решение компетентного органа с учётом материалов дела и заслушивания сторон.",
  resume:
    "Зарегистрируйте ответ на внешний запрос. Рассмотрение продолжится с этапа, на котором срок был приостановлен.",
  "court-result":
    "Зарегистрируйте поступивший судебный акт и его последствия для дальнейшего исполнения решения.",
};

export default function ConsiderationProcess({
  c,
  date,
  role,
  onAction,
  onHistory,
  recommendations = [],
  hideStages = false,
}: {
  c: ObjectionCase;
  /** Текущая дата демонстрационного календаря SAQ. */
  date?: string;
  role: Role;
  onAction: (action: Action, role: Role, requestId?: string) => void;
  onHistory: () => void;
  recommendations?: CaseRecommendation[];
  /** Члены АК работают только с задачей по делу, без служебной схемы процесса. */
  hideStages?: boolean;
}) {
  const next = nextAction(c, role);
  const pendingRequestActions =
    next?.action === "approve-request"
      ? c.requests.filter((request) => !request.sent && !request.approved)
      : next?.action === "sign-request"
        ? c.requests.filter((request) => request.approved && !request.sent)
        : [];
  const stages = OBJECTION_STAGES;
  const currentStatus = c.status === "paused" ? c.resumeStatus : c.status;
  const inRequestFormationStage = stages[1].statuses.includes(
    currentStatus ?? c.status,
  );
  const availableExtras = additionalActions(c).filter(
    (option) =>
      option.action !== "upload" &&
      option.action !== "vote" &&
      option.action !== "fill-meeting-certificate" &&
      option.action !== "supplement" &&
      option.action !== "court" &&
      option.action !== "receipt",
  );
  const extras = inRequestFormationStage
    ? availableExtras.filter((option) => option.action === "supplement")
    : availableExtras;
  const lastEvent = c.history.at(-1);
  const caseRecommendations = recommendations.filter(
    (recommendation) => recommendation.caseId === c.id,
  );
  const taskTitle =
    next?.action === "position"
      ? "Зафиксировать полученный ответ"
      : next?.label;
  const taskOwner =
    next?.action === "approve-request" ||
    next?.action === "approve-certificate" ||
    next?.action === "approve-meeting-certificate"
      ? "Заместитель директора ДАВГА"
      : next
        ? ROLES[next.role]
        : "";
  const meetingCertificateAvailable =
    (role === "demo-superuser" || role === "work") &&
    ["commission_voting", "circulated"].includes(c.status);
  const awaitingAttendancePoll = c.status === "certificate_approved";
  const materialsAvailableForCommission = c.status === "documents_review";
  const meetingCompletionAvailable = !!c.certificate?.memberPositions.length;
  const currentRequestSubstep = requestSubstep(c.status);
  const currentAnalysisSubstep = analysisSubstep(c.status);
  const currentDecisionSubstep = decisionSubstep(c.status);
  const currentExecutionSubstep = executionSubstep(c.status);
  const additionalRequestRoute =
    c.requestRoute === "additional-analysis" ||
    c.requestRoute === "additional-commission" ||
    c.requestRoute === "additional-hearing";
  const requestRouteActive =
    currentRequestSubstep !== null && !c.requestRouteCompletedAt;
  const commentsDeadline = c.decisionProjectRouting?.commentsDeadline;
  const commentsDeadlineExpired =
    c.status === "decision_project_comments" &&
    !c.decisionProjectRouting?.commentReceivedAt &&
    Boolean(date && commentsDeadline && date > commentsDeadline);
  const canPerformNextAction = role === "demo-superuser" || role === next?.role;
  const requestActionsVisible =
    inRequestFormationStage && (role === "demo-superuser" || role === "work");
  // Запросы могут потребоваться и после того, как первые уже направлены.
  // Пока обращение находится на этапе «Запрос», рабочий орган может добавить
  // новый запрос и запустить для него отдельный маршрут согласования.
  const requestFormingAvailable = inRequestFormationStage;
  return (
    <section
      className="consideration-process"
      aria-label="Процесс рассмотрения"
    >
      {!hideStages && (
        <>
          <div className="section-heading">
            <h3>Процесс рассмотрения</h3>
            <span className="badge blue">{STATUS[c.status]}</span>
          </div>
          <ol className="consideration-stages" aria-label="Этапы рассмотрения">
            {stages.map((stage, index) => {
              const current =
                !!currentStatus && stage.statuses.includes(currentStatus);
              return (
                <li
                  key={stage.label}
                  aria-current={current ? "step" : undefined}
                >
                  <span
                    className="consideration-stage-number"
                    aria-hidden="true"
                  >
                    {index + 1}
                  </span>
                  <div>
                    <strong>{stage.label}</strong>
                    <span>{stage.description}</span>
                  </div>
                </li>
              );
            })}
          </ol>
          {currentRequestSubstep !== null && (
            <ol className="process-substeps" aria-label="Шаги этапа запроса">
              {REQUEST_SUBSTEPS.map((label, index) => (
                <li
                  key={label}
                  aria-current={
                    index === currentRequestSubstep ? "step" : undefined
                  }
                >
                  <span>{index + 1}</span>
                  {label}
                </li>
              ))}
            </ol>
          )}
          {requestRouteActive && (
            <div className="process-route-banner" role="status">
              <span className="process-route-banner-label">Подэтап этапа «Запрос»</span>
              <strong>{requestRouteLabel(c)}</strong>
            </div>
          )}
          {additionalRequestRoute && c.requestRouteCompletedAt && currentStatus !== "accepted" && (
            <div className="process-route-banner process-route-banner-muted" role="status">
              <span className="process-route-banner-label">Последний маршрут</span>
              <strong>{requestRouteLabel(c)}</strong>
              <span>Ответ получен, обращение возвращено к дальнейшему рассмотрению.</span>
            </div>
          )}
          {c.repeatHearingStatus && (
            <div
              className="process-route-banner process-repeat-hearing-banner"
              role="status"
            >
              <span className="process-route-banner-label">
                Контроль повторного заседания
              </span>
              <strong>{REPEAT_HEARING_LABELS[c.repeatHearingStatus]}</strong>
              {c.repeatHearingPreviousMeetingNumber && (
                <span>
                  Предыдущее заседание: №{c.repeatHearingPreviousMeetingNumber}
                </span>
              )}
              {c.repeatHearingReason && (
                <span>Причина: {c.repeatHearingReason}</span>
              )}
            </div>
          )}
          {currentAnalysisSubstep !== null && (
            <ol
              className="process-substeps"
              aria-label="Шаги этапа анализа обращения"
            >
              {ANALYSIS_SUBSTEPS.map((label, index) => (
                <li
                  key={label}
                  aria-current={
                    index === currentAnalysisSubstep ? "step" : undefined
                  }
                >
                  <span>{index + 1}</span>
                  {label}
                </li>
              ))}
            </ol>
          )}
          {c.hearingSupplements?.length &&
            currentAnalysisSubstep !== null && (
              <div className="process-route-banner" role="status">
                <span className="process-route-banner-label">
                  Подэтап этапа «Анализ обращения»
                </span>
                <strong>
                  Формирование справки по дополнительным доводам после
                  заслушивания
                </strong>
              </div>
            )}
          {currentDecisionSubstep !== null && (
            <ol className="process-substeps" aria-label="Шаги этапа решения">
              {DECISION_SUBSTEPS.map((label, index) => (
                <li
                  key={label}
                  aria-current={
                    index === currentDecisionSubstep ? "step" : undefined
                  }
                >
                  <span>{index + 1}</span>
                  {label}
                </li>
              ))}
            </ol>
          )}
          {currentExecutionSubstep !== null && (
            <ol className="process-substeps" aria-label="Шаги этапа исполнения">
              {EXECUTION_SUBSTEPS.map((label, index) => (
                <li
                  key={label}
                  aria-current={
                    index === currentExecutionSubstep ? "step" : undefined
                  }
                >
                  <span>{index + 1}</span>
                  {label}
                </li>
              ))}
            </ol>
          )}
        </>
      )}
      {requestActionsVisible && (
        <div className="consideration-task">
          <div>
            <span className="consideration-eyebrow">Текущая задача</span>
            <h4>Формирование и направление запросов</h4>
            <span className="request-route-chip">{requestRouteLabel(c)}</span>
            <p className="consideration-owner">
              Исполнитель: <strong>{ROLES.work}</strong>
            </p>
          </div>
          <div className="consideration-task-action">
            <div className="request-actions">
              <Button
                primary
                disabled={!requestFormingAvailable}
                onClick={() => onAction("request", "work")}
              >
                Сформировать запрос в ДВГА/КВГА
              </Button>
              <Button
                primary
                disabled={!requestFormingAvailable}
                onClick={() => onAction("request-saq", "work")}
              >
                Сформировать запрос в кабинет SAQ
              </Button>
              <Button
                primary
                disabled={!requestFormingAvailable}
                onClick={() => onAction("request-other", "work")}
              >
                Зафиксировать запрос через другую систему
              </Button>
            </div>
          </div>
        </div>
      )}
      {next && !requestActionsVisible ? (
        <div className="consideration-task">
          <div>
            <span className="consideration-eyebrow">Текущая задача</span>
            <h4>{taskTitle}</h4>
            <p>{TASK_HELP[next.action]}</p>
            <p className="consideration-owner">
              Исполнитель: <strong>{taskOwner}</strong>
            </p>
          </div>
          <div className="consideration-task-action">
            {canPerformNextAction && pendingRequestActions.length > 0 ? (
              <div className="request-actions">
                {pendingRequestActions.map((request) => (
                  <Button
                    key={request.id}
                    primary
                    onClick={() => onAction(next.action, next.role, request.id)}
                  >
                    {next.action === "approve-request"
                      ? "Согласовать"
                      : "Подписать"}{" "}
                    запрос в {request.recipient}
                  </Button>
                ))}
              </div>
            ) : canPerformNextAction ? (
              next.action !== "request" &&
              (next.action !== "commission-vote" ||
                role === "demo-superuser" ||
                role === "commission") && (
                <Button
                  primary
                  disabled={
                    next.action === "members" && !meetingCompletionAvailable
                  }
                  title={
                    next.action === "members" && !meetingCompletionAvailable
                      ? "Сначала заполните и сохраните справку"
                      : undefined
                  }
                  onClick={() => onAction(next.action, next.role)}
                >
                  {next.label}
                </Button>
              )
            ) : null}
            {meetingCertificateAvailable && (
              <Button
                primary
                onClick={() => onAction("fill-meeting-certificate", "work")}
              >
                Заполнить справку
              </Button>
            )}
            {role !== "demo-superuser" && role !== next.role && (
              <small>Действие выполняет {taskOwner}.</small>
            )}
          </div>
        </div>
      ) : awaitingAttendancePoll ? (
        <div className="consideration-task">
          <div>
            <span className="consideration-eyebrow">Текущая задача</span>
            <h4>Готово к рассмотрению АК</h4>
            <p>
              Опрос о присутствии направлен автоматически при создании
              заседания. После первого подтверждения присутствия члену АК сразу
              открывается доступ к материалам обращения.
            </p>
            <p className="consideration-owner">
              Исполнитель: <strong>Члены АК</strong>
            </p>
          </div>
          <div className="consideration-task-action">
            <small>
              Ожидается хотя бы одно подтверждение присутствия от члена АК.
            </small>
          </div>
        </div>
      ) : materialsAvailableForCommission ? (
        <Notice>
          <strong>Материалы доступны членам АК</strong>
          <p>
            Доступ к карточке обращения открыт членам комиссии, которые
            подтвердили присутствие на заседании.
          </p>
        </Notice>
      ) : c.status === "decision_project_comments" && commentsDeadline ? (
        <Notice tone={commentsDeadlineExpired ? "red" : "amber"}>
          <strong>Ожидание замечаний к проекту решения</strong>
          <p>
            Срок ожидания замечаний к проекту решения: до {formatDate(commentsDeadline)}
            {" "}— 2 рабочих дня с даты направления проекта решения.
          </p>
          {commentsDeadlineExpired ? (
            <p>
              Срок ожидания замечаний к проекту решения истек. Переход к
              формированию мотивированного ответа доступен.
            </p>
          ) : (
            <p>
              Замечание к проекту решения пока не поступило. Переход к
              формированию мотивированного ответа доступен в любой момент.
            </p>
          )}
        </Notice>
      ) : !requestActionsVisible ? (
        <Notice tone={c.status === "completed" ? "green" : "amber"}>
          <strong>{STATUS[c.status]}</strong>
          <p>
            {c.status === "completed"
              ? "Рассмотрение и учёт исполнения завершены. Результат доступен ниже, сформированные документы — во вкладке «Документы»."
              : "Рассмотрение по существу не продолжается. Основание сохранено в истории и документах дела."}
          </p>
        </Notice>
      ) : null}
      <RecommendationStatusPanel recommendations={caseRecommendations} />
      <FinalResponseApprovalPanel c={c} />
      {(role === "demo-superuser" || role === "work") && (
        <DecisionProjectApprovalPanel c={c} />
      )}
      {!hideStages && inRequestFormationStage && (
        <div className="request-responses-panel">
          <RequestResponsesPanel c={c} role={role} onAction={onAction} />
        </div>
      )}
      {!hideStages && lastEvent && (
        <div className="consideration-last-event">
          <span>
            <span className="muted">Последнее событие: </span>
            {lastEvent.title}
          </span>
          <button className="text-button" onClick={onHistory}>
            Вся история
          </button>
        </div>
      )}
      {!hideStages && currentStatus !== "received" && extras.length > 0 && (
        <details className="consideration-extras">
          <summary>Другие действия по делу</summary>
          <div>
            {extras.map((option) => (
              <Button
                key={option.action}
                onClick={() => onAction(option.action, option.role)}
              >
                {option.label}
                <span className="consideration-action-role">
                  {ROLES[option.role]}
                </span>
              </Button>
            ))}
          </div>
          <p className="small muted">
            Доступные действия зависят от этапа и исполнителя.
          </p>
        </details>
      )}
    </section>
  );
}
