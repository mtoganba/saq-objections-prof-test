import { useState } from "react";
import { Button, Notice, PageHeading } from "../../../components/ui";
import { CLOSED, OUTCOMES, STATUS, TYPES } from "../../../data/constants";
import type {
  Action,
  CaseDocument,
  CaseTab,
  ObjectionCase,
  Role,
  ViolationPoint,
} from "../../../types";
import {
  formatDate,
  formatDateTime,
  formatMoney,
} from "../../../utils/dateFormat";
import {
  addMonths,
  addWorkdays,
  executionDeadline,
  reviewDeadline,
} from "../services/deadlines";
import ConsiderationProcess from "../components/ConsiderationProcess";
import { wordDocumentHtml } from "../components/DocumentModal";
import { downloadFile } from "../../../utils/download";

function Fact({
  label,
  value,
  wide = false,
}: {
  label: string;
  value?: string;
  wide?: boolean;
}) {
  return (
    <div className={`fact ${wide ? "full" : ""}`}>
      <span>{label}</span>
      <strong>{value || "—"}</strong>
    </div>
  );
}

function PointCard({
  point,
  documents,
  review = false,
}: {
  point: ViolationPoint;
  documents: CaseDocument[];
  review?: boolean;
}) {
  const [expanded, setExpanded] = useState(true);
  const result = point.final || point.proposal;
  const evidenceDocuments = point.evidence
    ? documents.filter(
        (document) =>
          !!document.dataUrl &&
          point.evidence!
            .split(",")
            .map((name) => name.trim())
            .includes(document.filename || document.name),
      )
    : [];
  return (
    <article className="point-card">
      <div className="point-head">
        <strong>
          Пункт {point.number} · {point.title}
        </strong>
        <div className="point-head-actions">
          <span className={`badge ${point.disputed ? "blue" : "gray"}`}>
            {point.disputed ? "Оспаривается" : "Не оспаривается"}
          </span>
          <button
            type="button"
            className="text-button"
            onClick={() => setExpanded((value) => !value)}
            aria-expanded={expanded}
          >
            {expanded ? "Свернуть" : "Развернуть"}
          </button>
        </div>
      </div>
      <div hidden={!expanded}>
      {point.finding && (
        <p>
          <b>Документы подтверждающие нарушение:</b> {point.finding}
        </p>
      )}
      <p>
        <b>Довод заявителя:</b> {point.argument}
      </p>
      {point.evidence && (
        <p>
          <b>Доказательства:</b>{" "}
          {evidenceDocuments.length ? (
            evidenceDocuments.map((document, index) => (
              <span key={`${document.filename}-${index}`}>
                {index > 0 && ", "}
                <a
                  href={document.dataUrl}
                  download={document.filename || document.name}
                >
                  {document.filename || document.name}
                </a>
              </span>
            ))
          ) : (
            point.evidence
          )}
        </p>
      )}
      {point.amount > 0 && (
        <p>
          <b>Сумма:</b> {formatMoney(point.amount)}
        </p>
      )}
      {review && (
        <>
          {point.position && (
            <p>
              <b>Позиция ДВГА:</b> {point.position}
            </p>
          )}
          {point.analysis && (
            <p>
              <b>Анализ:</b> {point.analysis}
            </p>
          )}
          {point.legal && (
            <p>
              <b>Основание:</b> {point.legal}
            </p>
          )}
          {result && (
            <p>
              <b>{point.final ? "Принятое решение" : "Проект решения"}:</b>{" "}
              {OUTCOMES[result]}
              {point.remainingAmount != null && point.amount > 0
                ? `; остаток ${formatMoney(point.remainingAmount)}`
                : ""}
            </p>
          )}
        </>
      )}
      </div>
    </article>
  );
}

function isAuthorityRole(role: Role) {
  return role === "dvga" || role === "kvga";
}

function isRequestForAuthority(
  request: ObjectionCase["requests"][number],
  role: Role,
) {
  if (!isAuthorityRole(role) || request.template === "other" || !request.sent)
    return false;
  const recipient = request.recipient.toUpperCase();
  return role === "kvga"
    ? recipient.includes("КВГА")
    : recipient.includes("ДВГА");
}

