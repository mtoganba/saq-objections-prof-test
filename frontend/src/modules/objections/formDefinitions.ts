import { preparedActionValues } from "./demoForm";
import type { Action, ObjectionCase } from "../../types";
import { OUTCOMES } from "../../data/constants";
import { addWorkdays, filingDeadline } from "./services/deadlines";
import { disputed } from "./services/decisions";
import { controlDecisions } from "./services/workflow";

export interface FormField {
  name: string;
  label: string;
  type:
    | "text"
    | "date"
    | "datetime-local"
    | "textarea"
    | "select"
    | "checkbox"
    | "number"
    | "heading";
  value?: string;
  required?: boolean;
  options?: readonly (readonly [string, string])[];
  min?: string;
  max?: string;
  readOnly?: boolean;
}
export interface FormDefinition {
  title: string;
  note?: string;
  fields: FormField[];
  submit: string;
}
export type FormValues = Record<string, string>;

const input = (
  name: string,
  label: string,
  value = "",
  type: FormField["type"] = "text",
): FormField => ({ name, label, value, type, required: true });
const area = (name: string, label: string, value = "") =>
  input(name, label, value, "textarea");
const check = (name: string, label: string): FormField => ({
  name,
  label,
  type: "checkbox",
  required: true,
});
const select = (
  name: string,
  label: string,
  options: FormField["options"],
  value = options?.[0]?.[0],
): FormField => ({
  name,
  label,
  type: "select",
  options,
  value,
  required: true,
});
const heading = (name: string, label: string): FormField => ({
  name,
  label,
  type: "heading",
});

const REQUEST_RECIPIENT_OPTIONS = [
  ["", "Выберите адресата"],
  ["КВГА", "КВГА"],
  ["ДВГА по Акмолинской области", "ДВГА по Акмолинской области"],
  ["ДВГА по Актюбинской области", "ДВГА по Актюбинской области"],
  ["ДВГА по Алматинской области", "ДВГА по Алматинской области"],
  ["ДВГА по области Жетісу", "ДВГА по области Жетісу"],
  ["ДВГА по Атырауской области", "ДВГА по Атырауской области"],
  [
    "ДВГА по Восточно-Казахстанской области",
    "ДВГА по Восточно-Казахстанской области",
  ],
  ["ДВГА по Жамбылской области", "ДВГА по Жамбылской области"],
  [
    "ДВГА по Западно-Казахстанской области",
    "ДВГА по Западно-Казахстанской области",
  ],
  ["ДВГА по Карагандинской области", "ДВГА по Карагандинской области"],
  ["ДВГА по Костанайской области", "ДВГА по Костанайской области"],
  ["ДВГА по Кызылординской области", "ДВГА по Кызылординской области"],
  ["ДВГА по Мангыстауской области", "ДВГА по Мангыстауской области"],
  ["ДВГА по Павлодарской области", "ДВГА по Павлодарской области"],
  [
    "ДВГА по Северо-Казахстанской области",
    "ДВГА по Северо-Казахстанской области",
  ],
  ["ДВГА по Туркестанской области", "ДВГА по Туркестанской области"],
  ["ДВГА по г.Шымкент", "ДВГА по г.Шымкент"],
  ["ДВГА по г. Алматы", "ДВГА по г. Алматы"],
  ["ДВГА по г. Астана", "ДВГА по г. Астана"],
  ["ДВГА по области Ұлытау", "ДВГА по области Ұлытау"],
  ["ДВГА по области Абай", "ДВГА по области Абай"],
  ["other", "Другое"],
] as const satisfies FormField["options"];

