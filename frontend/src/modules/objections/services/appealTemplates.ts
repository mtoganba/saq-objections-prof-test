import type { ObjectionCase } from "../../../types";
import { formatDate } from "../../../utils/dateFormat";
import {
  auditAuthorityFullName,
  type AuditAuthorityCase,
} from "../../../utils/auditAuthority";

function value(text?: string) {
  return text?.trim() || "—";
}

function withPeriod(text: string) {
  return /[.!?]$/.test(text) ? text : `${text}.`;
}

function inlineValue(text?: string) {
  return value(text).replace(/[.]+$/, "");
}

/**
 * В старых карточках тип идентификатора не сохранялся. Для них выводится
 * прежнее обозначение, если конкретный шаблон не задаёт иной резервный тип.
 */
export function applicantIdentifierType(
  c: Pick<ObjectionCase, "applicantIdentifierType">,
  legacyFallback = "ИИН/БИН",
) {
  return c.applicantIdentifierType || legacyFallback;
}

export function applicantReference(c: ObjectionCase) {
  return `${value(c.org)}, ${applicantIdentifierType(c)} ${value(c.bin)}, № ${value(c.appealNumber)} от ${formatDate(c.appealDate || c.filed)} года`;
}

function prescriptionAuditReference(c: ObjectionCase) {
  const details = c.agendaDetails;
  return `${applicantReference(c)}, на предписание от ${formatDate(details?.relatedDocumentDate)} года № ${value(details?.relatedDocumentNumber)} по аудиторскому отчету, проведенный ${auditAuthorityTemplateName(c)}`;
}

function decisionComplaintReference(c: ObjectionCase) {
  if (c.appealType !== "Жалоба на решение КВГА/ДВГА") return undefined;

  const kind = c.agendaDetails?.decisionKind;
  const document = `от ${formatDate(c.document.date)} года № ${value(c.document.number)}, проведенный ${auditAuthorityTemplateName(c)}`;

  if (["prescription-audit", "prescription"].includes(kind || ""))
    return prescriptionAuditReference(c);

  if (kind === "prescription-preventive")
    return `${applicantReference(c)}, на предписание по акту о результате профилактического контроля ${document}`;

  if (kind === "preventive-control-act")
    return `${applicantReference(c)}, на акт о результате профилактического контроля ${document}`;

  if (kind === "quality-control")
    return `${applicantReference(c)}, на решение по результатам контроля качества ${document}`;

  if (kind === "administrative-act")
    return `${applicantReference(c)}, на административный акт ${document}`;

  return undefined;
}

function actionInactionComplaintReference(c: ObjectionCase) {
  if (c.appealType !== "Жалоба на действие/бездействие") return undefined;

  const appeals = c.agendaDetails?.actionAppealAuthorities?.filter(
    (item) => item.issuer || item.documentNumber || item.documentDate,
  ) ?? [
    {
      issuer: c.issuer,
      documentNumber: c.document.number,
      documentDate: c.document.date,
    },
  ];

  const actions = appeals
    .map(
      (item) =>
        `${auditAuthorityTemplateName(c, item.issuer)} при рассмотрении обращения №${value(item.documentNumber)} от ${formatDate(item.documentDate)}`,
    )
    .join("; ");

  const procurement = c.agendaDetails?.procurementNumber
    ? `, ${[
        `по государственной закупке № ${value(c.agendaDetails.procurementNumber)}`,
        c.agendaDetails.lotNumber
          ? `лот № ${value(c.agendaDetails.lotNumber)}`
          : "",
        c.agendaDetails.procurementSubject
          ? `предмет: ${value(c.agendaDetails.procurementSubject)}`
          : "",
      ]
        .filter(Boolean)
        .join(", ")}`
    : "";

  return `${applicantReference(c)}, касательно действий (бездействий) ${actions}${procurement}`;
}

function statementReference(c: ObjectionCase) {
  return `${applicantReference(c)} ${inlineValue(c.request)}`;
}

/**
 * В ранних обращениях значение хранилось во множественном числе. Новая форма
 * использует единственное число — оба значения должны получать один шаблон.
 */
