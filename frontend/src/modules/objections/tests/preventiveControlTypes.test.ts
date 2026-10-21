import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  createDemoRepository,
  initialState,
  STORAGE_KEY,
} from "../../../api/objectionsRepository";
import { COMMISSION_ATTENDANCE_MEMBERS } from "../../../data/objections";
import type { ObjectionCase } from "../../../types";
import {
  PREVENTIVE_CONTROL_ACT_OBJECTION,
  PREVENTIVE_CONTROL_PRESCRIPTION_OBJECTION,
  preventiveControlSourceDocumentLabels,
} from "../appealTypes";
import { DocumentContent } from "../components/DocumentModal";
import { actionForm } from "../formDefinitions";
import ActionModal from "../components/ActionModal";
import CaseWorkspace from "../pages/CaseWorkspace";
import ConsiderationProcess from "../components/ConsiderationProcess";
import {
  executionDeadline,
  reviewDeadline,
  reviewDuration,
} from "../services/deadlines";
import {
  additionalActions,
  applyAction,
  nextAction,
} from "../services/workflow";
import {
  agendaOrProtocolIntro,
  certificateTemplateIntro,
  requestTemplateIntro,
} from "../services/appealTemplates";
import { kazakhDecisionIntro } from "../components/DocumentModal";
import NewCaseModal, {
  createSaqApplicantObjection,
  SaqObjectionSubmissionModal,
  SAQ_APPLICANT_PROFILE,
  SAQ_PREVENTIVE_CONTROL_DOCUMENTS,
} from "../components/NewCaseModal";
import { caseNumberPrefix } from "../services/caseNumbering";

function preventiveCase(appealType: string): ObjectionCase {
  const c = structuredClone(initialState().cases[0]);
  c.type = "control";
  c.appealType = appealType;
  c.document = {
    ...c.document,
    number: appealType === PREVENTIVE_CONTROL_ACT_OBJECTION ? "А-17" : "П-24",
    date: "2026-09-03",
    name:
      appealType === PREVENTIVE_CONTROL_ACT_OBJECTION
        ? "Акт о результате профилактического контроля"
        : "Предписание по профилактическому контролю",
  };
  return c;
}

test("demo seed replaces the removed examples with the requested act objection", () => {
  const state = initialState();
  assert.equal(state.cases.length, 1);
  const c = state.cases[0];
  assert.equal(c.id, "В-2026-001");
  assert.equal(c.appealType, PREVENTIVE_CONTROL_ACT_OBJECTION);
  assert.equal(c.org, 'Аудиторская организация "Auditor group"');
  assert.equal(c.bin, "001002003004");
  assert.equal(c.document.number, "57");
  assert.equal(c.document.date, "2026-09-01");
  assert.equal(c.intakeDate, "2026-09-08");
  assert.equal(c.registrationMethod, "manual");
  assert.equal(c.secretaryDeadline, "2026-09-22");
  assert.deepEqual(
    c.issues.filter((point) => point.disputed).map((point) => point.number),
    ["4", "8"],
  );
  assert.deepEqual(
    COMMISSION_ATTENDANCE_MEMBERS.map((member) => member.name),
    [
      "Заместитель Председателя КВГА МФ РК - Турегельдиев А.Р.",
      "Руководитель УАО КВГА МФ РК - Букаев Ж.Б.",
      "Руководитель УАС КВГА МФ РК - Ашанова А.К.",
      "И.о. руководителя ЮУ КВГА МФ РК - Казиханова А.Б.",
      "И.о. руководителя УКСБУ КВГА МФ РК - Дюсенгалиева А.Ж.",
    ],
  );
});

test("local storage migration removes old IDs and replaces the old В-2026-001", () => {
  const saved = initialState();
  saved.version = 12;
  const oldAudit = structuredClone(saved.cases[0]);
  oldAudit.appealType = "Возражение на аудиторский отчет";
  const oldStatement = structuredClone(oldAudit);
  oldStatement.id = "З-2026-002";
  const oldSaqStatement = structuredClone(oldAudit);
  oldSaqStatement.id = "З-2026-003";
  saved.cases = [oldAudit, oldStatement, oldSaqStatement];
  const storage = new Map<string, string>([
    [STORAGE_KEY, JSON.stringify(saved)],
  ]);
  const migrated = createDemoRepository({
    getItem: (key) => storage.get(key) || null,
    setItem: (key, value) => storage.set(key, value),
  }).load();

  assert.deepEqual(
    migrated.cases.map((item) => item.id),
    ["В-2026-001"],
  );
  assert.equal(migrated.cases[0].appealType, PREVENTIVE_CONTROL_ACT_OBJECTION);
});

