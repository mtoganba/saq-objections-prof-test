export function formatDate(value?: string | null): string {
  return value ? value.split("-").reverse().join(".") : "—";
}

export function formatDateTime(value?: string | null): string {
  if (!value) return "—";
  const [date, time] = value.split("T");
  return `${formatDate(date)}${time ? ` ${time}` : ""}`;
}

export function formatMoney(value: number): string {
  return (
    new Intl.NumberFormat("ru-KZ", { maximumFractionDigits: 2 }).format(value) +
    " ₸"
  );
}
