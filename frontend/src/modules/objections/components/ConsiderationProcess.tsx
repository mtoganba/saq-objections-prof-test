import { Button, Notice } from "../../../components/ui";
import { ROLES, STATUS } from "../../../data/constants";
import type { Action, CaseStatus, ObjectionCase, Role } from "../../../types";
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
    label: "Формирование запроса в ДВГА/КВГА и др",
    description: "Подготовка и направление запросов, получение ответов",
    statuses: [
      "accepted",
      "requested",
      "request_approval",
      "request_approved",
      "materials",
      "certificate_approval",
      "certificate_approved",
    ],
  },
  {
    label: "Заседание",
    description: "Проведение заседания по делу",
    statuses: ["circulated"],
  },
  {
    label: "Решение",
    description: "Голоса и протокол",
    statuses: ["hearing", "hearing_ready", "meeting", "protocol"],
  },
  {
    label: "Исполнение",
    description: "Направление результата и исполнение",
    statuses: ["decided", "delivered", "completed"],
  },
];

const CONTROL_STAGES: ProcessStage[] = [
  {
    label: "Приём",
    description: "Допустимость и компетенция",
    statuses: ["received"],
  },
  {
    label: "Формирование запроса в ДВГА/КВГА и др",
    description: "Подготовка и направление запросов, получение ответов",
    statuses: [
      "accepted",
      "forwarded",
      "requested",
      "request_approval",
      "request_approved",
      "materials",
    ],
  },
  {
    label: "Заслушивание",
    description: "Позиции заявителя и органа",
    statuses: ["hearing", "hearing_ready"],
  },
  { label: "Решение", description: "Решение по жалобе", statuses: ["meeting"] },
  {
    label: "Исполнение",
    description: "Направление результата и исполнение",
    statuses: ["decided", "delivered", "completed"],
  },
];

const TASK_HELP: Partial<Record<Action, string>> = {
  screen:
    "Проверьте заявителя, исходный документ, срок подачи и компетенцию органа. Назначьте ответственного и зафиксируйте основание принятия к рассмотрению.",
  request:
    "Выберите, куда направить запрос: в ДВГА/КВГА или в другой орган. Для ДВГА/КВГА адресат выбирается из списка; для другого органа адресат и текст запроса заполняются вручную.",
  "send-request-approval":
    "Проверьте сформированные запрос и приложение, затем направьте их директору ДАВГА на согласование.",
  "approve-request":
    "Проверьте сформированные документы и подтвердите согласование запроса.",
  "fill-request-response":
    "Заполните мотивированный ответ по каждому пункту и приложите подтверждающие документы.",
  position:
    "Вложите полученные файлы в материалы дела, затем подтвердите поступление ответа.",
  analysis:
    "Заполните доводы ДВГА и позиции членов апелляционной комиссии. Система сформирует справку по шаблону.",
  "approve-certificate":
    "Проверьте сформированную справку и согласуйте её для направления членам апелляционной комиссии.",
  "send-certificate-to-commission":
    "Направьте согласованную справку и все документы по обращению членам апелляционной комиссии для ознакомления.",
  members:
    "Подтвердите, что заседание по данному делу проведено. После этого обращение перейдёт на этап принятия решения.",
  hearing:
    "Укажите порядок извещения и дату заслушивания. Если применяется предусмотренное основание для его непроведения, зафиксируйте его в форме.",
  "hearing-held":
    "Зафиксируйте участие сторон, их позиции и результаты состоявшегося заслушивания.",
  vote: "Отметьте присутствующих и отводы, внесите голоса по каждому пункту. Система проверит кворум и результаты голосования.",
  sign: "Проверьте результаты голосования и зарегистрируйте подписание протокола. После этого оформляется результат рассмотрения.",
  deliver:
    "Оформите результат, укажите канал направления и порядок дальнейшего обжалования. Получение результата учитывается отдельно.",
  execute:
    "Зафиксируйте исполнение принятого решения и его последствия для исходного документа.",
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

function openRequest(
  mode: "dvga-kvga" | "other",
  onAction: (action: Action, role: Role) => void,
  role: Role,
) {
  try {
    sessionStorage.setItem("saq.objections.request-mode", mode);
  } catch {
    // The modal defaults to the DVGА/KVGА form when storage is unavailable.
  }
  onAction("request", role);
}

export default function ConsiderationProcess({
  c,
  role,
  onAction,
  onHistory,
}: {
  c: ObjectionCase;
  role: Role;
  onAction: (action: Action, role: Role) => void;
  onHistory: () => void;
}) {
  const next = nextAction(c);
  const stages = c.type === "control" ? CONTROL_STAGES : OBJECTION_STAGES;
  const currentStatus = c.status === "paused" ? c.resumeStatus : c.status;
  const inRequestFormationStage = stages[1].statuses.includes(
    currentStatus ?? c.status,
  );
  const availableExtras = additionalActions(c).filter(
    (option) => option.action !== "upload",
  );
  const extras = inRequestFormationStage
    ? availableExtras.filter((option) => option.action === "supplement")
    : availableExtras;
  const lastEvent = c.history.at(-1);

  return (
    <section
      className="consideration-process"
      aria-label="Процесс рассмотрения"
    >
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
      {next ? (
        <div className="consideration-task">
          <div>
            <span className="consideration-eyebrow">Текущая задача</span>
            <h4>{next.label}</h4>
            <p>{TASK_HELP[next.action]}</p>
            <p className="consideration-owner">
              Исполнитель: <strong>{ROLES[next.role]}</strong>
            </p>
          </div>
          <div className="consideration-task-action">
            {c.status === "accepted" && next.action === "request" ? (
              <>
                <Button
                  primary
                  onClick={() => openRequest("dvga-kvga", onAction, next.role)}
                >
                  Сформировать запрос в ДВГА/КВГА
                </Button>
                <Button
                  onClick={() => openRequest("other", onAction, next.role)}
                >
                  Сформировать запрос в другой орган
                </Button>
              </>
            ) : (
              <Button primary onClick={() => onAction(next.action, next.role)}>
                {c.status === "received" ? "Начать рассмотрение" : next.label}
              </Button>
            )}
            {role !== next.role && (
              <small>Действие выполняет {ROLES[next.role]}.</small>
            )}
            <small>
              Заполните форму и сохраните действие — откроется следующая задача.
            </small>
          </div>
        </div>
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
