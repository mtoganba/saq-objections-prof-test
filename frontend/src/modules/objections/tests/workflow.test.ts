Warning: truncated output (original token count: 40871)
Total output lines: 4572

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
import {
  COMMISSION_ATTENDANCE_MEMBERS,
  makeCase,
  members,
} from "../../../data/objections";
import type { Action, DemoState, Role } from "../../../types";
import {
  additionalActions,
  applyAction,
  nextAction,
} from "../services/workflow";
import { casesEligibleForMeeting } from "../useObjectionsModel";
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
import {
  appendixPageCount,
  DocumentContent,
  kazakhDecisionIntro,
} from "../components/DocumentModal";
import { AgendaDocument, agendaItemText } from "../components/AgendaModal";
import AgendaResultsModal from "../components/AgendaResultsModal";
import { SessionsPage } from "../pages/ReferencePages";
import CasesList from "../pages/CasesList";
import CaseWorkspace from "../pages/CaseWorkspace";
import NotificationsPage from "../pages/NotificationsPage";
import ConsiderationProcess from "../components/ConsiderationProcess";
import ActionModal from "../components/ActionModal";
import { caseCsv } from "../../../utils/download";
import { auditAuthorityFullName } from "../../../utils/auditAuthority";
import { pathForRoute, routeFromPath } from "../routing";
import { DEMO_USER } from "../../../config";
import { actionForm } from "../formDefinitions";
import {
  PREVENTIVE_CONTROL_ACT_OBJECTION,
  preventiveControlMaterialsOpen,
} from "../appealTypes";
import { nextCaseNumber } from "../services/caseNumbering";
import {
  agendaOrProtocolIntro,
  certificateTemplateIntro,
  requestTemplateIntro,
} from "../services/appealTemplates";

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
          [`authorityResponse_${point.id}`, "Мотивированный ответ ДВГА (демо)"],
        ]),
    ),
  );
  h.run("approve-response", "dvga");
  h.run("sign-response", "dvga");
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

test("по профилактическому контролю материалы сразу открываются АК, а секретарь выбирает состав", () => {
  const h = harness();
  h.c.appealType = PREVENTIVE_CONTROL_ACT_OBJECTION;
  h.c.status = "certificate_signed";
  h.c.certificate = { davgaArguments: "Позиция рабочего органа", memberPositions: [] };

  assert.equal(
    preventiveControlMaterialsOpen(h.c.appealType, h.c.status),
    false,
  );
  h.run("sign-certificate", "work");
  assert.equal(h.c.status, "commission_members");
  assert.equal(
    preventiveControlMaterialsOpen(h.c.appealType, h.c.status),
    true,
  );
  assert.equal(
    h.state.notifications.filter(
      (notification) => notification.kind === "commission-materials",
    ).length,
    COMMISSION_ATTENDANCE_MEMBERS.length,
  );
  assert.equal(
    nextAction(h.c, "work")?.action,
    "select-preventive-attendees",
  );
  assert.equal(
    actionForm(
      "select-preventive-attendees",
      h.c,
      h.state.date,
      {},
      "work",
    ).fields.filter((field) => field.type === "checkbox").length,
    COMMISSION_ATTENDANCE_MEMBERS.length,
  );

  const selectedIds = [
    "kenbeil-dm",
    ...COMMISSION_ATTENDANCE_MEMBERS.filter(
      (member) => member.id !== "kenbeil-dm",
    )
      .slice(0, 6)
      .map((member) => member.id),
  ];
  const attendees = Object.fromEntries(
    selectedIds.map((memberId) => [`attendee_${memberId}`, "on"]),
  );
  const shortAttendees = Object.fromEntries(
    selectedIds.slice(0, 6).map((memberId) => [`attendee_${memberId}`, "on"]),
  );
  assert.throws(
    () => h.run("select-preventive-attendees", "work", shortAttendees),
    /не менее 7 членов/,
  );
  h.run("select-preventive-attendees", "work", attendees);
  assert.equal(h.c.status, "commission_voting");
  assert.deepEqual(
    h.c.members.map((member) => member.id),
    COMMISSION_ATTENDANCE_MEMBERS.filter((member) =>
      selectedIds.includes(member.id),
    ).map((member) => member.id),
  );
  assert.ok(h.c.members.some((member) => member.id === "kenbeil-dm" && member.isChair));
  assert.equal(nextAction(h.c, "commission")?.action, "commission-vote");
});

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
  assert.equal(
    executionDeadline({ ...requestStepCase, status: "received" }),
    requestStepCase.document.received,
  );
  for (const status of [
    "accepted",
    "requested",
    "request_approval",
    "request_signed",
  ] as const) {
    assert.equal(
      executionDeadline({ ...requestStepCase, status }),
      "2026-09-07",
    );
  }
  assert.equal(
    executionDeadline({ ...requestStepCase, status: "request_approved" }),
    "2026-09-07",
  );
  assert.equal(
    executionDeadline({
      ...requestStepCase,
      status: "request_approved",
      requests: [
        {
          id: "request-1",
          recipient: "ДВГА по Атырауской области",
          date: "2026-09-08",
          sent: "2026-09-08",
          text: "Запрос направлен",
          deadline: "2026-09-10T18:00",
          template: "dvga",
        },
      ],
    }),
    "2026-09-10",
  );
  assert.equal(
    executionDeadline(
      {
        ...requestStepCase,
        status: "request_approval",
        requests: [
          {
            id: "request-2",
            recipient: "ДВГА по Атырауской области",
            date: "2026-09-08",
            sent: "2026-09-08",
            text: "Запрос направлен",
            deadline: "2026-09-10T18:00",
            template: "dvga",
          },
        ],
      },
      "dvga",
    ),
    "2026-09-10",
  );
  assert.equal(
    executionDeadline({
      ...requestStepCase,
      status: "materials",
      pauseDays: 3,
    }),
    "2026-09-10",
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
    assert.equal(
      executionDeadline({ ...requestStepCase, status }),
      "2026-09-21",
    );
  }
  for (const status of [
    "decided",
    "final_response_approval",
    "final_response_signed",
  ] as const) {
    assert.equal(
      executionDeadline({ ...requestStepCase, status }),
      "2026-09-24",
    );
  }
  assert.equal(
    executionDeadline({
      ...requestStepCase,
      status: "protocol",
      agendaMeetingDate: "2026-09-25",
      meeting: {
        date: "2026-09-25",
        number: "ПР-01",
        audio: "",
        projectReceived: "2026-09-25",
      },
    }),
    "2026-09-28",
  );
  const reviewDurations = [
    ["Возражение на аудиторский отчет", 30],
    ["Жалоба на уведомление", 20],
    ["Жалоба на решение КВГА/ДВГА", 20],
    ["Жалоба на действие/бездействие", 20],
    ["Возражение на уведомление", 15],
    ["Заявление", 15],
  ] as const;
  for (const [appealType, expected] of reviewDurations)
    assert.equal(
      reviewDuration({
        ...state.cases[1],
        appealType,
        channel: "E-Otinish",
      }),
      expected,
    );
  assert.equal(addMonths("2026-08-31", 3), "2026-11-30");
  assert.equal(
    state.cases.every((c) => c.status === "accepted"),
    true,
  );
});

test("направление запроса в другой орган фиксируется без кабинета SAQ", () => {
  const h = harness();
  screen(h);
  h.run("request-other", "work", {
    recipient: "Экспертная организация",
    date: "2026-09-08",
    registrationNumber: "ИСХ-45",
    deliveryPath: "СЭД",
  });
  assert.deepEqual(h.c.requests.at(-1), {
    id: "request-1",
    recipient: "Экспертная организация",
    date: "2026-09-08",
    text: "Направление запроса в Экспертная организация зафиксировано: №ИСХ-45 от 08.09.2026, СЭД. Ответ ожидается.",
    deadline: "",
    template: "other",
    lifecycleStatus: "waiting_response",
    author: DEMO_USER.fullName,
    registrationNumber: "ИСХ-45",
    deliveryPath: "СЭД",
    sent: "2026-09-08",
  });
  assert.equal(
    h.c.documents.some((document) => document.requestId === "request-1"),
    false,
  );
  const form = actionForm("request-other", h.c, h.state.date, {});
  assert.equal(form.title, "Зафиксировать запрос через другую систему");
  assert.deepEqual(
    form.fields.map((field) => field.name),
    ["date", "recipient", "registrationNumber", "deliveryPath"],
  );
  assert.throws(
    () => h.run("send-request-approval", "work"),
    /недоступно/,
  );

  h.run("request", "work", { recipient: "ДВГА по Атырауской области" });
  h.run("send-request-approval", "work");
  h.run("approve-request", "deputy", { approved: "on" });
  h.run("sign-request", "director");
  const processHtml = renderToStaticMarkup(
    createElement(ConsiderationProcess, {
      c: h.c,
      role: "work",
      onAction() {},
      onHistory() {},
    }),
  );
  assert.match(processHtml, /Экспертная организация/);
  assert.match(processHtml, /Ожидается ответ/);
  assert.match(processHtml, /Запросы и ответы/);
  assert.match(processHtml, /Вложить ответ/);
  assert.match(processHtml, /Текущая задача/);
  assert.doesNotMatch(processHtml, /Сначала сформируйте обязательный запрос/);
});

