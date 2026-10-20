import { renderToStaticMarkup } from "react-dom/server";
import { useState } from "react";
import { Button, Modal } from "../../../components/ui";
import { OUTCOMES } from "../../../data/constants";
import type {
  CaseCertificate,
  CaseDocument,
  CaseRequest,
  CommissionMember,
  ObjectionCase,
} from "../../../types";
import {
  formatDate,
  formatMoney,
} from "../../../utils/dateFormat";
import { auditAuthorityFullName } from "../../../utils/auditAuthority";
import { downloadFile } from "../../../utils/download";
import { DEMO_USER } from "../../../config";
import {
  normalizeVoteChoice,
  overall,
  pointOutcomeFromVotes,
  presidingChairId,
} from "../services/decisions";

function requestDeadlineDate(deadline: string) {
  return formatDate(deadline.slice(0, 10));
}

function requestIntro(c: ObjectionCase, deadline: string) {
  const details = c.agendaDetails;
  const appealType =
    c.appealType ??
    (c.type === "notice"
      ? "Возражение на уведомления"
      : c.type === "audit"
        ? "Возражение на аудиторский отчет"
        : "");
  const deadlineDate = requestDeadlineDate(deadline);
  const finish = (appeal: "возражения" | "заявления" | "жалобы") =>
    `, просим в срок до 18:00 часов ${deadlineDate} представить мотивированный ответ по каждому доводу ${appeal} с приложением подтверждающих документов.`;

  if (appealType === "Возражение на уведомления")
    return `В связи с поступлением на рассмотрение Апелляционной комиссии Министерства финансов Республики Казахстан возражения от ${c.org}, ИИН/БИН ${c.bin || "—"}, № ${c.appealNumber || "—"} от ${formatDate(c.appealDate || c.filed)} года, к уведомлению об устранении нарушений от ${formatDate(c.document.date)} года № ${c.document.number || "—"}, направленного по результатам камерального контроля ${auditAuthorityFullName(c.issuer)}, просим представить мотивированный ответ по каждому доводу возражения и подтверждающие документы.`;

  if (appealType === "Жалоба на уведомление")
    return `В связи с поступлением на рассмотрение Апелляционной комиссии Министерства финансов Республики Казахстан жалобы от ${c.org}, ИИН/БИН ${c.bin || "—"}, № ${c.appealNumber || "—"} от ${formatDate(c.appealDate || c.filed)} года, к уведомлению об устранении нарушений от ${formatDate(c.document.date)} года № ${c.document.number || "—"}, направленного по результатам камерального контроля ${auditAuthorityFullName(c.issuer)}, просим представить мотивированный ответ по каждому доводу возражения и подтверждающие документы.`;

  if (appealType === "Возражение на аудиторский отчет")
    return `В связи с поступлением на рассмотрение Апелляционной комиссии Министерства финансов Республики Казахстан возражения ${c.org} к нарушениям, указанным в аудиторском отчете от ${formatDate(c.document.date)} №${c.document.number || "—"}${finish("возражения")}`;

  if (appealType === "Заявление")
    return `В связи с поступлением на рассмотрение Апелляционной комиссии Министерства финансов Республики Казахстан заявления ${c.org}${finish("заявления")}`;

  if (appealType === "Жалоба на решение КВГА/ДВГА") {
    if (details?.decisionKind === "quality-control" || details?.decisionKind === "inspection-act")
      return `В связи с поступлением на рассмотрение Апелляционной комиссии Министерства финансов Республики Казахстан жалобы ${c.org} на решение контроля качества от ${formatDate(c.document.date)} №${c.document.number || "—"}${finish("жалобы")}`;
    if (details?.decisionKind === "administrative-act")
      return `В связи с поступлением на рассмотрение Апелляционной комиссии Министерства финансов Республики Казахстан жалобы ${c.org} на административный акт от ${formatDate(c.document.date)} №${c.document.number || "—"}${finish("жалобы")}`;
    if (details?.decisionKind === "prescription-preventive")
      return `В связи с поступлением на рассмотрение Апелляционной комиссии Министерства финансов Республики Казахстан жалобы ${c.org} на предписание на акт о результате профилактического контроля от ${formatDate(details.relatedDocumentDate)} №${details.relatedDocumentNumber || "—"}${finish("жалобы")}`;
    return `В связи с поступлением на рассмотрение Апелляционной комиссии Министерства финансов Республики Казахстан жалобы ${c.org} на предписание на аудиторский отчет от ${formatDate(details?.relatedDocumentDate)} №${details?.relatedDocumentNumber || "—"}${finish("жалобы")}`;
  }

  if (appealType === "Жалоба на действие/бездействие") {
    const authority = auditAuthorityFullName(c.issuer);
    if (details?.procurementNumber)
      return `В связи с поступлением на рассмотрение Апелляционной комиссии Министерства финансов Республики Казахстан жалобы ${c.org} касательно действия/бездействия ${authority} при рассмотрении обращения от ${formatDate(c.document.date)} №${c.document.number || "—"} по государственной закупке № ${details.procurementNumber} (лот №${details.lotNumber || "—"}) на ${details.procurementSubject || "—"}${finish("жалобы")}`;
    return `В связи с поступлением на рассмотрение Апелляционной комиссии Министерства финансов Республики Казахстан жалобы ${c.org} касательно действия/бездействия ${authority} на аудиторский отчет от ${formatDate(c.document.date)} №${c.document.number || "—"}${finish("жалобы")}`;
  }

  if (appealType === "Жалоба на акт о результате профилактического контроля")
    return `В связи с поступлением на рассмотрение Апелляционной комиссии Министерства финансов Республики Казахстан жалобы ${c.org} на акт о результате профилактического контроля ${auditAuthorityFullName(c.issuer)} от ${formatDate(c.document.date)} №${c.document.number || "—"}${finish("жалобы")}`;

  return `В связи с поступлением на рассмотрение Апелляционной комиссии Министерства финансов Республики Казахстан обращения ${c.org}${finish("жалобы")}`;
}

