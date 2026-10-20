import assert from "node:assert/strict";
import test from "node:test";
import { Children, createElement, isValidElement } from "react";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  initialState,
  createDemoRepository,
  STORAGE_KEY,
} from "../../../api/objectionsRepository";
import { members } from "../../../data/objections";
import type { Action, DemoState, Role } from "../../../types";
import { applyAction } from "../services/workflow";
import {
  addMonths,
  filingDeadline,
  reviewDeadline,
  reviewDuration,
} from "../services/deadlines";
import { evaluateVotes, remainingIssues } from "../services/decisions";
import { DocumentContent } from "../components/DocumentModal";
import CasesList from "../pages/CasesList";
import CaseWorkspace from "../pages/CaseWorkspace";
import ConsiderationProcess from "../components/ConsiderationProcess";
import { caseCsv } from "../../../utils/download";
import { pathForRoute, routeFromPath } from "../routing";

function harness(index = 0) {
  let state = initialState();
  const id = state.cases[index].id;
  return {
    get state() {
      return state;
    },
    get c() {
      return state.cases[index];
    },
    set(next: DemoState) {
      state = next;
    },
    run(action: Action, role: Role, values: Record<string, string> = {}) {
      const form = new FormData();
      Object.entries(values).forEach(([key, value]) => form.set(key, value));
      state = applyAction(state, id, action, role, form);
    },
  };
}
type Harness = ReturnType<typeof harness>;
function screen(h: Harness) {
  h.run("screen", "work", {
    identity: "on",
    document: "on",
    grounds: "on",
    competence: "on",
    assignee: "Демо-исполнитель",
    authority: "Компетентный орган (демо)",
    basis: "Применимый порядок и полномочия проверены (демо)",
    actEffect:
      "Действие акта приостановлено по проверенному общему основанию (демо)",
  });
}
function analysis(h: Harness, partial = false) {
  const values: Record<string, string> = {
    fullCase: "on",
    noWorsening: "on",
    scope: "Изучено всё дело (демо)",
  };
  h.c.issues
    .filter((point) => point.disputed)
    .forEach((point, index) => {
      values[`analysis_${point.id}`] = "Доказательства исследованы (демо)";
      values[`legal_${point.id}`] = "Применимая норма проверена (демо)";
      values[`proposal_${point.id}`] =
        partial && index === 1 ? "partial" : "accept";
      values[`amount_${point.id}`] = String(point.amount / 2);
    });
  h.run(
    h.c.type === "control" ? "control-analysis" : "analysis",
    h.c.type === "control" ? "higher" : "work",
    values,
  );
}
function prepare(h: Harness, partial = false) {
  screen(h);
  h.run("request", "work", {
    recipient: "ДВГА по Атырауской области",
    deadline: "2026-09-10T18:00",
  });
  h.run("send-request-approval", "work");
  h.run("approve-request", "director", { approved: "on" });
  h.run(
    "fill-request-response",
    "dvga",
    Object.fromEntries(
      h.c.issues
        .filter((point) => point.disputed)
        .flatMap((point) => [
          [
            `authorityFinding_${point.id}`,
            "Нарушение, заполненное ДВГА (демо)",
          ],
          [
            `authorityResponse_${point.id}`,
            "Мотивированный ответ ДВГА (демо)",
          ],
        ]),
    ),
  );
  analysis(h, partial);
  h.run("members", "work", {
    shared: "on",
    position: "Все позиции зафиксированы",
  });
}
function voteAndSign(h: Harness) {
  const values: Record<string, string> = {
    recusalDecision: "on",
    number: "ПР-1",
    audio: "DEMO-AUDIO-1",
  };
  for (const member of h.c.members) {
    values[`present_${member.id}`] = "on";
    for (const point of h.c.issues.filter((point) => point.disputed))
      values[`vote_${point.id}_${member.id}`] = "yes";
  }
  h.run("vote", "commission", values);
  h.run("sign", "commission", {
    secretary: "on",
    reason: "Итоговая мотивировка",
    ...Object.fromEntries(
      h.c.members.map((member) => [`signed_${member.id}`, "on"]),
    ),
  });
}
function deliver(h: Harness, role: Role = "work") {
  h.run("deliver", role, {
    sent: "on",
    copy: "on",
    published: "on",
    number: "ИСХ-1",
    receipt: "DEMO-1",
    channel: "portal",
    appealCourt: "Суд по подсудности (демо)",
    appealProcedure:
      "Для иска об оспаривании — один месяц со дня вручения решения, ст. 136 АППК",
  });
}

