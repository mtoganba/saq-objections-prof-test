import { CLOSED, OUTCOMES, ROLES } from "../../../data/constants";
import type {
  Action,
  ActionOption,
  DemoState,
  ObjectionCase,
  Outcome,
  Role,
} from "../../../types";
import {
  addWorkdays,
  dateObject,
  filingDeadline,
  reviewDeadline,
  workdaysBetween,
} from "./deadlines";
import { disputed, evaluateVotes, overall, remainingIssues } from "./decisions";

export const controlDecisions = [
  ["cancel", "Отменить административный акт"],
  ["replace", "Отменить акт и принять новый"],
  ["action", "Совершить административное действие"],
  ["reject", "Оставить жалобу без удовлетворения"],
  ["return", "Вернуть дело для устранения процедурных нарушений"],
  ["without", "Оставить жалобу без рассмотрения"],
] as const;

function directedToDvgaOrKvga(c: ObjectionCase) {
  const recipient = c.requests.at(-1)?.recipient.toUpperCase() || "";
  return recipient.includes("ДВГА") || recipient.includes("КВГА");
}

export function nextAction(c: ObjectionCase): ActionOption | null {
  const control = c.type === "control";
  const reviewer: Role = control ? "higher" : "work";
  const map: Partial<Record<ObjectionCase["status"], ActionOption>> = {
    received: {
      action: "screen",
      label: "Проверить поступление",
      role: "work",
    },
    accepted: {
      action: "request",
      label: "Сформировать запрос",
      role: "work",
    },
    requested: {
      action: "send-request-approval",
      label: "Отправить на согласование",
      role: "work",
    },
    request_approval: {
      action: "approve-request",
      label: "Согласовать запрос",
      role: "director",
    },
    request_approved: directedToDvgaOrKvga(c)
      ? {
          action: "fill-request-response",
          label: "Заполнить ответ ДВГА/КВГА",
          role: "dvga",
        }
      : {
          action: "position",
          label: "Ответ получен",
          role: "work",
        },
    certificate_approval: {
      action: "approve-certificate",
      label: "Согласовать справку",
      role: "director",
    },
    certificate_approved: {
      action: "send-certificate-to-commission",
      label: "Направить справку и документы членам АК",
      role: "work",
    },
    materials: {
      action: control ? "control-analysis" : "analysis",
      label: control ? "Изучить административное дело" : "Сформировать справку",
      role: reviewer,
    },
    forwarded: {
      action: "control-analysis",
      label: "Изучить административное дело",
      role: "higher",
    },
    circulated: {
      action: "members",
      label: "Заседание по данному делу проведено",
      role: "work",
    },
    hearing: {
      action: "hearing",
      label: "Организовать заслушивание",
      role: reviewer,
    },
    hearing_ready: {
      action: "hearing-held",
      label: "Зафиксировать заслушивание",
      role: reviewer,
    },
    meeting: {
      action: "vote",
      label: "Сформировать протокол заседания",
      role: "commission",
    },
    protocol: {
      action: "sign",
      label: "Подписать протокол",
      role: "commission",
    },
    decided: {
      action: "deliver",
      label: "Оформить и направить результат",
      role: c.selfReview ? "dvga" : reviewer,
    },
    delivered: {
      action: "execute",
      label: "Учесть исполнение решения",
      role: "dvga",
    },
    paused: {
      action: "resume",
      label: "Зарегистрировать внешний ответ",
      role: "work",
    },
    court: {
      action: "court-result",
      label: "Учесть судебный акт",
      role: "work",
    },
  };
  if (control && c.status === "meeting")
    return {
      action: "control-decision",
      label: "Принять решение по жалобе",
      role: "higher",
    };
  return map[c.status] || null;
}