function isNoticeObjection(c: Pick<ObjectionCase, "appealType" | "type">) {
  return (
    ["Возражение на уведомление", "Возражение на уведомления"].includes(
      c.appealType || "",
    ) ||
    (!c.appealType && c.type === "notice")
  );
}

/** Склонение названия органа определяется видом обращения. */
export function auditAuthorityTemplateName(
  c: Pick<ObjectionCase, "appealType" | "type" | "issuer">,
  issuer = c.issuer,
) {
  const appealType = c.appealType || "";
  const grammaticalCase: AuditAuthorityCase =
    isNoticeObjection(c) ||
    ["Возражение на аудиторский отчет", "Жалоба на уведомление", "Жалоба на решение КВГА/ДВГА"].includes(
      appealType,
    )
      ? "instrumental"
      : appealType === "Жалоба на действие/бездействие"
        ? "genitive"
        : "nominative";

  return auditAuthorityFullName(issuer, grammaticalCase);
}

function noticeObjectionReference(c: ObjectionCase) {
  return `${applicantReference(c)}, к уведомлению об устранении нарушений от ${formatDate(c.document.date)} года № ${value(c.document.number)}, направленного по результатам камерального контроля ${auditAuthorityTemplateName(c)}`;
}

/** Text shared by the agenda and protocol templates for the specified appeal kinds. */
export function agendaOrProtocolIntro(c: ObjectionCase) {
  if (isNoticeObjection(c))
    return `Возражение от ${noticeObjectionReference(c)}.`;

  if (c.appealType === "Заявление")
    return withPeriod(`Заявление от ${statementReference(c)}`);

  const complaintReference = decisionComplaintReference(c);
  if (complaintReference) return `Жалоба от ${complaintReference}.`;

  const actionInactionReference = actionInactionComplaintReference(c);
  if (actionInactionReference) return `Жалоба от ${actionInactionReference}.`;

  return undefined;
}

/** Standard body of the request to КВГА/ДВГА for the specified appeal kinds. */
export function requestTemplateIntro(c: ObjectionCase) {
  if (isNoticeObjection(c))
    return `В связи с поступлением на рассмотрение Апелляционной комиссии Министерства финансов Республики Казахстан возражения от ${noticeObjectionReference(c)}, просим представить мотивированный ответ по каждому доводу возражения и подтверждающие документы.`;

  if (c.appealType === "Заявление")
    return `В связи с поступлением на рассмотрение Апелляционной комиссии Министерства финансов Республики Казахстан заявления от ${statementReference(c)}, просим представить мотивированный ответ по каждому доводу возражения и подтверждающие документы.`;

  const complaintReference = decisionComplaintReference(c);
  if (complaintReference)
    return `В связи с поступлением на рассмотрение Апелляционной комиссии Министерства финансов Республики Казахстан жалобы от ${complaintReference}, просим представить мотивированный ответ по каждому доводу возражения и подтверждающие документы.`;

  const actionInactionReference = actionInactionComplaintReference(c);
  if (actionInactionReference)
    return `В связи с поступлением на рассмотрение Апелляционной комиссии Министерства финансов Республики Казахстан жалобы от ${actionInactionReference}, просим представить мотивированный ответ по каждому доводу возражения и подтверждающие документы.`;

  return undefined;
}

/** First paragraph of the certificate for the specified appeal kinds. */
export function certificateTemplateIntro(c: ObjectionCase) {
  if (isNoticeObjection(c))
    return `В Министерства финансов Республики Казахстан поступило возражение от ${noticeObjectionReference(c)}.`;

  if (c.appealType === "Заявление")
    return withPeriod(
      `В Министерство финансов Республики Казахстан поступило заявление от ${statementReference(c)}`,
    );

  const complaintReference = decisionComplaintReference(c);
  if (complaintReference)
    return `В Министерство финансов Республики Казахстан поступила жалоба от ${complaintReference}.`;

  const actionInactionReference = actionInactionComplaintReference(c);
  if (actionInactionReference)
    return `В Министерство финансов Республики Казахстан поступила жалоба от ${actionInactionReference}.`;

  return undefined;
}
