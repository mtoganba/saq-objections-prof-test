import type { ObjectionCase } from "../types";
import { STATUS, TYPES } from "../data/constants";

export function downloadFile(name: string, content: string, mime: string) {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name.replace(/[\\/:*?"<>|]/g, "-");
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function caseCsv(cases: ObjectionCase[]): string {
  const cell = (value: string) =>
    `"${(/^[=+@\-\t\r]/.test(value) ? "'" + value : value).replace(/"/g, '""')}"`;
  return (
    "\uFEFF" +
    [
      ["Номер", "Объект", "БИН", "Тип", "Статус", "Дата регистрации"],
      ...cases.map((c) => [
        c.id,
        c.org,
        c.bin,
        TYPES[c.type],
        STATUS[c.status],
        c.registered,
      ]),
    ]
      .map((row) => row.map(cell).join(";"))
      .join("\r\n")
  );
}