test("три исходных дела: разные сроки и перенос окончания месяца", () => {
  const state = initialState();
  assert.deepEqual(state.cases.map(filingDeadline), [
    "2026-09-10",
    "2026-09-16",
    "2026-11-30",
  ]);
  assert.deepEqual(state.cases.map(reviewDeadline), [
    "2026-09-24",
    "2026-10-14",
    "2026-10-12",
  ]);
  assert.equal(
    reviewDuration({ ...state.cases[1], appealType: "Заявление" }),
    15,
  );
  assert.equal(
    reviewDuration({
      ...state.cases[2],
      appealType: "Жалоба на действие/бездействие",
    }),
    20,
  );
  assert.equal(
    reviewDuration({ ...state.cases[1], appealType: "Возражение на аудиторский отчет" }),
    30,
  );
  assert.equal(addMonths("2026-08-31", 3), "2026-11-30");
  assert.equal(
    state.cases.every((c) => c.status === "received"),
    true,
  );
});

test("запрос получает срок два рабочих дня до 18:00 и допускает другого адресата", () => {
  const h = harness();
  screen(h);
  h.run("request", "work", {
    recipient: "other",
    recipientOther: "Экспертная организация",
    customRequestText: "Просим представить экспертное заключение.",
    deadline: "2026-12-31T09:00",
  });
  assert.deepEqual(h.c.requests.at(-1), {
    id: "request-1",
    recipient: "Экспертная организация",
    date: "2026-09-08",
    text:
      "Запрос сформирован для Экспертная организация. Срок рассмотрения: 2026-09-10T18:00.",
    deadline: "2026-09-10T18:00",
    customText: "Просим представить экспертное заключение.",
  });
});

test("уведомление: сквозной маршрут сохраняет неоспоренный пункт и снимки документов", () => {
  const h = harness();
  prepare(h);
  assert.equal(
    h.c.issues.find((point) => point.id === "n1")?.authorityFinding,
    "Нарушение, заполненное ДВГА (демо)",
  );
  h.run("hearing", "work", {
    mode: "favorable",
    reason: "Все заявленные доводы удовлетворяются",
  });
  voteAndSign(h);
  const draft = h.c.documents.find(
    (document) => document.name === "Проект протокола заседания",
  )!;
  assert.equal(draft.snapshot?.meeting?.signed, undefined);
  assert.ok(
    h.c.documents.find(
      (document) => document.name === "Подписанный протокол заседания",
    )?.snapshot?.meeting?.signed,
  );
  assert.deepEqual(
    remainingIssues(h.c).map((point) => point.number),
    ["3"],
  );
  deliver(h);
  assert.equal(h.c.delivery?.received, undefined);
  h.run("receipt", "subject", {
    date: "2026-09-09",
    receipt: "Подтверждение вручения",
  });
  h.run("execute", "dvga", {
    checked: "on",
    note: "Пункты 1 и 2 исключены, пункт 3 оставлен на исполнении",
  });
  assert.equal(h.c.status, "completed");
  assert.match(h.c.result!.effect, /пунктам 3/);
  const outgoing = h.c.documents.find((document) =>
    document.name.startsWith("Заключение"),
  )!;
  assert.equal(outgoing.snapshot?.delivery?.received, undefined);
  const html = renderToStaticMarkup(
    createElement(DocumentContent, {
      c: h.c,
      kind: "result",
      document: outgoing,
    }),
  );
  assert.match(html, /Суд по подсудности/);
});

