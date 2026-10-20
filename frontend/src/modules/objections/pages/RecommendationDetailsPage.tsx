import { useMemo, useState } from "react";
import { Button, Modal, PageHeading } from "../../../components/ui";
import { ROLES } from "../../../data/constants";
import type { CaseDocument, CaseRecommendation, RecommendationActivity, Role } from "../../../types";
import { formatDate } from "../../../utils/dateFormat";
import {
  recommendationRecipientRole,
  recommendationStatusLabel,
  recommendationStatusTone,
} from "../recommendationPresentation";

const EXECUTION_RESULT_OPTIONS = [
  "Признано соответствующим замечаниям/не соответствующим стандартам государственного аудита по итогу контроля качества второго уровня.",
  "Осуществляется перепроверка.",
  "Дисциплинарная ответственность и иные меры реагирования.",
  "Техническая учеба.",
  "Изменения в НПА.",
  "Другое",
] as const;

export default function RecommendationDetailsPage({
  recommendation, role, documents, onBack, onOpenCase, onSubmitResponse,
  onRecordExternalResponse, onAcceptResponse, onReturnForRevision,
  onReturnExternalForRevision, onApprove, onSign,
}: {
  recommendation: CaseRecommendation;
  role: Role;
  documents: CaseDocument[];
  onBack: () => void;
  onOpenCase: (caseId: string) => void;
  onSubmitResponse: (id: string, answer: string, result: string, files: File[]) => void | Promise<void>;
  onRecordExternalResponse: (id: string, responseDate: string, responseNumber: string, answer: string, result: string, files: File[]) => void | Promise<void>;
  onAcceptResponse: (id: string) => void;
  onReturnForRevision: (id: string, dueDate: string, reason: string, files: File[]) => void | Promise<void>;
  onReturnExternalForRevision: (id: string, dueDate: string, reason: string, sentAt: string, registrationNumber: string, files: File[]) => void | Promise<void>;
  onApprove: (id: string) => void;
  onSign: (id: string) => void;
}) {
  const [responseOpen, setResponseOpen] = useState(false);
  const [returnOpen, setReturnOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const isWork = role === "work" || role === "demo-superuser";
  const isDemo = role === "demo-superuser";
  const recipientRole = recommendationRecipientRole(recommendation);
  const canRespond = (isDemo || role === recipientRole) && ["sent", "returned"].includes(recommendation.status) && recommendation.channel !== "external";
  const canRecordExternalResponse = isWork && recommendation.channel === "external" && ["sent", "returned"].includes(recommendation.status);
  const canReview = isWork && recommendation.status === "answered";
  const canApprove = (role === "deputy" || isDemo) && ["approval", "acceptance_approval", "return_approval"].includes(recommendation.status);
  const canSign = (role === "director" || isDemo) && ["signature", "acceptance_signature", "return_signature"].includes(recommendation.status);
  const recommendationDocuments = documents.filter((item) => item.recommendationId === recommendation.id);
  const timeline = useMemo(() => {
    if (recommendation.activity?.length) return recommendation.activity;
    const fallback: RecommendationActivity[] = [{
      id: `${recommendation.id}-created`, date: recommendation.createdAt, actor: recommendation.executor || ROLES.work,
      type: "created", title: "Информация по направленной рекомендации",
      text: `Получатель: ${recommendation.recipient}.`, dueDate: recommendation.dueDate,
    }];
    if (recommendation.answer) fallback.push({
      id: `${recommendation.id}-response`, date: recommendation.answeredAt || recommendation.createdAt,
      actor: recommendation.recipient, type: "response", title: "Исполнение рекомендации", text: recommendation.answer,
      executionResult: recommendation.executionResult,
    });
    if (recommendation.returnReason) fallback.push({
      id: `${recommendation.id}-return`, date: recommendation.returnedAt || recommendation.createdAt,
      actor: ROLES.work, type: "return", title: "Возвращено на доработку", text: recommendation.returnReason,
      dueDate: recommendation.revisionDueDate,
    });
    if (recommendation.status === "executed") fallback.push({
      id: `${recommendation.id}-executed`, date: recommendation.executedAt || recommendation.createdAt,
      actor: ROLES.director, type: "executed", title: "Итог: рекомендация исполнена",
      text: "Исполнение принято и подписано.",
    });
    return fallback;
  }, [recommendation]);

  const filesFor = (activityId: string, type: string) => recommendationDocuments.filter((file) =>
    file.recommendationActivityId === activityId || (!file.recommendationActivityId && file.kind === type),
  );

  return (
    <>
      <PageHeading
        title={`Рекомендация № ${recommendation.id}`}
        subtitle={`По обращению № ${recommendation.caseReference}`}
        action={<Button onClick={onBack}>Назад к рекомендациям</Button>}
      />
      <section className="recommendation-page-head">
        <div>
          <span className={`badge ${recommendationStatusTone(recommendation.status)}`}>
            {recommendationStatusLabel(recommendation, role)}
          </span>
          <p>{recommendation.text}</p>
        </div>
        <div className="recommendation-current-action">
          <span>Текущее действие</span>
          {canReview ? (reviewOpen ? <div className="recommendation-action-buttons"><small>{recommendation.channel === "external" ? "Ответ по другой системе зафиксирован ниже в хронологии." : "Ответ исполнителя открыт ниже в хронологии."}</small><Button primary onClick={() => onAcceptResponse(recommendation.id)}>Принять исполнение</Button><Button onClick={() => setReturnOpen(true)}>Вернуть на доработку</Button></div> : <Button primary onClick={() => setReviewOpen(true)}>Рассмотреть ответ</Button>)
            : canRecordExternalResponse ? <Button primary onClick={() => setResponseOpen(true)}>{recommendation.status === "returned" ? "Зафиксировать доработанное исполнение" : "Зафиксировать ответ"}</Button>
            : canRespond ? <Button primary onClick={() => setResponseOpen(true)}>{recommendation.status === "returned" ? "Доработать исполнение" : "Направить исполнение"}</Button>
            : canApprove ? <Button primary onClick={() => onApprove(recommendation.id)}>Согласовать</Button>
            : canSign ? <Button primary onClick={() => onSign(recommendation.id)}>Подписать</Button>
            : recommendation.status === "executed" ? <strong>Исполнение завершено</strong>
            : <strong>Ожидается следующий участник процесса</strong>}
        </div>
      </section>
      <section className="recommendation-info-grid">
        <div><span>Кому направлена</span><strong>{recommendation.recipient}</strong></div>
        <div><span>Способ направления</span><strong>{recommendation.channel === "external" ? recommendation.deliveryPath || "Другая система" : "Кабинет SAQ"}</strong>{recommendation.registrationNumber && <small>№ {recommendation.registrationNumber}</small>}</div>
        <div><span>Дата направления</span><strong>{formatDate(recommendation.sentAt || recommendation.createdAt)}</strong></div>
        <div><span>Срок исполнения</span><strong>{formatDate(recommendation.revisionDueDate || recommendation.dueDate)}</strong></div>
        <div><span>Результат исполнения</span><strong>{recommendation.executionResult || "Не указан"}</strong></div>
        <div><span>Обращение</span><Button onClick={() => onOpenCase(recommendation.caseId)}>№ {recommendation.caseReference}</Button></div>
      </section>
      <section className="card recommendation-timeline-card">
        <div className="card-head"><div><h3>Хронология исполнения</h3><p>Все этапы направления, исполнения и рассмотрения ответа.</p></div></div>
        <div className="recommendation-timeline">
          {timeline.map((event, index) => {
            const fileKind = event.type === "created" ? "recommendation-attachment" : event.type === "response" ? "recommendation-response-attachment" : event.type === "return" ? "recommendation-return-attachment" : "";
            const files = fileKind ? filesFor(event.id, fileKind) : [];
            return <article className={`recommendation-event ${event.type}`} key={event.id}>
              <div className="recommendation-event-marker">{index + 1}</div>
              <div className="recommendation-event-body">
                <div className="recommendation-event-head"><div><h4>{event.title}</h4><span>{event.actor}</span></div><time>{formatDate(event.date)}</time></div>
                <p>{event.text}</p>
                {event.executionResult && <div className="recommendation-event-fact"><span>Результат исполнения</span><strong>{event.executionResult}</strong></div>}
                {event.dueDate && <div className="recommendation-event-fact"><span>{event.type === "return" ? "Новый срок исполнения" : "Срок исполнения"}</span><strong>{formatDate(event.dueDate)}</strong></div>}
                {files.length > 0 && <div className="recommendation-event-files">{files.map((file, fileIndex) => file.dataUrl ? <a href={file.dataUrl} download={file.filename || file.name} key={`${file.name}-${fileIndex}`}>{file.filename || file.name}</a> : null)}</div>}
              </div>
            </article>;
          })}
        </div>
      </section>
      {responseOpen && <Modal title={recommendation.channel === "external" ? "Зафиксировать исполнение из другой системы" : "Исполнение рекомендации"} onClose={() => setResponseOpen(false)}><form className="form-grid" onSubmit={async (event) => { event.preventDefault(); const form = new FormData(event.currentTarget); const answer = String(form.get("answer") || "").trim(); const result = String(form.get("executionResult") || "").trim(); const responseDate = String(form.get("responseDate") || ""); const responseNumber = String(form.get("responseRegistrationNumber") || "").trim(); const files = form.getAll("responseFiles").filter((value): value is File => value instanceof File && value.name.length > 0); if (!answer || !result || (recommendation.channel === "external" && (!responseDate || !responseNumber))) return; if (recommendation.channel === "external") await onRecordExternalResponse(recommendation.id, responseDate, responseNumber, answer, result, files); else await onSubmitResponse(recommendation.id, answer, result, files); setResponseOpen(false); }}>
        {recommendation.channel === "external" && <><label className="field"><span>Дата поступления ответа <span className="required">*</span></span><input type="date" name="responseDate" required /></label><label className="field"><span>Номер входящего документа <span className="required">*</span></span><input name="responseRegistrationNumber" required /></label></>}
        <label className="field"><span>Результат исполнения <span className="required">*</span></span><select name="executionResult" required defaultValue=""><option value="" disabled>Выберите результат</option>{EXECUTION_RESULT_OPTIONS.map((item) => <option value={item} key={item}>{item}</option>)}</select></label><label className="field"><span>Ответ <span className="required">*</span></span><textarea name="answer" rows={5} required /></label><label className="field"><span>Вложить файл</span><input type="file" name="responseFiles" multiple /></label><div className="actions"><Button onClick={() => setResponseOpen(false)}>Отмена</Button><Button primary type="submit">{recommendation.channel === "external" ? "Зафиксировать ответ" : "Направить ответ"}</Button></div></form></Modal>}
      {returnOpen && <Modal title={recommendation.channel === "external" ? "Зафиксировать возврат через другую систему" : "Вернуть исполнение на доработку"} onClose={() => setReturnOpen(false)}><form className="form-grid" onSubmit={async (event) => { event.preventDefault(); const form = new FormData(event.currentTarget); const due = String(form.get("revisionDueDate") || ""); const reason = String(form.get("returnReason") || "").trim(); const sentAt = String(form.get("returnSentAt") || ""); const registrationNumber = String(form.get("returnRegistrationNumber") || "").trim(); const files = form.getAll("returnFiles").filter((value): value is File => value instanceof File && value.name.length > 0); if (!due || (!reason && !files.length) || (recommendation.channel === "external" && (!sentAt || !registrationNumber))) return; if (recommendation.channel === "external") await onReturnExternalForRevision(recommendation.id, due, reason, sentAt, registrationNumber, files); else await onReturnForRevision(recommendation.id, due, reason, files); setReturnOpen(false); }}><label className="field"><span>Новый срок исполнения <span className="required">*</span></span><input type="date" name="revisionDueDate" defaultValue={recommendation.dueDate || ""} required /></label>{recommendation.channel === "external" && <><label className="field"><span>Дата исходящего документа <span className="required">*</span></span><input type="date" name="returnSentAt" required /></label><label className="field"><span>Номер исходящего документа <span className="required">*</span></span><input name="returnRegistrationNumber" required /></label></>}<label className="field"><span>Причина возврата</span><textarea name="returnReason" rows={4} /></label><label className="field"><span>Вложить файл с причиной возврата</span><input type="file" name="returnFiles" multiple /></label><div className="actions"><Button onClick={() => setReturnOpen(false)}>Отмена</Button><Button primary type="submit">{recommendation.channel === "external" ? "Зафиксировать возврат" : "Вернуть на доработку"}</Button></div></form></Modal>}
    </>
  );
}
