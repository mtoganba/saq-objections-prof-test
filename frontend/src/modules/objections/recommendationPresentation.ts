import { ROLES } from "../../data/constants";
import type { CaseRecommendation, Role } from "../../types";

export const RECOMMENDATION_STATUS_LABELS: Record<CaseRecommendation["status"], string> = {
  approval: "На согласовании",
  signature: "На подписании",
  sent: "Направлена",
  answered: "Ответ получен",
  acceptance_approval: "Принятие на согласовании",
  acceptance_signature: "Принятие на подписании",
  return_approval: "Возврат на согласовании",
  return_signature: "Возврат на подписании",
  executed: "Исполнена",
  returned: "Возвращена на доработку",
};

export function recommendationStatusTone(status: CaseRecommendation["status"]) {
  if (status === "executed") return "green";
  if (["returned", "return_approval", "return_signature"].includes(status)) return "amber";
  return "blue";
}

export function recommendationRecipientRole(recommendation: CaseRecommendation): Role | undefined {
  if (recommendation.recipientRole) return recommendation.recipientRole;
  const roles: Record<string, Role> = {
    ДВГА: "dvga", "Кабинет ДВГА": "dvga", КВГА: "kvga", "Кабинет КВГА": "kvga",
    Объект: "subject", "Кабинет Объекта": "subject",
    "Вышестоящий орган": "higher", "Кабинет вышестоящего органа": "higher",
  };
  return roles[recommendation.recipient];
}

export function recommendationStatusLabel(recommendation: CaseRecommendation, role: Role) {
  if (role === recommendationRecipientRole(recommendation)) {
    if (recommendation.status === "sent") return "На исполнении";
    if (recommendation.status === "answered") return "Ответ направлен";
  }
  if (recommendation.channel === "external" && recommendation.status === "sent")
    return "Направлена через другую систему";
  return RECOMMENDATION_STATUS_LABELS[recommendation.status];
}

export function visibleForRole(recommendation: CaseRecommendation, role: Role) {
  if (role === "demo-superuser" || role === "work") return true;
  if (role === "deputy") return ["approval", "acceptance_approval", "return_approval"].includes(recommendation.status);
  if (role === "director") return ["signature", "acceptance_signature", "return_signature"].includes(recommendation.status);
  return ["sent", "answered", "returned", "executed"].includes(recommendation.status) &&
    (recommendationRecipientRole(recommendation) === role || recommendation.recipient === ROLES[role]);
}
