export type CaseType = "notice" | "audit" | "control";
export type ApplicantIdentifierType = "ИИН" | "БИН";
export type Role =
  | "work"
  | "deputy"
  | "director"
  | "dvga"
  | "kvga"
  | "commission"
  | "subject"
  | "subject2"
  | "higher"
  | "demo-superuser";
export type CaseStatus =
  | "received"
  | "accepted"
  | "requested"
  | "request_approval"
  | "request_signed"
  | "request_approved"
  | "response_approval"
  | "response_signed"
  | "response_ready"
  | "materials"
  | "certificate_approval"
  | "certificate_signed"
  | "certificate_approved"
  | "documents_review"
  | "commission_members"
  | "commission_voting"
  | "circulated"
  | "meeting_certificate_approval"
  | "meeting_certificate_signed"
  | "meeting_certificate_approved"
  | "hearing"
  | "hearing_ready"
  | "meeting"
  | "protocol"
  | "decision_project"
  | "decision_project_approval"
  | "decision_project_signed"
  | "decision_project_delivery"
  | "decision_project_comments"
  | "decision_project_eotinish"
  | "decision_project_hearing"
  | "decided"
  | "final_response_approval"
  | "final_response_signed"
  | "final_response_delivery"
  | "delivered"
  | "completed"
  | "refused"
  | "withdrawn"
  | "forwarded"
  | "paused"
  | "court";
export type Outcome = "accept" | "partial" | "reject" | "refuse";
export type Page =
  | "registry"
  | "detail"
  | "sessions"
  | "notifications"
  | "recommendations"
  | "recommendation"
  | "processes"
  | "sources";
export type CaseTab = "overview" | "review" | "documents" | "history";

export interface ViolationPoint {
  id: string;
  number: string;
  title: string;
  finding: string;
  argument: string;
  /** Дополнительные доводы заявителя, представленные на последующих заслушиваниях. */
  additionalArguments?: string[];
  amount: number;
  disputed: boolean;
  evidence?: string;
  authorityFinding?: string;
  position?: string;
  analysis?: string;
  legal?: string;
  proposal?: Outcome;
  final?: Outcome;
  /** В приложении окончательного ответа решение по пункту принято большинством голосов. */
  finalDecisionByMajority?: boolean;
  remainingAmount?: number;
}

export interface CommissionMember {
  id: string;
  name: string;
  present: boolean;
  /** Председательствующий на конкретном заседании. */
  isChair?: boolean;
  recused: boolean;
  reason: string;
}

export interface VoteResult {
  yes: number;
  no: number;
  approved: boolean;
  chair: string;
  present: number;
  eligible: number;
  votes?: Record<string, string>;
  voteReasons?: Record<string, string>;
}

export interface CaseResult {
  label: string;
  kind?: string;
  reason: string;
  effect: string;
  date: string;
  number?: string;
}

export interface Hearing {
  skip: boolean;
  reason?: string;
  notice?: string;
  date?: string;
  location?: string;
  noticeChannel?: string;
  subject?: string;
  issuer?: string;
  note?: string;
  held?: string;
}

export interface Meeting {
  date: string;
  number: string;
  audio: string;
  /** Формат проведения заседания, указанный при формировании протокола. */
  format?: "онлайн, Qosyl" | "офлайн";
  /** Дата направления проекта протокола членам АК для подписания. */
  projectReceived?: string;
  recommendations?: string;
  signed?: string;
}

export interface RecommendationActivity {
  id: string;
  date: string;
  actor: string;
  type:
    | "created"
    | "approved"
    | "signed"
    | "response"
    | "acceptance"
    | "return"
    | "executed";
  title: string;
  text: string;
  executionResult?: string;
  dueDate?: string;
}

