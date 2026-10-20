import { useRef, useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { Action, ObjectionCase, Role } from "../../../types";
import { Button, Modal, Notice } from "../../../components/ui";
import { actionForm, requiresConclusion } from "../formDefinitions";
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

function finalResponsePrintHtml(
  c: ObjectionCase,
  finalResponseMajorityByPoint: Record<string, boolean>,
) {
  const content = renderToStaticMarkup(
    <DocumentContent
      c={c}
      kind="final-response"
      finalResponseMajorityByPoint={finalResponseMajorityByPoint}
    />,
  );
  return `<!doctype html>
<html lang="kk"><head><meta charset="utf-8"><title>Окончательный ответ</title>
<style>
  @page { size: A4; margin: 18mm; }
  * { box-sizing: border-box; }
  body { margin: 0; color: #111; font-family: "Times New Roman", Times, serif; font-size: 12pt; line-height: 1.35; }
  .print-document { min-height: 260mm; padding: 0; }
  .final-response-recipient { width: 54%; margin: 0 0 46px auto; }
  .final-response-recipient p { margin: 0 0 8px; }
  .final-response-body p { margin: 0 0 10px; text-align: justify; text-indent: 12mm; }
  .final-response-attachment-note { margin-top: 30px !important; text-indent: 0 !important; }
  .final-response-signature { display: grid; grid-template-columns: 1fr auto; gap: 26px; align-items: end; margin: 60px 0 35px; }
  .final-response-signature span { max-width: 320px; }
  .final-response-executor { font-size: 10pt; line-height: 1.25; }
  .final-response-appendix { break-before: page; page-break-before: always; }
  .final-response-appendix h2 { font-size: 14pt; font-style: italic; }
  .final-response-appendix-point { margin: 26px 0; }
  .final-response-point-title { font-weight: 700; }
  .final-response-point-reason, .final-response-point-decision { text-align: justify; text-indent: 12mm; }
  .final-response-point-decision { margin-top: 12px; }
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
  const latestCertificate = [...c.documents]
    .reverse()
    .find(
      (document) =>
        document.kind === "certificate" && Boolean(document.snapshot?.certificate),
    );
  const source = latestCertificate?.snapshot;
  const sourcePoint = source?.issues.find((item) => item.id === point.id) || point;
  const sourceRequests = source?.requests || c.requests;
  const responses = sourceRequests
    .map((request) => ({
      authority: request.recipient.toUpperCase().includes("КВГА") ? "КВГА" : "ДВГА",
      response: request.authorityResponses?.[point.id],
      route: request.route,
    }))
    .filter(
      (
        item,
      ): item is {
        authority: "ДВГА" | "КВГА";
        response: { finding: string; response: string };
        route: ObjectionCase["requests"][number]["route"];
      } => Boolean(item.response),
    );
  const authorityArguments =
    responses
      .map(({ authority, response, route }) =>
        response.finding
          ? `${route && route !== "initial" ? "Дополнительные доводы" : "Доводы"} ${authority}: ${response.finding}`
          : "",
      )
      .filter(Boolean)
      .join("\n\n") ||
    sourcePoint.authorityFinding ||
    "—";
  const authorityReply =
    responses
      .map(({ authority, response, route }) =>
        response.response
          ? `${route && route !== "initial" ? "Дополнительный мотивированный ответ" : "Мотивированный ответ"} ${authority}: ${response.response}`
          : "",
      )
      .filter(Boolean)
      .join("\n\n") ||
    sourcePoint.position ||
    "—";
  const davgaArguments =
    source?.certificate?.davgaArgumentsByPoint?.[point.id] ||
    source?.certificate?.davgaArguments ||
    c.certificate?.davgaArgumentsByPoint?.[point.id] ||
    c.certificate?.davgaArguments ||
    "—";
  const additionalApplicantArguments = (sourcePoint.additionalArguments || [])
    .map(
      (argument, index) =>
        `Дополнительные доводы объекта гос. аудита (заявителя)${
          index ? ` №${index + 1}` : ""
        }: ${argument}`,
    )
    .join("\n\n");
  return [
    responses.length ? authorityArguments : `Доводы ДВГА/КВГА: ${authorityArguments}`,
    `Доводы объекта государственного аудита (заявителя): ${sourcePoint.argument || "—"}`,
    additionalApplicantArguments,
    responses.length
      ? authorityReply
      : `Мотивированный ответ ДВГА/КВГА: ${authorityReply}`,
    `Доводы рабочего органа (ДАВГА МФ РК): ${davgaArguments}`,
  ].filter(Boolean).join("\n\n");
}

function protocolReasonForMember(
  c: ObjectionCase,
  point: ReturnType<typeof disputed>[number],
  memberId: string,
) {
  const basis = certificateBasisForPoint(c, point);
  const memberReason = c.votes?.[point.id]?.voteReasons?.[memberId]?.trim();
  if (!memberReason || memberReason === basis) return basis;
  return `${basis}\n\nДополнительное обоснование члена АК:\n${memberReason}`;
}

function ProtocolVotesFields({
  c,
  members,
  values,
  onReasonChange,
}: {
  c: ObjectionCase;
  members: Array<{ id: string; name: string }>;
  values: FormValues;
  onReasonChange: (name: string, value: string) => void;
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
                const certificateBasis = certificateBasisForPoint(c, point);
                const reason = values[reasonName] ?? certificateBasis;
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
                        value={reason}
                        rows={8}
                        required
                        aria-label={`Обоснование ${member.name} по пункту ${point.number}`}
                        onChange={(event) => onReasonChange(reasonName, event.currentTarget.value)}
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
  requestId,
  commissionMemberId,
  onSubmit,
  onSaveDraft,
  onClose,
}: {
  action: Action;
  c: ObjectionCase;
  date: string;
  role: Role;
  /** Предварительно выбранный запрос, для которого фиксируется ответ. */
  requestId?: string;
  /** The AK member currently using the Appeals Commission cabinet. */
  commissionMemberId?: string;
  onSubmit: (form: FormData) => void | Promise<void>;
  onSaveDraft?: (form: FormData) => void | Promise<void>;
  onClose: () => void;
}) {
  const [values, setValues] = useState<FormValues>(() => {
    if (action === "request" || action === "request-saq")
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
            protocolReasonForMember(c, point, member.id),
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
  const [recommendationChannel, setRecommendationChannel] = useState<
    "saq" | "external"
  >("saq");
  const [requestTab, setRequestTab] = useState<"form" | "print">("form");
  const definition = actionForm(action, c, date, values, role);
  const activeCommissionVoter = commissionMemberId
    ? c.members.find((member) => member.id === commissionMemberId)
    : undefined;
  const isRequest = action === "request" || action === "request-saq";
  const isAnalysis = action === "analysis";
  const isOtherRequest = action === "request-saq";
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
  const recommendationTextField = definition.fields.find(
    (field) => field.name === "recommendationText",
  );
  const recommendationDueDateField = definition.fields.find(
    (field) => field.name === "recommendationDueDate",
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
  const isAuthorityRequest = (request: ObjectionCase["requests"][number]) =>
    request.template === "dvga" ||
    request.recipient.toUpperCase().includes("ДВГА") ||
    request.recipient.toUpperCase().includes("КВГА");
  const saqResponsesForConfirmation = c.requests.filter(
    (request) =>
      (isAuthorityRequest(request) && Boolean(request.responseSigned)) ||
      (request.saqRecipient === "subject" && Boolean(request.responded)),
  );
  const responseAppendix = (request: ObjectionCase["requests"][number]) =>
    c.documents.find(
      (document) =>
        document.kind === "authority-response-appendix" && document.requestId === request.id,
    ) ||
    c.documents.find(
      (document) => document.kind === "request-appendix" && document.requestId === request.id,
    );
  const responseFiles = (request: ObjectionCase["requests"][number]) =>
    c.documents.filter(
      (document) =>
        document.requestId === request.id &&
        (document.kind === "authority-response-attachment" ||
          document.kind === "subject-response-attachment"),
    );
  const hasPendingExternalResponse = c.requests.some(
    (request) =>
      !isAuthorityRequest(request) &&
      request.saqRecipient !== "subject" &&
      !request.responded,
  );
  const responseStatus = (request: ObjectionCase["requests"][number]) => {
    if (request.confirmed) return "Получен и зафиксирован";
    if (request.saqRecipient === "subject" && request.responded)
      return "Поступил — ждёт фиксации";
    if (isAuthorityRequest(request) && request.responseSigned)
      return "Поступил — ждёт фиксации";
    if (isAuthorityRequest(request) && request.responded)
      return "Ответ готовится в ДВГА/КВГА";
    return "Ожидается ответ";
  };
  const openAppendix = (appendix: NonNullable<ObjectionCase["documents"][number]>) => {
    const popup = window.open("", "_blank");
    if (!popup) {
      setError("Не удалось открыть приложение. Разрешите всплывающие окна в браузере.");
      return;
    }
    popup.document.write(appendixDocumentHtml(c, appendix));
    popup.document.close();
  };
  const downloadAppendix = (appendix: NonNullable<ObjectionCase["documents"][number]>) => {
    downloadFile(
      `${c.id}-${appendix.name}.html`,
      appendixDocumentHtml(c, appendix),
      "text/html;charset=utf-8",
    );
  };
  const printFinalResponse = () => {
    const finalResponseMajorityByPoint = Object.fromEntries(
      disputed(c).map((point) => [
        point.id,
        Object.hasOwn(values, `finalResponseMajority_${point.id}`)
          ? values[`finalResponseMajority_${point.id}`] === "on"
          : Boolean(point.finalDecisionByMajority),
      ]),
    );
    const popup = window.open("", "_blank");
    if (!popup) {
      setError(
        "Браузер заблокировал окно печати. Разрешите всплывающие окна и повторите попытку.",
      );
      return;
    }
    popup.document.write(finalResponsePrintHtml(c, finalResponseMajorityByPoint));
    popup.document.close();
    popup.focus();
    popup.print();
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
        action === "request-other" ||
        action === "deliver" ||
        action === "create-decision-project" ||
        action === "send-decision-project-eotinish" ||
        action === "record-decision-project-delivery" ||
        action === "record-final-response-delivery" ||
        action === "submit-decision-project-comment" ||
        action === "record-external-decision-project-comment" ||
        action === "hearing-after-decision-project"
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
        ) : action === "request-other" ? (
          <>
            {definition.note && <Notice>{definition.note}</Notice>}
            <div className="form-grid">
              {definition.fields.map((field) => (
                <Field key={field.name} field={field} />
              ))}
            </div>
            <label className="field request-attachments-field">
              <span>Вложить документ</span>
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
          </>
        ) : action === "deliver" && requiresConclusion(c) ? (
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
            <div className="form-grid">
              <label className="field">
                <span>
                  Способ направления <span className="required">*</span>
                </span>
                <select
                  name="recommendationChannel"
                  value={recommendationChannel}
                  onChange={(event) =>
                    setRecommendationChannel(
                      event.currentTarget.value === "external" ? "external" : "saq",
                    )
                  }
                >
                  <option value="saq">В кабинет SAQ</option>
                  <option value="external">Через другую систему</option>
                </select>
              </label>
              {recommendationChannel === "saq" ? (
                <label className="field">
                  <span>
                    Кому направить рекомендацию <span className="required">*</span>
                  </span>
                  <input
                    name="recommendationSaqRecipient"
                    list="recommendation-saq-recipients"
                    placeholder="Начните вводить название кабинета"
                    required
                  />
                  <datalist id="recommendation-saq-recipients">
                    <option value="Кабинет ДВГА" />
                    <option value="Кабинет КВГА" />
                    <option value="Кабинет Объекта" />
                    <option value="Кабинет вышестоящего органа" />
                  </datalist>
                  <small>Найдите получателя по названию кабинета SAQ.</small>
                </label>
              ) : (
                <>
                  <label className="field">
                    <span>
                      Кому направлена рекомендация <span className="required">*</span>
                    </span>
                    <input name="recommendationExternalRecipient" required />
                  </label>
                  <label className="field">
                    <span>
                      Способ отправки <span className="required">*</span>
                    </span>
                    <select name="recommendationDeliveryPath" required defaultValue="">
                      <option value="" disabled>Выберите способ</option>
                      <option value="E-Otinish">E-Otinish</option>
                      <option value="СЭД">СЭД</option>
                      <option value="Портал / цифровая система">Портал / цифровая система</option>
                      <option value="Почтовая связь">Почтовая связь</option>
                      <option value="Вручение нарочно">Вручение нарочно</option>
                    </select>
                  </label>
                  <label className="field">
                    <span>
                      Номер направления <span className="required">*</span>
                    </span>
                    <input name="recommendationRegistrationNumber" required />
                  </label>
                  <label className="field">
                    <span>
                      Дата направления рекомендации <span className="required">*</span>
                    </span>
                    <input name="recommendationSentAt" type="date" defaultValue={date} required />
                  </label>
                </>
              )}
              <label className="field">
                <span>
                  Срок исполнения рекомендации <span className="required">*</span>
                </span>
                <input
                  name="recommendationDueDate"
                  type="date"
                  defaultValue={recommendationDueDateField?.value || ""}
                  required
                />
              </label>
            </div>
            {recommendationTextField && <Field field={recommendationTextField} />}
            <label className="field">
              <span>Вложить файл</span>
              <input
                type="file"
                name="recommendationFiles"
                accept=".pdf,.png,.jpg,.jpeg,.doc,.docx,.xls,.xlsx,.txt"
              />
              <small>Необязательное вложение до 2 МБ.</small>
            </label>
          </>
        ) : action === "record-final-response-delivery" ? (
          <>
            {definition.note && <Notice>{definition.note}</Notice>}
            <div className="form-grid">
              {definition.fields.map((field) => (
                <Field key={field.name} field={field} />
              ))}
            </div>
            <label className="field request-attachments-field">
              <span>
                Файл-подтверждение отправки <span className="required">*</span>
              </span>
              <input
                type="file"
                name="finalResponseDeliveryFiles"
                accept=".pdf,.png,.jpg,.jpeg,.doc,.docx,.xls,.xlsx,.txt"
                multiple
                required
              />
              <small>Можно вложить несколько файлов до 2 МБ каждый.</small>
            </label>
          </>
        ) : action === "deliver" || action === "create-decision-project" ? (
          <>
            <div className="request-modal-details">
              <div><span>Автор</span><b>{c.assignee === "Не назначен" ? DEMO_USER.fullName : c.assignee}</b></div>
              <div><span>Печатная форма</span><b>{action === "create-decision-project" ? "Проект решения и приложение" : (c.appealType || "").trim().startsWith("Жалоба") || c.appealType === "Заявление" || c.appealType === "Возражение на аудиторский отчет" || c.appealType === "Возражение на аудиторский отчёт" ? "Мотивированный ответ и приложение" : "Окончательный ответ и приложение"}</b></div>
            </div>
            {definition.note && <Notice>{definition.note}</Notice>}
            <div className="request-modal-tabs" role="tablist">
              <button type="button" className={requestTab === "form" ? "active" : ""} onClick={() => setRequestTab("form")}>Реквизиты</button>
              <button type="button" className={requestTab === "print" ? "active" : ""} onClick={() => setRequestTab("print")}>Печатная форма</button>
            </div>
            <div hidden={requestTab !== "form"} className="form-grid">
              {definition.fields.map((field) => <Field key={field.name} field={field} />)}
              {(action === "deliver" || action === "create-decision-project") && disputed(c).length > 0 && (
                <div className="field wide">
                  <span>
                    {action === "create-decision-project"
                      ? "Решение по оспариваемым пунктам"
                      : "Итоговый результат по оспариваемым пунктам"}
                  </span>
                  {disputed(c).map((point) => {
                    const checked = Object.hasOwn(
                      values,
                      `finalResponseMajority_${point.id}`,
                    )
                      ? values[`finalResponseMajority_${point.id}`] === "on"
                      : Boolean(point.finalDecisionByMajority);
                    return (
                      <label className="checkbox-row" key={point.id}>
                        <input
                          type="checkbox"
                          name={`finalResponseMajority_${point.id}`}
                          defaultChecked={checked}
                        />
                        <span>По п. {point.number} — с большинством голосов</span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
            <div hidden={requestTab !== "print"} className="request-print-preview">
              {action === "deliver" && (
                <div className="actions request-print-actions">
                  <Button type="button" primary onClick={printFinalResponse}>
                    Печать / PDF
                  </Button>
                </div>
              )}
              <DocumentContent
                c={c}
                kind={
                  action === "create-decision-project"
                    ? "decision-project"
                    : "final-response"
                }
                finalResponseMajorityByPoint={Object.fromEntries(
                  disputed(c).map((point) => [
                    point.id,
                    Object.hasOwn(values, `finalResponseMajority_${point.id}`)
                      ? values[`finalResponseMajority_${point.id}`] === "on"
                      : Boolean(point.finalDecisionByMajority),
                  ]),
                )}
              />
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
                onReasonChange={(name, value) =>
                  setValues((current) => ({ ...current, [name]: value }))
                }
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
        ) : action === "record-external-response" ? (
          <>
            {definition.note && <Notice>{definition.note}</Notice>}
            {requestId && (
              <input type="hidden" name="externalRequestId" value={requestId} />
            )}
            {definition.fields
              .filter((field) => !requestId || field.name !== "externalRequestId")
              .map((field) => (
              <Field key={field.name} field={field} />
              ))}
            <label className="field request-attachments-field">
              <span>
                Полученный файл <span className="required">*</span>
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
          </>
        ) : action === "hearing-after-decision-project" ? (
          <>
            {definition.note && <Notice>{definition.note}</Notice>}
            {definition.fields.length > 0 && (
              <div className="form-grid">
                {definition.fields.map((field) => (
                  <Field key={field.name} field={field} />
                ))}
              </div>
            )}
            <label className="field request-attachments-field">
              <span>
                Протокол заслушивания <span className="required">*</span>
              </span>
              <input
                type="file"
                name="hearingProtocolFiles"
                accept=".pdf,.png,.jpg,.jpeg,.doc,.docx,.xls,.xlsx,.txt"
                multiple
                required
              />
              <small>Можно вложить несколько файлов до 2 МБ каждый.</small>
            </label>
          </>
        ) : [
          "record-decision-project-delivery",
          "submit-decision-project-comment",
          "record-external-decision-project-comment",
        ].includes(action) ? (
          <>
            {definition.note && <Notice>{definition.note}</Notice>}
            <div className="form-grid">
              {definition.fields.map((field) => (
                <Field key={field.name} field={field} />
              ))}
            </div>
            <label className="field request-attachments-field">
              <span>
                {action === "record-decision-project-delivery"
                  ? "Подтверждающий файл"
                  : "Файл замечания"}
              </span>
              <input
                type="file"
                name="responseFiles"
                accept=".pdf,.png,.jpg,.jpeg,.doc,.docx,.xls,.xlsx,.txt"
                multiple
              />
              <small>Необязательное вложение до 2 МБ.</small>
            </label>
          </>
        ) : action === "position" ? (
          <>
            <Notice tone="amber">
              {hasPendingExternalResponse
                ? "Ответы из кабинетов SAQ поступили. Зафиксируйте дату их получения и приложите ответ внешнего адресата."
                : "Все ожидаемые ответы поступили. Одним действием зафиксируйте дату их получения и вложите все полученные файлы."}
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
                          : (isAuthorityRequest(request) && request.responseSigned) ||
                              (request.saqRecipient === "subject" && request.responded)
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
                      {saqResponsesForConfirmation.length
                        ? "Электронные ответы и приложенные документы"
                        : "Ответы, полученные вне SAQ"}
                    </small>
                  </div>
                  <em>ПОСТУПИЛИ</em>
                </div>
                {saqResponsesForConfirmation.length ? (
                  <div className="response-receipt-materials">
                    {saqResponsesForConfirmation.map((request) => {
                      const appendix = responseAppendix(request);
                      const files = responseFiles(request);
                      return (
                        <section key={request.id} className="response-receipt-response">
                          <b>{request.recipient}</b>
                          {isAuthorityRequest(request) && (
                            <>
                              <span className="response-receipt-label">Заполненное приложение</span>
                              {appendix ? (
                                <div className="response-appendix-actions">
                                  <span>{appendix.name}</span>
                                  <div>
                                    <Button type="button" onClick={() => openAppendix(appendix)}>
                                      Открыть
                                    </Button>
                                    <Button type="button" onClick={() => downloadAppendix(appendix)}>
                                      Скачать
                                    </Button>
                                  </div>
                                </div>
                              ) : (
                                <span className="muted">Приложение не найдено</span>
                              )}
                            </>
                          )}
                          <span className="response-receipt-label">
                            {isAuthorityRequest(request) ? "Подтверждающие документы" : "Файлы ответа"}
                          </span>
                          {files.length ? (
                            <ul>
                              {files.map((document) =>
                                document.dataUrl ? (
                                  <li key={`${request.id}-${document.name}`}>
                                    <a href={document.dataUrl} download={document.filename || document.name}>
                                      {document.name}
                                    </a>
                                  </li>
                                ) : (
                                  <li key={`${request.id}-${document.name}`}>{document.name}</li>
                                ),
                              )}
                            </ul>
                          ) : (
                            <span className="muted">Файлы не приложены</span>
                          )}
                        </section>
                      );
                    })}
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
                : action === "record-external-response"
                  ? "Сохранить ответ"
                : action === "subject-response"
                  ? "Направить ответ"
                : definition.submit}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