function certificateIntro(c: ObjectionCase) {
  const details = c.agendaDetails;
  const appealType = c.appealType ?? "";
  const number = c.appealNumber || c.document.number || "—";
  const date = formatDate(c.appealDate || c.filed);
  const sourceDate = formatDate(c.document.date);
  const sourceNumber = c.document.number || "—";
  const authority = auditAuthorityFullName(c.issuer);
  const applicant = `${c.org}, ИИН/БИН ${c.bin}`;

  if (appealType === "Заявление")
    return `В Министерство финансов Республики Казахстан поступило заявление № ${number} от ${date} ${applicant}: ${c.request || "—"}.`;

  if (appealType === "Жалоба на акт о результате профилактического контроля")
    return `В Министерство финансов Республики Казахстан поступила жалоба № ${number} от ${date} ${applicant}, на акт о результате профилактического контроля ${authority} от ${sourceDate} № ${sourceNumber}.`;

  if (appealType === "Жалоба на действие/бездействие") {
    if (details?.procurementNumber)
      return `В Министерство финансов Республики Казахстан поступила жалоба № ${number} от ${date} ${applicant}, касательно действия/бездействия ${authority} при рассмотрении обращения от ${sourceDate} № ${sourceNumber} по государственной закупке № ${details.procurementNumber}, лот № ${details.lotNumber || "—"}, предмет: ${details.procurementSubject || "—"}.`;
    return `В Министерство финансов Республики Казахстан поступила жалоба № ${number} от ${date} ${applicant}, касательно действия/бездействия ${authority} по аудиторскому отчёту от ${sourceDate} № ${sourceNumber}.`;
  }

  if (appealType === "Жалоба на решение КВГА/ДВГА") {
    if (details?.decisionKind === "prescription-preventive")
      return `В Министерство финансов Республики Казахстан поступила жалоба № ${number} от ${date} ${applicant}, на предписание ${authority} от ${sourceDate} № ${sourceNumber} по профилактическому контролю № ${details.relatedDocumentNumber || "—"} от ${formatDate(details.relatedDocumentDate)}.`;
    if (details?.decisionKind === "quality-control" || details?.decisionKind === "inspection-act")
      return `В Министерство финансов Республики Казахстан поступила жалоба № ${number} от ${date} ${applicant}, по результатам контроля качества ${authority} от ${sourceDate} № ${sourceNumber}.`;
    if (details?.decisionKind === "administrative-act")
      return `В Министерство финансов Республики Казахстан поступила жалоба № ${number} от ${date} ${applicant}, на административный акт ${authority} от ${sourceDate} № ${sourceNumber}.`;
    return `В Министерство финансов Республики Казахстан поступила жалоба № ${number} от ${date} ${applicant}, на предписание ${authority} от ${sourceDate} № ${sourceNumber} по аудиторскому отчёту № ${details?.relatedDocumentNumber || "—"} от ${formatDate(details?.relatedDocumentDate)}.`;
  }

  if (appealType === "Возражение на уведомления")
    return `В Министерство финансов Республики Казахстан поступило возражение от ${c.org}, ИИН/БИН ${c.bin || "—"}, № ${number} от ${date} года, к уведомлению об устранении нарушений от ${sourceDate} года № ${sourceNumber}, направленного по результатам камерального контроля ${authority}.`;

  if (appealType === "Жалоба на уведомление")
    return `В Министерство финансов Республики Казахстан поступила жалоба от ${c.org}, ИИН/БИН ${c.bin || "—"}, № ${number} от ${date} года, к уведомлению об устранении нарушений от ${sourceDate} года № ${sourceNumber}, направленного по результатам камерального контроля ${authority}.`;

  if (appealType === "Возражение на аудиторский отчет")
    return `В Министерство финансов Республики Казахстан поступило возражение № ${number} от ${date} ${applicant}, на аудиторский отчёт от ${sourceDate} № ${sourceNumber}, проведённый ${authority}. Исполнитель: ${c.assignee || DEMO_USER.fullName}.`;

  return `В Министерство финансов Республики Казахстан поступило обращение № ${number} от ${date} ${applicant}.`;
}

const REQUEST_REGULATORY_NOTICE =
  "Также сообщаем, что в соответствии с пунктом 14 Положения об апелляционной комиссии по рассмотрению возражений к аудиторскому отчету или аудиторскому отчету по финансовой отчетности, уведомлению об устранении нарушений, выявленных по результатам камерального контроля уполномоченного органа по внутреннему государственному аудиту и обжалованию решений, действий (бездействия) уполномоченного органа по внутреннему государственному аудиту и (или) его должностных лиц, утвержденного приказом Первого заместителя Премьер-Министра Республики Казахстан — Министра финансов Республики Казахстан от 20 марта 2020 года № 302, ведомство уполномоченного органа, территориальное подразделение ведомства уполномоченного органа представляют ответ на запрос в Рабочий орган в срок не позднее 2 (двух) рабочих дней с даты получения такого запроса.";

