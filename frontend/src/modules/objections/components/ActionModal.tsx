import { useRef, useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { Action, ObjectionCase, Role } from "../../../types";
import { Button, Modal, Notice } from "../../../components/ui";
import { actionForm } from "../formDefinitions";
import type { FormField, FormValues } from "../formDefinitions";
import { disputed, normalizeVoteChoice } from "../services/decisions";
import { DocumentContent } from "./DocumentModal";
import { DEMO_USER } from "../../../config";
import { OUTCOMES } from "../../../data/constants";
import { downloadFile } from "../../../utils/download";

function appendixDocumentHtml(c: ObjectionCase, document: NonNullable<ObjectionCase["documents"][number]>) {
  const safeTitle = document.name.replace(/[&<>"']/g, (character) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!,
  );
  const content = renderToStaticMarkup(
    <DocumentContent
      c={c}
      kind="authority-response-appendix"
      document={document}
    />,
  );
  return `<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><title>${safeTitle}</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; padding: 32px; font-family: "Times New Roman", serif; color: #111; background: #f0f5f7; }
  .print-document { max-width: 900px; min-height: 1120px; margin: 0 auto; padding: 70px 55px; background: #fff; }
  .appendix-template-number { margin: 0 0 24px; text-align: right; font-size: 16px; }
  table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  th, td { border: 1px solid #111; padding: 8px; vertical-align: top; overflow-wrap: anywhere; word-break: break-word; }
  th { text-align: center; font-weight: 700; }
  th:first-child, td:first-child { width: 7%; text-align: center; }
  @media print { body { padding: 0; background: #fff; } .print-document { min-height: 0; padding: 20mm 15mm; } }
</style></head><body>${content}</body></html>`;
}

export function Field({
  field,
  disabled = false,
  required = field.required,
}: {
  field: FormField;
  disabled?: boolean;
  required?: boolean;
}) {
  if (field.type === "heading")
    return <h3 className="form-section">{field.label}</h3>;
  if (field.type === "checkbox")
    return (
      <label className="checkbox-row">
        <input type="checkbox" name={field.name} required={required} disabled={disabled} />
        <span>{field.label}</span>
      </label>
    );
  return (
    <label className="field">
      <span>
        {field.label}
        {required && <span className="required"> *</span>}
      </span>
      {field.type === "textarea" ? (
        <textarea
          name={field.name}
          defaultValue={field.value}
          placeholder={field.placeholder}
          required={required}
          disabled={disabled}
          rows={3}
        />
      ) : field.type === "select" ? (
        <select
          name={field.name}
          defaultValue={field.multiple ? [] : field.value}
          multiple={field.multiple}
          required={required}
          disabled={disabled}
        >
          {field.options?.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      ) : (
        <input
          type={field.type}
          name={field.name}
          defaultValue={field.value}
          placeholder={field.placeholder}
          min={field.min}
          max={field.max}
          required={required}
          disabled={disabled}
          readOnly={field.readOnly}
          step={field.type === "number" ? "any" : undefined}
        />
      )}
    </label>
  );
}

function certificateBasisForPoint(
  c: ObjectionCase,
  point: ReturnType<typeof disputed>[number],
) {
  const responses = c.requests
    .map((request) => request.authorityResponses?.[point.id])
    .filter(
      (response): response is { finding: string; response: string } =>
        Boolean(response),
    );
  const authorityArguments =
    responses.map((response) => response.finding).filter(Boolean).join("\n") ||
    point.authorityFinding ||
    "—";
  const authorityReply =
    responses.map((response) => response.response).filter(Boolean).join("\n") ||
    point.position ||
    "—";
  const davgaArguments =
    c.certificate?.davgaArgumentsByPoint?.[point.id] ||
    c.certificate?.davgaArguments ||
    "—";
  return [
    `Доводы ДВГА/КВГА: ${authorityArguments}`,
    `Доводы объекта государственного аудита (заявителя): ${point.argument || "—"}`,
    `Мотивированный ответ ДВГА/КВГА: ${authorityReply}`,
    `Доводы рабочего органа (ДАВГА МФ РК): ${davgaArguments}`,
  ].join("\n\n");
}

function ProtocolVotesFields({
  c,
  members,
  values,
}: {
  c: ObjectionCase;
  members: Array<{ id: string; name: string }>;
  values: FormValues;
}) {
  if (!members.length)
    return (
      <Notice>
        В последнем опросе о присутствии нет участников с ответом «Да».
      </Notice>
    );

  return (
    <>
      <h3 className="form-section">Участники заседания и результаты голосования</h3>
      <div className="table-scroll">
        <table className="data-table protocol-vote-entry-table">
          <thead>
            <tr>
              <th>№</th>
              <th>Описание оспариваемого пункта</th>
              <th>Член АК</th>
              <th>Голос</th>
              <th>Обоснование</th>
            </tr>
          </thead>
          <tbody>
            {disputed(c).flatMap((point) =>
              members.map((member, index) => {
                const voteName = `protocolVote_${point.id}_${member.id}`;
                const reasonName = `protocolReason_${point.id}_${member.id}`;
                const vote = normalizeVoteChoice(values[voteName]);
                return (
                  <tr key={`${point.id}-${member.id}`}>
                    <td>{index === 0 ? point.number : ""}</td>
                    <td>{index === 0 ? point.title : ""}</td>
                    <td>{member.name}</td>
                    <td>
                      <input type="hidden" name={voteName} value={values[voteName] || ""} />
                      {vote
                        ? OUTCOMES[vote]
                        : <span className="muted">Нет голоса</span>}
                    </td>
                    <td>
                      <textarea
                        name={reasonName}
                        defaultValue={values[reasonName] || ""}
                        rows={2}
                        required
                        aria-label={`Обоснование ${member.name} по пункту ${point.number}`}
                      />
                    </td>
                  </tr>
                );
              }),
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

function MeetingCertificateFields({
  c,
  values,
}: {
  c: ObjectionCase;
  values: FormValues;
}) {
  const savedPositions = new Map(
    (c.certificate?.memberPositions || []).map((position) => [
      `${position.pointId || "legacy"}_${position.id}`,
      position,
    ]),
  );
  if (!c.members.length)
    return (
      <Notice tone="amber">
        В последнем опросе о присутствии нет участников с ответом «Да».
      </Notice>
    );

  return (
    <>
      <h3 className="form-section">Результаты голосования участников заседания</h3>
      <p className="small muted">
        По каждому оспариваемому пункту отображаются электронные голоса. В
        колонке «Внести вручную» укажите результат только если член АК не
        может проголосовать самостоятельно в системе.
      </p>
      <div className="table-scroll">
        <table className="data-table meeting-certificate-table">
          <thead>
            <tr>
              <th>№</th>
              <th>Оспариваемый пункт</th>
              <th>Член АК</th>
              <th>Электронный результат</th>
              <th>Внести вручную</th>
              <th>Комментарий</th>
            </tr>
          </thead>
          <tbody>
            {disputed(c).flatMap((point) => c.members.map((member, index) => {
              const electronic = normalizeVoteChoice(c.votes?.[point.id]?.votes?.[member.id]);
              const saved = savedPositions.get(`${point.id}_${member.id}`) || savedPositions.get(`legacy_${member.id}`);
              const resultName = `meetingCertificateResult_${point.id}_${member.id}`;
              const commentName = `meetingCertificateComment_${point.id}_${member.id}`;
              return (
                <tr key={`${point.id}-${member.id}`}>
                  <td>{index === 0 ? point.number : ""}</td>
                  <td>{index === 0 ? point.title : ""}</td>
                  <td>{member.name}</td>
                  <td>{electronic ? OUTCOMES[electronic] : <span className="muted">Нет голоса</span>}</td>
                  <td><select name={resultName} defaultValue={values[resultName] || ""}><option value="">Не изменять</option>{Object.entries(OUTCOMES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></td>
                  <td><textarea name={commentName} defaultValue={values[commentName] ?? saved?.comment ?? ""} rows={2} aria-label={`Комментарий ${member.name} по пункту ${point.number}`} /></td>
                </tr>
              );
            }))}
          </tbody>
        </table>
      </div>
    </>
  );
}

export default function ActionModal({
  action,
  c,
  date,
  role,
  commissionMemberId,
  onSubmit,
  onSaveDraft,
  onClose,
}: {
  action: Action;
  c: ObjectionCase;
  date: string;
  role: Role;
  /** The AK member currently using the Appeals Commission cabinet. */
  commissionMemberId?: string;
  onSubmit: (form: FormData) => void | Promise<void>;
  onSaveDraft?: (form: FormData) => void | Promise<void>;
  onClose: () => void;
}) {
  const [values, setValues] = useState<FormValues>(() => {
    if (action === "request" || action === "request-other")
      return { ...(c.requestDrafts?.[action]?.values || {}) };
    if (action === "analysis") return { ...(c.analysisDraft?.values || {}) };
    if (action === "fill-meeting-certificate") {
      const savedPositions = new Map(
        (c.certificate?.memberPositions || []).map((position) => [
          `${position.pointId || "legacy"}_${position.id}`,
          position,
        ]),
      );
      return Object.fromEntries(
        disputed(c).flatMap((point) => c.members.map((member) => [
          `meetingCertificateComment_${point.id}_${member.id}`,
          savedPositions.get(`${point.id}_${member.id}`)?.comment || savedPositions.get(`legacy_${member.id}`)?.comment || "",
        ])),
      );
    }
    if (action === "edit-certificate")
      return Object.fromEntries(
        disputed(c).map((point) => [
          `certificateDavga_${point.id}`,
          c.certificate?.davgaArgumentsByPoint?.[point.id] ||
            c.certificate?.davgaArguments ||
            "",
        ]),
      );
    if (action !== "vote") return {};
    return Object.fromEntries([
      ...c.members.map((member, index) => [
        `protocolMember_${member.id.replace("protocol-member-", "") || index + 1}`,
        member.name,
      ]),
      ...disputed(c).flatMap((point) =>
        c.members.flatMap((member) => [
          [
            `protocolVote_${point.id}_${member.id}`,
            normalizeVoteChoice(c.votes?.[point.id]?.votes?.[member.id]),
          ],
          [
            `protocolReason_${point.id}_${member.id}`,
            c.votes?.[point.id]?.voteReasons?.[member.id] ||
              certificateBasisForPoint(c, point),
          ],
        ]),
      ),
    ]);
  });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedMessage, setSavedMessage] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
  const [requestAttachments, setRequestAttachments] = useState<File[]>([]);
  const [conclusionFiles, setConclusionFiles] = useState<File[]>([]);
  const [recommendationRecipients, setRecommendationRecipients] = useState<string[]>([]);
  const [selectedRecommendationRecipient, setSelectedRecommendationRecipient] = useState("");
  const [requestTab, setRequestTab] = useState<"form" | "print">("form");
  const definition = actionForm(action, c, date, values, role);
  const activeCommissionVoter = commissionMemberId
    ? c.members.find((member) => member.id === commissionMemberId)
    : undefined;
  const isRequest = action === "request" || action === "request-other";
  const isAnalysis = action === "analysis";
  const isOtherRequest = action === "request-other";
  const requestDeadline =
    values.deadline ||
    definition.fields.find((field) => field.name === "deadline")?.value ||
    `${date}T18:00`;
  const requestRecipient =
    values.recipient?.trim() ||
    definition.fields
      .find((field) => field.name === "saqRecipient")
      ?.options?.find(([value]) => value === values.saqRecipient)?.[1] ||
    "";
  const requestExecutor =
    values.executor ||
    definition.fields.find((field) => field.name === "executor")?.value ||
    DEMO_USER.fullName;
  const customRequestText =
    isOtherRequest ? values.customRequestText ?? "" : undefined;
  const protocolMembers = c.members;
  const recommendationRecipientField = definition.fields.find(
    (field) => field.name === "recommendationRecipients",
  );
  const recommendationTextField = definition.fields.find(
    (field) => field.name === "recommendationText",
  );
  const authorityRequestForConfirmation = c.requests.find(
    (request) =>
      !!request.responded &&
      !request.confirmed &&
      (request.template === "dvga" ||
        request.recipient.toUpperCase().includes("ДВГА") ||
        request.recipient.toUpperCase().includes("КВГА")),
  );
  const authorityRequestForResponse = c.requests.find(
    (request) =>
      !request.responded &&
      (request.template === "dvga" ||
        request.recipient.toUpperCase().includes("ДВГА") ||
        request.recipient.toUpperCase().includes("КВГА")) &&
      (role !== "dvga" && role !== "kvga" ||
        (role === "kvga"
          ? request.recipient.toUpperCase().includes("КВГА")
          : request.recipient.toUpperCase().includes("ДВГА"))),
  );
  const authorityAppendix = authorityRequestForConfirmation
    ? c.documents.find(
        (document) =>
          document.kind === "authority-response-appendix" &&
          document.requestId === authorityRequestForConfirmation.id,
      ) ||
      c.documents.find(
        (document) =>
          document.kind === "request-appendix" &&
          document.requestId === authorityRequestForConfirmation.id,
      )
    : undefined;
  const authorityResponseFiles = authorityRequestForConfirmation
    ? c.documents.filter(
        (document) =>
          document.kind === "authority-response-attachment" &&
          document.requestId === authorityRequestForConfirmation.id,
      )
    : [];
  const isAuthorityRequest = (request: ObjectionCase["requests"][number]) =>
    request.template === "dvga" ||
    request.recipient.toUpperCase().includes("ДВГА") ||
    request.recipient.toUpperCase().includes("КВГА");
  const responseStatus = (request: ObjectionCase["requests"][number]) => {
    if (request.confirmed) return "Получен и зафиксирован";
    if (isAuthorityRequest(request) && request.responseSigned)
      return "Поступил — ждёт фиксации";
    if (isAuthorityRequest(request) && request.responded)
      return "Ответ готовится в ДВГА/КВГА";
    return "Ожидается ответ";
  };
  const openAppendix = () => {
    if (!authorityAppendix) return;
    const popup = window.open("", "_blank");
    if (!popup) {
      setError("Не удалось открыть приложение. Разрешите всплывающие окна в браузере.");
      return;
    }
    popup.document.write(appendixDocumentHtml(c, authorityAppendix));
    popup.document.close();
  };
  const downloadAppendix = () => {
    if (!authorityAppendix) return;
    downloadFile(
      `${c.id}-${authorityAppendix.name}.html`,
      appendixDocumentHtml(c, authorityAppendix),
      "text/html;charset=utf-8",
    );
  };
  return (
    <Modal
      title={definition.title}
      onClose={onClose}
      wide={
        action === "vote" ||
        isRequest ||
        action === "fill-request-response" ||
        action === "analysis" ||
        action === "edit-certificate" ||
        action === "fill-meeting-certificate" ||
        action === "position" ||
        action === "subject-response" ||
        action === "deliver" ||
        action === "create-decision-project"
      }
    >
      <form
        ref={formRef}
        onChange={(event) => {
          const form = event.currentTarget;
          const next = Object.fromEntries(
            [...new FormData(form).entries()].map(([key, value]) => [
              key,
              String(value),
            ]),
          );
          form
            .querySelectorAll<HTMLInputElement>('input[type="checkbox"]')
            .forEach((input) => {
              next[input.name] = input.checked ? "on" : "";
            });
          setValues(next);
        }}
        onSubmit={async (event) => {
          event.preventDefault();
          try {
            setSaving(true);
            const form = new FormData(event.currentTarget);
            requestAttachments.forEach((file) =>
              form.append("requestAttachments", file),
            );
            conclusionFiles.forEach((file) => form.append("conclusionFiles", file));
            await onSubmit(form);
            onClose();
          } catch (cause) {
            setError(
              cause instanceof Error
                ? cause.message
                : "Не удалось сохранить действие",
            );
          } finally {
            setSaving(false);
          }
        }}
      >
        {isRequest ? (
          <>
            <div className="request-modal-details">
              <div>
                <span>Исполнитель</span>
                <b>{requestExecutor}</b>
              </div>
            </div>
            {definition.note && <Notice>{definition.note}</Notice>}
            <div
              className="request-modal-tabs"
              role="tablist"
              aria-label="Режим формирования запроса"
            >
              <button
                type="button"
                className={requestTab === "form" ? "active" : ""}
                onClick={() => setRequestTab("form")}
              >
                Электронная форма
              </button>
              <button
                type="button"
                className={requestTab === "print" ? "active" : ""}
                onClick={() => setRequestTab("print")}
              >
                Печатная форма
              </button>
            </div>
            <div hidden={requestTab !== "form"} className="form-grid">
              {definition.fields.map((field) => {
                const isOtherRecipient = isOtherRequest && field.name === "recipient";
                const isSaqRecipient = isOtherRequest && field.name === "saqRecipient";
                const disabled =
                  (isOtherRecipient && Boolean(values.saqRecipient)) ||
                  (isSaqRecipient && Boolean(values.recipient?.trim()));
                return (
                  <Field
                    key={field.name}
                    field={field}
                    disabled={disabled}
                    required={disabled ? false : field.required}
                  />
                );
              })}
              <label className="field request-attachments-field">
                <span>Вложить приложения</span>
                <input
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg,.doc,.docx,.xls,.xlsx,.txt"
                  multiple
                  onChange={(event) => {
                    const files = Array.from(event.currentTarget.files || []);
                    if (files.length)
                      setRequestAttachments((current) => [...current, ...files]);
                    event.currentTarget.value = "";
                  }}
                />
                <small>Можно вложить несколько файлов до 2 МБ каждый.</small>
                {requestAttachments.length > 0 && (
                  <div className="request-attachments-list">
                    {requestAttachments.map((file, index) => (
                      <div key={`${file.name}-${index}`}>
                        <span>{file.name}</span>
                        <Button
                          type="button"
                          onClick={() =>
                            setRequestAttachments((current) =>
                              current.filter((_, itemIndex) => itemIndex !== index),
                            )
                          }
                        >
                          Удалить
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </label>
            </div>
            <div hidden={requestTab !== "print"} className="request-print-preview">
              <DocumentContent
                c={c}
                kind="request"
                requestPreview={{
                  recipient: requestRecipient,
                  deadline: requestDeadline,
                  customText: customRequestText,
                  template: isOtherRequest ? "other" : "dvga",
                  author: requestExecutor,
                }}
              />
            </div>
          </>
        ) : action === "deliver" && c.type === "notice" ? (
          <>
            {definition.note && <Notice>{definition.note}</Notice>}
            <div className="form-grid">
              {definition.fields.map((field) => <Field key={field.name} field={field} />)}
            </div>
            <label className="field request-attachments-field">
              <span>Документ заключения <span className="required">*</span></span>
              <input
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,.doc,.docx,.xls,.xlsx,.txt"
                multiple
                required={!conclusionFiles.length}
                onChange={(event) => {
                  const files = Array.from(event.currentTarget.files || []);
                  if (files.length) setConclusionFiles((current) => [...current, ...files]);
                  event.currentTarget.value = "";
                }}
              />
              {conclusionFiles.length > 0 && (
                <div className="request-attachments-list">
                  {conclusionFiles.map((file, index) => (
                    <div key={`${file.name}-${index}`}>
                      <span>{file.name}</span>
                      <Button type="button" onClick={() => setConclusionFiles((current) => current.filter((_, itemIndex) => itemIndex !== index))}>
                        Удалить
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </label>
          </>
        ) : action === "send-recommendations" ? (
          <>
            {definition.note && <Notice>{definition.note}</Notice>}
            <label className="field">
              <span>
                Кому направить рекомендацию <span className="required">*</span>
              </span>
              <select
                className="recommendation-recipient-select"
                value={selectedRecommendationRecipient}
                onChange={(event) => {
                  const value = event.currentTarget.value;
                  if (!value) return;
                  setRecommendationRecipients((current) =>
                    current.includes(value) ? current : [...current, value],
                  );
                  setSelectedRecommendationRecipient("");
                }}
              >
                <option value="">Выберите кабинет</option>
                {recommendationRecipientField?.options
                  ?.filter(([value]) => !recommendationRecipients.includes(value))
                  .map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              <small>Можно выбрать несколько кабинетов.</small>
              {recommendationRecipients.map((recipient) => {
                const label = recommendationRecipientField?.options?.find(
                  ([value]) => value === recipient,
                )?.[1] || recipient;
                return (
                  <span className="badge blue notification-new-badge" key={recipient}>
                    {label}{" "}
                    <button
                      type="button"
                      className="text-button"
                      onClick={() =>
                        setRecommendationRecipients((current) =>
                          current.filter((item) => item !== recipient),
                        )
                      }
                    >
                      ×
                    </button>
                  </span>
                );
              })}
              {recommendationRecipients.map((recipient) => (
                <input
                  key={`input-${recipient}`}
                  type="hidden"
                  name="recommendationRecipients"
                  value={recipient}
                />
              ))}
            </label>
            {recommendationTextField && <Field field={recommendationTextField} />}
          </>
        ) : action === "deliver" || action === "create-decision-project" ? (
          <>
            <div className="request-modal-details">
              <div><span>Автор</span><b>{c.assignee === "Не назначен" ? DEMO_USER.fullName : c.assignee}</b></div>
              <div><span>Печатная форма</span><b>{action === "create-decision-project" ? "Проект решения и приложение" : "Окончательный ответ и приложение"}</b></div>
            </div>
            {definition.note && <Notice>{definition.note}</Notice>}
            <div className="request-modal-tabs" role="tablist">
              <button type="button" className={requestTab === "form" ? "active" : ""} onClick={() => setRequestTab("form")}>Реквизиты</button>
              <button type="button" className={requestTab === "print" ? "active" : ""} onClick={() => setRequestTab("print")}>Печатная форма</button>
            </div>
            <div hidden={requestTab !== "form"} className="form-grid">
              {definition.fields.map((field) => <Field key={field.name} field={field} />)}
            </div>
            <div hidden={requestTab !== "print"} className="request-print-preview">
              <DocumentContent c={c} kind="final-response" />
            </div>
          </>
        ) : action === "fill-request-response" ? (
          <>
            <div className="request-modal-details">
              <div>
                <span>Автор</span>
                <b>ДВГА/КВГА</b>
              </div>
            </div>
            {definition.note && <Notice>{definition.note}</Notice>}
            <div className="request-modal-tabs" role="tablist">
              <button
                type="button"
                className={requestTab === "form" ? "active" : ""}
                onClick={() => setRequestTab("form")}
              >
                Электронная форма
              </button>
              <button
                type="button"
                className={requestTab === "print" ? "active" : ""}
                onClick={() => setRequestTab("print")}
              >
                Печатная форма
              </button>
            </div>
            <div hidden={requestTab !== "form"}>
              {definition.fields.map((field) => (
                <Field key={field.name} field={field} />
              ))}
              <label className="field">
                <span>Подтверждающие документы</span>
                <input
                  type="file"
                  name="responseFiles"
                  accept=".pdf,.png,.jpg,.jpeg,.doc,.docx,.xls,.xlsx,.txt"
                  multiple
                />
                <small>Можно вложить несколько файлов до 2 МБ каждый.</small>
              </label>
            </div>
            <div hidden={requestTab !== "print"} className="request-print-preview">
              <DocumentContent
                c={c}
                kind="authority-response-appendix"
                appendixRecipient={authorityRequestForResponse?.recipient}
                appendixFindingPreview={Object.fromEntries(
                  disputed(c).map((point) => [
                    point.id,
                    values[`authorityFinding_${point.id}`] ||
                      authorityRequestForResponse?.authorityResponses?.[point.id]
                        ?.finding ||
                      "",
                  ]),
                )}
                appendixPreview={Object.fromEntries(
                  disputed(c).map((point) => [
                    point.id,
                    values[`authorityResponse_${point.id}`] ||
                      authorityRequestForResponse?.authorityResponses?.[point.id]
                        ?.response ||
                      "",
                  ]),
                )}
              />
            </div>
          </>
        ) : action === "analysis" ? (
          <>
            <div className="request-modal-details">
              <div>
                <span>Автор</span>
                <b>Исполнитель ДАВГА</b>
              </div>
            </div>
            {definition.note && <Notice>{definition.note}</Notice>}
            <div className="request-modal-tabs" role="tablist">
              <button
                type="button"
                className={requestTab === "form" ? "active" : ""}
                onClick={() => setRequestTab("form")}
              >
                Электронная форма
              </button>
              <button
                type="button"
                className={requestTab === "print" ? "active" : ""}
                onClick={() => setRequestTab("print")}
              >
                Печатная форма
              </button>
            </div>
            <div hidden={requestTab !== "form"}>
              {definition.fields.map((field) => (
                <Field key={field.name} field={field} />
              ))}
            </div>
            <div hidden={requestTab !== "print"} className="request-print-preview">
              <DocumentContent
                c={c}
                kind="certificate"
                certificatePreview={{
                  davgaArguments: "",
                  davgaArgumentsByPoint: Object.fromEntries(
                    disputed(c).map((point) => [
                      point.id,
                      values[`davgaArguments_${point.id}`] || "",
                    ]),
                  ),
                  memberPositions: [],
                }}
              />
            </div>
          </>
        ) : action === "edit-certificate" ? (
          <>
            <div className="request-modal-details">
              <div>
                <span>Автор</span>
                <b>{c.assignee === "Не назначен" ? DEMO_USER.fullName : c.assignee}</b>
              </div>
              <div>
                <span>Печатная форма</span>
                <b>Новая версия справки</b>
              </div>
            </div>
            {definition.note && <Notice>{definition.note}</Notice>}
            <div className="request-modal-tabs" role="tablist">
              <button
                type="button"
                className={requestTab === "form" ? "active" : ""}
                onClick={() => setRequestTab("form")}
              >
                Электронная форма
              </button>
              <button
                type="button"
                className={requestTab === "print" ? "active" : ""}
                onClick={() => setRequestTab("print")}
              >
                Печатная форма
              </button>
            </div>
            <div hidden={requestTab !== "form"}>
              {disputed(c).map((point) => (
                <label className="field" key={point.id}>
                  <span>Доводы ДАВГА по пункту {point.number}<span className="required"> *</span></span>
                  <textarea
                    name={`certificateDavga_${point.id}`}
                    defaultValue={values[`certificateDavga_${point.id}`] || ""}
                    rows={5}
                    required
                  />
                </label>
              ))}
            </div>
            <div hidden={requestTab !== "print"} className="request-print-preview">
              <DocumentContent
                c={c}
                kind="certificate"
                certificatePreview={{
                  davgaArguments:
                    disputed(c)
                      .map((point) => values[`certificateDavga_${point.id}`])
                      .find(Boolean) ||
                    c.certificate?.davgaArguments ||
                    "",
                  davgaArgumentsByPoint: Object.fromEntries(
                    disputed(c).map((point) => [
                      point.id,
                      values[`certificateDavga_${point.id}`] || "",
                    ]),
                  ),
                  memberPositions: c.certificate?.memberPositions || [],
                }}
              />
            </div>
          </>
        ) : action === "fill-meeting-certificate" ? (
          <>
            <div className="request-modal-details">
              <div>
                <span>Автор</span>
                <b>{c.assignee === "Не назначен" ? DEMO_USER.fullName : c.assignee}</b>
              </div>
              <div>
                <span>Печатная форма</span>
                <b>Справка с результатами голосования АК</b>
              </div>
            </div>
            {definition.note && <Notice>{definition.note}</Notice>}
            <div className="request-modal-tabs" role="tablist">
              <button
                type="button"
                className={requestTab === "form" ? "active" : ""}
                onClick={() => setRequestTab("form")}
              >
                Электронная форма
              </button>
              <button
                type="button"
                className={requestTab === "print" ? "active" : ""}
                onClick={() => setRequestTab("print")}
              >
                Печатная форма
              </button>
            </div>
            <div hidden={requestTab !== "form"}>
              <MeetingCertificateFields c={c} values={values} />
            </div>
            <div hidden={requestTab !== "print"} className="request-print-preview">
              <DocumentContent
                c={c}
                kind="certificate"
                certificatePreview={{
                  davgaArguments: c.certificate?.davgaArguments || "",
                  davgaArgumentsByPoint: c.certificate?.davgaArgumentsByPoint,
                  memberPositions: c.members.map((member) => {
                    return disputed(c).map((point) => {
                      const manualResult = normalizeVoteChoice(values[`meetingCertificateResult_${point.id}_${member.id}`]);
                      return {
                        id: member.id,
                        name: member.name,
                        pointId: point.id,
                        pointNumber: point.number,
                        result: manualResult || normalizeVoteChoice(c.votes?.[point.id]?.votes?.[member.id]),
                        comment: values[`meetingCertificateComment_${point.id}_${member.id}`] || "",
                      };
                    });
                  }).flat(),
                }}
              />
            </div>
          </>
        ) : action === "vote" ? (
          <>
            <div className="request-modal-details">
              <div>
                <span>Автор</span>
                <b>{c.assignee === "Не назначен" ? DEMO_USER.fullName : c.assignee}</b>
              </div>
            </div>
            {definition.note && <Notice>{definition.note}</Notice>}
            <div className="request-modal-tabs" role="tablist">
              <button
                type="button"
                className={requestTab === "form" ? "active" : ""}
                onClick={() => setRequestTab("form")}
              >
                Электронная форма
              </button>
              <button
                type="button"
                className={requestTab === "print" ? "active" : ""}
                onClick={() => setRequestTab("print")}
              >
                Печатная форма
              </button>
            </div>
            <div hidden={requestTab !== "form"}>
              {definition.fields.map((field) => (
                <Field key={field.name} field={field} />
              ))}
              <ProtocolVotesFields
                c={c}
                members={protocolMembers}
                values={values}
              />
            </div>
            <div hidden={requestTab !== "print"} className="request-print-preview">
              <DocumentContent
                c={c}
                kind="protocol"
                protocolPreview={{
                  date: values.protocolDate || date,
                  // Номер появляется только после подписания протокола.
                  number: "",
                  audio: "",
                  format:
                    values.meetingFormat === "офлайн"
                      ? "офлайн"
                      : "онлайн, Qosyl",
                  recommendations: values.recommendations || undefined,
                  members: protocolMembers,
                  votes: Object.fromEntries(
                    disputed(c).map((point) => [
                      point.id,
                      Object.fromEntries(
                        protocolMembers.map((member) => [
                          member.id,
                          values[`protocolVote_${point.id}_${member.id}`] || "",
                        ]),
                      ),
                    ]),
                  ),
                  voteReasons: Object.fromEntries(
                    disputed(c).map((point) => [
                      point.id,
                      Object.fromEntries(
                        protocolMembers.map((member) => [
                          member.id,
                          values[`protocolReason_${point.id}_${member.id}`] || "",
                        ]),
                      ),
                    ]),
                  ),
                }}
              />
            </div>
          </>
        ) : action === "commission-vote" ? (
          <>
            {definition.note && <Notice>{definition.note}</Notice>}
            {activeCommissionVoter ? (
              <div className="field">
                <span>Голосующий член АК</span>
                <strong>{activeCommissionVoter.name}</strong>
                <input
                  type="hidden"
                  name="commissionMember"
                  value={activeCommissionVoter.id}
                />
              </div>
            ) : (
              <label className="field">
                <span>Голосующий член АК <span className="required">*</span></span>
                <select name="commissionMember" required defaultValue="">
                  <option value="">Выберите ФИО</option>
                  {c.members
                    .filter((member) =>
                      disputed(c).some(
                        (point) => !c.votes?.[point.id]?.votes?.[member.id],
                      ),
                    )
                    .map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.name}
                      </option>
                    ))}
                </select>
              </label>
            )}
            <h3 className="form-section">Оспариваемые пункты</h3>
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>№</th>
                    <th>Описание оспариваемого пункта</th>
                    <th>Голос</th>
                    <th>Обоснование</th>
                  </tr>
                </thead>
                <tbody>
                  {disputed(c).map((point) => (
                    <tr key={point.id}>
                      <td>{point.number}</td>
                      <td>{point.title}</td>
                      <td>
                        <select
                          name={`commissionVote_${point.id}`}
                          defaultValue={values[`commissionVote_${point.id}`] || ""}
                          required
                          aria-label={`Голос по пункту ${point.number}`}
                        >
                          <option value="">Выберите голос</option>
                          {Object.entries(OUTCOMES).map(([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <textarea
                          name={`commissionReason_${point.id}`}
                          rows={2}
                          aria-label={`Обоснование по пункту ${point.number}`}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : action === "subject-response" ? (
          <>
            {definition.note && <Notice>{definition.note}</Notice>}
            <label className="field request-attachments-field">
              <span>
                Файл ответа <span className="required">*</span>
              </span>
              <input
                type="file"
                name="subjectResponseFiles"
                accept=".pdf,.png,.jpg,.jpeg,.doc,.docx,.xls,.xlsx,.txt"
                multiple
                required
              />
              <small>Можно вложить несколько файлов до 2 МБ каждый.</small>
            </label>
          </>
        ) : action === "position" ? (
          <>
            <Notice tone="amber">
              Все ожидаемые ответы поступили. Одним действием зафиксируйте дату
              их получения и вложите все полученные файлы.
            </Notice>
            <section className="response-receipt-statuses" aria-label="Статусы ответов по запросам">
              <b>Статус ответов по запросам</b>
              <ul>
                {c.requests.map((request) => (
                  <li key={request.id}>
                    <span>{request.recipient}</span>
                    <em
                      className={
                        request.confirmed
                          ? "received"
                          : isAuthorityRequest(request) && request.responseSigned
                            ? "ready"
                            : "waiting"
                      }
                    >
                      {responseStatus(request)}
                    </em>
                  </li>
                ))}
              </ul>
            </section>
            <div className="response-receipt-grid">
              <section className="response-receipt-card response-receipt-system">
                <div className="response-receipt-heading">
                  <span aria-hidden="true">↓</span>
                  <div>
                    <b>
                      Ответы по направленным запросам
                    </b>
                    <small>
                      {authorityRequestForConfirmation
                        ? "Электронные ответы и приложенные документы"
                        : "Ответы, полученные вне SAQ"}
                    </small>
                  </div>
                  <em>ПОСТУПИЛИ</em>
                </div>
                {authorityRequestForConfirmation ? (
                  <div className="response-receipt-materials">
                    <b>Заполненное приложение</b>
                    {authorityAppendix ? (
                      <div className="response-appendix-actions">
                        <span>{authorityAppendix.name}</span>
                        <div>
                          <Button type="button" onClick={openAppendix}>
                            Открыть
                          </Button>
                          <Button type="button" onClick={downloadAppendix}>
                            Скачать
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <span className="muted">Приложение не найдено</span>
                    )}
                    <b>Подтверждающие документы</b>
                    {authorityResponseFiles.length ? (
                      <ul>
                        {authorityResponseFiles.map((document) =>
                          document.dataUrl ? (
                            <li key={document.name}>
                              <a
                                href={document.dataUrl}
                                download={document.filename || document.name}
                              >
                                {document.name}
                              </a>
                            </li>
                          ) : (
                            <li key={document.name}>{document.name}</li>
                          ),
                        )}
                      </ul>
                    ) : (
                      <span className="muted">Файлы не приложены</span>
                    )}
                  </div>
                ) : (
                  <div className="response-receipt-empty">
                    <b>Ответ не поступил</b>
                  </div>
                )}
              </section>
              <section className="response-receipt-card response-receipt-manual">
                <div className="response-receipt-heading">
                  <span aria-hidden="true">↑</span>
                  <div>
                    <b>Внесено исполнителем</b>
                  </div>
                  <em>ТРЕБУЕТСЯ</em>
                </div>
                <div className="response-receipt-fields">
                  {definition.fields
                    .filter((field) => field.name === "date")
                    .map((field) => (
                      <Field key={field.name} field={field} />
                    ))}
                  <label className="field">
                    <span>
                      Полученные файлы <span className="required">*</span>
                    </span>
                    <input
                      type="file"
                      name="responseFiles"
                      accept=".pdf,.png,.jpg,.jpeg,.doc,.docx,.xls,.xlsx,.txt"
                      multiple
                      required
                    />
                    <small>Можно вложить несколько файлов до 2 МБ каждый.</small>
                  </label>
                </div>
              </section>
            </div>
          </>
        ) : (
          <>
            {definition.note && <Notice>{definition.note}</Notice>}
            {definition.fields.map((field) => (
              <Field key={field.name} field={field} />
            ))}
          </>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        {savedMessage && <Notice tone="green">{savedMessage}</Notice>}
        <div className="dialog-actions">
          <Button onClick={onClose} disabled={saving}>
            {isRequest || isAnalysis ? "Свернуть" : "Отмена"}
          </Button>
          {(isRequest || isAnalysis) && onSaveDraft && (
            <Button
              type="button"
              disabled={saving}
              onClick={async () => {
                const form = formRef.current;
                if (!form) return;
                try {
                  setSaving(true);
                  setError("");
                  await onSaveDraft(new FormData(form));
                  setSavedMessage(
                    isAnalysis
                      ? "Черновик справки сохранён."
                      : "Проект запроса сохранён.",
                  );
                } catch (cause) {
                  setError(
                    cause instanceof Error
                      ? cause.message
                      : isAnalysis
                        ? "Не удалось сохранить черновик справки"
                        : "Не удалось сохранить проект запроса",
                  );
                } finally {
                  setSaving(false);
                }
              }}
            >
              {isAnalysis ? "Сохранить" : "Сохранить проект"}
            </Button>
          )}
          <Button type="submit" primary disabled={saving}>
            {saving
              ? "Сохранение..."
              : action === "position"
                ? "Сохранить полученный ответ"
                : action === "subject-response"
                  ? "Направить ответ"
                : definition.submit}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
