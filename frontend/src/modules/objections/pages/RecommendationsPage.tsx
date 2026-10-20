import { useState } from "react";
import { Button, Modal, Notice, PageHeading } from "../../../components/ui";
import { ROLES } from "../../../data/constants";
import type { CaseRecommendation, Role } from "../../../types";
import { formatDate } from "../../../utils/dateFormat";
import { addWorkdays } from "../services/deadlines";

const EXECUTION_RESULT_OPTIONS = [
  "Заключение КК второго уровня с указанием номера и даты",
  "Признано соответствующим/не признано соответствующим",
  "Дата и номер аудиторского отчета (перепроверки)",
  "Дис. ответственность и иные меры реагирования",
  "Изменения в НПА/др",
] as const;

export default function RecommendationsPage({
  recommendations,
  role,
  onOpenCase,
  onExecute,
}: {
  recommendations: CaseRecommendation[];
  role: Role;
  onOpenCase: (caseId: string) => void;
  onExecute: (
    recommendationId: string,
    answer: string,
    executionResult: string,
  ) => void;
}) {
  const [selected, setSelected] = useState<CaseRecommendation | null>(null);
  const visibleRecommendations =
    (role === "demo-superuser" || role === "work")
      ? recommendations
      : recommendations.filter(
          (recommendation) =>
            recommendation.recipientRole === role ||
            (!recommendation.recipientRole && recommendation.recipient === ROLES[role]),
        );

  return (
    <>
      <PageHeading
        title="Рекомендации"
        subtitle={
          (role === "demo-superuser" || role === "work")
            ? "Направленные рекомендации и контроль их исполнения"
            : "Рекомендации, направленные в ваш кабинет для исполнения"
        }
      />
      {visibleRecommendations.length === 0 ? (
        <Notice>Рекомендаций пока нет.</Notice>
      ) : (
        <section className="card">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>№</th>
                  <th>Текст рекомендации</th>
                  <th>Кому направлена рекомендация</th>
                  <th>Дата направления</th>
                  <th>Срок исполнения</th>
                  <th>Вид исполнения</th>
                  <th>Статус</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {visibleRecommendations.map((recommendation, index) => (
                  <tr key={recommendation.id}>
                    <td>{index + 1}</td>
                    <td>{recommendation.text}</td>
                    <td>{recommendation.recipient}</td>
                    <td>
                      {formatDate(recommendation.sentAt || recommendation.createdAt)}
                    </td>
                    <td>
                      {formatDate(
                        recommendation.dueDate ||
                          addWorkdays(recommendation.sentAt || recommendation.createdAt, 30),
                      )}
                    </td>
                    <td>{recommendation.executionResult || "—"}</td>
                    <td>
                      <span className={`badge ${recommendation.status === "executed" ? "green" : "blue"}`}>
                        {recommendation.status === "executed" ? "Исполнен" : "Направлен"}
                      </span>
                    </td>
                    <td>
                      {recommendation.status === "sent" &&
                        (role === "demo-superuser" || role === recommendation.recipientRole) && (
                        <Button primary onClick={() => setSelected(recommendation)}>
                          Внести ответ
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
      {selected && (
        <Modal title="Исполнение рекомендации" onClose={() => setSelected(null)}>
          <form
            className="form-grid"
            onSubmit={(event) => {
              event.preventDefault();
              const answer = String(
                new FormData(event.currentTarget).get("answer") || "",
              ).trim();
              const executionResult = String(
                new FormData(event.currentTarget).get("executionResult") || "",
              ).trim();
              if (!answer || !executionResult) return;
              onExecute(selected.id, answer, executionResult);
              setSelected(null);
            }}
          >
            <label className="field">
              <span>Результат исполнения рекомендации <span className="required">*</span></span>
              <select name="executionResult" required defaultValue="">
                <option value="" disabled>Выберите результат</option>
                {EXECUTION_RESULT_OPTIONS.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Ответ <span className="required">*</span></span>
              <textarea name="answer" required rows={5} />
            </label>
            <div className="actions">
              <Button type="button" onClick={() => setSelected(null)}>Отмена</Button>
              <Button primary type="submit">Зафиксировать исполнение</Button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