test("жалобы и заявления не получают уведомление о направлении запроса", () => {
  for (const appealType of ["Жалоба на уведомление", "Заявление"]) {
    const h = harness();
    h.c.appealType = appealType;
    h.c.status = "accepted";
    h.run("request-other", "work", {
      recipient: "Экспертная организация",
      date: h.state.date,
      registrationNumber: "ИСХ-45",
      deliveryPath: "СЭД",
    });
    assert.equal(
      h.state.notifications.some(
        (notification) =>
          notification.caseId === h.c.id &&
          notification.text.startsWith("По Вашему обращению №"),
      ),
      false,
    );
  }

  const h = harness();
  h.c.appealType = "Заявление";
  h.c.status = "accepted";
  h.run("request", "work", {
    recipient: "ДВГА по Атырауской области",
    deadline: "2026-09-10T18:00",
  });
  h.run("send-request-approval", "work");
  h.run("approve-request", "deputy", { approved: "on" });
  h.run("sign-request", "director");
  assert.equal(
    h.state.notifications.some(
      (notification) =>
        notification.caseId === h.c.id &&
        notification.text.startsWith("По Вашему обращению №"),
    ),
    false,
  );
  assert.ok(
    h.state.notifications.some(
      (notification) => notification.recipientRole === "dvga",
    ),
  );
});

test("запрос в кабинет SAQ формируется отдельно от внешней фиксации", () => {
  const h = harness();
  screen(h);
  const form = actionForm("request-saq", h.c, h.state.date, {});
  assert.equal(form.title, "Сформировать запрос в кабинет SAQ");
  assert.deepEqual(
    form.fields.map((field) => field.name),
    ["saqRecipient", "customRequestText"],
  );

  h.run("request-saq", "work", {
    saqRecipient: "subject",
    customRequestText: "Представьте пояснения и подтверждающие документы.",
  });
  assert.deepEqual(h.c.requests.at(-1), {
    id: "request-1",
    recipient: "Кабинет Объекта SAQ",
    date: "2026-09-08",
    text: "Запрос сформирован для Кабинет Объекта SAQ. Срок рассмотрения: 2026-09-10T18:00.",
    deadline: "2026-09-10T18:00",
    template: "other",
    saqRecipient: "subject",
    lifecycleStatus: "draft",
    author: DEMO_USER.fullName,
    customText: "Представьте пояснения и подтверждающие документы.",
  });
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
    "Департаментом внутреннего государственного аудита по Атырауской области Комитета внутреннего государственного аудита Министерства финансов Республики Казахстан";

  h.c.appealType = "Возражение на уведомления";
  assert.match(html(), new RegExp(fullDvga));
  assert.match(html(), /возражения от ГУ «Объект», ИИН\/БИН/);
  assert.match(
    html(),
    /к уведомлению об устранении нарушений от 30\.08\.2026 года № Д-01, направленного по результатам камерального контроля/,
  );
  assert.match(
    html(),
    /в соответствии с пунктом 14 Положения об апелляционной комиссии/,
  );
  assert.match(
    html(),
    /Директор Департамента<br\/>апелляции по внутреннему<br\/>государственному аудиту/,
  );
  assert.match(html(), /Ш\. Күреңбек тегі/);
  assert.match(html(), new RegExp(DEMO_USER.fullName));

  h.c.appealType = "Возражение на аудиторский отчет";
  assert.match(html(), /возражения от ГУ «Объект», БИН 000000000001, №/);
  assert.match(
    html(),
    /на аудиторский отчет от 30\.08\.2026 года № Д-01, проведенный/,
  );

  h.c.appealType = "Заявление";
  assert.match(
    html(),
    /заявления от ГУ «Объект», ИИН\/БИН 000000000001, № ВОЗ-2026-001 от 08\.09\.2026 года Отменить нарушения по пунктам 1 и 2 уведомления\. Пункт 3 не оспаривается, просим представить мотивированный ответ по каждому доводу возражения и подтверждающие документы\./,
  );

  h.c.appealType = "Жалоба на решение КВГА/ДВГА";
  h.c.agendaDetails = { decisionKind: "quality-control" };
  assert.match(
    html(),
    /жалобы от ГУ «Объект», ИИН\/БИН 000000000001, № ВОЗ-2026-001 от 08\.09\.2026 года, на решение по результатам контроля качества от 30\.08\.2026 года № Д-01, проведенный/,
  );

  h.c.agendaDetails = {
    decisionKind: "prescription-preventive",
    relatedDocumentDate: "2026-08-28",
    relatedDocumentNumber: "ПК-33",
  };
  assert.match(
    html(),
    /на предписание по акту о результате профилактического контроля от 30\.08\.2026 года № Д-01, проведенный/,
  );

  h.c.agendaDetails = {
    decisionKind: "prescription-audit",
    relatedDocumentDate: "2026-08-27",
    relatedDocumentNumber: "АО-33",
  };
  assert.match(
    html(),
    /на предписание от 27\.08\.2026 года № АО-33 по аудиторскому отчету, проведенный/,
  );

  h.c.appealType = "Жалоба на действие/бездействие";
  h.c.agendaDetails = {
    actionAppealAuthorities: [
      {
        issuer: "ДВГА по Атырауской области",
        documentNumber: "Д-01",
        documentDate: "2026-08-30",
      },
    ],
  };
  assert.match(
    html(),
    /касательно действий \(бездействий\) Департамента внутреннего государственного аудита по Атырауской области .*при рассмотрении обращения №Д-01 от 30\.08\.2026/,
  );

  h.c.agendaDetails = {
    procurementNumber: "2026-77",
    lotNumber: "5",
    procurementSubject: "Поставка оборудования",
  };
  assert.match(
    html(),
    /касательно действий \(бездействий\).*при рассмотрении обращения №Д-01 от 30\.08\.2026/,
  );

  h.c.appealType = "Жалоба на решение КВГА/ДВГА";
  h.c.agendaDetails = { decisionKind: "preventive-control-act" };
  assert.match(
    html(),
    /на акт о результате профилактического контроля от 30\.08\.2026 года № Д-01, проведенный/,
  );
});

test("справка и протокол используют часть шаблона для аудиторского отчета", () => {
  const h = harness();
  h.c.appealType = "Возражение на аудиторский отчет";
  h.c.org = "ГУ «Объект»";
  h.c.issuer = "ДВГА по Атырауской области";
  h.c.document = { ...h.c.document, number: "Д-01", date: "2026-08-30" };

  const certificate = renderToStaticMarkup(
    createElement(DocumentContent, { c: h.c, kind: "certificate" }),
  );
  const protocol = renderToStaticMarkup(
    createElement(DocumentContent, { c: h.c, kind: "protocol" }),
  );

  assert.match(
    certificate,
    /поступило возражение от ГУ «Объект», БИН 000000000001, № ВОЗ-2026-001 от 08\.09\.2026 года, на аудиторский отчет от 30\.08\.2026 года № Д-01, проведенный/,
  );
  assert.match(
    protocol,
    /Возражение от ГУ «Объект», БИН 000000000001, № ВОЗ-2026-001 от 08\.09\.2026 года, на аудиторский отчет от 30\.08\.2026 года № Д-01, проведенный/,
  );
});

test("возражение на уведомление использует единый шаблон во всех документах", () => {
  const h = harness();
  h.c.appealType = "Возражение на уведомление";
  h.c.org = "ГУ «Объект»";
  h.c.bin = "000000000001";
  h.c.issuer = "ДВГА по Атырауской области";
  h.c.appealNumber = "В-2026-001";
  h.c.appealDate = "2026-09-08";
  h.c.document = { ...h.c.document, number: "Д-01", date: "2026-08-30" };
  const requestPreview = {
    recipient: "ДВГА по Атырауской области",
    deadline: "2026-09-10T18:00",
    template: "dvga" as const,
  };
  const request = renderToStaticMarkup(
    createElement(DocumentContent, {
      c: h.c,
      kind: "request",
      requestPreview,
    }),
  );
  const certificate = renderToStaticMarkup(
    createElement(DocumentContent, { c: h.c, kind: "certificate" }),
  );
  const protocol = renderToStaticMarkup(
    createElement(DocumentContent, { c: h.c, kind: "protocol" }),
  );
  const agenda = agendaItemText(h.c);
  const details =
    "от ГУ «Объект», ИИН/БИН 000000000001, № В-2026-001 от 08.09.2026 года, к уведомлению об устранении нарушений от 30.08.2026 года № Д-01, направленного по результатам камерального контроля Департаментом внутреннего государственного аудита по Атырауской области Комитета внутреннего государственного аудита Министерства финансов Республики Казахстан.";

  assert.match(
    request,
    new RegExp(
      `В связи с поступлением на рассмотрение Апелляционной комиссии Министерства финансов Республики Казахстан возражения ${details.slice(0, -1)}, просим представить мотивированный ответ по каждому доводу возражения и подтверждающие документы\\.`,
    ),
  );
  assert.match(
    certificate,
    new RegExp(`В Министерства финансов Республики Казахстан поступило возражение ${details}`),
  );
  assert.equal(agenda, `Возражение ${details}`);
  assert.match(protocol, new RegExp(`Возражение ${details}`));
});

test("наименования КВГА и ДВГА склоняются во всех вариантах", () => {
  const authorities = [
    "КВГА",
    "ДВГА по Акмолинской области",
    "ДВГА по Актюбинской области",
    "ДВГА по Алматинской области",
    "ДВГА по области Жетісу",
    "ДВГА по Атырауской области",
    "ДВГА по Восточно-Казахстанской области",
    "ДВГА по Жамбылской области",
    "ДВГА по Западно-Казахстанской области",
    "ДВГА по Карагандинской области",
    "ДВГА по Костанайской области",
    "ДВГА по Кызылординской области",
    "ДВГА по Мангыстауской области",
    "ДВГА по Павлодарской области",
    "ДВГА по Северо-Казахстанской области",
    "ДВГА по Туркестанской области",
    "ДВГА по г.Шымкент",
    "ДВГА по г. Алматы",
    "ДВГА по г. Астана",
    "ДВГА по области Ұлытау",
    "ДВГА по области Абай",
  ];

  for (const authority of authorities) {
    const nominative = auditAuthorityFullName(authority);
    assert.equal(
      auditAuthorityFullName(authority, "instrumental"),
      nominative
        .replace(/^Комитет /, "Комитетом ")
        .replace(/^Департамент /, "Департаментом "),
    );
    assert.equal(
      auditAuthorityFullName(authority, "genitive"),
      nominative
        .replace(/^Комитет /, "Комитета ")
        .replace(/^Департамент /, "Департамента "),
    );
  }
});

