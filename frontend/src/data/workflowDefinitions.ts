export const STEPS = [
  ["received", "Поступление"],
  ["accepted", "Допустимость и компетенция"],
  ["requested", "Позиция ДВГА"],
  ["materials", "Справка по доводам"],
  ["circulated", "Позиции членов комиссии"],
  ["hearing", "Заслушивание"],
  ["meeting", "Заседание и голосование"],
  ["protocol", "Протокол и решение"],
  ["delivered", "Направление результата"],
  ["completed", "Исполнение"],
] as const;
export const CONTROL_STEPS = [
  ["received", "Поступление"],
  ["accepted", "Компетенция и регистрация"],
  ["forwarded", "Передача вышестоящему органу"],
  ["materials", "Изучение административного дела"],
  ["hearing", "Заслушивание сторон"],
  ["decided", "Решение по жалобе"],
  ["delivered", "Направление результата"],
  ["completed", "Исполнение"],
] as const;
