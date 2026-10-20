import { Button, Notice, PageHeading } from "../../../components/ui";
import type {
  CaseNotification,
  Role,
} from "../../../types";
import { formatDate } from "../../../utils/dateFormat";

export default function NotificationsPage({
  notifications,
  onOpenCase,
  role,
  activeCommissionMemberId,
  date,
  onAnswerAttendancePoll,
  onOpenSessions,
  onOpenRecommendations,
}: {
  notifications: CaseNotification[];
  onOpenCase: (caseId: string) => void;
  role: Role;
  activeCommissionMemberId: string;
  date: string;
  onAnswerAttendancePoll: (notificationId: string) => void;
  onOpenSessions: (meetingId?: string) => void;
  onOpenRecommendations: () => void;
}) {
  const availableNotifications = notifications.filter(
    (notification) => notification.date <= date,
  );
  const visibleNotifications =
    role === "commission"
      ? availableNotifications.filter(
          (notification) =>
            (notification.kind === "attendance-poll" ||
              notification.kind === "agenda-signed") &&
            notification.commissionMemberId === activeCommissionMemberId,
        )
      : availableNotifications.filter((notification) =>
          notification.recipientRole
            ? notification.recipientRole === role
            : notification.kind !== "attendance-poll" &&
              notification.kind !== "agenda-signed",
        );
  const orderedNotifications = [...visibleNotifications].sort((left, right) => {
    if (left.read !== right.read) return Number(left.read) - Number(right.read);
    return right.date.localeCompare(left.date) || right.id.localeCompare(left.id);
  });
  return (
    <>
      <PageHeading
        title="Уведомления"
        subtitle={
          role === "commission"
            ? "Опросы о присутствии и доступ к материалам заседаний"
            : "Автоматические сообщения объектам аудита и заявителям"
        }
      />
      {orderedNotifications.length === 0 ? (
        <Notice>Уведомлений пока нет.</Notice>
      ) : (
        <section className="card">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Дата</th>
                  <th>Получатель</th>
                  <th>Текст уведомления</th>
                  <th>Обращение</th>
                </tr>
              </thead>
              <tbody>
                {orderedNotifications.map((notification) => (
                  <tr key={notification.id}>
                    <td>{formatDate(notification.date)}</td>
                    <td>{notification.recipient}</td>
                    <td>
                      {notification.text}
                      {notification.kind === "attendance-poll" && !notification.read && (
                        <span className="badge blue notification-new-badge">Новое</span>
                      )}
                    </td>
                    <td>
                      {notification.kind === "attendance-poll" ? (
                        <Button
                          primary
                          disabled={notification.read}
                          onClick={() =>
                            notification.attendancePollId &&
                            notification.commissionMemberId &&
                            onAnswerAttendancePoll(notification.id)
                          }
                        >
                          {notification.read ? "Ответ направлен" : "Ответить"}
                        </Button>
                      ) : notification.kind === "recommendation" ? (
                        <Button primary onClick={onOpenRecommendations}>
                          Открыть рекомендации
                        </Button>
                      ) : notification.kind === "agenda-sign" ? (
                        <Button
                          primary
                          onClick={() => onOpenSessions(notification.meetingId)}
                        >
                          Открыть заседание
                        </Button>
                      ) : notification.kind === "agenda-signed" ? (
                        <Button onClick={() => onOpenSessions(notification.meetingId)}>
                          К заседанию
                        </Button>
                      ) : (
                        <Button
                          primary={notification.kind === "request-response"}
                          onClick={() => onOpenCase(notification.caseId)}
                        >
                          {notification.kind === "request-response"
                            ? "Открыть обращение"
                            : "Открыть"}
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}