test("жалоба на уведомление рассматривается без приостановления и использует свои шаблоны", () => {
  const h = harness();
  h.c.appealType = "Жалоба на уведомление";
  h.c.org = "ТОО «Заявитель»";
  h.c.bin = "123456789012";
  h.c.appealNumber = "Ж-2026-01";
  h.c.appealDate = "2026-09-01";
  h.c.issuer = "ДВГА по Атырауской области";
  h.c.document = {
    ...h.c.document,
    received: "2026-09-01",
    number: "УВ-2026-01",
    date: "2026-08-28",
  };
  h.c.pauseDays = 5;

  assert.equal(reviewDuration(h.c), 20);
  assert.equal(reviewDeadline(h.c), "2026-09-29");
  assert.ok(
    !additionalActions(h.c).some((action) => action.action === "pause"),
  );

  const request = renderToStaticMarkup(
    createElement(DocumentContent, {
      c: h.c,
      kind: "request",
      requestPreview: {
        recipient: "ДВГА по Атырауской области",
        deadline: "2026-09-10T18:00",
        template: "dvga",
      },
    }),
  );
  const certificate = renderToStaticMarkup(
    createElement(DocumentContent, { c: h.c, kind: "certificate" }),
  );
  const protocol = renderToStaticMarkup(
    createElement(DocumentContent, { c: h.c, kind: "protocol" }),
  );
  const complaintDetails =
    /от ТОО «Заявитель», ИИН\/БИН 123456789012, № Ж-2026-01 от 01\.09\.2026 года, на уведомление об устранении нарушений от 28\.08\.2026 года № УВ-2026-01, проведенный/;

  assert.match(request, /жалобы от ТОО «Заявитель»/);
  assert.match(request, complaintDetails);
  assert.match(certificate, /поступила жалоба от ТОО «Заявитель»/);
  assert.match(certificate, complaintDetails);
  assert.match(
    protocol,
    /Жалоба от ТОО «Заявитель», ИИН\/БИН 123456789012, № Ж-2026-01 от 01\.09\.2026 года, на уведомление об устранении нарушений от 28\.08\.2026 года № УВ-2026-01, проведенный/,
  );
  assert.match(
    agendaItemText(h.c),
    /Жалоба от ТОО «Заявитель», ИИН\/БИН 123456789012, № Ж-2026-01 от 01\.09\.2026 года, на уведомление об устранении нарушений от 28\.08\.2026 года № УВ-2026-01, проведенный/,
  );
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
  assert.match(
    html,
    /Портал\/цифровая система, по которой поступило обращение:/,
  );
  assert.match(html, /Вид обжалуемого решения:/);
  assert.match(html, /Требования\.pdf/);
  assert.doesNotMatch(html, /Орган, чей документ обжалуется:/);
  assert.doesNotMatch(html, /<b>Адресат:<\/b>/);
});

test("карточка обращения выводит все заполненные реквизиты", () => {
  const h = harness(2);
  h.c.id = "Ж-2026-012";
  h.c.appealType = "Жалоба на действие/бездействие";
  h.c.agendaDetails = {
    auditObjectName: "КГУ «Объект аудита»",
    auditObjectBin: "123456789012",
    applicantIsAuditObjectRepresentative: true,
    procurementNumber: "ГЗ-001",
    lotNumber: "1",
    procurementSubject: "Услуги",
    actionAppealAuthorities: [
      {
        issuer: "ДВГА по Атырауской области",
        documentNumber: "ДВГА-11",
        documentDate: "2026-09-01",
      },
      {
        issuer: "КВГА",
        documentNumber: "КВГА-12",
        documentDate: "2026-09-02",
      },
    ],
  };
  h.c.documents.push(
    {
      name: "Доверенность.pdf",
      filename: "Доверенность.pdf",
      kind: "attachment",
      text: "Доверенность представителя",
      date: h.state.date,
      author: "Заявитель",
    },
    {
      name: "Требования.pdf",
      filename: "Требования.pdf",
      kind: "attachment",
      text: "Требования заявителя",
      date: h.state.date,
      author: "Заявитель",
    },
  );
  const html = renderToStaticMarkup(
    createElement(CaseWorkspace, {
      c: h.c,
      tab: "overview",
      role: "work",
      onBack() {},
      onTab() {},
      onAction() {},
      onDocument() {},
      onUpload() {},
    }),
  );
  assert.match(html, /Номер обращения в системе/);
  assert.match(html, /Ж-2026-012/);
  assert.match(html, /Заявитель является представителем объекта аудита/);
  assert.match(html, /Доверенность\.pdf/);
  assert.match(html, /ДВГА-11/);
  assert.match(html, /КВГА-12/);
  assert.match(html, /Требования\.pdf/);
});

test("системный номер обращения использует общий счётчик по всем видам", () => {
  const cases = [
    { id: "В-2026-004" },
    { id: "Ж-2026-011" },
    { id: "ВОЗ-2026-018" },
    { id: "З-2025-099" },
  ];
  assert.equal(
    nextCaseNumber(cases, "Возражение на уведомление", "2026-10-11"),
    "В-2026-019",
  );
  assert.equal(
    nextCaseNumber(cases, "Жалоба на уведомление", "2026-10-11"),
    "Ж-2026-019",
  );
  assert.equal(
    nextCaseNumber(cases, "Заявление", "2026-10-11"),
    "З-2026-019",
  );
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
  const notificationsHtml = renderToStaticMarkup(
    createElement(NotificationsPage, {
      notifications: h.state.notifications,
      onOpenCase() {},
    }),
  );
  assert.match(notificationsHtml, /Уведомления/);
  assert.match(notificationsHtml, /ВОЗ-77 от 08\.09\.2026/);
});

test("каждый запрос ожидает собственный ответ, после последнего ответа начинается анализ", () => {
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
  assert.equal(h.c.status, "request_approved");
  assert.equal(h.c.requests[0].lifecycleStatus, "response_received");
  const external = h.c.requests.find(
    (request) => request.recipient === "Экспертная организация",
  )!;
  h.run("record-external-response", "work", {
    externalRequestId: external.id,
    date: "2026-09-11",
    responseRegistrationNumber: "ВХ-101",
  });
  assert.equal(h.c.status, "materials");
  assert.equal(
    h.c.requests.find((request) => request.id === external.id)?.lifecycleStatus,
    "response_received",
  );
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

test("срок рассмотрения всех видов жалоб не приостанавливается при запросе", () => {
  const complaintTypes = [
    "Жалоба на уведомление",
    "Жалоба на решение КВГА/ДВГА",
    "Жалоба на действие/бездействие",
  ];
  for (const appealType of complaintTypes) {
    const c = { ...harness().c, appealType, pauseDays: 5 };
    assert.equal(reviewDeadline(c), reviewDeadline({ ...c, pauseDays: 0 }));
    assert.ok(
      !additionalActions(c).some((action) => action.action === "pause"),
    );
  }

  const h = harness();
  h.c.appealType = "Жалоба на решение КВГА/ДВГА";
  screen(h);
  h.run("request", "work", { recipient: "КВГА" });
  h.run("send-request-approval", "work");
  h.run("approve-request", "deputy", { approved: "on" });
  h.run("sign-request", "director");
  assert.equal(h.c.requestPauseStartedAt, undefined);
  assert.match(h.state.notifications.at(-1)!.text, /не приостанавливается/);
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
  h.run("sign-response", "kvga", { date: "2026-09-11" });
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

  const kvgaRequest = h.c.requests.find(
    (request) => request.recipient === "КВГА",
  )!;
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
  const requestIds = h.c.requests.map((request) => request.id);
  requestIds.forEach((requestId) =>
    h.run("approve-request", "deputy", { requestId, approved: "on" }),
  );
  requestIds.forEach((requestId) =>
    h.run("sign-request", "director", { requestId }),
  );
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
    [...awaitingResponsesHtml.matchAll(/Ожидается поступление ответа\./g)]
      .length,
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
  assert.match(
    dvgaResponseHtml,
    /Приложение к запросу в ДВГА по Атырауской области/,
  );
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
  const kvgaForm = actionForm(
    "fill-request-response",
    h.c,
    h.state.date,
    {},
    "kvga",
  );
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
  assert.deepEqual(nextAction(h.c), {
    action: "fill-request-response",
    label: "Заполнить ответ ДВГА/КВГА",
    role: "kvga",
  });
  h.run("fill-request-response", "kvga", response);
  h.run("approve-response", "kvga");
  h.run("sign-response", "kvga");
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
  h.run("request-other", "work", {
    recipient: "Другой орган",
    date: "2026-09-08",
    registrationNumber: "ИСХ-11",
    deliveryPath: "СЭД",
  });
  const externalRequest = h.c.requests.at(-1)!;
  h.run("record-external-response", "work", {
    externalRequestId: externalRequest.id,
    date: "2026-09-11",
    responseRegistrationNumber: "ВХ-11",
  });
  assert.equal(h.c.pauseDays, 3);
  assert.equal(h.c.status, "materials");
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
        text: "Поступило обращение. Выберите исполнителя рабоче…10871 tokens truncated…rkup(
      createElement(DocumentContent, { c: h.c, kind: "protocol" }),
    );
    assert.equal(agendaItemText(h.c), `Жалоба от ${reference}.`);
    assert.match(certificate, new RegExp(`поступила жалоба от ${reference}`));
    assert.match(request, new RegExp(`жалобы от ${reference}, просим`));
    assert.match(protocol, new RegExp(`Жалоба от ${reference}.`));
  };

  checkTemplates(
    "prescription-preventive",
    "ПР-11",
    "2026-09-02",
    "предписание по акту о результате профилактического контроля",
  );
  checkTemplates(
    "preventive-control-act",
    "АКТ-12",
    "2026-09-03",
    "акт о результате профилактического контроля",
  );
  checkTemplates(
    "quality-control",
    "КК-13",
    "2026-09-04",
    "решение по результатам контроля качества",
  );
  checkTemplates(
    "administrative-act",
    "АА-14",
    "2026-09-05",
    "административный акт",
  );
});

