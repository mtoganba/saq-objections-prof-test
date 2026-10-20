export const STEPS = [
  ["received", "Приём"],
  ["accepted", "Запрос"],
  ["materials", "Анализ обращения"],
  ["commission_voting", "Заседание"],
  ["meeting", "Решение"],
  ["delivered", "Исполнение"],
] as const;
export const CONTROL_STEPS = STEPS;