function AuthorityRequestMaterials({
  c,
  role,
  onDocument,
}: {
  c: ObjectionCase;
  role: Role;
  onDocument: (kind: string, document?: CaseDocument) => void;
}) {
  const requests = c.requests.filter((request) =>
    isRequestForAuthority(request, role),
  );
  const authorityLabel = role === "kvga" ? "КВГА" : "ДВГА";

  return (
    <>
      <h3 className="form-section">Материалы и результаты рассмотрения</h3>
      {requests.map((request) => {
        const documents = c.documents.filter(
          (document) =>
            document.requestId === request.id &&
            ["request", "request-appendix"].includes(document.kind),
        );
        return (
          <section className="request-documents-section" key={request.id}>
            <h4>Запрос в {authorityLabel}</h4>
            <div className="request-documents-list">
              {documents.map((document) => (
                <div className="request-document-row" key={document.name}>
                  <span>{document.name}</span>
                  <Button onClick={() => onDocument(document.kind, document)}>
                    Просмотр
                  </Button>
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </>
  );
}

function OtherOrganResponses({
  c,
  role,
  onAction,
  onDocument,
}: {
  c: ObjectionCase;
  role: Role;
  onAction: (action: Action, role: Role, requestId?: string) => void;
  onDocument: (kind: string, document?: CaseDocument) => void;
}) {
  const requests = c.requests.filter(
    (request) =>
      request.template === "other" &&
      !request.saqRecipient &&
      Boolean(request.sent),
  );
  if (!requests.length) return null;
  const canRecord =
    (role === "demo-superuser" || role === "work") &&
    requests.some((request) => !request.responded);
  const receivedCount = requests.filter((request) => request.responded).length;

  return (
    <section className="request-documents-section external-response-section">
      <div className="external-response-header">
        <div>
          <h4>Ответы других органов</h4>
          <span className="external-response-summary">
            Получено: {receivedCount} из {requests.length}
          </span>
        </div>
        {canRecord && (
          <Button primary onClick={() => onAction("record-external-response", "work")}>
            Вложить ответ
          </Button>
        )}
      </div>
      <div className="external-response-list">
        {requests.map((request) => {
          const documents = c.documents.filter(
            (document) =>
              document.requestId === request.id &&
              ["response-attachment", "position"].includes(document.kind),
          );
          return (
            <article className="external-response-card" key={request.id}>
              <div className="external-response-card-header">
                <div className="external-response-recipient">
                  <span aria-hidden="true">↗</span>
                  <b>{request.recipient}</b>
                </div>
                {request.responded ? (
                  <span className="response-received">Ответ получен</span>
                ) : (
                  <span className="response-pending">Ответ ожидается</span>
                )}
              </div>
              {request.responded && (
                <div className="external-response-details">
                  <span>Получен: {formatDate(request.responded)}</span>
                  {request.responseLetterNumber && (
                    <span>Письмо № {request.responseLetterNumber}</span>
                  )}
                </div>
              )}
              {documents.length ? (
                <div className="external-response-files">
                  <span>Вложения</span>
                  {documents.map((document, index) => (
                    <div
                      className="external-response-file"
                      key={`${document.name}-${document.date}-${index}`}
                    >
                      {document.dataUrl ? (
                        <a href={document.dataUrl} download={document.filename || document.name}>
                          {document.name}
                        </a>
                      ) : (
                        <Button onClick={() => onDocument(document.kind, document)}>
                          Просмотр
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              ) : request.responded ? (
                <span className="external-response-no-files">Файлы не приложены</span>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}

export default function CaseWorkspace({
  c,
  tab,
  role,
  onBack,
  onTab,
  onAction,
  onDocument,
  onUpload,
}: {
  c: ObjectionCase;
  tab: CaseTab;
  role: Role;
  onBack: () => void;
  onTab: (tab: CaseTab) => void;
  onAction: (action: Action, role: Role, requestId?: string) => void;
  onDocument: (kind: string, document?: CaseDocument) => void;
  onUpload: () => void;
}) {
  const [issuesExpanded, setIssuesExpanded] = useState(true);
  const agendaDetails = c.agendaDetails;
  const decisionKindLabel =
    agendaDetails?.decisionKind === "prescription-audit"
      ? "Предписание на аудиторский отчет"
      : agendaDetails?.decisionKind === "prescription-preventive"
        ? "Предписание по профилактическому контролю"
        : agendaDetails?.decisionKind === "quality-control"
          ? "Контроль качества"
          : agendaDetails?.decisionKind === "administrative-act"
            ? "Административный акт"
            : undefined;
  const hideRequestBlocks =
    role === "commission" ||
    c.status === "documents_review" ||
    c.status === "commission_members" ||
    c.status === "commission_voting";
  const isClosed = CLOSED.includes(c.status);
  const currentExecutionDeadline = executionDeadline(c);
  const subjectRequest = c.requests.find(
    (request) =>
      request.template === "other" &&
      request.saqRecipient === "subject" &&
      Boolean(request.sent) &&
      !request.responded,
  );
  return (
    <>
      <div className="back-row">
        <button className="text-button" onClick={onBack}>
          ← К реестру обращений
        </button>
      </div>
      <PageHeading
        title={`${c.type === "control" ? "Жалоба" : "Возражение"} ${c.id}`}
        subtitle={c.org}
        action={
          <>
            <span className="badge blue">{STATUS[c.status]}</span>
            <Button onClick={() => onDocument("original")}>
              Исходное обращение
            </Button>
          </>
        }
      />
      <div className="detail-layout">
        <section className="card">
          <div className="tabs">
            {(
              [
                ["overview", "Обращение"],
              [
                "review",
                role === "commission"
                  ? "Материалы и результаты"
                  : "Процесс рассмотрения",
              ],
                ["documents", "Документы"],
                ["history", "История"],
              ] as [CaseTab, string][]
            )
              .filter(
                ([value]) => !isAuthorityRole(role) || value !== "documents",
              )
              .map(([value, label]) => (
              <button
                key={value}
                className={tab === value ? "active" : ""}
                onClick={() => onTab(value)}
              >
                {label}
                {value === "documents" && (
                  <span className="count">{c.documents.length + 2}</span>
                )}
              </button>
            ))}
          </div>
          <div className="card-body">
            {tab === "overview" && (
              <>
                {role !== "subject" && <div className="consideration-entry">
                  <div>
                    <strong>Рассмотрение обращения</strong>
                    <p>
                      Текущая задача, этапы и действия по делу доступны в
                      процессе рассмотрения.
                    </p>
                  </div>
                  <Button primary onClick={() => onTab("review")}>
                    Открыть процесс рассмотрения
                  </Button>
                </div>}
                <div className="facts">
                  <Fact
                    label="Вид обращения"
                    value={c.appealType ?? TYPES[c.type]}
                  />
                  <Fact
                    label={
                      c.appealType === "Жалоба на уведомление"
                        ? "Наименование объекта заявителя"
                        : "Наименование объекта аудита/заявителя"
                    }
                    value={c.org}
                  />
                  <Fact
                    label={
                      c.appealType === "Жалоба на уведомление"
                        ? "БИН/ИИН заявителя"
                        : "БИН/ИИН"
                    }
                    value={c.bin}
                  />
                  <Fact
                    label="Номер возражения, жалобы, заявления"
                    value={c.appealNumber}
                  />
                  <Fact
                    label="Дата возражения, жалобы, заявления"
                    value={formatDate(c.appealDate)}
                  />
                  <Fact label="Местонахождение" value={c.address} />
                  <Fact label="Представитель" value={c.applicant} />
                  <Fact
                    label="Орган аудита (КВГА/ДВГА)"
                    value={c.issuer}
                    wide
                  />
                  <Fact
                    label="Дата получения документа"
                    value={formatDate(c.document.received)}
                  />
                  <Fact
                    label="Портал / цифровая система, по которой поступило уведомление"
                    value={c.channel}
                    wide
                  />
                  {c.document.number && (
                    <Fact
                      label={`Номер: ${c.document.name}`}
                      value={c.document.number}
                    />
                  )}
                  {c.document.number && (
                    <Fact
                      label={`Дата: ${c.document.name}`}
                      value={formatDate(c.document.date)}
                    />
                  )}
                  {c.type === "notice" && (
                    <Fact
                      label="Сумма, тенге"
                      value={formatMoney(c.amount)}
                    />
                  )}
                  {agendaDetails?.procurementMethod && (
                    <Fact
                      label="Способ закупки"
                      value={agendaDetails.procurementMethod}
                    />
                  )}
                  {agendaDetails?.customerName && (
                    <Fact
                      label="Наименование заказчика"
                      value={agendaDetails.customerName}
                      wide
                    />
                  )}
                  {agendaDetails?.customerBin && (
                    <Fact
                      label="БИН заказчика"
                      value={agendaDetails.customerBin}
                    />
                  )}
                  {agendaDetails?.auditObjectName && (
                    <Fact
                      label="Наименование объекта аудита"
                      value={agendaDetails.auditObjectName}
                      wide
                    />
                  )}
                  {agendaDetails?.auditObjectBin && (
                    <Fact
                      label="БИН/ИИН объекта аудита"
                      value={agendaDetails.auditObjectBin}
                    />
                  )}
                  {agendaDetails?.procurementNumber && (
                    <Fact
                      label="Номер государственной закупки"
                      value={agendaDetails.procurementNumber}
                    />
                  )}
                  {agendaDetails?.lotNumber && (
                    <Fact label="Номер лота" value={agendaDetails.lotNumber} />
                  )}
                  {agendaDetails?.procurementSubject && (
                    <Fact
                      label="Предмет государственной закупки"
                      value={agendaDetails.procurementSubject}
                      wide
                    />
                  )}
                  {decisionKindLabel && (
                    <Fact
                      label="Вид обжалуемого решения"
                      value={decisionKindLabel}
                    />
                  )}
                  {agendaDetails?.relatedDocumentNumber && (
                    <Fact
                      label={
                        agendaDetails.decisionKind === "prescription-audit"
                          ? "Номер аудиторского отчета"
                          : "Номер профилактического контроля"
                      }
                      value={agendaDetails.relatedDocumentNumber}
                    />
                  )}
                  {agendaDetails?.relatedDocumentDate && (
                    <Fact
                      label={
                        agendaDetails.decisionKind === "prescription-audit"
                          ? "Дата подписания аудиторского отчета"
                          : "Дата подписания профилактического контроля"
                      }
                      value={formatDate(agendaDetails.relatedDocumentDate)}
                    />
                  )}
                  <Fact
                    label={
                      c.appealType === "Заявление"
                        ? "О чем заявление"
                        : "Краткое описание"
                    }
                    value={c.request}
                    wide
                  />
                </div>
                {c.affectedParties && <Notice>{c.affectedParties}</Notice>}
                <div className="issues-section-heading">
                  <h3 className="form-section">Доводы и пункты документа</h3>
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => setIssuesExpanded((expanded) => !expanded)}
                    aria-expanded={issuesExpanded}
                  >
                    {issuesExpanded ? "Свернуть" : "Развернуть"}
                  </button>
                </div>
                {issuesExpanded &&
                  c.issues.map((point) => (
                    <PointCard
                      key={point.id}
                      point={point}
                      documents={c.documents}
                    />
                  ))}
                {c.type === "notice" && (
                  <Notice>
                    На период рассмотрения возражения срок исполнения
                    уведомления приостанавливается. Неоспоренные пункты
                    учитываются отдельно. Применение меры по п. 28 Правил № 598
                    также приостанавливается на этот период.
                  </Notice>
                )}
                {c.type === "control" && (
                  <Notice tone="amber">
                    Для этого тестового дела выбран общий порядок жалобы.
                    Компетенция и специальное регулирование подтверждаются при
                    поступлении; комиссия № 302 автоматически не назначается.
                  </Notice>
                )}
              </>
            )}
            {tab === "review" && (
              isAuthorityRole(role) ? (
                <>
                  <ConsiderationProcess
                    c={c}
                    role={role}
                    onAction={onAction}
                    onHistory={() => onTab("history")}
                    hideStages
                  />
                  <AuthorityRequestMaterials
                    c={c}
                    role={role}
                    onDocument={onDocument}
                  />
                </>
              ) : (
              <>
                {role === "subject" ? (
                  <section className="consideration-process">
                    <div className="consideration-task">
                      <div>
                        <span className="consideration-eyebrow">Текущая задача</span>
                        <h4>Направить ответ на запрос</h4>
                        <p>Вложите ответ и направьте его в кабинет рабочего органа.</p>
                      </div>
                      <div className="consideration-task-action">
                        <Button
                          primary
                          disabled={!subjectRequest}
                          onClick={() => onAction("subject-response", role)}
                        >
                          {subjectRequest ? "Направить ответ" : "Ответ направлен"}
                        </Button>
                      </div>
                    </div>
                  </section>
                ) : (
                  <ConsiderationProcess
                    c={c}
                    role={role}
                    onAction={onAction}
                    onHistory={() => onTab("history")}
                    hideStages={["commission", "dvga", "kvga"].includes(role)}
                  />
                )}
                <h3 className="form-section">
                  Материалы и результаты рассмотрения
                </h3>
                {(() => {
                  const conclusions = c.documents.filter(
                    (document) => document.kind === "conclusion",
                  );
                  return conclusions.length ? (
                    <section className="request-documents-section">
                      <h4>Заключение по обращению</h4>
                      <div className="request-documents-list">
                        {conclusions.map((document) => (
                          <div className="request-document-row" key={`${document.name}-${document.date}`}>
                            <span>
                              {document.name}
                              {c.conclusionRegistration && (
                                <small>
                                  {` №${c.conclusionRegistration.number} от ${formatDate(c.conclusionRegistration.date)}`}
                                </small>
                              )}
                            </span>
                            {document.dataUrl ? (
                              <a className="button" href={document.dataUrl} download={document.filename || document.name}>Скачать</a>
                            ) : (
                              <Button onClick={() => onDocument(document.kind, document)}>Просмотр</Button>
                            )}
                          </div>
                        ))}
                      </div>
                    </section>
                  ) : null;
                })()}
                {(() => {
                  const finalResponse = c.documents
                    .filter((document) => document.kind === "final-response")
                    .at(-1);
                  return finalResponse ? (
                    <section className="request-documents-section">
                      <h4>Окончательный ответ</h4>
                      <div className="request-documents-list">
                        <div className="request-document-row">
                          <span>{finalResponse.name}</span>
                          <div className="request-document-actions">
                            <Button
                              onClick={() =>
                                onDocument(finalResponse.kind, finalResponse)
                              }
                            >
                              Просмотр
                            </Button>
                            <Button
                              onClick={() =>
                                downloadFile(
                                  `${c.id}-окончательный-ответ.doc`,
                                  wordDocumentHtml({
                                    c,
                                    kind: finalResponse.kind,
                                    document: finalResponse,
                                  }),
                                  "application/msword",
                                )
                              }
                            >
                              Скачать Word
                            </Button>
                            {(role === "demo-superuser" || role === "work") && c.type !== "notice" && (
                              <Button
                                primary
                                onClick={() => onAction("send-recommendations", "work")}
                              >
                                Направить рекомендации
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    </section>
                  ) : null;
                })()}
                {(() => {
                  const recommendations = c.documents.filter(
                    (document) => document.kind === "recommendation",
                  );
                  return recommendations.length ? (
                    <section className="request-documents-section">
                      <h4>Рекомендации</h4>
                      <div className="request-documents-list">
                        {recommendations.map((document) => (
                          <div className="request-document-row" key={`${document.name}-${document.date}`}>
                            <span>{document.name}</span>
                            <Button onClick={() => onDocument(document.kind, document)}>
                              Просмотр
                            </Button>
                          </div>
                        ))}
                      </div>
                    </section>
                  ) : null;
                })()}
                {(() => {
                  const decisionProject = c.documents
                    .filter((document) => document.kind === "decision-project")
                    .at(-1);
                  return decisionProject ? (
                    <section className="request-documents-section">
                      <h4>Проект решения</h4>
                      <div className="request-documents-list">
                        <div className="request-document-row">
                          <span>{decisionProject.name}</span>
                          <div className="request-document-actions">
                            <Button
                              onClick={() =>
                                onDocument(decisionProject.kind, decisionProject)
                              }
                            >
                              Просмотр
                            </Button>
                            <Button
                              onClick={() =>
                                downloadFile(
                                  `${c.id}-проект-решения.doc`,
                                  wordDocumentHtml({
                                    c,
                                    kind: decisionProject.kind,
                                    document: decisionProject,
                                  }),
                                  "application/msword",
                                )
                              }
                            >
                              Скачать Word
                            </Button>
                          </div>
                        </div>
                      </div>
                    </section>
                  ) : null;
                })()}
                {(() => {
                  const protocol = c.documents
                    .filter((document) => document.kind === "protocol")
                    .at(-1);
                  return protocol ? (
                    <section className="request-documents-section">
                      <h4>Протокол заседания</h4>
                      <div className="request-documents-list">
                        <div className="request-document-row">
                          <span>{protocol.name}</span>
                          <div className="request-document-actions">
                            <Button onClick={() => onDocument(protocol.kind, protocol)}>
                              Просмотр
                            </Button>
                            <Button
                              onClick={() =>
                                downloadFile(
                                  `${c.id}-протокол.doc`,
                                  wordDocumentHtml({
                                    c,
                                    kind: protocol.kind,
                                    document: protocol,
                                  }),
                                  "application/msword",
                                )
                              }
                            >
                              Скачать Word
                            </Button>
                          </div>
                        </div>
                      </div>
                    </section>
                  ) : null;
                })()}
                {(() => {
                  // Every certificate keeps an immutable snapshot.  The newest
                  // version is listed first so it is the one the user sees first.
                  const certificates = c.documents
                    .filter((document) => document.kind === "certificate")
                    .slice()
                    .reverse();
                  return certificates.length ? (
                    <section className="request-documents-section">
                      <h4>Справка</h4>
                      <div className="request-documents-list">
                        {certificates.map((certificate, index) => (
                          <div
                            className="request-document-row"
                            key={`${certificate.name}-${certificate.date}-${index}`}
                          >
                            <span>{certificate.name}</span>
                            <div className="request-document-actions">
                              <Button
                                onClick={() =>
                                  onDocument(certificate.kind, certificate)
                                }
                              >
                                Просмотр
                              </Button>
                              <Button
                                onClick={() =>
                                  downloadFile(
                                    `${c.id}-${certificate.name}.doc`,
                                    wordDocumentHtml({
                                      c,
                                      kind: certificate.kind,
                                      document: certificate,
                                    }),
                                    "application/msword",
                                  )
                                }
                              >
                                Скачать Word
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </section>
                  ) : null;
                })()}
                {["demo-superuser", "work", "commission", "dvga", "kvga"].includes(role) &&
                  [
                    {
                      title: "Ответ ДВГА",
                      requests: c.requests.filter(
                        (request) =>
                          !!request.sent &&
                          request.template !== "other" &&
                          request.recipient.toUpperCase().includes("ДВГА"),
                      ),
                    },
                    {
                      title: "Ответ Кабинета Объекта",
                      requests: c.requests.filter(
                        (request) =>
                          !!request.sent &&
                          request.template === "other" &&
                          request.saqRecipient === "subject",
                      ),
                    },
                    {
                      title: "Ответ КВГА",
                      requests: c.requests.filter(
                        (request) =>
                          !!request.sent &&
                          request.template !== "other" &&
                          request.recipient.toUpperCase().includes("КВГА"),
                      ),
                    },
                  ].map(
                    (group) => {
                      if (!group.requests.length) return null;
                      const responseMaterials = group.requests.flatMap((request) => {
                        if (!request.responded) return [];
                        const isAuthorityRequest = request.template !== "other";
                        const hasResponseAppendix = c.documents.some(
                          (document) =>
                            document.requestId === request.id &&
                            document.kind === "authority-response-appendix",
                        );
                        return c.documents.filter(
                          (document) =>
                            document.requestId === request.id &&
                            (isAuthorityRequest
                              ? [
                                  "authority-response-appendix",
                                  "authority-response-attachment",
                                  "response-attachment",
                                  ...(hasResponseAppendix
                                    ? []
                                    : ["request-appendix"]),
                                ]
                              : [
                                  "response-attachment",
                                  "subject-response-attachment",
                                  "position",
                                ]
                            ).includes(document.kind),
                        );
                      });
                      const awaitingResponse = group.requests.some(
                        (request) => !request.responded,
                      );
                      return (
                        <section
                          className="request-documents-section"
                          key={group.title}
                        >
                          <h4>{group.title}</h4>
                          {responseMaterials.length > 0 && (
                            <div className="request-documents-list">
                              {responseMaterials.map((document) => (
                                <div
                                  className="request-document-row"
                                  key={`response-${document.requestId}-${document.name}`}
                                >
                                  <span>{document.name}</span>
                                  {document.dataUrl ? (
                                    <a
                                      className="button"
                                      href={document.dataUrl}
                                      download={document.filename || document.name}
                                    >
                                      Скачать
                                    </a>
                                  ) : (
                                    <Button
                                      onClick={() =>
                                        onDocument(
                                          document.kind === "request-appendix"
                                            ? "authority-response-appendix"
                                            : document.kind,
                                          document,
                                        )
                                      }
                                    >
                                      Просмотр
                                    </Button>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                          {awaitingResponse && (
                            <p className="muted">Ожидается поступление ответа.</p>
                          )}
                        </section>
                      );
                    },
                  )}
                {(["demo-superuser", "work", "commission", "dvga", "kvga"] as Role[]).includes(role) && (
                  <OtherOrganResponses
                    c={c}
                    role={role}
                    onAction={onAction}
                    onDocument={onDocument}
                  />
                )}
                {(!hideRequestBlocks || role === "commission") && c.requests.length > 0 && (
                  <>
                    {[
                      {
                        title: "Запрос в ДВГА",
                        requests: c.requests.filter(
                          (request) =>
                            request.template !== "other" &&
                            request.recipient.toUpperCase().includes("ДВГА"),
                        ),
                      },
                      {
                        title: "Запрос в КВГА",
                        requests: c.requests.filter(
                          (request) =>
                            request.template !== "other" &&
                            request.recipient.toUpperCase().includes("КВГА"),
                        ),
                      },
                      {
                        title: "Запрос в другие органы",
                        requests: c.requests.filter(
                          (request) => request.template === "other",
                        ),
                      },
                    ].map(
                      (group) =>
                        group.requests.length > 0 && (
                          <section
                            className="request-documents-section"
                            key={group.title}
                          >
                            <h4>{group.title}</h4>
                            <div className="request-documents-list">
                              {group.requests.flatMap((request) =>
                                c.documents
                                  .filter(
                                    (document) =>
                                      document.requestId === request.id &&
                                      !(
                                        request.template !== "other" &&
                                        !!request.responded &&
                                        [
                                          "authority-response-appendix",
                                          "authority-response-attachment",
                                          "response-attachment",
                                        ].includes(document.kind)
                                      ),
                                  )
                                  .map((document) => (
                                    <div
                                      className="request-document-row"
                                      key={`${request.id}-${document.name}`}
                                    >
                                      <span>{document.name}</span>
                                      {document.dataUrl ? (
                                        <a
                                          className="button"
                                          href={document.dataUrl}
                                          download={document.filename || document.name}
                                        >
                                          Скачать
                                        </a>
                                      ) : (
                                        <Button
                                          onClick={() =>
                                            onDocument(document.kind, document)
                                          }
                                        >
                                          Просмотр
                                        </Button>
                                      )}
                                    </div>
                                  )),
                              )}
                            </div>
                          </section>
                        ),
                    )}
                  </>
                )}
                {c.issues
                  .filter((point) => point.disputed)
                  .map((point) => (
                    <PointCard
                      key={point.id}
                      point={point}
                      documents={c.documents}
                      review
                    />
                  ))}
                {c.memberPosition && !isClosed && (
                  <Notice>
                    <strong>Позиции членов комиссии</strong>
                    <p>{c.memberPosition}</p>
                  </Notice>
                )}
                {c.hearing && (
                  <Notice>
                    <strong>Заслушивание</strong>
                    <p>
                      {c.hearing.skip
                        ? `Не проводилось: ${c.hearing.reason}`
                        : `Извещение ${formatDate(c.hearing.notice)} · Заслушивание ${formatDate(c.hearing.date)}`}
                    </p>
                    {c.hearing.subject && <p>Заявитель: {c.hearing.subject}</p>}
                    {c.hearing.issuer && <p>Орган: {c.hearing.issuer}</p>}
                    <p>{c.hearing.note}</p>
                  </Notice>
                )}
                {c.result && !isClosed && (
                  <Notice tone="green">
                    <strong>{c.result.label}</strong>
                    <p>{c.result.reason}</p>
                    <p>{c.result.effect}</p>
                  </Notice>
                )}
                {c.delivery && (
                  <Notice>
                    <strong>Доставка результата</strong>
                    <p>
                      Направлен {formatDate(c.delivery.date)} · Вручён{" "}
                      {formatDate(c.delivery.received)}
                    </p>
                    <p>
                      {c.delivery.appealCourt}. {c.delivery.appealProcedure}
                    </p>
                  </Notice>
                )}
                {c.court && (
                  <Notice tone="amber">
                    <strong>Судебное дело {c.court.number}</strong>
                    <p>{c.court.effect}</p>
                    {c.court.result && <p>{c.court.result}</p>}
                  </Notice>
                )}
              </>
              )
            )}
            {tab === "documents" && !isAuthorityRole(role) && (
              <>
                <div className="section-heading">
                  <h3>Материалы обращения</h3>
                  {!hideRequestBlocks && (
                    <Button onClick={onUpload}>Добавить материал</Button>
                  )}
                </div>
                {[
                  {
                    name: c.document.name,
                    kind: "source",
                    date: c.document.date,
                  },
                  {
                    name: "Исходное обращение",
                    kind: "original",
                    date: c.filed,
                  },
                ].map((document) => (
                  <div className="document-row" key={document.kind}>
                    <div>
                      <strong>{document.name}</strong>
                      <span className="subline">
                        {formatDate(document.date)} · Документ дела
                      </span>
                    </div>
                    <Button onClick={() => onDocument(document.kind)}>
                      Просмотр
                    </Button>
                  </div>
                ))}
                {c.documents
                  .filter(
                    (document) =>
                      role === "commission" ||
                      !hideRequestBlocks ||
                      !["request", "request-appendix"].includes(document.kind),
                  )
                  .map((document, index) => (
                  <div className="document-row" key={index}>
                    <div>
                      <strong>{document.name}</strong>
                      <span className="subline">
                        {formatDate(document.date)} · {document.author}
                      </span>
                    </div>
                    {document.dataUrl ? (
                      <a
                        className="button"
                        href={document.dataUrl}
                        download={document.filename || document.name}
                      >
                        Скачать
                      </a>
                    ) : (
                      <Button
                        onClick={() => onDocument(document.kind, document)}
                      >
                        Просмотр
                      </Button>
                    )}
                  </div>
                  ))}
                {(["demo-superuser", "work"] as Role[]).includes(role) && (
                  <OtherOrganResponses
                    c={c}
                    role={role}
                    onAction={onAction}
                    onDocument={onDocument}
                  />
                )}
              </>
            )}
            {tab === "history" && (
              <div className="event-list">
                {[...c.history].reverse().map((event, index) => (
                  <article className="history-event" key={index}>
                    <div>
                      <span>{formatDate(event.date)}</span>
                      <span>{event.actor}</span>
                    </div>
                    <strong>{event.title}</strong>
                    <p>{event.text}</p>
                  </article>
                ))}
              </div>
            )}
          </div>
        </section>
        <aside className="right-column">
          <section className="card right-card">
            <div className="card-head">
              <h3>Сроки</h3>
            </div>
            <div className="card-body">
              {isAuthorityRole(role) ? (
                (() => {
                  const request = c.requests.find((item) =>
                    isRequestForAuthority(item, role),
                  );
                  return request?.sent ? (
                    <>
                      <div className="support-row">
                        <span>Поступило</span>
                        <strong>{formatDate(request.sent)}</strong>
                      </div>
                      <div className="support-row">
                        <span>Исполнить до</span>
                        <strong>{formatDate(addWorkdays(request.sent, 2))}</strong>
                      </div>
                    </>
                  ) : null;
                })()
              ) : (
                <>
                  <div className="support-row">
                    <span>Поступило</span>
                    <strong>{formatDate(c.registered)}</strong>
                  </div>
                  {currentExecutionDeadline && (
                    <div className="support-row">
                      <span>Исполнить до</span>
                      <strong>{formatDate(currentExecutionDeadline)}</strong>
                    </div>
                  )}
                  <div className="support-row">
                    <span>Срок рассмотрения</span>
                    <strong>
                      {c.status === "paused"
                        ? "Приостановлен"
                        : formatDate(reviewDeadline(c))}
                    </strong>
                  </div>
                </>
              )}
              {!isAuthorityRole(role) && c.extensionDays > 0 && (
                <div className="support-row">
                  <span>Продление</span>
                  <strong>+{c.extensionDays} раб. дн.</strong>
                </div>
              )}
              {!isAuthorityRole(role) && c.pauseDays > 0 && (
                <div className="support-row">
                  <span>Приостановление</span>
                  <strong>{c.pauseDays} раб. дн.</strong>
                </div>
              )}
              {!isAuthorityRole(role) && c.hearing?.date && (
                <div className="support-row">
                  <span>Заслушивание</span>
                  <strong>{formatDate(c.hearing.date)}</strong>
                </div>
              )}
              {c.delivery?.received && (
                <>
                  <div className="support-row">
                    <span>Вручение результата</span>
                    <strong>{formatDate(c.delivery.received)}</strong>
                  </div>
                  <div className="support-row">
                    <span>Месяц для иска об оспаривании</span>
                    <strong>
                      {formatDate(addMonths(c.delivery.received, 1))}
                    </strong>
                  </div>
                  <p className="small muted">
                    Ориентир по ст. 136 АППК; вид иска и специальные правила
                    проверяются отдельно.
                  </p>
                </>
              )}
              <p className="sources-inline">
                <a
                  href={`https://adilet.zan.kz/rus/docs/${c.type === "control" ? "K2000000350" : "Z1500000392"}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {c.type === "control"
                    ? "АППК: статьи 92, 99"
                    : "Закон: статьи 58-2, 58-4"}
                </a>
              </p>
            </div>
          </section>
        </aside>
      </div>
    </>
  );
}
