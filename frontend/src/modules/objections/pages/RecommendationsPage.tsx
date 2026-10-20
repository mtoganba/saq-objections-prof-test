import { Notice, PageHeading } from "../../../components/ui";
import type { CaseRecommendation, Role } from "../../../types";
import { formatDate } from "../../../utils/dateFormat";
import {
  recommendationStatusLabel,
  recommendationStatusTone,
  visibleForRole,
} from "../recommendationPresentation";

export default function RecommendationsPage({
  recommendations,
  role,
  onOpenRecommendation,
}: {
  recommendations: CaseRecommendation[];
  role: Role;
  onOpenRecommendation: (recommendationId: string) => void;
}) {
  const isWork = role === "demo-superuser" || role === "work";
  const visibleRecommendations = recommendations.filter((recommendation) =>
    visibleForRole(recommendation, role),
  );

  return (
    <>
      <PageHeading
        title="Рекомендации"
        subtitle={
          isWork
            ? "Направленные рекомендации и контроль их исполнения"
            : role === "deputy"
              ? "Рекомендации, поступившие на согласование"
              : role === "director"
                ? "Рекомендации и решения по исполнению, поступившие на подписание"
                : "Рекомендации, направленные в ваш кабинет для исполнения"
        }
      />
      {visibleRecommendations.length === 0 ? (
        <Notice>Рекомендаций пока нет.</Notice>
      ) : (
        <section className="card">
          <div className="table-wrap">
            <table className="registry-table recommendations-registry-table">
              <thead>
                <tr>
                  <th>№ рекомендации</th>
                  <th>Кому направлена</th>
                  <th>Способ направления</th>
                  <th>Дата направления</th>
                  <th>Срок исполнения</th>
                  <th>№ обращения</th>
                  <th>Статус</th>
                </tr>
              </thead>
              <tbody>
                {visibleRecommendations.map((recommendation, index) => (
                  <tr key={recommendation.id}>
                    <td>
                      <div className="recommendation-open-cell">
                        <strong>№ {index + 1}</strong>
                        <button
                          type="button"
                          className="recommendation-open-link"
                          onClick={() => onOpenRecommendation(recommendation.id)}
                        >
                          Открыть карточку <span>→</span>
                        </button>
                      </div>
                    </td>
                    <td>{recommendation.recipient}</td>
                    <td>
                      {recommendation.channel === "external"
                        ? recommendation.deliveryPath || "Другая система"
                        : "Кабинет SAQ"}
                      {recommendation.registrationNumber && (
                        <small className="subline">№ {recommendation.registrationNumber}</small>
                      )}
                    </td>
                    <td>{formatDate(recommendation.sentAt || recommendation.createdAt)}</td>
                    <td>{formatDate(recommendation.revisionDueDate || recommendation.dueDate)}</td>
                    <td>{recommendation.caseReference}</td>
                    <td>
                      <span className={`badge ${recommendationStatusTone(recommendation.status)}`}>
                        {recommendationStatusLabel(recommendation, role)}
                      </span>
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
