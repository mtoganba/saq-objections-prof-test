import {
  COMMISSION_ATTENDANCE_MEMBERS,
  seed,
  sharedAuditObjection,
  sharedSaqStatementApplication,
  sharedStatementApplication,
} from "../data/objections";
import type { DemoState, Role } from "../types";
import { formatDate } from "../utils/dateFormat";
import { presidingChairId } from "../modules/objections/services/decisions";

/** The demo adapter is the only module that reads or writes case storage. */
export interface ObjectionsRepository {
  load(): DemoState;
  save(state: DemoState): void;
}

export const STORAGE_KEY = "saq.objections.demo.v1";
const CURRENT_VERSION = 12;

/**
 * Карточки из старого демонстрационного набора больше не должны появляться
 * после обновления приложения или загрузки сохранённого состояния.
 */
const REMOVED_DEMO_CASE_IDS = new Set([
  "ВОЗ-2026-004",
  "ВОЗ-2026-001",
  "ВОЗ-2026-002",
  "ЖАЛ-2026-003",
]);
const RENAMED_DEMO_CASE_IDS = new Map([["В-2026-005", "В-2026-001"]]);

function migratedCaseId(id: string) {
  return RENAMED_DEMO_CASE_IDS.get(id) || id;
}

function normalizeCaseIds(ids: readonly string[] | undefined) {
  return (ids || [])
    .map(migratedCaseId)
    .filter((id) => !REMOVED_DEMO_CASE_IDS.has(id));
}

function isRemovedDemoCase(id: string) {
  return REMOVED_DEMO_CASE_IDS.has(id);
}

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

