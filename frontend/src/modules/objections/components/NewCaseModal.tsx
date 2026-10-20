import { useState } from "react";
import { Button, Modal, Notice } from "../../../components/ui";
import { makeCase } from "../../../data/objections";
import type { CaseType, DemoState } from "../../../types";
import { dateObject } from "../services/deadlines";
import { required } from "../services/workflow";
import { Field } from "./ActionModal";

const FILE_EXTENSIONS = /\.(pdf|png|jpe?g|docx?|xlsx?|txt)$/i;
const MAX_FILE_SIZE = 2 * 1024 * 1024;

const AUDIT_ORGAN_OPTIONS = [
  "КВГА",
  "ДВГА по Акмолинской области",
  "ДВГА по Актюбинской области",
  "ДВГА по Алматинской области",
  "ДВГА по области Жетісу",
  "ДВГА по Атырауской области",
  "ДВГА по Восточно-Казахстанской области",
  "ДВГА по Жамбылской области",
  "ДВГА по Западно-Казахстанской области",
  "ДВГА по Карагандинской области",
  "ДВГА по Костанайской области",
  "ДВГА по Кызылординской области",
  "ДВГА по Мангыстауской области",
  "ДВГА по Павлодарской области",
  "ДВГА по Северо-Казахстанской области",
  "ДВГА по Туркестанской области",
  "ДВГА по г.Шымкент",
  "ДВГА по г. Алматы",
  "ДВГА по г. Астана",
  "ДВГА по области Ұлытау",
  "ДВГА по области Абай",
] as const;

const CHANNEL_OPTIONS = [
  "E-Otinish",
  "Веб-портал государственных закупок",
  "ОДО",
  "SAQ",
  "другое",
] as const;

function fileDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Не удалось прочитать файл"));
    reader.readAsDataURL(file);
  });
}

function validateFiles(files: File[]) {
  files.forEach((file) => {
    if (file.size > MAX_FILE_SIZE)
      throw new Error(`Файл «${file.name}» превышает 2 МБ`);
    if (!FILE_EXTENSIONS.test(file.name))
      throw new Error("Поддерживаются PDF, PNG, JPG, DOC(X), XLS(X), TXT");
  });
}

const APPEAL_TYPES = [
  { value: "statement", label: "Заявление", caseType: "control" },
  {
    value: "preventive-control-complaint",
    label: "Жалоба на акт о результате профилактического контроля",
    caseType: "control",
  },
  {
    value: "action-inaction-complaint",
    label: "Жалоба на действие/бездействие",
    caseType: "control",
  },
  {
    value: "kvga-dvga-decision-complaint",
    label: "Жалоба на решение КВГА/ДВГА",
    caseType: "control",
  },
  {
    value: "notice-objection",
    label: "Возражение на уведомления",
    caseType: "notice",
  },
  {
    value: "audit-objection",
    label: "Возражение на аудиторский отчет",
    caseType: "audit",
  },
] as const satisfies ReadonlyArray<{
  value: string;
  label: string;
  caseType: CaseType;
}>;

