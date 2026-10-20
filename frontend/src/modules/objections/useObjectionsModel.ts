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
  "decision_project_delivery",
  "decision_project_comments",
  "decision_project_eotinish",
  "decision_project_hearing",
  "decided",
  "final_response_approval",
  "final_response_signed",
  "final_response_delivery",
  "delivered",
  "completed",
];

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
        meeting.postponedCaseIds?.includes(caseItem.id) ||
        (meeting.caseIds.includes(caseItem.id) &&
          (meeting.completed || meetingDate(meeting) < state.date) &&
          !isMeetingCompleted(caseItem)),
    )
    .sort((left, right) => right.dateTime.localeCompare(left.dateTime))[0];
}

function nextMeetingForCase(state: DemoState, caseItem: ObjectionCase) {
  const meetings = state.meetings || [];
  const source = rescheduleSource(caseItem, state);
  // После решения АК обращение ждёт ответы на дополнительный запрос и новую
  // справку. До её подписания повторное заседание не назначается.
  if (caseItem.repeatHearingStatus === "required") return undefined;
  const excluded = new Set(caseItem.excludedFromMeetingIds || []);
  // Для переноса важны не только календарные даты, но и время заседания:
  // заседание № 2 в 11:00 того же дня идёт после заседания № 1 в 10:00.
  const sourceDateTime = source ? source.dateTime : "";
  const alreadyScheduled = meetings.some(
    (meeting) =>
      meeting.caseIds.includes(caseItem.id) &&
      !meeting.postponedCaseIds?.includes(caseItem.id) &&
      !excluded.has(meeting.id) &&
      (sourceDateTime ? meeting.dateTime > sourceDateTime : true),
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
        meeting.dateTime > sourceDateTime &&
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
      .flatMap((item) =>
        item.caseIds.filter((caseId) => !item.postponedCaseIds?.includes(caseId)),
      ),
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
    if (caseItem.repeatHearingStatus === "ready") {
      caseItem.repeatHearingStatus = "scheduled";
      caseItem.repeatHearingMeetingId = meeting.id;
      caseItem.history.push({
        date: next.date,
        actor: "Система",
        title: "Назначено повторное заседание",
        text:
          `Обращение включено в заседание №${meeting.number} после отложенного ` +
          `заседания №${caseItem.repeatHearingPreviousMeetingNumber || "—"}.`,
      });
    }
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
          "Не удалось прочитать сохранённые данные. Показано исходное тестовое обращение. Изменения будут сохранены при следующем действии, если браузер разрешает хранение.",
      };
    }
  });
  const [state, setState] = useState(() => loaded.state);
  // Синхронизируем уже сохранённые обращения сразу после открытия страницы.
  // Это важно, если заседание было создано раньше, а справка подписана позже:
  // пользователю не требуется выполнять дополнительное действие вручную.
  useEffect(() => {
    const synchronized = synchronizeUpcomingMeetingCases(state);
    if (synchronized === state) return;
    createDemoRepository(localStorage).save(synchronized);
    setState(synchronized);
    // Синхронизация выполняется один раз для состояния, загруженного из
    // хранилища; последующие изменения проходят через commit().
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
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
