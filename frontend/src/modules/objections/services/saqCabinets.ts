import type { ObjectionCase, Role } from "../../../types";

/**
 * Демонстрационный реестр кабинетов заявителей SAQ.
 * В промышленной версии список должен поступать из сервиса учётных записей
 * SAQ по БИН/ИИН, а не определяться по каналу поступления обращения.
 */
const SUBJECT_SAQ_CABINET_IDENTIFIERS = new Set([
  "111111111111",
  "000000000002",
  "000000000003",
  "001002003004",
]);

const SUBJECT_2_IDENTIFIER = "001002003004";

function normalizedIdentifier(identifier?: string) {
  return (identifier || "").replace(/\D/g, "");
}

export function isSubjectRole(role: Role) {
  return role === "subject" || role === "subject2";
}

/** Определяет кабинет SAQ по БИН/ИИН физического или юридического лица. */
export function subjectRoleForIdentifier(identifier?: string): "subject" | "subject2" {
  return normalizedIdentifier(identifier) === SUBJECT_2_IDENTIFIER
    ? "subject2"
    : "subject";
}

/** Определяет кабинет заявителя по его БИН/ИИН. */
export function subjectRoleForCase(c: Pick<ObjectionCase, "bin">) {
  return subjectRoleForIdentifier(c.bin);
}

export function subjectCabinetName(c: Pick<ObjectionCase, "bin">) {
  return subjectRoleForCase(c) === "subject2" ? "Объект №2" : "Объект";
}

export function hasSubjectSaqCabinet(c: Pick<ObjectionCase, "bin">) {
  return hasSaqCabinetForIdentifier(c.bin);
}

/** Проверяет наличие кабинета SAQ независимо от роли лица в обращении. */
export function hasSaqCabinetForIdentifier(identifier?: string) {
  return SUBJECT_SAQ_CABINET_IDENTIFIERS.has(normalizedIdentifier(identifier));
}

export function subjectSaqCabinetLabel(c: Pick<ObjectionCase, "bin" | "applicantIdentifierType">) {
  const identifierType = c.applicantIdentifierType || "БИН";
  const identifier = c.bin || "не указан";
  return hasSubjectSaqCabinet(c)
    ? `Кабинет заявителя SAQ доступен (${identifierType}: ${identifier}).`
    : `Кабинет заявителя SAQ не зарегистрирован (${identifierType}: ${identifier}).`;
}