test("шаблоны жалобы на действие или бездействие перечисляют все обращения", () => {
  const h = harness(0);
  h.c.appealType = "Жалоба на действие/бездействие";
  h.c.org = "ТОО «Заявитель»";
  h.c.bin = "123456789012";
  h.c.appealNumber = "Ж-22";
  h.c.appealDate = "2026-09-12";
  h.c.agendaDetails = {
    actionAppealAuthorities: [
      {
        issuer: "ДВГА по Атырауской области",
        documentNumber: "ДВГА-11",
        documentDate: "2026-09-01",
      },
      {
        issuer: "КВГА",
        documentNumber: "КВГА-12",
        documentDate: "2026-09-02",
      },
    ],
  };
  const actions =
    "касательно действий (бездействий) Департамента внутреннего государственного аудита по Атырауской области Комитета внутреннего государственного аудита Министерства финансов Республики Казахстан при рассмотрении обращения №ДВГА-11 от 01.09.2026; Комитета внутреннего государственного аудита Министерства финансов Республики Казахстан при рассмотрении обращения №КВГА-12 от 02.09.2026";
  const reference = `ТОО «Заявитель», ИИН/БИН 123456789012, № Ж-22 от 12.09.2026 года, ${actions}`;
  const request = renderToStaticMarkup(
    createElement(DocumentContent, {
      c: h.c,
      kind: "request",
      requestPreview: {
        recipient: "ДВГА",
        deadline: "2026-09-15T18:00",
        template: "dvga",
      },
    }),
  );
  const certificate = renderToStaticMarkup(
    createElement(DocumentContent, { c: h.c, kind: "certificate" }),
  );
  const protocol = renderToStaticMarkup(
    createElement(DocumentContent, { c: h.c, kind: "protocol" }),
  );

  assert.equal(agendaItemText(h.c), `Жалоба от ${reference}.`);
  assert.ok(certificate.includes(`поступила жалоба от ${reference}`));
  assert.ok(request.includes(`жалобы от ${reference}, просим`));
  assert.ok(protocol.includes(`Жалоба от ${reference}.`));
});

test("шаблоны жалобы на действие или бездействие выводят реквизиты госзакупки", () => {
  const h = harness(0);
  h.c.appealType = "Жалоба на действие/бездействие";
  h.c.org = "ТОО «Заявитель»";
  h.c.bin = "123456789012";
  h.c.appealNumber = "Ж-23";
  h.c.appealDate = "2026-09-13";
  h.c.agendaDetails = {
    actionAppealAuthorities: [
      {
        issuer: "ДВГА по Атырауской области",
        documentNumber: "ДВГА-13",
        documentDate: "2026-09-03",
      },
    ],
    procurementNumber: "2026-77",
    lotNumber: "5",
    procurementSubject: "Поставка оборудования",
  };
  const procurement =
    "по государственной закупке № 2026-77, лот № 5, предмет: Поставка оборудования";
  const request = renderToStaticMarkup(
    createElement(DocumentContent, {
      c: h.c,
      kind: "request",
      requestPreview: {
        recipient: "ДВГА",
        deadline: "2026-09-15T18:00",
        template: "dvga",
      },
    }),
  );
  const certificate = renderToStaticMarkup(
    createElement(DocumentContent, { c: h.c, kind: "certificate" }),
  );
  const protocol = renderToStaticMarkup(
    createElement(DocumentContent, { c: h.c, kind: "protocol" }),
  );

  assert.ok(agendaItemText(h.c).includes(procurement));
  assert.ok(certificate.includes(procurement));
  assert.ok(request.includes(`${procurement}, просим`));
  assert.ok(protocol.includes(procurement));
});

test("шаблоны жалобы на действие или бездействие не выводят незаполненный номер лота", () => {
  const h = harness(0);
  h.c.appealType = "Жалоба на действие/бездействие";
  h.c.org = "ТОО «Заявитель»";
  h.c.bin = "123456789012";
  h.c.appealNumber = "Ж-24";
  h.c.appealDate = "2026-09-13";
  h.c.agendaDetails = {
    actionAppealAuthorities: [
      {
        issuer: "ДВГА по Атырауской области",
        documentNumber: "ДВГА-14",
        documentDate: "2026-09-03",
      },
    ],
    procurementNumber: "2026-78",
    procurementSubject: "Поставка оборудования",
  };

  const request = renderToStaticMarkup(
    createElement(DocumentContent, {
      c: h.c,
      kind: "request",
      requestPreview: {
        recipient: "ДВГА",
        deadline: "2026-09-15T18:00",
        template: "dvga",
      },
    }),
  );
  const certificate = renderToStaticMarkup(
    createElement(DocumentContent, { c: h.c, kind: "certificate" }),
  );
  const protocol = renderToStaticMarkup(
    createElement(DocumentContent, { c: h.c, kind: "protocol" }),
  );

  [request, certificate, protocol, agendaItemText(h.c)].forEach((template) => {
    assert.doesNotMatch(template, /лот/i);
    assert.match(template, /по государственной закупке № 2026-78/);
  });
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
    definition.fields.find((field) => field.name === "recommendations")
      ?.required,
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
          [
            `protocolReason_${point.id}_protocol-member-1`,
            `Отредактированное обоснование по пункту ${point.number}.`,
          ],
        ]),
    ),
  });
  assert.deepEqual(
    h.c.members.map((member) => member.name),
    ["Председатель Апелляционной комиссии: ФИО", "Эксперт ОЮЛ «АЗК»: ФИО"],
  );
  assert.equal(h.c.meeting?.audio, "");
  assert.deepEqual(h.state.recommendations, []);
  assert.equal(
    h.c.votes?.[h.c.issues.find((point) => point.disputed)!.id]?.yes,
    1,
  );
  assert.equal(
    h.c.votes?.[h.c.issues.find((point) => point.disputed)!.id]?.voteReasons?.[
      "protocol-member-1"
    ],
    "Отредактированное обоснование по пункту 1.",
  );
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
  assert.match(
    protocolHtml,
    /Наименование органа, вынесшего обжалуемое решение:/,
  );
  assert.doesNotMatch(
    protocolHtml,
    /Заместитель Председателя Апелляционной комиссии: Директор ДАВГА/,
  );
  assert.doesNotMatch(protocolHtml, /Рекомендации:/);
  assert.match(protocolHtml, /РЕШЕНИЕ частично удовлетворить /);
  const savedProtocolHtml = renderToStaticMarkup(
    createElement(DocumentContent, { c: h.c, kind: "protocol" }),
  );
  assert.match(
    savedProtocolHtml,
    /Рекомендации: Направить замечания в орган аудита/,
  );
  assert.match(
    savedProtocolHtml,
    /Отредактированное обоснование по пункту 1\./,
  );

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
  assert.match(changedPreviewHtml, /РЕШЕНИЕ отказать в удовлетворении /);

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
  assert.match(rejectedProtocolHtml, /РЕШЕНИЕ отказать в удовлетворении /);
});

test("номер регистрации заключения не заполняется автоматически", () => {
  const h = harness();
  const field = actionForm("deliver", h.c, "2026-09-10", {}).fields.find(
    (item) => item.name === "conclusionRegistrationNumber",
  );
  assert.equal(field?.value, "");
});

test("мотивированный ответ и проект решения формируются на казахском языке", () => {
  const h = harness();
  h.c.appealDate = "2026-10-13";
  h.c.appealNumber = "В-2026-15";

  h.c.appealType = "Возражение на аудиторский отчет";
  assert.equal(
    kazakhDecisionIntro(h.c),
    "Қазақстан Республикасы Қаржы министрлігінің апелляциялық комиссиясы 13.10.2026 жылғы В-2026-15 қарсылықты қарап, келесіні хабарлайды.",
  );

  h.c.appealType = "Жалоба на уведомление";
  assert.equal(
    kazakhDecisionIntro(h.c),
    "Қазақстан Республикасы Қаржы министрлігінің (бұдан әрі – Министрлік) апелляциялық комиссиясы 13.10.2026 жылғы В-2026-15 шағымды қарап, келесіні хабарлайды.",
  );

  h.c.appealType = "Заявление";
  assert.equal(
    kazakhDecisionIntro(h.c),
    "Қазақстан Республикасы Қаржы министрлігінің (бұдан әрі – Министрлік) апелляциялық комиссиясы 13.10.2026 жылғы В-2026-15 өтінішті қарап, келесіні хабарлайды.",
  );

  h.c.appealType = "Жалоба на уведомление";
  h.c.issues.filter((point) => point.disputed).forEach((point) => {
    point.final = "partial";
  });

  const finalHtml = renderToStaticMarkup(
    createElement(DocumentContent, { c: h.c, kind: "final-response" }),
  );
  const projectHtml = renderToStaticMarkup(
    createElement(DocumentContent, { c: h.c, kind: "decision-project" }),
  );

  assert.match(finalHtml, /қарсылықты ішінара қанағаттандыру туралы шешім қабылдады/);
  assert.match(finalHtml, /91-бабының 6-тармағына сәйкес/);
  assert.match(projectHtml, /қарсылықты ішінара қанағаттандыру туралы шешім қабылдады/);
  assert.match(projectHtml, /73-бабына сәйкес алдын ала шешімге/);
  assert.doesNotMatch(projectHtml, /91-бабының 6-тармағына сәйкес/);

  (
    [
      ["accept", "қанағаттандыру"],
      ["partial", "ішінара қанағаттандыру"],
      ["refuse", "қараудан бас тарту"],
      ["reject", "қанағаттандырудан бас тарту"],
    ] as const
  ).forEach(([outcome, label]) => {
    h.c.issues.filter((point) => point.disputed).forEach((point) => {
      point.final = outcome;
    });
    const html = renderToStaticMarkup(
      createElement(DocumentContent, { c: h.c, kind: "final-response" }),
    );
    assert.match(html, new RegExp(`қарсылықты ${label} туралы шешім қабылдады`));
  });

  assert.equal(
    appendixPageCount([
      {
        number: "1",
        title: "Қысқа мәтін",
        reason: "Негіздеме",
        decision: "қанағаттандыру",
        decidedByMajority: false,
      },
      {
        number: "2",
        title: "Қысқа мәтін",
        reason: "Негіздеме",
        decision: "қанағаттандыру",
        decidedByMajority: false,
      },
    ]),
    1,
  );
  assert.equal(
    appendixPageCount([
      {
        number: "1",
        title: "Негіздеме ".repeat(500),
        reason: "Толық мәтін ".repeat(500),
        decision: "қанағаттандыру",
        decidedByMajority: false,
      },
    ]) > 1,
    true,
  );
});

