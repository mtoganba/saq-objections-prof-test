import { renderToStaticMarkup } from "react-dom/server";
import { Button, Modal, Notice } from "../../../components/ui";
import type { ObjectionCase } from "../../../types";
import { OUTCOMES } from "../../../data/constants";
import { formatDate } from "../../../utils/dateFormat";
import {
  normalizeVoteChoice,
  overall,
  pointOutcomeFromVotes,
  presidingChairId,
} from "../services/decisions";
import { agendaItemText } from "./AgendaModal";

function pointVotes(c: ObjectionCase) {
  const disputedPoints = c.issues.filter((point) => point.disputed);
  if (!disputedPoints.length) return ["Голоса не зафиксированы"];
  return disputedPoints.map((point) => {
    const result = c.votes?.[point.id];
    if (!result) return `Пункт ${point.number}: голоса не зафиксированы`;
    const votes = result.votes || {};
    const summary = Object.entries(OUTCOMES)
      .map(([value, label]) => {
        const names = c.members
          .filter(
            (member) => normalizeVoteChoice(votes[member.id]) === value,
          )
          .map((member) => member.name);
        return names.length ? `${label} — ${names.join(", ")}` : "";
      })
      .filter(Boolean);
    return `Пункт ${point.number}: ${summary.join("; ") || "голоса не зафиксированы"}`;
  });
}

function overallResult(c: ObjectionCase) {
  const result = overall(c);
  return result ? OUTCOMES[result] : "Не определён";
}

function pointResults(c: ObjectionCase) {
  const disputedPoints = c.issues.filter((point) => point.disputed);
  if (!disputedPoints.length) return ["Результат не определён"];

  return disputedPoints.map((point) => {
    const voteResult = c.votes?.[point.id];
    // До завершения голосования результат по пункту не определяется:
    // предварительные значения из справки не должны попадать в итоги заседания.
    const result = pointOutcomeFromVotes(
      voteResult?.votes || {},
      presidingChairId(c.members) || voteResult?.chair,
    );
    return `Пункт ${point.number}: ${result ? OUTCOMES[result] : "Не определён"}`;
  });
}

export function AgendaResultsTable({ cases }: { cases: ObjectionCase[] }) {
  return (
    <>
      {cases.length ? (
        <div className="table-scroll">
          <table className="data-table agenda-results-table">
            <thead>
              <tr>
                <th>№</th>
                <th>Пункт повестки дня</th>
                <th>Голоса по каждому пункту</th>
                <th>Итоговый результат по пункту</th>
                <th>Итоговый результат по материалу</th>
              </tr>
            </thead>
            <tbody>
              {cases.map((c, index) => (
                <tr key={c.id}>
                  <td>{index + 1}</td>
                  <td>{agendaItemText(c)}</td>
                  <td>
                    {pointVotes(c).map((summary, summaryIndex) => (
                      <p
                        key={`${c.id}-${summaryIndex}`}
                        className="agenda-vote-summary"
                      >
                        {summary}
                      </p>
                    ))}
                  </td>
                  <td>
                    {pointResults(c).map((summary, summaryIndex) => (
                      <p
                        key={`${c.id}-result-${summaryIndex}`}
                        className="agenda-vote-summary"
                      >
                        {summary}
                      </p>
                    ))}
                  </td>
                  <td>{overallResult(c)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Notice>По выбранной дате нет направленных пунктов повестки дня.</Notice>
      )}
    </>
  );
}

export function AgendaResultsDocument({
  cases,
  meetingDate,
}: {
  cases: ObjectionCase[];
  meetingDate: string;
}) {
  return (
    <article className="print-document agenda-results-document">
      <h1>Итоги по повестке дня</h1>
      <p>Дата заседания: {formatDate(meetingDate)}</p>
      <AgendaResultsTable cases={cases} />
    </article>
  );
}

export function agendaResultsDocumentHtml(
  cases: ObjectionCase[],
  meetingDate: string,
) {
  const content = renderToStaticMarkup(
    <AgendaResultsDocument cases={cases} meetingDate={meetingDate} />,
  );
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>Итоги по повестке дня</title><style>
    @page { size: A4 landscape; margin: 15mm; }
    * { box-sizing: border-box; }
    body { margin: 0; padding: 24px; color: #111; background: #edf3f6; font-family: "Times New Roman", Times, serif; }
    .agenda-results-document { width: 100%; max-width: 297mm; min-height: 210mm; margin: 0 auto; padding: 18mm; background: #fff; }
    .agenda-results-document h1 { margin: 0 0 8mm; text-align: center; font-size: 16pt; }
    .agenda-results-document > p { margin: 0 0 7mm; }
    table { width: 100%; border-collapse: collapse; font-size: 11pt; }
    th, td { border: 1px solid #111; padding: 6px; vertical-align: top; text-align: left; }
    th { text-align: center; }
    th:first-child, td:first-child { width: 7%; text-align: center; }
    .agenda-vote-summary { margin: 0 0 5px; }
    @media print { body { padding: 0; background: #fff; } .agenda-results-document { min-height: 0; padding: 0; } }
  </style></head><body>${content}</body></html>`;
}

export default function AgendaResultsModal({
  cases,
  meetingDate,
  onGenerate,
  onClose,
}: {
  cases: ObjectionCase[];
  meetingDate: string;
  onGenerate: (html: string) => void;
  onClose: () => void;
}) {
  return (
    <Modal title="Сформировать итоги по повестке дня" onClose={onClose} wide>
      <p className="muted agenda-results-date">
        Пункты повестки дня на {formatDate(meetingDate)}
      </p>
      <AgendaResultsTable cases={cases} />
      <div className="dialog-actions">
        <Button onClick={onClose}>Закрыть</Button>
        <Button
          primary
          disabled={!cases.length}
          onClick={() => onGenerate(agendaResultsDocumentHtml(cases, meetingDate))}
        >
          Сформировать итоги
        </Button>
      </div>
    </Modal>
  );
}
