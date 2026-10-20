export const TYPES = {
  notice: "На уведомление",
  audit: "На аудиторский отчёт",
  control: "На акт о результатах",
} as const;
export const ROLES = {
  work: "Рабочий орган",
  director: "Директор ДАВГА",
  dvga: "ДВГА",
  commission: "Апелляционная комиссия",
  subject: "Объект",
  higher: "Вышестоящий орган",
} as const;
export const STATUS = {
  received: "Поступило",
  accepted: "Принято к рассмотрению",
  requested: "Запрос сформирован",
  request_approval: "Запрос на согласовании",
  request_approved: "Запрос согласован",
  materials: "Анализ материалов",
  certificate_approval: "Справка на согласовании",
  certificate_approved: "Справка согласована",
  circulated: "Позиции членов комиссии",
  hearing: "Подготовка заслушивания",
  hearing_ready: "Заслушивание",
  meeting: "Готово к заседанию",
  protocol: "Подписание протокола",
  decided: "Решение принято",
  delivered: "Результат направлен",
  completed: "Завершено",
  refused: "Отказ в рассмотрении",
  withdrawn: "Оставлено без рассмотрения",
  forwarded: "Передано по компетенции",
  paused: "Срок приостановлен",
  court: "Судебное обжалование",
} as const;
export const OUTCOMES = {
  accept: "Удовлетворить",
  partial: "Удовлетворить частично",
  reject: "Отказать в удовлетворении",
} as const;
export const CLOSED: readonly string[] = ["completed", "refused", "withdrawn"];
export const SOURCE_IDS = {
  audit: "Z1500000392",
  commission: "V2000020171",
  auditRules: "V1800016689",
  notice: "V1500012599",
  purchases: "Z2400000106",
  purchaseRules: "V2400035238",
  appk: "K2000000350",
  business: "K1500000375",
} as const;
