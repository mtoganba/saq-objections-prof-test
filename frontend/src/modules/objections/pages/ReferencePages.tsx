import { Button, Modal, Notice, PageHeading } from "../../../components/ui";
import { agendaItemText } from "../components/AgendaModal";
import { AgendaResultsTable } from "../components/AgendaResultsModal";
import { useState } from "react";
import { STATUS } from "../../../data/constants";
import { STEPS } from "../../../data/workflowDefinitions";
import type {
  CommissionMeeting,
  CommissionAttendanceMember,
  CommissionAttendancePoll,
  ObjectionCase,
  Role,
} from "../../../types";
import { formatDate, formatDateTime } from "../../../utils/dateFormat";

const REVIEWED_CASE_STATUSES = new Set([
  "hearing",
  "hearing_ready",
  "meeting",
  "protocol",
  "decision_project",
  "decision_project_approval",
  "decision_project_signed",
  "decision_project_eotinish",
  "decision_project_hearing",
  "decided",
  "final_response_approval",
  "final_response_signed",
  "delivered",
  "completed",
  "refused",
]);

const sources = [
  [
    "Z1500000392",
    "Закон о государственном аудите и финансовом контроле",
    "12.11.2015 № 392-V",
    "Статьи 58-1–58-5: специальный порядок возражений. Сопоставлена доступная копия; полная сверка текущей официальной редакции не завершена.",
  ],
  [
    "V2000020171",
    "Положение об апелляционной комиссии",
    "20.03.2020 № 302",
    "Материалы, заседание, голосование, протокол. Использована редакция через приказ № 70 от 21.01.2022; требуется окончательная сверка текущего текста.",
  ],
  [
    "V1800016689",
    "Правила внутреннего государственного аудита и финансового контроля",
    "19.03.2018 № 392",
    "Пункты 101–104, приложение 12-1. Проверены нормы подачи возражения и учёта третьих лиц по доступной копии.",
  ],
  [
    "V1500012599",
    "Правила проведения камерального контроля",
    "30.11.2015 № 598",
    "Пункты 23–28, приложения 6 и 7. Дополнительно проверены доступные тексты изменений № 282 и № 523 за 2026 год.",
  ],
  [
    "Z2400000106",
    "Закон о государственных закупках",
    "01.07.2024 № 106-VIII",
    "Статья 25: отдельная жалоба участника закупки. Не смешивается с возражением объекта на уведомление.",
  ],
  [
    "V2400035238",
    "Правила осуществления государственных закупок",
    "09.10.2024 № 687",
    "Глава 19: обжалование итогов конкурса/аукциона. Самостоятельный маршрут вне трёх текущих сценариев.",
  ],
  [
    "K2000000350",
    "Административный процедурно-процессуальный кодекс",
    "29.06.2020 № 350-VI",
    "Статьи 91–100, 136: общий порядок административной жалобы и судебного обжалования.",
  ],
  [
    "K1500000375",
    "Предпринимательский кодекс",
    "29.10.2015 № 375-V",
    "Статья 157: обжалование решений и действий при контроле. Применимость проверяется по виду контроля и субъекту.",
  ],
];