export interface CaseRecommendation {
  id: string;
  text: string;
  recipient: string;
  /** Канал направления: кабинет SAQ либо внешняя система. */
  channel?: "saq" | "external";
  /**
   * Полный маршрут SAQ: согласование и подпись рекомендации, исполнение,
   * затем согласование и подпись решения о принятии либо возврате ответа.
   * Для ранее созданных записей статус sent означает уже направленную
   * рекомендацию в кабинете SAQ.
   */
  status:
    | "approval"
    | "signature"
    | "sent"
    | "answered"
    | "acceptance_approval"
    | "acceptance_signature"
    | "return_approval"
    | "return_signature"
    | "returned"
    | "executed";
  answer: string;
  executionResult?: string;
  caseId: string;
  caseReference: string;
  executor: string;
  createdAt: string;
  /** Кабинет SAQ, в который направлена рекомендация. */
  recipientRole?: Role;
  /** Дата направления вместе с окончательным ответом. */
  sentAt?: string;
  /** Указанный рабочим органом срок исполнения. */
  dueDate?: string;
  /** Способ, номер и дата фиксации внешнего направления. */
  deliveryPath?: string;
  registrationNumber?: string;
  /** Дата поступления ответа адресата. */
  answeredAt?: string;
  /** Реквизиты ответа, вручную зафиксированного по внешнему каналу. */
  responseRegistrationNumber?: string;
  responseReceivedAt?: string;
  /** Срок, установленный при возврате ответа на доработку. */
  revisionDueDate?: string;
  returnedAt?: string;
  /** Реквизиты возврата, направленного через внешнюю систему. */
  returnSentAt?: string;
  returnRegistrationNumber?: string;
  executedAt?: string;
  /** Решение рабочего органа по поступившему ответу. */
  reviewDecision?: "accept" | "return";
  /** Причина, указанная при возврате ответа на доработку. */
  returnReason?: string;
  /** Номер повторного представления исполнения адресатом. */
  responseVersion?: number;
  /** Непрерывная история направления и исполнения рекомендации. */
  activity?: RecommendationActivity[];
}

export interface Delivery {
  date: string;
  number: string;
  receipt: string;
  channel: string;
  recipient?: string;
  appealCourt: string;
  appealProcedure: string;
  published?: string | null;
  received?: string;
  /** Кабинеты, в которые направлен подписанный окончательный ответ. */
  recipientRoles?: Role[];
}

/**
 * Направление мотивированного ответа по жалобе или заявлению. В отличие от
 * итогового ответа по возражению, каждый адресат может иметь отдельный
 * канал направления: кабинет SAQ либо внешняя система.
 */
export interface MotivatedResponseRecipient {
  id: "applicant" | "audit-object";
  recipient: string;
  identifier?: string;
  recipientRole?: Role;
  channel: "saq" | "external";
  /**
   * `not_tracked` применяется к объекту аудита без кабинета SAQ:
   * направление через другую систему не требует отдельной фиксации РО.
   */
  status: "pending" | "sent" | "not_tracked";
  sentAt?: string;
  deliveryPath?: string;
  registrationNumber?: string;
}

export interface MotivatedResponseRouting {
  recipients: MotivatedResponseRecipient[];
}

/** Заявитель — адресат подписанного проекта решения и состояние его доставки. */
export interface DecisionProjectRecipient {
  id: "subject" | "authority";
  recipient: string;
  recipientRole?: Role;
  /** Проект решения направляется заявителю для представления замечаний. */
  purpose: "comments" | "copy";
  channel: "saq" | "external" | "none";
  status: "pending" | "sent" | "not_sent";
  sentAt?: string;
  deliveryPath?: string;
  registrationNumber?: string;
}

/** Направление проекта решения и период для представления замечаний. */
export interface DecisionProjectRouting {
  /** Реквизиты направления заявителю, представляющему замечания. */
  channel?: "saq" | "external";
  sentAt?: string;
  receivedAt?: string;
  commentsDeadline?: string;
  deliveryPath?: string;
  registrationNumber?: string;
  recipients: DecisionProjectRecipient[];
  commentReceivedAt?: string;
  commentChannel?: string;
  commentRegistrationNumber?: string;
  commentText?: string;
}

export interface CaseDocument {
  name: string;
  kind: string;
  text: string;
  date: string;
  author: string;
  dataUrl?: string;
  filename?: string;
  requestId?: string;
  /** Рекомендация, к которой относится приложенный документ. */
  recommendationId?: string;
  /** Событие рекомендации, к которому относится файл. */
  recommendationActivityId?: string;
  snapshot?: {
    issues: ViolationPoint[];
    result: CaseResult | null;
    members: CommissionMember[];
    votes: Record<string, VoteResult> | null;
    meeting: Meeting | null;
    hearing: Hearing | null;
    delivery: Delivery | null;
    certificate: CaseCertificate | null;
    /** Адресаты и их ответы на момент формирования версии документа. */
    requests?: CaseRequest[];
    /** Версии дополнительных доводов, представленных на заслушивании. */
    hearingSupplements?: HearingSupplement[];
  };
}

