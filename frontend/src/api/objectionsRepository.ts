import { COMMISSION_ATTENDANCE_MEMBERS, seed } from "../data/objections";
import type { DemoState } from "../types";
import { presidingChairId } from "../modules/objections/services/decisions";

/** The demo adapter is the only module that reads or writes case storage. */
export interface ObjectionsRepository {
  load(): DemoState;
  save(state: DemoState): void;
}

export const STORAGE_KEY = "saq.objections.demo.v1";
const CURRENT_VERSION = 10;

// Version 6 distinguishes incoming SAQ appeals from manually created appeals.

export function initialState(): DemoState {
  return {
    version: CURRENT_VERSION,
    date: "2026-09-08",
    cases: seed(),
    agendas: [],
    notifications: [],
    recommendations: [],
    attendancePolls: [],
    activeCommissionMemberId: COMMISSION_ATTENDANCE_MEMBERS[0].id,
  };
}

export function createDemoRepository(
  storage: Pick<Storage, "getItem" | "setItem">,
): ObjectionsRepository {
  return {
    load() {
      const raw = storage.getItem(STORAGE_KEY);
      if (!raw) return initialState();
      const value = JSON.parse(raw) as DemoState;
      if (
        ![1, 2, 3, 4, 5, 6, 7, 8, 9, CURRENT_VERSION].includes(value.version) ||
        !Array.isArray(value.cases) ||
        typeof value.date !== "string"
      ) {
        throw new Error(
          "Сохранённые данные имеют неподдерживаемый формат. Сбросьте демонстрацию.",
        );
      }
      return {
        ...value,
        version: CURRENT_VERSION,
        agendas: value.agendas || [],
        notifications: value.notifications || [],
        recommendations: value.recommendations || [],
        attendancePolls: value.attendancePolls || [],
        activeCommissionMemberId:
          value.activeCommissionMemberId || COMMISSION_ATTENDANCE_MEMBERS[0].id,
        cases: value.cases.map((c) => {
          const migrated =
            c.status === "commission_members"
              ? { ...c, status: "commission_voting" as const }
              : c;
          const normalized =
            value.version < 5 && migrated.status === "received"
              ? { ...migrated, status: "accepted" as const }
              : migrated;
          // Polls are appended when the working body sends them. The latest
          // sent poll must take precedence even if its meeting date is earlier.
          const latestAttendancePoll = (value.attendancePolls || [])
            .filter((poll) => poll.caseIds.includes(c.id))
            .at(-1);
          const attendanceMembers = latestAttendancePoll
            ? COMMISSION_ATTENDANCE_MEMBERS
                .filter((member) => latestAttendancePoll.responses[member.id] === "yes")
                .map((member) => {
                  const present = true;
                  const chairId = presidingChairId(
                    COMMISSION_ATTENDANCE_MEMBERS
                      .filter(
                        (item) => latestAttendancePoll.responses[item.id] === "yes",
                      )
                      .map((item) => ({ id: item.id, present })),
                  );
                  return {
                    id: member.id,
                    name: member.name,
                    present,
                    isChair: member.id === chairId,
                    recused: false,
                    reason: "",
                  };
                })
            : normalized.members;
          const chairId = presidingChairId(attendanceMembers);
          const votes =
            latestAttendancePoll && normalized.votes && chairId
              ? Object.fromEntries(
                  Object.entries(normalized.votes).map(([pointId, vote]) => [
                    pointId,
                    { ...vote, chair: chairId },
                  ]),
                )
              : normalized.votes;
          const requests = normalized.requests.map((request) =>
            request.template === "other" &&
            request.saqRecipient === "subject" &&
            request.recipient !== "Кабинет Объекта"
              ? { ...request, saqRecipient: undefined }
              : request,
          );
          // Версии до независимой маршрутизации могли сохранить обращение
          // на этапе подписания, хотя все запросы уже были направлены.
          // После загрузки такой карточки она должна ожидать ответов.
          const status =
            ["request_approval", "request_signed"].includes(normalized.status) &&
            requests.length > 0 &&
            requests.every((request) => Boolean(request.sent))
              ? "request_approved"
              : normalized.status;
          // Файлы, внесённые рабочим органом при единой фиксации ответов,
          // относятся к ответу внешнего органа, а не к ответу ДВГА/КВГА.
          const otherRequest = requests.find(
            (request) => request.template === "other" && !request.saqRecipient,
          );
          const documentsAfterExternalResponseMigration = otherRequest
            ? normalized.documents.map((document) =>
                document.kind === "response-attachment"
                  ? { ...document, requestId: otherRequest.id }
                  : document,
              )
            : normalized.documents;
          // Ранние версии привязывали файл ответа из кабинета Объекта
          // к первому запросу «иной орган». Переносим его к фактическому
          // запросу в кабинет SAQ, чтобы он был виден рабочему органу.
          const subjectRequests = requests.filter(
            (request) =>
              request.template === "other" && request.saqRecipient === "subject",
          );
          const documents = documentsAfterExternalResponseMigration.map((document) => {
            if (document.kind !== "subject-response-attachment") return document;
            const subjectRequest =
              subjectRequests.find((request) => request.responded === document.date) ||
              (subjectRequests.length === 1 ? subjectRequests[0] : undefined);
            return subjectRequest && document.requestId !== subjectRequest.id
              ? { ...document, requestId: subjectRequest.id }
              : document;
          });
          return {
            ...normalized,
            status,
            requests,
            documents,
            members: attendanceMembers,
            votes,
            unread:
              normalized.unread ??
              (normalized.status === "received" && normalized.channel === "SAQ"),
          };
        }),
      };
    },
    save(state) {
      storage.setItem(STORAGE_KEY, JSON.stringify(state));
    },
  };
}