test("creation form offers the two preventive-control objections and removes procurement portal", () => {
  const html = renderToStaticMarkup(
    createElement(NewCaseModal, {
      state: initialState(),
      onSave() {},
      onClose() {},
    }),
  );

  assert.match(html, new RegExp(PREVENTIVE_CONTROL_ACT_OBJECTION));
  assert.match(html, new RegExp(PREVENTIVE_CONTROL_PRESCRIPTION_OBJECTION));
  assert.match(html, /Номер акта о результате/);
  assert.match(html, /Дата акта о результате/);
  assert.doesNotMatch(html, /Веб-портал государственных закупок/);
  assert.match(html, /E-Otinish/);
  assert.match(html, /ОДО/);
  assert.match(html, /SAQ/);
  assert.match(html, /другое/);
  assert.deepEqual(
    preventiveControlSourceDocumentLabels(PREVENTIVE_CONTROL_ACT_OBJECTION),
    {
      name: "Акт о результате профилактического контроля",
      number: "Номер акта о результате",
      date: "Дата акта о результате",
      reference: "акт о результате профилактического контроля",
    },
  );
  assert.deepEqual(
    preventiveControlSourceDocumentLabels(
      PREVENTIVE_CONTROL_PRESCRIPTION_OBJECTION,
    ),
    {
      name: "Предписание по профилактическому контролю",
      number: "Номер предписания",
      date: "Дата предписания",
      reference: "предписание по профилактическому контролю",
    },
  );
});

test("SAQ object cabinet can choose an act and automatically see its data and violations", () => {
  const html = renderToStaticMarkup(
    createElement(SaqObjectionSubmissionModal, {
      state: initialState(),
      onSave() {},
      onClose() {},
    }),
  );

  assert.match(html, /Подать возражение/);
  assert.match(html, new RegExp(SAQ_APPLICANT_PROFILE.name));
  assert.match(html, new RegExp(SAQ_APPLICANT_PROFILE.identifier));
  assert.match(html, /№ 57 от 02\.09\.2026 — ДВГА по г\. Астана/);
  assert.match(html, /ОПИ-01 — пункт нарушения № 1/);
  assert.match(html, /ОПИ-01 — пункт нарушения № 2/);
  assert.match(html, /ОПИ-01 — пункт нарушения № 3/);
  assert.match(html, /Требования заявителя/);
  assert.match(html, /type="file"/);
  assert.doesNotMatch(html, /Дата получения документа/);
  assert.doesNotMatch(html, /Краткое описание/);
  assert.doesNotMatch(html, /textarea[^>]*name="requirements"/);
});

test("secretary fills the SAQ short description in the case overview", () => {
  const c = structuredClone(initialState().cases[0]);
  c.appealType = PREVENTIVE_CONTROL_ACT_OBJECTION;
  c.submittedViaSaqApplicant = false;
  c.request = "";
  const html = renderToStaticMarkup(
    createElement(CaseWorkspace, {
      c,
      tab: "overview",
      role: "work",
      onBack() {},
      onTab() {},
      onAction() {},
      onDocument() {},
      onUpload() {},
      onSummarySave() {},
    }),
  );

  assert.match(html, /Краткое описание обращения/);
  assert.match(html, /aria-label="Краткое описание обращения"/);
  assert.match(html, /Сохранить описание/);
});

