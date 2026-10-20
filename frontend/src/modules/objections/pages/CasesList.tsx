import { useMemo, useState } from "react";
import { Button, PageHeading } from "../../../components/ui";
import { CLOSED, STATUS, TYPES } from "../../../data/constants";
import type { ObjectionCase } from "../../../types";
import { formatDate } from "../../../utils/dateFormat";
import { reviewDeadline } from "../services/deadlines";

export default function CasesList({
  cases,
  date,
  onOpen,
  onCreate,
  onExport,
}: {
  cases: ObjectionCase[];
  date: string;
  onOpen: (c: ObjectionCase) => void;
  onCreate: () => void;
  onExport: (cases: ObjectionCase[]) => void;
}) {
  const [query, setQuery] = useState("");
  const [type, setType] = useState("all");
  const [tab, setTab] = useState("all");
  const visible = useMemo(
    () =>
      cases.filter((c) => {
        const matchesQuery = `${c.id} ${c.org} ${c.bin}`
          .toLowerCase()
          .includes(query.toLowerCase());
        const closed = CLOSED.includes(c.status);
        return (
          matchesQuery &&
          (type === "all" || c.type === type) &&
          (tab === "all" ||
            (tab === "new" && c.status === "received") ||
            (tab === "active" && !closed && c.status !== "received") ||
            (tab === "closed" && closed))
        );
      }),
    [cases, query, type, tab],
  );
  const stats = [
    [cases.length, "Всего обращений"],
    [cases.filter((c) => c.status === "received").length, "Поступило"],
    [
      cases.filter((c) => !CLOSED.includes(c.status) && c.status !== "received")
        .length,
      "На рассмотрении",
    ],
    [cases.filter((c) => CLOSED.includes(c.status)).length, "Завершено"],
  ];
  return (
    <>
      <PageHeading
        title="Реестр обращений"
        subtitle="Возражения объектов аудита и жалобы субъектов контроля"
        action={
          <>
            <Button onClick={() => onExport(visible)}>Экспорт CSV</Button>
            <Button primary onClick={onCreate}>
              + Новое обращение
            </Button>
          </>
        }
      />
      <div className="stats">
        {stats.map(([number, label]) => (
          <section className="stat" key={label}>
            <div>
              <strong className="stat-value">{number}</strong>
              <span className="stat-label">{label}</span>
            </div>
          </section>
        ))}
      </div>
      <section className="card">
        <div className="tabs">
          {[
            ["all", "Все обращения"],
            ["new", "Поступившие"],
            ["active", "В работе"],
            ["closed", "Завершённые"],
          ].map(([value, label]) => (
            <button
              key={value}
              className={tab === value ? "active" : ""}
              onClick={() => setTab(value)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="registry-filters">
          <label className="field">
            <span>Поиск</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Номер обращения, объект или БИН"
            />
          </label>
          <label className="field">
            <span>Предмет обращения</span>
            <select
              value={type}
              onChange={(event) => setType(event.target.value)}
            >
              <option value="all">Все виды</option>
              {Object.entries(TYPES).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <span className="muted">Найдено: {visible.length}</span>
        </div>
        <div className="table-scroll">
          <table className="registry-table">
            <thead>
              <tr>
                <th>Обращение / поступление</th>
                <th>Объект</th>
                <th>Предмет обращения</th>
                <th>Статус</th>
                <th>Срок рассмотрения</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {visible.map((c) => (
                <tr key={c.id}>
                  <td>
                    <button className="text-button" onClick={() => onOpen(c)}>
                      {c.id}
                    </button>
                    <span className="subline">{formatDate(c.registered)}</span>
                  </td>
                  <td>
                    <strong>{c.org}</strong>
                    <span className="subline">БИН {c.bin}</span>
                  </td>
                  <td>
                    {TYPES[c.type]}
                    <span className="subline">№ {c.document.number}</span>
                  </td>
                  <td>
                    <span
                      className={`badge ${CLOSED.includes(c.status) ? "green" : "blue"}`}
                    >
                      {STATUS[c.status]}
                    </span>
                  </td>
                  <td>
                    <strong
                      className={
                        reviewDeadline(c) < date && !CLOSED.includes(c.status)
                          ? "text-danger"
                          : ""
                      }
                    >
                      {c.status === "paused"
                        ? "Приостановлен"
                        : formatDate(reviewDeadline(c))}
                    </strong>
                  </td>
                  <td>
                    <Button onClick={() => onOpen(c)}>Открыть</Button>
                  </td>
                </tr>
              ))}
              {!visible.length && (
                <tr>
                  <td colSpan={6}>
                    <div className="empty-state">
                      <h3>Обращения не найдены</h3>
                      <p>Измените строку поиска или фильтры.</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