test("в приложении окончательного ответа отмечается решение большинством голосов", () => {
  const h = harness(1);
  h.c.status = "decided";
  const [firstPoint, secondPoint] = h.c.issues.filter(
    (point) => point.disputed,
  );
  firstPoint.final = "partial";
  secondPoint.final = "partial";

  h.run("deliver", "work", {
    number: "ИСХ-1",
    receipt: "КВ-1",
    channel: "cabinet",
    [`finalResponseMajority_${firstPoint.id}`]: "on",
  });

  assert.ok(
    h.c.documents.some(
      (document) =>
        document.kind === "final-response" &&
        document.name === "Проект окончательного ответа",
    ),
  );

  assert.equal(
    h.c.issues.find((point) => point.id === firstPoint.id)
      ?.finalDecisionByMajority,
    true,
  );
  assert.equal(
    h.c.issues.find((point) => point.id === secondPoint.id)
      ?.finalDecisionByMajority,
    false,
  );
  const html = renderToStaticMarkup(
    createElement(DocumentContent, { c: h.c, kind: "final-response" }),
  );
  assert.match(html, /решение частично удовлетворить большинством голосов\./);
  assert.match(html, /решение частично удовлетворить\.<\/p>/);

  h.run("approve-final-response", "director");
  h.run("sign-final-response", "director");
  assert.deepEqual(h.c.delivery?.recipientRoles, ["dvga", "subject"]);
  assert.deepEqual(
    h.state.notifications
      .filter((notification) => notification.caseId === h.c.id)
      .slice(-2)
      .map((notification) => notification.recipientRole),
    ["dvga", "subject"],
  );
});

test("галочка большинства в мотивированном ответе редактируется", () => {
  const h = harness(1);
  h.c.appealType = "Заявление";
  const [firstPoint, secondPoint] = h.c.issues.filter(
    (point) => point.disputed,
  );
  firstPoint.final = "partial";
  secondPoint.final = "partial";
  h.c.status = "decision_project";

  h.run("create-decision-project", "work", {
    [`finalResponseMajority_${firstPoint.id}`]: "on",
  });
  assert.equal(
    h.c.issues.find((point) => point.id === firstPoint.id)
      ?.finalDecisionByMajority,
    true,
  );
  assert.equal(
    h.c.issues.find((point) => point.id === secondPoint.id)
      ?.finalDecisionByMajority,
    false,
  );

  // В форме мотивированного ответа отметка большинства может быть изменена.
  h.c.status = "decided";
  h.run("deliver", "work", {
    number: "ИСХ-2",
    receipt: "КВ-2",
    channel: "cabinet",
    [`finalResponseMajority_${secondPoint.id}`]: "on",
  });

  assert.equal(
    h.c.issues.find((point) => point.id === firstPoint.id)
      ?.finalDecisionByMajority,
    false,
  );
  assert.equal(
    h.c.issues.find((point) => point.id === secondPoint.id)
      ?.finalDecisionByMajority,
    true,
  );
  const html = renderToStaticMarkup(
    createElement(DocumentContent, { c: h.c, kind: "final-response" }),
  );
  assert.match(html, /решение частично удовлетворить большинством голосов\./);
  assert.match(html, /решение частично удовлетворить\.<\/p>/);
});

test("рекомендации доступны после завершения рассмотрения всех видов обращений", () => {
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
  for (const appealType of [
    "Возражение на аудиторский отчет",
    "Жалоба на уведомление",
    "Жалоба на решение КВГА/ДВГА",
    "Жалоба на действие/бездействие",
    "Возражение на уведомление",
    "Заявление",
  ])
    assert.ok(
      additionalActions({ ...h.c, appealType }).some(
        (action) => action.action === "send-recommendations",
      ),
    );
  const form = new FormData();
  form.append("recommendationRecipients", "dvga");
  form.append("recommendationRecipients", "subject");
  form.set("recommendationText", "Устранить выявленные нарушения.");
  h.set(applyAction(h.state, h.c.id, "send-recommendations", "work", form));

  assert.equal(h.state.recommendations.length, 2);
  assert.deepEqual(
    h.state.recommendations.map(
      (recommendation) => recommendation.recipientRole,
    ),
    ["dvga", "subject"],
  );
  assert.ok(
    h.state.recommendations.every(
      (recommendation) =>
        recommendation.dueDate === addWorkdays("2026-09-08", 30),
    ),
  );
  assert.equal(
    h.c.documents.filter((document) => document.kind === "recommendation")
      .length,
    2,
  );
  assert.equal(
    h.state.notifications.filter(
      (notification) => notification.kind === "recommendation",
    ).length,
    2,
  );
});

test("рекомендация выводится в других действиях по делу", () => {
  const h = harness();
  h.c.status = "completed";
  const processHtml = renderToStaticMarkup(
    createElement(ConsiderationProcess, {
      c: h.c,
      role: "work",
      onAction() {},
      onHistory() {},
    }),
  );
  assert.match(
    processHtml,
    /Другие действия по делу[\s\S]*Направить рекомендации/,
  );
  assert.doesNotMatch(processHtml, /recommendation-action-panel/);
});

test("жалоба из E-Otinish проходит проект решения перед окончательным ответом", () => {
  const h = harness(2);
  h.c.appealType = "Жалоба на решение КВГА/ДВГА";
  h.c.channel = "E-Otinish";
  h.c.status = "protocol";
  h.c.meeting = { date: "2026-09-10", number: "ПР-ЭО-1", audio: "" };
  h.c.issues
    .filter((point) => point.disputed)
    .forEach((point) => {
      point.final = "accept";
    });

  h.run("sign", "commission", {
    secretary: "on",
    reason: "Решение комиссии сформировано.",
    ...Object.fromEntries(
      h.c.members.map((member) => [`signed_${member.id}`, "on"]),
    ),
  });
  assert.equal(h.c.status, "decision_project");
  assert.equal(nextAction(h.c)?.action, "create-decision-project");
  const decisionProjectForm = actionForm(
    "create-decision-project",
    h.c,
    h.state.date,
    {},
  );
  assert.equal(decisionProjectForm.title, "Сформировать проект решения");
  assert.equal(
    decisionProjectForm.fields.some((field) => field.name === "number"),
    false,
  );
  assert.equal(
    decisionProjectForm.fields.some((field) => field.name === "receipt"),
    false,
  );
  assert.equal(
    decisionProjectForm.fields.some((field) => field.name === "channel"),
    false,
  );

  h.run("create-decision-project", "work", {
    projectSubjectChannel: "external",
    [`finalResponseMajority_${h.c.issues.find((point) => point.disputed)!.id}`]:
      "on",
  });
  assert.equal(h.c.status, "decision_project_approval");
  const projectHtml = renderToStaticMarkup(
    createElement(DocumentContent, { c: h.c, kind: "decision-project" }),
  );
  assert.match(projectHtml, /решение удовлетворить большинством голосов\./);
  assert.deepEqual(nextAction(h.c), {
    action: "approve-decision-project",
    label: "Согласовать проект решения",
    role: "deputy",
  });
  assert.throws(
    () => h.run("approve-decision-project", "director"),
    /недоступно/,
  );
  h.run("approve-decision-project", "deputy");
  assert.equal(h.c.status, "decision_project_signed");
  h.run("sign-decision-project", "director");
  assert.equal(h.c.status, "decision_project_delivery");
  const projectDeliveryForm = actionForm(
    "record-decision-project-delivery",
    h.c,
    h.state.date,
    {},
  );
  assert.equal(
    projectDeliveryForm.title,
    "Зафиксировать направление проекта решения заявителю",
  );
  h.run("record-decision-project-delivery", "work", {
    projectSentDate: "2026-09-11",
    projectDeliveryPath: "E-Otinish",
  });
  assert.equal(h.c.status, "decision_project_comments");
  h.run("record-external-decision-project-comment", "work", {
    projectCommentReceivedAt: "2026-09-11",
    projectCommentChannel: "E-Otinish",
    projectComment: "Просим провести заслушивание.",
  });
  assert.equal(h.c.status, "decision_project_eotinish");
  const hearingAssignmentForm = actionForm(
    "send-decision-project-eotinish",
    h.c,
    h.state.date,
    {},
  );
  assert.equal(hearingAssignmentForm.title, "Назначить заслушивание");
  assert.ok(
    hearingAssignmentForm.fields.some(
      (field) => field.name === "hearingDateTime",
    ),
  );
  h.run("send-decision-project-eotinish", "work", {
    hearingDateTime: "2026-09-16T10:30",
    hearingLocation: "онлайн, Qosyl",
    hearingNoticeChannel: "eotinish",
    hearingNoticeDate: "2026-09-11",
  });
  assert.equal(h.c.status, "decision_project_hearing");
  assert.equal(h.c.hearing?.location, "онлайн, Qosyl");
  assert.throws(
    () => h.run("hearing-after-decision-project", "work"),
    /Вложите протокол заслушивания/,
  );
  h.run("hearing-after-decision-project", "work", {
    hearingProtocolAttached: "on",
  });
  assert.equal(h.c.status, "decided");
  assert.equal(h.c.hearing?.held, h.state.date);
  assert.equal(nextAction(h.c)?.action, "deliver");
});