test("SAQ filing creates an automatically numbered case with only selected act points", () => {
  const state = initialState();
  const sourceDocument = SAQ_PREVENTIVE_CONTROL_DOCUMENTS[0];
  const requirementFile = {
    name: "Требования заявителя.pdf",
    filename: "Требования заявителя.pdf",
    kind: "attachment" as const,
    text: "Требования заявителя",
    author: "Заявитель",
    date: state.date,
    dataUrl: "data:application/pdf;base64,AA==",
  };
  const evidence1 = {
    ...requirementFile,
    name: "Доказательства-1.pdf",
    filename: "Доказательства-1.pdf",
    text: "Доказательства по пункту № 1",
  };
  const evidence3 = {
    ...requirementFile,
    name: "Доказательства-3.pdf",
    filename: "Доказательства-3.pdf",
    text: "Доказательства по пункту № 3",
  };
  const result = createSaqApplicantObjection({
    state,
    sourceDocument,
    selectedPointIds: [
      "preventive-act-57-point-1",
      "preventive-act-57-point-3",
    ],
    pointArguments: {
      "preventive-act-57-point-1": "Отчетность предоставлена своевременно.",
      "preventive-act-57-point-3": "Расчет количества нарушения неверен.",
    },
    requirementsAttachments: [requirementFile],
    evidenceAttachmentsByPoint: {
      "preventive-act-57-point-1": [evidence1],
      "preventive-act-57-point-3": [evidence3],
    },
  });
  const c = result.state.cases.at(-1)!;

  assert.equal(result.caseId, "В-2026-002");
  assert.equal(c.appealType, PREVENTIVE_CONTROL_ACT_OBJECTION);
  assert.equal(c.status, "received");
  assert.equal(c.registrationMethod, "automatic");
  assert.equal(c.submittedViaSaqApplicant, true);
  assert.equal(c.sourceDocumentId, sourceDocument.id);
  assert.equal(c.org, SAQ_APPLICANT_PROFILE.name);
  assert.equal(c.bin, SAQ_APPLICANT_PROFILE.identifier);
  assert.equal(c.address, SAQ_APPLICANT_PROFILE.address);
  assert.equal(c.document.number, "57");
  assert.equal(c.document.date, "2026-09-02");
  assert.equal(c.document.received, state.date);
  assert.equal(c.request, "");
  assert.deepEqual(c.issues.map((point) => point.number), ["1", "3"]);
  assert.deepEqual(
    c.issues.map((point) => point.authorityFinding),
    [
      sourceDocument.points[0].description,
      sourceDocument.points[2].description,
    ],
  );
  assert.deepEqual(
    c.issues.map((point) => point.argument),
    [
      "Отчетность предоставлена своевременно.",
      "Расчет количества нарушения неверен.",
    ],
  );
  assert.deepEqual(
    c.issues.map((point) => point.evidence),
    ["Доказательства-1.pdf", "Доказательства-3.pdf"],
  );
  assert.deepEqual(
    c.documents.map((document) => document.text),
    [
      "Требования заявителя",
      "Доказательства по пункту № 1",
      "Доказательства по пункту № 3",
    ],
  );
  assert.equal(c.secretaryDeadline, "2026-09-22");
  assert.equal(
    result.state.notifications.at(-1)?.recipient,
    "Руководитель секретаря",
  );
});

test("SAQ violation descriptions appear in the request appendix; the secretary fills the summary in the case overview", () => {
  const state = initialState();
  const sourceDocument = SAQ_PREVENTIVE_CONTROL_DOCUMENTS[0];
  const makeAttachment = (name: string, text: string) => ({
    name,
    filename: name,
    kind: "attachment" as const,
    text,
    author: "Заявитель",
    date: state.date,
    dataUrl: "data:application/pdf;base64,AA==",
  });
  const submitted = createSaqApplicantObjection({
    state,
    sourceDocument,
    selectedPointIds: ["preventive-act-57-point-2"],
    pointArguments: {
      "preventive-act-57-point-2": "Пункт оспаривается.",
    },
    requirementsAttachments: [
      makeAttachment("Требования.pdf", "Требования заявителя"),
    ],
    evidenceAttachmentsByPoint: {
      "preventive-act-57-point-2": [
        makeAttachment(
          "Доказательство-2.pdf",
          "Доказательства по пункту № 2",
        ),
      ],
    },
  });
  const afterAssignment = structuredClone(submitted.state);
  const assignedCase = afterAssignment.cases.find(
    (item) => item.id === submitted.caseId,
  )!;
  assignedCase.status = "accepted";
  assignedCase.assignee = "Секретарь комиссии";

  const requestDefinition = actionForm(
    "request",
    assignedCase,
    afterAssignment.date,
    {},
    "work",
  );
  assert.equal(
    requestDefinition.fields.some((field) => field.name === "summary"),
    false,
  );
  assignedCase.request = "Возражение по пункту 2 акта";
  const requestForm = new FormData();
  requestForm.set("recipient", "ДВГА по г. Астана");
  requestForm.set("executor", "Секретарь комиссии");
  const requested = applyAction(
    afterAssignment,
    submitted.caseId,
    "request",
    "work",
    requestForm,
  );
  const requestedCase = requested.cases.find(
    (item) => item.id === submitted.caseId,
  )!;
  const appendixDocument = requestedCase.documents.find(
    (document) => document.kind === "request-appendix",
  );
  const appendixHtml = renderToStaticMarkup(
    createElement(DocumentContent, {
      c: requestedCase,
      kind: "request-appendix",
      document: appendixDocument,
    }),
  );

  assert.equal(requestedCase.request, "Возражение по пункту 2 акта");
  assert.match(
    appendixHtml,
    /Выявлено нарушение по предоставлению отчетности в части количества нарушения 2/,
  );
  assert.doesNotMatch(appendixHtml, /количества нарушения 3/);
});

