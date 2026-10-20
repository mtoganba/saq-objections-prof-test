import type { Action, ObjectionCase } from "../../types";

// Draft text belongs only to this prepared fictional record. Decisions and attestations stay manual.
export function preparedActionValues(c: ObjectionCase, action: Action): Record<string, string> {
  // В исходном наборе больше нет отдельной подготовленной карточки для
  // протокола. Формы заполняются пользователем по данным текущего обращения.
  void c;
  void action;
  return {};
}
