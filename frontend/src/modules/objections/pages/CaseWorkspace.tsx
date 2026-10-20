import { Fragment, useState, type ReactNode } from "react";
import { Button, Notice, PageHeading } from "../../../components/ui";
import { CLOSED, OUTCOMES, STATUS, TYPES } from "../../../data/constants";
import type {
  Action,
  CaseDocument,
  CaseRecommendation,
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
import { applicantIdentifierType } from "../services/appealTemplates";
import {
  hasSubjectSaqCabinet,
  isSubjectRole,
  subjectRoleForCase,
} from "../services/saqCabinets";
import ConsiderationProcess from "../components/ConsiderationProcess";
import { wordDocumentHtml } from "../components/DocumentModal";
import { downloadFile } from "../../../utils/download";

function responseDocumentLabel(c: ObjectionCase) {
  return (c.appealType || "").trim().startsWith("Жалоба") ||
    c.appealType === "Заявление" ||
    c.appealType === "Возражение на аудиторский отчет" ||
    c.appealType === "Возражение на аудиторский отчёт"
    ? "Мотивированный ответ"
    : "Окончательный ответ";
}

function ResponseDocumentSection({
  c,
  onDocument,
}: {
  c: ObjectionCase;
  onDocument: (kind: string, document?: CaseDocument) => void;
}) {
  const finalResponse = c.documents
    .filter((document) => document.kind === "final-response")
    .at(-1);
  if (!finalResponse) return null;

  return (
    <section className="request-documents-section">
      <h4>{responseDocumentLabel(c)}</h4>
      <div className="request-documents-list">
        <div className="request-document-row">
          <span>{finalResponse.name}</span>
          <div className="request-document-actions">
            <Button onClick={() => onDocument(finalResponse.kind, finalResponse)}>
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
          </div>
        </div>
      </div>
    </section>
  );
}

function MotivatedResponseRoutingSection({
  c,
  onDocument,
}: {
  c: ObjectionCase;
  onDocument: (kind: string, document?: CaseDocument) => void;
}) {
  const recipients = (c.motivatedResponseRouting?.recipients || []).filter(
    (recipient) => recipient.status !== "not_tracked",
  );
  const confirmations = c.documents.filter(
    (document) => document.kind === "motivated-response-delivery-attachment",
  );
  if (!recipients.length && !confirmations.length) return null;

  return (
    <section className="request-documents-section">
      <h4>Направление мотивированного ответа</h4>
      {recipients.length > 0 && (
        <div className="request-documents-list">
          {recipients.map((recipient) => (
            <div className="request-document-row" key={recipient.id}>
              <span>
                {recipient.recipient}
                <small>
                  {recipient.status === "sent"
                    ? `Направлен${recipient.sentAt ? ` · ${formatDate(recipient.sentAt)}` : ""}${recipient.deliveryPath ? ` · ${recipient.deliveryPath}` : ""}${recipient.registrationNumber ? ` · №${recipient.registrationNumber}` : ""}`
                    : "Ожидает фиксации направления"}
                </small>
              </span>
            </div>
          ))}
        </div>
      )}
      {confirmations.length > 0 && (
        <div className="request-documents-list">
          {confirmations.map((document) => (
            <div
              className="request-document-row"
              key={`${document.name}-${document.date}`}
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
                <Button onClick={() => onDocument(document.kind, document)}>
                  Просмотр
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function HearingDetails({
  hearing,
}: {
  hearing: NonNullable<ObjectionCase["hearing"]>;
}) {
  return (
    <Notice>
      <strong>Заслушивание</strong>
      {hearing.skip ? (
        <p>Не проводилось: {hearing.reason}</p>
      ) : (
        <>
          <p>Дата и время: {formatDateTime(hearing.date)}</p>
          <p>Место или формат: {hearing.location || "—"}</p>
          <p>
            Уведомление направлено: {formatDate(hearing.notice)}
            {hearing.noticeChannel ? ` · ${hearing.noticeChannel}` : ""}
          </p>
        </>
      )}
      {hearing.subject && <p>Заявитель: {hearing.subject}</p>}
      {hearing.issuer && <p>Орган: {hearing.issuer}</p>}
      {hearing.note && <p>{hearing.note}</p>}
    </Notice>
  );
}

function Fact({
  label,
  value,
  wide = false,
}: {
  label: string;
  value?: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className={`fact ${wide ? "full" : ""}`}>
      <span>{label}</span>
      <strong>{value ?? "—"}</strong>
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
          point
            .evidence!.split(",")
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
            {evidenceDocuments.length
              ? evidenceDocuments.map((document, index) => (
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
              : point.evidence}
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
  const signedFinalResponse = c.documents
    .filter((document) => document.kind === "final-response")
    .at(-1);
  // Карточки, подписанные до появления recipientRoles, уже содержат запрос
  // в соответствующий орган. Показываем им ответ также, чтобы исторические
  // обращения не теряли документ после обновления.
  const finalResponse =
    c.delivery?.recipientRoles?.includes(role) ||
    (c.status === "completed" && requests.length > 0)
      ? signedFinalResponse
      : undefined;

  return (
    <>
      <h3 className="form-section">Материалы и результаты рассмотрения</h3>
      {requests.map((request) => {
        const documents = c.documents.filter(
          (document) =>
            document.requestId === request.id &&
            ["request", "request-appendix"].includes(document.kind),
        );
        const responseDocuments = c.documents.filter(
          (document) =>
            document.requestId === request.id &&
            [
              "authority-response-appendix",
              "authority-response-attachment",
            ].includes(document.kind),
        );
        return (
          <div key={request.id}>
            <section className="request-documents-section">
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
            {request.responded && (
              <section className="request-documents-section">
                <h4>Ответ {authorityLabel}</h4>
                <div className="request-documents-list">
                  {responseDocuments.map((document) => (
                    <div
                      className="request-document-row"
                      key={`${document.kind}-${document.name}`}
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
                          onClick={() => onDocument(document.kind, document)}
                        >
                          Просмотр
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        );
      })}
      {finalResponse && (
        <section className="request-documents-section">
          <h4>{responseDocumentLabel(c)}</h4>
          <div className="request-documents-list">
            <div className="request-document-row">
              <span>{finalResponse.name}</span>
              <Button
                onClick={() => onDocument(finalResponse.kind, finalResponse)}
              >
                Просмотр
              </Button>
            </div>
          </div>
        </section>
      )}
    </>
  );
}

function SubjectRequestMaterials({
  c,
  role,
  onDocument,
}: {
  c: ObjectionCase;
  role: Role;
  onDocument: (kind: string, document?: CaseDocument) => void;
}) {
  const isApplicantCabinet = subjectRoleForCase(c) === role;
  const requests = isApplicantCabinet
    ? c.requests.filter(
        (request) =>
          request.template === "other" &&
          request.saqRecipient === "subject" &&
          Boolean(request.sent),
      )
    : [];
  const decisionProject =
    isApplicantCabinet && c.decisionProjectRouting?.channel === "saq"
      ? c.documents
          .filter((document) => document.kind === "decision-project")
          .at(-1)
      : undefined;
  const comment = isApplicantCabinet
    ? c.documents
    .filter((document) => document.kind === "decision-project-comment")
    .at(-1)
    : undefined;
  const hearing =
    isApplicantCabinet && hasSubjectSaqCabinet(c) && !c.hearing?.skip
      ? c.hearing
      : undefined;
  const hearingNotice =
    isApplicantCabinet && hasSubjectSaqCabinet(c)
      ? c.documents.filter((document) => document.kind === "hearing").at(-1)
      : undefined;
  const finalResponse = c.delivery?.recipientRoles?.includes(role)
    ? c.documents
        .filter((document) => document.kind === "final-response")
        .at(-1)
    : undefined;

  const documentRow = (document: CaseDocument) => (
    <div
      className="request-document-row"
      key={`${document.kind}-${document.name}`}
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
        <Button onClick={() => onDocument(document.kind, document)}>
          Просмотр
        </Button>
      )}
    </div>
  );

  const sortedDocuments = (documents: CaseDocument[]) =>
    documents
      .slice()
      .sort((left, right) => right.date.localeCompare(left.date));
  const latestDocumentDate = (documents: CaseDocument[], fallback = "") =>
    documents.reduce(
      (latest, document) => (document.date > latest ? document.date : latest),
      fallback,
    );
  const sections: Array<{
    key: string;
    date: string;
    order: number;
    content: ReactNode;
  }> = [];
  let sectionOrder = 0;
  const addSection = (key: string, date: string, content: ReactNode) => {
    sections.push({ key, date, order: sectionOrder++, content });
  };

  requests.forEach((request) => {
    const requestDocuments = c.documents.filter(
      (document) =>
        document.requestId === request.id &&
        ["request", "request-appendix"].includes(document.kind),
    );
    const responseDocuments = c.documents.filter(
      (document) =>
        document.requestId === request.id &&
        ["subject-response-attachment", "response-attachment"].includes(
          document.kind,
        ),
    );
    addSection(
      `request-${request.id}`,
      latestDocumentDate(requestDocuments, request.date),
      <section className="request-documents-section">
        <h4>Запрос в кабинет Объекта SAQ</h4>
        <div className="request-documents-list">
          {sortedDocuments(requestDocuments).map(documentRow)}
        </div>
      </section>,
    );
    if (request.responded && responseDocuments.length > 0) {
      addSection(
        `response-${request.id}`,
        latestDocumentDate(responseDocuments, request.responded),
        <section className="request-documents-section">
          <h4>Ответ на запрос</h4>
          <div className="request-documents-list">
            {sortedDocuments(responseDocuments).map(documentRow)}
          </div>
        </section>,
      );
    }
  });

  if (decisionProject) {
    addSection(
      "decision-project",
      decisionProject.date,
      <section className="request-documents-section">
        <h4>Проект решения</h4>
        <div className="request-documents-list">
          {documentRow(decisionProject)}
        </div>
      </section>,
    );
  }
  if (comment) {
    addSection(
      "decision-project-comment",
      comment.date,
      <section className="request-documents-section">
        <h4>Замечание к проекту решения</h4>
        <div className="request-documents-list">{documentRow(comment)}</div>
      </section>,
    );
  }
  if (hearing) {
    addSection(
      "hearing",
      hearing.held || hearing.date || "",
      <HearingDetails hearing={hearing} />,
    );
  }
  if (hearingNotice) {
    addSection(
      "hearing-notice",
      hearingNotice.date,
      <section className="request-documents-section">
        <h4>Извещение о заслушивании</h4>
        <div className="request-documents-list">{documentRow(hearingNotice)}</div>
      </section>,
    );
  }
  if (finalResponse) {
    addSection(
      "final-response",
      finalResponse.date,
      <section className="request-documents-section">
        <h4>{responseDocumentLabel(c)}</h4>
        <div className="request-documents-list">
          {documentRow(finalResponse)}
        </div>
      </section>,
    );
  }
  sections.sort(
    (left, right) =>
      right.date.localeCompare(left.date) || left.order - right.order,
  );

  return (
    <>
      <h3 className="form-section">Материалы и результаты рассмотрения</h3>
      {sections.map((section) => (
        <Fragment key={section.key}>{section.content}</Fragment>
      ))}
    </>
  );
}

export default function CaseWorkspace({
  c,
  date,
  tab,
  role,
  commissionMeetingCompleted = false,
  recommendations = [],
  onBack,
  onTab,
  onAction,
  onDocument,
  onUpload,
}: {
  c: ObjectionCase;
  /** Текущая дата демонстрационного календаря SAQ. */
  date?: string;
  tab: CaseTab;
  role: Role;
  commissionMeetingCompleted?: boolean;
  recommendations?: CaseRecommendation[];
  onBack: () => void;
  onTab: (tab: CaseTab) => void;
  onAction: (action: Action, role: Role, requestId?: string) => void;
  onDocument: (kind: string, document?: CaseDocument) => void;
  onUpload: () => void;
}) {
  const [issuesExpanded, setIssuesExpanded] = useState(true);
  const agendaDetails = c.agendaDetails;
  const isActionComplaint = c.appealType === "Жалоба на действие/бездействие";
  const actionAppealAuthorities = agendaDetails?.actionAppealAuthorities || [];
  const requirementFiles = c.documents.filter(
    (document) =>
      document.kind === "attachment" &&
      document.text === "Требования заявителя",
  );
  const powerOfAttorney = c.documents.find(
    (document) =>
      document.kind === "attachment" &&
      document.text === "Доверенность представителя",
  );
  const hasSeparateAuditObject = [
    "Жалоба на уведомление",
    "Возражение на аудиторский отчет",
    "Жалоба на действие/бездействие",
    "Жалоба на решение КВГА/ДВГА",
    "Заявление",
  ].includes(c.appealType || "");
  const supportsRepresentativeConfirmation = [
    "Жалоба на уведомление",
    "Возражение на уведомление",
    "Возражение на аудиторский отчет",
    "Жалоба на действие/бездействие",
    "Жалоба на решение КВГА/ДВГА",
    "Заявление",
  ].includes(c.appealType || "");
  const decisionKindLabel =
    agendaDetails?.decisionKind === "prescription-audit"
      ? "Предписание на аудиторский отчет"
      : agendaDetails?.decisionKind === "prescription-preventive"
        ? "Предписание по профилактическому контролю"
        : agendaDetails?.decisionKind === "preventive-control-act"
          ? "Акт о результате профилактического контроля"
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
  const currentExecutionDeadline = executionDeadline(c, role);
  const authorityRequests = c.requests.filter((request) =>
    isRequestForAuthority(request, role),
  );
  const authorityHasPendingRequest = authorityRequests.some(
    (request) => !request.responseSigned,
  );
  const subjectRequest = c.requests.find(
    (request) =>
      request.template === "other" &&
      request.saqRecipient === "subject" &&
      Boolean(request.sent) &&
      !request.responded,
  );
  const subjectCanCommentOnDecisionProject =
    c.status === "decision_project_comments" &&
    c.decisionProjectRouting?.channel === "saq" &&
    Boolean(
      !date ||
        !c.decisionProjectRouting.commentsDeadline ||
        date <= c.decisionProjectRouting.commentsDeadline,
    );
  const recipientLimited = isAuthorityRole(role) || isSubjectRole(role);
  const isCommission = role === "commission";
  const canViewOverview = !recipientLimited || isAuthorityRole(role);
  const commissionCurrentTaskHidden =
    role === "commission" &&
    commissionMeetingCompleted &&
    c.status !== "protocol";
  return (
    <>
      <div className="back-row">
        <button className="text-button" onClick={onBack}>
          ← К реестру обращений
        </button>
      </div>
      <PageHeading
        title={`${c.appealType || "Обращение"} ${c.id}`}
        subtitle={c.org}
        action={
          <>
            {!recipientLimited && (
              <span className="badge blue">{STATUS[c.status]}</span>
            )}
            {!recipientLimited && (
              <Button onClick={() => onDocument("original")}>
                Исходное обращение
              </Button>
            )}
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
                  role === "commission" || recipientLimited
                    ? "Материалы и результаты"
                    : "Процесс рассмотрения",
                ],
                ["documents", "Документы"],
                ["history", "История"],
              ] as [CaseTab, string][]
            )
              .filter(
                ([value]) =>
                  !recipientLimited ||
                  value === "review" ||
                  (value === "overview" && canViewOverview),
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
            {tab === "overview" && canViewOverview && (
              <>
                {(!isAuthorityRole(role) || authorityHasPendingRequest) &&
                  !commissionCurrentTaskHidden && (
                    <div className="consideration-entry">
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
                    </div>
                  )}
                <div className="facts">
                  <Fact
                    label="Вид обращения"
                    value={c.appealType ?? TYPES[c.type]}
                  />
                  <Fact label="Номер обращения в системе" value={c.id} />
                  <Fact
                    label={
                      hasSeparateAuditObject
                        ? "Наименование объекта заявителя"
                        : "Наименование объекта аудита/заявителя"
                    }
                    value={c.org}
                  />
                  <Fact
                    label={
                      c.applicantIdentifierType
                        ? `${applicantIdentifierType(c)} заявителя`
                        : hasSeparateAuditObject
                          ? "БИН/ИИН заявителя"
                          : "БИН/ИИН"
                    }
                    value={c.bin}
                  />
                  {c.applicantIdentifierType && (
                    <Fact
                      label="Тип идентификатора заявителя"
                      value={c.applicantIdentifierType}
                    />
                  )}
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
                  {supportsRepresentativeConfirmation && (
                    <Fact
                      label="Заявитель является представителем объекта аудита"
                      value={
                        agendaDetails?.applicantIsAuditObjectRepresentative
                          ? "Да"
                          : "Нет"
                      }
                      wide
                    />
                  )}
                  {powerOfAttorney && (
                    <Fact
                      label="Доверенность"
                      value={
                        powerOfAttorney.dataUrl ? (
                          <a
                            href={powerOfAttorney.dataUrl}
                            download={
                              powerOfAttorney.filename || powerOfAttorney.name
                            }
                          >
                            {powerOfAttorney.filename || powerOfAttorney.name}
                          </a>
                        ) : (
                          powerOfAttorney.filename || powerOfAttorney.name
                        )
                      }
                      wide
                    />
                  )}
                  {!isActionComplaint && (
                    <Fact
                      label="Орган аудита (КВГА/ДВГА)"
                      value={c.issuer}
                      wide
                    />
                  )}
                  <Fact
                    label="Дата получения документа"
                    value={formatDate(c.document.received)}
                  />
                  <Fact
                    label="Портал/цифровая система, по которой поступило обращение"
                    value={c.channel}
                    wide
                  />
                  {!isActionComplaint && c.document.number && (
                    <Fact
                      label={`Номер: ${c.document.name}`}
                      value={c.document.number}
                    />
                  )}
                  {!isActionComplaint && c.document.number && (
                    <Fact
                      label={`Дата: ${c.document.name}`}
                      value={formatDate(c.document.date)}
                    />
                  )}
                  {actionAppealAuthorities.flatMap((item, index) => [
                    <Fact
                      key={`action-issuer-${index}`}
                      label={`Орган аудита (КВГА/ДВГА) ${index + 1}`}
                      value={item.issuer}
                      wide
                    />,
                    <Fact
                      key={`action-number-${index}`}
                      label={`Номер первичного обращения в ДВГА/КВГА ${index + 1}`}
                      value={item.documentNumber}
                    />,
                    <Fact
                      key={`action-date-${index}`}
                      label={`Дата первичного обращения в ДВГА/КВГА ${index + 1}`}
                      value={formatDate(item.documentDate)}
                    />,
                  ])}
                  {isActionComplaint && (
                    <Fact
                      label="Связано с государственной закупкой"
                      value={agendaDetails?.procurementNumber ? "Да" : "Нет"}
                    />
                  )}
                  {c.type === "notice" && (
                    <Fact label="Сумма, тенге" value={formatMoney(c.amount)} />
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
                  {requirementFiles.length > 0 && (
                    <Fact
                      label="Требования заявителя"
                      value={requirementFiles.map((document, index) => (
                        <span key={`${document.filename}-${index}`}>
                          {index > 0 && ", "}
                          {document.dataUrl ? (
                            <a
                              href={document.dataUrl}
                              download={document.filename || document.name}
                            >
                              {document.filename || document.name}
                            </a>
                          ) : (
                            document.filename || document.name
                          )}
                        </span>
                      ))}
                      wide
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
              </>
            )}
            {tab === "review" &&
              (isAuthorityRole(role) ? (
                <>
                  {authorityHasPendingRequest && (
                    <ConsiderationProcess
                      c={c}
                      date={date}
                      role={role}
                      recommendations={recommendations}
                      onAction={onAction}
                      onHistory={() => onTab("history")}
                      hideStages
                    />
                  )}
                  <AuthorityRequestMaterials
                    c={c}
                    role={role}
                    onDocument={onDocument}
                  />
                </>
              ) : (
                <>
                  {isSubjectRole(role) ? (
                    (subjectRequest || subjectCanCommentOnDecisionProject) && (
                      <section className="consideration-process">
                        <div className="consideration-task">
                          <div>
                            <span className="consideration-eyebrow">
                              Текущая задача
                            </span>
                            <h4>
                              {subjectCanCommentOnDecisionProject
                                ? "Направить замечание к проекту решения"
                                : "Направить ответ на запрос"}
                            </h4>
                            <p>
                              {subjectCanCommentOnDecisionProject
                                ? "Замечание будет направлено рабочему органу для назначения заслушивания."
                                : "Вложите ответ и направьте его в кабинет рабочего органа."}
                            </p>
                          </div>
                          <div className="consideration-task-action">
                            <Button
                              primary
                              disabled={
                                subjectCanCommentOnDecisionProject
                                  ? false
                                  : !subjectRequest
                              }
                              onClick={() =>
                                onAction(
                                  subjectCanCommentOnDecisionProject
                                    ? "submit-decision-project-comment"
                                    : "subject-response",
                                  role,
                                )
                              }
                            >
                              {subjectCanCommentOnDecisionProject
                                ? "Направить замечание"
                                : subjectRequest
                                  ? "Направить ответ"
                                  : "Ответ направлен"}
                            </Button>
                          </div>
                        </div>
                      </section>
                    )
                  ) : commissionCurrentTaskHidden ? null : (
                    <ConsiderationProcess
                      c={c}
                      date={date}
                      role={role}
                      recommendations={recommendations}
                      onAction={onAction}
                      onHistory={() => onTab("history")}
                      hideStages={["commission", "dvga", "kvga"].includes(role)}
                    />
                  )}
                  {isSubjectRole(role) && (
                    <SubjectRequestMaterials c={c} role={role} onDocument={onDocument} />
                  )}
                  {!isSubjectRole(role) && (
                    <>
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
                                <div
                                  className="request-document-row"
                                  key={`${document.name}-${document.date}`}
                                >
                                  <span>
                                    {document.name}
                                    {c.conclusionRegistration && (
                                      <small>
                                        {` №${c.conclusionRegistration.number} от ${formatDate(c.conclusionRegistration.date)}`}
                                      </small>
                                    )}
                                  </span>
                                  {document.dataUrl ? (
                                    <a
                                      className="button"
                                      href={document.dataUrl}
                                      download={
                                        document.filename || document.name
                                      }
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
                              ))}
                            </div>
                          </section>
                        ) : null;
                      })()}
                      {!isCommission && (
                        <MotivatedResponseRoutingSection
                          c={c}
                          onDocument={onDocument}
                        />
                      )}
                      {!isCommission && (
                        <ResponseDocumentSection c={c} onDocument={onDocument} />
                      )}
                      {!isCommission && (() => {
                        const hearingProtocols = c.documents.filter(
                          (document) =>
                            document.kind === "hearing-protocol-attachment",
                        );
                        return hearingProtocols.length ? (
                          <section className="request-documents-section">
                            <h4>Протокол заслушивания</h4>
                            <div className="request-documents-list">
                              {hearingProtocols.map((document) => (
                                <div
                                  className="request-document-row"
                                  key={`${document.name}-${document.date}`}
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
                              ))}
                            </div>
                          </section>
                        ) : null;
                      })()}
                      {(() => {
                        const hearingArguments = c.documents.filter(
                          (document) =>
                            document.kind === "hearing-additional-arguments",
                        );
                        return hearingArguments.length ? (
                          <section className="request-documents-section">
                            <h4>Дополнительные доводы после заслушивания</h4>
                            <div className="request-documents-list">
                              {hearingArguments.map((document) => (
                                <div
                                  className="request-document-row"
                                  key={`${document.name}-${document.date}`}
                                >
                                  <span>{document.name}</span>
                                  <Button
                                    onClick={() =>
                                      onDocument(document.kind, document)
                                    }
                                  >
                                    Просмотр
                                  </Button>
                                </div>
                              ))}
                            </div>
                          </section>
                        ) : null;
                      })()}
                      {!isCommission && c.hearing && (
                        <HearingDetails hearing={c.hearing} />
                      )}
                      {(() => {
                        const recommendations = c.documents.filter((document) =>
                          [
                            "recommendation",
                            "recommendation-attachment",
                            "recommendation-response-attachment",
                          ].includes(document.kind),
                        );
                        return recommendations.length ? (
                          <section className="request-documents-section">
                            <h4>Рекомендации</h4>
                            <div className="request-documents-list">
                              {recommendations.map((document) => (
                                <div
                                  className="request-document-row"
                                  key={`${document.name}-${document.date}`}
                                >
                                  <span>
                                    {document.name}
                                    {document.kind ===
                                      "recommendation-attachment" && (
                                      <small>Вложение к рекомендации</small>
                                    )}
                                    {document.kind ===
                                      "recommendation-response-attachment" && (
                                      <small>
                                        Вложение к ответу на рекомендацию
                                      </small>
                                    )}
                                  </span>
                                  {document.dataUrl ? (
                                    <a
                                      className="button"
                                      href={document.dataUrl}
                                      download={
                                        document.filename || document.name
                                      }
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
                              ))}
                            </div>
                          </section>
                        ) : null;
                      })()}
                      {(() => {
                        const decisionProject = c.documents
                          .filter(
                            (document) => document.kind === "decision-project",
                          )
                          .at(-1);
                        const projectComments = c.documents.filter(
                          (document) =>
                            [
                              "decision-project-comment",
                              "decision-project-comment-attachment",
                            ].includes(document.kind),
                        );
                        return decisionProject || projectComments.length > 0 ? (
                          <>
                            {projectComments.length > 0 && (
                              <section className="request-documents-section">
                                <h4>Замечание к проекту решения</h4>
                                <div className="request-documents-list">
                                  {projectComments.map((document) => (
                                    <div
                                      className="request-document-row"
                                      key={`${document.kind}-${document.name}-${document.date}`}
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
                                  ))}
                                </div>
                              </section>
                            )}
                            {decisionProject && !isCommission && (
                              <section className="request-documents-section">
                            <h4>Проект решения</h4>
                            <div className="request-documents-list">
                              <div className="request-document-row">
                                <span>{decisionProject.name}</span>
                                <div className="request-document-actions">
                                  <Button
                                    onClick={() =>
                                      onDocument(
                                        decisionProject.kind,
                                        decisionProject,
                                      )
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
                            )}
                          </>
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
                                  <Button
                                    onClick={() =>
                                      onDocument(protocol.kind, protocol)
                                    }
                                  >
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
                                        onDocument(
                                          certificate.kind,
                                          certificate,
                                        )
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
                      {[
                        "demo-superuser",
                        "work",
                        "commission",
                        "dvga",
                        "kvga",
                      ].includes(role) &&
                        [
                          {
                            title: "Ответ ДВГА",
                            requests: c.requests.filter(
                              (request) =>
                                !!request.sent &&
                                request.template !== "other" &&
                                request.recipient
                                  .toUpperCase()
                                  .includes("ДВГА"),
                            ),
                          },
                          {
                            title: "Ответ других органов",
                            requests: c.requests.filter(
                              (request) =>
                                !!request.sent && request.template === "other",
                            ),
                          },
                          {
                            title: "Ответ КВГА",
                            requests: c.requests.filter(
                              (request) =>
                                !!request.sent &&
                                request.template !== "other" &&
                                request.recipient
                                  .toUpperCase()
                                  .includes("КВГА"),
                            ),
                          },
                        ].map((group) => {
                          if (!group.requests.length) return null;
                          const responseMaterials = group.requests.flatMap(
                            (request) => {
                              if (!request.responded) return [];
                              const isAuthorityRequest =
                                request.template !== "other";
                              const hasResponseAppendix = c.documents.some(
                                (document) =>
                                  document.requestId === request.id &&
                                  document.kind ===
                                    "authority-response-appendix",
                              );
                              return c.documents.filter(
                                (document) =>
                                  document.requestId === request.id &&
                                  (isAuthorityRequest
                                    ? [
                                        "authority-response",
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
                            },
                          );
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
                                          download={
                                            document.filename || document.name
                                          }
                                        >
                                          Скачать
                                        </a>
                                      ) : (
                                        <Button
                                          onClick={() =>
                                            onDocument(
                                              document.kind ===
                                                "request-appendix"
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
                                <p className="muted">
                                  Ожидается поступление ответа.
                                </p>
                              )}
                            </section>
                          );
                        })}
                      {(!hideRequestBlocks || role === "commission") &&
                        c.requests.length > 0 && (
                          <>
                            {[
                              {
                                title: "Запрос в ДВГА",
                                requests: c.requests.filter(
                                  (request) =>
                                    request.template !== "other" &&
                                    request.recipient
                                      .toUpperCase()
                                      .includes("ДВГА"),
                                ),
                              },
                              {
                                title: "Запрос в КВГА",
                                requests: c.requests.filter(
                                  (request) =>
                                    request.template !== "other" &&
                                    request.recipient
                                      .toUpperCase()
                                      .includes("КВГА"),
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
                                              document.requestId ===
                                                request.id &&
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
                                                  download={
                                                    document.filename ||
                                                    document.name
                                                  }
                                                >
                                                  Скачать
                                                </a>
                                              ) : (
                                                <Button
                                                  onClick={() =>
                                                    onDocument(
                                                      document.kind,
                                                      document,
                                                    )
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
                            {c.delivery.appealCourt}.{" "}
                            {c.delivery.appealProcedure}
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
                  )}
                </>
              ))}
            {tab === "documents" && !recipientLimited && (
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
              </>
            )}
            {tab === "history" && !recipientLimited && (
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
        {!recipientLimited && <aside className="right-column">
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
                        <strong>
                          {formatDate(addWorkdays(request.sent, 2))}
                        </strong>
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
              {!isAuthorityRole(role) &&
                c.appealType !== "Жалоба на уведомление" &&
                c.pauseDays > 0 && (
                  <div className="support-row">
                    <span>Приостановление</span>
                    <strong>{c.pauseDays} раб. дн.</strong>
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
        </aside>}
      </div>
    </>
  );
}
