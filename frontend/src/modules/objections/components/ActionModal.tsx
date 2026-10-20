import { useState } from "react";
import type { Action, ObjectionCase } from "../../../types";
import { Button, Modal, Notice } from "../../../components/ui";
import { DEMO_USER } from "../../../config";
import { actionForm } from "../formDefinitions";
import type { FormField, FormValues } from "../formDefinitions";
import { disputed } from "../services/decisions";
import { DocumentContent } from "./DocumentModal";

const COMMISSION_MEMBER_OPTIONS = [
  "ФИО 1",
  "ФИО 2",
  "ФИО 3",
  "ФИО 4",
  "ФИО 5",
  "ФИО 6",
] as const;

export function Field({ field }: { field: FormField }) {
  if (field.type === "heading")
    return <h3 className="form-section">{field.label}</h3>;
  if (field.type === "checkbox")
    return (
      <label className="checkbox-row">
        <input type="checkbox" name={field.name} required={field.required} />
        <span>{field.label}</span>
      </label>
    );
  return (
    <label className="field">
      <span>
        {field.label}
        {field.required && <span className="required"> *</span>}
      </span>
      {field.type === "textarea" ? (
        <textarea
          name={field.name}
          defaultValue={field.value}
          required={field.required}
          rows={3}
        />
      ) : field.type === "select" ? (
        <select
          name={field.name}
          defaultValue={field.value}
          required={field.required}
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
          min={field.min}
          max={field.max}
          required={field.required}
          readOnly={field.readOnly}
          step={field.type === "number" ? "any" : undefined}
        />
      )}
    </label>
  );
}