function authorityRecipientRole(issuer: string): Role {
  return issuer.toUpperCase().includes("КВГА") ? "kvga" : "dvga";
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
        ![1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, CURRENT_VERSION].includes(value.version) ||
        !Array.isArray(value.cases) ||
        typeof value.date !== "string"
      ) {
        throw new Error(
          "Сохранённые данные имеют неподдерживаемый формат. Сбросьте демонстрацию.",
        );
      }
      // Переносим оставшееся обращение со старого системного номера и
      // удаляем карточки, которые больше не входят в исходный набор демо.
      // Сначала устраняем дубли, которые могли появиться при одновременном
      // наличии старого и нового номера в localStorage.
      const persistedCases = value.cases.reduce<typeof value.cases>((result, item) => {
        if (isRemovedDemoCase(item.id)) return result;
        const id = migratedCaseId(item.id);
        if (result.some((existing) => existing.id === id)) return result;
        result.push({
          ...item,
          id,
          appealNumber:
            item.appealNumber === "В-2026-005"
              ? "В-2026-001"
              : item.appealNumber,
        });
        return result;
      }, []);
      const cases = persistedCases.map((c) => {
        const migrated =
          c.status === "commission_members"
            ? { ...c, status: "commission_voting" as const }
            : c;
        const normalized =
          value.version < 5 && migrated.status === "received"
            ? { ...migrated, status: "accepted" as const }
            : migrated;
        // The participants belong to the meeting that currently contains the
        // case. Earlier polls can remain in storage after rescheduling and
        // must not replace answers from the current meeting.
        const matchingMeeting = (value.meetings || [])
          .filter(
            (meeting) =>
              meeting.caseIds.includes(c.id) &&
              (!normalized.attendanceMeetingDate ||
                meeting.dateTime.slice(0, 10) ===
                  normalized.attendanceMeetingDate),
          )
          .sort((left, right) => right.dateTime.localeCompare(left.dateTime))
          .at(0);
        const latestAttendancePoll = matchingMeeting
          ? (value.attendancePolls || []).find(
              (poll) => poll.id === matchingMeeting.pollId,
            )
          : (value.attendancePolls || [])
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
        const hasFinalResponse = documents.some(
          (document) => document.kind === "final-response",
        );
        const delivery =
          status === "completed" &&
          hasFinalResponse &&
          normalized.delivery &&
          !normalized.delivery.recipientRoles
            ? {
                ...normalized.delivery,
                recipientRoles: [authorityRecipientRole(normalized.issuer), "subject"] as Role[],
              }
            : normalized.delivery;
        return {
          ...normalized,
          status,
          delivery,
          requests,
          documents,
          members: attendanceMembers,
          votes,
          unread:
            normalized.unread ??
            (normalized.status === "received" && normalized.channel === "SAQ"),
        };
      });
      const previousNotifications = (value.notifications || [])
        .filter((notification) => !isRemovedDemoCase(notification.caseId))
        .map((notification) => ({
          ...notification,
          caseId: migratedCaseId(notification.caseId),
        }));
      const legacyFinalResponseNotifications =
        value.version < CURRENT_VERSION
          ? cases.flatMap((c) => {
              const finalResponse = c.documents
                .filter((document) => document.kind === "final-response")
                .at(-1);
              if (!finalResponse || c.status !== "completed") return [];
              const recipientRoles: Role[] = c.delivery?.recipientRoles || [];
              return recipientRoles
                .filter(
                  (recipientRole) =>
                    !previousNotifications.some(
                      (notification) =>
                        notification.caseId === c.id &&
                        notification.kind === "final-response" &&
                        notification.recipientRole === recipientRole,
                    ),
                )
                .map((recipientRole, index) => ({
                  id: `final-response-${c.id}-${index + 1}`,
                  caseId: c.id,
                  recipient:
                    recipientRole === "subject"
                      ? c.org
                      : recipientRole === "kvga"
                        ? "КВГА"
                        : "ДВГА",
                  recipientRole,
                  date: c.delivery?.date || finalResponse.date || c.registered,
                  read: false,
                  kind: "final-response" as const,
                  text: `Направлен окончательный ответ на обращение №${c.appealNumber || c.id} от ${formatDate(c.appealDate || c.registered)}.`,
                }));
            })
          : [];
      const sharedCases = [
        sharedAuditObjection(),
        sharedStatementApplication(),
        sharedSaqStatementApplication(),
      ];
      const casesWithSharedCases: DemoState["cases"] = [...cases];
      sharedCases.forEach((sharedCase) => {
        if (!casesWithSharedCases.some((c) => c.id === sharedCase.id)) {
          casesWithSharedCases.unshift(sharedCase);
        }
      });
      return {
        ...value,
        version: CURRENT_VERSION,
        agendas: (value.agendas || [])
          .map((agenda) => ({
            ...agenda,
            caseIds: normalizeCaseIds(agenda.caseIds),
          }))
          .filter((agenda) => agenda.caseIds.length > 0),
        meetings: (value.meetings || [])
          .map((meeting) => ({
            ...meeting,
            caseIds: normalizeCaseIds(meeting.caseIds),
            postponedCaseIds: meeting.postponedCaseIds
              ? normalizeCaseIds(meeting.postponedCaseIds)
              : undefined,
          }))
          .filter((meeting) => meeting.caseIds.length > 0),
        notifications: [...previousNotifications, ...legacyFinalResponseNotifications],
        recommendations: (value.recommendations || [])
          .filter((recommendation) => !isRemovedDemoCase(recommendation.caseId))
          .map((recommendation) => ({
            ...recommendation,
            caseId: migratedCaseId(recommendation.caseId),
          })),
        attendancePolls: (value.attendancePolls || [])
          .map((poll) => ({
            ...poll,
            caseIds: normalizeCaseIds(poll.caseIds),
          }))
          .filter((poll) => poll.caseIds.length > 0),
        activeCommissionMemberId:
          value.activeCommissionMemberId || COMMISSION_ATTENDANCE_MEMBERS[0].id,
        cases: casesWithSharedCases,
      };
    },
    save(state) {
      storage.setItem(STORAGE_KEY, JSON.stringify(state));
    },
  };
}
