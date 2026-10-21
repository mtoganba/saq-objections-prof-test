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
import {
  isPreventiveControlObjectionType,
  requiresMotivatedResponseType,
  usesStatementReviewScenario,
} from "../appealTypes";

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
  motivatedResponseText?: string,
) {
  const content = renderToStaticMarkup(
    <DocumentContent
      c={c}
      kind="final-response"
      finalResponseMajorityByPoint={finalResponseMajorityByPoint}
      motivatedResponseText={motivatedResponseText}
    />,
  );
  return `<!doctype html>
<html lang="kk"><head><meta charset="utf-8"><title>${requiresMotivatedResponseType(c.appealType) ? "Мотивированный ответ" : "Окончательный ответ"}</title>
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
          readOnly={field.readOnly}
          aria-readonly={field.readOnly || undefined}
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

function commissionMemberNameParts(name: string) {
  const cleaned = name.trim().replace(/\s+/g, " ");
  const match = cleaned.match(
    /^(.*\S)\s+([^\s]+)\s+([А-ЯЁӘҒҚҢӨҰҮҺІA-Z]\.(?:[А-ЯЁӘҒҚҢӨҰҮҺІA-Z]\.)?)$/u,
  );
  if (!match)
    return {
      role: "",
      surname: cleaned,
      initials: "",
    };
  let [, role, surname, initials] = match;
  if (surname.toLowerCase() === "тегі") {
    const roleWords = role.split(" ");
    surname = `${roleWords.pop()} тегі`;
    role = roleWords.join(" ");
  }
  return { role, surname, initials };
}

function CommissionMemberCell({ name }: { name: string }) {
  const parts = commissionMemberNameParts(name);
  const avatar = (parts.initials.replace(/\./g, "") || parts.surname.slice(0, 2))
    .slice(0, 2)
    .toLocaleUpperCase("ru");
  return (
    <div className="commission-vote-member">
      <span className="commission-vote-avatar" aria-hidden="true">
        {avatar}
      </span>
      <span className="commission-vote-member-name">
        <strong>
          {parts.surname}
          {parts.initials ? ` ${parts.initials}` : ""}
        </strong>
        <small>{parts.role || "Член Апелляционной комиссии"}</small>
      </span>
    </div>
  );
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
                const reason = values[reasonName] ?? "";
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
            "",
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
  const hearingProtocolInputRef = useRef<HTMLInputElement>(null);
  const [hearingProtocolFileNames, setHearingProtocolFileNames] = useState<string[]>([]);
  const [hearingFileDropActive, setHearingFileDropActive] = useState(false);
  const [recommendationChannel, setRecommendationChannel] = useState<
    "saq" | "external"
  >("saq");
  const [requestTab, setRequestTab] = useState<"form" | "print">("form");
  const definition = actionForm(action, c, date, values, role);
  const hearingUsesRouteSelection =
    action === "hearing-after-decision-project" &&
    usesStatementReviewScenario(c.appealType);
  const hearingHasNewArguments = values.hearingHasNewArguments || "yes";
  const hearingNextAction =
    hearingHasNewArguments === "no"
      ? "proceed"
      : values.hearingNextAction || "return-request";
  const hearingArgumentPoints = disputed(c);
  const activeCommissionVoter = commissionMemberId
    ? c.members.find((member) => member.id === commissionMemberId)
    : undefined;
  const preventiveCase = isPreventiveControlObjectionType(c.appealType);
  const preventiveControlRequest = action === "request" && preventiveCase;
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
  const commissionVotingMembers = c.members.filter((member) => member.present);
  const commissionVotingPoints = disputed(c);
  const commissionVoteCount = commissionVotingPoints.reduce(
    (count, point) =>
      count +
      commissionVotingMembers.filter((member) =>
        normalizeVoteChoice(c.votes?.[point.id]?.votes?.[member.id]),
      ).length,
    0,
  );
  const commissionVoteTotal =
    commissionVotingPoints.length * commissionVotingMembers.length;
  const commissionVotePercent = commissionVoteTotal
    ? Math.round((commissionVoteCount / commissionVoteTotal) * 100)
    : 0;
  const activeCommissionVoterHasPendingVote = Boolean(
    activeCommissionVoter &&
      commissionVotingPoints.some(
        (point) =>
          !normalizeVoteChoice(
            c.votes?.[point.id]?.votes?.[activeCommissionVoter.id],
          ),
      ),
  );
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
    popup.document.write(
      finalResponsePrintHtml(
        c,
        finalResponseMajorityByPoint,
        values.motivatedResponseText ??
          c.motivatedResponseText ??
          c.decisionProject?.text ??
          "",
      ),
    );
    popup.document.close();
    popup.focus();
    popup.print();
  };
  return (
    <Modal
      title={definition.title}
      onClose={onClose}
      className={[
        action === "commission-vote" ? "commission-voting-dialog" : "",
        hearingUsesRouteSelection ? "hearing-completed-dialog" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      wide={
        action === "vote" ||
        action === "commission-vote" ||
        isRequest ||
        action === "fill-request-response" ||
        action === "analysis" ||
        action === "edit-certificate" ||
        action === "select-preventive-attendees" ||
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
                {preventiveControlRequest
                  ? "Печатная форма приложения"
                  : "Печатная форма"}
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
                kind={preventiveControlRequest ? "request-appendix" : "request"}
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
              <div>
                <span>Печатная форма</span>
                <b>
                  {action === "create-decision-project"
                    ? "Проект решения"
                    : requiresMotivatedResponseType(c.appealType)
                      ? "Мотивированный ответ и приложение"
                      : "Окончательный ответ и приложение"}
                </b>
              </div>
            </div>
            {definition.note && <Notice>{definition.note}</Notice>}
            <div className="request-modal-tabs" role="tablist">
              <button type="button" className={requestTab === "form" ? "active" : ""} onClick={() => setRequestTab("form")}>Реквизиты</button>
              <button type="button" className={requestTab === "print" ? "active" : ""} onClick={() => setRequestTab("print")}>Печатная форма</button>
            </div>
            <div hidden={requestTab !== "form"} className="form-grid">
              {definition.fields.map((field) => <Field key={field.name} field={field} />)}
              {action === "deliver" && disputed(c).length > 0 && (
                <div className="field wide">
                  <span>Итоговый результат по оспариваемым пунктам</span>
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
                decisionProjectText={values.decisionProjectText || ""}
                motivatedResponseText={
                  values.motivatedResponseText ??
                  c.motivatedResponseText ??
                  c.decisionProject?.text ??
                  ""
                }
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
                      authorityRequestForResponse?.authorityResponses?.[point.id]?.finding ||
                      point.authorityFinding ||
                      (c.submittedViaSaqApplicant ? point.finding || point.title : "") ||
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
                <b>{preventiveCase ? "Секретарь комиссии" : "Исполнитель ДАВГА"}</b>
              </div>
              {preventiveCase && (
                <div>
                  <span>Печатная форма</span>
                  <b>Приложение к материалам обращения</b>
                </div>
              )}
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
              {preventiveCase ? (
                <DocumentContent
                  c={{
                    ...c,
                    analysisAppendixArgumentsByPoint: Object.fromEntries(
                      disputed(c).map((point) => [
                        point.id,
                        values[`analysisAppendixArguments_${point.id}`] || "",
                      ]),
                    ),
                  }}
                  kind="analysis-appendix"
                />
              ) : (
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
              )}
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
            {activeCommissionVoter && (
              <input
                type="hidden"
                name="commissionMember"
                value={activeCommissionVoter.id}
              />
            )}
            <div className="commission-vote-summary">
              <div className="commission-vote-stat commission-vote-progress-stat">
                <span>Голосов зафиксировано</span>
                <strong>
                  {commissionVoteCount}
                  <small> из {commissionVoteTotal}</small>
                </strong>
                <div
                  className="commission-vote-progress"
                  role="progressbar"
                  aria-label="Ход голосования"
                  aria-valuemin={0}
                  aria-valuemax={commissionVoteTotal}
                  aria-valuenow={commissionVoteCount}
                >
                  <span style={{ width: `${commissionVotePercent}%` }} />
                </div>
              </div>
              <div className="commission-vote-stat">
                <span>Ожидают голоса</span>
                <strong>{Math.max(commissionVoteTotal - commissionVoteCount, 0)}</strong>
              </div>
              <div className="commission-vote-stat">
                <span>Кто вносит голос</span>
                <strong>
                  {role === "commission"
                    ? activeCommissionVoter
                      ? commissionMemberNameParts(activeCommissionVoter.name).surname
                      : "Член АК"
                    : "Секретарь"}
                </strong>
              </div>
            </div>
            <h3 className="form-section commission-vote-heading">
              Голоса по оспариваемым вопросам
            </h3>
            {commissionVotingMembers.length && commissionVotingPoints.length ? (
              <div className="commission-vote-table-scroll">
                <table className="data-table commission-vote-table">
                <thead>
                  <tr>
                    <th>Фамилия, инициалы</th>
                    <th>Описание оспариваемого вопроса</th>
                    <th>Голос</th>
                    <th>Обоснование</th>
                  </tr>
                </thead>
                <tbody>
                  {commissionVotingPoints.map((point) =>
                    commissionVotingMembers.map((member, index) => {
                      const savedVote = normalizeVoteChoice(
                        c.votes?.[point.id]?.votes?.[member.id],
                      );
                      const voteName = `commissionVote_${point.id}_${member.id}`;
                      const reasonName = `commissionReason_${point.id}_${member.id}`;
                      const savedReason =
                        c.votes?.[point.id]?.voteReasons?.[member.id]?.trim() || "";
                      const canEnterVote =
                        !savedVote &&
                        (role !== "commission" ||
                          member.id === activeCommissionVoter?.id);
                      return (
                        <tr
                          key={`${point.id}-${member.id}`}
                          className={savedVote ? "commission-vote-recorded" : ""}
                        >
                          <td>
                            <CommissionMemberCell name={member.name} />
                          </td>
                          {index === 0 && (
                            <td
                              rowSpan={commissionVotingMembers.length}
                              className="commission-vote-issue-cell"
                            >
                              <span className="commission-vote-point-number">
                                Пункт №{point.number}
                              </span>
                              <span>{point.title || "Описание вопроса не указано"}</span>
                            </td>
                          )}
                          <td>
                            {savedVote ? (
                              <span
                                className={`commission-vote-choice commission-vote-choice-${savedVote}`}
                              >
                                <span aria-hidden="true">✓</span>
                                {OUTCOMES[savedVote]}
                              </span>
                            ) : canEnterVote ? (
                              <select
                                name={voteName}
                                defaultValue={values[voteName] || ""}
                                aria-label={`Голос ${member.name} по пункту ${point.number}`}
                              >
                                <option value="">Выберите голос</option>
                                {Object.entries(OUTCOMES).map(([value, label]) => (
                                  <option key={value} value={value}>
                                    {label}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <span className="commission-vote-pending">
                                Ожидается голос
                              </span>
                            )}
                          </td>
                          <td>
                            {savedVote ? (
                              <span
                                className={
                                  savedReason
                                    ? "commission-vote-saved-reason"
                                    : "commission-vote-no-reason"
                                }
                              >
                                {savedReason || "Обоснование не указано"}
                              </span>
                            ) : canEnterVote ? (
                              <textarea
                                name={reasonName}
                                defaultValue={values[reasonName] || ""}
                                rows={2}
                                placeholder="Краткое обоснование решения"
                                aria-label={`Обоснование ${member.name} по пункту ${point.number}`}
                              />
                            ) : (
                              <span className="commission-vote-no-reason">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    }),
                  )}
                </tbody>
                </table>
              </div>
            ) : (
              <Notice tone="amber">
                Нет отмеченных участников или оспариваемых вопросов для голосования.
              </Notice>
            )}
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
          hearingUsesRouteSelection ? (
            <div className="hearing-completed-form">
              <div className="hearing-info-banner">
                <span className="hearing-info-icon" aria-hidden="true">
                  i
                </span>
                <p>
                  Вложите протокол проведённого заслушивания. {definition.note}
                </p>
              </div>

              <section className="hearing-step">
                <div className="hearing-step-heading">
                  <span>1</span>
                  <h4>Основные сведения</h4>
                </div>
                <div className="hearing-basics-grid">
                  {definition.fields
                    .filter((field) => field.name === "date")
                    .map((field) => (
                      <Field key={field.name} field={field} />
                    ))}
                  {definition.fields
                    .filter((field) => field.name === "hearingHasNewArguments")
                    .map((field) => (
                      <Field key={field.name} field={field} />
                    ))}
                </div>
              </section>

              <section className="hearing-step">
                <div className="hearing-step-heading">
                  <span>2</span>
                  <h4>
                    Выберите дальнейшее действие <span className="required">*</span>
                  </h4>
                </div>
                <div
                  className="hearing-action-options"
                  role="radiogroup"
                  aria-label="Дальнейшее действие после заслушивания"
                >
                  {[
                    ["return-request", "Вернуть на этап «Запрос»"],
                    ["return-analysis", "Вернуть на этап «Анализ»"],
                    ["proceed", "Перейти на следующий этап"],
                  ].map(([value, label]) => {
                    const disabled =
                      hearingHasNewArguments === "no" && value !== "proceed";
                    return (
                      <label
                        className={[
                          "hearing-action-option",
                          hearingNextAction === value ? "selected" : "",
                          disabled ? "disabled" : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        key={value}
                      >
                        <input
                          type="radio"
                          name="hearingNextAction"
                          value={value}
                          checked={hearingNextAction === value}
                          disabled={disabled}
                          required
                        />
                        <span>{label}</span>
                      </label>
                    );
                  })}
                </div>
              </section>

              <section className="hearing-step">
                <div className="hearing-step-heading">
                  <span>3</span>
                  <h4>Выберите пункты с новыми доводами</h4>
                </div>
                {hearingHasNewArguments === "yes" ? (
                  <>
                    <p className="hearing-points-hint">
                      Отметьте только оспариваемые пункты, к которым относятся
                      новые доводы, и заполните открывшиеся поля.
                    </p>
                    {hearingArgumentPoints.length ? (
                      <div className="hearing-points-list">
                        {hearingArgumentPoints.map((point) => {
                          const pointFieldName = `hearingArgumentPoint_${point.id}`;
                          const isSelected = values[pointFieldName] === "on";
                          return (
                            <div
                              className={`hearing-point-card ${isSelected ? "selected" : ""}`}
                              key={point.id}
                            >
                              <label className="hearing-point-choice">
                                <input
                                  type="checkbox"
                                  name={pointFieldName}
                                  value="on"
                                  checked={isSelected}
                                />
                                <span className="hearing-point-number">
                                  {point.number}
                                </span>
                                <span>
                                  Пункт № {point.number} — {point.title}
                                </span>
                              </label>
                              {isSelected && (
                                <div className="hearing-point-additional">
                                  <label className="field">
                                    <span>
                                      Дополнительные доводы объекта гос. аудита
                                      (заявителя) по пункту {point.number}
                                      <span className="required"> *</span>
                                    </span>
                                    <textarea
                                      name={`additionalArgument_${point.id}`}
                                      defaultValue={
                                        values[`additionalArgument_${point.id}`] ||
                                        ""
                                      }
                                      rows={3}
                                      required
                                    />
                                  </label>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="hearing-points-empty">
                        В обращении нет оспариваемых пунктов для привязки новых
                        доводов.
                      </p>
                    )}
                  </>
                ) : (
                  <p className="hearing-points-empty">
                    Новых доводов нет. Выбор пунктов не требуется.
                  </p>
                )}
              </section>

              <section className="hearing-step">
                <div className="hearing-step-heading">
                  <span>4</span>
                  <h4>
                    Протокол заслушивания <span className="required">*</span>
                  </h4>
                </div>
                <label
                  className={`hearing-protocol-dropzone ${hearingFileDropActive ? "drag-active" : ""}`}
                  onDragOver={(event) => {
                    event.preventDefault();
                    setHearingFileDropActive(true);
                  }}
                  onDragLeave={() => setHearingFileDropActive(false)}
                  onDrop={(event) => {
                    event.preventDefault();
                    setHearingFileDropActive(false);
                    const input = hearingProtocolInputRef.current;
                    if (!input || !event.dataTransfer.files.length) return;
                    const transfer = new DataTransfer();
                    Array.from(event.dataTransfer.files).forEach((file) =>
                      transfer.items.add(file),
                    );
                    input.files = transfer.files;
                    setHearingProtocolFileNames(
                      Array.from(transfer.files).map((file) => file.name),
                    );
                  }}
                >
                  <span className="hearing-file-icon" aria-hidden="true">
                    ▤
                  </span>
                  <span className="hearing-protocol-copy">
                    <span>
                      <b>Выбрать файл(ы)</b> или перетащите их сюда
                    </span>
                    <small>Можно вложить несколько файлов до 2 МБ каждый.</small>
                    {hearingProtocolFileNames.length > 0 && (
                      <span className="hearing-upload-file-list">
                        {hearingProtocolFileNames.join(", ")}
                      </span>
                    )}
                  </span>
                  <input
                    ref={hearingProtocolInputRef}
                    type="file"
                    name="hearingProtocolFiles"
                    accept=".pdf,.png,.jpg,.jpeg,.doc,.docx,.xls,.xlsx,.txt"
                    multiple
                    required
                    onChange={(event) =>
                      setHearingProtocolFileNames(
                        Array.from(event.currentTarget.files || []).map(
                          (file) => file.name,
                        ),
                      )
                    }
                  />
                </label>
              </section>
            </div>
          ) : (
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
          )
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
          <Button
            type="submit"
            primary
            disabled={
              saving ||
              (action === "commission-vote" &&
                role === "commission" &&
                !activeCommissionVoterHasPendingVote)
            }
          >
            {saving
              ? "Сохранение..."
              : action === "commission-vote" &&
                  role === "commission" &&
                  !activeCommissionVoterHasPendingVote
                ? "Ваш голос уже учтён"
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