test("SAQ act violation is prefilled for the authority, while manual cases stay blank", () => {
  const saqCase = preventiveCase(PREVENTIVE_CONTROL_ACT_OBJECTION);
  const point = saqCase.issues.find((item) => item.disputed)!;
  point.authorityFinding = "Выявлено нарушение по акту №57";
  saqCase.submittedViaSaqApplicant = true;
  saqCase.requests = [
    {
      id: "request-1",
      recipient: "КВГА",
      date: "2026-09-08",
      text: "Запрос",
      deadline: "2026-09-10",
      template: "dvga",
    },
  ];

  const saqForm = actionForm(
    "fill-request-response",
    saqCase,
    "2026-09-08",
    {},
    "kvga",
  );
  assert.equal(
    saqForm.fields.find((field) => field.name === `authorityFinding_${point.id}`)
      ?.value,
    "Выявлено нарушение по акту №57",
  );

  const manualCase = structuredClone(saqCase);
  manualCase.submittedViaSaqApplicant = false;
  const manualForm = actionForm(
    "fill-request-response",
    manualCase,
    "2026-09-08",
    {},
    "kvga",
  );
  assert.equal(
    manualForm.fields.find((field) => field.name === `authorityFinding_${point.id}`)
      ?.value,
    "",
  );
});

test("preventive-control objections use the statement review scenario", () => {
  for (const appealType of [
    PREVENTIVE_CONTROL_ACT_OBJECTION,
    PREVENTIVE_CONTROL_PRESCRIPTION_OBJECTION,
  ]) {
    const c = preventiveCase(appealType);
    assert.equal(reviewDuration(c), 15);
    assert.equal(caseNumberPrefix(appealType), "В");

    c.status = "materials";
    assert.ok(
      additionalActions(c).some(
        (action) => action.action === "start-analysis-additional-request",
      ),
    );

    c.status = "decision_project_hearing";
    c.decisionProject = {
      date: "2026-09-10",
      number: "ПР-1",
      receipt: "SAQ-1",
      channel: "saq",
      appealCourt: "—",
      appealProcedure: "—",
    };
    c.hearing = { skip: false, date: "2026-09-16T10:30", location: "онлайн" };
    const hearingForm = actionForm(
      "hearing-after-decision-project",
      c,
      "2026-09-16",
      {},
    );
    assert.ok(
      hearingForm.fields.some(
        (field) => field.name === "hearingHasNewArguments",
      ),
    );
    assert.ok(
      hearingForm.fields.some((field) => field.name === "hearingNextAction"),
    );

    c.status = "decided";
    assert.equal(nextAction(c)?.label, "Сформировать мотивированный ответ");
  }
});

test("preventive-control review uses one fixed 10-day deadline and a shorter secretary target", () => {
  const c = preventiveCase(PREVENTIVE_CONTROL_ACT_OBJECTION);
  c.intakeDate = "2026-10-21";
  c.registered = "2026-10-22";
  c.document.received = "2026-09-01";
  c.extensionDays = 15;
  c.pauseDays = 8;
  c.secretaryDeadline = "2026-11-04";

  assert.equal(reviewDeadline(c), "2026-11-05");
  assert.equal(executionDeadline(c, "work"), "2026-11-04");
  assert.equal(executionDeadline(c, "director"), "2026-11-04");
  assert.equal(executionDeadline(c, "dvga"), null);
  assert.ok(
    !additionalActions(c).some((action) => action.action === "supplement"),
  );
});

