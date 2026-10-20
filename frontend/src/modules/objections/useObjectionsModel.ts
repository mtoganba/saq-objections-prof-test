import { seed } from "../../data/objections";
import { useEffect, useState } from "react";
import {
  createDemoRepository,
  initialState,
} from "../../api/objectionsRepository";
import type {
  Action,
  CaseStatus,
  DemoState,
  ObjectionCase,
  Role,
  Route,
} from "../../types";
import { agendaDocumentHtml } from "./components/AgendaModal";
import { applyAction } from "./services/workflow";
import { pathForRoute, routeFromPath } from "./routing";

const COMPLETED_MEETING_STATUSES: CaseStatus[] = [
  "hearing",
  "hearing_ready",
  "meeting",
  "protocol",
  "decision_project",
  "decision_project_approval",
  "decision_project_signed",
  "decision_project_eotinish",
  "decision_project_hearing",
  "decided",
  "final_response_approval",
  "final_response_signed",
  "delivered",
  "completed",
];


/**
 * A ready-made case keeps the protocol-stage functions observable immediately
 * after opening the public demo. It mirrors a completed preliminary workflow
 * and leaves the other seed cases available for walking through that workflow.
 */
function protocolStageDemo(): ObjectionCase {
  const c = structuredClone(seed().find((item) => item.id === "ВОЗ-2026-002")!);
  c.id = "ВОЗ-2026-004";
  c.appealNumber = "ВОЗ-2026-004";
  c.status = "commission_voting";
  c.registered = "2026-09-08";
  c.filed = "2026-09-08";
  c.assignee = "Исполнитель рабочего органа";
  c.members = [
    {
      id: "protocol-chair",
      name: "Вице-министр Кенбеил Д.М.",
      present: true,
      isChair: true,
      recused: false,
      reason: "",
    },
    {
      id: "protocol-member",
      name: "Директор ДАВГА Күреңбек тегі Ш.Б.",
      present: true,
      recused: false,
      reason: "",
    },
  ];
  c.issues = c.issues.map((point) => ({
    ...point,
    authorityFinding: `Доводы ДВГА/КВГА по пункту ${point.number}: ${point.finding}`,
    position: `Мотивированный ответ ДВГА/КВГА по пункту ${point.number}: выводы подтверждены материалами проверки.`,
  }));
  c.requests = [
    {
      id: "demo-dvga-request",
      recipient: "ДВГА по Атырауской области",
      date: "2026-09-09",
      text: "Запрос о представлении мотивированной позиции.",
      deadline: "2026-09-11T18:00",
      template: "dvga",
      responded: "2026-09-10",
      confirmed: "2026-09-10",
      authorityResponses: Object.fromEntries(
        c.issues
          .filter((point) => point.disputed)
          .map((point) => [
            point.id,
            {
              finding: point.authorityFinding || "",
              response: point.position || "",
            },
          ]),
      ),
    },
  ];
  c.certificate = {
    davgaArguments: "Доводы рабочего органа подготовлены по результатам анализа материалов.",
    davgaArgumentsByPoint: Object.fromEntries(
      c.issues
        .filter((point) => point.disputed)
        .map((point) => [
          point.id,
          `Доводы ДАВГА по пункту ${point.number}: рабочий орган предлагает учесть представленные материалы и позицию ДВГА/КВГА.`,
        ]),
    ),
    memberPositions: [],
  };
  c.documents = [
    {
      name: "Справка по результатам изучения и анализа возражения",
      kind: "certificate",
      text: "Исходная версия справки",
      date: "2026-09-10",
      author: c.assignee,
      snapshot: {
        issues: structuredClone(c.issues),
        result: null,
        members: structuredClone(c.members),
        votes: null,
        meeting: null,
        hearing: null,
        delivery: null,
        certificate: structuredClone(c.certificate),
      },
    },
  ];
  c.history = [
    ...c.history,
    {
      date: "2026-09-10",
      actor: "Система",
      title: "Демонстрационный этап формирования протокола",
      text: "Справка сформирована, члены АК определены. Доступно редактирование доводов ДАВГА и формирование протокола.",
    },
  ];
  return c;
}

