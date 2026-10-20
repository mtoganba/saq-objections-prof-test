import { useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Button, Modal } from "../../../components/ui";
import type { ObjectionCase } from "../../../types";
import { formatDate } from "../../../utils/dateFormat";
import { auditAuthorityFullName } from "../../../utils/auditAuthority";

function value(text?: string) {
  return text?.trim() || "—";
}

function numbered(number?: string) {
  return `№${value(number)}`;
}

function appealReference(c: ObjectionCase, dateFirst = false) {
  const number = numbered(c.appealNumber);
  const date = formatDate(c.appealDate || c.filed);
  return dateFirst ? `от ${date} ${number}` : `${number} от ${date}`;
}

function documentReference(c: ObjectionCase) {
  return `от ${formatDate(c.document.date)} ${numbered(c.document.number)}`;
}

export function agendaItemText(c: ObjectionCase) {
  const details = c.agendaDetails;
  const appealType =
    c.appealType ??
    (c.type === "notice"
      ? "Возражение на уведомления"
      : c.type === "audit"
        ? "Возражение на аудиторский отчет"
        : "");
  const common = `${value(c.org)} ИИН/БИН ${value(c.bin)}`;
  const executor = value(c.assignee);
  const issuer = auditAuthorityFullName(c.issuer);

  if (appealType === "Возражение на уведомления") {
    return `Возражение от ${value(c.org)}, ИИН/БИН ${value(c.bin)}, № ${value(c.appealNumber)} от ${formatDate(c.appealDate || c.filed)} года, к уведомлению об устранении нарушений от ${formatDate(c.document.date)} года № ${value(c.document.number)}, направленного по результатам камерального контроля ${issuer}.`;
  }

  if (appealType === "Жалоба на уведомление") {
    return `Жалоба от ${value(c.org)}, ИИН/БИН ${value(c.bin)}, № ${value(c.appealNumber)} от ${formatDate(c.appealDate || c.filed)} года, к уведомлению об устранении нарушений от ${formatDate(c.document.date)} года № ${value(c.document.number)}, направленного по результатам камерального контроля ${issuer}.`;
  }

  if (appealType === "Возражение на аудиторский отчет") {
    return `Возражение ${appealReference(c)} ${common} на аудиторский отчет ${documentReference(c)}, проведенного ${issuer} (${executor})`;
  }

  if (appealType === "Жалоба на действие/бездействие") {
    if (!details?.procurementNumber)
      return `Жалоба ${appealReference(c)} ${common} касательно действия/бездействия ${issuer} на аудиторский отчет ${documentReference(c)}`;
    return `Жалоба ${appealReference(c)} ${common} касательно действия/бездействия ${issuer} при рассмотрении обращения ${documentReference(c)} по государственной закупке ${numbered(details.procurementNumber)} (лот ${numbered(details.lotNumber)}) на ${value(details.procurementSubject)} (${executor})`;
  }

  if (appealType === "Жалоба на решение КВГА/ДВГА") {
    const kind = details?.decisionKind;
    const related = `${numbered(details?.relatedDocumentNumber)} от ${formatDate(details?.relatedDocumentDate)}`;
    if (kind === "prescription-audit" || kind === "prescription")
      return `Жалоба ${appealReference(c)} ${common} на предписание ${issuer} ${documentReference(c)} по аудиторскому отчету ${related}`;
    if (kind === "prescription-preventive")
      return `Жалоба ${appealReference(c)} ${common} на предписание ${issuer} ${documentReference(c)} по профилактическому контролю ${related}`;
    if (kind === "administrative-act")
      return `Жалоба ${appealReference(c)} ${common} на административный акт ${issuer} ${documentReference(c)}`;
    return `Жалоба ${appealReference(c)} ${common} по результатам контроля качества ${issuer} ${documentReference(c)}`;
  }

  if (appealType === "Жалоба на акт о результате профилактического контроля")
    return `Жалоба ${appealReference(c)} ${common} на акт о результате профилактического контроля ${issuer} ${documentReference(c)}`;

  if (appealType === "Заявление")
    return `Заявление ${appealReference(c)} ${common} ${value(c.request)}.`;

  return `${value(appealType)} ${appealReference(c)} ${common}`;
}

export function AgendaDocument({
  cases,
  meetingDate,
}: {
  cases: ObjectionCase[];
  meetingDate: string;
}) {
  return (
    <article className="print-document agenda-template">
      <h1>
        Қазақстан Республикасының Қаржы министрлігінің апелляциялық
        <br />
        комиссиясының {formatDate(meetingDate)} жылға күн тәртібіндегі
        <br />
        қарастырылатын материалдар тізімі
      </h1>
      <ol>
        {cases.map((c) => (
          <li key={c.id}>{agendaItemText(c)}</li>
        ))}
      </ol>
    </article>
  );
}

export function agendaDocumentHtml(cases: ObjectionCase[], meetingDate: string) {
  const content = renderToStaticMarkup(
    <AgendaDocument cases={cases} meetingDate={meetingDate} />,
  );
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>Повестка дня</title><style>
    @page { size: A4; margin: 22mm 18mm; }
    * { box-sizing: border-box; }
    body { margin: 0; padding: 24px; color: #111; background: #edf3f6; }
    .agenda-template { width: 100%; max-width: 210mm; min-height: 297mm; margin: 0 auto; padding: 30mm 26mm; background: #fff; font-family: "Times New Roman", Times, serif; font-size: 16pt; line-height: 1.2; }
    .agenda-template h1 { margin: 0 0 18mm; text-align: center; font-size: 16pt; line-height: 1.12; font-weight: 700; }
    .agenda-template ol { margin: 0; padding-left: 12mm; }
    .agenda-template li { padding-left: 4mm; text-align: justify; }
    @media print { body { padding: 0; background: #fff; } .agenda-template { min-height: 0; padding: 0; } }
  </style></head><body>${content}</body></html>`;
}

export default function AgendaModal({
  cases,
  date,
  onSend,
  onClose,
}: {
  cases: ObjectionCase[];
  date: string;
  onSend: (meetingDate: string) => void;
  onClose: () => void;
}) {
  const [meetingDate, setMeetingDate] = useState(date);
  const [error, setError] = useState("");
  const print = () => {
    const popup = window.open("", "_blank");
    if (!popup) {
      setError(
        "Браузер заблокировал окно печати. Разрешите всплывающие окна и повторите попытку.",
      );
      return;
    }
    popup.document.write(agendaDocumentHtml(cases, meetingDate));
    popup.document.close();
    popup.focus();
    popup.print();
  };
  return (
    <Modal title="Сформировать повестку дня" onClose={onClose} wide>
      <label className="field agenda-date-field">
        <span>Дата заседания</span>
        <input
          type="date"
          value={meetingDate}
          onChange={(event) => setMeetingDate(event.target.value)}
          required
        />
      </label>
      <div className="agenda-print-preview">
        <AgendaDocument cases={cases} meetingDate={meetingDate} />
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="dialog-actions">
        <Button onClick={onClose}>Закрыть</Button>
        <Button primary onClick={print}>
          Печать / PDF
        </Button>
        <Button primary onClick={() => onSend(meetingDate)}>
          Направить АК
        </Button>
      </div>
    </Modal>
  );
}