export function additionalActions(c: ObjectionCase): ActionOption[] {
  const options: ActionOption[] = [
    { action: "upload", label: "Добавить материал", role: "subject" },
  ];
  const active =
    !CLOSED.includes(c.status) &&
    !["protocol", "decided", "delivered", "court"].includes(c.status);
  if (active) {
    if (c.type === "control" && c.status === "accepted")
      options.push({
        action: "forward",
        label: "Передать жалобу по компетенции",
        role: "dvga",
      });
    if (c.status === "requested")
      options.push({
        action: "request",
        label: "Сформировать ещё один запрос",
        role: "work",
      });
    if (c.type !== "control") {
      options.push({
        action: "supplement",
        label: "Дополнение к возражению",
        role: "work",
      });
      if (c.status !== "paused")
        options.push({
          action: "pause",
          label: "Внешний запрос / приостановление",
          role: "work",
        });
      options.push({
        action: "refuse",
        label: "Отказ в рассмотрении",
        role: "commission",
      });
    }
    options.push({
      action: "withdraw",
      label: "Оставить без рассмотрения",
      role: c.type === "control" ? "higher" : "work",
    });
    if (
      ["circulated", "hearing", "hearing_ready", "meeting"].includes(c.status)
    )
      options.push({
        action: "return-analysis",
        label: "Вернуть на анализ",
        role: c.type === "control" ? "higher" : "work",
      });
    if (c.status === "meeting" && c.type !== "control")
      options.push({
        action: "postpone",
        label: "Перенести заседание",
        role: "commission",
      });
  }
  if (["delivered", "completed"].includes(c.status)) {
    options.push({
      action: "court",
      label: "Судебное обжалование",
      role: "subject",
    });
    if (!c.delivery?.received)
      options.push({
        action: "receipt",
        label: "Подтвердить получение результата",
        role: "subject",
      });
  }
  return options;
}

export function effect(c: ObjectionCase): string {
  const left = remainingIssues(c);
  if (c.type === "notice")
    return left.length
      ? `Уведомление сохраняется по пунктам ${left.map((p) => p.number).join(", ")}. Неоспоренные нарушения также остаются на исполнении.`
      : "Все нарушения уведомления оспорены и исключены. Уведомление подлежит полной отмене.";
  if (c.type === "audit")
    return left.length
      ? `Учитываются оставленные в силе пункты ${left.map((p) => p.number).join(", ")}; остаточная сумма определяется по каждому пункту.`
      : "Оспоренные выводы отчёта подлежат исключению; последствия учитываются в исходном аудиторском деле.";
  return (
    c.result?.effect ||
    "Последствия по акту определяются резолютивной частью решения компетентного органа."
  );
}

export function required(form: FormData, name: string, label = name): string {
  const value = String(form.get(name) || "").trim();
  if (!value) throw new Error(`Заполните поле «${label}»`);
  return value;
}

function checked(form: FormData, ...names: string[]) {
  if (names.some((name) => !form.has(name)))
    throw new Error("Подтвердите все обязательные проверки и действия");
}

export function actionDate(
  state: DemoState,
  c: ObjectionCase,
  form: FormData,
): string {
  const date = String(form.get("date") || state.date);
  dateObject(date);
  const minimum = [
    state.date,
    c.registered,
    ...c.history.map((event) => event.date),
  ]
    .sort()
    .at(-1)!;
  if (date < minimum)
    throw new Error(`Дата операции не может быть раньше ${minimum}`);
  if (date > "2026-12-31")
    throw new Error("Демонстрационный календарь настроен до 31.12.2026");
  return date;
}

export function addDocument(
  c: ObjectionCase,
  role: Role,
  date: string,
  name: string,
  kind: string,
  text: string,
  requestId?: string,
) {
  c.documents.push({
    name,
    kind,
    text,
    date,
    author: ROLES[role],
    requestId,
    snapshot: structuredClone({
      issues: c.issues,
      result: c.result || null,
      members: c.members,
      votes: c.votes || null,
      meeting: c.meeting || null,
      hearing: c.hearing || null,
      delivery: c.delivery || null,
      certificate: c.certificate || null,
    }),
  });
}

