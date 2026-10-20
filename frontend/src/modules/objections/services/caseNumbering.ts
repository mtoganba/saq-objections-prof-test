import type { ObjectionCase } from "../../../types";

/** Код системного номера определяется видом обращения. */
export function caseNumberPrefix(appealType: string) {
  if (appealType === "Заявление") return "З";
  return appealType.startsWith("Возражение") ? "В" : "Ж";
}

/**
 * Формирует системный номер обращения.
 *
 * Порядковый номер общий для всех видов обращений: меняется только код
 * (В, Ж или З), но счётчик за год не начинается заново для каждого кода.
 */
export function nextCaseNumber(
  cases: readonly Pick<ObjectionCase, "id">[],
  appealType: string,
  currentDate: string,
) {
  const year = currentDate.slice(0, 4);
  const sequence = Math.max(
    0,
    ...cases.map((item) => {
      const match = item.id.match(new RegExp(`-${year}-(\\d+)$`));
      return match ? Number(match[1]) : 0;
    }),
  );
  return `${caseNumberPrefix(appealType)}-${year}-${String(sequence + 1).padStart(3, "0")}`;
}