function meetingDate(meeting: { dateTime: string }) {
  return meeting.dateTime.slice(0, 10);
}

function isMeetingCompleted(caseItem: ObjectionCase) {
  return COMPLETED_MEETING_STATUSES.includes(caseItem.status);
}

function rescheduleSource(caseItem: ObjectionCase, state: DemoState) {
  const meetings = state.meetings || [];
  const excluded = new Set(caseItem.excludedFromMeetingIds || []);
  return meetings
    .filter(
      (meeting) =>
        excluded.has(meeting.id) ||
        (meeting.caseIds.includes(caseItem.id) &&
          (meeting.completed || meetingDate(meeting) < state.date) &&
          !isMeetingCompleted(caseItem)),
    )
    .sort((left, right) => right.dateTime.localeCompare(left.dateTime))[0];
}

function nextMeetingForCase(state: DemoState, caseItem: ObjectionCase) {
  const meetings = state.meetings || [];
  const source = rescheduleSource(caseItem, state);
  const excluded = new Set(caseItem.excludedFromMeetingIds || []);
  const sourceDate = source ? meetingDate(source) : "";
  const alreadyScheduled = meetings.some(
    (meeting) =>
      meeting.caseIds.includes(caseItem.id) &&
      !excluded.has(meeting.id) &&
      (sourceDate ? meetingDate(meeting) > sourceDate : true),
  );
  if (alreadyScheduled) return undefined;

  if (!source) {
    if (caseItem.status !== "certificate_approved") return undefined;
    const readyEvent = [...caseItem.history]
      .reverse()
      .find((event) => event.title === "Справка подписана");
    if (!readyEvent) return undefined;
    return meetings
      .filter(
        (meeting) =>
          !meeting.agendaSigned &&
          meetingDate(meeting) > readyEvent.date &&
          meetingDate(meeting) > state.date,
      )
      .sort((left, right) => left.dateTime.localeCompare(right.dateTime))[0];
  }

  return meetings
    .filter(
      (meeting) =>
        !meeting.agendaSigned &&
        !excluded.has(meeting.id) &&
        meetingDate(meeting) > sourceDate &&
        meetingDate(meeting) > state.date,
    )
    .sort((left, right) => left.dateTime.localeCompare(right.dateTime))[0];
}

/** Обращения, которые должны быть включены именно в это новое заседание. */
export function casesEligibleForMeeting(state: DemoState, dateTime: string) {
  const meeting = (state.meetings || []).find(
    (item) => item.dateTime === dateTime && !item.agendaSigned,
  );
  if (!meeting) return [];
  const assignedCaseIds = new Set(
    (state.meetings || [])
      .filter((item) => item.id !== meeting.id)
      .flatMap((item) => item.caseIds),
  );
  return state.cases.filter(
    (caseItem) =>
      !assignedCaseIds.has(caseItem.id) &&
      nextMeetingForCase(state, caseItem)?.id === meeting.id,
  );
}

