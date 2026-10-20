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
import { makeCase, members } from "../../../data/objections";
import type { Action, DemoState, Role } from "../../../types";
import {
  additionalActions,
  applyAction,
  nextAction,
} from "../services/workflow";
import {
  addWorkdays,
  addMonths,
  filingDeadline,
  executionDeadline,
  reviewDeadline,
  reviewDuration,
} from "../services/deadlines";
import {
  evaluateVotes,
  overall,
  pointOutcomeFromVotes,
  remainingIssues,
} from "../services/decisions";
import { DocumentContent } from "../components/DocumentModal";
import { AgendaDocument, agendaItemText } from "../components/AgendaModal";
import AgendaResultsModal from "../components/AgendaResultsModal";
import { SessionsPage } from "../pages/ReferencePages";
import CasesList from "../pages/CasesList";
import CaseWorkspace from "../pages/CaseWorkspace";
import NotificationsPage from "../pages/NotificationsPage";
import ConsiderationProcess from "../components/ConsiderationProcess";
import { caseCsv } from "../../../utils/download";
import { pathForRoute, routeFromPath } from "../routing";
import { DEMO_USER } from "../../../config";
import { actionForm } from "../formDefinitions";

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
  if (h.c.status !== "received") return;
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
  h.run("analysis", "work", values);
}
function prepare(h: Harness, partial = false) {
  screen(h);
  h.run("request", "work", {
    recipient: "ДВГА по Атырауской области",
    deadline: "2026-09-10T18:00",
  });
  h.run("send-request-approval", "work");
  h.run("approve-request", "deputy", { approved: "on" });
  h.run("sign-request", "director");
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
  h.run("approve-response", "dvga");
  h.run("sign-response", "dvga");
  h.run("position", "work");
  analysis(h, partial);
  h.run("members", "work", {
    shared: "on",
    position: "Все позиции зафиксированы",
  });
}
function voteAndSign(h: Harness) {
  const values: Record<string, string> = {
    protocolDate: "2026-09-10",
    protocolMember_1: "Председатель Апелляционной комиссии: ФИО",
    protocolMember_2: "Директор ДМБУА: ФИО",
  };
  for (const point of h.c.issues.filter((item) => item.disputed)) {
    values[`protocolVote_${point.id}_protocol-member-1`] = "accept";
    values[`protocolVote_${point.id}_protocol-member-2`] = "accept";
  }
  h.run("vote", "work", values);
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
  assert.deepEqual(state.cases.slice(0, 3).map(filingDeadline), [
    "2026-09-10",
    "2026-09-16",
    "2026-11-30",
  ]);
  assert.deepEqual(state.cases.slice(0, 3).map(reviewDeadline), [
    "2026-09-24",
    "2026-10-14",
    "2026-10-12",
  ]);
  assert.deepEqual(state.cases.slice(0, 3).map(executionDeadline), [
    "2026-09-07",
    "2026-09-04",
    "2026-09-02",
  ]);
  const requestStepCase = state.cases[0];
  for (const status of [
    "accepted",
    "requested",
    "request_approval",
    "request_signed",
  ] as const) {
    assert.equal(executionDeadline({ ...requestStepCase, status }), "2026-09-07");
  }
  assert.equal(
    executionDeadline({ ...requestStepCase, status: "request_approved" }),
    null,
  );
  assert.equal(
    executionDeadline({
      ...requestStepCase,
      status: "materials",
      pauseDays: 3,
    }),
    "2026-09-15",
  );
  assert.equal(
    executionDeadline({
      ...requestStepCase,
      status: "commission_voting",
      agendaMeetingDate: "2026-09-24",
      attendanceMeetingDate: "2026-09-25",
    }),
    "2026-09-25",
  );
  assert.equal(
    executionDeadline({
      ...requestStepCase,
      status: "meeting",
      attendanceMeetingDate: "2026-09-25",
    }),
    "2026-09-28",
  );
  for (const status of [
    "decision_project",
    "decision_project_approval",
    "decision_project_signed",
    "decision_project_eotinish",
    "decision_project_hearing",
  ] as const) {
    assert.equal(executionDeadline({ ...requestStepCase, status }), "2026-09-21");
  }
  for (const status of [
    "decided",
    "final_response_approval",
    "final_response_signed",
  ] as const) {
    assert.equal(executionDeadline({ ...requestStepCase, status }), "2026-09-24");
  }
  assert.equal(
    executionDeadline({
      ...requestStepCase,
      status: "protocol",
      meeting: {
        date: "2026-09-25",
        number: "ПР-01",
        audio: "",
        projectReceived: "2026-09-25",
      },
    }),
    "2026-09-28",
  );
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
    state.cases.every((c) => c.status === "accepted"),
    true,
  );
});

test("запрос в другой орган использует отдельный шаблон и сохраняет исполнителя", () => {
  const h = harness();
  screen(h);
  h.run("request-other", "work", {
    recipient: "Экспертная организация",
    customRequestText: "Просим представить экспертное заключение.",
  });
  assert.deepEqual(h.c.requests.at(-1), {
    id: "request-1",
    recipient: "Экспертная организация",
    date: "2026-09-08",
    text:
      "Запрос сформирован для Экспертная организация. Срок рассмотрения: 2026-09-10T18:00.",
    deadline: "2026-09-10T18:00",
    template: "other",
    author: DEMO_USER.fullName,
    customText: "Просим представить экспертное заключение.",
  });
  assert.equal(
    h.c.documents.some((document) => document.kind === "request-appendix"),
    false,
  );
  const html = renderToStaticMarkup(
    createElement(DocumentContent, {
      c: h.c,
      kind: "request",
      document: h.c.documents[0],
    }),
  );
  assert.match(html, /Экспертная организация/);
  assert.match(html, /Просим представить экспертное заключение/);
  assert.match(html, new RegExp(DEMO_USER.fullName));
  assert.throws(
    () => h.run("send-request-approval", "work"),
    /недоступно/,
  );
});

test("печатная форма запроса использует полный орган и первый абзац по виду обращения", () => {
  const h = harness();
  h.c.org = "ГУ «Объект»";
  h.c.issuer = "ДВГА по Атырауской области";
  h.c.document = { ...h.c.document, number: "Д-01", date: "2026-08-30" };
  const requestPreview = {
    recipient: "ДВГА по Атырауской области",
    deadline: "2026-09-10T18:00",
    template: "dvga" as const,
  };
  const html = () =>
    renderToStaticMarkup(
      createElement(DocumentContent, {
        c: h.c,
        kind: "request",
        requestPreview,
      }),
    );
  const fullDvga =
    "Департамент внутреннего государственного аудита по Атырауской области Комитета внутреннего государственного аудита Министерства финансов Республики Казахстан";

  h.c.appealType = "Возражение на уведомления";
  assert.match(html(), new RegExp(fullDvga));
  assert.match(html(), /возражения от ГУ «Объект», ИИН\/БИН/);
  assert.match(html(), /к уведомлению об устранении нарушений от 30\.08\.2026 года № Д-01, направленного по результатам камерального контроля/);
  assert.match(html(), /в соответствии с пунктом 14 Положения об апелляционной комиссии/);
  assert.match(
    html(),
    /Директор Департамента<br\/>апелляции по внутреннему<br\/>государственному аудиту/,
  );
  assert.match(html(), /Ш\. Күреңбек тегі/);
  assert.match(html(), new RegExp(DEMO_USER.fullName));

  h.c.appealType = "Возражение на аудиторский отчет";
  assert.match(html(), /возражения ГУ «Объект» к нарушениям, указанным в аудиторском отчете от 30\.08\.2026 №Д-01/);

  h.c.appealType = "Заявление";
  assert.match(html(), /заявления ГУ «Объект», просим в срок до 18:00 часов 10\.09\.2026/);

  h.c.appealType = "Жалоба на решение КВГА/ДВГА";
  h.c.agendaDetails = { decisionKind: "quality-control" };
  assert.match(html(), /жалобы ГУ «Объект» на решение контроля качества от 30\.08\.2026 №Д-01/);

  h.c.agendaDetails = {
    decisionKind: "prescription-preventive",
    relatedDocumentDate: "2026-08-28",
    relatedDocumentNumber: "ПК-33",
  };
  assert.match(html(), /на предписание на акт о результате профилактического контроля от 28\.08\.2026 №ПК-33/);

  h.c.agendaDetails = {
    decisionKind: "prescription-audit",
    relatedDocumentDate: "2026-08-27",
    relatedDocumentNumber: "АО-33",
  };
  assert.match(html(), /на предписание на аудиторский отчет от 27\.08\.2026 №АО-33/);

  h.c.appealType = "Жалоба на действие/бездействие";
  h.c.agendaDetails = {};
  assert.match(html(), /касательно действия\/бездействия .* на аудиторский отчет от 30\.08\.2026 №Д-01/);

  h.c.agendaDetails = {
    procurementNumber: "2026-77",
    lotNumber: "5",
    procurementSubject: "Поставка оборудования",
  };
  assert.match(html(), /при рассмотрении обращения от 30\.08\.2026 №Д-01 по государственной закупке № 2026-77 \(лот №5\) на Поставка оборудования/);

  h.c.appealType = "Жалоба на акт о результате профилактического контроля";
  assert.match(html(), /на акт о результате профилактического контроля .* от 30\.08\.2026 №Д-01/);
});

