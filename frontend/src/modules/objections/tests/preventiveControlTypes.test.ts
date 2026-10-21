import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { initialState } from "../../../api/objectionsRepository";
import { COMMISSION_ATTENDANCE_MEMBERS } from "../../../data/objections";
import type { ObjectionCase } from "../../../types";
import {
  PREVENTIVE_CONTROL_ACT_OBJECTION,
  PREVENTIVE_CONTROL_PRESCRIPTION_OBJECTION,
  preventiveControlSourceDocumentLabels,
} from "../appealTypes";
import { actionForm } from "../formDefinitions";
import ActionModal from "../components/ActionModal";
import ConsiderationProcess from "../components/ConsiderationProcess";
import { reviewDuration } from "../services/deadlines";
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
import NewCaseModal from "../components/NewCaseModal";
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
      hearingForm.fields.some((field) => field.name === "hearingOutcome"),
    );

    c.status = "decided";
    assert.equal(nextAction(c)?.label, "Сформировать мотивированный ответ");
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

  const attendees = COMMISSION_ATTENDANCE_MEMBERS.slice(0, 7);
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
  c.members = COMMISSION_ATTENDANCE_MEMBERS.slice(0, 7).map((member) => ({
    ...member,
    present: true,
    isChair: member.id === "kenbeil-dm",
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
  assert.match(html, /Урхумбаева Т\.Ж\./);
  assert.match(html, /commissionVote_[^" ]+_alieva-at/);
  assert.match(html, /commissionReason_[^" ]+_alieva-at/);
  assert.doesNotMatch(html, /Выберите ФИО/);
});

test("commission members can record only their own open rows", () => {
  let state = initialState();
  const c = state.cases[0];
  c.appealType = PREVENTIVE_CONTROL_ACT_OBJECTION;
  c.status = "commission_voting";
  c.members = COMMISSION_ATTENDANCE_MEMBERS.slice(0, 7).map((member) => ({
    ...member,
    present: true,
    isChair: member.id === "kenbeil-dm",
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
  c.members = COMMISSION_ATTENDANCE_MEMBERS.slice(0, 7).map((member) => ({
    ...member,
    present: true,
    isChair: member.id === "kenbeil-dm",
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