test("отчёт: частичный результат требует заслушивания; доступно судебное обжалование", () => {
  const h = harness(1);
  prepare(h, true);
  assert.throws(
    () => h.run("hearing", "work", { mode: "favorable", reason: "Исключение" }),
    /не является полностью благоприятным/,
  );
  assert.throws(
    () =>
      h.run("hearing", "work", {
        mode: "hold",
        hearingDate: "2026-09-09",
        preliminary: "Проект",
        notified: "on",
      }),
    /3 рабочих дня/,
  );
  h.run("hearing", "work", {
    mode: "hold",
    hearingDate: "2026-09-11",
    preliminary: "Частичное удовлетворение",
    notified: "on",
  });
  h.run("hearing-held", "work", {
    date: "2026-09-11",
    subject: "Позиция объекта",
    note: "Доводы рассмотрены",
    recorded: "on",
  });
  voteAndSign(h);
  deliver(h);
  assert.equal(h.c.issues[1].remainingAmount, 2200000);
  h.run("court", "subject", {
    date: "2026-09-14",
    number: "АД-1",
    note: "Квитанция подачи иска (демо)",
  });
  assert.equal(h.c.status, "court");
  assert.match(h.c.court!.effect, /приостановлено/);
  h.run("court-result", "work", { note: "Судебный акт учтён (демо)" });
  assert.equal(h.c.status, "delivered");
});

test("профконтроль: отдельная передача, полный анализ, заслушивание обеих сторон", () => {
  const h = harness(2);
  screen(h);
  h.run("forward", "dvga", {
    materials: "on",
    mode: "forward",
    reason: "Дело передано по компетенции",
    authority: "Вышестоящий орган (демо)",
  });
  analysis(h);
  h.run("hearing", "higher", {
    mode: "hold",
    hearingDate: "2026-09-11",
    preliminary: "Полная отмена",
    notified: "on",
    issuerNotified: "on",
  });
  h.run("hearing-held", "higher", {
    date: "2026-09-11",
    subject: "Позиция заявителя",
    issuer: "Позиция органа",
    note: "Стороны заслушаны",
    recorded: "on",
  });
  assert.throws(
    () =>
      h.run("control-decision", "higher", {
        competence: "on",
        kind: "reject",
        reason: "Нет",
        effect: "Нет",
        number: "Р-1",
      }),
    /противоречит/,
  );
  h.run("control-decision", "higher", {
    competence: "on",
    kind: "cancel",
    reason: "Доводы подтверждены",
    effect: "Акт отменяется",
    number: "Р-1",
  });
  deliver(h, "higher");
  h.run("execute", "dvga", {
    checked: "on",
    note: "Акт отменён в исходном деле",
  });
  assert.equal(h.c.status, "completed");
  assert.equal(h.c.meeting, null);
});

test("кворум, отсутствие председательствующего, отвод и равенство голосов", () => {
  const composition = members();
  assert.throws(
    () =>
      evaluateVotes(
        composition.map((m, i) => ({ ...m, present: i < 3 })),
        {},
      ),
    /кворума/,
  );
  assert.throws(
    () =>
      evaluateVotes(
        composition.map((m, i) => ({ ...m, present: i >= 2 })),
        {},
      ),
    /председателя/,
  );
  const four = composition.map((m, i) => ({ ...m, present: i < 4 }));
  assert.equal(
    evaluateVotes(four, {
      chair: "yes",
      deputy: "no",
      member1: "yes",
      member2: "no",
    }).approved,
    true,
  );
  assert.equal(
    evaluateVotes(four, {
      chair: "no",
      deputy: "yes",
      member1: "yes",
      member2: "no",
    }).approved,
    false,
  );
  const recused = composition.map((m, i) => ({
    ...m,
    recused: i >= 5,
    reason: i >= 5 ? "Конфликт" : "",
  }));
  assert.equal(
    evaluateVotes(recused, {
      chair: "yes",
      deputy: "yes",
      member1: "yes",
      member2: "no",
      member3: "no",
    }).approved,
    false,
  );
});

test("недостаточные данные и неверная роль не меняют исходное состояние", () => {
  const h = harness();
  const original = structuredClone(h.state);
  assert.throws(() => h.run("screen", "dvga"), /недоступно/);
  assert.throws(() => h.run("screen", "work"), /Подтвердите/);
  assert.deepEqual(h.state, original);
});