test("исходное обращение использует реквизиты формы заполнения", () => {
  const h = harness(2);
  h.c.appealType = "Жалоба на решение КВГА/ДВГА";
  h.c.appealNumber = "ЖАЛ-77";
  h.c.appealDate = "2026-09-07";
  h.c.channel = "E-Otinish";
  h.c.request = "Краткое описание обращения";
  h.c.agendaDetails = {
    decisionKind: "prescription-audit",
    relatedDocumentNumber: "АО-77",
    relatedDocumentDate: "2026-09-01",
  };
  h.c.documents.push({
    name: "Требования.pdf",
    filename: "Требования.pdf",
    kind: "attachment",
    text: "Требования заявителя",
    date: h.state.date,
    author: "Заявитель",
  });
  const html = renderToStaticMarkup(
    createElement(DocumentContent, { c: h.c, kind: "original" }),
  );
  assert.match(html, /Вид обращения:/);
  assert.match(html, /Номер возражения, жалобы, заявления:/);
  assert.match(html, /Портал \/ цифровая система, по которой поступило уведомление:/);
  assert.match(html, /Вид обжалуемого решения:/);
  assert.match(html, /Требования\.pdf/);
  assert.doesNotMatch(html, /Орган, чей документ обжалуется:/);
  assert.doesNotMatch(html, /<b>Адресат:<\/b>/);
});

test("ответ ДВГА доступен после согласования, даже если создан запрос в другой орган", () => {
  const h = harness();
  screen(h);
  h.c.appealNumber = "ВОЗ-77";
  h.c.appealDate = "2026-09-08";
  h.run("request", "work", {
    recipient: "ДВГА по Атырауской области",
  });
  h.run("request-other", "work", {
    recipient: "Экспертная организация",
    customRequestText: "Просим предоставить заключение.",
  });
  h.run("send-request-approval", "work");
  h.run("approve-request", "deputy", { approved: "on" });
  assert.equal(nextAction(h.c)?.action, "sign-request");
  h.run("sign-request", "director");
  assert.equal(nextAction(h.c)?.action, "fill-request-response");
  assert.ok(
    h.state.notifications.some(
      (notification) => notification.recipient === "ДВГА",
    ),
  );
  assert.ok(
    h.state.notifications.some(
      (notification) => notification.recipient === h.c.org,
    ),
  );
  const notificationsHtml = renderToStaticMarkup(
    createElement(NotificationsPage, {
      notifications: h.state.notifications,
      onOpenCase() {},
    }),
  );
  assert.match(notificationsHtml, /Уведомления/);
  assert.match(notificationsHtml, /ВОЗ-77 от 08\.09\.2026/);
});

test("ответ КВГА сначала фиксируется инициатором", () => {
  const h = harness();
  screen(h);
  h.run("request", "work", { recipient: "КВГА" });
  h.run("request-other", "work", {
    recipient: "Экспертная организация",
    customRequestText: "Просим предоставить заключение.",
  });
  h.run("send-request-approval", "work");
  h.run("approve-request", "deputy", { approved: "on" });
  h.run("sign-request", "director");
  h.run(
    "fill-request-response",
    "kvga",
    Object.fromEntries(
      h.c.issues
        .filter((point) => point.disputed)
        .flatMap((point) => [
          [`authorityFinding_${point.id}`, "Нарушение КВГА"],
          [`authorityResponse_${point.id}`, "Ответ КВГА"],
        ]),
    ),
  );
  assert.equal(h.c.status, "response_approval");
  assert.equal(nextAction(h.c)?.action, "approve-response");
  h.run("approve-response", "kvga");
  assert.equal(h.c.status, "response_signed");
  assert.equal(nextAction(h.c)?.action, "sign-response");
  h.run("sign-response", "kvga");
  assert.equal(h.c.status, "response_ready");
  assert.equal(nextAction(h.c)?.action, "position");
  h.run("position", "work");
  assert.equal(h.c.status, "request_approved");
  assert.equal(h.c.requests[0].confirmed, "2026-09-08");
  assert.equal(nextAction(h.c)?.action, "position");
  h.run("position", "work");
  assert.equal(h.c.status, "materials");
});

test("ответ КВГА без внешних запросов автоматически переводит обращение на материалы", () => {
  const h = harness();
  screen(h);
  h.run("request", "work", { recipient: "КВГА" });
  h.run("send-request-approval", "work");
  h.run("approve-request", "deputy", { approved: "on" });
  h.run("sign-request", "director");
  h.run(
    "fill-request-response",
    "kvga",
    Object.fromEntries(
      h.c.issues
        .filter((point) => point.disputed)
        .flatMap((point) => [
          [`authorityFinding_${point.id}`, "Нарушение КВГА"],
          [`authorityResponse_${point.id}`, "Ответ КВГА"],
        ]),
    ),
  );
  h.run("approve-response", "kvga");
  h.run("sign-response", "kvga");

  assert.equal(h.c.status, "materials");
  assert.equal(h.c.requests[0].confirmed, "2026-09-08");
  assert.notEqual(nextAction(h.c)?.action, "position");
});

test("фиксация ответа продлевает срок на период приостановления по запросу", () => {
  const h = harness();
  screen(h);
  h.run("request", "work", { recipient: "КВГА" });
  h.run("send-request-approval", "work");
  h.run("approve-request", "deputy", { approved: "on" });
  h.run("sign-request", "director");
  const deadlineBeforePause = reviewDeadline(h.c);
  h.run(
    "fill-request-response",
    "kvga",
    Object.fromEntries(
      h.c.issues
        .filter((point) => point.disputed)
        .flatMap((point) => [
          [`authorityFinding_${point.id}`, "Нарушение"],
          [`authorityResponse_${point.id}`, "Мотивированный ответ"],
        ]),
    ),
  );
  h.run("approve-response", "kvga");
  h.run("sign-response", "kvga");
  h.run("position", "work", { date: "2026-09-11" });
  assert.equal(h.c.pauseDays, 3);
  assert.equal(reviewDeadline(h.c), "2026-09-29");
  assert.notEqual(reviewDeadline(h.c), deadlineBeforePause);
  assert.equal(h.c.requestPauseStartedAt, undefined);
  assert.match(h.c.history.at(-1)!.text, /продлён на 3 раб\. дн\./);
});

