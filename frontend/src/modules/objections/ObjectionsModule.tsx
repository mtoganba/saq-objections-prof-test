import { useState } from "react";
import AppShell from "../../components/AppShell";
import { Button, Modal, Notice } from "../../components/ui";
import { initialState } from "../../api/objectionsRepository";
import { DEMO_USER } from "../../config";
import { ROLES } from "../../data/constants";
import { COMMISSION_ATTENDANCE_MEMBERS } from "../../data/objections";
import type {
  Action,
  CaseDocument,
  CommissionAttendancePoll,
  CommissionMeeting,
  ObjectionCase,
  RequestDraftKind,
} from "../../types";
import { caseCsv, downloadFile } from "../../utils/download";
import ActionModal, { Field } from "./components/ActionModal";
import AgendaModal, { agendaDocumentHtml } from "./components/AgendaModal";
import AgendaResultsModal from "./components/AgendaResultsModal";
import DocumentModal from "./components/DocumentModal";
import NewCaseModal from "./components/NewCaseModal";
import CasesList from "./pages/CasesList";
import CaseWorkspace from "./pages/CaseWorkspace";
import NotificationsPage from "./pages/NotificationsPage";
import RecommendationsPage from "./pages/RecommendationsPage";
import {
  ProcessesPage,
  SessionsPage,
  SourcesPage,
} from "./pages/ReferencePages";
import { dateObject } from "./services/deadlines";
import {
  normalizeVoteChoice,
  pointOutcomeFromVotes,
  presidingChairId,
} from "./services/decisions";
import { applyAction } from "./services/workflow";
import { casesEligibleForMeeting, useObjectionsModel } from "./useObjectionsModel";
import { formatDateTime } from "../../utils/dateFormat";

type DialogState =
  | { type: "action"; action: Action }
  | { type: "document"; kind: string; document?: CaseDocument }
  | { type: "agenda"; cases: ObjectionCase[] }
  | { type: "agenda-results"; agendaId: string }
  | { type: "attendance"; cases: ObjectionCase[] }
  | { type: "attendance-answer"; notificationId: string }
  | { type: "meeting" }
  | { type: "new" | "clock" | "reset" | "upload" }
  | null;

function participantsFromPoll(poll: CommissionAttendancePoll) {
  const chairId = presidingChairId(
    COMMISSION_ATTENDANCE_MEMBERS
      .filter((member) => poll.responses[member.id] === "yes")
      .map((member) => ({ id: member.id, present: true })),
  );
  return COMMISSION_ATTENDANCE_MEMBERS
    .filter((member) => poll.responses[member.id] === "yes")
    .map((member) => ({
      id: member.id,
      name: member.name,
      present: true,
      isChair: member.id === chairId,
      recused: false,
      reason: "",
    }));
}

function applyDefaultAttendanceChair(poll: CommissionAttendancePoll) {
  const chairId = presidingChairId(
    COMMISSION_ATTENDANCE_MEMBERS
      .filter((member) => poll.responses[member.id] === "yes")
      .map((member) => ({ id: member.id, present: true })),
  );
  if (chairId) {
    poll.chairId = chairId;
  } else {
    delete poll.chairId;
  }
}

function recalculateVotesForChair(c: ObjectionCase) {
  const chairId = presidingChairId(c.members);
  if (!chairId || !c.votes) return;
  c.issues.filter((point) => point.disputed).forEach((point) => {
    const result = c.votes?.[point.id];
    if (!result?.votes) return;
    result.chair = chairId;
    const allVoted = c.members.every((member) =>
      Boolean(normalizeVoteChoice(result.votes?.[member.id])),
    );
    const outcome = allVoted ? pointOutcomeFromVotes(result.votes, chairId) : "";
    result.approved = outcome === "accept";
    if (outcome) {
      point.proposal = outcome;
      point.final = outcome;
    }
  });
}

function syncPollParticipants(
  cases: ObjectionCase[],
  attendancePolls: CommissionAttendancePoll[],
  poll: CommissionAttendancePoll,
) {
  const participants = participantsFromPoll(poll);
  poll.caseIds.forEach((caseId) => {
    const latestPoll = attendancePolls
      .filter((item) => item.caseIds.includes(caseId))
      .at(-1);
    // A late response to an older poll must not replace the participants of
    // the newly scheduled meeting.
    if (latestPoll?.id !== poll.id) return;
    const target = cases.find((item) => item.id === caseId);
    if (target) {
      target.members = participants.map((member) => ({ ...member }));
      recalculateVotesForChair(target);
    }
  });
}

function advanceCasesAfterAttendancePoll(
  cases: ObjectionCase[],
  poll: CommissionAttendancePoll,
  date: string,
) {
  const hasParticipants = participantsFromPoll(poll).length > 0;
  poll.caseIds.forEach((caseId) => {
    const target = cases.find((item) => item.id === caseId);
    if (!target) return;
    if (hasParticipants && target.status === "certificate_approved") {
      target.status = "documents_review";
      target.history.push({
        date,
        actor: "Система",
        title: "Открыт доступ к материалам обращения",
        text: "Есть подтверждённый участник заседания. Обращение переведено на этап ознакомления.",
      });
    }
    if (!hasParticipants && target.status === "documents_review") {
      target.status = "certificate_approved";
      target.history.push({
        date,
        actor: "Система",
        title: "Ожидание подтверждения присутствия",
        text: "Подтверждённых участников заседания нет.",
      });
    }
  });
}