test("дополнение и внешний запрос меняют сроки, обычный файл не даёт продления", () => {
  const h = harness();
  screen(h);
  const base = reviewDeadline(h.c);
  h.run("supplement", "work", {
    formal: "on",
    notified: "on",
    text: "Дополнительный довод",
    number: "ДОП-1",
  });
  assert.notEqual(reviewDeadline(h.c), base);
  assert.equal(h.c.extensionDays, 15);
  h.run("pause", "work", {
    recipient: "Другой орган",
    text: "Сведения",
    notified: "on",
  });
  h.run("resume", "work", { date: "2026-09-11", text: "Ответ" });
  assert.equal(h.c.pauseDays, 3);
  assert.equal(h.c.status, "accepted");
  const control = harness(2);
  assert.throws(() => control.run("supplement", "work"), /недоступно/);
});

test("совместимость сохранения, прямые ссылки и React-разметка всех вкладок", () => {
  const storage = new Map<string, string>();
  storage.set(STORAGE_KEY, JSON.stringify(initialState()));
  const repository = createDemoRepository({
    getItem: (key) => storage.get(key) || null,
    setItem: (key, value) => {
      storage.set(key, value);
    },
  });
  const state = repository.load();
  repository.save(state);
  assert.equal(repository.load().cases.length, 3);
  const path = pathForRoute({
    page: "detail",
    caseId: state.cases[0].id,
    tab: "history",
  });
  assert.deepEqual(routeFromPath(path), {
    page: "detail",
    caseId: state.cases[0].id,
    tab: "history",
  });
  const registry = renderToStaticMarkup(
    createElement(CasesList, {
      cases: state.cases,
      date: state.date,
      onOpen() {},
      onCreate() {},
      onExport() {},
    }),
  );
  assert.match(registry, /ВОЗ-2026-001/);
  state.cases[0].org = '<img src=x onerror="alert(1)">';
  for (const tab of ["overview", "review", "documents", "history"] as const) {
    const html = renderToStaticMarkup(
      createElement(CaseWorkspace, {
        c: state.cases[0],
        tab,
        role: "work",
        onBack() {},
        onTab() {},
        onAction() {},
        onDocument() {},
        onUpload() {},
      }),
    );
    assert.ok(!html.includes("<img src=x"));
  }
  state.cases[0].org = "=CMD()";
  assert.match(caseCsv(state.cases), /'=CMD\(\)/);
});

test("дело открывает процесс, а одно действие передаёт задачу вместе с ролью исполнителя", () => {
  const h = harness();
  const path = pathForRoute({ page: "detail", caseId: h.c.id });
  assert.equal(routeFromPath(path).tab, "review");
  assert.equal(
    routeFromPath(`/cases/${encodeURIComponent(h.c.id)}`).tab,
    "review",
  );
  assert.equal(
    routeFromPath(path.replace(/review$/, "overview")).tab,
    "overview",
  );

  function primaryAction(node: ReactNode): (() => void) | undefined {
    if (
      !isValidElement<{
        children?: ReactNode;
        primary?: boolean;
        onClick?: () => void;
      }>(node)
    )
      return;
    if (node.props.primary) return node.props.onClick;
    for (const child of Children.toArray(node.props.children)) {
      const action = primaryAction(child);
      if (action) return action;
    }
  }

  let selected: { action: Action; role: Role } | undefined;
  const process = () =>
    ConsiderationProcess({
      c: h.c,
      role: "work",
      onAction: (action, role) => {
        selected = { action, role };
      },
      onHistory() {},
    });
  assert.match(renderToStaticMarkup(process()), /Начать рассмотрение/);
  primaryAction(process())!();
  assert.deepEqual(selected, { action: "screen", role: "work" });
  screen(h);
  h.run("request", "work", {
    recipient: "ДВГА по Атырауской области",
    deadline: "2026-09-10T18:00",
  });
  assert.ok(h.c.documents.some((document) => document.kind === "request"));
  assert.ok(
    h.c.documents.some((document) => document.kind === "request-appendix"),
  );
  h.c.appealDate = "2026-09-08";
  h.c.appealNumber = "ВОЗ-77";
  const requestDocument = h.c.documents.find(
    (document) => document.kind === "request",
  )!;
  const requestHtml = renderToStaticMarkup(
    createElement(DocumentContent, {
      c: h.c,
      kind: "request",
      document: requestDocument,
    }),
  );
  assert.match(requestHtml, /ДВГА по Атырауской области/);
  assert.match(requestHtml, /08\.09\.2026/);
  assert.match(requestHtml, /ВОЗ-77/);
  assert.match(requestHtml, /ГУ «Управление образования»/);
  const appendixDocument = h.c.documents.find(
    (document) => document.kind === "request-appendix",
  )!;
  const appendixHtml = renderToStaticMarkup(
    createElement(DocumentContent, {
      c: h.c,
      kind: "request-appendix",
      document: appendixDocument,
    }),
  );
  assert.match(appendixHtml, /Нарушение, по которым поступило возражение/);
  assert.match(
    appendixHtml,
    /<td><\/td><td>Требование к технической спецификации<\/td>/,
  );
  assert.doesNotMatch(
    appendixHtml,
    /Описание соответствует функциональной потребности/,
  );
  const appendixWithResponseHtml = renderToStaticMarkup(
    createElement(DocumentContent, {
      c: h.c,
      kind: "request-appendix",
      document: appendixDocument,
      appendixFindingPreview: { [h.c.issues[0].id]: "Нарушение ДВГА" },
      appendixPreview: { [h.c.issues[0].id]: "Мотивированный ответ ДВГА" },
    }),
  );
  assert.match(appendixWithResponseHtml, /Нарушение ДВГА/);
  assert.match(appendixWithResponseHtml, /Мотивированный ответ ДВГА/);
  assert.match(renderToStaticMarkup(process()), /Отправить на согласование/);
  primaryAction(process())!();
  assert.deepEqual(selected, {
    action: "send-request-approval",
    role: "work",
  });
  h.run("send-request-approval", "work");
  assert.match(renderToStaticMarkup(process()), /Согласовать запрос/);
  h.run("approve-request", "director", { approved: "on" });
  assert.match(renderToStaticMarkup(process()), /Заполнить ответ ДВГА\/КВГА/);

  const control = harness(2);
  screen(control);
  const controlHtml = renderToStaticMarkup(
    createElement(ConsiderationProcess, {
      c: control.c,
      role: "work",
      onAction() {},
      onHistory() {},
    }),
  );
  assert.match(controlHtml, /Сформировать запрос/);
  assert.doesNotMatch(controlHtml, /Заседание, голоса и протокол/);
  assert.doesNotMatch(controlHtml, /Позиции комиссии/);
});

test("справка выводит позиции членов АК в печатной форме", () => {
  const h = harness(0);
  screen(h);
  h.run("request", "work", {
    recipient: "ДВГА по Атырауской области",
    deadline: "2026-09-10T18:00",
  });
  h.run("send-request-approval", "work");
  h.run("approve-request", "director", { approved: "on" });
  h.run(
    "fill-request-response",
    "dvga",
    Object.fromEntries(
      h.c.issues
        .filter((point) => point.disputed)
        .flatMap((point) => [
          [
            `authorityFinding_${point.id}`,
            "Нарушение, заполненное ДВГА",
          ],
          [`authorityResponse_${point.id}`, "Мотивированный ответ ДВГА"],
        ]),
    ),
  );
  h.run("analysis", "work", {
    authorityArguments: "Доводы ДВГА для справки",
    certificateMember_1: "ФИО 1",
    certificateArgument_1: "Довод первого члена АК",
    certificateMember_2: "ФИО 2",
    certificateArgument_2: "Довод второго члена АК",
  });
  assert.equal(h.c.status, "certificate_approval");
  h.run("approve-certificate", "director");
  assert.equal(h.c.status, "certificate_approved");
  h.run("send-certificate-to-commission", "work");
  assert.equal(h.c.status, "circulated");
  h.run("members", "work", { meetingConducted: "on" });
  assert.equal(h.c.status, "meeting");
  const certificate = h.c.documents.find(
    (document) => document.kind === "certificate",
  )!;
  const html = renderToStaticMarkup(
    createElement(DocumentContent, {
      c: h.c,
      kind: "certificate",
      document: certificate,
    }),
  );
  assert.match(html, /Доводы ДВГА для справки/);
  assert.match(html, /ФИО 1/);
  assert.match(html, /Довод второго члена АК/);
  assert.match(html, /ГУ «Управление образования»/);
});
