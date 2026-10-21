export const PREVENTIVE_CONTROL_ACT_OBJECTION =
  "Возражение на акт о результате профилактического контроля";
export const PREVENTIVE_CONTROL_PRESCRIPTION_OBJECTION =
  "Возражение на предписание по профилактическому контролю";

export const PREVENTIVE_CONTROL_OBJECTION_TYPES = [
  PREVENTIVE_CONTROL_ACT_OBJECTION,
  PREVENTIVE_CONTROL_PRESCRIPTION_OBJECTION,
] as const;

export function preventiveControlSourceDocumentLabels(appealType?: string | null) {
  const type = (appealType || "").trim();
  if (type === PREVENTIVE_CONTROL_ACT_OBJECTION)
    return {
      name: "Акт о результате профилактического контроля",
      number: "Номер акта о результате",
      date: "Дата акта о результате",
      reference: "акт о результате профилактического контроля",
    };
  if (type === PREVENTIVE_CONTROL_PRESCRIPTION_OBJECTION)
    return {
      name: "Предписание по профилактическому контролю",
      number: "Номер предписания",
      date: "Дата предписания",
      reference: "предписание по профилактическому контролю",
    };
  return undefined;
}

export function isPreventiveControlObjectionType(
  appealType?: string | null,
): boolean {
  const type = (appealType || "").trim();
  return PREVENTIVE_CONTROL_OBJECTION_TYPES.some((item) => item === type);
}

const PREVENTIVE_CONTROL_COMMISSION_ACCESS_STATUSES = new Set([
  "certificate_approved",
  "documents_review",
  "commission_members",
  "commission_voting",
  "circulated",
  "meeting_certificate_approval",
  "meeting_certificate_signed",
  "meeting_certificate_approved",
  "meeting",
  "protocol",
  "decision_project",
  "decision_project_approval",
  "decision_project_signed",
  "decision_project_delivery",
  "decision_project_comments",
  "decision_project_eotinish",
  "decision_project_hearing",
  "decided",
  "final_response_approval",
  "final_response_signed",
  "final_response_delivery",
  "delivered",
  "completed",
  "withdrawn",
  "refused",
  "court",
]);

/** Materials become visible to the whole committee once the case reaches its meeting stage. */
export function preventiveControlMaterialsOpen(
  appealType: string | null | undefined,
  status: string,
  resumeStatus?: string,
): boolean {
  const currentStatus = status === "paused" ? resumeStatus : status;
  return (
    isPreventiveControlObjectionType(appealType) &&
    Boolean(
      currentStatus &&
        PREVENTIVE_CONTROL_COMMISSION_ACCESS_STATUSES.has(currentStatus),
    )
  );
}

/** These objections use the same post-analysis route as a statement. */
export function usesStatementReviewScenario(
  appealType?: string | null,
): boolean {
  return (
    (appealType || "").trim() === "Заявление" ||
    isPreventiveControlObjectionType(appealType)
  );
}

export function requiresMotivatedResponseType(
  appealType?: string | null,
): boolean {
  const type = (appealType || "").trim();
  return (
    type.startsWith("Жалоба") ||
    usesStatementReviewScenario(type) ||
    [
      "Возражение на аудиторский отчет",
      "Возражение на аудиторский отчёт",
    ].includes(type)
  );
}
