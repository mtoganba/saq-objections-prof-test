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