export function SourcesPage() {
  return (
    <>
      <PageHeading
        title="Нормативная база"
        subtitle="Шесть документов со скриншотов и связанные кодексы"
      />
      <Notice tone="amber">
        <strong>Статус нормативной проверки — 08.09.2026</strong>
        <p>
          Процессы сопоставлены с доступными текстами. Полные страницы «Әділет»
          недоступны из среды исследования, поэтому полная сверка всех
          действующих редакций не завершена. Прототип предназначен для
          согласования модели с ДВГА.
        </p>
      </Notice>
      <section className="card">
        <div className="card-body">
          {sources.map(([id, name, number, note]) => (
            <article className="source-entry" key={id}>
              <h3>
                <a
                  href={`https://adilet.zan.kz/rus/docs/${id}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {name}
                </a>
              </h3>
              <p className="muted">{number}</p>
              <p>{note}</p>
            </article>
          ))}
        </div>
      </section>
      <section className="card card-spaced">
        <div className="card-body">
          <h3>Дополнительная сверка изменений 2026 года</h3>
          <p>
            Приказ № 282: возражение и доказательства направляются через портал
            и/или ту цифровую систему, по которой поступило уведомление;
            заключение возвращается по этому каналу.{" "}
            <a
              href="https://zakon.uchet.kz/rus/docs/V2600038574"
              target="_blank"
              rel="noreferrer"
            >
              Проверенный текст изменений
            </a>
            .
          </p>
          <p>
            Приказ № 523: уточнены полномочия и пункт 28 о приостановлении
            расходных операций; его действие приостанавливается на период
            рассмотрения возражения.{" "}
            <a
              href="https://cdb.kz/sistema/pravovaya-baza/o-vnesenii-izmeneniy-v-nekotorye-prikazy-ministra-finansov-respubliki-kazakhstan-prikaz-523/"
              target="_blank"
              rel="noreferrer"
            >
              Проверенный текст изменений
            </a>
            .
          </p>
          <p className="muted">
            Эта дополнительная сверка не заменяет проверки консолидированных
            официальных редакций и утверждения форм документов.
          </p>
        </div>
      </section>
    </>
  );
}

export function ProcessesPage() {
  return (
    <>
      <PageHeading
        title="Бизнес-процессы"
        subtitle="Разные предметы обжалования — разные маршруты рассмотрения"
      />
      <div className="process-grid">
        {[
          {
            title: "Уведомление камерального контроля",
            deadline: "Подача: 5 рабочих дней. Рассмотрение: 15 рабочих дней.",
            steps: STEPS,
          },
          {
            title: "Аудиторский отчёт",
            deadline: "Подача: 10 рабочих дней. Рассмотрение: 30 рабочих дней.",
            steps: STEPS,
          },
          {
            title: "Акт профилактического контроля",
            deadline:
              "В тестовой модели АППК: подача — 3 месяца, рассмотрение — 20 рабочих дней. Есть специальные правила и исключения.",
            steps: STEPS,
          },
        ].map((process) => (
          <section className="card" key={process.title}>
            <div className="card-head">
              <h3>{process.title}</h3>
            </div>
            <div className="card-body">
              <p>{process.deadline}</p>
              <ol className="process-steps">
                {process.steps.map(([key, label]) => (
                  <li key={key}>{label}</li>
                ))}
              </ol>
            </div>
          </section>
        ))}
      </div>
      <section className="card card-spaced">
        <div className="card-body">
          <h3>Что важно при согласовании</h3>
          <ul className="plain-list">
            <li>
              ДВГА готовит позицию и исполняет результат; специальное возражение
              рассматривает комиссия при уполномоченном органе.
            </li>
            <li>
              В уведомлении остаются неоспоренные пункты и нарушения, по которым
              доводы отклонены.
            </li>
            <li>
              По аудиторскому отчёту учитываются позиции затронутых третьих лиц.
            </li>
            <li>
              По акту профконтроля сначала устанавливаются вид контроля,
              компетентный орган и применимый специальный порядок.
            </li>
            <li>
              Отказ в рассмотрении и отказ в удовлетворении доводов — разные
              результаты.
            </li>
            <li>
              Срок рассмотрения, исполнение исходного документа и исполнение
              решения при судебном обжаловании учитываются раздельно.
            </li>
            <li>
              Дополнение объекта может продлить специальное возражение; обычное
              вложение файла этого не делает.
            </li>
            <li>
              Дата отправки результата и дата его вручения фиксируются отдельно.
            </li>
          </ul>
          <Notice>
            Жалоба участника конкурса/аукциона по статье 25 Закона о госзакупках
            — отдельный процесс у заказчика/организатора. Он не входит в три
            текущих тестовых дела.
          </Notice>
        </div>
      </section>
    </>
  );
}

export function SessionsPage({
  cases,
  meetings = [],
  attendancePolls,
  commissionMembers,
  role,
  date,
  onOpen,
  onCreateMeeting,
  onUpdateAttendanceResponse,
  onAddCase,
  onExcludeCases,
  onTransferCases,
  onMoveCase,
  onPreviewAgenda,
  onSignAgenda,
  onCompleteMeeting,
  initialMeetingId,
}: {
  cases: ObjectionCase[];
  meetings?: CommissionMeeting[];
  attendancePolls: CommissionAttendancePoll[];
  commissionMembers: CommissionAttendanceMember[];
  role: Role;
  date: string;
  onOpen: (c: ObjectionCase) => void;
  onCreateMeeting: () => void;
  onUpdateAttendanceResponse: (
    pollId: string,
    memberId: string,
    response: "yes" | "no",
  ) => void;
  onAddCase: (meetingId: string, caseId: string) => void;
  onExcludeCases: (meetingId: string, caseIds: string[]) => void;
  onTransferCases: (
    fromMeetingId: string,
    toMeetingId: string,
    caseIds: string[],
  ) => void;
  onMoveCase: (meetingId: string, caseId: string, direction: "up" | "down") => void;
  onPreviewAgenda: (meeting: CommissionMeeting) => void;
  onSignAgenda: (meetingId: string) => void;
  onCompleteMeeting: (meetingId: string) => void;
  initialMeetingId?: string;
}) {
  const [selectedMeetingId, setSelectedMeetingId] = useState<string | null>(
    () =>
      initialMeetingId && meetings.some((meeting) => meeting.id === initialMeetingId)
        ? initialMeetingId
        : null,
  );
  const [sessionsTab, setSessionsTab] = useState<"meetings" | "excluded">(
    "meetings",
  );
  const [isAddingCase, setIsAddingCase] = useState(false);
  const [caseIdToAdd, setCaseIdToAdd] = useState("");
  const [selectedCaseIds, setSelectedCaseIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [isTransferringCases, setIsTransferringCases] = useState(false);
  const [transferMeetingId, setTransferMeetingId] = useState("");
  const selectedMeeting = meetings.find((meeting) => meeting.id === selectedMeetingId);
  const selectedPoll = selectedMeeting
    ? attendancePolls.find((poll) => poll.id === selectedMeeting.pollId)
    : undefined;

  const meetingCases = selectedMeeting
    ? selectedMeeting.caseIds
        .map((caseId) => cases.find((caseItem) => caseItem.id === caseId))
        .filter((caseItem): caseItem is ObjectionCase => Boolean(caseItem))
    : [];
  const addableCases = selectedMeeting && !selectedMeeting.agendaSigned
    ? cases.filter(
        (caseItem) =>
          ["certificate_approved", "documents_review"].includes(caseItem.status) &&
          !selectedMeeting.caseIds.includes(caseItem.id),
      )
    : [];
  const selectedMeetingCaseIds = meetingCases
    .map((caseItem) => caseItem.id)
    .filter((caseId) => selectedCaseIds.has(caseId));
  const transferTargets = selectedMeeting
    ? meetings.filter(
        (meeting) =>
          meeting.id !== selectedMeeting.id &&
          !meeting.agendaSigned &&
          !meeting.completed,
      )
    : [];
  const scheduledCaseIds = new Set(
    meetings.flatMap((meeting) => meeting.caseIds),
  );
  const excludedCases = cases.filter(
    (caseItem) =>
      ["certificate_approved", "documents_review"].includes(caseItem.status) &&
      !scheduledCaseIds.has(caseItem.id),
  );
  const signatureDate = selectedMeeting
    ? (() => {
        const value = new Date(selectedMeeting.dateTime);
        value.setDate(value.getDate() - 1);
        return value.toISOString().slice(0, 10);
      })()
    : "";
  const canSignAgenda =
    Boolean(selectedMeeting) && date >= signatureDate && !selectedMeeting?.agendaSigned;

  if (selectedMeeting) {
    return (
      <>
        <PageHeading
          title={"Заседание №" + selectedMeeting.number}
          subtitle={"Дата и время: " + formatDateTime(selectedMeeting.dateTime)}
          action={<Button onClick={() => setSelectedMeetingId(null)}>К реестру заседаний</Button>}
        />
        <Notice>
          Опрос направляется автоматически при создании заседания. Председатель АК — Вице-министр; при его отсутствии председательствует Директор ДАВГА.
        </Notice>

        <section className="card">
          <div className="card-head">
            <h3>Опрос</h3>
            <span className="muted">Ответы членов Апелляционной комиссии</span>
          </div>
          <div className="table-scroll">
            <table className="registry-table attendance-status-table">
              <thead>
                <tr>
                  <th>Член АК</th>
                  <th>Ответ</th>
                  <th>Роль на заседании</th>
                  <th>Изменение исполнителем рабочего органа</th>
                  {(role === "demo-superuser" || role === "work") && <th>Отметить вручную</th>}
                </tr>
              </thead>
              <tbody>
                {commissionMembers.map((member) => {
                  const response = selectedPoll?.responses[member.id] || "pending";
                  const changed = selectedPoll?.manualResponseChanges?.[member.id];
                  const isViceMinister = member.id === "kenbeil-dm";
                  const isDavgaDirector = member.id === "kurenbek-shb";
                  const isChair = selectedPoll?.chairId === member.id;
                  const chairLabel = isChair
                    ? isViceMinister
                      ? "Председатель АК"
                      : "И.О. Председателя АК"
                    : isViceMinister
                      ? "Председатель АК"
                      : isDavgaDirector
                        ? "Директор ДАВГА"
                        : "—";
                  return (
                    <tr key={member.id}>
                      <td>{member.name}</td>
                      <td>
                        <span className={"badge " + (response === "yes" ? "green" : response === "no" ? "gray" : "amber")}>
                          {response === "yes" ? "Будет присутствовать" : response === "no" ? "Не будет присутствовать" : "Нет ответа"}
                        </span>
                      </td>
                      <td>{chairLabel}</td>
                      <td>
                        {changed
                          ? changed.changedBy + " изменил(а) ответ " + formatDate(changed.changedAt)
                          : "—"}
                      </td>
                      {(role === "demo-superuser" || role === "work") && (
                        <td>
                          <select
                            value={response}
                            aria-label={"Отметить присутствие: " + member.name}
                            onChange={(event) => {
                              const value = event.target.value;
                              if (value === "yes" || value === "no") {
                                onUpdateAttendanceResponse(
                                  selectedMeeting.pollId,
                                  member.id,
                                  value,
                                );
                              }
                            }}
                          >
                            <option value="pending">Нет ответа</option>
                            <option value="yes">Будет присутствовать</option>
                            <option value="no">Не будет присутствовать</option>
                          </select>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section className="card">
          <div className="card-head">
            <h3>Итоги по повестке дня</h3>
            <span className="muted">Голоса членов АК и общий результат по каждому пункту</span>
          </div>
          <AgendaResultsTable cases={meetingCases} />
        </section>

        <section className="card">
          <div className="card-head">
            <div>
              <h3>Обращения</h3>
              <span className="muted">Готовые к рассмотрению АК обращения, включённые в заседание</span>
            </div>
            {(role === "demo-superuser" || role === "director") && (
              <div className="agenda-registry-actions">
                <Button
                  disabled={Boolean(selectedMeeting.agendaSigned)}
                  onClick={() => {
                    setCaseIdToAdd("");
                    setIsAddingCase(true);
                  }}
                >
                  Добавить обращение
                </Button>
                <Button
                  disabled={Boolean(selectedMeeting.agendaSigned) || !selectedMeetingCaseIds.length}
                  onClick={() => {
                    onExcludeCases(selectedMeeting.id, selectedMeetingCaseIds);
                    setSelectedCaseIds(new Set());
                  }}
                >
                  Исключить обращение
                </Button>
                <Button
                  disabled={Boolean(selectedMeeting.agendaSigned) || !selectedMeetingCaseIds.length}
                  onClick={() => {
                    setTransferMeetingId("");
                    setIsTransferringCases(true);
                  }}
                >
                  Перенести
                </Button>
              </div>
            )}
          </div>
          <div className="table-scroll">
            <table className="registry-table">
              <thead>
                <tr>
                  <th>
                    {(role === "demo-superuser" || role === "director") && !selectedMeeting.agendaSigned ? (
                      <input
                        type="checkbox"
                        aria-label="Выбрать все обращения"
                        checked={
                          meetingCases.length > 0 &&
                          meetingCases.every((caseItem) => selectedCaseIds.has(caseItem.id))
                        }
                        onChange={(event) =>
                          setSelectedCaseIds(
                            event.target.checked
                              ? new Set(meetingCases.map((caseItem) => caseItem.id))
                              : new Set(),
                          )
                        }
                      />
                    ) : null}
                  </th>
                  <th>№</th>
                  <th>Обращение</th>
                  <th>Объект</th>
                  <th>Статус</th>
                  <th>Рассмотрено</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {meetingCases.map((caseItem, index) => (
                  <tr key={caseItem.id}>
                    <td>
                      {(role === "demo-superuser" || role === "director") && !selectedMeeting.agendaSigned ? (
                        <input
                          type="checkbox"
                          aria-label={`Выбрать обращение ${caseItem.id}`}
                          checked={selectedCaseIds.has(caseItem.id)}
                          onChange={(event) =>
                            setSelectedCaseIds((current) => {
                              const next = new Set(current);
                              if (event.target.checked) next.add(caseItem.id);
                              else next.delete(caseItem.id);
                              return next;
                            })
                          }
                        />
                      ) : null}
                    </td>
                    <td>{index + 1}</td>
                    <td>{caseItem.id}</td>
                    <td>{caseItem.org}</td>
                    <td>{STATUS[caseItem.status]}</td>
                    <td>
                      <span
                        className={
                          "badge " +
                          (REVIEWED_CASE_STATUSES.has(caseItem.status)
                            ? "green"
                            : "gray")
                        }
                      >
                        {caseItem.transferredFromMeetingIds?.includes(selectedMeeting.id)
                          ? "Перенесено"
                          : REVIEWED_CASE_STATUSES.has(caseItem.status)
                            ? "Да"
                            : "Нет"}
                      </span>
                    </td>
                    <td className="agenda-registry-actions">
                      <Button onClick={() => onOpen(caseItem)}>Открыть</Button>
                    </td>
                  </tr>
                ))}
                {!meetingCases.length && (
                  <tr>
                    <td colSpan={7}>
                      <div className="empty-state">
                        <h3>В заседание не включены обращения</h3>
                        <p>Директор ДАВГА может исключить обращение до подписания повестки дня.</p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {isAddingCase && (role === "demo-superuser" || role === "director") && (
          <Modal
            title="Добавить обращение в заседание"
            onClose={() => setIsAddingCase(false)}
          >
            {addableCases.length ? (
              <>
                <p className="muted">
                  Доступны обращения со статусами «Готово к рассмотрению АК» и «Ознакомление с документами».
                </p>
                <label className="field">
                  <span>Обращение</span>
                  <select
                    value={caseIdToAdd}
                    onChange={(event) => setCaseIdToAdd(event.target.value)}
                  >
                    <option value="">Выберите обращение</option>
                    {addableCases.map((caseItem) => (
                      <option key={caseItem.id} value={caseItem.id}>
                        {caseItem.id} — {caseItem.org}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="dialog-actions">
                  <Button onClick={() => setIsAddingCase(false)}>Отмена</Button>
                  <Button
                    primary
                    disabled={!caseIdToAdd}
                    onClick={() => {
                      onAddCase(selectedMeeting.id, caseIdToAdd);
                      setIsAddingCase(false);
                    }}
                  >
                    Добавить
                  </Button>
                </div>
              </>
            ) : (
              <Notice>
                Нет обращений со статусами «Готово к рассмотрению АК» и «Ознакомление с документами», доступных для добавления.
              </Notice>
            )}
          </Modal>
        )}

        {isTransferringCases && (role === "demo-superuser" || role === "director") && (
          <Modal
            title="Перенести обращения в другое заседание"
            onClose={() => setIsTransferringCases(false)}
          >
            {transferTargets.length ? (
              <>
                <p className="muted">
                  Будет перенесено обращений: {selectedMeetingCaseIds.length}.
                </p>
                <label className="field">
                  <span>Заседание</span>
                  <select
                    value={transferMeetingId}
                    onChange={(event) => setTransferMeetingId(event.target.value)}
                  >
                    <option value="">Выберите заседание</option>
                    {transferTargets.map((meeting) => (
                      <option key={meeting.id} value={meeting.id}>
                        Заседание №{meeting.number} — {formatDateTime(meeting.dateTime)}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="dialog-actions">
                  <Button onClick={() => setIsTransferringCases(false)}>Отмена</Button>
                  <Button
                    primary
                    disabled={!transferMeetingId || !selectedMeetingCaseIds.length}
                    onClick={() => {
                      onTransferCases(
                        selectedMeeting.id,
                        transferMeetingId,
                        selectedMeetingCaseIds,
                      );
                      setSelectedCaseIds(new Set());
                      setIsTransferringCases(false);
                    }}
                  >
                    Перенести
                  </Button>
                </div>
              </>
            ) : (
              <Notice>Нет другого неподписанного заседания для переноса.</Notice>
            )}
          </Modal>
        )}

        <section className="card">
          <div className="card-head">
            <div>
              <h3>Повестка дня</h3>
              <p className="muted">
                {selectedMeeting.agendaSigned
                  ? "Повестка подписана и направлена в кабинеты членов АК."
                  : "До подписания директор ДАВГА может изменить порядок пунктов."}
              </p>
            </div>
            <div className="agenda-registry-actions">
              <Button onClick={() => onPreviewAgenda(selectedMeeting)}>
                Открыть печатную форму
              </Button>
              {(role === "demo-superuser" || role === "director") && (
                <Button
                  primary
                  disabled={!canSignAgenda || !meetingCases.length}
                  onClick={() => onSignAgenda(selectedMeeting.id)}
                >
                  {selectedMeeting.agendaSigned ? "Повестка подписана" : "Подписать повестку"}
                </Button>
              )}
            </div>
          </div>
          {!selectedMeeting.agendaSigned && date < signatureDate && (
            <Notice tone="amber">
              Подписание повестки будет доступно {formatDate(signatureDate)} — за день до заседания.
            </Notice>
          )}
          <div className="card-body">
            <ol className="agenda-order-list">
              {meetingCases.map((caseItem, index) => (
                <li key={caseItem.id}>
                  <span>{agendaItemText(caseItem)}</span>
                  {(role === "demo-superuser" || role === "director") && !selectedMeeting.agendaSigned && (
                    <span className="agenda-registry-actions">
                      <Button
                        disabled={index === 0}
                        onClick={() => onMoveCase(selectedMeeting.id, caseItem.id, "up")}
                      >
                        Выше
                      </Button>
                      <Button
                        disabled={index === meetingCases.length - 1}
                        onClick={() => onMoveCase(selectedMeeting.id, caseItem.id, "down")}
                      >
                        Ниже
                      </Button>
                    </span>
                  )}
                </li>
              ))}
            </ol>
          </div>
        </section>
      </>
    );
  }

  return (
    <>
      <PageHeading
        title="Заседания комиссии"
        subtitle="Карточки заседаний, опрос членов АК и повестка дня"
        action={
          (role === "demo-superuser" || role === "work") && sessionsTab === "meetings" ? (
            <Button primary onClick={onCreateMeeting}>+ Создать заседание</Button>
          ) : undefined
        }
      />
      <div className="session-tabs" role="tablist" aria-label="Разделы заседаний">
        <button
          type="button"
          className={sessionsTab === "meetings" ? "active" : ""}
          onClick={() => setSessionsTab("meetings")}
        >
          Заседания
        </button>
        <button
          type="button"
          className={sessionsTab === "excluded" ? "active" : ""}
          onClick={() => setSessionsTab("excluded")}
        >
          Не включённые в заседание
          {excludedCases.length > 0 && (
            <span className="session-tab-badge">{excludedCases.length}</span>
          )}
        </button>
      </div>
      {sessionsTab === "meetings" ? (
        <section className="card">
          <div className="table-scroll">
            <table className="registry-table">
              <thead>
                <tr>
                  <th>Заседание</th>
                  <th>Дата и время</th>
                  <th>Обращения</th>
                  <th>Опрос</th>
                  <th>Повестка дня</th>
                  <th>Заседание проведено</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {[...meetings]
                  .sort((left, right) => right.dateTime.localeCompare(left.dateTime))
                  .map((meeting) => {
                    const poll = attendancePolls.find((item) => item.id === meeting.pollId);
                    const answers = poll ? Object.values(poll.responses) : [];
                    const yes = answers.filter((answer) => answer === "yes").length;
                    return (
                      <tr key={meeting.id}>
                        <td>№ {meeting.number}</td>
                        <td>{formatDateTime(meeting.dateTime)}</td>
                        <td>{meeting.caseIds.length}</td>
                        <td>{poll ? "Подтвердили: " + yes : "Не направлен"}</td>
                        <td>
                          <span className={"badge " + (meeting.agendaSigned ? "green" : "amber")}>
                            {meeting.agendaSigned ? "Подписана" : "Ожидает подписания"}
                          </span>
                        </td>
                        <td>
                          {meeting.completed ? (
                            <span className="badge green">Проведено</span>
                          ) : (role === "demo-superuser" || role === "work") ? (
                            <Button
                              disabled={
                                !meeting.agendaSigned ||
                                date < meeting.dateTime.slice(0, 10)
                              }
                              onClick={() => onCompleteMeeting(meeting.id)}
                            >
                              Заседание проведено
                            </Button>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td><Button onClick={() => setSelectedMeetingId(meeting.id)}>Открыть</Button></td>
                      </tr>
                    );
                  })}
                {!meetings.length && (
                  <tr>
                    <td colSpan={7}>
                      <div className="empty-state">
                        <h3>Заседания ещё не созданы</h3>
                        <p>Исполнитель рабочего органа создаёт карточку заседания и указывает дату и время.</p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      ) : (
        <section className="card">
          <div className="table-scroll">
            <table className="registry-table">
              <thead>
                <tr>
                  <th>№</th>
                  <th>Обращение</th>
                  <th>Объект</th>
                  <th>Статус</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {excludedCases.map((caseItem, index) => (
                  <tr key={caseItem.id}>
                    <td>{index + 1}</td>
                    <td>{caseItem.id}</td>
                    <td>{caseItem.org}</td>
                    <td>{STATUS[caseItem.status]}</td>
                    <td><Button onClick={() => onOpen(caseItem)}>Открыть</Button></td>
                  </tr>
                ))}
                {!excludedCases.length && (
                  <tr>
                    <td colSpan={5}>
                      <div className="empty-state">
                        <h3>Исключенных обращений нет</h3>
                        <p>Все обращения включены в заседания.</p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}