test("протокол заслушивания отображается среди материалов рассмотрения", () => {
  const h = harness(2);
  h.c.appealType = "Жалоба на уведомление";
  h.c.documents.push({
    name: "Подписанный мотивированный ответ",
    kind: "final-response",
    date: h.state.date,
  });
  h.c.motivatedResponseRouting = {
    recipients: [
      {
        id: "applicant",
        recipient: "Заявитель",
        channel: "saq",
        status: "sent",
        sentAt: h.state.date,
      },
      {
        id: "audit-object",
        recipient: "Наименование объекта аудита *",
        channel: "external",
        status: "not_tracked",
      },
    ],
  };
  h.c.documents.push({
    name: "Протокол заслушивания.pdf",
    filename: "Протокол заслушивания.pdf",
    kind: "hearing-protocol-attachment",
    text: "Протокол заслушивания",
    date: h.state.date,
    author: "Рабочий орган",
    dataUrl: "data:application/pdf;base64,AA==",
  });

  const html = renderToStaticMarkup(
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
  assert.match(html, /<h4>Направление мотивированного ответа<\/h4>/);
  assert.match(html, /<h4>Мотивированный ответ<\/h4>/);
  assert.match(html, /<h4>Протокол заслушивания<\/h4>/);
  assert.ok(
    html.indexOf("<h4>Направление мотивированного ответа</h4>") <
      html.indexOf("<h4>Мотивированный ответ</h4>"),
  );
  assert.ok(
    html.indexOf("<h4>Мотивированный ответ</h4>") <
      html.indexOf("<h4>Протокол заслушивания</h4>"),
  );
  assert.doesNotMatch(html, /Наименование объекта аудита/);
  assert.doesNotMatch(
    html,
    /Направление через другую систему не требует фиксации/,
  );
  assert.match(html, /Протокол заслушивания\.pdf/);
});

test("заявление после заслушивания запускает дополнительный запрос и сохраняет версии доводов", () => {
  const h = harness(2);
  h.c.appealType = "Заявление";
  h.c.status = "decision_project_hearing";
  h.c.decisionProject = {
    date: h.state.date,
    number: "ПР-1",
    receipt: "SAQ-1",
    channel: "saq",
    appealCourt: "—",
    appealProcedure: "—",
  };
  h.c.hearing = {
    skip: false,
    date: `${h.state.date}T10:00`,
    location: "онлайн",
  };
  const point = h.c.issues.find((item) => item.disputed)!;
  const hearingForm = actionForm(
    "hearing-after-decision-project",
    h.c,
    h.state.date,
    {},
  );
  assert.ok(
    hearingForm.fields.some((field) => field.name === "hearingHasNewArguments"),
  );
  assert.ok(
    hearingForm.fields.some((field) => field.name === "hearingNextAction"),
  );
  const additionalHearingForm = actionForm(
    "hearing-after-decision-project",
    h.c,
    h.state.date,
    {
      hearingHasNewArguments: "yes",
      hearingNextAction: "return-request",
      [`hearingArgumentPoint_${point.id}`]: "on",
    },
  );
  assert.ok(
    additionalHearingForm.fields.some(
      (field) => field.name === `additionalArgument_${point.id}`,
    ),
  );

  h.run("hearing-after-decision-project", "work", {
    hearingProtocolAttached: "on",
    hearingHasNewArguments: "yes",
    hearingNextAction: "return-request",
    [`hearingArgumentPoint_${point.id}`]: "on",
    [`additionalArgument_${point.id}`]: "Дополнительное пояснение заявителя",
  });
  assert.equal(h.c.status, "accepted");
  assert.equal(h.c.requestRoute, "additional-hearing");
  assert.equal(h.c.hearingSupplements?.[0]?.requiresRequest, true);
  assert.deepEqual(
    h.c.issues.find((item) => item.id === point.id)?.additionalArguments,
    ["Дополнительное пояснение заявителя"],
  );
  const hearingArgumentsDocument = h.c.documents.find(
    (document) => document.kind === "hearing-additional-arguments",
  )!;
  assert.match(
    renderToStaticMarkup(
      createElement(DocumentContent, {
        c: h.c,
        kind: hearingArgumentsDocument.kind,
        document: hearingArgumentsDocument,
      }),
    ),
    /Дополнительное пояснение заявителя/,
  );

  h.run("request", "work", {
    recipient: "ДВГА по Атырауской области",
  });
  const requestAppendix = h.c.documents.find(
    (document) => document.kind === "request-appendix",
  )!;
  const requestHtml = renderToStaticMarkup(
    createElement(DocumentContent, {
      c: h.c,
      kind: "request-appendix",
      document: requestAppendix,
    }),
  );
  assert.match(requestHtml, /Дополнительное пояснение заявителя/);
  h.run("send-request-approval", "work");
  h.run("approve-request", "deputy", { approved: "on" });
  h.run("sign-request", "director");
  h.run(
    "fill-request-response",
    "dvga",
    Object.fromEntries(
      h.c.issues
        .filter((item) => item.disputed)
        .flatMap((item) => [
          [`authorityFinding_${item.id}`, "Новое нарушение, проверенное ДВГА"],
          [`authorityResponse_${item.id}`, "Дополнительный ответ ДВГА"],
        ]),
    ),
  );
  h.run("approve-response", "dvga");
  h.run("sign-response", "dvga");
  assert.equal(h.c.requestRouteCompletedAt, h.state.date);
  analysis(h);
  const certificate = h.c.documents.at(-1)!;
  const certificateHtml = renderToStaticMarkup(
    createElement(DocumentContent, {
      c: h.c,
      kind: "certificate",
      document: certificate,
    }),
  );
  assert.match(
    certificateHtml,
    /Дополнительные доводы объекта гос\. аудита \(заявителя\):/,
  );
  assert.doesNotMatch(certificateHtml, /представленные на заслушивании/);
  assert.match(certificateHtml, /Дополнительный мотивированный ответ ДВГА/);
});

test("заявление без дополнительного запроса возвращается к новой справке", () => {
  const h = harness(2);
  h.c.appealType = "Заявление";
  h.c.status = "decision_project_hearing";
  h.c.decisionProject = {
    date: h.state.date,
    number: "ПР-2",
    receipt: "SAQ-2",
    channel: "saq",
    appealCourt: "—",
    appealProcedure: "—",
  };
  h.c.hearing = { skip: false, date: `${h.state.date}T10:00` };
  const point = h.c.issues.find((item) => item.disputed)!;
  h.run("hearing-after-decision-project", "work", {
    hearingProtocolAttached: "on",
    hearingHasNewArguments: "yes",
    hearingNextAction: "return-analysis",
    [`hearingArgumentPoint_${point.id}`]: "on",
    [`additionalArgument_${point.id}`]: "Новый довод, подтверждённый материалами дела",
  });
  assert.equal(h.c.status, "materials");
  assert.equal(h.c.repeatHearingStatus, "required");
  assert.equal(nextAction(h.c)?.action, "analysis");
  assert.match(
    nextAction(h.c)?.label || "",
    /дополнительным доводам после заслушивания/,
  );
});

test("заявление без новых доводов после заслушивания переходит к мотивированному ответу", () => {
  const h = harness(2);
  h.c.appealType = "Заявление";
  h.c.status = "decision_project_hearing";
  h.c.decisionProject = {
    date: h.state.date,
    number: "ПР-3",
    receipt: "SAQ-3",
    channel: "saq",
    appealCourt: "—",
    appealProcedure: "—",
  };
  h.c.hearing = { skip: false, date: `${h.state.date}T10:00` };
  h.run("hearing-after-decision-project", "work", {
    hearingProtocolAttached: "on",
    hearingHasNewArguments: "no",
    hearingNextAction: "proceed",
  });

  assert.equal(h.c.status, "decided");
  assert.equal(h.c.hearingSupplements?.length || 0, 0);
  assert.equal(nextAction(h.c)?.label, "Сформировать мотивированный ответ");
});

test("повторное заседание заявления после первого проекта сразу ведёт к мотивированному ответу", () => {
  const h = harness(2);
  h.c.appealType = "Заявление";
  h.c.decisionProject = {
    date: h.state.date,
    number: "",
    receipt: "",
    channel: "saq",
    appealCourt: "—",
    appealProcedure: "—",
  };
  h.c.repeatHearingStatus = "scheduled";
  h.c.status = "protocol";
  h.c.members = [
    {
      id: "repeat-chair",
      name: "Председатель АК",
      present: true,
      isChair: true,
      recused: false,
      reason: "",
    },
    {
      id: "repeat-member",
      name: "Член АК",
      present: true,
      recused: false,
      reason: "",
    },
  ];
  h.c.votes = Object.fromEntries(
    h.c.issues
      .filter((item) => item.disputed)
      .map((point) => [
        point.id,
        {
          yes: 2,
          no: 0,
          approved: true,
          chair: "repeat-chair",
          present: 2,
          eligible: 2,
          votes: { "repeat-chair": "accept", "repeat-member": "accept" },
          voteReasons: {},
        },
      ]),
  );
  h.c.meeting = {
    date: h.state.date,
    number: "",
    audio: "",
    format: "онлайн, Qosyl",
  };
  assert.equal(nextAction(h.c, "commission")?.action, "sign");
  h.run("sign", "commission", {
    secretary: "on",
    "signed_repeat-chair": "on",
    "signed_repeat-member": "on",
    reason: "Итоговая мотивировка повторного заседания",
  });
  assert.equal(h.c.status, "decided");
  assert.equal(h.c.repeatHearingStatus, undefined);
  assert.equal(nextAction(h.c)?.action, "deliver");
  assert.equal(nextAction(h.c)?.label, "Сформировать мотивированный ответ");
  assert.equal(
    h.c.documents.at(-1)?.name,
    "Подписанный протокол заседания",
  );
});

test("рабочий орган видит статус согласования и подписания проекта решения", () => {
  const h = harness(2);
  h.c.appealType = "Жалоба на решение КВГА/ДВГА";
  h.c.status = "decision_project_approval";
  h.c.documents.push({
    name: "Проект решения",
    kind: "decision-project",
    date: "2026-09-10",
  });

  const approvalHtml = renderToStaticMarkup(
    createElement(ConsiderationProcess, {
      c: h.c,
      role: "work",
      onAction() {},
      onHistory() {},
    }),
  );
  assert.match(approvalHtml, /Информационный блок/);
  assert.match(approvalHtml, /Проект решения/);
  assert.match(approvalHtml, /На согласовании/);
  assert.match(approvalHtml, /Дата формирования: 10\.09\.2026/);

  h.c.status = "decision_project_signed";
  const signatureHtml = renderToStaticMarkup(
    createElement(ConsiderationProcess, {
      c: h.c,
      role: "work",
      onAction() {},
      onHistory() {},
    }),
  );
  assert.match(signatureHtml, /На подписании/);
});

test("рабочий орган видит статус согласования и подписания мотивированного ответа", () => {
  const h = harness(2);
  h.c.appealType = "Заявление";
  h.c.status = "final_response_approval";
  h.c.documents.push({
    name: "Проект мотивированного ответа",
    kind: "final-response",
    date: "2026-09-10",
  });

  const approvalHtml = renderToStaticMarkup(
    createElement(ConsiderationProcess, {
      c: h.c,
      role: "work",
      onAction() {},
      onHistory() {},
    }),
  );
  assert.match(approvalHtml, /Информационный блок/);
  assert.match(approvalHtml, /Мотивированный ответ/);
  assert.match(approvalHtml, /Проект мотивированного ответа/);
  assert.match(approvalHtml, /Ответственный: Заместитель директора ДАВГА/);
  assert.match(approvalHtml, /На согласовании/);
  assert.match(approvalHtml, /Дата формирования: 10\.09\.2026/);

  h.c.status = "final_response_signed";
  const signatureHtml = renderToStaticMarkup(
    createElement(ConsiderationProcess, {
      c: h.c,
      role: "work",
      onAction() {},
      onHistory() {},
    }),
  );
  assert.match(signatureHtml, /Ответственный: Директор ДАВГА/);
  assert.match(signatureHtml, /На подписании/);
});

test("проект решения по жалобе направляется в SAQ и замечания управляют заслушиванием", () => {
  const h = harness(2);
  h.c.appealType = "Жалоба на уведомление";
  h.c.channel = "SAQ";
  h.c.status = "decision_project_signed";
  h.c.decisionProject = {
    date: "2026-09-08",
    number: "",
    receipt: "",
    channel: "",
    appealCourt: "",
    appealProcedure: "",
  };

  h.run("sign-decision-project", "director");
  assert.equal(h.c.status, "decision_project_comments");
  assert.equal(h.c.decisionProjectRouting?.channel, "saq");
  assert.equal(h.c.decisionProjectRouting?.sentAt, h.state.date);
  assert.equal(
    h.c.decisionProjectRouting?.commentsDeadline,
    addWorkdays(h.state.date, 2),
  );
  assert.deepEqual(h.c.decisionProjectRouting?.recipients, [
    {
      id: "subject",
      recipient: h.c.org,
      recipientRole: "subject",
      purpose: "comments",
      channel: "saq",
      status: "sent",
      sentAt: h.state.date,
    },
  ]);
  assert.match(
    h.state.notifications.at(-1)?.text || "",
    /В кабинет направлен проект решения/,
  );

  h.run("submit-decision-project-comment", "subject", {
    projectComment: "Не согласны с проектом решения.",
  });
  assert.equal(h.c.status, "decision_project_eotinish");
  assert.equal(h.c.decisionProjectRouting?.commentChannel, "Кабинет SAQ");
  assert.ok(
    h.c.documents.some(
      (document) => document.kind === "decision-project-comment",
    ),
  );

  h.run("send-decision-project-eotinish", "work", {
    hearingDateTime: "2026-09-14T10:00",
    hearingLocation: "г. Астана, онлайн",
    hearingNoticeChannel: "E-Otinish",
    hearingNoticeDate: "2026-09-11",
  });
  assert.equal(h.c.status, "decision_project_hearing");
  assert.ok(
    h.state.notifications.some(
      (notification) =>
        notification.caseId === h.c.id &&
        notification.recipientRole === "subject" &&
        /извещение о заслушивании/i.test(notification.text),
    ),
  );
});

test("проект решения направляется только заявителю и ждёт внешнюю фиксацию", () => {
  const h = harness(2);
  h.c.appealType = "Жалоба на уведомление";
  h.c.channel = "SAQ";
  h.c.status = "decision_project";

  h.run("create-decision-project", "work", {
    projectSubjectChannel: "external",
  });
  h.run("approve-decision-project", "deputy");
  h.run("sign-decision-project", "director");

  assert.equal(h.c.status, "decision_project_delivery");
  assert.equal(
    h.c.decisionProjectRouting?.recipients.find((item) => item.id === "subject")?.status,
    "pending",
  );
  assert.equal(h.c.decisionProjectRouting?.recipients.length, 1);

  h.run("record-decision-project-delivery", "work", {
    projectSentDate: h.state.date,
    projectDeliveryPath: "СЭД",
    projectRegistrationNumber: "ИСХ-25",
  });

  assert.equal(h.c.status, "decision_project_comments");
  assert.equal(
    h.c.decisionProjectRouting?.recipients.find((item) => item.id === "subject")?.registrationNumber,
    "ИСХ-25",
  );
});

test("заявитель с кабинетом SAQ получает извещение о заслушивании при внешнем направлении проекта", () => {
  const h = harness(2);
  h.c.appealType = "Жалоба на уведомление";
  h.c.status = "decision_project_eotinish";
  h.c.decisionProject = {
    date: "2026-09-08",
    number: "",
    receipt: "",
    channel: "",
    appealCourt: "",
    appealProcedure: "",
  };
  h.c.decisionProjectRouting = {
    channel: "external",
    recipients: [],
    commentReceivedAt: "2026-09-09",
  };

  h.run("send-decision-project-eotinish", "work", {
    hearingDateTime: "2026-09-14T10:00",
    hearingLocation: "онлайн, Qosyl",
    hearingNoticeChannel: "E-Otinish",
    hearingNoticeDate: "2026-09-11",
  });

  assert.ok(
    h.state.notifications.some(
      (notification) =>
        notification.caseId === h.c.id &&
        notification.recipientRole === "subject" &&
        /извещение о заслушивании/i.test(notification.text),
    ),
  );
});

test("заявитель с кабинетом SAQ видит блок заслушивания в материалах", () => {
  const h = harness(2);
  h.c.appealType = "Жалоба на уведомление";
  h.c.status = "decision_project_hearing";
  h.c.hearing = {
    skip: false,
    date: "2026-09-14T10:00",
    location: "онлайн, Qosyl",
    notice: "2026-09-11",
    noticeChannel: "saq",
  };

  const html = renderToStaticMarkup(
    createElement(CaseWorkspace, {
      c: h.c,
      tab: "review",
      role: "subject",
      onBack() {},
      onTab() {},
      onAction() {},
      onDocument() {},
      onUpload() {},
    }),
  );
  assert.match(html, /<strong>Заслушивание<\/strong>/);
  assert.match(html, /Дата и время: 14\.09\.2026 10:00/);
  assert.match(html, /Место или формат: онлайн, Qosyl/);
  assert.match(html, /Уведомление направлено: 11\.09\.2026 · saq/);
});

test("заявитель с БИН Объекта №2 получает проект решения в свой кабинет", () => {
  const h = harness(2);
  h.c.bin = "001002003004";
  h.c.applicantIdentifierType = "БИН";
  h.c.appealType = "Жалоба на уведомление";
  h.c.status = "decision_project";

  h.run("create-decision-project", "work", {
    projectSubjectChannel: "saq",
  });
  h.run("approve-decision-project", "deputy");
  h.run("sign-decision-project", "director");

  assert.equal(
    h.c.decisionProjectRouting?.recipients[0]?.recipientRole,
    "subject2",
  );
  assert.ok(
    h.state.notifications.some(
      (notification) =>
        notification.caseId === h.c.id &&
        notification.recipientRole === "subject2",
    ),
  );
});

test("форма проекта решения показывает доступность кабинета заявителя по БИН", () => {
  const withCabinet = harness(2);
  const availableForm = actionForm(
    "create-decision-project",
    withCabinet.c,
    withCabinet.state.date,
    {},
  );
  assert.equal(
    availableForm.fields.find((field) => field.name === "subjectCabinetStatus")?.value,
    "Кабинет заявителя SAQ доступен (БИН: 000000000002).",
  );
  assert.deepEqual(
    availableForm.fields
      .find((field) => field.name === "projectSubjectChannel")
      ?.options,
    [
      ["saq", "В кабинет SAQ"],
      ["external", "Через другую систему"],
    ],
  );

  const withoutCabinet = harness(1);
  withoutCabinet.c.appealType = "Жалоба на уведомление";
  const unavailableForm = actionForm(
    "create-decision-project",
    withoutCabinet.c,
    withoutCabinet.state.date,
    {},
  );
  assert.equal(
    unavailableForm.fields
      .find((field) => field.name === "subjectCabinetStatus")
      ?.value,
    "Кабинет заявителя SAQ не зарегистрирован (БИН: 000000000001).",
  );
  assert.deepEqual(
    unavailableForm.fields
      .find((field) => field.name === "projectSubjectChannel")
      ?.options,
    [["external", "Через другую систему"]],
  );
});

test("проект решения не направляется в SAQ при отсутствии кабинета заявителя", () => {
  const h = harness(1);
  h.c.appealType = "Жалоба на уведомление";
  h.c.status = "decision_project";
  h.run("create-decision-project", "work", {
    projectSubjectChannel: "saq",
  });

  assert.equal(
    h.c.decisionProjectRecipients?.find((recipient) => recipient.id === "subject")?.channel,
    "external",
  );
});

test("без замечаний по проекту решения рабочий орган вручную переходит к мотивированному ответу", () => {
  const h = harness(2);
  h.c.appealType = "Жалоба на действие/бездействие";
  h.c.channel = "E-Otinish";
  h.c.status = "decision_project_comments";
  h.c.decisionProjectRouting = {
    channel: "external",
    sentAt: "2026-09-08",
    receivedAt: "2026-09-08",
    commentsDeadline: "2026-09-10",
    deliveryPath: "E-Otinish",
  };
  h.state.date = "2026-09-09";

  assert.ok(
    additionalActions(h.c).some(
      (action) => action.action === "proceed-to-final-response",
    ),
  );

  h.run("proceed-to-final-response", "work", {
    reason: "Замечания к проекту решения пока не поступили.",
  });
  assert.equal(h.c.status, "decided");
  assert.equal(h.c.hearing?.skip, true);
  assert.match(h.c.hearing?.reason || "", /пока не поступили/);
});

test("переход к мотивированному ответу не блокируется после поступления замечания", () => {
  const h = harness(2);
  h.c.appealType = "Жалоба на действие/бездействие";
  h.c.channel = "E-Otinish";
  h.c.status = "decision_project_comments";
  h.c.decisionProjectRouting = {
    channel: "external",
    sentAt: "2026-09-08",
    receivedAt: "2026-09-08",
    commentsDeadline: "2026-09-10",
    deliveryPath: "E-Otinish",
  };
  h.state.date = "2026-09-09";

  h.run("record-external-decision-project-comment", "work", {
    projectCommentReceivedAt: "2026-09-09",
    projectCommentChannel: "E-Otinish",
    projectComment: "Поступившее замечание.",
  });
  assert.equal(h.c.status, "decision_project_eotinish");
  assert.ok(
    additionalActions(h.c).some(
      (action) => action.action === "proceed-to-final-response",
    ),
  );

  h.run("proceed-to-final-response", "work", {
    reason: "Переход выполнен несмотря на поступившее замечание.",
  });
  assert.equal(h.c.status, "decided");
  assert.equal(h.c.hearing?.skip, true);
  assert.match(h.c.hearing?.reason || "", /несмотря на поступившее замечание/);
});

test("истечение срока ожидания замечаний выделяется красным в информационном блоке", () => {
  const h = harness(2);
  h.c.status = "decision_project_comments";
  h.c.decisionProjectRouting = {
    channel: "saq",
    sentAt: "2026-09-08",
    receivedAt: "2026-09-08",
    commentsDeadline: "2026-09-10",
  };

  const html = renderToStaticMarkup(
    createElement(ConsiderationProcess, {
      c: h.c,
      date: "2026-09-11",
      role: "work",
      onAction: () => undefined,
      onHistory: () => undefined,
    }),
  );
  assert.match(html, /notice red/);
  assert.match(html, /Срок ожидания замечаний к проекту решения истек/);
  assert.match(html, /Переход к формированию мотивированного ответа доступен/);
});

test("все виды жалоб проходят маршрут с проектом решения независимо от источника", () => {
  [
    "Жалоба на уведомление",
    "Жалоба на уведомления",
    "Жалоба на решение КВГА/ДВГА",
    "Жалоба на действие/бездействие",
  ].forEach((appealType) => {
    const h = harness(2);
    h.c.appealType = appealType;
    h.c.channel = "Веб-портал государственных закупок";
    h.c.status = "protocol";
    h.c.meeting = { date: "2026-09-10", number: "ПР-ЕД-1", audio: "" };
    h.c.issues
      .filter((point) => point.disputed)
      .forEach((point) => {
        point.final = "accept";
      });

    h.run("sign", "commission", {
      secretary: "on",
      reason: "Решение комиссии сформировано.",
      ...Object.fromEntries(
        h.c.members.map((member) => [`signed_${member.id}`, "on"]),
      ),
    });

    assert.equal(h.c.status, "decision_project", appealType);
    assert.equal(
      nextAction(h.c)?.action,
      "create-decision-project",
      appealType,
    );
  });
});

test("жалоба на уведомление формирует мотивированный ответ по общему маршруту жалоб", () => {
  const h = harness(2);
  h.c.appealType = "Жалоба на уведомление";
  h.c.status = "decided";

  assert.equal(nextAction(h.c)?.action, "deliver");
  assert.equal(nextAction(h.c)?.label, "Сформировать мотивированный ответ");

  const definition = actionForm("deliver", h.c, h.state.date, {});
  assert.equal(definition.title, "Сформировать мотивированный ответ");
  assert.ok(
    !definition.fields.some(
      (field) => field.name === "conclusionRegistrationNumber",
    ),
  );
  assert.equal(
    definition.fields.find(
      (field) => field.name === "motivatedResponseApplicantCabinetStatus",
    )?.value,
    "Кабинет заявителя SAQ доступен (БИН: 000000000002).",
  );
  assert.deepEqual(
    definition.fields.find(
      (field) => field.name === "motivatedResponseApplicantChannel",
    )?.options,
    [
      ["saq", "В кабинет SAQ"],
      ["external", "Через другую систему"],
    ],
  );
});

test("возражение на аудиторский отчет формирует мотивированный ответ по маршруту SAQ или другой системы", () => {
  const h = harness(2);
  h.c.appealType = "Возражение на аудиторский отчет";
  h.c.status = "decided";

  assert.equal(nextAction(h.c)?.action, "deliver");
  assert.equal(nextAction(h.c)?.label, "Сформировать мотивированный ответ");

  const definition = actionForm("deliver", h.c, h.state.date, {});
  assert.equal(definition.title, "Сформировать мотивированный ответ");
  assert.deepEqual(
    definition.fields.find(
      (field) => field.name === "motivatedResponseApplicantChannel",
    )?.options,
    [
      ["saq", "В кабинет SAQ"],
      ["external", "Через другую систему"],
    ],
  );

  h.run("deliver", "work", {
    motivatedResponseApplicantChannel: "external",
  });
  h.run("approve-final-response", "deputy");
  assert.equal(nextAction(h.c)?.label, "Подписать мотивированный ответ");
  h.run("sign-final-response", "director");

  assert.equal(h.c.status, "final_response_delivery");
  assert.equal(
    h.c.motivatedResponseRouting?.recipients.find(
      (recipient) => recipient.id === "applicant",
    )?.channel,
    "external",
  );
});

test("мотивированный ответ сохраняет выбранный канал заявителя и открывает его после внешней фиксации", () => {
  const h = harness(2);
  h.c.appealType = "Жалоба на уведомление";
  h.c.status = "decided";

  h.run("deliver", "work", {
    motivatedResponseApplicantChannel: "external",
  });
  assert.equal(
    h.c.motivatedResponseRouting?.recipients.find(
      (recipient) => recipient.id === "applicant",
    )?.channel,
    "external",
  );

  h.run("approve-final-response", "deputy");
  h.run("sign-final-response", "director");
  assert.equal(h.c.status, "final_response_delivery");
  assert.equal(h.c.delivery?.recipientRoles?.includes("subject"), false);

  h.run("record-final-response-delivery", "work", {
    motivatedResponseRecipient: "applicant",
    motivatedResponseSentAt: h.state.date,
    motivatedResponseDeliveryPath: "E-Otinish",
    motivatedResponseRegistrationNumber: "ИСХ-25",
  });
  assert.equal(h.c.status, "completed");
  assert.ok(h.c.delivery?.recipientRoles?.includes("subject"));
});

test("при отсутствии кабинета SAQ мотивированный ответ допускает только внешнее направление", () => {
  const h = harness(1);
  h.c.appealType = "Жалоба на уведомление";
  h.c.status = "decided";
  const definition = actionForm("deliver", h.c, h.state.date, {});

  assert.equal(
    definition.fields.find(
      (field) => field.name === "motivatedResponseApplicantCabinetStatus",
    )?.value,
    "Кабинет заявителя SAQ не зарегистрирован (БИН: 000000000001).",
  );
  assert.deepEqual(
    definition.fields.find(
      (field) => field.name === "motivatedResponseApplicantChannel",
    )?.options,
    [["external", "Через другую систему"]],
  );

  h.run("deliver", "work", {
    motivatedResponseApplicantChannel: "saq",
  });
  assert.equal(
    h.c.motivatedResponseRouting?.recipients.find(
      (recipient) => recipient.id === "applicant",
    )?.channel,
    "external",
  );
});

test("в форме мотивированного ответа по жалобе на уведомление нет документа заключения", () => {
  const h = harness(2);
  h.c.appealType = "Жалоба на уведомление";
  h.c.status = "decided";

  const html = renderToStaticMarkup(
    createElement(ActionModal, {
      action: "deliver",
      c: h.c,
      date: h.state.date,
      role: "work",
      onSubmit: () => undefined,
      onClose: () => undefined,
    }),
  );

  assert.doesNotMatch(html, /Исходящий номер/);
  assert.doesNotMatch(html, /Канал доставки/);
  assert.doesNotMatch(html, /Документ заключения/);
  assert.doesNotMatch(html, /Для уведомления формируется заключение/);
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

test("печатные формы выводят выбранный тип идентификатора заявителя", () => {
  const h = harness();
  h.c.applicantIdentifierType = "ИИН";

  [
    requestTemplateIntro(h.c),
    certificateTemplateIntro(h.c),
    agendaOrProtocolIntro(h.c),
  ].forEach((text) => assert.match(text || "", /ИИН 000000000001/));
});