export function DocumentContent({
  c,
  kind,
  document,
  requestPreview,
  appendixRecipient,
  appendixFindingPreview,
  appendixPreview,
  certificatePreview,
  protocolPreview,
}: {
  c: ObjectionCase;
  kind: string;
  document?: CaseDocument;
  requestPreview?: Pick<
    CaseRequest,
    | "recipient"
    | "deadline"
    | "customText"
    | "template"
    | "author"
    | "authorityResponses"
  >;
  appendixRecipient?: string;
  appendixFindingPreview?: Record<string, string>;
  appendixPreview?: Record<string, string>;
  certificatePreview?: CaseCertificate;
  protocolPreview?: {
    date: string;
    number: string;
    audio: string;
    format?: "онлайн, Qosyl" | "офлайн";
    recommendations?: string;
    members: CommissionMember[];
    votes: Record<string, Record<string, string>>;
    voteReasons?: Record<string, Record<string, string>>;
  };
}) {
  const snapshot = document?.snapshot ? { ...c, ...document.snapshot } : c;
  const request =
    requestPreview ||
    (document?.requestId
      ? c.requests.find((item) => item.id === document.requestId)
      : undefined);
  const certificate =
    certificatePreview ||
    (document?.snapshot?.certificate ?? c.certificate) ||
    undefined;
  const appendixAuthority = (appendixRecipient || request?.recipient || "ДВГА")
    .toUpperCase()
    .includes("КВГА")
    ? "КВГА"
    : "ДВГА";
  const useLegacyAuthorityValues =
    c.requests.filter(
      (item) =>
        item.recipient.toUpperCase().includes("ДВГА") ||
        item.recipient.toUpperCase().includes("КВГА"),
    ).length <= 1;
  const title =
    document?.name ||
    (kind === "source"
      ? c.document.name
      : kind === "original"
        ? c.appealType || (c.type === "control" ? "Жалоба" : "Возражение")
        : "Материал обращения");
  const agendaDetails = c.agendaDetails;
  const decisionKindLabel =
    agendaDetails?.decisionKind === "prescription-audit"
      ? "Предписание на аудиторский отчет"
      : agendaDetails?.decisionKind === "prescription-preventive"
        ? "Предписание по профилактическому контролю"
        : agendaDetails?.decisionKind === "quality-control"
          ? "Контроль качества"
          : agendaDetails?.decisionKind === "administrative-act"
            ? "Административный акт"
            : undefined;
  const requirementFiles = c.documents.filter(
    (item) => item.kind === "attachment" && item.text === "Требования заявителя",
  );
  if (kind === "request" && request && request.template === "other")
    return (
      <article className="print-document other-request-template">
        <div className="other-request-template-header">
          <div>
            ҚАЗАҚСТАН РЕСПУБЛИКАСЫ
            <br />
            ҚАРЖЫ МИНИСТРЛІГІ
          </div>
          <span>ҚР</span>
          <div>
            МИНИСТЕРСТВО ФИНАНСОВ
            <br />
            РЕСПУБЛИКИ КАЗАХСТАН
          </div>
        </div>
        <div className="other-request-template-contacts">
          <span>
            010000, Астана қаласы, Мәңгілік Ел даңғылы 8, 4-кіреберіс
            <br />
            тел.: +7 (7172) 75-04-71, 75-04-89, факс: 75-03-52
            <br />
            administrator@minfin.gov.kz
          </span>
          <span>
            010000, город Астана, проспект Мәңгілік Ел, 8, подъезд 4
            <br />
            тел.: +7 (7172) 75-04-71, 75-04-89, факс: 75-03-52
            <br />
            administrator@minfin.gov.kz
          </span>
        </div>
        <div className="other-request-template-line" />
        <p className="other-request-template-recipient">
          <b>{auditAuthorityFullName(request.recipient) || "<Кому направить запрос>"}</b>
        </p>
        <p className="other-request-template-body">
          {request.customText || "<Текст запроса>"}
        </p>
        <div className="other-request-template-signature">
          <b>
            Ішкі мемлекеттік аудит
            <br />
            бойынша апелляция
            <br />
            департаментінің директоры
          </b>
          <b>Ш. Күреңбек тегі</b>
        </div>
        <p className="other-request-template-executor">
          Орын.: {request.author || DEMO_USER.fullName}
          <br />
          Тел.: 00-00-00
        </p>
      </article>
    );

  if (kind === "request" && request)
    return (
      <article className="print-document request-template">
        <div className="request-template-header">
          <div>
            ҚАЗАҚСТАН РЕСПУБЛИКАСЫ
            <br />
            ҚАРЖЫ МИНИСТРЛІГІ
          </div>
          <span>ҚР</span>
          <div>
            МИНИСТЕРСТВО ФИНАНСОВ
            <br />
            РЕСПУБЛИКИ КАЗАХСТАН
          </div>
        </div>
        <div className="request-template-line" />
        <p className="request-template-recipient">
          <b>{auditAuthorityFullName(request.recipient) || "Кому направить запрос"}</b>
        </p>
        <p
          className={`request-template-body ${
            request.customText === undefined ? "standard" : "custom"
          }`}
        >
          {request.customText !== undefined
            ? request.customText
            : requestIntro(c, request.deadline)}
        </p>
        <p className="request-template-regulatory-notice">
          {REQUEST_REGULATORY_NOTICE}
        </p>
        <div className="request-template-signature">
          <b>
            Директор Департамента
            <br />
            апелляции по внутреннему
            <br />
            государственному аудиту
          </b>
          <b>Ш. Күреңбек тегі</b>
        </div>
        <p className="request-template-executor">
          Исполнитель: {request.author || DEMO_USER.fullName}
          <br />
          Тел.: 70-13-08
        </p>
      </article>
    );

  if (
    kind === "request-appendix" ||
    kind === "authority-response-appendix"
  ) {
    const isResponseAppendix = kind === "authority-response-appendix";

    return (
      <article className="print-document appendix-template">
        <p className="appendix-template-number">Таблица №1</p>
        <div className="appendix-template-table-wrap">
        <table>
          <thead>
            <tr>
              <th>№ п-п</th>
              <th>Нарушение, по которым поступило возражение</th>
              <th>Возражение объекта аудита</th>
              <th>
                Мотивированный ответ {appendixAuthority} по доводам возражения объекта аудита
                с приложением подтверждающих документов по фактам нарушений
              </th>
            </tr>
          </thead>
          <tbody>
            {snapshot.issues
              .filter((point) => point.disputed)
              .map((point) => (
                <tr key={point.id}>
                  <td>{point.number}</td>
                  <td>
                    {appendixFindingPreview?.[point.id] ??
                      (isResponseAppendix
                        ? request?.authorityResponses?.[point.id]?.finding ??
                          (useLegacyAuthorityValues
                            ? point.authorityFinding
                            : "")
                        : point.authorityFinding) ??
                      ""}
                  </td>
                  <td>{point.argument || "—"}</td>
                  <td aria-label={`Мотивированный ответ ${appendixAuthority}`}>
                    {appendixPreview?.[point.id] ??
                      (isResponseAppendix
                        ? request?.authorityResponses?.[point.id]?.response ??
                          (useLegacyAuthorityValues ? point.position : "")
                        : point.position) ??
                      ""}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
        </div>
      </article>
    );
  }

  if (kind === "certificate") {
    const points = snapshot.issues.filter((point) => point.disputed);
    const authorityRequests = c.requests.filter((item) =>
      /ДВГА|КВГА/i.test(item.recipient),
    );
    const authorityText = (
      pointId: string,
      field: "finding" | "response",
    ) => {
      if (!authorityRequests.length)
        return [{ authority: "ДВГА/КВГА", value: "—" }];
      return authorityRequests.map((item) => {
        const authority = item.recipient.toUpperCase().includes("КВГА")
          ? "КВГА"
          : "ДВГА";
        const point = points.find((value) => value.id === pointId);
        const fallback =
          authorityRequests.length === 1
            ? field === "finding"
              ? point?.authorityFinding
              : point?.position
            : undefined;
        return {
          authority,
          value: item.authorityResponses?.[pointId]?.[field] || fallback || "—",
        };
      });
    };
    return (
      <article className="print-document certificate-template">
        <h1>Справка</h1>
        <h2>по результатам изучения и анализа возражения</h2>
        <p className="certificate-template-intro">
          {certificateIntro(snapshot)}
        </p>
        <p className="certificate-template-explanation">
          (наименование, БИН/ИИН лица, подавшего возражение, жалобу)
        </p>
        <p className="certificate-template-authority">
          {auditAuthorityFullName(snapshot.issuer)} (далее – {snapshot.issuer === "КВГА" ? "КВГА" : "ДВГА"}).
        </p>
        <p className="certificate-template-explanation">
          (наименование органа, чьи акты, действия (бездействие) обжалуются)
        </p>
        <ol className="certificate-template-point-list">
          {snapshot.type === "notice" ? (
            <li>{snapshot.request || "—"}</li>
          ) : (
            points.map((point) => <li key={point.id}>{point.title}</li>)
          )}
        </ol>
        <p className="certificate-template-explanation">
          (перечень обжалуемых вопросов)
        </p>
        <p className="certificate-template-lead">
          По результатам проведенного анализа рабочий орган (ДАВГА) сообщает
          следующее:
        </p>
        {points.map((point) => (
          <section className="certificate-template-point" key={point.id}>
            <h3>Пункт {point.number}</h3>
            <div className="certificate-template-line">
              {authorityText(point.id, "finding").map((item) => (
                <p key={item.authority}>
                  <b>Доводы {item.authority}:</b> {item.value}
                </p>
              ))}
            </div>
            <div className="certificate-template-line">
              <b>Доводы объекта гос. аудита (заявителя):</b>{" "}
              {point.argument || "—"}
            </div>
            <div className="certificate-template-line">
              {authorityText(point.id, "response").map((item) => (
                <p key={item.authority}>
                  <b>Мотивированный ответ {item.authority}:</b> {item.value}
                </p>
              ))}
            </div>
            <div className="certificate-template-line">
              <b>Доводы рабочего органа (ДАВГА МФ РК):</b>{" "}
              {certificate?.davgaArgumentsByPoint?.[point.id] || certificate?.davgaArguments || "—"}
            </div>
            {(() => {
              const positions = (certificate?.memberPositions || []).filter(
                (position) => position.pointId === point.id,
              );
              const members = snapshot.members.length
                ? snapshot.members
                : positions.map((position) => ({ id: position.id, name: position.name }));
              return (
                <table className="certificate-members-table certificate-point-votes-table">
                  <thead>
                    <tr>
                      {members.map((member) => <th key={member.id}>{member.name}</th>)}
                      {!members.length && <th>Участники заседания не определены</th>}
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      {members.map((member) => {
                        const position = positions.find((item) => item.id === member.id);
                        return <td key={member.id}><b>{position?.result ? OUTCOMES[position.result] : "Нет голоса"}</b><br />{position?.comment || "—"}</td>;
                      })}
                      {!members.length && <td>—</td>}
                    </tr>
                  </tbody>
                </table>
              );
            })()}
          </section>
        ))}
      </article>
    );
  }

  if (kind === "final-response" || kind === "decision-project") {
    const outcome = overall(snapshot);
    const decision = outcome
      ? OUTCOMES[outcome].toLocaleLowerCase("ru-RU")
      : snapshot.result?.label?.toLocaleLowerCase("ru-RU") || "—";
    const disputedIssues = snapshot.issues.filter((point) => point.disputed);
    return (
      <div className="final-response-document">
        <article className="print-document final-response-template">
          <div className="final-response-recipient">
            <p>{snapshot.org}</p>
            <p>{auditAuthorityFullName(snapshot.issuer)}</p>
          </div>
          <div className="final-response-body">
            <p>Қазақстан Республикасы Қаржы министрлігінің (бұдан әрі – Министрлік) апелляциялық комиссиясының қарауына Ішкі мемлекеттік аудит комитетінен жүргізілген аудиторлық есепте көрсетілген бұзушылықтарға түскен қарсылықты қарап, келесіні хабарлайды.</p>
            <p>Заңның 58-4-бабының 2-тармағына сәйкес, қарсылық мемлекеттік аудит объектісі даулайтын мәселелер шегінде қаралады.</p>
            <p>Апелляциялық комиссия отырысында дауыс беру қорытындысы бойынша қарсылықты {decision} туралы шешім қабылдады.</p>
            <p>Жауаппен келіспеген жағдайда, Сіз Қазақстан Республикасы Әкімшілік рәсімдік-процестік кодексінің 91-бабының 6-тармағына сәйкес шешімге шағым жасауға құқылысыз. Екінші мекенжайға мәлімет және жұмыс үшін жолданады.</p>
            <p className="final-response-attachment-note">Қосымша: {Math.max(1, disputedIssues.length)} парақта.</p>
          </div>
          <div className="final-response-signature">
            <span>Ішкі мемлекеттік аудит бойынша апелляция департаментінің директоры</span>
            <b>Ш. Күреңбек тегі</b>
          </div>
          <p className="final-response-executor">Орын.: {snapshot.assignee === "Не назначен" ? DEMO_USER.fullName : snapshot.assignee}<br />Тел.: 70-13-08</p>
        </article>
        <article className="print-document final-response-template final-response-appendix">
          <h2>Қосымша</h2>
          {disputedIssues.map((point) => {
            const pointVotes = snapshot.votes?.[point.id];
            const winningOutcome =
              pointOutcomeFromVotes(pointVotes?.votes || {}, pointVotes?.chair) ||
              point.final ||
              point.proposal;
            const winningReasonMemberId = Object.entries(pointVotes?.votes || {}).find(
              ([memberId, vote]) =>
                normalizeVoteChoice(vote) === winningOutcome &&
                Boolean(pointVotes?.voteReasons?.[memberId]?.trim()),
            )?.[0];
            const pointReason =
              (winningReasonMemberId &&
                pointVotes?.voteReasons?.[winningReasonMemberId]) ||
              snapshot.result?.reason ||
              "—";
            const pointDecision = winningOutcome
              ? OUTCOMES[winningOutcome].toLocaleLowerCase("ru-RU")
              : decision;
            return (
              <section className="final-response-appendix-point" key={point.id}>
                <p className="final-response-point-title">- по п. {point.number}:</p>
                <p className="final-response-point-reason">
                  {pointReason}.
                </p>
                <p className="final-response-point-decision">
                  На основании вышеизложенного, Апелляционной комиссией принято решение {pointDecision}.
                </p>
              </section>
            );
          })}
        </article>
      </div>
    );
  }

  if (kind === "protocol") {
    const meeting = protocolPreview || snapshot.meeting;
    const recommendations = meeting?.recommendations?.trim();
    const protocolNumber =
      !protocolPreview && snapshot.meeting?.signed ? meeting?.number : "";
    const members = protocolPreview?.members || snapshot.members;
    const presentMembers = members.filter((member) => member.present);
    const viceMinister = presentMembers.find(
      (member) => member.id === "kenbeil-dm",
    );
    const davgaDirector = presentMembers.find(
      (member) => member.id === "kurenbek-shb",
    );
    const presidingMember =
      viceMinister ||
      davgaDirector ||
      presentMembers.find((member) => member.id === presidingChairId(presentMembers));
    const commissionMembers = presentMembers.filter(
      (member) => member.id !== presidingMember?.id,
    );
    const presidingLabel = viceMinister
      ? "Председатель АК"
      : davgaDirector
        ? "Заместитель председателя АК"
        : "Председатель АК";
    const secretaryName =
      snapshot.assignee && snapshot.assignee !== "Не назначен"
        ? snapshot.assignee
        : DEMO_USER.fullName;
    const votes = protocolPreview?.votes || snapshot.votes;
    const hasPreviewVotes = Object.values(protocolPreview?.votes || {}).some(
      (pointVotes) =>
        Object.values(pointVotes).some((vote) => Boolean(normalizeVoteChoice(vote))),
    );
    const overallResult = hasPreviewVotes
      ? (() => {
          const pointResults = snapshot.issues
            .filter((point) => point.disputed)
            .map((point) => {
              const pointVotes = protocolPreview!.votes[point.id] || {};
              if (!presentMembers.length) return "";
              const normalizedVotes = Object.fromEntries(
                presentMembers.map((member) => [
                  member.id,
                  normalizeVoteChoice(pointVotes[member.id]),
                ]),
              );
              return pointOutcomeFromVotes(
                normalizedVotes,
                presidingChairId(presentMembers),
              );
            });
          if (!pointResults.length || pointResults.some((item) => !item))
            return "";
          if (pointResults.every((item) => item === pointResults[0]))
            return pointResults[0] || "";
          return pointResults.some(
            (item) => item === "accept" || item === "partial",
          )
            ? "partial"
            : "reject";
        })()
      : overall(snapshot);
    const decision = overallResult
      ? OUTCOMES[overallResult].toLocaleLowerCase("ru-RU")
      : "—";
    return (
      <article className="print-document protocol-template">
        <h1>
          ПРОТОКОЛ{protocolNumber ? ` № ${protocolNumber}` : ""}
          <br />
          заседания Апелляционной комиссии
        </h1>
        <div className="protocol-template-place-date">
          <span>город Астана</span>
          <span>{formatDate(meeting?.date)}</span>
        </div>
        <div className="protocol-template-attendance">
          <p className="protocol-template-attendance-title">
            <b>
              ПРИСУТСТВОВАЛИ ({meeting?.format || "онлайн, Qosyl"}):
            </b>
          </p>
          {presidingMember ? (
            <>
              <div className="protocol-template-attendance-row">
                <b>{presidingLabel}:</b>
                <span>{presidingMember.name}</span>
              </div>
              {commissionMembers.length ? (
                <div className="protocol-template-attendance-row">
                  <b>Члены Апелляционной комиссии:</b>
                  <span className="protocol-template-attendance-members">
                    {commissionMembers.map((member) => (
                      <span key={member.id}>{member.name}</span>
                    ))}
                  </span>
                </div>
              ) : null}
            </>
          ) : presentMembers.length ? (
            <div className="protocol-template-attendance-row">
              <b>Члены Апелляционной комиссии:</b>
              <span className="protocol-template-attendance-members">
                {presentMembers.map((member) => (
                  <span key={member.id}>{member.name}</span>
                ))}
              </span>
            </div>
          ) : (
            "—"
          )}
          <div className="protocol-template-attendance-row">
            <b>Секретарь Апелляционной комиссии:</b>
            <span>{secretaryName}</span>
          </div>
        </div>
        <p className="protocol-template-intro">
          Возражение «{snapshot.org}», БИН {snapshot.bin} от{" "}
          {formatDate(snapshot.appealDate || snapshot.filed)} года №
          {snapshot.appealNumber || snapshot.document.number} к уведомлению{" "}
          {auditAuthorityFullName(snapshot.issuer)} от {formatDate(snapshot.document.date)} года №
          {snapshot.document.number}.
        </p>
        <p>
          <span style={{ display: "block", textAlign: "left" }}>Количество присутствовавших членов Апелляционной комиссии: {presentMembers.length}.</span>
          <br />
          <span style={{ display: "block", textAlign: "left" }}><b>Результаты голосования членов Апелляционной комиссии:</b></span>
        </p>
        <table className="protocol-votes-table">
          <thead>
            <tr>
              <th>№</th>
              <th>Суть вопроса / член Апелляционной комиссии</th>
              <th>Голос</th>
              <th>Обоснование</th>
            </tr>
          </thead>
          <tbody>
            {snapshot.issues
              .filter((point) => point.disputed)
              .flatMap((point) => [
                <tr key={`${point.id}-question`}>
                  <td>{point.number}</td>
                  <td colSpan={3}>{point.title}</td>
                </tr>,
                ...presentMembers.map((member) => (
                  <tr key={`${point.id}-${member.id}`}>
                    <td />
                    <td>{member.name}</td>
                    <td>
                      {member.recused
                        ? "Не голосует"
                        : (() => {
                            const vote = normalizeVoteChoice(
                              protocolPreview?.votes?.[point.id]?.[member.id] ||
                                (
                                  votes?.[point.id] as
                                    | { votes?: Record<string, string> }
                                    | undefined
                                )?.votes?.[member.id],
                            );
                            return vote ? OUTCOMES[vote] : "—";
                          })()}
                    </td>
                    <td>
                      {protocolPreview?.voteReasons?.[point.id]?.[member.id] ||
                        (
                          votes?.[point.id] as
                            | { voteReasons?: Record<string, string> }
                            | undefined
                        )?.voteReasons?.[member.id] ||
                        member.reason ||
                        "—"}
                    </td>
                  </tr>
                )),
              ])}
          </tbody>
        </table>
        <p className="protocol-template-result">
          На основании результатов голосования членов Апелляционной комиссии принято РЕШЕНИЕ {decision} {snapshot.appealType} {snapshot.org} от {formatDate(snapshot.appealDate || snapshot.filed)} года №{snapshot.appealNumber || snapshot.document.number}.
        </p>
        {recommendations && recommendations !== "—" && (
          <p className="protocol-template-recommendations">
            Рекомендации: {recommendations}
          </p>
        )}
        <div className="protocol-template-signatures">
          {presidingMember ? (
            <p>
              {presidingLabel}: __________________ {presidingMember.name}
            </p>
          ) : null}
          {commissionMembers.map((member) => (
            <p key={member.id}>Член Апелляционной комиссии: __________________ {member.name}</p>
          ))}
          <p>Секретарь Апелляционной комиссии: __________________ {secretaryName}</p>
        </div>
      </article>
    );
  }

  return (
    <article className="print-document">
      <p className="document-watermark">
        ДЕМОНСТРАЦИОННЫЙ ДОКУМЕНТ · ДАННЫЕ ВЫМЫШЛЕНЫ · БЕЗ ЭЦП
      </p>
      <h2>{title}</h2>
      {kind === "original" ? (
        <>
          <p>
            <b>Вид обращения:</b> {c.appealType || (c.type === "control" ? "Жалоба" : "Возражение")}
            <br />
            <b>Наименование объекта аудита/заявителя:</b> {c.org}
            <br />
            <b>БИН/ИИН:</b> {c.bin}
            <br />
            <b>Номер возражения, жалобы, заявления:</b> {c.appealNumber || "—"}
            <br />
            <b>Дата возражения, жалобы, заявления:</b> {formatDate(c.appealDate)}
            <br />
            <b>Местонахождение:</b> {c.address}
            <br />
            <b>Представитель:</b> {c.applicant}
          </p>
          <p>
            <b>Орган аудита (КВГА/ДВГА):</b> {c.issuer}
            <br />
            <b>Дата получения документа:</b> {formatDate(c.document.received)}
            <br />
            <b>Портал / цифровая система, по которой поступило уведомление:</b> {c.channel}
          </p>
          {c.document.number && (
            <p>
              <b>Номер: {c.document.name}:</b> {c.document.number}
              <br />
              <b>Дата: {c.document.name}:</b> {formatDate(c.document.date)}
            </p>
          )}
          {(agendaDetails?.procurementMethod || agendaDetails?.customerName || agendaDetails?.customerBin) && (
            <p>
              <b>Сумма:</b> {formatMoney(c.amount)}
              <br />
              <b>Способ закупки:</b> {agendaDetails?.procurementMethod || "—"}
              <br />
              <b>Наименование заказчика:</b> {agendaDetails?.customerName || "—"}
              <br />
              <b>БИН заказчика:</b> {agendaDetails?.customerBin || "—"}
            </p>
          )}
          {(agendaDetails?.procurementNumber || agendaDetails?.lotNumber || agendaDetails?.procurementSubject) && (
            <p>
              <b>Номер государственной закупки:</b> {agendaDetails?.procurementNumber || "—"}
              <br />
              <b>Номер лота:</b> {agendaDetails?.lotNumber || "—"}
              <br />
              <b>Предмет государственной закупки:</b> {agendaDetails?.procurementSubject || "—"}
            </p>
          )}
          {decisionKindLabel && (
            <p>
              <b>Вид обжалуемого решения:</b> {decisionKindLabel}
              {agendaDetails?.relatedDocumentNumber && (
                <>
                  <br />
                  <b>{agendaDetails.decisionKind === "prescription-audit" ? "Номер аудиторского отчета" : "Номер профилактического контроля"}:</b> {agendaDetails.relatedDocumentNumber}
                </>
              )}
              {agendaDetails?.relatedDocumentDate && (
                <>
                  <br />
                  <b>{agendaDetails.decisionKind === "prescription-audit" ? "Дата подписания аудиторского отчета" : "Дата подписания профилактического контроля"}:</b> {formatDate(agendaDetails.relatedDocumentDate)}
                </>
              )}
            </p>
          )}
          <p>
            <b>{c.appealType === "Заявление" ? "О чем заявление" : "Краткое описание"}:</b> {c.request}
            <br />
            <b>Требования заявителя:</b>{" "}
            {requirementFiles.length
              ? requirementFiles.map((item) => item.filename || item.name).join(", ")
              : "—"}
          </p>
        </>
      ) : (
        <>
          <p>
            <b>Объект:</b> {c.org}
            <br />
            <b>БИН:</b> {c.bin}
            <br />
            <b>Местонахождение:</b> {c.address}
            <br />
            <b>Заявитель:</b> {c.applicant}
          </p>
          <p>
            <b>Орган, чей документ обжалуется:</b> {auditAuthorityFullName(c.issuer)}
            <br />
            <b>Исходный документ:</b> {c.document.name} № {c.document.number} от{" "}
            {formatDate(c.document.date)}
            <br />
            <b>Обращение:</b> {c.id}
          </p>
        </>
      )}
      {kind === "source" && (
        <>
          <p>
            Выписка для тестового сценария. Не является полным исходным
            документом.
          </p>
          {c.issues.map((point) => (
            <p key={point.id}>
              <b>Пункт {point.number}.</b> {point.finding}
            </p>
          ))}
        </>
      )}
      {kind === "original" && (
        <>
          {c.issues
            .filter((point) => point.disputed)
            .map((point) => (
              <p key={point.id}>
                <b>
                  Пункт {point.number} — {point.title}.
                </b>
                <br />
                {point.argument}
                <br />
                <b>Доказательства:</b> {point.evidence}
              </p>
            ))}
        </>
      )}
      {kind === "protocol" && (
        <>
          <p>
            <b>Протокол:</b> № {snapshot.meeting?.number || "Проект"} от{" "}
            {formatDate(snapshot.meeting?.date)}
            <br />
            <b>Присутствовали:</b>{" "}
            {snapshot.members
              .filter((member) => member.present)
              .map((member) => member.name)
              .join(", ")}
            <br />
            <b>Секретарь:</b> рабочий орган, без права голоса.
            <br />
            <b>Аудиофиксация:</b>{" "}
            {snapshot.meeting?.audio || "Не зарегистрирована"}
          </p>
          {snapshot.issues
            .filter((point) => point.disputed)
            .map((point) => (
              <section key={point.id}>
                <h3>
                  Пункт {point.number} · {point.title}
                </h3>
                <p>
                  {point.analysis}
                  <br />
                  {point.legal}
                </p>
                <p>
                  <b>Проект / результат:</b>{" "}
                  {point.final || point.proposal
                    ? OUTCOMES[(point.final || point.proposal)!]
                    : "Не определён"}
                </p>
                <table>
                  <thead>
                    <tr>
                      <th>Член комиссии</th>
                      <th>Голос</th>
                      <th>Отвод</th>
                    </tr>
                  </thead>
                  <tbody>
                    {snapshot.members
                      .filter((member) => member.present)
                      .map((member) => (
                        <tr key={member.id}>
                          <td>{member.name}</td>
                          <td>
                            {member.recused
                              ? "Не голосует"
                              : (() => {
                                  const vote = normalizeVoteChoice(
                                    snapshot.votes?.[point.id]?.votes?.[
                                      member.id
                                    ],
                                  );
                                  return vote ? OUTCOMES[vote] : "—";
                                })()}
                          </td>
                          <td>{member.reason || "—"}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </section>
            ))}
          <p>
            <b>Подписи:</b>{" "}
            {snapshot.meeting?.signed
              ? `Зафиксированы ${formatDate(snapshot.meeting.signed)}`
              : "Ожидаются; это проект протокола."}
          </p>
        </>
      )}
      {kind === "result" && (
        <>
          {snapshot.result ? (
            <>
              <p>
                <b>Результат:</b> {snapshot.result.label}
                <br />
                <b>Дата:</b> {formatDate(snapshot.result.date)}
              </p>
              <p>
                <b>Мотивировка:</b>
                <br />
                {snapshot.result.reason}
              </p>
              <p>
                <b>Последствия:</b>
                <br />
                {snapshot.result.effect}
              </p>
              {snapshot.issues.map((point) => (
                <p key={point.id}>
                  <b>Пункт {point.number}:</b>{" "}
                  {!point.disputed
                    ? "Не оспаривался; сохраняется."
                    : point.final
                      ? OUTCOMES[point.final]
                      : "См. резолютивную часть."}
                  {point.amount > 0 && point.remainingAmount != null
                    ? ` Остаток: ${formatMoney(point.remainingAmount)}.`
                    : ""}
                </p>
              ))}
            </>
          ) : (
            <p>Решение ещё не принято.</p>
          )}
          {snapshot.delivery ? (
            <>
              <p>
                <b>Направление:</b> № {snapshot.delivery.number} от{" "}
                {formatDate(snapshot.delivery.date)}. Квитанция{" "}
                {snapshot.delivery.receipt}.
              </p>
              <p>
                <b>Порядок обжалования:</b> {snapshot.delivery.appealCourt}.{" "}
                {snapshot.delivery.appealProcedure}
              </p>
            </>
          ) : (
            <p>
              Перед направлением необходимо заполнить суд и применимый порядок
              обжалования в форме оформления результата.
            </p>
          )}
          {c.type !== "control" && (
            <p>
              При судебном обжаловании исполнение решения комиссии
              приостанавливается до вынесения решения суда (статья 58-4 пункт 7
              Закона о госаудите).
            </p>
          )}
        </>
      )}
      {![
        "source",
        "original",
        "result",
        "protocol",
        "request",
        "request-appendix",
      ].includes(kind) && (
        <>
          <p>{document?.text}</p>
          {["analysis", "position"].includes(kind) &&
            snapshot.issues
              .filter((point) => point.disputed)
              .map((point) => (
                <p key={point.id}>
                  <b>Пункт {point.number}.</b>
                  <br />
                  {point.position}
                  <br />
                  {point.analysis}
                  <br />
                  {point.legal}
                </p>
              ))}
          {kind === "hearing" && snapshot.hearing && (
            <>
              <p>Заявитель: {snapshot.hearing.subject || "—"}</p>
              <p>Орган: {snapshot.hearing.issuer || "—"}</p>
            </>
          )}
        </>
      )}
      <p className="document-footer">
        Сформировано в тестовом модуле SAQ. {document?.author || "Заявитель"}.{" "}
        {formatDate(document?.date || c.filed)}.
      </p>
    </article>
  );
}

export function wordDocumentHtml({
  c,
  kind,
  document,
}: Pick<Parameters<typeof DocumentContent>[0], "c" | "kind" | "document">) {
  const css =
    "body{font:12pt 'Times New Roman',serif;line-height:1;color:#111}p{white-space:pre-wrap;text-align:justify}table{width:100%;border-collapse:collapse;table-layout:fixed}th,td{border:1px solid #111;padding:8px;vertical-align:top}.certificate-template{padding:20mm 15mm;text-align:justify}.certificate-template h1,.certificate-template h2{text-align:center;font-size:12pt}.certificate-template-intro{text-align:justify;text-indent:12mm}.certificate-template-explanation{text-align:center;font-style:italic}.certificate-template-point{break-inside:avoid}.certificate-template-point h3{text-align:center}.certificate-template-line{padding:2px 0}.certificate-template-line p{margin:4px 0}.certificate-members-table th{text-align:center}.certificate-point-votes-table th,.certificate-point-votes-table td{min-width:0;padding:5px;overflow-wrap:anywhere;word-break:break-word;white-space:normal;font-size:12pt;line-height:1}.certificate-point-votes-table th{text-align:center}.certificate-point-votes-table td{text-align:justify}.protocol-template-attendance-members>span{display:block}.protocol-template,.protocol-template *{font-size:12pt!important}"
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>Справка</title><style>${css}</style></head><body>${renderToStaticMarkup(
    <DocumentContent c={c} kind={kind} document={document} />,
  )}</body></html>`;
}

export default function DocumentModal(props: {
  c: ObjectionCase;
  kind: string;
  document?: CaseDocument;
  onClose: () => void;
}) {
  const [error, setError] = useState("");
  const attachment = props.document?.dataUrl ? props.document : undefined;

  // Вложения не являются шаблонными документами SAQ. Их нужно открывать как
  // исходный файл, а не подставлять в демонстрационный шаблон с реквизитами дела.
  if (attachment) {
    const filename = attachment.filename || attachment.name;

    return (
      <Modal title={attachment.name} onClose={props.onClose} wide>
        <div className="actions">
          <a
            className="button primary"
            href={attachment.dataUrl}
            download={filename}
          >
            Скачать
          </a>
        </div>
      </Modal>
    );
  }

  const otherRequestCss =
    ".other-request-template{box-sizing:border-box;min-height:880px;padding:30px 48px 54px;font-family:'Times New Roman',Times,serif;font-size:14px;line-height:1.35}.other-request-template-header{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:16px;color:#0872ae;font-family:Georgia,'Times New Roman',serif;font-size:14px;font-weight:700;line-height:1.05;text-align:center}.other-request-template-header span{display:grid;width:52px;height:52px;place-items:center;border:1px solid #9a7700;border-radius:50%;background:#ddbd47;color:#1f4e35;font-size:13px}.other-request-template-contacts{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-top:12px;padding-top:8px;border-top:2px solid #4d9bc4;color:#287dac;font-family:Georgia,'Times New Roman',serif;font-size:9px;line-height:1.3}.other-request-template-contacts span:last-child{text-align:right}.other-request-template-line{height:1px;margin:28px 0 44px;background:#4d9bc4}.other-request-template-recipient{width:46%;margin:0 0 44px auto!important;font-size:14px;line-height:1.4}.other-request-template-body{margin:0!important;overflow-wrap:anywhere;white-space:pre-wrap;text-align:justify;text-indent:28px}.other-request-template-signature{display:grid;grid-template-columns:1fr auto;gap:26px;align-items:end;margin:48px 0 28px;font-size:14px}.other-request-template-executor{margin:0!important;font-size:10px;font-style:italic;line-height:1.25}";
  const requestTemplateCss =
    ".request-template{box-sizing:border-box;min-height:900px;padding:52px 54px;font-family:'Times New Roman',Times,serif;font-size:14pt;line-height:1.35}.request-template-header{display:grid;grid-template-columns:1fr auto 1fr;gap:20px;align-items:center;color:#005c93;font-family:'Times New Roman',Times,serif;font-size:14pt;font-weight:700;line-height:1.25;text-align:center}.request-template-header span{display:grid;place-items:center;width:40px;height:40px;border:1px solid #111;border-radius:50%;color:#111}.request-template-line{height:1px;margin:15px 0 46px;background:#111}.request-template-recipient{width:52%;margin:0 0 42px auto;text-align:left}.request-template-body,.request-template-regulatory-notice{text-align:justify;text-indent:24px;overflow-wrap:anywhere;word-break:break-word}.request-template-body.standard{width:100%;max-width:none;white-space:normal}.request-template-body.custom{white-space:pre-wrap}.request-template-signature{display:grid;grid-template-columns:350px 1fr;gap:22px;align-items:center;margin-top:48px;font-size:14pt}.request-template-signature b:last-child{justify-self:end;white-space:nowrap}.request-template-executor{margin-top:28px;font-size:11pt;font-style:italic;line-height:1.25}";
  const appendixTemplateCss =
    ".appendix-template{box-sizing:border-box;min-height:680px;padding:52px 54px 96px;font-family:'Times New Roman',Times,serif;overflow:hidden}.appendix-template-number{margin:0 14px 14px 0;text-align:right;font-size:16px}.appendix-template-table-wrap{max-width:100%;overflow-x:auto}.appendix-template table{width:100%;min-width:700px;table-layout:fixed;font-size:14px;line-height:1.35}.appendix-template th,.appendix-template td{box-sizing:border-box;border:1px solid #111;padding:7px 9px;vertical-align:top;white-space:normal;overflow-wrap:anywhere;word-break:normal}.appendix-template th{text-align:center;font-size:14px;background:white}.appendix-template th:first-child,.appendix-template td:first-child{width:5%;text-align:center;font-weight:700}.appendix-template th:nth-child(2),.appendix-template td:nth-child(2){width:23%}.appendix-template th:nth-child(3),.appendix-template td:nth-child(3){width:31%}.appendix-template th:nth-child(4),.appendix-template td:nth-child(4){width:41%}";
  const finalResponseCss =
    ".final-response-template{box-sizing:border-box;min-height:950px;padding:56px 62px;font-family:'Times New Roman',Times,serif;font-size:16px;line-height:1.35}.final-response-template p{white-space:normal}.final-response-recipient{margin:0 0 46px auto;width:54%;text-align:left}.final-response-recipient p{margin:0 0 8px}.final-response-body p{text-align:justify;text-indent:30px;margin:0 0 10px}.final-response-attachment-note{margin-top:30px!important;text-indent:0!important}.final-response-signature{display:grid;grid-template-columns:1fr auto;gap:26px;align-items:end;margin:60px 0 35px}.final-response-signature span{max-width:320px}.final-response-executor{font-size:13px!important;line-height:1.25}.final-response-appendix{break-before:page;page-break-before:always}.final-response-appendix h2{font-family:'Times New Roman',Times,serif;font-size:19px;font-style:italic}.final-response-appendix-point{margin:26px 0}.final-response-point-title{font-weight:700}.final-response-point-reason,.final-response-point-decision{text-align:justify;text-indent:30px}.final-response-point-decision{margin-top:12px!important}";
  const certificatePointVotesCss =
    ".certificate-point-votes-table{width:100%;margin:24px 0 12px;table-layout:fixed}.certificate-point-votes-table th,.certificate-point-votes-table td{min-width:0;padding:7px 5px;overflow-wrap:anywhere;word-break:break-word;white-space:normal}.certificate-point-votes-table th{text-align:center;font-size:11px;line-height:1.2}.certificate-point-votes-table td{text-align:center;font-size:12px;line-height:1.25}.certificate-point-votes-table td b{display:inline-block;margin-bottom:8px}";
  const certificateLayoutCss =
    ".certificate-template{font-family:'Times New Roman',Times,serif!important;font-size:12pt!important;line-height:1!important;text-align:justify!important}.certificate-template p,.certificate-template li{font-size:12pt!important;line-height:1!important;text-align:justify!important}.certificate-template h1,.certificate-template h2{font-size:12pt!important;line-height:1!important;text-align:center!important}.certificate-template-explanation{text-align:center!important}.certificate-template-point h3{font-size:12pt!important;line-height:1!important;text-align:center!important}.certificate-template th,.certificate-template td,.certificate-template .certificate-point-votes-table th,.certificate-template .certificate-point-votes-table td{font-size:12pt!important;line-height:1!important}.certificate-template .certificate-point-votes-table th{text-align:center!important}.certificate-template .certificate-point-votes-table td{text-align:justify!important}";
  const protocolLayoutCss =
    ".protocol-template,.protocol-template *{font-family:'Times New Roman',Times,serif!important;font-size:12pt!important;line-height:1!important}";
  const css =
    "body{font:14px Arial,sans-serif;line-height:1.6;color:#111;max-width:850px;margin:28px auto;padding:24px}h2{text-align:center}p{white-space:pre-wrap}table{width:100%;border-collapse:collapse}th,td{border:1px solid #bbb;padding:8px;text-align:left}.document-watermark{color:#555;text-align:center;font-size:11px}.document-footer{font-size:12px;border-top:1px solid #bbb;padding-top:16px}.appendix-template{box-sizing:border-box;min-height:680px;padding:52px 54px 96px;font-family:'Times New Roman',Times,serif}.appendix-template-number{margin:0 14px 14px 0!important;font-size:16px!important;text-align:right}.appendix-template table{table-layout:fixed;font-size:16px;line-height:1.35}.appendix-template th,.appendix-template td{border:1px solid #111;padding:7px 9px;vertical-align:top;word-break:break-word}.appendix-template th{text-align:center;font-size:17px;background:white}.appendix-template tbody tr{height:40px}.appendix-template th:first-child,.appendix-template td:first-child{width:5%;text-align:center;font-weight:bold}.appendix-template th:nth-child(2),.appendix-template td:nth-child(2){width:23%}.appendix-template th:nth-child(3),.appendix-template td:nth-child(3){width:31%}.appendix-template th:nth-child(4),.appendix-template td:nth-child(4){width:41%}.certificate-template{box-sizing:border-box;min-height:900px;padding:58px 68px;font-family:'Times New Roman',Times,serif;font-size:16px;line-height:1.45}.certificate-template h1,.certificate-template h2{text-align:center;font-size:22px;margin:0;font-weight:700}.certificate-template h2{font-size:20px;margin-bottom:34px}.certificate-template-intro{text-align:justify;text-indent:28px}.certificate-template-explanation{margin:4px 0 18px;text-align:center;font-style:italic}.certificate-template-point-list{margin:20px 46px 4px}.certificate-template-lead{margin-top:30px}.certificate-template-point{margin-top:28px;break-inside:avoid}.certificate-template-point h3{margin:0 0 14px;font-size:20px}.certificate-template-line{padding:0;margin:14px 0;white-space:pre-wrap}.certificate-template-line p{margin:6px 0 0}.certificate-members-table{table-layout:fixed}.certificate-members-table th,.certificate-members-table td{border:1px solid #111;padding:10px;vertical-align:top;white-space:pre-wrap}.certificate-members-table th{text-align:center;font-weight:700}.protocol-template{box-sizing:border-box;padding:56px 64px;font-family:'Times New Roman',Times,serif;font-size:16px;line-height:1.4}.protocol-template h1{margin:0 0 34px;text-align:center;font-size:21px;font-weight:400}.protocol-template-place-date{display:flex;justify-content:space-between;margin-bottom:28px}.protocol-template-attendance{margin:0 0 14px}.protocol-template-attendance-title{margin:0 0 6px!important}.protocol-template-attendance-row{display:grid;grid-template-columns:260px 1fr;column-gap:16px;align-items:start}.protocol-template-attendance-members>span{display:block}.protocol-template-intro,.protocol-template-result{text-align:justify;text-indent:28px}.protocol-votes-table{table-layout:fixed}.protocol-votes-table th,.protocol-votes-table td{border:1px solid #111;padding:7px 8px;vertical-align:top}.protocol-votes-table th{text-align:center;font-weight:400}.protocol-template-signatures{margin-top:46px}@page{size:A4;margin:18mm}";
  const html = `<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>SAQ — документ</title><style>${css}${otherRequestCss}${requestTemplateCss}${appendixTemplateCss}${finalResponseCss}${certificatePointVotesCss}${certificateLayoutCss}${protocolLayoutCss}</style></head><body>${renderToStaticMarkup(<DocumentContent {...props} />)}</body></html>`;
  return (
    <Modal title="Просмотр документа" onClose={props.onClose} wide>
      <div className="actions">
        <Button
          onClick={() =>
            downloadFile(
              `${props.c.id}-${props.kind}.html`,
              html,
              "text/html;charset=utf-8",
            )
          }
        >
          Скачать HTML
        </Button>
        <Button
          primary
          onClick={() => {
            const popup = window.open("", "_blank");
            if (!popup) {
              setError(
                "Браузер заблокировал окно печати. Разрешите всплывающие окна или скачайте документ.",
              );
              return;
            }
            popup.document.write(html);
            popup.document.close();
            popup.focus();
            popup.print();
          }}
        >
          Печать / PDF
        </Button>
      </div>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      <style>{finalResponseCss + certificatePointVotesCss}</style>
      <DocumentContent {...props} />
    </Modal>
  );
}