/** Дополнительные доводы, зафиксированные после проведения заслушивания. */
export interface HearingSupplement {
  round: number;
  date: string;
  reason: string;
  byPoint: Record<string, string>;
  requiresRequest: boolean;
}

export interface CaseRequest {
  id: string;
  recipient: string;
  date: string;
  text: string;
  deadline: string;
  /** Подэтап этапа «Запрос», на котором создан запрос. */
  route?: RequestRoute;
  template?: "dvga" | "other";
  /** Кабинет SAQ, в который направляется запрос в другой орган. */
  saqRecipient?: Role;
  author?: string;
  customText?: string;
  /** Реквизиты направления запроса во внешней системе. */
  registrationNumber?: string;
  deliveryPath?: string;
  /** Независимый жизненный цикл каждого направленного запроса. */
  lifecycleStatus?: RequestLifecycleStatus;
  /** Реквизиты полученного ответа, если он зафиксирован рабочим органом. */
  responseRegistrationNumber?: string;
  /** Отменённые запросы не учитываются при переходе к анализу. */
  cancelled?: string;
  /** Дата согласования отдельного запроса директором ДАВГА. */
  approved?: string;
  sent?: string;
  responded?: string;
  /** Ответ органа хранится в запросе и недоступен другому адресату. */
  authorityResponses?: Record<string, { finding: string; response: string }>;
  responseApproved?: string;
  responseSigned?: string;
  confirmed?: string;
}

export type RequestLifecycleStatus =
  | "draft"
  | "approval"
  | "signature"
  | "waiting_response"
  | "response_received";

/** Черновик электронной формы запроса до фиксации действия. */
export interface RequestDraft {
  values: Record<string, string>;
  savedAt: string;
}

export type RequestDraftKind = "request" | "request-saq" | "request-other";

/**
 * Маршрут этапа «Запрос». Первоначальный запрос используется в золотом
 * маршруте, дополнительные запросы запускаются из анализа, заседания либо
 * после заслушивания по заявлению.
 */
export type RequestRoute =
  | "initial"
  | "additional-analysis"
  | "additional-commission"
  | "additional-hearing";

export interface CertificateMemberPosition {
  id: string;
  name: string;
  /** Оспариваемый пункт, к которому относится голос. */
  pointId?: string;
  pointNumber?: string;
  /** Итоговая позиция члена АК по обращению на этапе заседания. */
  result: Outcome | "";
  /** Комментарий члена АК либо исполнителя рабочего органа. */
  comment: string;
}

export interface CaseCertificate {
  /** Общее значение из ранее сформированных справок. */
  davgaArguments: string;
  /** Доводы рабочего органа по каждому оспариваемому пункту. */
  davgaArgumentsByPoint?: Record<string, string>;
  memberPositions: CertificateMemberPosition[];
}

export interface CommissionMeeting {
  id: string;
  number: number;
  dateTime: string;
  /** Формат и место проведения заседания. */
  formatAndPlace?: string;
  /** Обращения, включённые в данное заседание; порядок используется в повестке дня. */
  caseIds: string[];
  pollId: string;
  agendaHtml: string;
  agendaSigned?: boolean;
  agendaSignedAt?: string;
  /** Обращения, снятые с этого заседания из-за дополнительного запроса. */
  postponedCaseIds?: string[];
  /** Рабочий орган зафиксировал завершение заседания. */
  completed?: boolean;
  completedAt?: string;
  created: string;
}

export interface AgendaRegistryEntry {
  id: string;
  number: number;
  meetingDate: string;
  caseIds: string[];
  documentHtml: string;
  resultsHtml?: string;
  created: string;
}

