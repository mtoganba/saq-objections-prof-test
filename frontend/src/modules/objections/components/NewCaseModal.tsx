import { useRef, useState } from "react";
import { Button, Modal, Notice } from "../../../components/ui";
import { makeCase } from "../../../data/objections";
import type { CaseType, DemoState } from "../../../types";
import { dateObject } from "../services/deadlines";
import { required } from "../services/workflow";
import { Field } from "./ActionModal";

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

function formatFileSize(bytes: number) {
  if (bytes < 1024 * 1024)
    return `${Math.max(1, Math.round(bytes / 1024))} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} МБ`;
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
    label: "Возражение на уведомление",
    caseType: "notice",
  },
  {
    value: "notice-complaint",
    label: "Жалоба на уведомление",
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
  const [pointIds, setPointIds] = useState(["point1"]);
  const nextPointId = useRef(2);
  const [collapsedPoints, setCollapsedPoints] = useState<Set<string>>(
    () => new Set(),
  );
  const [pointEvidenceFilesByPoint, setPointEvidenceFiles] = useState<
    Record<string, File[]>
  >({});
  const [requirementFiles, setRequirementFiles] = useState<File[]>([]);
  const evidenceInputs = useRef<Record<string, HTMLInputElement | null>>({});
  const requirementsInput = useRef<HTMLInputElement | null>(null);
  const [hasProcurement, setHasProcurement] = useState(true);
  const [decisionKind, setDecisionKind] = useState<
    | "prescription-audit"
    | "prescription-preventive"
    | "quality-control"
    | "administrative-act"
  >("prescription-audit");
  const [error, setError] = useState("");
  const selectedAppealType =
    APPEAL_TYPES.find((item) => item.value === appealType) ?? APPEAL_TYPES[0];
  const type = selectedAppealType.caseType;
  const isNoticeComplaint = appealType === "notice-complaint";
  const isNotice = appealType === "notice-objection" || isNoticeComplaint;
  const isAudit = appealType === "audit-objection";
  const isActionComplaint = appealType === "action-inaction-complaint";
  const isDecisionComplaint = appealType === "kvga-dvga-decision-complaint";
  const isPreventiveComplaint =
    appealType === "preventive-control-complaint";
  const needsAgendaTemplateFields =
    isNotice ||
    isAudit ||
    isActionComplaint ||
    isDecisionComplaint ||
    isPreventiveComplaint;
  const sourceDocumentLabel = isNotice
    ? "Уведомление об устранении нарушений"
      : isAudit
        ? "Аудиторский отчет"
        : isActionComplaint
        ? hasProcurement
          ? "Обращение, по которому обжалуется действие/бездействие"
          : "Аудиторский отчет"
        : isDecisionComplaint
          ? decisionKind === "quality-control"
            ? "Результат контроля качества"
            : decisionKind === "administrative-act"
              ? "Административный акт"
              : "Предписание"
          : isPreventiveComplaint
            ? "Акт о результате профилактического контроля"
            : "Оспариваемый документ";
  const sourceDocumentNumberLabel = isActionComplaint
    ? "Номер первичного обращения в ДВГА/КВГА"
    : `Номер: ${sourceDocumentLabel}`;
  const sourceDocumentDateLabel = isActionComplaint
    ? "Дата первичного обращения в ДВГА/КВГА"
    : `Дата: ${sourceDocumentLabel}`;
  const applicantNameLabel = isNoticeComplaint
    ? "Наименование объекта заявителя"
    : "Наименование объекта аудита/заявителя";
  const applicantBinLabel = isNoticeComplaint ? "БИН/ИИН заявителя" : "БИН/ИИН";
  const updateRequirementFiles = (files: File[]) => {
    if (!files.length) return;
    setRequirementFiles((current) => {
      const next = [...current, ...files];
      const input = requirementsInput.current;
      if (input) {
        const dataTransfer = new DataTransfer();
        next.forEach((file) => dataTransfer.items.add(file));
        input.files = dataTransfer.files;
      }
      return next;
    });
  };
  const updatePointEvidenceFiles = (pointId: string, files: File[]) => {
    if (!files.length) return;
    setPointEvidenceFiles((current) => {
      const nextFiles = [...(current[pointId] || []), ...files];
      const input = evidenceInputs.current[pointId];
      if (input) {
        const dataTransfer = new DataTransfer();
        nextFiles.forEach((file) => dataTransfer.items.add(file));
        input.files = dataTransfer.files;
      }
      return { ...current, [pointId]: nextFiles };
    });
  };
  const removePoint = (pointId: string) => {
    setPointIds((current) => current.filter((id) => id !== pointId));
    setCollapsedPoints((current) => {
      const next = new Set(current);
      next.delete(pointId);
      return next;
    });
    setPointEvidenceFiles((current) => {
      const { [pointId]: _, ...rest } = current;
      return rest;
    });
    delete evidenceInputs.current[pointId];
  };
  return (
    <Modal title="Новое тестовое обращение" onClose={onClose}>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          try {
            const data = new FormData(event.currentTarget);
            const pointEvidenceFiles = pointIds.map((pointId, index) => {
              const files = pointEvidenceFilesByPoint[pointId] || [];
              if (!files.length)
                throw new Error(
                  `Вложите доказательства по пункту ${index + 1}`,
                );
              return files;
            });
            const get = (name: string, label: string) =>
              required(data, name, label);
            const bin = get("bin", applicantBinLabel);
            if (!/^\d{12}$/.test(bin))
              throw new Error(`${applicantBinLabel} должен содержать 12 цифр`);
            const appealDate = get(
              "appealDate",
              "Дата возражения, жалобы, заявления",
            );
            const received = get("received", "Дата получения документа");
            const filed = state.date;
            const documentDate = needsAgendaTemplateFields
              ? get("documentDate", sourceDocumentDateLabel)
              : appealDate;
            [appealDate, received, filed, documentDate].forEach(dateObject);
            const amount = isNotice
              ? Number(get("amount", "Сумма, тенге"))
              : 0;
            if (!Number.isFinite(amount) || amount < 0)
              throw new Error("Сумма должна быть неотрицательным числом");
            const customerBin = isNotice
              ? get("customerBin", "БИН заказчика")
              : "";
            if (isNotice && !/^\d{12}$/.test(customerBin))
              throw new Error("БИН заказчика должен содержать 12 цифр");
            const auditObjectBin = isNoticeComplaint
              ? get("auditObjectBin", "БИН/ИИН объекта аудита")
              : "";
            if (isNoticeComplaint && !/^\d{12}$/.test(auditObjectBin))
              throw new Error("БИН/ИИН объекта аудита должен содержать 12 цифр");
            const numberPrefix =
              selectedAppealType.label === "Заявление"
                ? "З"
                : selectedAppealType.label.startsWith("Возражение")
                  ? "В"
                  : "Ж";
            const year = filed.slice(0, 4);
            const counter =
              Math.max(
                0,
                ...state.cases.map((item) => {
                  const match = item.id.match(
                    new RegExp(`^${numberPrefix}-${year}-(\\d+)$`),
                  );
                  return match ? Number(match[1]) : 0;
                }),
              ) + 1;
            const id = `${numberPrefix}-${year}-${String(counter).padStart(3, "0")}`;
            const c = makeCase({
              id,
              type,
              appealType: selectedAppealType.label,
              appealNumber: get(
                "appealNumber",
                "Номер возражения, жалобы, заявления",
              ),
              appealDate,
              org: get("org", applicantNameLabel),
              bin,
              address: get("address", "Местонахождение"),
              applicant: String(data.get("applicant") || "").trim(),
              registered: state.date,
              filed,
              channel: get("channel", "Портал / цифровая система"),
              issuer: get("issuer", "Орган"),
              authority:
                type === "control"
                  ? "Вышестоящий орган — определить компетенцию"
                  : "Апелляционная комиссия при Министерстве финансов РК",
              document: {
                number: needsAgendaTemplateFields
                  ? get("documentNumber", sourceDocumentNumberLabel)
                  : "",
                date: documentDate,
                received,
                name: needsAgendaTemplateFields
                  ? sourceDocumentLabel
                  : "Акт о результатах профилактического контроля",
                appealExplained: data.get("appealExplained") !== "no",
              },
              agendaDetails: {
                ...(isNotice
                  ? {
                      procurementMethod: get(
                        "procurementMethod",
                        "Способ закупки",
                      ),
                      customerName: get(
                        "customerName",
                        "Наименование заказчика",
                      ),
                      customerBin,
                      ...(isNoticeComplaint && {
                        auditObjectName: get(
                          "auditObjectName",
                          "Наименование объекта аудита",
                        ),
                        auditObjectBin,
                      }),
                    }
                  : {}),
                ...(isActionComplaint && hasProcurement
                  ? {
                      procurementNumber: get("procurementNumber", "Номер закупки"),
                      lotNumber: get("lotNumber", "Номер лота"),
                      procurementSubject: get(
                        "procurementSubject",
                        "Предмет государственной закупки",
                      ),
                    }
                  : {}),
                ...(isDecisionComplaint
                  ? {
                      decisionKind,
                      ...((decisionKind === "prescription-audit" ||
                        decisionKind === "prescription-preventive") && {
                        relatedDocumentNumber: get(
                          "relatedDocumentNumber",
                          decisionKind === "prescription-audit"
                            ? "Номер аудиторского отчета"
                            : "Номер профилактического контроля",
                        ),
                        relatedDocumentDate: get(
                          "relatedDocumentDate",
                          decisionKind === "prescription-audit"
                            ? "Дата подписания аудиторского отчета"
                            : "Дата подписания профилактического контроля",
                        ),
                      }),
                    }
                  : {}),
              },
              request: get("request", "Требования"),
              amount,
              issues: pointIds.map((pointId, index) => {
                const defaultPointNumber = index + 1;
                const pointNumber = get(
                  `pointNumber_${pointId}`,
                  `Номер пункта ${defaultPointNumber}`,
                );
                return {
                  id: pointId,
                  number: pointNumber,
                  title: get(
                    `pointTitle_${pointId}`,
                    `Описание пункта ${defaultPointNumber}`,
                  ),
                  finding: "",
                  argument: get(
                    `argument_${pointId}`,
                    `Довод заявителя по пункту ${defaultPointNumber}`,
                  ),
                  evidence: pointEvidenceFiles[index]
                    .map((file) => file.name)
                    .join(", "),
                  disputed: true,
                  amount: 0,
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
            const next = { ...state, cases: [...state.cases, c] };
            if (c.status === "received") {
              next.notifications = [
                ...state.notifications,
                {
                  id: `notification-${c.id}-${state.notifications.length + 1}`,
                  caseId: c.id,
                  recipient: "Директор ДАВГА",
                  date: state.date,
                  read: false,
                  text: `Поступило обращение №${c.appealNumber || c.id} от ${appealDate}. Выберите исполнителя рабочего органа.`,
                },
              ];
            }
            onSave(next, id);
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
              label: applicantNameLabel,
              type: "text" as const,
            },
            { name: "bin", label: applicantBinLabel, type: "text" as const },
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
            ...(isNoticeComplaint
              ? [
                  {
                    name: "auditObjectName",
                    label: "Наименование объекта аудита",
                    type: "text" as const,
                  },
                  {
                    name: "auditObjectBin",
                    label: "БИН/ИИН",
                    type: "text" as const,
                  },
                ]
              : []),
          ].map((field) => (
            <Field
              field={{ ...field, required: field.name !== "applicant" }}
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
        {needsAgendaTemplateFields && (
          <>
            <div className="form-grid">
              <Field
                field={{
                  name: "documentNumber",
                  label: sourceDocumentNumberLabel,
                  type: "text",
                  required: true,
                }}
              />
              <Field
                field={{
                  name: "documentDate",
                  label: sourceDocumentDateLabel,
                  type: "date",
                  value: state.date,
                  required: true,
                }}
              />
              {isNotice && (
                <>
                  <Field
                    field={{
                      name: "amount",
                      label: "Сумма, тенге",
                      type: "number",
                      min: "0",
                      required: true,
                    }}
                  />
                  <Field
                    field={{
                      name: "procurementMethod",
                      label: "Способ закупки",
                      type: "select",
                      options: [
                        ["конкурс", "конкурс"],
                        ["аукцион", "аукцион"],
                        ["запрос ценовых предложений", "запрос ценовых предложений"],
                        ["рейтингово-балльная система", "рейтингово-балльная система"],
                        ["из одного источника", "из одного источника"],
                        ["товарная биржа", "товарная биржа"],
                      ],
                      required: true,
                    }}
                  />
                  <Field
                    field={{
                      name: "customerName",
                      label: "Наименование заказчика",
                      type: "text",
                      required: true,
                    }}
                  />
                  <Field
                    field={{
                      name: "customerBin",
                      label: "БИН заказчика",
                      type: "text",
                      required: true,
                    }}
                  />
                </>
              )}
            </div>
          </>
        )}
        {isActionComplaint && (
          <section>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={hasProcurement}
                onChange={(event) => setHasProcurement(event.target.checked)}
              />
              Связано с государственной закупкой
            </label>
            {hasProcurement && (
              <div className="form-grid">
                <Field
                  field={{
                    name: "procurementNumber",
                    label: "Номер государственной закупки",
                    type: "text",
                    required: true,
                  }}
                />
                <Field
                  field={{
                    name: "lotNumber",
                    label: "Номер лота",
                    type: "text",
                    required: true,
                  }}
                />
                <Field
                  field={{
                    name: "procurementSubject",
                    label: "Предмет государственной закупки",
                    type: "text",
                    required: true,
                  }}
                />
              </div>
            )}
          </section>
        )}
        {isDecisionComplaint && (
          <>
            <label className="field">
              <span>Вид обжалуемого решения</span>
              <select
                value={decisionKind}
                onChange={(event) =>
                  setDecisionKind(
                    event.target.value as
                      | "prescription-audit"
                      | "prescription-preventive"
                      | "quality-control"
                      | "administrative-act",
                  )
                }
              >
                <option value="prescription-audit">
                  Предписание на аудиторский отчет
                </option>
                <option value="prescription-preventive">
                  Предписание по профилактическому контролю
                </option>
                <option value="quality-control">Контроль качества</option>
                <option value="administrative-act">Административный акт</option>
              </select>
            </label>
            {(decisionKind === "prescription-audit" ||
              decisionKind === "prescription-preventive") && (
              <div className="form-grid">
                <Field
                  field={{
                    name: "relatedDocumentNumber",
                    label:
                      decisionKind === "prescription-audit"
                        ? "Номер аудиторского отчета"
                        : "Номер профилактического контроля",
                    type: "text",
                    required: true,
                  }}
                />
                <Field
                  field={{
                    name: "relatedDocumentDate",
                    label:
                      decisionKind === "prescription-audit"
                        ? "Дата подписания аудиторского отчета"
                        : "Дата подписания профилактического контроля",
                    type: "date",
                    value: state.date,
                    required: true,
                  }}
                />
              </div>
            )}
          </>
        )}
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
        <small className="muted">
          При выборе «SAQ» обращение сначала поступает директору ДАВГА для
          назначения исполнителя рабочего органа.
        </small>
        <Field
          field={{
            name: "request",
            label: appealType === "statement" ? "О чем заявление" : "Краткое описание",
            type: "textarea",
            required: true,
          }}
        />
        <div className="point-evidence-field">
          <span>Требования заявителя</span>
          <label
            className="point-evidence-dropzone"
            htmlFor="requirementsFiles"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              updateRequirementFiles(Array.from(event.dataTransfer.files));
            }}
          >
            <span className="point-evidence-icon" aria-hidden="true">📎</span>
            <span className="point-evidence-copy">
              Перетащите файлы сюда или выберите на компьютере
            </span>
            <span className="point-evidence-button">Выбрать файлы</span>
          </label>
          <input
            ref={requirementsInput}
            id="requirementsFiles"
            className="point-evidence-input"
            type="file"
            name="requirementsFiles"
            multiple
            aria-label="Вложить файлы"
            onClick={(event) => event.stopPropagation()}
            
            onChange={(event) =>
              updateRequirementFiles(Array.from(event.target.files ?? []))
            }
          />
          {requirementFiles.length ? (
            <span className="point-evidence-files">
              {requirementFiles.map((file, fileIndex) => (
                <span
                  className="point-evidence-file"
                  key={`${file.name}-${file.lastModified}-${fileIndex}`}
                >
                  <span className="point-evidence-file-info">
                    <strong>{file.name}</strong>
                    <small>{formatFileSize(file.size)}</small>
                  </span>
                  <Button
                    className="point-evidence-remove"
                    type="button"
                    aria-label={`Удалить файл ${file.name}`}
                    onClick={() =>
                      setRequirementFiles((current) => {
                        const next = current.filter((_, index) => index !== fileIndex);
                        const input = requirementsInput.current;
                        if (input) {
                          const dataTransfer = new DataTransfer();
                          next.forEach((item) => dataTransfer.items.add(item));
                          input.files = dataTransfer.files;
                        }
                        return next;
                      })
                    }
                  >
                    ×
                  </Button>
                </span>
              ))}
            </span>
          ) : null}
        </div>
        <p className="disputed-points-hint">
          Добавьте все пункты, с которыми заявитель не согласен. Поля со *
          обязательны.
        </p>
        {pointIds.map((pointId, index) => {
          const pointNumber = index + 1;
          const isCollapsed = collapsedPoints.has(pointId);
          return (
            <section className="disputed-point-form-card" key={pointId}>
              <div className="disputed-point-form-head">
                <h3>Оспариваемый пункт</h3>
                <label className="point-number-field">
                  <span>№ пункта</span>
                  <input
                    name={`pointNumber_${pointId}`}
                    type="text"
                    defaultValue={String(pointNumber)}
                    required
                    aria-label={`Номер пункта ${pointNumber}`}
                  />
                </label>
                <div className="point-card-actions">
                  <Button
                    className="point-card-icon-button"
                    type="button"
                    aria-expanded={!isCollapsed}
                    aria-label={
                      isCollapsed
                        ? `Развернуть пункт ${pointNumber}`
                        : `Свернуть пункт ${pointNumber}`
                    }
                    onClick={() =>
                      setCollapsedPoints((current) => {
                        const next = new Set(current);
                        if (next.has(pointId)) next.delete(pointId);
                        else next.add(pointId);
                        return next;
                      })
                    }
                  >
                    <span aria-hidden="true">{isCollapsed ? "⌄" : "⌃"}</span>
                  </Button>
                  {pointIds.length > 1 && (
                    <Button
                      className="point-card-icon-button point-delete-button"
                      type="button"
                      aria-label={`Удалить пункт ${pointNumber}`}
                      onClick={() => removePoint(pointId)}
                    >
                      <span aria-hidden="true">×</span>
                    </Button>
                  )}
                </div>
              </div>
              <div
                className="disputed-point-form-body"
                hidden={isCollapsed}
                aria-hidden={isCollapsed}
              >
                <Field
                  field={{
                    name: `pointTitle_${pointId}`,
                    label: "Описание оспариваемого вопроса",
                    type: "textarea",
                    required: true,
                  }}
                />
                <Field
                  field={{
                    name: `argument_${pointId}`,
                    label: "Довод заявителя",
                    type: "textarea",
                    placeholder:
                      "Укажите, с чем заявитель не согласен и почему",
                    required: true,
                  }}
                />
                <div className="point-evidence-field">
                  <span>Доказательства</span>
                  <label
                    className="point-evidence-dropzone"
                    htmlFor={`evidenceFiles_${pointId}`}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => {
                      event.preventDefault();
                      updatePointEvidenceFiles(
                        pointId,
                        Array.from(event.dataTransfer.files),
                      );
                    }}
                  >
                    <span className="point-evidence-icon" aria-hidden="true">
                      📎
                    </span>
                    <span className="point-evidence-copy">
                      Перетащите файлы сюда или выберите на компьютере
                    </span>
                    <span className="point-evidence-button">Выбрать файлы</span>
                  </label>
                  <input
                    ref={(element) => {
                      evidenceInputs.current[pointId] = element;
                    }}
                    id={`evidenceFiles_${pointId}`}
                    className="point-evidence-input"
                    type="file"
                    name={`evidenceFiles_${pointId}`}
                    multiple
                    required
                    onClick={(event) => event.stopPropagation()}
                    
                    onChange={(event) =>
                      updatePointEvidenceFiles(
                        pointId,
                        Array.from(event.target.files ?? []),
                      )
                    }
                  />
                  {pointEvidenceFilesByPoint[pointId]?.length ? (
                    <span className="point-evidence-files">
                      {pointEvidenceFilesByPoint[pointId].map((file, fileIndex) => (
                        <span
                          className="point-evidence-file"
                          key={`${file.name}-${file.lastModified}-${fileIndex}`}
                        >
                          <span className="point-evidence-file-info">
                            <strong>{file.name}</strong>
                            <small>{formatFileSize(file.size)}</small>
                          </span>
                          <Button
                            className="point-evidence-remove"
                            type="button"
                            aria-label={`Удалить файл ${file.name}`}
                            onClick={() =>
                              updatePointEvidenceFiles(
                                pointId,
                                pointEvidenceFilesByPoint[pointId].filter(
                                  (_, index) => index !== fileIndex,
                                ),
                              )
                            }
                          >
                            ×
                          </Button>
                        </span>
                      ))}
                    </span>
                  ) : null}
                </div>
              </div>
            </section>
          );
        })}
        <Button
          className="add-disputed-point-button"
          type="button"
          onClick={() =>
            setPointIds((current) => [
              ...current,
              `point${nextPointId.current++}`,
            ])
          }
        >
          <span aria-hidden="true">＋</span>
          Добавить пункт
        </Button>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="dialog-actions new-case-actions">
          <Button onClick={onClose}>Отмена</Button>
          <Button primary type="submit">
            Зарегистрировать
          </Button>
        </div>
      </form>
    </Modal>
  );
}
