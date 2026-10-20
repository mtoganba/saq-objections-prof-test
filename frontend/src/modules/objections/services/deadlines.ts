import type { ObjectionCase } from "../../../types";
export const holidays = ["2026-08-31", "2026-10-26", "2026-12-16"];
export function dateObject(s: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s || ""))
    throw Error("Укажите корректную дату");
  const d = new Date(s + "T12:00:00Z");
  if (!Number.isFinite(d.valueOf()) || d.toISOString().slice(0, 10) !== s)
    throw Error("Укажите корректную дату");
  return d;
}
export function iso(d: Date) {
  return d.toISOString().slice(0, 10);
}
export function isWorkday(s: string) {
  const d = dateObject(s);
  return ![0, 6].includes(d.getUTCDay()) && !holidays.includes(s);
}
export function addWorkdays(s: string, n: number) {
  const d = dateObject(s);
  if (n < 0 || !Number.isInteger(n)) throw Error("Неверный срок");
  let left = n;
  while (left) {
    d.setUTCDate(d.getUTCDate() + 1);
    if (isWorkday(iso(d))) left--;
  }
  return iso(d);
}
export function workdaysBetween(a: string, b: string): number {
  if (b < a) return -workdaysBetween(b, a);
  let n = 0;
  const d = dateObject(a);
  while (iso(d) < b) {
    d.setUTCDate(d.getUTCDate() + 1);
    if (isWorkday(iso(d))) n++;
  }
  return n;
}
export function addMonths(s: string, n: number) {
  const d = dateObject(s),
    day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + n);
  const limit = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0),
  ).getUTCDate();
  d.setUTCDate(Math.min(day, limit));
  while (!isWorkday(iso(d))) d.setUTCDate(d.getUTCDate() + 1);
  return iso(d);
}
export function filingDeadline(c: ObjectionCase) {
  return c.type === "control"
    ? addMonths(
        c.document.received,
        c.document.appealExplained === false ? 6 : 3,
      )
    : addWorkdays(c.document.received, c.type === "audit" ? 10 : 5);
}

export function reviewDuration(c: ObjectionCase) {
  if (c.appealType === "Возражение на аудиторский отчет") return 30;
  if (c.appealType === "Жалоба на действие/бездействие") return 20;
  if (c.appealType === "Заявление") return 15;
  if (
    (c.appealType === "Возражение на уведомления" ||
      c.type === "notice") &&
    c.channel === "Веб-портал государственных закупок"
  )
    return 15;
  return 30;
}

export function reviewDeadline(c: ObjectionCase) {
  let d = addWorkdays(c.document.received, reviewDuration(c));
  if (c.extensionDays) d = addWorkdays(d, c.extensionDays);
  if (c.pauseDays) d = addWorkdays(d, c.pauseDays);
  return d;
}