test("запросы в ДВГА и КВГА формируются, направляются и обрабатываются отдельно", () => {
  const h = harness();
  screen(h);
  h.run("request", "work", { recipient: "ДВГА по Атырауской области" });
  h.run("request", "work", { recipient: "КВГА" });

  const materialsHtml = renderToStaticMarkup(
    createElement(CaseWorkspace, {
      c: h.c,
      tab: "review",
      role: "work",
      onBack() {},
      onTab() {},
      onAction() {},
      onDocument() {},
      onUpload() {},
    }),
  );
  assert.match(materialsHtml, /<h4>Запрос в ДВГА<\/h4>/);
  assert.match(materialsHtml, /<h4>Запрос в КВГА<\/h4>/);

  const kvgaRequest = h.c.requests.find((request) => request.recipient === "КВГА")!;
  const kvgaAppendix = h.c.documents.find(
    (document) =>
      document.kind === "request-appendix" &&
      document.requestId === kvgaRequest.id,
  )!;
  assert.match(
    renderToStaticMarkup(
      createElement(DocumentContent, {
        c: h.c,
        kind: "request-appendix",
        document: kvgaAppendix,
      }),
    ),
    /Мотивированный ответ КВГА/,
  );

  h.run("send-request-approval", "work");
  h.run("approve-request", "deputy", { approved: "on" });
  h.run("sign-request", "director");
  assert.ok(h.c.requests.every((request) => request.sent === h.state.date));
  assert.ok(
    h.state.notifications.some(
      (notification) => notification.recipient === "ДВГА",
    ),
  );
  assert.ok(
    h.state.notifications.some(
      (notification) => notification.recipient === "КВГА",
    ),
  );
  assert.deepEqual(nextAction(h.c), {
    action: "fill-request-response",
    label: "Заполнить ответ ДВГА/КВГА",
    role: "dvga",
  });
  const awaitingResponsesHtml = renderToStaticMarkup(
    createElement(CaseWorkspace, {
      c: h.c,
      tab: "review",
      role: "work",
      onBack() {},
      onTab() {},
      onAction() {},
      onDocument() {},
      onUpload() {},
    }),
  );
  assert.match(awaitingResponsesHtml, /<h4>Ответ ДВГА<\/h4>/);
  assert.match(awaitingResponsesHtml, /<h4>Ответ КВГА<\/h4>/);
  assert.equal(
    [...awaitingResponsesHtml.matchAll(/Ожидается поступление ответа\./g)].length,
    2,
  );
  assert.deepEqual(nextAction(h.c, "dvga"), {
    action: "fill-request-response",
    label: "Заполнить ответ ДВГА/КВГА",
    role: "dvga",
  });
  assert.deepEqual(nextAction(h.c, "kvga"), {
    action: "fill-request-response",
    label: "Заполнить ответ ДВГА/КВГА",
    role: "kvga",
  });

  const response = Object.fromEntries(
    h.c.issues
      .filter((point) => point.disputed)
      .flatMap((point) => [
        [`authorityFinding_${point.id}`, "Нарушение"],
        [`authorityResponse_${point.id}`, "Мотивированный ответ"],
      ]),
  );
  h.run("fill-request-response", "dvga", response);
  const originalDvgaAppendix = h.c.documents.find(
    (document) =>
      document.kind === "request-appendix" &&
      document.requestId === h.c.requests[0].id,
  )!;
  const completedDvgaAppendix = h.c.documents.find(
    (document) =>
      document.kind === "authority-response-appendix" &&
      document.requestId === h.c.requests[0].id,
  )!;
  assert.doesNotMatch(
    renderToStaticMarkup(
      createElement(DocumentContent, {
        c: h.c,
        kind: "request-appendix",
        document: originalDvgaAppendix,
      }),
    ),
    /<td>Нарушение<\/td>/,
  );
  assert.match(
    renderToStaticMarkup(
      createElement(DocumentContent, {
        c: h.c,
        kind: "authority-response-appendix",
        document: completedDvgaAppendix,
      }),
    ),
    /<td>Нарушение<\/td>/,
  );
  const dvgaResponseHtml = renderToStaticMarkup(
    createElement(CaseWorkspace, {
      c: h.c,
      tab: "review",
      role: "work",
      onBack() {},
      onTab() {},
      onAction() {},
      onDocument() {},
      onUpload() {},
    }),
  );
  assert.match(dvgaResponseHtml, /Приложение к запросу в ДВГА по Атырауской области/);
  assert.equal(
    [...dvgaResponseHtml.matchAll(/Ожидается поступление ответа\./g)].length,
    1,
  );
  h.c.documents.push({
    name: "Подтверждающий документ ДВГА.pdf",
    filename: "Подтверждающий документ ДВГА.pdf",
    kind: "authority-response-attachment",
    text: "Вложение к ответу ДВГА",
    date: h.state.date,
    author: "ДВГА",
    requestId: h.c.requests[0].id,
  });
  const dvgaCabinetHtml = renderToStaticMarkup(
    createElement(CaseWorkspace, {
      c: h.c,
      tab: "review",
      role: "dvga",
      onBack() {},
      onTab() {},
      onAction() {},
      onDocument() {},
      onUpload() {},
    }),
  );
  assert.doesNotMatch(dvgaCabinetHtml, /<h3>Процесс рассмотрения<\/h3>/);
  assert.match(dvgaCabinetHtml, /<h4>Ответ ДВГА<\/h4>/);
  assert.match(dvgaCabinetHtml, /Подтверждающий документ ДВГА\.pdf/);
  const dvgaDocumentsHtml = renderToStaticMarkup(
    createElement(CaseWorkspace, {
      c: h.c,
      tab: "documents",
      role: "dvga",
      onBack() {},
      onTab() {},
      onAction() {},
      onDocument() {},
      onUpload() {},
    }),
  );
  assert.match(dvgaDocumentsHtml, /Подтверждающий документ ДВГА\.pdf/);
  const kvgaForm = actionForm("fill-request-response", h.c, h.state.date, {}, "kvga");
  assert.equal(
    kvgaForm.fields.find(
      (field) => field.name === `authorityFinding_${h.c.issues[0].id}`,
    )?.value,
    "",
  );
  assert.equal(
    kvgaForm.fields.find(
      (field) => field.name === `authorityResponse_${h.c.issues[0].id}`,
    )?.value,
    "",
  );
  assert.deepEqual(nextAction(h.c, "kvga"), {
    action: "fill-request-response",
    label: "Заполнить ответ ДВГА/КВГА",
    role: "kvga",
  });
  h.run("approve-response", "dvga");
  h.run("sign-response", "dvga");
  h.run("position", "work");
  assert.deepEqual(nextAction(h.c), {
    action: "fill-request-response",
    label: "Заполнить ответ ДВГА/КВГА",
    role: "kvga",
  });
  h.run("fill-request-response", "kvga", response);
  h.run("approve-response", "kvga");
  h.run("sign-response", "kvga");
  h.run("position", "work");
  assert.equal(h.c.status, "materials");
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
  h.run("approve-final-response", "director");
  h.run("sign-final-response", "director");
  h.run("receipt", "subject", {
    date: "2026-09-09",
    receipt: "Подтверждение вручения",
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
  h.run("approve-final-response", "director");
  h.run("sign-final-response", "director");
  assert.equal(h.c.issues[1].remainingAmount, 2200000);
  h.run("court", "subject", {
    date: "2026-09-14",
    number: "АД-1",
    note: "Квитанция подачи иска (демо)",
  });
  assert.equal(h.c.status, "court");
  assert.match(h.c.court!.effect, /приостановлено/);
  h.run("court-result", "work", { note: "Судебный акт учтён (демо)" });
  assert.equal(h.c.status, "completed");
});

test("профконтроль проходит те же этапы, что и возражение на уведомление", () => {
  const h = harness(2);
  prepare(h);
  const process = renderToStaticMarkup(
    createElement(ConsiderationProcess, {
      c: h.c,
      role: "work",
      onAction() {},
      onHistory() {},
    }),
  );
  assert.match(process, /Запрос/);
  assert.match(process, /Анализ обращения/);
  assert.match(process, /Заседание/);
  assert.match(process, /Решение/);
  h.run("hearing", "work", {
    mode: "favorable",
    reason: "Все доводы удовлетворены",
  });
  voteAndSign(h);
  deliver(h);
  h.run("approve-final-response", "director");
  h.run("sign-final-response", "director");
  assert.equal(h.c.status, "completed");
  assert.equal(h.c.meeting?.number, "ПЗ-09/2026-1");
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

test("результаты голосования по пунктам и обращению используют новые варианты", () => {
  assert.equal(
    pointOutcomeFromVotes({ chair: "accept", member: "accept" }),
    "accept",
  );
  assert.equal(
    pointOutcomeFromVotes({ chair: "reject", member: "reject" }),
    "reject",
  );
  assert.equal(
    pointOutcomeFromVotes({ chair: "partial", member: "partial" }),
    "partial",
  );
  assert.equal(
    pointOutcomeFromVotes({ chair: "refuse", member: "refuse" }),
    "refuse",
  );
  assert.equal(
    pointOutcomeFromVotes({ chair: "accept", member: "reject" }),
    "partial",
  );
  assert.equal(
    pointOutcomeFromVotes({ chair: "partial", member: "refuse" }),
    "partial",
  );
  assert.equal(
    pointOutcomeFromVotes(
      {
        "kenbeil-dm": "reject",
        "abetova-ku": "partial",
        "alieva-at": "accept",
      },
      "kenbeil-dm",
    ),
    "reject",
  );

  const h = harness();
  const points = h.c.issues.filter((point) => point.disputed);
  points.forEach((point) => {
    point.final = "refuse";
  });
  assert.equal(overall(h.c), "refuse");
  points[0].final = "reject";
  assert.equal(overall(h.c), "reject");
  points[0].final = "accept";
  assert.equal(overall(h.c), "partial");
});

test("недостаточные данные и неверная роль не меняют исходное состояние", () => {
  const h = harness();
  const original = structuredClone(h.state);
  assert.throws(() => h.run("request", "dvga"), /недоступно/);
  assert.throws(() => h.run("request", "work"), /Кому направить запрос/);
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
  screen(control);
  control.run("supplement", "work", {
    formal: "on",
    notified: "on",
    text: "Дополнительный довод",
    number: "ДОП-2",
  });
  assert.equal(control.c.extensionDays, 15);
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
  assert.equal(repository.load().cases.length, 6);
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
  const meetingPath = pathForRoute({
    page: "sessions",
    meetingId: "meeting-2",
  });
  assert.equal(meetingPath, "/sessions/meeting-2");
  assert.deepEqual(routeFromPath(meetingPath), {
    page: "sessions",
    meetingId: "meeting-2",
  });
  const incomingForDirector = {
    ...state.cases[0],
    status: "received" as const,
    channel: "SAQ",
    unread: true,
  };
  const registry = renderToStaticMarkup(
    createElement(CasesList, {
      cases: [incomingForDirector],
      date: state.date,
      role: "director",
      onOpen() {},
      onCreate() {},
      onExport() {},
    }),
  );
  assert.match(registry, /ВОЗ-2026-101/);
  assert.match(registry, /Поступило/);
  assert.match(registry, /class="count">1/);
  assert.match(registry, /Направление запроса/);
  assert.match(registry, /Ответ на запрос/);
  assert.match(registry, /Анализ/);
  assert.match(registry, /Заседание/);
  assert.match(registry, /Формирование протокола/);
  assert.match(registry, /Подпись протокола/);
  assert.match(registry, /Заслушивание/);
  assert.match(registry, /Окончательный ответ/);
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

test("сохранённый выбор участников АК переводится на голосование", () => {
  const legacy = initialState();
  legacy.version = 1;
  legacy.cases[0].status = "commission_members";
  const storage = new Map<string, string>([
    [STORAGE_KEY, JSON.stringify(legacy)],
  ]);
  const state = createDemoRepository({
    getItem: (key) => storage.get(key) || null,
    setItem: (key, value) => storage.set(key, value),
  }).load();
  assert.equal(state.version, 9);
  assert.deepEqual(state.agendas, []);
  assert.deepEqual(state.notifications, []);
  assert.deepEqual(state.attendancePolls, []);
  assert.equal(state.cases[0].status, "commission_voting");
});

test("обращение из SAQ направляется директору, затем исполнителю рабочего органа", () => {
  const base = initialState().cases[0];
  const incoming = makeCase({
    ...base,
    id: "ВОЗ-2026-SAQ",
    appealNumber: "ВОЗ-SAQ-01",
    channel: "SAQ",
  });
  const state: DemoState = {
    ...initialState(),
    cases: [incoming],
    notifications: [
      {
        id: "notification-incoming",
        caseId: incoming.id,
        recipient: "Директор ДАВГА",
        date: "2026-09-08",
        read: false,
        text: "Поступило обращение. Выберите исполнителя рабочего органа.",
      },
    ],
  };
  assert.equal(incoming.status, "received");
  assert.equal(incoming.unread, true);
  assert.equal(nextAction(incoming)?.action, "assign-work-executor");
  const form = new FormData();
  form.set("assignee", "Главный эксперт ДАВГА");
  const next = applyAction(
    state,
    incoming.id,
    "assign-work-executor",
    "director",
    form,
  );
  assert.equal(next.cases[0].status, "accepted");
  assert.equal(next.cases[0].unread, false);
  assert.equal(next.cases[0].assignee, "Главный эксперт ДАВГА");
  assert.equal(next.notifications.at(-1)?.recipient, "Главный эксперт ДАВГА");
});

test("направленные членам АК материалы сразу появляются в реестре заседаний", () => {
  const h = harness();
  h.c.status = "documents_review";
  const html = renderToStaticMarkup(
    createElement(SessionsPage, {
      cases: [h.c],
      agendas: [],
      onOpen() {},
      onAgenda() {},
      onOpenAgendaCase() {},
      onPreviewAgenda() {},
      onDownloadAgenda() {},
      onGenerateAgendaResults() {},
      onPreviewAgendaResults() {},
      onDownloadAgendaResults() {},
    }),
  );
  assert.match(html, new RegExp(h.c.id));
  assert.match(html, /Ознакомление с документами/);
});

test("в других действиях нет отказа или оставления без рассмотрения", () => {
  const h = harness();
  for (const status of ["accepted", "requested", "documents_review"] as const) {
    h.c.status = status;
    const actions = additionalActions(h.c).map((action) => action.action);
    assert.ok(!actions.includes("refuse"));
    assert.ok(!actions.includes("withdraw"));
  }
  h.c.status = "materials";
  assert.ok(!additionalActions(h.c).some((action) => action.action === "pause"));
});

test("голосование членов АК и формирование протокола доступны параллельно", () => {
  const h = harness();
  h.c.status = "commission_voting";
  h.c.members = [
    {
      id: "protocol-member-1",
      name: "Председатель Апелляционной комиссии: ФИО",
      present: true,
      recused: false,
      reason: "",
    },
    {
      id: "protocol-member-2",
      name: "Директор ДМБУА: ФИО",
      present: true,
      recused: false,
      reason: "",
    },
  ];
  assert.equal(nextAction(h.c)?.action, "commission-vote");
  assert.deepEqual(
    additionalActions(h.c).find((action) => action.action === "vote"),
    {
      action: "vote",
      label: "Сформировать протокол заседания",
      role: "work",
    },
  );
  assert.deepEqual(
    additionalActions(h.c).find(
      (action) => action.action === "fill-meeting-certificate",
    ),
    {
      action: "fill-meeting-certificate",
      label: "Заполнить справку",
      role: "work",
    },
  );
  const process = renderToStaticMarkup(
    createElement(ConsiderationProcess, {
      c: h.c,
      role: "work",
      onAction() {},
      onHistory() {},
    }),
  );
  assert.match(process, /Проголосовать/);
  assert.doesNotMatch(process, /Сформировать протокол заседания/);
  assert.match(process, /Заполнить справку/);
  assert.doesNotMatch(process, /голосуют параллельно/);

  h.run("vote", "work", {
    number: "ПР-18",
    protocolDate: "2026-09-10",
    protocolMember_1: "Председатель Апелляционной комиссии: ФИО",
    protocolMember_2: "Директор ДМБУА: ФИО",
    ...Object.fromEntries(
      h.c.issues
        .filter((point) => point.disputed)
        .flatMap((point) => [
          [`protocolVote_${point.id}_protocol-member-1`, "accept"],
          [`protocolVote_${point.id}_protocol-member-2`, "partial"],
        ]),
    ),
  });
  assert.equal(h.c.status, "protocol");
  assert.notEqual(nextAction(h.c)?.action, "commission-vote");
  assert.ok(
    !additionalActions(h.c).some(
      (action) => action.action === "commission-vote",
    ),
  );
});

test("рабочий орган видит статусы ответов по направленным запросам", () => {
  const h = harness();
  screen(h);
  h.run("request", "work", {
    recipient: "ДВГА по Атырауской области",
    deadline: "2026-09-10T18:00",
  });
  h.run("send-request-approval", "work");
  h.run("approve-request", "deputy", { approved: "on" });
  h.run("sign-request", "director");
  h.c.requests.push({
    id: "subject-request",
    recipient: "Кабинет Объекта",
    date: "2026-09-04",
    text: "Предоставить пояснения",
    deadline: "2026-09-10T18:00",
    sent: "2026-09-04",
    responded: "2026-09-05",
    template: "other",
    saqRecipient: "subject",
  });

  const html = renderToStaticMarkup(
    createElement(ConsiderationProcess, {
      c: h.c,
      role: "work",
      onAction() {},
      onHistory() {},
    }),
  );
  assert.match(html, /Ожидание ответов/);
  assert.match(html, /ДВГА по Атырауской области/);
  assert.match(html, /Ответ ожидается/);
  assert.match(html, /Кабинет Объекта/);
  assert.match(html, /Ответ получен/);
});

test("справка редактируется с созданием новой версии перед формированием протокола", () => {
  const h = harness();
  const point = h.c.issues.find((item) => item.disputed)!;
  h.c.status = "meeting";
  h.c.certificate = {
    davgaArguments: "Первоначальные доводы ДАВГА",
    davgaArgumentsByPoint: { [point.id]: "Первоначальные доводы ДАВГА" },
    memberPositions: [],
  };
  h.c.documents.push({
    name: "Справка: результаты голосования членов АК",
    kind: "certificate",
    text: "Первоначальная версия",
    date: "2026-09-04",
    author: "Рабочий орган ДАВГА",
    snapshot: structuredClone({
      issues: h.c.issues,
      result: null,
      members: h.c.members,
      votes: null,
      meeting: null,
      hearing: null,
      delivery: null,
      certificate: h.c.certificate,
    }),
  });
  assert.deepEqual(
    additionalActions(h.c).find((action) => action.action === "edit-certificate"),
    { action: "edit-certificate", label: "Редактировать справку", role: "work" },
  );
  assert.ok(
    !additionalActions(h.c).some((action) =>
      ["pause", "postpone", "return-analysis"].includes(action.action),
    ),
  );

  h.run("edit-certificate", "work", {
    ...Object.fromEntries(
      h.c.issues
        .filter((item) => item.disputed)
        .map((item) => [
          `certificateDavga_${item.id}`,
          item.id === point.id
            ? "Уточнённые доводы ДАВГА"
            : `Доводы ДАВГА по пункту ${item.number}`,
        ]),
    ),
  });
  const certificates = h.c.documents.filter((document) => document.kind === "certificate");
  assert.equal(certificates.length, 2);
  assert.equal(
    certificates.at(-1)?.name,
    "Справка: результаты голосования членов АК. Версия 2",
  );
  assert.equal(
    certificates.at(-1)?.snapshot?.certificate?.davgaArgumentsByPoint?.[point.id],
    "Уточнённые доводы ДАВГА",
  );
  const originalVersionHtml = renderToStaticMarkup(
    createElement(DocumentContent, {
      c: h.c,
      kind: "certificate",
      document: certificates[0],
    }),
  );
  assert.match(originalVersionHtml, /Первоначальные доводы ДАВГА/);
  assert.doesNotMatch(originalVersionHtml, /Уточнённые доводы ДАВГА/);
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
  const requestFormationHtml = renderToStaticMarkup(process());
  assert.match(requestFormationHtml, /Сформировать запрос в ДВГА\/КВГА/);
  assert.match(requestFormationHtml, /Шаги этапа запроса/);
  assert.match(requestFormationHtml, /Формирование запроса/);
  assert.match(requestFormationHtml, /Согласование запроса/);
  assert.match(requestFormationHtml, /Подписание запроса/);
  assert.match(requestFormationHtml, /Ожидание ответа/);
  primaryAction(process())!();
  assert.deepEqual(selected, { action: "request", role: "work" });
  assert.match(
    renderToStaticMarkup(process()),
    /Сформировать запрос в ДВГА\/КВГА/,
  );
  assert.match(
    renderToStaticMarkup(process()),
    /Сформировать запрос в другой орган/,
  );
  h.run("request", "work", {
    recipient: "ДВГА по Атырауской области",
    deadline: "2026-09-10T18:00",
  });
  const requestMaterialsHtml = renderToStaticMarkup(
    createElement(CaseWorkspace, {
      c: h.c,
      tab: "review",
      role: "work",
      onBack() {},
      onTab() {},
      onAction() {},
      onDocument() {},
      onUpload() {},
    }),
  );
  assert.match(requestMaterialsHtml, /Запрос в ДВГА по Атырауской области/);
  assert.match(requestMaterialsHtml, /Приложение к запросу в ДВГА по Атырауской области/);
  assert.match(requestMaterialsHtml, /Запрос в ДВГА/);
  assert.doesNotMatch(requestMaterialsHtml, /Сформированные документы/);
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
  assert.match(
    requestHtml,
    /Департамент внутреннего государственного аудита по Атырауской области Комитета внутреннего государственного аудита Министерства финансов Республики Казахстан/,
  );
  assert.match(requestHtml, /возражения от ГУ «Управление образования», ИИН\/БИН 000000000001/);
  assert.match(requestHtml, /просим представить мотивированный ответ по каждому доводу возражения и подтверждающие документы/);
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
  assert.match(renderToStaticMarkup(process()), /Направить на согласование/);
  h.run("send-request-approval", "work");
  assert.match(renderToStaticMarkup(process()), /Согласовать запрос/);
  h.run("approve-request", "deputy", { approved: "on" });
  assert.match(renderToStaticMarkup(process()), /Подписать запрос/);
  h.run("sign-request", "director");
  const workProcessHtml = renderToStaticMarkup(process());
  assert.match(workProcessHtml, /Ожидание ответа на запрос/);
  assert.doesNotMatch(workProcessHtml, /Заполнить ответ ДВГА\/КВГА/);

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

test("справка формируется с отдельными доводами ДАВГА по каждому оспариваемому пункту", () => {
  const h = harness(0);
  screen(h);
  h.run("request", "work", {
    recipient: "ДВГА по Атырауской области",
    deadline: "2026-09-10T18:00",
  });
  h.run("send-request-approval", "work");
  h.run("approve-request", "deputy", { approved: "on" });
  h.run("sign-request", "director");
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
  h.run("approve-response", "dvga");
  h.run("sign-response", "dvga");
  h.run("position", "work");
  h.run(
    "analysis",
    "work",
    Object.fromEntries(
      h.c.issues
        .filter((point) => point.disputed)
        .map((point) => [
          `davgaArguments_${point.id}`,
          `Доводы ДАВГА для пункта ${point.number}`,
        ]),
    ),
  );
  assert.equal(h.c.status, "certificate_approval");
  const analysisStepsHtml = renderToStaticMarkup(
    createElement(ConsiderationProcess, {
      c: h.c,
      role: "work",
      onAction() {},
      onHistory() {},
    }),
  );
  assert.match(analysisStepsHtml, /Шаги этапа анализа обращения/);
  assert.match(analysisStepsHtml, /Сформировать справку/);
  assert.match(analysisStepsHtml, /Согласовать справку/);
  assert.match(analysisStepsHtml, /Подписать справку/);
  const decisionStepsHtml = renderToStaticMarkup(
    createElement(ConsiderationProcess, {
      c: { ...h.c, status: "meeting" },
      role: "work",
      onAction() {},
      onHistory() {},
    }),
  );
  assert.match(decisionStepsHtml, /Шаги этапа решения/);
  assert.match(decisionStepsHtml, /Сформировать протокол заседания/);
  assert.match(decisionStepsHtml, /Подписать протокол заседания/);
  assert.deepEqual(
    actionForm("analysis", h.c, "2026-09-10").fields
      .filter((field) => field.type === "textarea")
      .map((field) => field.name),
    h.c.issues
      .filter((point) => point.disputed)
      .map((point) => `davgaArguments_${point.id}`),
  );
  const certificateMaterialsHtml = renderToStaticMarkup(
    createElement(CaseWorkspace, {
      c: h.c,
      tab: "review",
      role: "work",
      onBack() {},
      onTab() {},
      onAction() {},
      onDocument() {},
      onUpload() {},
    }),
  );
  assert.match(certificateMaterialsHtml, /<h4>Справка<\/h4>/);
  assert.match(certificateMaterialsHtml, /Скачать Word/);
  const certificateApprovalHtml = renderToStaticMarkup(
    createElement(ConsiderationProcess, {
      c: h.c,
      role: "work",
      onAction() {},
      onHistory() {},
    }),
  );
  assert.match(certificateApprovalHtml, /Заместитель директора ДАВГА/);
  h.run("approve-certificate", "deputy");
  assert.equal(h.c.status, "certificate_signed");
  assert.equal(nextAction(h.c)?.action, "sign-certificate");
  h.run("sign-certificate", "work");
  assert.equal(h.c.status, "certificate_approved");
  assert.equal(nextAction(h.c), null);
  h.c.status = "commission_voting";
  assert.equal(h.c.status, "commission_voting");
  assert.equal(nextAction(h.c)?.action, "commission-vote");
  const commissionMaterialsHtml = renderToStaticMarkup(
    createElement(CaseWorkspace, {
      c: h.c,
      tab: "review",
      role: "work",
      onBack() {},
      onTab() {},
      onAction() {},
      onDocument() {},
      onUpload() {},
    }),
  );
  assert.match(commissionMaterialsHtml, /<h4>Ответ ДВГА<\/h4>/);
  assert.doesNotMatch(commissionMaterialsHtml, /<h4>Запрос в ДВГА<\/h4>/);
  assert.doesNotMatch(commissionMaterialsHtml, /<h4>Запрос в другие органы<\/h4>/);
  const commissionCabinetHtml = renderToStaticMarkup(
    createElement(CaseWorkspace, {
      c: h.c,
      tab: "review",
      role: "commission",
      onBack() {},
      onTab() {},
      onAction() {},
      onDocument() {},
      onUpload() {},
    }),
  );
  assert.doesNotMatch(commissionCabinetHtml, /<h3>Процесс рассмотрения<\/h3>/);
  assert.match(commissionCabinetHtml, /<h4>Запрос в ДВГА<\/h4>/);
  assert.doesNotMatch(commissionCabinetHtml, /<h4>Все документы обращения<\/h4>/);
  assert.match(commissionCabinetHtml, /Ответ ДВГА/);
  // Состав поступает из опроса о присутствии; в сценарии подтверждены два участника.
  h.c.members = h.c.members.slice(0, 2);
  h.run(
    "commission-vote",
    "commission",
    {
      commissionMember: "chair",
      ...Object.fromEntries(
        h.c.issues
          .filter((point) => point.disputed)
          .flatMap((point) => [
            [`commissionVote_${point.id}`, "accept"],
            [`commissionReason_${point.id}`, "Обоснование председателя"],
          ]),
      ),
    },
  );
  assert.equal(h.c.status, "commission_voting");
  h.run(
    "commission-vote",
    "commission",
    {
      commissionMember: "deputy",
      ...Object.fromEntries(
        h.c.issues
          .filter((point) => point.disputed)
          .flatMap((point) => [
            [`commissionVote_${point.id}`, "accept"],
            [`commissionReason_${point.id}`, "Обоснование члена АК"],
          ]),
      ),
    },
  );
  assert.equal(h.c.status, "circulated");
  assert.equal(
    h.c.votes?.[h.c.issues.find((point) => point.disputed)!.id]?.voteReasons?.[
      "chair"
    ],
    "Обоснование председателя",
  );
  assert.throws(
    () => h.run("members", "work", { meetingConducted: "on" }),
    /Сначала заполните и сохраните справку/,
  );
  const lockedMeetingHtml = renderToStaticMarkup(
    createElement(ConsiderationProcess, {
      c: h.c,
      role: "work",
      onAction() {},
      onHistory() {},
    }),
  );
  assert.match(
    lockedMeetingHtml,
    /disabled=""[^>]*>Заседание по данному делу проведено<\/button>/,
  );
  h.run("fill-meeting-certificate", "work", {
    meetingCertificateComment_chair: "Комментарий председателя",
    meetingCertificateComment_deputy: "Комментарий заместителя",
  });
  assert.equal(h.c.certificate?.memberPositions[0]?.name, h.c.members[0]?.name);
  assert.equal(h.c.certificate?.memberPositions[0]?.result, "accept");
  assert.equal(
    h.c.certificate?.memberPositions[0]?.comment,
    "Комментарий председателя",
  );
  assert.equal(h.c.status, "meeting_certificate_approval");
  h.run("approve-meeting-certificate", "director");
  assert.equal(h.c.status, "meeting_certificate_signed");
  h.run("sign-meeting-certificate", "work");
  assert.equal(h.c.status, "meeting_certificate_approved");
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
  assert.match(html, /В Министерство финансов Республики Казахстан поступило возражение/);
  assert.match(html, /Доводы ДВГА\/КВГА:/);
  assert.match(html, /ДВГА:<\/b> Нарушение, заполненное ДВГА/);
  assert.match(html, /Мотивированный ответ ДВГА\/КВГА:/);
  assert.match(html, /ДВГА:<\/b> Мотивированный ответ ДВГА/);
  assert.match(html, /Доводы объекта гос\. аудита \(заявителя\):/);
  assert.match(html, /Доводы ДАВГА для пункта 1/);
  assert.match(html, /Доводы ДАВГА для пункта 2/);
  assert.match(html, /Доводы рабочего органа \(ДАВГА МФ РК\):/);
  assert.match(html, /Председатель комиссии/);
  assert.match(html, /Комментарий председателя/);
  assert.doesNotMatch(html, /ФИО члены АК/);
  assert.match(html, /certificate-members-table/);
  assert.match(html, /КГУ «Школа-лицей № 18»/);
});

test("повестка дня формируется по шаблону возражения на аудиторский отчет", () => {
  const h = harness(0);
  h.c.appealType = "Возражение на аудиторский отчет";
  h.c.appealNumber = "В-17";
  h.c.appealDate = "2026-09-09";
  h.c.org = "КГП «Городской центр услуг»";
  h.c.issuer = "ДВГА по Атырауской области";
  h.c.assignee = "Тестовый исполнитель";
  h.c.bin = "123456789012";
  h.c.document = {
    ...h.c.document,
    number: "АО-2026-0062",
    date: "2026-09-02",
  };
  const html = renderToStaticMarkup(
    createElement(AgendaDocument, {
      cases: [h.c],
      meetingDate: "2026-09-24",
    }),
  );
  assert.match(html, /24\.09\.2026/);
  assert.match(html, /Возражение №В-17 от 09\.09\.2026/);
  assert.match(html, /КГП «Городской центр услуг» ИИН\/БИН 123456789012 на аудиторский отчет от 02\.09\.2026 №АО-2026-0062/);
  assert.match(
    html,
    /проведенного Департамент внутреннего государственного аудита по Атырауской области Комитета внутреннего государственного аудита Министерства финансов Республики Казахстан/,
  );
  assert.match(html, /\(Тестовый исполнитель\)/);
});

test("повестка дня выбирает шаблон по виду обращения", () => {
  const h = harness(0);
  h.c.appealNumber = "В-18";
  h.c.appealDate = "2026-09-09";
  h.c.org = "ГУ «Объект»";
  h.c.bin = "123456789012";
  h.c.issuer = "ДВГА по Атырауской области";
  h.c.assignee = "Исполнитель ДАВГА";
  h.c.document = { ...h.c.document, number: "Д-01", date: "2026-08-30" };

  h.c.appealType = "Возражение на уведомления";
  h.c.agendaDetails = {
    cameraControlNumber: "КК-55",
    cameraControlDate: "2026-08-25",
  };
  assert.equal(
    agendaItemText(h.c),
    "Возражение от ГУ «Объект», ИИН/БИН 123456789012, № В-18 от 09.09.2026 года, к уведомлению об устранении нарушений от 30.08.2026 года № Д-01, направленного по результатам камерального контроля Департамент внутреннего государственного аудита по Атырауской области Комитета внутреннего государственного аудита Министерства финансов Республики Казахстан.",
  );

  h.c.appealType = "Жалоба на действие/бездействие";
  h.c.agendaDetails = {
    procurementNumber: "2026-77",
    lotNumber: "5",
    procurementSubject: "Поставка оборудования",
  };
  assert.match(
    agendaItemText(h.c),
    /при рассмотрении обращения от 30\.08\.2026 №Д-01 по государственной закупке №2026-77 \(лот №5\) на Поставка оборудования \(Исполнитель ДАВГА\)/,
  );

  h.c.agendaDetails = {};
  assert.match(
    agendaItemText(h.c),
    /касательно действия\/бездействия Департамент внутреннего государственного аудита по Атырауской области Комитета внутреннего государственного аудита Министерства финансов Республики Казахстан на аудиторский отчет от 30\.08\.2026 №Д-01/,
  );

  h.c.appealType = "Жалоба на решение КВГА/ДВГА";
  h.c.agendaDetails = {
    decisionKind: "prescription-audit",
    relatedDocumentNumber: "АО-33",
    relatedDocumentDate: "2026-08-28",
  };
  assert.match(
    agendaItemText(h.c),
    /на предписание Департамент внутреннего государственного аудита по Атырауской области Комитета внутреннего государственного аудита Министерства финансов Республики Казахстан от 30\.08\.2026 №Д-01 по аудиторскому отчету №АО-33 от 28\.08\.2026/,
  );

  h.c.agendaDetails = {
    decisionKind: "prescription-preventive",
    relatedDocumentNumber: "ПК-33",
    relatedDocumentDate: "2026-08-27",
  };
  assert.match(
    agendaItemText(h.c),
    /на предписание Департамент внутреннего государственного аудита по Атырауской области Комитета внутреннего государственного аудита Министерства финансов Республики Казахстан от 30\.08\.2026 №Д-01 по профилактическому контролю №ПК-33 от 27\.08\.2026/,
  );

  h.c.agendaDetails = { decisionKind: "quality-control" };
  assert.match(
    agendaItemText(h.c),
    /по результатам контроля качества Департамент внутреннего государственного аудита по Атырауской области Комитета внутреннего государственного аудита Министерства финансов Республики Казахстан от 30\.08\.2026 №Д-01/,
  );

  h.c.appealType = "Жалоба на акт о результате профилактического контроля";
  assert.match(
    agendaItemText(h.c),
    /на акт о результате профилактического контроля Департамент внутреннего государственного аудита по Атырауской области Комитета внутреннего государственного аудита Министерства финансов Республики Казахстан от 30\.08\.2026 №Д-01/,
  );

  h.c.appealType = "Заявление";
  h.c.request = "о предоставлении разъяснения";
  assert.equal(
    agendaItemText(h.c),
    "Заявление №В-18 от 09.09.2026 ГУ «Объект» ИИН/БИН 123456789012 о предоставлении разъяснения.",
  );
});

test("итоги повестки фильтруются по дате и показывают голоса", () => {
  const h = harness(0);
  h.c.agendaMeetingDate = "2026-09-24";
  h.c.members = [
    {
      id: "chair",
      name: "Председатель",
      present: true,
      recused: false,
      reason: "",
    },
    {
      id: "member",
      name: "Член АК",
      present: true,
      recused: false,
      reason: "",
    },
  ];
  h.c.votes = Object.fromEntries(
    h.c.issues
      .filter((point) => point.disputed)
      .map((point) => {
        point.final = "accept";
        return [
          point.id,
          {
            yes: 1,
            no: 1,
            approved: true,
            chair: "chair",
            present: 2,
            eligible: 2,
            votes: { chair: "accept", member: "reject" },
          },
        ];
      }),
  );
  const html = renderToStaticMarkup(
    createElement(AgendaResultsModal, {
      cases: [h.c],
      meetingDate: "2026-09-24",
      onGenerate() {},
      onClose() {},
    }),
  );
  assert.match(html, /Пункт повестки дня/);
  assert.match(html, /Голоса по каждому пункту/);
  assert.match(
    html,
    /Пункт 1: Удовлетворить — Председатель; Отказать в удовлетворении — Член АК/,
  );
  assert.match(html, /Удовлетворить/);
  const emptyHtml = renderToStaticMarkup(
    createElement(AgendaResultsModal, {
      cases: [],
      meetingDate: "2026-09-25",
      onGenerate() {},
      onClose() {},
    }),
  );
  assert.match(emptyHtml, /нет направленных пунктов повестки дня/);
});

test("протокол формируется с выбранными участниками и голосами по пунктам", () => {
  const h = harness();
  const definition = actionForm("vote", h.c, "2026-09-10", {});
  assert.deepEqual(
    definition.fields.map((field) => field.name),
    ["protocolDate", "meetingFormat", "secretary", "recommendations"],
  );
  assert.equal(
    definition.fields.find((field) => field.name === "recommendations")?.required,
    false,
  );
  h.c.status = "meeting";
  h.run("vote", "work", {
    protocolDate: "2026-09-10",
    recommendations: "Направить замечания в орган аудита.",
    protocolMember_1: "Председатель Апелляционной комиссии: ФИО",
    protocolMember_2: "Эксперт ОЮЛ «АЗК»: ФИО",
    ...Object.fromEntries(
      h.c.issues
        .filter((point) => point.disputed)
        .flatMap((point) => [
          [`protocolVote_${point.id}_protocol-member-1`, "accept"],
          [`protocolVote_${point.id}_protocol-member-2`, "reject"],
        ]),
    ),
  });
  assert.deepEqual(
    h.c.members.map((member) => member.name),
    [
      "Председатель Апелляционной комиссии: ФИО",
      "Эксперт ОЮЛ «АЗК»: ФИО",
    ],
  );
  assert.equal(h.c.meeting?.audio, "");
  assert.deepEqual(h.state.recommendations, []);
  assert.equal(h.c.votes?.[h.c.issues.find((point) => point.disputed)!.id]?.yes, 1);
  const protocolHtml = renderToStaticMarkup(
    createElement(DocumentContent, {
      c: h.c,
      kind: "protocol",
      protocolPreview: {
        date: "2026-09-10",
        number: "ПР-17",
        audio: "",
        members: h.c.members,
        votes: {},
      },
    }),
  );
  assert.match(protocolHtml, /Председатель Апелляционной комиссии: ФИО<br\/>/);
  assert.match(protocolHtml, /Эксперт ОЮЛ «АЗК»: ФИО<br\/>/);
  assert.doesNotMatch(
    protocolHtml,
    /Заместитель Председателя Апелляционной комиссии: Директор ДАВГА/,
  );
  assert.doesNotMatch(protocolHtml, /Рекомендации:/);
  assert.match(protocolHtml, /РЕШЕНИЕ частично удовлетворить /);
  const savedProtocolHtml = renderToStaticMarkup(
    createElement(DocumentContent, { c: h.c, kind: "protocol" }),
  );
  assert.match(savedProtocolHtml, /Рекомендации: Направить замечания в орган аудита/);

  const changedPreviewHtml = renderToStaticMarkup(
    createElement(DocumentContent, {
      c: h.c,
      kind: "protocol",
      protocolPreview: {
        date: "2026-09-10",
        number: "ПР-17",
        audio: "",
        members: h.c.members,
        votes: Object.fromEntries(
          h.c.issues
            .filter((point) => point.disputed)
            .map((point) => [
              point.id,
              {
                "protocol-member-1": "refuse",
                "protocol-member-2": "reject",
              },
            ]),
        ),
      },
    }),
  );
  assert.match(
    changedPreviewHtml,
    /РЕШЕНИЕ отказать в удовлетворении /,
  );

  const disputedPoints = h.c.issues.filter((point) => point.disputed);
  disputedPoints[0].final = "reject";
  assert.equal(overall(h.c), "partial");
  const partialProtocolHtml = renderToStaticMarkup(
    createElement(DocumentContent, {
      c: h.c,
      kind: "protocol",
      protocolPreview: {
        date: "2026-09-10",
        number: "ПР-17",
        audio: "",
        members: h.c.members,
        votes: {},
      },
    }),
  );
  assert.match(partialProtocolHtml, /РЕШЕНИЕ частично удовлетворить /);
  disputedPoints.forEach((point) => {
    point.final = "reject";
  });
  assert.equal(overall(h.c), "reject");
  const rejectedProtocolHtml = renderToStaticMarkup(
    createElement(DocumentContent, {
      c: h.c,
      kind: "protocol",
      protocolPreview: {
        date: "2026-09-10",
        number: "ПР-17",
        audio: "",
        members: h.c.members,
        votes: {},
      },
    }),
  );
  assert.match(
    rejectedProtocolHtml,
    /РЕШЕНИЕ отказать в удовлетворении /,
  );
});

test("номер регистрации заключения не заполняется автоматически", () => {
  const h = harness();
  const field = actionForm("deliver", h.c, "2026-09-10", {}).fields.find(
    (item) => item.name === "conclusionRegistrationNumber",
  );
  assert.equal(field?.value, "");
});

test("рекомендации направляются после окончательного ответа в выбранные кабинеты", () => {
  const h = harness();
  h.c.status = "completed";
  h.c.delivery = {
    date: "2026-09-08",
    number: "ИСХ-1",
    receipt: "КВ-1",
    channel: "Кабинет SAQ",
    appealCourt: "",
    appealProcedure: "",
  };
  h.c.documents.push({
    name: "Подписанный окончательный ответ",
    kind: "final-response",
    text: "",
    date: "2026-09-08",
    author: "Директор ДАВГА",
  });
  const form = new FormData();
  form.append("recommendationRecipients", "dvga");
  form.append("recommendationRecipients", "subject");
  form.set("recommendationText", "Устранить выявленные нарушения.");
  h.set(applyAction(h.state, h.c.id, "send-recommendations", "work", form));

  assert.equal(h.state.recommendations.length, 2);
  assert.deepEqual(
    h.state.recommendations.map((recommendation) => recommendation.recipientRole),
    ["dvga", "subject"],
  );
  assert.ok(
    h.state.recommendations.every(
      (recommendation) => recommendation.dueDate === addWorkdays("2026-09-08", 30),
    ),
  );
  assert.equal(
    h.c.documents.filter((document) => document.kind === "recommendation").length,
    2,
  );
  assert.equal(
    h.state.notifications.filter((notification) => notification.kind === "recommendation").length,
    2,
  );
});

test("жалоба из E-Otinish проходит проект решения перед окончательным ответом", () => {
  const h = harness(2);
  h.c.appealType = "Жалоба на решение КВГА/ДВГА";
  h.c.channel = "E-Otinish";
  h.c.status = "protocol";
  h.c.meeting = { date: "2026-09-10", number: "ПР-ЭО-1", audio: "" };
  h.c.issues.filter((point) => point.disputed).forEach((point) => {
    point.final = "accept";
  });

  h.run("sign", "commission", {
    secretary: "on",
    reason: "Решение комиссии сформировано.",
    ...Object.fromEntries(h.c.members.map((member) => [`signed_${member.id}`, "on"])),
  });
  assert.equal(h.c.status, "decision_project");
  assert.equal(nextAction(h.c)?.action, "create-decision-project");
  assert.equal(actionForm("create-decision-project", h.c, h.state.date, {}).title, "Сформировать проект решения");

  h.run("create-decision-project", "work", {
    number: "ПРЕО-1",
    receipt: "КВ-ЭО-1",
    channel: "eotinish",
  });
  assert.equal(h.c.status, "decision_project_approval");
  h.run("approve-decision-project", "director");
  assert.equal(h.c.status, "decision_project_signed");
  h.run("sign-decision-project", "director");
  assert.equal(h.c.status, "decision_project_eotinish");
  h.run("send-decision-project-eotinish", "work");
  assert.equal(h.c.status, "decision_project_hearing");
  h.run("hearing-after-decision-project", "work");
  assert.equal(h.c.status, "decided");
  assert.equal(nextAction(h.c)?.action, "deliver");
});

test("уведомления АК показывают новые опросы первыми и блокируют повторный ответ", () => {
  const html = renderToStaticMarkup(
    createElement(NotificationsPage, {
      notifications: [
        {
          id: "attendance-100-member-1",
          caseId: "ВОЗ-1",
          recipient: "Член АК",
          text: "Старый опрос",
          date: "2026-09-08",
          read: true,
          kind: "attendance-poll",
          attendancePollId: "attendance-100",
          commissionMemberId: "member-1",
        },
        {
          id: "attendance-200-member-1",
          caseId: "ВОЗ-2",
          recipient: "Член АК",
          text: "Новый опрос",
          date: "2026-09-08",
          read: false,
          kind: "attendance-poll",
          attendancePollId: "attendance-200",
          commissionMemberId: "member-1",
        },
      ],
      role: "commission",
      activeCommissionMemberId: "member-1",
      onOpenCase() {},
      onAnswerAttendancePoll() {},
    }),
  );
  assert.ok(html.indexOf("Новый опрос") < html.indexOf("Старый опрос"));
  assert.match(html, /Ответ направлен/);
  assert.match(html, /disabled=""/);
});
