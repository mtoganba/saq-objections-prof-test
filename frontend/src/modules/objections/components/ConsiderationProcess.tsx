import { Button, Notice } from "../../../components/ui";
import { ROLES, STATUS } from "../../../data/constants";
import type { Action, CaseStatus, ObjectionCase, Role } from "../../../types";
import { formatDate } from "../../../utils/dateFormat";
import { additionalActions, nextAction } from "../services/workflow";

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
    statuses: [
      "materials",
      "certificate_approval",
      "certificate_signed",
    ],
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
      "decision_project",
      "decision_project_approval",
      "decision_project_signed",
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
  "Фиксация получения ответа",
] as const;

const ANALYSIS_SUBSTEPS = [
  "Сформировать справку",
  "Согласовать справку",
  "Подписать справку",
] as const;

const DECISION_SUBSTEPS = [
  "Сформировать протокол заседания",
  "Подписать протокол заседания",
] as const;

function requestSubstep(status: CaseStatus) {
  if (["accepted", "requested", "forwarded"].includes(status)) return 0;
  if (status === "request_approval") return 1;
  if (status === "request_signed") return 2;
  if (["request_approved", "response_approval", "response_signed"].includes(status))
    return 3;
  if (status === "response_ready") return 4;
  return null;
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
  "approve-decision-project": "Проверьте сформированный проект решения и согласуйте его для подписания.",
  "sign-decision-project": "Подпишите согласованный проект решения для направления через E-Otinish.",
  "send-decision-project-eotinish": "Подтвердите направление подписанного проекта решения через систему E-Otinish.",
  "hearing-after-decision-project": "Зафиксируйте проведение заслушивания. После этого станет доступно формирование окончательного ответа.",
  "approve-final-response": "Проверьте сформированный окончательный ответ и согласуйте его для подписания.",
  "sign-final-response": "Подпишите согласованный окончательный ответ. После подписи рассмотрение будет завершено.",
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
  role,
  onAction,
  onHistory,
  hideStages = false,
}: {
  c: ObjectionCase;
  role: Role;
  onAction: (action: Action, role: Role, requestId?: string) => void;
  onHistory: () => void;
  /** Члены АК работают только с задачей по делу, без служебной схемы процесса. */
  hideStages?: boolean;
}) {
  const next = nextAction(c, role);
  const pendingRequestActions =
    next?.action === "approve-request"
      ? c.requests.filter((request) => !request.approved)
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
  const taskTitle =
    next?.action === "position" ? "Зафиксировать полученный ответ" : next?.label;
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
  const awaitingAuthorityResponse =
    (role === "demo-superuser" || role === "work") &&
    ["request_approved", "response_approval", "response_signed", "response_ready"].includes(
      c.status,
    );
  const sentRequests = c.requests.filter((request) => Boolean(request.sent));
  const pendingExternalRequest = c.requests.find(
    (request) =>
      request.template === "other" &&
      !request.saqRecipient &&
      Boolean(request.sent) &&
      !request.responded,
  );
  const pendingResponses = sentRequests.filter((request) => !request.responded)
    .length;
  const awaitingAttendancePoll = c.status === "certificate_approved";
  const materialsAvailableForCommission = c.status === "documents_review";
  const meetingCompletionAvailable =
    !!c.certificate?.memberPositions.length;
  const currentRequestSubstep = requestSubstep(c.status);
  const currentAnalysisSubstep = analysisSubstep(c.status);
  const currentDecisionSubstep = decisionSubstep(c.status);
  const workRequestStatus =
    role === "work" &&
    (c.status === "request_approval" || c.status === "request_signed");
  const pendingApprovals = c.requests.filter((request) => !request.approved);
  const pendingSignatures = c.requests.filter(
    (request) => request.approved && !request.sent,
  );
  const workRequestStatusLabel =
    pendingApprovals.length && pendingSignatures.length
      ? "На согласовании и подписании"
      : pendingApprovals.length
        ? "На согласовании"
        : "На подписании";
  const workRequestStatusOwner =
    pendingApprovals.length && pendingSignatures.length
      ? "Заместитель директора ДАВГА и директор ДАВГА"
      : pendingApprovals.length
      ? "Заместитель директора ДАВГА"
      : "Директор ДАВГА";
  const canPerformNextAction =
    role === "demo-superuser" || role === next?.role;

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
                <li key={stage.label} aria-current={current ? "step" : undefined}>
                  <span className="consideration-stage-number" aria-hidden="true">
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
                  aria-current={index === currentRequestSubstep ? "step" : undefined}
                >
                  <span>{index + 1}</span>
                  {label}
                </li>
              ))}
            </ol>
          )}
          {currentAnalysisSubstep !== null && (
            <ol className="process-substeps" aria-label="Шаги этапа анализа обращения">
              {ANALYSIS_SUBSTEPS.map((label, index) => (
                <li
                  key={label}
                  aria-current={index === currentAnalysisSubstep ? "step" : undefined}
                >
                  <span>{index + 1}</span>
                  {label}
                </li>
              ))}
            </ol>
          )}
          {currentDecisionSubstep !== null && (
            <ol className="process-substeps" aria-label="Шаги этапа решения">
              {DECISION_SUBSTEPS.map((label, index) => (
                <li
                  key={label}
                  aria-current={index === currentDecisionSubstep ? "step" : undefined}
                >
                  <span>{index + 1}</span>
                  {label}
                </li>
              ))}
            </ol>
          )}
        </>
      )}
      {workRequestStatus ? (
        <Notice tone="amber">
          <div className="request-response-heading">
            <div>
              <span className="request-response-eyebrow">Запросы направлены</span>
              <strong>{workRequestStatusLabel}</strong>
            </div>
            <span className="request-response-summary">
              Ожидают действия:{" "}
              <b>
                {pendingApprovals.length + pendingSignatures.length}
              </b>
            </span>
          </div>
          <ul className="request-response-status-list">
            {c.requests.map((request) => {
              const responseReceived = Boolean(request.responded);
              const status = responseReceived
                ? `Ответ получен ${formatDate(request.responded)}`
                : request.sent
                  ? "Ответ ожидается"
                  : request.approved
                    ? "На подписании"
                    : "На согласовании";
              return (
                <li
                  className={responseReceived ? "is-received" : "is-pending"}
                  key={request.id}
                >
                  <span className="request-response-marker" aria-hidden="true">
                    {responseReceived ? "✓" : "…"}
                  </span>
                  <span className="request-response-recipient">
                    <strong>{request.recipient}</strong>
                    <small>Направлен {formatDate(request.date)}</small>
                  </span>
                  <span className={responseReceived ? "response-received" : "response-pending"}>
                    <span className="response-status-dot" aria-hidden="true" />
                    {status}
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="request-status-owner">
            Действие выполняется в кабинете: <strong>{workRequestStatusOwner}</strong>.
          </p>
        </Notice>
      ) : next ? (
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
                    onClick={() =>
                      onAction(next.action, next.role, request.id)
                    }
                  >
                    {next.action === "approve-request" ? "Согласовать" : "Подписать"} запрос в {request.recipient}
                  </Button>
                ))}
              </div>
            ) : canPerformNextAction ? (
              (next.action !== "commission-vote" ||
                (role === "demo-superuser" || role === "commission")) && (
                <Button
                  primary
                  disabled={next.action === "members" && !meetingCompletionAvailable}
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
              <Button primary onClick={() => onAction("fill-meeting-certificate", "work")}>
                Заполнить справку
              </Button>
            )}
            {c.status === "accepted" && (
              <Button
                primary
                onClick={() => onAction("request-other", "work")}
              >
                Сформировать запрос в другой орган
              </Button>
            )}
            {(role === "demo-superuser" || role === "work") && c.status === "decided" && c.type === "notice" &&
              !c.documents.some((document) => document.kind === "conclusion") && (
                <>
                  <Button primary onClick={() => onAction("send-recommendations", "work")}>
                    Направить рекомендации
                  </Button>
                  <Button
                    disabled
                    title="Сначала вложите заключение по обращению"
                  >
                    Завершить рассмотрение
                  </Button>
                </>
              )}
            {c.status === "accepted" && (
              <Button
                primary
                disabled={
                  !c.requests.some(
                    (request) =>
                      request.template === "dvga" ||
                      /ДВГА|КВГА/i.test(request.recipient),
                  )
                }
                onClick={() => onAction("send-request-approval", "work")}
              >
                Направить на согласование
              </Button>
            )}
            {role !== "demo-superuser" && role !== next.role && (
              <small>Действие выполняет {taskOwner}.</small>
            )}
            {c.status === "accepted" && (
              <small>
                Сначала сформируйте обязательный запрос в ДВГА/КВГА, затем при необходимости добавьте запрос в другой орган и направьте документы на согласование.
              </small>
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
              заседания. После первого подтверждения присутствия члену АК
              сразу открывается доступ к материалам обращения.
            </p>
            <p className="consideration-owner">
              Исполнитель: <strong>Члены АК</strong>
            </p>
          </div>
          <div className="consideration-task-action">
            <small>Ожидается хотя бы одно подтверждение присутствия от члена АК.</small>
          </div>
        </div>
      ) : awaitingAuthorityResponse ? (
        <>
          {pendingExternalRequest && (
            <div className="consideration-task">
              <div>
                <span className="consideration-eyebrow">Текущая задача</span>
                <h4>Фиксация получения ответа</h4>
                <p>
                  Вложите ответ другого органа, укажите дату поступления и
                  номер письма.
                </p>
                <p className="consideration-owner">
                  Исполнитель: <strong>Рабочий орган ДАВГА</strong>
                </p>
              </div>
              <div className="consideration-task-action">
                <Button
                  primary
                  onClick={() => onAction("record-external-response", "work")}
                >
                  Вложить ответ
                </Button>
                <small>Действие выполняет Рабочий орган ДАВГА.</small>
              </div>
            </div>
          )}
          <Notice tone="amber">
          <div className="request-response-heading">
            <div>
              <span className="request-response-eyebrow">Запросы направлены</span>
              <strong>Ожидание ответов</strong>
            </div>
            <span className="request-response-summary">
              Ожидают ответа: <b>{pendingResponses}</b>
            </span>
          </div>
          <ul className="request-response-status-list">
            {sentRequests.map((request) => {
              const recipient =
                request.recipient ||
                (request.saqRecipient === "subject"
                  ? "Кабинет Объекта"
                  : "Адресат запроса");
              return (
                <li
                  className={request.responded ? "is-received" : "is-pending"}
                  key={request.id}
                >
                  <span className="request-response-marker" aria-hidden="true">
                    {request.responded ? "✓" : "…"}
                  </span>
                  <span className="request-response-recipient">
                    <strong>{recipient}</strong>
                    <small>Направлен {formatDate(request.sent)}</small>
                  </span>
                  <span className={request.responded ? "response-received" : "response-pending"}>
                    <span className="response-status-dot" aria-hidden="true" />
                    {request.responded
                      ? `Ответ получен ${formatDate(request.responded)}`
                      : "Ответ ожидается"}
                  </span>
                </li>
              );
            })}
          </ul>
          </Notice>
        </>
      ) : materialsAvailableForCommission ? (
        <Notice>
          <strong>Материалы доступны членам АК</strong>
          <p>
            Доступ к карточке обращения открыт членам комиссии, которые подтвердили присутствие на заседании.
          </p>
        </Notice>
      ) : (
        <Notice tone={c.status === "completed" ? "green" : "amber"}>
          <strong>{STATUS[c.status]}</strong>
          <p>
            {c.status === "completed"
              ? "Рассмотрение и учёт исполнения завершены. Результат доступен ниже, сформированные документы — во вкладке «Документы»."
              : "Рассмотрение по существу не продолжается. Основание сохранено в истории и документах дела."}
          </p>
        </Notice>
      )}
      {lastEvent && (
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
      {currentStatus !== "received" && extras.length > 0 && (
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