/** Дополнительные реквизиты обращения для печатных форм. */
export interface AgendaDetails {
  cameraControlNumber?: string;
  cameraControlDate?: string;
  procurementNumber?: string;
  lotNumber?: string;
  procurementSubject?: string;
  procurementMethod?: string;
  customerName?: string;
  customerBin?: string;
  auditObjectName?: string;
  auditObjectBin?: string;
  /** Заявитель действует от имени объекта аудита по доверенности. */
  applicantIsAuditObjectRepresentative?: boolean;
  /** Реквизиты каждого обжалованного действия/бездействия. */
  actionAppealAuthorities?: Array<{
    issuer: string;
    documentNumber: string;
    documentDate: string;
  }>;
  relatedDocumentNumber?: string;
  relatedDocumentDate?: string;
  decisionKind?:
    | "prescription-audit"
    | "prescription-preventive"
    | "preventive-control-act"
    | "quality-control"
    | "administrative-act"
    /** Значения сохранённых до обновления карточек. */
    | "prescription"
    | "inspection-act";
}
export interface CaseNotification {
  id: string;
  caseId: string;
  recipient: string;
  text: string;
  date: string;
  read: boolean;
  kind?:
    | "attendance-poll"
    | "agenda-sign"
    | "agenda-signed"
    | "request-response"
    | "recommendation"
    | "recommendation-response"
    | "final-response"
    | "repeat-hearing";
  attendancePollId?: string;
  commissionMemberId?: string;
  meetingId?: string;
  recipientRole?: Role;
}

export interface CommissionAttendanceMember {
  id: string;
  name: string;
}

export interface CommissionAttendancePoll {
  id: string;
  dateTime: string;
  /** Формат и место проведения заседания, указанные в опросе. */
  formatAndPlace?: string;
  caseIds: string[];
  sentAt: string;
  responses: Record<string, "pending" | "yes" | "no">;
  /** Председатель АК или исполняющий его обязанности на этом заседании. */
  chairId?: string;
  manualResponseChanges?: Record<
    string,
    {
      changedBy: string;
      changedAt: string;
    }
  >;
}

export interface HistoryEvent {
  date: string;
  actor: string;
  title: string;
  text: string;
}

export interface ObjectionCase {
  id: string;
  type: CaseType;
  appealType?: string;
  appealNumber?: string;
  appealDate?: string;
  org: string;
  bin: string;
  /** Тип идентификатора заявителя, выбранный при создании обращения. */
  applicantIdentifierType?: ApplicantIdentifierType;
  address: string;
  applicant: string;
  registered: string;
  filed: string;
  channel: string;
  issuer: string;
  authority: string;
  document: {
    number: string;
    date: string;
    received: string;
    name: string;
    appealExplained?: boolean;
  };
  procurement?: string;
  amount: number;
  request: string;
  affectedParties?: string;
  issues: ViolationPoint[];
  status: CaseStatus;
  assignee: string;
  extensionDays: number;
  pauseDays: number;
  documents: CaseDocument[];
  requests: CaseRequest[];
  /** Последний выбранный маршрут этапа «Запрос». */
  requestRoute?: RequestRoute;
  /** Дата запуска текущего дополнительного маршрута. */
  requestRouteStartedAt?: string;
  /** Заполняется после получения всех ответов по дополнительному запросу. */
  requestRouteCompletedAt?: string;
  /** Контроль повторного заседания после дополнительного запроса или новых доводов. */
  repeatHearingStatus?: "required" | "ready" | "scheduled";
  repeatHearingRound?: number;
  repeatHearingReason?: string;
  repeatHearingRequestedAt?: string;
  repeatHearingReadyAt?: string;
  repeatHearingPreviousMeetingId?: string;
  repeatHearingPreviousMeetingNumber?: number;
  repeatHearingMeetingId?: string;
  /** Дополнительные доводы после заслушивания, по раундам рассмотрения. */
  hearingSupplements?: HearingSupplement[];
  /** Сохранённые проекты запросов, которые ещё не зафиксированы. */
  requestDrafts?: Partial<Record<RequestDraftKind, RequestDraft>>;
  /** Черновик справки до её формирования и направления на согласование. */
  analysisDraft?: RequestDraft;
  members: CommissionMember[];
  history: HistoryEvent[];
  screening?: string;
  actEffect?: string;
  memberPosition?: string;
  /** Новое обращение, поступившее через SAQ и ещё не открытое директором. */
  unread?: boolean;
  /** Новое назначение, которое ещё не открыто исполнителем рабочего органа. */
  unreadForAssignee?: boolean;
  agendaMeetingDate?: string;
  /** Дата последнего направленного опроса о присутствии по данному обращению. */
  attendanceMeetingDate?: string;
  /** Заседания, из которых обращение исключено директором ДАВГА. */
  excludedFromMeetingIds?: string[];
  /** Заседания, из которых обращение перенесено в другое заседание. */
  transferredFromMeetingIds?: string[];
  certificate?: CaseCertificate | null;
  hearing?: Hearing | null;
  meeting?: Meeting | null;
  agendaDetails?: AgendaDetails;
  votes?: Record<string, VoteResult> | null;
  result?: CaseResult | null;
  delivery?: Delivery | null;
  /** Маршрут направления мотивированного ответа заявителю и объекту аудита. */
  motivatedResponseRouting?: MotivatedResponseRouting | null;
  /** Реквизиты регистрации заключения по возражению на уведомление. */
  conclusionRegistration?: { date: string; number: string };
  decisionProject?: Delivery | null;
  /** Выбранный при создании проекта решения способ направления заявителю. */
  decisionProjectRecipients?: DecisionProjectRecipient[];
  /** Реквизиты направления проекта решения и замечаний заявителя. */
  decisionProjectRouting?: DecisionProjectRouting | null;
  pause?: { date: string; recipient: string; text: string } | null;
  requestPauseStartedAt?: string;
  resumeStatus?: CaseStatus;
  selfReview?: boolean;
  court?: {
    number: string;
    date: string;
    note: string;
    effect: string;
    result?: string;
  };
}