export default function ObjectionsModule() {
  const model = useObjectionsModel();
  const [dialog, setDialog] = useState<DialogState>(null);
  const [dialogError, setDialogError] = useState("");
  const [uploading, setUploading] = useState(false);
  const c = model.state.cases.find((item) => item.id === model.route.caseId);
  const activeCommissionMember = COMMISSION_ATTENDANCE_MEMBERS.find(
    (member) => member.id === model.state.activeCommissionMemberId,
  ) || COMMISSION_ATTENDANCE_MEMBERS[0];
  const commissionCanOpenCase = (caseId: string) =>
    model.state.attendancePolls
      .filter((poll) => poll.caseIds.includes(caseId))
      .at(-1)?.responses[activeCommissionMember.id] === "yes";
  const close = () => {
    setDialog(null);
    setDialogError("");
  };
  const openCase = (c: ObjectionCase) => {
    if (model.role === "commission" && !commissionCanOpenCase(c.id)) {
      model.setToast(
        "Карточка станет доступна после подтверждения присутствия на заседании.",
      );
      return;
    }
    const shouldMarkRead =
      (model.role === "director" && c.unread) ||
      (model.role === "work" && c.unreadForAssignee);
    if (shouldMarkRead) {
      const next = structuredClone(model.state);
      const target = next.cases.find((item) => item.id === c.id)!;
      if (model.role === "director") target.unread = false;
      if (model.role === "work") target.unreadForAssignee = false;
      model.commit(next, "");
    }
    model.navigate({ page: "detail", caseId: c.id, tab: "review" });
  };
  const openNotifications = () => {
    if (model.state.notifications.some((notification) => !notification.read)) {
      const next = structuredClone(model.state);
      next.notifications.forEach((notification) => {
        if (notification.kind !== "attendance-poll") notification.read = true;
      });
      model.commit(next, "");
    }
    model.navigate({ page: "notifications" });
  };
  const setActiveCommissionMember = (memberId: string) => {
    model.commit(
      { ...model.state, activeCommissionMemberId: memberId },
      "",
    );
  };
  const sendAttendancePoll = (cases: ObjectionCase[], dateTime: string) => {
    if (!cases.length || !dateTime) return;
    const next = structuredClone(model.state);
    // The poll identifier is also used by notifications.  Do not derive it
    // only from the array length: saved demo data from an earlier session can
    // contain duplicate identifiers, causing a repeated poll to update the
    // first card instead of the newly sent one.
    const pollId = `attendance-${Date.now()}-${next.attendancePolls.length + 1}`;
    const responses = Object.fromEntries(
      COMMISSION_ATTENDANCE_MEMBERS.map((member) => [member.id, "pending"]),
    ) as Record<string, "pending" | "yes" | "no">;
    next.attendancePolls.push({
      id: pollId,
      dateTime,
      caseIds: cases.map((item) => item.id),
      sentAt: next.date,
      responses,
      manualResponseChanges: {},
    });
    const meetingDate = dateTime.slice(0, 10);
    cases.forEach((item) => {
      const target = next.cases.find((caseItem) => caseItem.id === item.id);
      if (target) target.attendanceMeetingDate = meetingDate;
    });
    syncPollParticipants(
      next.cases,
      next.attendancePolls,
      next.attendancePolls.at(-1)!,
    );
    COMMISSION_ATTENDANCE_MEMBERS.forEach((member) => {
      next.notifications.push({
        id: `${pollId}-${member.id}`,
        caseId: cases[0].id,
        recipient: member.name,
        text: `Укажите, будете ли присутствовать на заседании ${formatDateTime(dateTime)}.`,
        date: next.date,
        read: false,
        kind: "attendance-poll",
        attendancePollId: pollId,
        commissionMemberId: member.id,
      });
    });
    cases.forEach((item) => {
      const target = next.cases.find((caseItem) => caseItem.id === item.id);
      if (target?.status === "certificate_approved")
        target.status = "commission_voting";
      target?.history.push({
        date: next.date,
        actor: ROLES.work,
        title: "Направлен опрос о присутствии на заседании",
        text: `Дата и время заседания: ${formatDateTime(dateTime)}. Опрос направлен членам АК и их и.о.`,
      });
    });
    model.commit(next, "Опрос о присутствии направлен членам АК и их и.о.");
    close();
  };
  const answerAttendancePoll = (
    notificationId: string,
    response: "yes" | "no",
  ) => {
    const next = structuredClone(model.state);
    const notification = next.notifications.find(
      (item) => item.id === notificationId && item.kind === "attendance-poll",
    );
    const pollId = notification?.attendancePollId;
    const memberId = notification?.commissionMemberId;
    if (!pollId || !memberId) return;
    const poll = next.attendancePolls.find((item) => item.id === pollId);
    const member = COMMISSION_ATTENDANCE_MEMBERS.find((item) => item.id === memberId);
    if (!poll || !member) return;
    if (notification.read || poll.responses[memberId] !== "pending") {
      close();
      return;
    }
    poll.responses[memberId] = response;
    applyDefaultAttendanceChair(poll);
    syncPollParticipants(next.cases, next.attendancePolls, poll);
    advanceCasesAfterAttendancePoll(next.cases, poll, next.date);
    notification.read = true;
    poll.caseIds.forEach((caseId) => {
      const target = next.cases.find((item) => item.id === caseId);
      target?.history.push({
        date: next.date,
        actor: member.name,
        title: response === "yes" ? "Подтверждено присутствие" : "Отказ от участия в заседании",
        text: `Ответ на опрос о заседании ${formatDateTime(poll.dateTime)}: ${response === "yes" ? "Да" : "Нет"}.`,
      });
    });
    model.commit(
      next,
      response === "yes"
        ? "Присутствие подтверждено. Карточки обращений открыты."
        : "Отказ от участия сохранён. Карточки обращений недоступны.",
    );
    close();
  };
  const updateAttendanceResponse = (
    pollId: string,
    memberId: string,
    response: "yes" | "no",
  ) => {
    const member = COMMISSION_ATTENDANCE_MEMBERS.find(
      (item) => item.id === memberId,
    );
    const next = structuredClone(model.state);
    const poll = next.attendancePolls.find((item) => item.id === pollId);
    if (!poll || !member) return;
    poll.responses[memberId] = response;
    applyDefaultAttendanceChair(poll);
    poll.manualResponseChanges ??= {};
    poll.manualResponseChanges[memberId] = {
      changedBy: DEMO_USER.fullName,
      changedAt: next.date,
    };
    syncPollParticipants(next.cases, next.attendancePolls, poll);
    advanceCasesAfterAttendancePoll(next.cases, poll, next.date);
    next.notifications.forEach((notification) => {
      if (
        notification.attendancePollId === pollId &&
        notification.commissionMemberId === memberId
      ) {
        notification.read = true;
      }
    });
    poll.caseIds.forEach((caseId) => {
      const target = next.cases.find((item) => item.id === caseId);
      target?.history.push({
        date: next.date,
        actor: ROLES.work,
        title: "Статус присутствия отмечен рабочим органом",
        text: `${member.name}: ${response === "yes" ? "Да" : "Нет"}.`,
      });
    });
    model.commit(
      next,
      `Статус участия члена АК «${member.name}» сохранён.`,
    );
  };
  const selectAttendanceChair = (pollId: string, memberId: string) => {
    const next = structuredClone(model.state);
    const poll = next.attendancePolls.find((item) => item.id === pollId);
    const member = COMMISSION_ATTENDANCE_MEMBERS.find((item) => item.id === memberId);
    if (!poll || !member || poll.responses[memberId] !== "yes") return;
    poll.chairId = memberId;
    syncPollParticipants(next.cases, next.attendancePolls, poll);
    model.commit(
      next,
      `${member.name} отмечен как Председатель АК/И.О. Председателя АК.`,
    );
  };
  const meetingNotificationDate = (dateTime: string) => {
    const localDate = new Date(dateTime);
    localDate.setDate(localDate.getDate() - 1);
    return localDate.toISOString().slice(0, 10);
  };

  const createMeeting = (dateTime: string) => {
    const next = structuredClone(model.state);
    const meetingDate = dateTime.slice(0, 10);
    next.meetings ??= [];
    const number =
      Math.max(0, ...next.meetings.map((meeting) => meeting.number)) + 1;
    const pollId = "attendance-meeting-" + Date.now();
    const responses = Object.fromEntries(
      COMMISSION_ATTENDANCE_MEMBERS.map((member) => [member.id, "pending"]),
    ) as Record<string, "pending" | "yes" | "no">;
    next.attendancePolls.push({
      id: pollId,
      dateTime,
      caseIds: [],
      sentAt: next.date,
      responses,
      manualResponseChanges: {},
    });
    const meeting: CommissionMeeting = {
      id: "meeting-" + Date.now(),
      number,
      dateTime,
      caseIds: [],
      pollId,
      agendaHtml: agendaDocumentHtml([], meetingDate),
      created: next.date,
    };
    next.meetings.push(meeting);
    const readyCases = casesEligibleForMeeting(next, dateTime);
    meeting.caseIds = readyCases.map((item) => item.id);
    meeting.agendaHtml = agendaDocumentHtml(readyCases, meetingDate);
    const poll = next.attendancePolls.find((item) => item.id === pollId)!;
    poll.caseIds = readyCases.map((item) => item.id);
    readyCases.forEach((item) => {
      const target = next.cases.find((caseItem) => caseItem.id === item.id);
      if (!target) return;
      target.attendanceMeetingDate = meetingDate;
      target.history.push({
        date: next.date,
        actor: ROLES.work,
        title: "Обращение включено в заседание",
        text: "Заседание №" + number + ": " + formatDateTime(dateTime) + ".",
      });
    });
    COMMISSION_ATTENDANCE_MEMBERS.forEach((member) => {
      next.notifications.push({
        id: pollId + "-" + member.id,
        caseId: readyCases[0]?.id || "",
        recipient: member.name,
        recipientRole: "commission",
        text: "Укажите, будете ли присутствовать на заседании " + formatDateTime(dateTime) + ".",
        date: next.date,
        read: false,
        kind: "attendance-poll",
        attendancePollId: pollId,
        commissionMemberId: member.id,
        meetingId: meeting.id,
      });
    });
    next.notifications.push({
      id: "agenda-sign-" + meeting.id,
      caseId: readyCases[0]?.id || "",
      recipient: ROLES.director,
      recipientRole: "director",
      text: "Подпишите повестку дня заседания №" + number + " на " + formatDateTime(dateTime) + ".",
      date: meetingNotificationDate(dateTime),
      read: false,
      kind: "agenda-sign",
      meetingId: meeting.id,
    });
    model.commit(next, "Карточка заседания создана. Опрос направлен членам АК.");
    close();
  };

  const excludeCasesFromMeeting = (meetingId: string, caseIds: string[]) => {
    const next = structuredClone(model.state);
    const meeting = next.meetings?.find((item) => item.id === meetingId);
    const poll = meeting
      ? next.attendancePolls.find((item) => item.id === meeting.pollId)
      : undefined;
    if (!meeting || !poll || meeting.agendaSigned) return;
    const ids = new Set(caseIds.filter((caseId) => meeting.caseIds.includes(caseId)));
    if (!ids.size) return;

    meeting.caseIds = meeting.caseIds.filter((id) => !ids.has(id));
    poll.caseIds = poll.caseIds.filter((id) => !ids.has(id));
    const remainingCases = meeting.caseIds
      .map((id) => next.cases.find((item) => item.id === id))
      .filter((item): item is ObjectionCase => Boolean(item));
    meeting.agendaHtml = agendaDocumentHtml(
      remainingCases,
      meeting.dateTime.slice(0, 10),
    );

    ids.forEach((caseId) => {
      const target = next.cases.find((item) => item.id === caseId);
      if (!target) return;
      target.excludedFromMeetingIds = [
        ...new Set([...(target.excludedFromMeetingIds || []), meeting.id]),
      ];
      if (target.attendanceMeetingDate === meeting.dateTime.slice(0, 10)) {
        delete target.attendanceMeetingDate;
      }
      target.history.push({
        date: next.date,
        actor: ROLES.director,
        title: "Обращение исключено из заседания",
        text: "Заседание №" + meeting.number + ".",
      });
    });
    syncPollParticipants(next.cases, next.attendancePolls, poll);
    model.commit(
      next,
      ids.size === 1
        ? "Обращение исключено и будет включено в ближайшее следующее заседание."
        : "Выбранные обращения исключены и будут включены в ближайшее следующее заседание.",
    );
  };

  const addCaseToMeeting = (meetingId: string, caseId: string) => {
    const next = structuredClone(model.state);
    const meeting = next.meetings?.find((item) => item.id === meetingId);
    const poll = meeting
      ? next.attendancePolls.find((item) => item.id === meeting.pollId)
      : undefined;
    const target = next.cases.find((item) => item.id === caseId);
    if (
      !meeting ||
      !poll ||
      meeting.agendaSigned ||
      !target ||
      !["certificate_approved", "documents_review"].includes(target.status) ||
      meeting.caseIds.includes(caseId)
    ) {
      return;
    }

    // Обращение может состоять только в одном неподписанном заседании.
    // Подписанные повестки не изменяются.
    const previousMeetings = (next.meetings || []).filter(
      (item) =>
        item.id !== meeting.id &&
        !item.agendaSigned &&
        item.caseIds.includes(caseId),
    );
    previousMeetings.forEach((previousMeeting) => {
      previousMeeting.caseIds = previousMeeting.caseIds.filter(
        (id) => id !== caseId,
      );
      const previousPoll = next.attendancePolls.find(
        (item) => item.id === previousMeeting.pollId,
      );
      if (previousPoll) {
        previousPoll.caseIds = previousPoll.caseIds.filter(
          (id) => id !== caseId,
        );
      }
      const previousCases = previousMeeting.caseIds
        .map((id) => next.cases.find((item) => item.id === id))
        .filter((item): item is ObjectionCase => Boolean(item));
      previousMeeting.agendaHtml = agendaDocumentHtml(
        previousCases,
        previousMeeting.dateTime.slice(0, 10),
      );
    });

    meeting.caseIds.push(caseId);
    poll.caseIds.push(caseId);
    const selectedCases = meeting.caseIds
      .map((id) => next.cases.find((item) => item.id === id))
      .filter((item): item is ObjectionCase => Boolean(item));
    meeting.agendaHtml = agendaDocumentHtml(
      selectedCases,
      meeting.dateTime.slice(0, 10),
    );
    target.excludedFromMeetingIds = (target.excludedFromMeetingIds || []).filter(
      (id) => id !== meeting.id,
    );
    target.attendanceMeetingDate = meeting.dateTime.slice(0, 10);
    target.history.push({
      date: next.date,
      actor: ROLES.director,
      title: "Обращение добавлено в заседание",
      text:
        "Заседание №" +
        meeting.number +
        ": " +
        formatDateTime(meeting.dateTime) +
        (previousMeetings.length
          ? ". Исключено из другого заседания: " +
            previousMeetings.map((item) => "№" + item.number).join(", ") +
            "."
          : "."),
    });
    syncPollParticipants(next.cases, next.attendancePolls, poll);
    model.commit(next, "Обращение добавлено в заседание.");
  };

  const transferCasesToMeeting = (
    fromMeetingId: string,
    toMeetingId: string,
    caseIds: string[],
  ) => {
    const next = structuredClone(model.state);
    const fromMeeting = next.meetings?.find((item) => item.id === fromMeetingId);
    const toMeeting = next.meetings?.find((item) => item.id === toMeetingId);
    const fromPoll = fromMeeting
      ? next.attendancePolls.find((item) => item.id === fromMeeting.pollId)
      : undefined;
    const toPoll = toMeeting
      ? next.attendancePolls.find((item) => item.id === toMeeting.pollId)
      : undefined;
    if (
      !fromMeeting ||
      !toMeeting ||
      !fromPoll ||
      !toPoll ||
      fromMeeting.agendaSigned ||
      toMeeting.agendaSigned ||
      toMeeting.completed
    ) {
      return;
    }
    const ids = caseIds.filter((caseId) => fromMeeting.caseIds.includes(caseId));
    if (!ids.length) return;

    const movedIds = new Set(ids);
    fromMeeting.caseIds = fromMeeting.caseIds.filter((id) => !movedIds.has(id));
    fromPoll.caseIds = fromPoll.caseIds.filter((id) => !movedIds.has(id));
    ids.forEach((caseId) => {
      if (!toMeeting.caseIds.includes(caseId)) toMeeting.caseIds.push(caseId);
      if (!toPoll.caseIds.includes(caseId)) toPoll.caseIds.push(caseId);
      const target = next.cases.find((item) => item.id === caseId);
      if (!target) return;
      target.transferredFromMeetingIds = [
        ...new Set([...(target.transferredFromMeetingIds || []), fromMeeting.id]),
      ];
      target.attendanceMeetingDate = toMeeting.dateTime.slice(0, 10);
      target.history.push({
        date: next.date,
        actor: ROLES.director,
        title: "Обращение перенесено в другое заседание",
        text:
          "Из заседания №" +
          fromMeeting.number +
          " в заседание №" +
          toMeeting.number +
          ": " +
          formatDateTime(toMeeting.dateTime) +
          ".",
      });
    });
    [fromMeeting, toMeeting].forEach((meeting) => {
      const agendaCases = meeting.caseIds
        .map((id) => next.cases.find((item) => item.id === id))
        .filter((item): item is ObjectionCase => Boolean(item));
      meeting.agendaHtml = agendaDocumentHtml(
        agendaCases,
        meeting.dateTime.slice(0, 10),
      );
    });
    syncPollParticipants(next.cases, next.attendancePolls, fromPoll);
    syncPollParticipants(next.cases, next.attendancePolls, toPoll);
    model.commit(
      next,
      ids.length === 1
        ? "Обращение перенесено в выбранное заседание."
        : "Выбранные обращения перенесены в выбранное заседание.",
    );
  };

  const moveMeetingCase = (
    meetingId: string,
    caseId: string,
    direction: "up" | "down",
  ) => {
    const next = structuredClone(model.state);
    const meeting = next.meetings?.find((item) => item.id === meetingId);
    if (!meeting || meeting.agendaSigned) return;
    const index = meeting.caseIds.indexOf(caseId);
    const nextIndex = direction === "up" ? index - 1 : index + 1;
    if (index < 0 || nextIndex < 0 || nextIndex >= meeting.caseIds.length) return;
    [meeting.caseIds[index], meeting.caseIds[nextIndex]] = [
      meeting.caseIds[nextIndex],
      meeting.caseIds[index],
    ];
    const selectedCases = meeting.caseIds
      .map((id) => next.cases.find((item) => item.id === id))
      .filter((item): item is ObjectionCase => Boolean(item));
    meeting.agendaHtml = agendaDocumentHtml(
      selectedCases,
      meeting.dateTime.slice(0, 10),
    );
    model.commit(next, "Порядок пунктов повестки дня изменён.");
  };

  const signMeetingAgenda = (meetingId: string) => {
    const next = structuredClone(model.state);
    const meeting = next.meetings?.find((item) => item.id === meetingId);
    if (
      !meeting ||
      meeting.agendaSigned ||
      next.date < meetingNotificationDate(meeting.dateTime)
    ) {
      return;
    }
    previewWordDocument("Повестка дня №" + meeting.number, meeting.agendaHtml);
    meeting.agendaSigned = true;
    meeting.agendaSignedAt = next.date;
    const meetingCases = meeting.caseIds
      .map((id) => next.cases.find((item) => item.id === id))
      .filter((item): item is ObjectionCase => Boolean(item));
    const poll = next.attendancePolls.find(
      (item) => item.id === meeting.pollId,
    );
    COMMISSION_ATTENDANCE_MEMBERS.filter(
      (member) => poll?.responses[member.id] === "yes",
    ).forEach((member) => {
      next.notifications.push({
        id: "agenda-signed-" + meeting.id + "-" + member.id,
        caseId: meeting.caseIds[0],
        recipient: member.name,
        recipientRole: "commission",
        text: "Подписана повестка дня заседания №" + meeting.number + " на " + formatDateTime(meeting.dateTime) + ".",
        date: next.date,
        read: false,
        kind: "agenda-signed",
        commissionMemberId: member.id,
        meetingId: meeting.id,
      });
    });
    meetingCases.forEach((item) => {
      if (["certificate_approved", "documents_review"].includes(item.status)) {
        item.status = "commission_voting";
        item.history.push({
          date: next.date,
          actor: "Система",
          title: "Открыто голосование членов АК",
          text: "Повестка дня подписана. Члены АК, подтвердившие присутствие, могут голосовать по обращению.",
        });
      }
      item.history.push({
        date: next.date,
        actor: ROLES.director,
        title: "Повестка дня подписана",
        text: "Повестка заседания №" + meeting.number + " направлена членам АК.",
      });
    });
    next.notifications.forEach((notification) => {
      if (notification.kind === "agenda-sign" && notification.meetingId === meeting.id) {
        notification.read = true;
      }
    });
    model.commit(next, "Повестка дня подписана и направлена в кабинеты членов АК.");
  };

  const completeMeeting = (meetingId: string) => {
    const next = structuredClone(model.state);
    const meeting = next.meetings?.find((item) => item.id === meetingId);
    if (
      !meeting ||
      meeting.completed ||
      !meeting.agendaSigned ||
      next.date < meeting.dateTime.slice(0, 10)
    ) {
      return;
    }
    meeting.completed = true;
    meeting.completedAt = next.date;
    model.commit(
      next,
      "Заседание проведено. Нерассмотренные обращения перенесены в следующее заседание.",
    );
  };

  const openAgendaCase = (caseId: string) => {
    const target = model.state.cases.find((item) => item.id === caseId);
    if (target) openCase(target);
  };
  const previewWordDocument = (title: string, html: string) => {
    const popup = window.open("", "_blank");
    if (!popup) return;
    popup.document.title = title;
    popup.document.write(html);
    popup.document.close();
  };
  const downloadWordDocument = (name: string, html: string) =>
    downloadFile(name, html, "application/msword;charset=utf-8");

  async function upload(file?: File) {
    if (!file || !c) return;
    setDialogError("");
    if (file.size > 2 * 1024 * 1024) {
      setDialogError("Максимальный размер файла — 2 МБ");
      return;
    }
    if (!/\.(pdf|png|jpe?g|docx?|xlsx?|txt)$/i.test(file.name)) {
      setDialogError("Поддерживаются PDF, PNG, JPG, DOC(X), XLS(X), TXT");
      return;
    }
    setUploading(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error("Не удалось прочитать файл"));
        reader.readAsDataURL(file);
      });
      const next = structuredClone(model.state);
      const updated = next.cases.find((item) => item.id === c.id)!;
      updated.documents.push({
        name: file.name,
        filename: file.name,
        kind: "attachment",
        text: "Приложенный материал",
        author: ROLES[model.role],
        date: next.date,
        dataUrl,
      });
      updated.history.push({
        date: next.date,
        actor: ROLES[model.role],
        title: "Добавлен материал",
        text: file.name,
      });
      model.commit(next, "Материал добавлен. Срок рассмотрения не изменён.");
      close();
    } catch (cause) {
      setDialogError(
        cause instanceof Error
          ? cause.message
          : "Недостаточно места для сохранения вложения",
      );
    } finally {
      setUploading(false);
    }
  }

  async function submitAction(action: Action, form: FormData) {
    if (!c) return;
    // In the Appeals Commission cabinet a member votes only on their own behalf.
    // The selected demo cabinet member is also enforced here, not just in the UI.
    if (action === "commission-vote" && model.role === "commission") {
      form.set("commissionMember", activeCommissionMember.id);
    }
    if (
        !["position", "fill-request-response", "request", "request-other", "deliver", "subject-response"].includes(
        action,
      )
    ) {
      if (action === "review-commission-documents") {
        const next = applyAction(model.state, c.id, action, model.role, form);
        const updated = next.cases.find((item) => item.id === c.id)!;
        const poll = next.attendancePolls
          .filter((item) => item.caseIds.includes(c.id))
          .at(-1);
        if (!poll || !participantsFromPoll(poll).length)
          throw new Error("Для заседания нужен хотя бы один подтверждённый ответ «Да» в опросе о присутствии");
        updated.members = participantsFromPoll(poll);
        model.commit(next, "Материалы изучены. Состав участников определён по опросу о присутствии.");
      } else if (action === "analysis") {
        const next = applyAction(model.state, c.id, action, model.role, form);
        const updated = next.cases.find((item) => item.id === c.id)!;
        delete updated.analysisDraft;
        model.commit(next, "Справка сформирована");
      } else {
        model.perform(c.id, action, form);
      }
      return;
    }
    const files = form
      .getAll(
        ["request", "request-other"].includes(action)
          ? "requestAttachments"
          : action === "deliver"
            ? "conclusionFiles"
            : action === "subject-response"
              ? "subjectResponseFiles"
            : "responseFiles",
      )
      .filter(
        (item): item is File => item instanceof File && item.name.length > 0,
      );
    if (action === "position" && !files.length)
      throw new Error("Вложите хотя бы один полученный файл");
    if (action === "subject-response" && !files.length)
      throw new Error("Вложите хотя бы один файл ответа");
    if (action === "deliver" && c.type === "notice" && !files.length)
      throw new Error("Вложите хотя бы один файл заключения");
    for (const file of files) {
      if (file.size > 2 * 1024 * 1024)
        throw new Error(`Файл «${file.name}» превышает 2 МБ`);
      if (!/\.(pdf|png|jpe?g|docx?|xlsx?|txt)$/i.test(file.name))
        throw new Error("Поддерживаются PDF, PNG, JPG, DOC(X), XLS(X), TXT");
    }
    const attached = await Promise.all(
      files.map(
        (file) =>
          new Promise<{ file: File; dataUrl: string }>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve({ file, dataUrl: String(reader.result) });
            reader.onerror = () => reject(new Error("Не удалось прочитать файл"));
            reader.readAsDataURL(file);
          }),
      ),
    );
    const responseRequestIdBeforeAction =
      action === "fill-request-response"
        ? c.requests.find(
            (request) =>
              !request.responded &&
              request.template !== "other" &&
              (model.role !== "dvga" && model.role !== "kvga" ||
                (model.role === "kvga"
                  ? request.recipient.toUpperCase().includes("КВГА")
                  : request.recipient.toUpperCase().includes("ДВГА"))),
          )?.id
        : action === "position" || action === "subject-response"
          ? c.requests.find(
              (request) =>
                request.template === "other" && !request.confirmed,
            )?.id ||
            c.requests.find(
              (request) => request.responded && !request.confirmed,
            )?.id ||
            c.requests.find(
              (request) => !request.responded && request.template === "other",
            )?.id
          : undefined;
    const next = applyAction(model.state, c.id, action, model.role, form);
    const updated = next.cases.find((item) => item.id === c.id)!;
    if (action === "request" || action === "request-other")
      delete updated.requestDrafts?.[action];
    const responseRequestId =
      ["request", "request-other"].includes(action)
        ? updated.requests.at(-1)?.id
        : responseRequestIdBeforeAction;
    if (attached.length) {
      updated.documents.push(
        ...attached.map(({ file, dataUrl }) => ({
          name: file.name,
          filename: file.name,
          kind:
            ["request", "request-other"].includes(action)
              ? "request-attachment"
              : action === "deliver"
                ? "conclusion"
              : action === "fill-request-response"
              ? "authority-response-attachment"
              : action === "subject-response"
                ? "subject-response-attachment"
              : "response-attachment",
          text:
            ["request", "request-other"].includes(action)
              ? "Приложение исполнителя рабочего органа к запросу"
              : action === "deliver"
                ? "Заключение по обращению"
              : action === "fill-request-response"
              ? "Подтверждающий документ ДВГА/КВГА"
              : action === "subject-response"
                ? "Ответ Объекта на запрос"
              : "Полученный ответ на запрос",
          author: ROLES[model.role],
          date: next.date,
          dataUrl,
          requestId: responseRequestId,
        })),
      );
      updated.history.push({
        date: next.date,
        actor: ROLES[model.role],
        title:
          ["request", "request-other"].includes(action)
            ? "Вложены приложения к запросу"
            : action === "deliver"
              ? "Вложено заключение по обращению"
            : action === "fill-request-response"
            ? "Вложены документы ДВГА/КВГА"
            : action === "subject-response"
              ? "Вложен ответ Объекта"
            : "Вложены полученные файлы",
        text: attached.map(({ file }) => file.name).join(", "),
      });
    }
    model.commit(
      next,
      ["request", "request-other"].includes(action)
        ? attached.length
          ? "Запрос и приложения сохранены"
          : "Запрос сохранён"
        : action === "fill-request-response"
        ? "Ответ ДВГА/КВГА и вложения сохранены"
        : action === "subject-response"
          ? "Ответ Объекта направлен рабочему органу"
        : action === "deliver"
          ? "Заключение по обращению вложено"
        : "Полученный ответ и вложения сохранены",
    );
  }

  function saveRequestDraft(
    caseId: string,
    action: RequestDraftKind,
    form: FormData,
  ) {
    const values: Record<string, string> = {};
    form.forEach((value, name) => {
      if (typeof value === "string") values[name] = value;
    });
    const next = structuredClone(model.state);
    const updated = next.cases.find((item) => item.id === caseId);
    if (!updated) throw new Error("Обращение не найдено");
    updated.requestDrafts ??= {};
    updated.requestDrafts[action] = { values, savedAt: next.date };
    model.commit(next, "Проект запроса сохранён");
  }

  function saveAnalysisDraft(caseId: string, form: FormData) {
    const values: Record<string, string> = {};
    form.forEach((value, name) => {
      if (typeof value === "string") values[name] = value;
    });
    const next = structuredClone(model.state);
    const updated = next.cases.find((item) => item.id === caseId);
    if (!updated) throw new Error("Обращение не найдено");
    updated.analysisDraft = { values, savedAt: next.date };
    model.commit(next, "Черновик справки сохранён");
  }

  return (
    <AppShell
      route={model.route}
      date={model.state.date}
      role={model.role}
      unreadNotifications={model.state.notifications.filter(
        (notification) =>
          !notification.read &&
          (model.role !== "commission" ||
            notification.commissionMemberId === activeCommissionMember.id),
      ).length}
      onRoleChange={model.setRole}
      onNavigate={(next) =>
        next.page === "notifications" ? openNotifications() : model.navigate(next)
      }
      onClock={() => setDialog({ type: "clock" })}
      onReset={() => setDialog({ type: "reset" })}
      activeCommissionMember={activeCommissionMember}
      commissionMembers={COMMISSION_ATTENDANCE_MEMBERS}
      onCommissionMemberChange={setActiveCommissionMember}
    >
      {model.error && <Notice tone="amber">{model.error}</Notice>}
      {model.route.page === "registry" && (
        <CasesList
          cases={
            model.role === "commission"
              ? model.state.cases.filter((item) => commissionCanOpenCase(item.id))
              : model.state.cases
          }
          date={model.state.date}
          role={model.role}
          onOpen={openCase}
          onCreate={() => setDialog({ type: "new" })}
          onExport={(cases) =>
            downloadFile(
              "saq-objections.csv",
              caseCsv(cases),
              "text/csv;charset=utf-8",
            )
          }
        />
      )}
      {model.route.page === "detail" &&
        (c ? (
          model.role === "commission" && !commissionCanOpenCase(c.id) ? (
            <Notice tone="amber">
              Карточка обращения доступна члену АК только после ответа «Да» в
              опросе о присутствии на заседании.
            </Notice>
          ) : (
          <CaseWorkspace
            c={c}
            tab={model.route.tab || "review"}
            role={model.role}
            onBack={() => model.navigate({ page: "registry" })}
            onTab={(tab) => model.navigate({ ...model.route, tab })}
            onAction={(action, role) => {
              if (
                action === "assign-work-executor" ||
                action === "commission-vote" ||
                action === "vote" ||
                action === "fill-meeting-certificate"
              ) {
                if (model.role !== "demo-superuser") model.setRole(role);
                setDialog({ type: "action", action });
                return;
              }
              if (
                action === "screen" ||
                action === "send-request-approval" ||
                action === "approve-request" ||
                action === "sign-request" ||
                action === "approve-response" ||
                action === "sign-response" ||
                action === "approve-final-response" ||
                action === "sign-final-response" ||
                action === "approve-decision-project" ||
                action === "sign-decision-project" ||
                action === "send-decision-project-eotinish" ||
                action === "hearing-after-decision-project" ||
                action === "approve-certificate" ||
                action === "sign-certificate" ||
                action === "review-commission-documents" ||
                action === "members" ||
                action === "sign"
              ) {
                const form = new FormData();
                if (action === "screen") {
                  form.set("identity", "on");
                  form.set("document", "on");
                  form.set("grounds", "on");
                  form.set("competence", "on");
                  form.set(
                    "assignee",
                    c.assignee === "Не назначен"
                      ? "Исполнитель ДАВГА"
                      : c.assignee,
                  );
                  form.set("authority", c.authority);
                  form.set(
                    "basis",
                    "Реквизиты обращения проверены, обращение принято к рассмотрению.",
                  );
                  if (c.type === "control")
                    form.set(
                      "actEffect",
                      "Обращение принято к рассмотрению в общем порядке.",
                    );
                }
                if (action === "approve-request") {
                  form.set("approved", "on");
                }
                if (action === "members") {
                  form.set("meetingConducted", "on");
                }
                if (action === "sign") {
                  form.set("secretary", "on");
                  c.members
                    .filter((member) => member.present)
                    .forEach((member) =>
                      form.set(`signed_${member.id}`, "on"),
                    );
                  form.set(
                    "reason",
                    "Результаты голосования членов АК зафиксированы в протоколе.",
                  );
                }
                const next = applyAction(
                  model.state,
                  c.id,
                  action,
                  model.role === "demo-superuser" ? model.role : role,
                  form,
                );
                model.commit(
                  next,
                  action === "screen"
                    ? "Обращение принято к рассмотрению"
                    : action === "approve-request"
                    ? "Запрос согласован"
                    : action === "sign-request"
                      ? "Запрос подписан"
                    : action === "approve-response"
                      ? "Ответ ДВГА/КВГА согласован"
                    : action === "sign-response"
                      ? "Ответ ДВГА/КВГА подписан"
                    : action === "approve-final-response"
                      ? "Окончательный ответ согласован"
                    : action === "sign-final-response"
                      ? "Окончательный ответ подписан"
                    : action === "approve-decision-project"
                      ? "Проект решения согласован"
                    : action === "sign-decision-project"
                      ? "Проект решения подписан"
                    : action === "send-decision-project-eotinish"
                      ? "Проект решения направлен через систему E-Otinish"
                    : action === "hearing-after-decision-project"
                      ? "Заслушивание проведено"
                    : action === "approve-certificate"
                      ? "Справка согласована"
                      : action === "sign-certificate"
                        ? "Справка подписана"
                      : action === "review-commission-documents"
                          ? "Члены АК ознакомились с документами"
                        : action === "members"
                          ? "Заседание по данному делу проведено"
                        : action === "sign"
                          ? "Протокол подписан"
                        : "Запрос направлен на согласование",
                );
                return;
              }
              if (model.role !== "demo-superuser") model.setRole(role);
              setDialog({ type: "action", action });
            }}
            onDocument={(kind, document) =>
              setDialog({ type: "document", kind, document })
            }
            onUpload={() => setDialog({ type: "upload" })}
          />
          )
        ) : (
          <Notice>
            Обращение не найдено в этом браузере.{" "}
            <button
              className="text-button"
              onClick={() => model.navigate({ page: "registry" })}
            >
              Открыть реестр
            </button>
          </Notice>
        ))}
      {model.route.page === "sessions" &&
        !["dvga", "kvga"].includes(model.role) && (
        <SessionsPage
          cases={model.state.cases}
          meetings={model.state.meetings ?? []}
          attendancePolls={model.state.attendancePolls}
          commissionMembers={COMMISSION_ATTENDANCE_MEMBERS}
          role={model.role}
          date={model.state.date}
          onOpen={openCase}
          onCreateMeeting={() => setDialog({ type: "meeting" })}
          onUpdateAttendanceResponse={updateAttendanceResponse}
          onAddCase={addCaseToMeeting}
          onExcludeCases={excludeCasesFromMeeting}
          onTransferCases={transferCasesToMeeting}
          onMoveCase={moveMeetingCase}
          onPreviewAgenda={(meeting) =>
            previewWordDocument(
              "Повестка дня №" + meeting.number,
              meeting.agendaHtml,
            )
          }
          onSignAgenda={signMeetingAgenda}
          onCompleteMeeting={completeMeeting}
          initialMeetingId={model.route.meetingId}
        />
      )}
      {model.route.page === "notifications" && (
        <NotificationsPage
          notifications={model.state.notifications}
          role={model.role}
          activeCommissionMemberId={activeCommissionMember.id}
          date={model.state.date}
          onAnswerAttendancePoll={(notificationId) =>
            setDialog({ type: "attendance-answer", notificationId })
          }
          onOpenSessions={(meetingId) =>
            model.navigate({ page: "sessions", meetingId })
          }
          onOpenRecommendations={() => model.navigate({ page: "recommendations" })}
          onOpenCase={(caseId) => {
            const target = model.state.cases.find((item) => item.id === caseId);
            if (target) openCase(target);
          }}
        />
      )}
      {model.route.page === "recommendations" && (
        <RecommendationsPage
          recommendations={model.state.recommendations}
          role={model.role}
          onOpenCase={(caseId) => {
            const target = model.state.cases.find((item) => item.id === caseId);
            if (target) openCase(target);
          }}
          onExecute={(recommendationId, answer, executionResult) => {
            const next = structuredClone(model.state);
            const recommendation = next.recommendations.find(
              (item) => item.id === recommendationId,
            );
            if (!recommendation) return;
            recommendation.answer = answer;
            recommendation.executionResult = executionResult;
            recommendation.status = "executed";
            recommendation.executedAt = next.date;
            model.commit(next, "Исполнение рекомендации зафиксировано");
          }}
        />
      )}
      {model.route.page === "processes" && <ProcessesPage />}
      {model.route.page === "sources" && <SourcesPage />}
      {dialog?.type === "action" && c && (
        <ActionModal
          key={`${c.id}-${dialog.action}`}
          action={dialog.action}
          c={c}
          date={model.state.date}
          role={model.role}
          commissionMemberId={
            dialog.action === "commission-vote" && model.role === "commission"
              ? activeCommissionMember.id
              : undefined
          }
          onClose={close}
          onSubmit={(form) => submitAction(dialog.action, form)}
          onSaveDraft={
            dialog.action === "request" || dialog.action === "request-other"
              ? (form) =>
                  saveRequestDraft(c.id, dialog.action as RequestDraftKind, form)
              : dialog.action === "analysis"
                ? (form) => saveAnalysisDraft(c.id, form)
                : undefined
          }
        />
      )}
      {dialog?.type === "document" && c && (
        <DocumentModal
          c={c}
          kind={dialog.kind}
          document={dialog.document}
          onClose={close}
        />
      )}
      {dialog?.type === "meeting" && (
        <Modal title="Создать заседание" onClose={close}>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const dateTime = String(
                new FormData(event.currentTarget).get("dateTime") || "",
              );
              if (!dateTime) {
                setDialogError("Укажите дату и время заседания");
                return;
              }
              createMeeting(dateTime);
            }}
          >
            <Notice>
              Будут включены обращения со статусом «Готово к рассмотрению АК»,
              кроме обращений, перешедших в этот статус в день заседания.
            </Notice>
            <label className="field">
              <span>Дата и время заседания <b className="required">*</b></span>
              <input
                name="dateTime"
                type="datetime-local"
                required
                defaultValue={model.state.date + "T10:00"}
              />
            </label>
            {dialogError && <p className="form-error">{dialogError}</p>}
            <div className="dialog-actions">
              <Button onClick={close}>Отмена</Button>
              <Button primary type="submit">Создать заседание</Button>
            </div>
          </form>
        </Modal>
      )}
      {dialog?.type === "agenda" && (
        <AgendaModal
          cases={dialog.cases}
          date={model.state.date}
          onSend={(meetingDate) => {
            const selectedIds = new Set(dialog.cases.map((item) => item.id));
            const next = structuredClone(model.state);
            next.cases
              .filter((item) => selectedIds.has(item.id))
              .forEach((item) => {
                item.agendaMeetingDate = meetingDate;
                item.history.push({
                  date: next.date,
                  actor: ROLES[model.role],
                  title: "Повестка дня направлена членам АК",
                  text: `Дата заседания: ${meetingDate}`,
                });
              });
            const number =
              Math.max(0, ...next.agendas.map((agenda) => agenda.number)) + 1;
            next.agendas.push({
              id: `agenda-${number}`,
              number,
              meetingDate,
              caseIds: dialog.cases.map((item) => item.id),
              documentHtml: agendaDocumentHtml(dialog.cases, meetingDate),
              created: next.date,
            });
            model.commit(next, "Повестка дня направлена членам АК");
            close();
          }}
          onClose={close}
        />
      )}
      {dialog?.type === "attendance" && (
        <Modal title="Опрос о присутствии на заседании" onClose={close}>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const dateTime = String(
                new FormData(event.currentTarget).get("dateTime") || "",
              );
              if (!dateTime) {
                setDialogError("Укажите дату и время проведения заседания");
                return;
              }
              sendAttendancePoll(dialog.cases, dateTime);
            }}
          >
            <p>
              Опрос будет направлен всем членам Апелляционной комиссии и
              лицам, исполняющим их обязанности, по выбранным обращениям.
            </p>
            <label className="field">
              <span>
                Дата и время проведения заседания <b className="required">*</b>
              </span>
              <input
                name="dateTime"
                type="datetime-local"
                required
                defaultValue={`${model.state.date}T10:00`}
              />
            </label>
            {dialogError && <p className="form-error">{dialogError}</p>}
            <div className="dialog-actions">
              <Button onClick={close}>Отмена</Button>
              <Button primary type="submit">
                Направить опрос
              </Button>
            </div>
          </form>
        </Modal>
      )}
      {dialog?.type === "attendance-answer" && (() => {
        const notification = model.state.notifications.find(
          (item) => item.id === dialog.notificationId && item.kind === "attendance-poll",
        );
        if (!notification?.attendancePollId || !notification.commissionMemberId) return null;
        const poll = model.state.attendancePolls.find(
          (item) => item.id === notification.attendancePollId,
        );
        if (!poll) return null;
        const member = COMMISSION_ATTENDANCE_MEMBERS.find(
          (item) => item.id === notification.commissionMemberId,
        );
        if (!member) return null;
        const answer = poll.responses[member.id];
        return (
          <Modal title="Подтвердите присутствие" onClose={close}>
            <p>
              {`Укажите, будете ли присутствовать на заседании ${formatDateTime(poll.dateTime)}.`}
            </p>
            <p className="muted">Член АК: {member.name}</p>
            <div className="dialog-actions">
              <Button onClick={close}>Отмена</Button>
              <Button
                className={answer === "no" ? "attendance-choice-active" : ""}
                onClick={() => answerAttendancePoll(notification.id, "no")}
              >
                Нет
              </Button>
              <Button
                primary
                className={answer === "yes" ? "attendance-choice-active" : ""}
                onClick={() => answerAttendancePoll(notification.id, "yes")}
              >
                Да
              </Button>
            </div>
          </Modal>
        );
      })()}
      {dialog?.type === "agenda-results" && (() => {
        const agenda = model.state.agendas.find(
          (item) => item.id === dialog.agendaId,
        );
        if (!agenda) return null;
        const agendaCases = agenda.caseIds
          .map((caseId) => model.state.cases.find((item) => item.id === caseId))
          .filter((item): item is ObjectionCase => Boolean(item));
        return (
          <AgendaResultsModal
            cases={agendaCases}
            meetingDate={agenda.meetingDate}
            onGenerate={(html) => {
              const next = structuredClone(model.state);
              const target = next.agendas.find((item) => item.id === agenda.id);
              if (!target) return;
              target.resultsHtml = html;
              model.commit(next, "Итоги по повестке дня сформированы");
              close();
            }}
            onClose={close}
          />
        );
      })()}
      {dialog?.type === "new" && (
        <NewCaseModal
          state={model.state}
          onClose={close}
          onSave={(next, caseId) => {
            model.commit(next, "Тестовое обращение зарегистрировано");
            model.navigate({ page: "detail", caseId });
          }}
        />
      )}
      {dialog?.type === "clock" && (
        <Modal title="Дата демонстрации" onClose={close}>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              try {
                const date = String(
                  new FormData(event.currentTarget).get("date"),
                );
                dateObject(date);
                model.commit({ ...model.state, date }, "Дата демо изменена");
                close();
              } catch (cause) {
                setDialogError(
                  cause instanceof Error ? cause.message : "Проверьте дату",
                );
              }
            }}
          >
            <Notice>
              Изменение даты помогает показать этапы с обязательными
              интервалами. Даты уже зарегистрированных событий сохраняются.
            </Notice>
            <Field
              field={{
                name: "date",
                label: "Рабочая дата",
                type: "date",
                value: model.state.date,
                required: true,
              }}
            />
            {dialogError && (
              <p className="form-error" role="alert">
                {dialogError}
              </p>
            )}
            <div className="dialog-actions">
              <Button onClick={close}>Отмена</Button>
              <Button primary type="submit">
                Изменить дату
              </Button>
            </div>
          </form>
        </Modal>
      )}
      {dialog?.type === "reset" && (
        <Modal title="Перезапустить демонстрацию" onClose={close}>
          <p>
            Три исходных обращения будут восстановлены. Действия и вложения,
            добавленные в этом браузере, будут удалены.
          </p>
          {dialogError && <p className="form-error">{dialogError}</p>}
          <div className="dialog-actions">
            <Button onClick={close}>Отмена</Button>
            <Button
              primary
              onClick={() => {
                try {
                  model.commit(
                    initialState(),
                    "Три исходных обращения восстановлены",
                  );
                  model.navigate({ page: "registry" });
                  close();
                } catch {
                  setDialogError("Браузер не разрешает сохранение данных");
                }
              }}
            >
              Сбросить демо
            </Button>
          </div>
        </Modal>
      )}
      {dialog?.type === "upload" && (
        <Modal title="Добавить материал дела" onClose={close}>
          <Notice>
            Обычное вложение не продлевает срок рассмотрения. Формальное
            дополнение регистрируется отдельным действием.
          </Notice>
          <label className="field">
            <span>Файл — до 2 МБ</span>
            <input
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.doc,.docx,.xls,.xlsx,.txt"
              disabled={uploading}
              onChange={(event) => void upload(event.target.files?.[0])}
            />
          </label>
          {uploading && <p>Сохранение файла…</p>}
          {dialogError && (
            <p className="form-error" role="alert">
              {dialogError}
            </p>
          )}
        </Modal>
      )}
      {model.toast && (
        <div className="react-toast" role="status">
          {model.toast}
        </div>
      )}
    </AppShell>
  );
}