test("the manager can shorten but cannot extend the secretary's internal deadline", () => {
  const state = initialState();
  const c = state.cases[0];
  c.appealType = PREVENTIVE_CONTROL_ACT_OBJECTION;
  const assignDefinition = actionForm(
    "assign-work-executor",
    c,
    "2026-09-08",
    {},
    "director",
  );
  const assigneeField = assignDefinition.fields.find(
    (field) => field.name === "assignee",
  );
  assert.equal(assigneeField?.label, "Выбрать исполнителя");
  assert.deepEqual(assigneeField?.options, [
    ["", "Выберите исполнителя"],
    ["Секретарь комиссии", "Секретарь комиссии"],
  ]);
  const assignForm = new FormData();
  assignForm.set("assignee", "Секретарь комиссии");
  assignForm.set("secretaryDeadline", "2026-09-21");

  let next = applyAction(
    state,
    c.id,
    "assign-work-executor",
    "director",
    assignForm,
  );
  assert.equal(next.cases[0].secretaryDeadline, "2026-09-21");
  assert.equal(reviewDeadline(next.cases[0]), "2026-09-22");

  const extensionForm = new FormData();
  extensionForm.set("secretaryDeadline", "2026-09-22");
  assert.throws(
    () =>
      applyAction(
        next,
        c.id,
        "set-secretary-deadline",
        "director",
        extensionForm,
      ),
    /можно только сократить/,
  );
});

test("preventive-control request creates a printed appendix without a letter", () => {
  for (const appealType of [
    PREVENTIVE_CONTROL_ACT_OBJECTION,
    PREVENTIVE_CONTROL_PRESCRIPTION_OBJECTION,
  ]) {
    const state = initialState();
    const c = state.cases[0];
    c.appealType = appealType;
    c.status = "accepted";
    const form = new FormData();
    form.set("recipient", "ДВГА по г. Астана");

    const next = applyAction(state, c.id, "request", "work", form);
    assert.equal(
      next.cases[0].documents.some((document) => document.kind === "request"),
      false,
    );
    assert.ok(
      next.cases[0].documents.some(
        (document) => document.kind === "request-appendix",
      ),
    );

    const printForm = renderToStaticMarkup(
      createElement(ActionModal, {
        action: "request",
        c,
        date: "2026-09-08",
        role: "work",
        onSubmit() {},
        onClose() {},
      }),
    );
    assert.match(printForm, /Печатная форма приложения/);
    assert.match(printForm, /Нарушение, по которым поступило возражение/);
    assert.doesNotMatch(printForm, /request-template-body/);
  }
});

test("preventive-control meeting records commission votes without a meeting certificate", () => {
  let state = initialState();
  const c = state.cases[0];
  c.appealType = PREVENTIVE_CONTROL_ACT_OBJECTION;
  c.status = "commission_members";
  c.members = [];
  c.votes = null;
  c.certificate = null;
  c.documents = [];

  const attendees = COMMISSION_ATTENDANCE_MEMBERS;
  const attendanceForm = new FormData();
  attendees.forEach((member) => attendanceForm.set(`attendee_${member.id}`, "on"));
  state = applyAction(
    state,
    c.id,
    "select-preventive-attendees",
    "work",
    attendanceForm,
  );

  const meetingCase = state.cases[0];
  assert.equal(meetingCase.status, "commission_voting");
  assert.equal(nextAction(meetingCase, "commission")?.action, "commission-vote");
  assert.ok(
    additionalActions(meetingCase).some(
      (action) =>
        action.action === "commission-vote" && action.role === "work",
    ),
  );
  assert.ok(
    additionalActions(meetingCase).every(
      (action) => action.action !== "fill-meeting-certificate",
    ),
  );

  const disputedPoints = meetingCase.issues.filter((point) => point.disputed);
  assert.ok(disputedPoints.length > 0);
  const voteForm = new FormData();
  meetingCase.members.forEach((member) =>
    disputedPoints.forEach((point) => {
      voteForm.set(
        `commissionVote_${point.id}_${member.id}`,
        "accept",
      );
      voteForm.set(
        `commissionReason_${point.id}_${member.id}`,
        `Обоснование ${member.name}`,
      );
    }),
  );
  state = applyAction(state, c.id, "commission-vote", "work", voteForm);

  assert.equal(state.cases[0].status, "circulated");
  assert.equal(
    state.cases[0].votes?.[disputedPoints[0].id]?.voteReasons?.[
      meetingCase.members[0].id
    ],
    `Обоснование ${meetingCase.members[0].name}`,
  );
  const meetingForm = new FormData();
  meetingForm.set("meetingConducted", "on");
  state = applyAction(state, c.id, "members", "work", meetingForm);
  assert.equal(state.cases[0].status, "meeting");
  assert.ok(
    state.cases[0].documents.every(
      (document) =>
        document.name !== "Справка: результаты голосования членов АК",
    ),
  );
});