function VotingFields({ c, values }: { c: ObjectionCase; values: FormValues }) {
  return (
    <>
      <h3 className="form-section">Участники заседания</h3>
      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th>Член комиссии</th>
              <th>Присутствует</th>
              <th>Отвод</th>
              <th>Основание отвода</th>
            </tr>
          </thead>
          <tbody>
            {c.members.map((member) => (
              <tr key={member.id}>
                <td>{member.name}</td>
                <td>
                  <input
                    type="checkbox"
                    name={`present_${member.id}`}
                    defaultChecked={member.present}
                    aria-label={`${member.name}: присутствует`}
                  />
                </td>
                <td>
                  <input
                    type="checkbox"
                    name={`recused_${member.id}`}
                    aria-label={`${member.name}: отвод`}
                  />
                </td>
                <td>
                  <input
                    name={`reason_${member.id}`}
                    aria-label={`${member.name}: основание отвода`}
                    required={!!values[`recused_${member.id}`]}
                    disabled={!values[`recused_${member.id}`]}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {disputed(c).map((point) => (
        <div key={point.id}>
          <h3 className="form-section">
            Пункт {point.number}: голосование членов апелляционной комиссии
          </h3>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Член комиссии</th>
                  <th>Голос по проекту</th>
                </tr>
              </thead>
              <tbody>
                {c.members.map((member) => {
                  const present =
                    values[`present_${member.id}`] ??
                    (member.present ? "on" : "");
                  const excluded = !present || !!values[`recused_${member.id}`];
                  return (
                    <tr key={member.id}>
                      <td>{member.name}</td>
                      <td>
                        {excluded ? (
                          <span className="muted">Не голосует</span>
                        ) : (
                          <select
                            name={`vote_${point.id}_${member.id}`}
                            required
                            defaultValue=""
                            aria-label={`Пункт ${point.number}, ${member.name}`}
                          >
                            <option value="">Выберите голос</option>
                            <option value="yes">За проект</option>
                            <option value="no">Против проекта</option>
                          </select>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </>
  );
}

function requestRecipientField(field: FormField): FormField {
  if (field.name !== "recipient" || field.type !== "select") return field;
  return {
    ...field,
    options: field.options?.filter(([value]) => value !== "other"),
  };
}

export default function ActionModal({
  action,
  c,
  date,
  onSubmit,
  onClose,
}: {
  action: Action;
  c: ObjectionCase;
  date: string;
  onSubmit: (form: FormData) => void | Promise<void>;
  onClose: () => void;
}) {
  const [values, setValues] = useState<FormValues>({});
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [requestTab, setRequestTab] = useState<"form" | "print">("form");
  const [certificateMembers, setCertificateMembers] = useState([1]);
  const [requestMode] = useState<"dvga-kvga" | "other">(() => {
    if (action !== "request") return "dvga-kvga";
    try {
      const stored = sessionStorage.getItem("saq.objections.request-mode");
      sessionStorage.removeItem("saq.objections.request-mode");
      return stored === "other" ? "other" : "dvga-kvga";
    } catch {
      return "dvga-kvga";
    }
  });
  const isOtherRequest = action === "request" && requestMode === "other";
  const definition = actionForm(action, c, date, values);
  const requestDeadline =
    values.deadline ||
    definition.fields.find((field) => field.name === "deadline")?.value ||
    `${date}T18:00`;
  const requestRecipient = isOtherRequest
    ? "other"
    : values.recipient ??
      definition.fields.find((field) => field.name === "recipient")?.value ??
      "";
  const requestRecipientForPreview = isOtherRequest
    ? values.recipientOther || ""
    : requestRecipient;
  const customRequestText = isOtherRequest
    ? values.customRequestText ?? ""
    : undefined;
  const protocolMembers = c.members.map((member) => ({
    ...member,
    present:
      values[`present_${member.id}`] === undefined
        ? member.present
        : values[`present_${member.id}`] === "on",
    recused:
      values[`recused_${member.id}`] === undefined
        ? member.recused
        : values[`recused_${member.id}`] === "on",
    reason: values[`reason_${member.id}`] || member.reason,
  }));
  const protocolVotes = Object.fromEntries(
    disputed(c).map((point) => [
      point.id,
      Object.fromEntries(
        c.members.map((member) => [
          member.id,
          values[`vote_${point.id}_${member.id}`] || "",
        ]),
      ),
    ]),
  );
  return (
    <Modal
      title={
        action === "request"
          ? isOtherRequest
            ? "Сформировать запрос в другой орган"
            : "Сформировать запрос в ДВГА/КВГА"
          : definition.title
      }
      onClose={onClose}
      wide={
        action === "vote" ||
        action === "request" ||
        action === "fill-request-response" ||
        action === "analysis"
      }
    >
      <form
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
            await onSubmit(new FormData(event.currentTarget));
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
        {action === "request" ? (
          <>
            <div className="request-modal-details">
              <div>
                <span>Исполнитель</span>
                <b>{DEMO_USER.fullName}</b>
              </div>
              <div>
                <span>Печатная форма</span>
                <b>
                  {isOtherRequest
                    ? "Шаблон запроса в другой орган"
                    : "Шаблон запроса в ДВГА/КВГА"}
                </b>
              </div>
            </div>
            <Notice>
              {isOtherRequest
                ? "Заполните адресата и текст запроса. Значения автоматически подставятся в печатную форму по шаблону."
                : "Выберите ДВГА/КВГА. Срок рассмотрения рассчитывается автоматически, исполнитель определяется по текущему пользователю."}
            </Notice>
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
            <div hidden={requestTab !== "form"} className="form-grid">
              {isOtherRequest ? (
                <>
                  <input type="hidden" name="recipient" value="other" />
                  <label className="field">
                    <span>
                      Кому направить запрос <span className="required"> *</span>
                    </span>
                    <input
                      name="recipientOther"
                      defaultValue={values.recipientOther || ""}
                      required
                    />
                  </label>
                  <label className="field">
                    <span>
                      Текст запроса <span className="required"> *</span>
                    </span>
                    <textarea
                      name="customRequestText"
                      defaultValue={values.customRequestText || ""}
                      rows={10}
                      required
                    />
                  </label>
                </>
              ) : (
                <>
                  {definition.fields.map((field) => (
                    <Field
                      key={field.name}
                      field={requestRecipientField(field)}
                    />
                  ))}
                  <label className="field">
                    <span>Исполнитель</span>
                    <input
                      name="executor"
                      value={DEMO_USER.fullName}
                      readOnly
                    />
                  </label>
                </>
              )}
            </div>
            <div hidden={requestTab !== "print"} className="request-print-preview">
              <DocumentContent
                c={c}
                kind="request"
                requestPreview={{
                  recipient: requestRecipientForPreview,
                  deadline: requestDeadline,
                  customText: customRequestText,
                }}
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
              <div>
                <span>Печатная форма</span>
                <b>Приложение № 1 к запросу</b>
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
                kind="request-appendix"
                appendixFindingPreview={Object.fromEntries(
                  disputed(c).map((point) => [
                    point.id,
                    values[`authorityFinding_${point.id}`] || point.authorityFinding || "",
                  ]),
                )}
                appendixPreview={Object.fromEntries(
                  disputed(c).map((point) => [
                    point.id,
                    values[`authorityResponse_${point.id}`] || point.position || "",
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
              <div>
                <span>Печатная форма</span>
                <b>Справка по шаблону</b>
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
              {certificateMembers.map((number) => (
                <section className="certificate-member-form" key={number}>
                  <h3 className="form-section">
                    Член апелляционной комиссии {number}
                  </h3>
                  <label className="field">
                    <span>
                      ФИО члена апелляционной комиссии
                      <span className="required"> *</span>
                    </span>
                    <select
                      name={`certificateMember_${number}`}
                      defaultValue={
                        values[`certificateMember_${number}`] ||
                        COMMISSION_MEMBER_OPTIONS[0]
                      }
                      required
                    >
                      {COMMISSION_MEMBER_OPTIONS.map((member) => (
                        <option key={member} value={member}>
                          {member}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span>
                      Довод <span className="required"> *</span>
                    </span>
                    <textarea
                      name={`certificateArgument_${number}`}
                      defaultValue={values[`certificateArgument_${number}`] || ""}
                      rows={3}
                      required
                    />
                  </label>
                </section>
              ))}
              <Button
                type="button"
                onClick={() =>
                  setCertificateMembers((members) => [
                    ...members,
                    members.length + 1,
                  ])
                }
              >
                Добавить члена АК
              </Button>
              <label className="field certificate-authority-arguments">
                <span>
                  Доводы ДВГА <span className="required"> *</span>
                </span>
                <textarea
                  name="authorityArguments"
                  defaultValue={values.authorityArguments || ""}
                  rows={4}
                  required
                />
              </label>
            </div>
            <div hidden={requestTab !== "print"} className="request-print-preview">
              <DocumentContent
                c={c}
                kind="certificate"
                certificatePreview={{
                  authorityArguments: values.authorityArguments || "",
                  memberPositions: certificateMembers.map((number) => ({
                    id: String(number),
                    name:
                      values[`certificateMember_${number}`] ||
                      COMMISSION_MEMBER_OPTIONS[0],
                    argument: values[`certificateArgument_${number}`] || "",
                  })),
                }}
              />
            </div>
          </>
        ) : action === "vote" ? (
          <>
            <div className="request-modal-details">
              <div>
                <span>Автор</span>
                <b>Апелляционная комиссия</b>
              </div>
              <div>
                <span>Печатная форма</span>
                <b>Протокол по шаблону</b>
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
              <Button
                onClick={(event) => {
                  const form = event.currentTarget.form!;
                  form
                    .querySelectorAll<HTMLSelectElement>('select[name^="vote_"]')
                    .forEach((select) => {
                      select.value = "yes";
                    });
                  setValues(
                    Object.fromEntries(
                      [...new FormData(form).entries()].map(([key, value]) => [
                        key,
                        String(value),
                      ]),
                    ),
                  );
                }}
              >
                Единогласно за проекты
              </Button>
              <VotingFields c={c} values={values} />
            </div>
            <div hidden={requestTab !== "print"} className="request-print-preview">
              <DocumentContent
                c={c}
                kind="protocol"
                protocolPreview={{
                  date: values.protocolDate || date,
                  number: values.number || `ПР-${c.id}`,
                  audio: values.audio || "",
                  members: protocolMembers,
                  votes: protocolVotes,
                }}
              />
            </div>
          </>
        ) : action === "position" ? (
          <>
            <Notice tone="amber">
              Ответ от адресата ещё не подтверждён. Внесите дату поступления и
              вложите все полученные файлы.
            </Notice>
            <div className="response-receipt-grid">
              <section className="response-receipt-card response-receipt-system">
                <div className="response-receipt-heading">
                  <span aria-hidden="true">↓</span>
                  <div>
                    <b>Из кабинета ДВГА/КВГА</b>
                    <small>Электронное поступление</small>
                  </div>
                  <em>НЕ ПОСТУПИЛО</em>
                </div>
                <div className="response-receipt-empty">
                  <b>Ответ не поступил</b>
                </div>
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
        <div className="dialog-actions">
          <Button onClick={onClose} disabled={saving}>
            Отмена
          </Button>
          <Button type="submit" primary disabled={saving}>
            {saving
              ? "Сохранение..."
              : action === "position"
                ? "Сохранить полученный ответ"
                : definition.submit}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