export function actionForm(
  action: Action,
  c: ObjectionCase,
  date: string,
  values: FormValues,
): FormDefinition {
  const day = input("date", "Дата действия", date, "date");
  let fields: FormField[] = action === "request" ? [] : [day];
  let title = "Действие по обращению";
  let note = "";
  switch (action) {
    case "screen":
      title = "Проверка допустимости и компетенции";
      fields.push(
        input(
          "assignee",
          "Ответственный исполнитель",
          c.assignee === "Не назначен" ? "Исполнитель ДВГА" : c.assignee,
        ),
        input("authority", "Орган рассмотрения", c.authority),
        area("basis", "Основание компетенции и результат проверки"),
        check("identity", "Заявитель и полномочия представителя проверены"),
        check("document", "Документ, даты получения и подачи проверены"),
        check("grounds", "Требования, доводы и доказательства представлены"),
        check(
          "competence",
          "Применимый порядок и компетенция органа подтверждены",
        ),
      );
      if (c.type === "control") {
        fields.push(
          area(
            "actEffect",
            "Исполнение акта: приостановление или применимое исключение по ст. 96 АППК",
          ),
        );
        if (c.filed > filingDeadline(c))
          fields.push(
            area(
              "restoration",
              "Рассмотрение вопроса восстановления пропущенного срока",
            ),
          );
      }
      note =
        c.type === "control"
          ? "Проверяются вид контроля, субъект, орган и специальный порядок. Пропуск срока не препятствует регистрации жалобы; вопрос восстановления рассматривается отдельно."
          : "Статьи 58-2 и 58-3: срок, способ подачи и полномочия. Отказ в рассмотрении оформляется комиссией отдельным действием.";
      break;
    case "request":
      title = "Сформировать запрос";
      const deadline = input(
        "deadline",
        "Срок рассмотрения",
        `${addWorkdays(date, 2)}T18:00`,
        "datetime-local",
      );
      deadline.readOnly = true;
      fields.push(
        select(
          "recipient",
          "Кому направить запрос",
          REQUEST_RECIPIENT_OPTIONS,
        ),
        deadline,
      );
      note =
        "Будут сформированы два документа: запрос и приложение к нему. Реквизиты обращения подставятся в шаблон автоматически.";
      break;
    case "send-request-approval":
      title = "Отправить запрос на согласование";
      note =
        "Запрос и приложение будут направлены директору ДАВГА для согласования.";
      break;
    case "approve-request":
      title = "Согласование запроса";
      fields.push(check("approved", "Запрос и приложение согласованы"));
      note =
        "После согласования запрос в ДВГА/КВГА будет направлен в их кабинет для подготовки мотивированного ответа.";
      break;
    case "fill-request-response":
      title = "Ответ ДВГА/КВГА на запрос";
      for (const point of disputed(c))
        fields.push(
          heading(point.id, `Пункт ${point.number} — ${point.title}`),
          area(
            `authorityFinding_${point.id}`,
            "Нарушение, по которым поступило возражение",
            point.authorityFinding,
          ),
          area(
            `authorityResponse_${point.id}`,
            "Мотивированный ответ ДВГА/КВГА по доводу возражения",
            point.position,
          ),
        );
      note =
        "Заполните нарушение и мотивированный ответ по каждому пункту. Тексты появятся в первом и третьем столбцах приложения к запросу.";
      break;
    case "position":
      title = "Ответ получен";
      fields[0] = input("date", "Дата получения ответа", date, "date");
      note =
        "Вложите все полученные от адресата документы и сохраните подтверждение поступления ответа.";
      break;
    case "analysis":
      title = "Сформировать справку";
      note =
        "Заполните доводы ДВГА и позиции членов апелляционной комиссии. Печатная форма обновляется в реальном времени.";
      break;
    case "control-analysis":
      title = "Изучение административного дела";
      for (const point of disputed(c)) {
        fields.push(
          heading(point.id, `Пункт ${point.number} — ${point.title}`),
          area(
            `analysis_${point.id}`,
            "Анализ довода, позиции и доказательств",
            point.analysis,
          ),
          area(
            `legal_${point.id}`,
            "Применимая норма и её связь с выводом",
            point.legal,
          ),
          select(
            `proposal_${point.id}`,
            "Проект результата",
            [["", "Выберите результат"], ...Object.entries(OUTCOMES)],
            point.proposal || "",
          ),
        );
        if ((values[`proposal_${point.id}`] || point.proposal) === "partial")
          fields.push({
            ...input(
              `amount_${point.id}`,
              "Оставшаяся сумма, тенге (0 — если денежной суммы нет)",
              String(point.remainingAmount ?? point.amount),
              "number",
            ),
            min: "0",
            max: String(point.amount),
          });
      }
      if (c.type === "control")
        fields.push(
          area("scope", "Результат изучения всего административного дела"),
          check("fullCase", "Административное дело изучено в полном объёме"),
          check("noWorsening", "Положение заявителя не ухудшается"),
        );
      note =
        c.type === "control"
          ? "Статья 98 АППК: исследуется всё дело, заслушиваются заявитель и орган; запрещено ухудшение положения заявителя."
          : "Пункт 15 Положения № 302: справка готовится в течение 5 рабочих дней после поступления возражения. Выводы фиксируются отдельно по пунктам.";
      break;
    case "members":
      title = "Позиции членов комиссии";
      fields.push(
        area(
          "position",
          "Полученные позиции; отсутствующие позиции и порядок их представления на заседании",
          c.memberPosition,
        ),
        check("shared", "Материалы направлены членам комиссии"),
      );
      note =
        "Пункт 16: позиции — в течение 3 рабочих дней с получения материалов. Если позиция не представлена своевременно, она может быть изложена на заседании.";
      break;
    case "hearing": {
      title = "Организация заслушивания";
      fields.push(
        select("mode", "Порядок", [
          ["hold", "Провести заслушивание"],
          ["favorable", "Исключение: полностью благоприятный результат"],
          ["request", "Исключение: ходатайство заявителя"],
        ]),
      );
      if ((values.mode || "hold") === "hold") {
        fields.push(
          input(
            "hearingDate",
            "Дата заслушивания",
            addWorkdays(values.date || date, 3),
            "date",
          ),
          area(
            "preliminary",
            "Предварительное решение, направляемое заявителю",
          ),
          check(
            "notified",
            "Извещение и предварительное решение направлены заявителю",
          ),
        );
        if (c.type === "control")
          fields.push(
            check("issuerNotified", "Орган, принявший акт, также извещён"),
          );
      } else
        fields.push(
          area("reason", "Основание исключения и реквизиты подтверждения"),
        );
      note =
        "Извещение — не менее чем за 3 рабочих дня. Заявителю доступно представление возражений в течение 2 рабочих дней с получения предварительного решения. Причина непроведения фиксируется отдельно.";
      break;
    }
    case "hearing-held":
      title = "Результат заслушивания";
      fields[0].value =
        c.hearing?.date && c.hearing.date > date ? c.hearing.date : date;
      fields.push(area("subject", "Позиция заявителя / сведения о неявке"));
      if (c.type === "control")
        fields.push(area("issuer", "Позиция органа, принявшего акт"));
      fields.push(
        area("note", "Результат рассмотрения замечаний"),
        check(
          "recorded",
          "Протокол и возможность ознакомления зарегистрированы",
        ),
      );
      note =
        "Если после заслушивания изменились выводы или проект результата, верните материалы на анализ до принятия решения.";
      break;
    case "vote":
      title = "Сформировать протокол заседания";
      fields.push(
        input("number", "Номер протокола", "ПР-" + c.id),
        input("protocolDate", "Дата протокола", date, "date"),
        input(
          "audio",
          "Реквизиты аудиозаписи",
          "Аудиозапись заседания комиссии № 4",
        ),
        check(
          "recusalDecision",
          "Конфликты интересов проверены; решения по отводам оформлены",
        ),
      );
      note =
        "Состав, присутствие, отводы и голоса задаются ниже. Секретарь не голосует. Для принятия проекта требуется кворум и большинство; равенство разрешает голос председательствующего.";
      break;
    case "sign":
      title = "Подписание протокола";
      fields.push(
        ...c.members
          .filter((member) => member.present)
          .map((member) =>
            check(
              `signed_${member.id}`,
              `${member.name}: подпись зафиксирована`,
            ),
          ),
        check("secretary", "Секретарь подписал протокол"),
        area(
          "reason",
          "Итоговая мотивировка",
          disputed(c)
            .map(
              (point) =>
                `Пункт ${point.number}: ${point.analysis || ""} ${point.legal || ""}`,
            )
            .join("\n"),
        ),
      );
      note =
        "Проект протокола — следующий рабочий день после заседания; подписи — в течение рабочего дня после получения проекта.";
      break;
    case "forward":
      title = "Передача жалобы вышестоящему органу";
      fields.push(
        select("mode", "Действие органа, принявшего акт", [
          ["forward", "Передать жалобу и административное дело"],
          ["satisfy", "Полностью удовлетворить жалобу"],
        ]),
        area("reason", "Основание и мотивировка"),
        check("materials", "Комплект административного дела подготовлен"),
      );
      if ((values.mode || "forward") === "forward")
        fields.push(
          input("authority", "Компетентный вышестоящий орган", c.authority),
        );
      else
        fields.push(
          area("effect", "Резолютивная часть благоприятного акта"),
          check("full", "Требования заявителя удовлетворяются полностью"),
        );
      note =
        "Статья 91 АППК: передача в течение 3 рабочих дней с поступления, кроме полного удовлетворения жалобы органом, принявшим акт.";
      break;
    case "control-decision":
      title = "Решение по жалобе";
      fields.push(
        select("kind", "Вид решения по статье 100 АППК", controlDecisions),
        area("reason", "Мотивировочная часть"),
        area("effect", "Резолютивная часть и последствия по исходному акту"),
        input("number", "Номер решения", "РЖ-" + c.id),
        check("competence", "Компетенция для выбранного решения подтверждена"),
      );
      break;
    case "deliver":
      title = "Оформление и направление результата";
      fields.push(
        input("number", "Исходящий номер", "ИСХ-" + c.id),
        select(
          "channel",
          "Канал доставки",
          c.type === "notice"
            ? [["portal", "Веб-портал закупок / исходная система"]]
            : [
                ["cabinet", "Кабинет SAQ"],
                ["sed", "СЭД"],
                ["post", "Почта"],
              ],
        ),
        input("receipt", "Квитанция отправки", "КВ-" + c.id),
        input("appealCourt", "Суд для обжалования (по подсудности)"),
        area(
          "appealProcedure",
          "Срок и порядок обжалования",
          "Для иска об оспаривании — в течение одного месяца со дня вручения решения по результатам рассмотрения жалобы, статья 136 АППК. Вид иска и подсудность определяются по обстоятельствам дела.",
        ),
        check(
          "sent",
          "Мотивированный результат с порядком обжалования направлен заявителю",
        ),
        check("copy", "Копия передана органу, чей документ обжалуется"),
      );
      if (c.type === "notice")
        fields.push(
          check("published", "Размещение решения на портале зарегистрировано"),
        );
      note =
        c.type === "control"
          ? "Статья 100 АППК: письменный результат заявителю и копия органу. Вручение фиксируется отдельно после направления."
          : "Оформление — 2 рабочих дня с решения; публикация закупочного решения — 1 рабочий день после направления. Для уведомления формируется заключение по структуре приложения 7. Вручение фиксируется отдельно.";
      break;
    case "receipt":
      title = "Подтверждение вручения результата";
      fields.push(
        input(
          "receipt",
          "Реквизиты подтверждения получения",
          "ВРУЧЕНИЕ-" + c.id,
        ),
      );
      note =
        "Дата вручения отделена от даты отправки. Срок судебного обращения рассчитывается с учётом вида иска и правил статьи 136 АППК.";
      break;
    case "execute":
      title = "Учёт исполнения решения";
      fields.push(
        area(
          "note",
          "Изменения по пунктам, оставшиеся обязательства и подтверждающий документ",
        ),
        check("checked", "Решение и оставшиеся пункты учтены в исходном деле"),
      );
      note =
        "Закрытие обращения означает учёт результата рассмотрения. Оставшиеся нарушения продолжают исполняться в исходном модуле.";
      break;
    case "supplement":
      title = "Дополнение к возражению";
      fields.push(
        input("number", "Регистрационный номер дополнения"),
        area("text", "Содержание дополнения"),
        check("formal", "Дополнение объекта зарегистрировано"),
        check("notified", "Извещение о продлении зарегистрировано"),
      );
      note =
        "Статья 58-4 п. 4: +15 рабочих дней; извещение — в течение 3 рабочих дней. Обычное приложение файла не продлевает срок.";
      break;
    case "pause":
      title = "Внешний запрос и приостановление";
      fields.push(
        input("recipient", "Адресат"),
        area("text", "Запрашиваемые сведения и основание"),
        check(
          "notified",
          "Приостановление оформлено, извещение зарегистрировано",
        ),
      );
      note =
        "Статья 58-4 п. 4: срок рассмотрения приостанавливается до ответа. Извещение — до 3 рабочих дней. Это отдельное событие от приостановления исполнения документа.";
      break;
    case "resume":
      title = "Ответ на внешний запрос";
      fields.push(area("text", "Ответ и реквизиты входящего документа"));
      break;
    case "withdraw":
    case "refuse":
      title =
        action === "refuse"
          ? "Отказ в рассмотрении"
          : "Оставление без рассмотрения";
      fields.push(
        select(
          "kind",
          "Основание",
          action === "refuse"
            ? [
                ["late", "Нарушение срока подачи"],
                ["form", "Нарушение порядка подачи"],
              ]
            : [
                ["withdraw", "Ходатайство / отзыв заявителя"],
                ["duplicate", "Имеется решение по тому же обращению"],
                ...(c.type === "control"
                  ? ([["court", "Применимое основание статьи 95 АППК"]] as [
                      string,
                      string,
                    ][])
                  : []),
              ],
        ),
        area("reason", "Мотивировка и реквизиты подтверждения"),
        check("notice", "Письменное извещение заявителю зарегистрировано"),
      );
      note =
        action === "refuse"
          ? "Извещение о формальном отказе — не позднее 5 рабочих дней с поступления. Это не решение об отказе в удовлетворении доводов."
          : c.type === "control"
            ? "Статья 95 АППК: отдельные основания оставления без рассмотрения; извещение — в течение 3 рабочих дней."
            : "Пункты 28–29 Положения № 302: повторность и прекращение по ходатайству заявителя.";
      break;
    case "return-analysis":
    case "postpone":
      title = action === "postpone" ? "Перенос заседания" : "Возврат на анализ";
      fields.push(area("reason", "Причина, поручение и дальнейшие действия"));
      break;
    case "court":
      title = "Судебное обжалование";
      fields.push(
        input("number", "Номер судебного дела"),
        area("note", "Обжалуемый документ и подтверждение подачи"),
      );
      if (c.type === "control")
        fields.push(
          area(
            "effect",
            "Последствия для исполнения с учётом вида акта и определения суда",
          ),
        );
      note =
        c.type === "control"
          ? "Последствия для исполнения устанавливаются отдельно по применимым нормам и судебным актам."
          : "Статья 58-4 п. 7: исполнение решения комиссии приостанавливается до вынесения решения суда.";
      break;
    case "court-result":
      title = "Результат судебного обжалования";
      fields.push(
        area(
          "note",
          "Судебный акт, резолютивная часть и последствия для исполнения",
        ),
      );
      break;
    case "upload":
      title = "Добавление материала";
      break;
  }
  const prepared = preparedActionValues(c, action);
  fields = fields.map((field) =>
    !field.value && prepared[field.name]
      ? { ...field, value: prepared[field.name] }
      : field,
  );
  return { title, fields, note, submit: "Зафиксировать действие" };
}