export type NewCaseInput = Pick<
  ObjectionCase,
  | "id"
  | "type"
  | "appealType"
  | "appealNumber"
  | "appealDate"
  | "org"
  | "bin"
  | "applicantIdentifierType"
  | "address"
  | "applicant"
  | "registered"
  | "filed"
  | "channel"
  | "issuer"
  | "authority"
  | "document"
  | "amount"
  | "request"
  | "issues"
> &
  Partial<
    Pick<ObjectionCase, "procurement" | "affectedParties" | "agendaDetails">
  >;
export interface DemoState {
  version: number;
  date: string;
  cases: ObjectionCase[];
  agendas: AgendaRegistryEntry[];
  meetings?: CommissionMeeting[];
  notifications: CaseNotification[];
  recommendations: CaseRecommendation[];
  attendancePolls: CommissionAttendancePoll[];
  activeCommissionMemberId: string;
}
export interface Route {
  page: Page;
  caseId?: string;
  /** Открытая карточка заседания внутри раздела «Заседания комиссии». */
  meetingId?: string;
  tab?: CaseTab;
}

export type Action =
  | "screen"
  | "assign-work-executor"
  | "request"
  | "request-saq"
  | "request-other"
  | "start-analysis-additional-request"
  | "start-commission-additional-request"
  | "send-request-approval"
  | "approve-request"
  | "sign-request"
  | "approve-response"
  | "sign-response"
  | "approve-certificate"
  | "sign-certificate"
  | "fill-meeting-certificate"
  | "approve-meeting-certificate"
  | "sign-meeting-certificate"
  | "review-commission-documents"
  | "choose-commission-members"
  | "commission-vote"
  | "fill-request-response"
  | "subject-response"
  | "record-external-response"
  | "position"
  | "analysis"
  | "edit-certificate"
  | "members"
  | "hearing"
  | "hearing-held"
  | "vote"
  | "sign"
  | "create-decision-project"
  | "approve-decision-project"
  | "sign-decision-project"
  | "record-decision-project-delivery"
  | "submit-decision-project-comment"
  | "record-external-decision-project-comment"
  | "proceed-to-final-response"
  | "send-decision-project-eotinish"
  | "hearing-after-decision-project"
  | "deliver"
  | "close-review"
  | "approve-final-response"
  | "sign-final-response"
  | "record-final-response-delivery"
  | "send-recommendations"
  | "forward"
  | "control-analysis"
  | "control-decision"
  | "supplement"
  | "pause"
  | "resume"
  | "withdraw"
  | "refuse"
  | "return-analysis"
  | "postpone"
  | "court"
  | "court-result"
  | "receipt"
  | "upload";
export interface ActionOption {
  action: Action;
  label: string;
  role: Role;
}