export default function NewCaseModal({
  state,
  onSave,
  onClose,
}: {
  state: DemoState;
  onSave: (state: DemoState, caseId: string) => void;
  onClose: () => void;
}) {
  const [appealType, setAppealType] = useState<string>(APPEAL_TYPES[0].value);
  const [pointCount, setPointCount] = useState(1);
  const [error, setError] = useState("");
  const selectedAppealType =
    APPEAL_TYPES.find((item) => item.value === appealType) ?? APPEAL_TYPES[0];
  const type = selectedAppealType.caseType;
  return (
    <Modal title="Новое тестовое обращение" onClose={onClose}>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          try {
            const data = new FormData(event.currentTarget);
            const requirementFiles = data
              .getAll("requirementsFiles")
              .filter(
                (value): value is File =>
                  value instanceof File && value.name.length > 0,
              );
            const pointEvidenceFiles = Array.from(
              { length: pointCount },
              (_, index) => {
                const pointId = `point${index + 1}`;
                const files = data
                  .getAll(`evidenceFiles_${pointId}`)
                  .filter(
                    (value): value is File =>
                      value instanceof File && value.name.length > 0,
                  );
                if (!files.length)
                  throw new Error(
                    `Вложите доказательства по пункту ${index + 1}`,
                  );
                return files;
              },
            );
            validateFiles([...requirementFiles, ...pointEvidenceFiles.flat()]);
            const get = (name: string, label: string) =>
              required(data, name, label);
            const bin = get("bin", "БИН");
            if (!/^\d{12}$/.test(bin))
              throw new Error("БИН должен содержать 12 цифр");
            const appealDate = get(
              "appealDate",
              "Дата возражения, жалобы, заявления",
            );
            const received = get("received", "Дата получения документа");
            const filed = state.date;
            const documentDate = appealDate;
            [appealDate, received, filed].forEach(dateObject);
            if (received > filed || filed > state.date)
              throw new Error(
                "Проверьте порядок дат: документ → получение → подача → регистрация",
              );
            const amount = 0;
            const counter =
              Math.max(
                3,
                ...state.cases.map((c) => Number(c.id.split("-").at(-1)) || 0),
              ) + 1;
            const id = `${type === "control" ? "ЖАЛ" : "ВОЗ"}-2026-${String(counter).padStart(3, "0")}`;
            const c = makeCase({
              id,
              type,
              appealType: selectedAppealType.label,
              appealNumber: get(
                "appealNumber",
                "Номер возражения, жалобы, заявления",
              ),
              appealDate,
              org: get("org", "Объект"),
              bin,
              address: get("address", "Местонахождение"),
              applicant: get("applicant", "Заявитель"),
              registered: state.date,
              filed,
              channel: get("channel", "Портал / цифровая система"),
              issuer: get("issuer", "Орган"),
              authority:
                type === "control"
                  ? "Вышестоящий орган — определить компетенцию"
                  : "Апелляционная комиссия при Министерстве финансов РК",
              document: {
                number: "",
                date: documentDate,
                received,
                name:
                  type === "notice"
                    ? "Уведомление об устранении нарушений"
                    : type === "audit"
                      ? "Аудиторский отчёт"
                      : "Акт о результатах профилактического контроля",
                appealExplained: data.get("appealExplained") !== "no",
              },
              request: get("request", "Требования"),
              amount,
              issues: Array.from({ length: pointCount }, (_, index) => {
                const pointId = `point${index + 1}`;
                const pointNumber = index + 1;
                return {
                  id: pointId,
                  number: get(
                    `pointNumber_${pointId}`,
                    `Номер пункта ${pointNumber}`,
                  ),
                  title: get(
                    `pointTitle_${pointId}`,
                    `Описание пункта ${pointNumber}`,
                  ),
                  finding: "",
                  argument: get(
                    `argument_${pointId}`,
                    `Довод заявителя по пункту ${pointNumber}`,
                  ),
                  evidence: pointEvidenceFiles[index]
                    .map((file) => file.name)
                    .join(", "),
                  disputed: true,
                  amount,
                };
              }),
            });
            c.documents = await Promise.all(
              [
                ...requirementFiles.map((file) => ({
                  file,
                  text: "Требования заявителя",
                  author: "Заявитель",
                })),
                ...pointEvidenceFiles.flatMap((files, index) =>
                  files.map((file) => ({
                    file,
                    text: `Доказательства по оспариваемому пункту ${index + 1}`,
                    author: "Заявитель",
                  })),
                ),
              ].map(async ({ file, text, author }) => ({
                name: file.name,
                filename: file.name,
                kind: "attachment",
                text,
                author,
                date: state.date,
                dataUrl: await fileDataUrl(file),
              })),
            );
            if (requirementFiles.length) {
              c.history.push({
                date: state.date,
                actor: "Заявитель",
                title: "Добавлены требования заявителя",
                text: requirementFiles.map((file) => file.name).join(", "),
              });
            }
            onSave({ ...state, cases: [...state.cases, c] }, id);
            onClose();
          } catch (cause) {
            setError(
              cause instanceof Error
                ? cause.message
                : "Не удалось создать обращение",
            );
          }
        }}
      >
        <Notice>
          Укажите реквизиты обращения и оспариваемого документа. Дата
          регистрации определяется датой учёта.
        </Notice>
        <label className="field">
          <span>Вид обращения</span>
          <select
            value={appealType}
            onChange={(event) => setAppealType(event.target.value)}
          >
            {APPEAL_TYPES.map(({ value, label }) => (
              <option value={value} key={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <div className="form-grid">
          {[
            {
              name: "org",
              label: "Наименование объекта аудита/заявителя",
              type: "text" as const,
            },
            { name: "bin", label: "БИН/ИИН", type: "text" as const },
            {
              name: "appealNumber",
              label: "Номер возражения, жалобы, заявления",
              type: "text" as const,
            },
            {
              name: "appealDate",
              label: "Дата возражения, жалобы, заявления",
              type: "date" as const,
              value: state.date,
            },
            { name: "address", label: "Местонахождение", type: "text" as const },
            { name: "applicant", label: "Представитель", type: "text" as const },
          ].map((field) => (
            <Field
              field={{ ...field, required: true }}
              key={field.name}
            />
          ))}
          <Field
            field={{
              name: "issuer",
              label: "Орган аудита (КВГА/ДВГА)",
              type: "select",
              value: "ДВГА по Атырауской области",
              options: AUDIT_ORGAN_OPTIONS.map((option) => [option, option]),
              required: true,
            }}
          />
          {[
            { name: "received", label: "Дата получения документа" },
          ].map((field) => (
            <Field
              key={field.name}
              field={{
                ...field,
                type: "date",
                value: state.date,
                required: true,
              }}
            />
          ))}
        </div>
        <Field
          field={{
            name: "channel",
            label:
              "Портал / цифровая система, по которой поступило уведомление",
            type: "select",
            value: "Веб-портал государственных закупок",
            options: CHANNEL_OPTIONS.map((option) => [option, option]),
            required: true,
          }}
        />
        <Field
          field={{
            name: "request",
            label: "Краткое описание",
            type: "textarea",
            required: true,
          }}
        />
        <label className="field">
          <span>Требования заявителя</span>
          <input
            type="file"
            name="requirementsFiles"
            accept=".pdf,.png,.jpg,.jpeg,.doc,.docx,.xls,.xlsx,.txt"
            multiple
            aria-label="Вложить файлы"
          />
          <small className="muted">
            Можно вложить несколько файлов до 2 МБ каждый.
          </small>
        </label>
        {Array.from({ length: pointCount }, (_, index) => {
          const pointId = `point${index + 1}`;
          const pointNumber = index + 1;
          return (
            <section key={pointId}>
              <h3 className="form-section">Оспариваемый пункт {pointNumber}</h3>
              <Field
                field={{
                  name: `pointNumber_${pointId}`,
                  label: "Номер пункта",
                  value: String(pointNumber),
                  type: "text",
                  required: true,
                }}
              />
              <Field
                field={{
                  name: `pointTitle_${pointId}`,
                  label: "Описание",
                  type: "text",
                  required: true,
                }}
              />
              <Field
                field={{
                  name: `argument_${pointId}`,
                  label: "Довод заявителя",
                  type: "textarea",
                  required: true,
                }}
              />
              <label className="field">
                <span>Доказательства</span>
                <input
                  type="file"
                  name={`evidenceFiles_${pointId}`}
                  accept=".pdf,.png,.jpg,.jpeg,.doc,.docx,.xls,.xlsx,.txt"
                  multiple
                  required
                />
                <small className="muted">
                  Можно вложить несколько файлов до 2 МБ каждый.
                </small>
              </label>
            </section>
          );
        })}
        <Button
          type="button"
          onClick={() => setPointCount((count) => count + 1)}
        >
          Добавить оспариваемый пункт
        </Button>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="dialog-actions">
          <Button onClick={onClose}>Отмена</Button>
          <Button primary type="submit">
            Зарегистрировать
          </Button>
        </div>
      </form>
    </Modal>
  );
}