/** Validate and apply one transaction. The original state remains untouched on error. */
export function applyAction(
  state: DemoState,
  caseId: string,
  action: Action,
  role: Role,
  form: FormData,
): DemoState {
  const next = structuredClone(state);
  const c = next.cases.find((item) => item.id === caseId);
  if (!c) throw new Error("Обращение не найдено");
  const available = [nextAction(c), ...additionalActions(c)].find(
    (item) => item?.action === action,
  );
  if (!available || (available.role !== role && action !== "upload"))
    throw new Error("Действие недоступно на этом этапе или для выбранной роли");
  const date = actionDate(next, c, form);
  const text = (name: string, label?: string) => required(form, name, label);
  const doc = (
    name: string,
    kind: string,
    content: string,
    requestId?: string,
  ) => addDocument(c, role, date, name, kind, content, requestId);
  let title: string = available.label;
  let note = "";

  switch (action) {
    case "screen": {
      checked(form, "identity", "document", "grounds", "competence");
      if (c.filed > filingDeadline(c)) {
        if (c.type !== "control")
          throw new Error(
            "Пропущен срок подачи. Формальный отказ оформляется комиссией отдельным действием.",
          );
        text(
          "restoration",
          "Результат рассмотрения вопроса восстановления срока",
        );
      }
      c.assignee = text("assignee", "Ответственный");
      c.authority = text("authority", "Компетентный орган");
      c.screening = text(
        "basis",
        "Основание компетенции и проверки допустимости",
      );
      if (c.type === "control")
        c.actEffect = text("actEffect", "Последствия по статье 96 АППК");
      c.status = "accepted";
      title = "Обращение принято; компетенция и допустимость проверены";
      note = c.screening;
      break;
    }
    case "request": {
      const selectedRecipient = text("recipient", "Кому направить запрос");
      const recipient =
        selectedRecipient === "other"
          ? text("recipientOther", "Укажите адресата")
          : selectedRecipient;
      const customText =
        selectedRecipient === "other"
          ? text("customRequestText", "Текст запроса")
          : undefined;
      const deadline = `${addWorkdays(date, 2)}T18:00`;
      const requestId = `request-${c.requests.length + 1}`;
      note = `Запрос сформирован для ${recipient}. Срок рассмотрения: ${deadline}.`;
      c.requests.push({
        id: requestId,
        recipient,
        date,
        text: note,
        deadline,
        customText,
      });
      c.status = "requested";
      doc(`Запрос в ${recipient}`, "request", note, requestId);
      doc(
        `Приложение к запросу в ${recipient}`,
        "request-appendix",
        `Приложение к запросу в ${recipient}.`,
        requestId,
      );
      break;
    }
    case "send-request-approval": {
      if (!c.requests.length)
        throw new Error("Сначала сформируйте запрос и приложение к нему");
      c.status = "request_approval";
      title = "Запрос и приложение направлены на согласование";
      note = "Сформированные документы направлены директору ДАВГА.";
      break;
    }
    case "approve-request": {
      checked(form, "approved");
      if (!c.requests.length) throw new Error("Запрос не сформирован");
      c.status = "request_approved";
      title = "Запрос согласован";
      note = directedToDvgaOrKvga(c)
        ? "Запрос направлен в кабинет ДВГА/КВГА для подготовки мотивированного ответа."
        : "Согласованный запрос ожидает поступления ответа.";
      break;
    }
    case "approve-certificate": {
      if (!c.certificate)
        throw new Error("Сначала сформируйте справку по доводам");
      c.status = "certificate_approved";
      title = "Справка согласована";
      note = "Справка готова к направлению вместе со всеми материалами членам апелляционной комиссии.";
      break;
    }
    case "send-certificate-to-commission": {
      if (!c.certificate)
        throw new Error("Справка по доводам не сформирована");
      c.status = "circulated";
      title = "Справка и материалы направлены членам АК";
      note = "Справка и все документы по обращению направлены членам апелляционной комиссии для ознакомления.";
      doc("Справка и материалы для членов АК", "circulation", note);
      break;
    }
    case "fill-request-response": {
      if (!directedToDvgaOrKvga(c))
        throw new Error("Это действие доступно только для запроса в ДВГА/КВГА");
      for (const point of disputed(c)) {
        point.authorityFinding = text(
          `authorityFinding_${point.id}`,
          `Нарушение по пункту ${point.number}`,
        );
        point.position = text(
          `authorityResponse_${point.id}`,
          `Мотивированный ответ по пункту ${point.number}`,
        );
      }
      const request = c.requests.at(-1)!;
      request.responded = date;
      c.documents
        .filter(
          (document) =>
            document.kind === "request-appendix" &&
            document.requestId === request.id,
        )
        .forEach((document) => {
          if (document.snapshot)
            document.snapshot.issues = structuredClone(c.issues);
        });
      note = "Мотивированные ответы ДВГА/КВГА заполнены по всем оспариваемым пунктам.";
      c.status = "materials";
      doc("Мотивированный ответ ДВГА/КВГА", "authority-response", note);
      break;
    }
    case "position":
      note = "Получен ответ на направленный запрос.";
      if (c.requests.length) c.requests[c.requests.length - 1].responded = date;
      c.status = "materials";
      doc("Полученные материалы по запросу", "position", note);
      break;
    case "analysis": {
      if (form.has("authorityArguments")) {
        const memberPositions = Array.from({ length: 20 }, (_, index) => {
          const number = index + 1;
          const name = String(form.get(`certificateMember_${number}`) || "").trim();
          const argument = String(
            form.get(`certificateArgument_${number}`) || "",
          ).trim();
          return name ? { id: String(number), name, argument } : null;
        }).filter(
          (member): member is { id: string; name: string; argument: string } =>
            member !== null,
        );
        if (!memberPositions.length)
          throw new Error("Добавьте хотя бы одного члена апелляционной комиссии");
        if (memberPositions.some((member) => !member.argument))
          throw new Error("Заполните довод каждого члена апелляционной комиссии");
        c.certificate = {
          authorityArguments: text("authorityArguments", "Доводы ДВГА"),
          memberPositions,
        };
        c.status = "certificate_approval";
        c.result = null;
        c.votes = null;
        c.meeting = null;
        note = "Справка сформирована и направлена для ознакомления членам апелляционной комиссии.";
        doc(
          "Справка по результатам изучения и анализа возражения",
          "certificate",
          note,
        );
        break;
      }
      for (const point of disputed(c)) {
        point.analysis = text(
          `analysis_${point.id}`,
          `Анализ пункта ${point.number}`,
        );
        point.legal = text(
          `legal_${point.id}`,
          `Норма по пункту ${point.number}`,
        );
        const value = text(`proposal_${point.id}`, "Проект результата");
        if (!(value in OUTCOMES))
          throw new Error("Выберите допустимый результат");
        point.proposal = value as Outcome;
        const amount =
          point.proposal === "accept"
            ? 0
            : point.proposal === "reject"
              ? point.amount
              : Number(text(`amount_${point.id}`, "Оставшаяся сумма"));
        if (!Number.isFinite(amount) || amount < 0 || amount > point.amount)
          throw new Error("Оставшаяся сумма должна быть в пределах исходной");
        point.remainingAmount = amount;
      }
      c.status = "circulated";
      c.result = null;
      c.votes = null;
      c.meeting = null;
      doc("Справка по доводам", "analysis", note);
      break;
    }
    case "control-analysis": {
      for (const point of disputed(c)) {
        point.analysis = text(
          `analysis_${point.id}`,
          `Анализ пункта ${point.number}`,
        );
        point.legal = text(
          `legal_${point.id}`,
          `Норма по пункту ${point.number}`,
        );
        const value = text(`proposal_${point.id}`, "Проект результата");
        if (!(value in OUTCOMES))
          throw new Error("Выберите допустимый результат");
        point.proposal = value as Outcome;
        const amount =
          point.proposal === "accept"
            ? 0
            : point.proposal === "reject"
              ? point.amount
              : Number(text(`amount_${point.id}`, "Оставшаяся сумма"));
        if (!Number.isFinite(amount) || amount < 0 || amount > point.amount)
          throw new Error("Оставшаяся сумма должна быть в пределах исходной");
        point.remainingAmount = amount;
      }
      checked(form, "fullCase", "noWorsening");
      note = text("scope", "Результат изучения всего административного дела");
      c.status = "hearing";
      c.result = null;
      c.votes = null;
      c.meeting = null;
      doc(
        "Анализ административного дела",
        "analysis",
        note,
      );
      break;
    }
    case "members":
      if (form.has("meetingConducted")) {
        c.memberPosition = "Заседание по данному делу проведено.";
        c.status = "meeting";
        note = "Заседание по данному делу проведено. Обращение переведено на этап принятия решения.";
        doc("Сведения о проведении заседания", "members", note);
        break;
      }
      c.memberPosition = text("position", "Позиции членов комиссии");
      checked(form, "shared");
      c.status = "hearing";
      doc("Позиции членов комиссии", "members", c.memberPosition);
      break;
    case "hearing": {
      const mode = text("mode", "Порядок заслушивания");
      if (mode !== "hold") {
        if (mode === "favorable" && overall(c) !== "accept")
          throw new Error(
            "Проект не является полностью благоприятным для заявителя",
          );
        if (!["favorable", "request"].includes(mode))
          throw new Error("Недопустимое основание");
        c.hearing = {
          skip: true,
          reason: text("reason", "Документальное основание исключения"),
        };
        c.status = "meeting";
        doc(
          "Основание непроведения заслушивания",
          "hearing",
          c.hearing.reason!,
        );
      } else {
        const hearingDate = text("hearingDate", "Дата заслушивания");
        dateObject(hearingDate);
        if (hearingDate < addWorkdays(date, 3))
          throw new Error(
            "Извещение должно быть направлено не менее чем за 3 рабочих дня",
          );
        checked(form, "notified");
        if (c.type === "control") checked(form, "issuerNotified");
        c.hearing = {
          skip: false,
          notice: date,
          date: hearingDate,
          note: text("preliminary", "Предварительное решение"),
        };
        c.status = "hearing_ready";
        doc(
          "Извещение о заслушивании",
          "hearing",
          `Заслушивание ${hearingDate}. ${c.hearing.note}`,
        );
      }
      break;
    }
    case "hearing-held":
      if (!c.hearing?.date || date < c.hearing.date)
        throw new Error(
          "Дата проведения не может быть раньше назначенного заслушивания",
        );
      c.hearing.subject = text(
        "subject",
        "Позиция заявителя или сведения о неявке",
      );
      if (c.type === "control")
        c.hearing.issuer = text("issuer", "Позиция органа");
      c.hearing.note = text(
        "note",
        "Результат заслушивания и рассмотрения доводов",
      );
      c.hearing.held = date;
      checked(form, "recorded");
      c.status = "meeting";
      doc("Протокол заслушивания", "hearing", c.hearing.note);
      break;
    case "vote": {
      checked(form, "recusalDecision");
      c.members = c.members.map((member) => ({
        ...member,
        present: form.has(`present_${member.id}`),
        recused: form.has(`recused_${member.id}`),
        reason: form.has(`recused_${member.id}`)
          ? text(`reason_${member.id}`, "Основание отвода")
          : "",
      }));
      c.votes = {};
      for (const point of disputed(c)) {
        if (!point.proposal) point.proposal = "accept";
        const votes = Object.fromEntries(
          c.members.map((member) => [
            member.id,
            String(form.get(`vote_${point.id}_${member.id}`) || ""),
          ]),
        );
        const result = evaluateVotes(c.members, votes);
        if (!result.approved)
          throw new Error(
            `Проект по пункту ${point.number} не принят. Скорректируйте проект после возврата на анализ или перенесите заседание.`,
          );
        c.votes[point.id] = { ...result, votes };
        point.final = point.proposal;
      }
      const protocolDate = String(form.get("protocolDate") || date);
      dateObject(protocolDate);
      c.meeting = {
        date: protocolDate,
        number: text("number", "Номер протокола"),
        audio: text("audio", "Реквизиты аудиозаписи"),
      };
      c.status = "protocol";
      doc(
        "Проект протокола заседания",
        "protocol",
        "Голоса зафиксированы. Ожидаются подписи присутствующих членов и секретаря.",
      );
      break;
    }
    case "sign": {
      checked(
        form,
        "secretary",
        ...c.members
          .filter((member) => member.present)
          .map((member) => `signed_${member.id}`),
      );
      if (!c.meeting) throw new Error("Протокол не сформирован");
      c.meeting.signed = date;
      const result = overall(c);
      if (!result) throw new Error("Результат голосования не определён");
      c.result = {
        label: OUTCOMES[result],
        reason: text("reason", "Итоговая мотивировка"),
        effect: effect(c),
        date,
        number: c.meeting.number,
      };
      c.status = "decided";
      doc("Подписанный протокол заседания", "protocol", c.result.reason);
      break;
    }
    case "forward": {
      checked(form, "materials");
      note = text("reason", "Основание передачи или удовлетворения");
      if (form.get("mode") === "satisfy") {
        checked(form, "full");
        c.selfReview = true;
        c.result = {
          label: "Жалоба полностью удовлетворена органом, принявшим акт",
          kind: "cancel",
          reason: note,
          effect: text("effect", "Резолютивная часть"),
          date,
        };
        c.issues
          .filter((point) => point.disputed)
          .forEach((point) => {
            point.final = "accept";
            point.remainingAmount = 0;
          });
        c.status = "decided";
        doc("Решение о полном удовлетворении жалобы", "result", note);
      } else {
        c.authority = text("authority", "Вышестоящий орган");
        c.status = "forwarded";
        doc("Сопроводительное письмо о передаче дела", "forward", note);
      }
      break;
    }
    case "control-decision": {
      checked(form, "competence");
      const kind = text("kind", "Вид решения");
      const decision = controlDecisions.find(([value]) => value === kind);
      if (!decision) throw new Error("Недопустимый вид решения");
      if (kind === "reject" && overall(c) !== "reject")
        throw new Error(
          "Отказ противоречит результатам по пунктам; верните материалы на анализ",
        );
      if (kind === "cancel" && overall(c) !== "accept")
        throw new Error(
          "Полная отмена противоречит результатам по пунктам; уточните проект",
        );
      c.result = {
        kind,
        label: decision[1],
        reason: text("reason", "Мотивировка"),
        effect: text("effect", "Резолютивная часть"),
        number: text("number", "Номер решения"),
        date,
      };
      if (kind !== "without" && kind !== "return")
        disputed(c).forEach((point) => {
          point.final = point.proposal;
        });
      c.status = "decided";
      doc("Решение по жалобе", "result", c.result.reason);
      break;
    }
    case "deliver":
      checked(
        form,
        "sent",
        "copy",
        ...(c.type === "notice" ? ["published"] : []),
      );
      c.delivery = {
        date,
        number: text("number", "Исходящий номер"),
        receipt: text("receipt", "Квитанция отправки"),
        channel: text("channel", "Канал"),
        appealCourt: text("appealCourt", "Суд для обжалования"),
        appealProcedure: text("appealProcedure", "Порядок и срок обжалования"),
        published: c.type === "notice" ? date : null,
      };
      c.status = "delivered";
      doc(
        c.type === "notice"
          ? "Заключение по результатам рассмотрения возражения"
          : "Письменный результат рассмотрения",
        "result",
        c.result?.reason || "",
      );
      break;
    case "receipt":
      if (!c.delivery) throw new Error("Результат ещё не направлен");
      c.delivery.received = date;
      note = text("receipt", "Подтверждение вручения");
      doc("Подтверждение вручения результата", "receipt", note);
      break;
    case "execute":
      checked(form, "checked");
      note = text("note", "Как решение учтено в исходном деле");
      c.status = "completed";
      doc("Учёт исполнения решения", "execution", note);
      break;
    case "supplement":
      checked(form, "formal", "notified");
      c.extensionDays += 15;
      note = text("text", "Содержание дополнения");
      doc(
        "Дополнение " + text("number", "Номер дополнения"),
        "supplement",
        note,
      );
      note += ` Новый срок: ${reviewDeadline(c)}. Извещение о продлении учтено.`;
      break;
    case "pause":
      checked(form, "notified");
      c.pause = {
        date,
        recipient: text("recipient", "Адресат"),
        text: text("text", "Внешний запрос"),
      };
      c.resumeStatus = c.status;
      c.status = "paused";
      doc(
        "Внешний запрос и извещение о приостановлении",
        "pause",
        c.pause.text,
      );
      break;
    case "resume":
      if (!c.pause || !c.resumeStatus)
        throw new Error("Приостановление не зарегистрировано");
      c.pauseDays += workdaysBetween(c.pause.date, date);
      c.status = c.resumeStatus;
      note = text("text", "Ответ на запрос");
      c.pause = null;
      doc("Ответ на внешний запрос", "response", note);
      break;
    case "withdraw":
    case "refuse":
      checked(form, "notice");
      note = text("reason", "Мотивировка и реквизиты основания");
      c.status = action === "refuse" ? "refused" : "withdrawn";
      c.result = {
        label:
          action === "refuse"
            ? "Отказано в рассмотрении"
            : "Оставлено без рассмотрения",
        kind: text("kind", "Основание"),
        reason: note,
        effect: "Решение по существу доводов не принималось.",
        date,
      };
      doc("Извещение о результате", "result", note);
      break;
    case "return-analysis":
      note = text("reason", "Причина возврата");
      c.status = "materials";
      c.hearing = null;
      c.meeting = null;
      c.votes = null;
      c.result = null;
      disputed(c).forEach((point) => {
        delete point.final;
      });
      doc("Возврат материалов на анализ", "return", note);
      break;
    case "postpone":
      note = text("reason", "Причина переноса");
      doc("Извещение о переносе заседания", "postpone", note);
      break;
    case "court":
      c.court = {
        number: text("number", "Номер судебного дела"),
        date,
        note: text("note", "Подтверждение судебного обжалования"),
        effect:
          c.type === "control"
            ? text("effect", "Последствия для исполнения")
            : "Исполнение решения комиссии приостановлено до решения суда (ст. 58-4 п. 7).",
      };
      c.status = "court";
      doc("Судебное обжалование", "court", c.court.note);
      break;
    case "court-result":
      if (!c.court || !c.result)
        throw new Error("Судебное дело не зарегистрировано");
      note = text("note", "Судебный акт и последствия");
      c.court.result = note;
      c.result.effect = note;
      c.status = "delivered";
      doc("Судебный акт", "court", note);
      break;
    case "upload":
      throw new Error("Для вложений используется отдельный метод репозитория");
  }

  c.history.push({
    date,
    actor: ROLES[role],
    title,
    text: note || "Действие учтено в деле.",
  });
  next.date = date;
  return next;
}