test("commission vote screen exposes the full member and question matrix", () => {
  const c = preventiveCase(PREVENTIVE_CONTROL_ACT_OBJECTION);
  c.status = "commission_voting";
  c.members = COMMISSION_ATTENDANCE_MEMBERS.map((member) => ({
    ...member,
    present: true,
    isChair: member.id === "turegeldiev-ar",
    recused: false,
    reason: "",
  }));
  const html = renderToStaticMarkup(
    createElement(ActionModal, {
      action: "commission-vote",
      c,
      date: "2026-09-08",
      role: "work",
      onSubmit() {},
      onClose() {},
    }),
  );

  assert.match(html, /Фамилия, инициалы/);
  assert.match(html, /Описание оспариваемого вопроса/);
  assert.match(html, /Букаев Ж\.Б\./);
  assert.match(html, /commissionVote_[^" ]+_bukaev-zhb/);
  assert.match(html, /commissionReason_[^" ]+_bukaev-zhb/);
  assert.doesNotMatch(html, /Выберите ФИО/);
});

test("commission members can record only their own open rows", () => {
  let state = initialState();
  const c = state.cases[0];
  c.appealType = PREVENTIVE_CONTROL_ACT_OBJECTION;
  c.status = "commission_voting";
  c.members = COMMISSION_ATTENDANCE_MEMBERS.map((member) => ({
    ...member,
    present: true,
    isChair: member.id === "turegeldiev-ar",
    recused: false,
    reason: "",
  }));
  c.votes = null;
  const [member, other] = c.members;
  const point = c.issues.find((item) => item.disputed)!;
  const form = new FormData();
  form.set("commissionMember", member.id);
  form.set(`commissionVote_${point.id}_${member.id}`, "accept");
  form.set(`commissionReason_${point.id}_${member.id}`, "Подтверждено материалами дела");
  form.set(`commissionVote_${point.id}_${other.id}`, "reject");

  state = applyAction(state, c.id, "commission-vote", "commission", form);

  assert.equal(state.cases[0].votes?.[point.id]?.votes?.[member.id], "accept");
  assert.equal(state.cases[0].votes?.[point.id]?.votes?.[other.id], undefined);
  assert.equal(
    state.cases[0].votes?.[point.id]?.voteReasons?.[member.id],
    "Подтверждено материалами дела",
  );
  assert.equal(state.cases[0].status, "commission_voting");
});

test("preventive-control meeting shows manual voting without a certificate action", () => {
  const c = preventiveCase(PREVENTIVE_CONTROL_ACT_OBJECTION);
  c.status = "commission_voting";
  c.members = COMMISSION_ATTENDANCE_MEMBERS.map((member) => ({
    ...member,
    present: true,
    isChair: member.id === "turegeldiev-ar",
    recused: false,
    reason: "",
  }));
  const html = renderToStaticMarkup(
    createElement(ConsiderationProcess, {
      c,
      role: "work",
      onAction() {},
      onHistory() {},
      hideStages: true,
    }),
  );

  assert.match(html, /Внести голос члена АК вручную/);
  assert.doesNotMatch(html, /Заполнить справку/);
  assert.doesNotMatch(html, /Печатная форма.*голосования АК/);
});

test("documents name the disputed preventive-control act or prescription", () => {
  for (const [appealType, sourceDocument] of [
    [
      PREVENTIVE_CONTROL_ACT_OBJECTION,
      "акт о результате профилактического контроля",
    ],
    [
      PREVENTIVE_CONTROL_PRESCRIPTION_OBJECTION,
      "предписание по профилактическому контролю",
    ],
  ] as const) {
    const c = preventiveCase(appealType);
    assert.match(agendaOrProtocolIntro(c) || "", new RegExp(sourceDocument));
    assert.match(requestTemplateIntro(c) || "", new RegExp(sourceDocument));
    assert.match(certificateTemplateIntro(c) || "", new RegExp(sourceDocument));
    assert.match(kazakhDecisionIntro(c), /қарсылықты қарап/);
  }
});