function synchronizeUpcomingMeetingCases(state: DemoState) {
  if (!state.meetings?.length) return state;
  const next = structuredClone(state);
  const changedMeetings = new Set<string>();

  next.cases.forEach((caseItem: ObjectionCase) => {
    const meeting = nextMeetingForCase(next, caseItem);
    if (!meeting) return;

    meeting.caseIds.push(caseItem.id);
    const poll = next.attendancePolls.find((item) => item.id === meeting.pollId);
    if (poll && !poll.caseIds.includes(caseItem.id)) poll.caseIds.push(caseItem.id);
    caseItem.attendanceMeetingDate = meeting.dateTime.slice(0, 10);
    const source = rescheduleSource(caseItem, next);
    caseItem.history.push({
      date: next.date,
      actor: "Система",
      title: source
        ? "Обращение перенесено в следующее заседание"
        : "Обращение добавлено в ближайшее заседание",
      text:
        (source ? "После заседания №" + source.number + ". " : "") +
        "Заседание №" + meeting.number + ": " + meeting.dateTime + ".",
    });
    changedMeetings.add(meeting.id);
  });

  changedMeetings.forEach((meetingId) => {
    const meeting = next.meetings!.find((item) => item.id === meetingId)!;
    const meetingCases = meeting.caseIds
      .map((caseId) => next.cases.find((item) => item.id === caseId))
      .filter((item): item is ObjectionCase => Boolean(item));
    meeting.agendaHtml = agendaDocumentHtml(
      meetingCases,
      meeting.dateTime.slice(0, 10),
    );
  });

  return changedMeetings.size ? next : state;
}

export function useObjectionsModel() {
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [role, setRole] = useState<Role>(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("demoUser") === "saq-demo-superuser") {
      url.searchParams.delete("demoUser");
      window.history.replaceState(window.history.state, "", url);
      return "demo-superuser";
    }
    try { return localStorage.getItem("saq.objections.demo-role.v1") === "demo-superuser" ? "demo-superuser" : "work"; } catch { return "work"; }
  });
  useEffect(() => {
    try { localStorage.setItem("saq.objections.demo-role.v1", role); } catch { /* In-memory demo remains usable. */ }
  }, [role]);
  const [route, setRoute] = useState<Route>(() =>
    routeFromPath(window.location.pathname),
  );
  const [loaded] = useState(() => {
    try {
      return { state: createDemoRepository(localStorage).load(), error: "" };
    } catch {
      return {
        state: initialState(),
        error:
          "Не удалось прочитать сохранённые данные. Показаны исходные тестовые обращения. Изменения будут сохранены при следующем действии, если браузер разрешает хранение.",
      };
    }
  });
  const [state, setState] = useState(() => {
    loaded.state = { ...loaded.state, cases: loaded.state.cases.map(c => ["ВОЗ-2026-001", "ВОЗ-2026-002", "ЖАЛ-2026-003"].includes(c.id) ? { ...c, org:c.org.replace(" — Демо", ""), applicant:c.applicant.replace(" (демо)", ""), address:c.address.replace(", демонстрационный адрес", "") } : c) };
    const protocolDemo = protocolStageDemo();
    const index = loaded.state.cases.findIndex((c) => c.id === protocolDemo.id);
    if (index < 0)
      return { ...loaded.state, cases: [protocolDemo, ...loaded.state.cases] };
    const current = loaded.state.cases[index];
    // Upgrade only the untouched, initial demo case. User-progressed data is
    // never replaced.
    if (current.status !== "accepted" || current.certificate) return loaded.state;
    const cases = [...loaded.state.cases];
    cases[index] = protocolDemo;
    return { ...loaded.state, cases };
  });
  useEffect(() => {
    const handler = () => setRoute(routeFromPath(window.location.pathname));
    window.addEventListener("popstate", handler);
    return () => window.removeEventListener("popstate", handler);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 4500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  function navigate(next: Route) {
    window.history.pushState(null, "", pathForRoute(next));
    setRoute(next);
  }
  function commit(next: DemoState, message: string) {
    const synchronized = synchronizeUpcomingMeetingCases(next);
    createDemoRepository(localStorage).save(synchronized);
    setState(synchronized);
    setError("");
    setToast(message);
  }
  function perform(caseId: string, action: Action, form: FormData) {
    commit(
      applyAction(state, caseId, action, role, form),
      "Действие сохранено",
    );
  }
  return {
    state,
    role,
    setRole,
    route,
    navigate,
    perform,
    commit,
    error: error || loaded.error,
    setError,
    toast,
    setToast,
  };
}
