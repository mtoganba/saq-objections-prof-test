export type CaseType = "notice" | "audit" | "control";
export type Role =
  | "work"
  | "director"
  | "dvga"
  | "kvga"
  | "commission"
  | "subject"
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
  | "decision_project_eotinish"
  | "decision_project_hearing"
  | "decided"
  | "final_response_approval"
  | "final_response_signed"
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
  | "processes"
  | "sources";
export type CaseTab = "overview" | "review" | "documents" | "history";

export interface ViolationPoint {
  id: string;
  number: string;
  title: string;
  finding: string;
  argument: string;
  amount: number;
  disputed: boolean;
  evidence?: string;
  authorityFinding?: string;
  position?: string;
  analysis?: string;
  legal?: string;
  proposal?: Outcome;
  final?: Outcome;
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

export interface CaseRecommendation {
  id: string;
  text: string;
  recipient: string;
  status: "sent" | "executed";
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
  /** Срок исполнения: 30 рабочих дней с даты направления. */
  dueDate?: string;
  executedAt?: string;
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
  snapshot?: {
    issues: ViolationPoint[];
    result: CaseResult | null;
    members: CommissionMember[];
    votes: Record<string, VoteResult> | null;
    meeting: Meeting | null;
    hearing: Hearing | null;
    delivery: Delivery | null;
    certificate: CaseCertificate | null;
  };
}

export interface CaseRequest {
  id: string;
  recipient: string;
  date: string;
  text: string;
  deadline: string;
  template?: "dvga" | "other";
  /** Кабинет SAQ, в который направляется запрос в другой орган. */
  saqRecipient?: Role;
  author?: string;
  customText?: string;
  sent?: string;
  responded?: string;
  /** Ответ органа хранится в запросе и недоступен другому адресату. */
  authorityResponses?: Record<
    string,
    { finding: string; response: string }
  >;
  responseApproved?: string;
  responseSigned?: string;
  confirmed?: string;
}

/** Черновик электронной формы запроса до фиксации действия. */
export interface RequestDraft {
  values: Record<string, string>;
  savedAt: string;
}

export type RequestDraftKind = "request" | "request-other";

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
  /** Обращения, включённые в данное заседание; порядок используется в повестке дня. */
  caseIds: string[];
  pollId: string;
  agendaHtml: string;
  agendaSigned?: boolean;
  agendaSignedAt?: string;
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
  relatedDocumentNumber?: string;
  relatedDocumentDate?: string;
  decisionKind?:
    | "prescription-audit"
    | "prescription-preventive"
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
    | "recommendation";
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
  /** Реквизиты регистрации заключения по возражению на уведомление. */
  conclusionRegistration?: { date: string; number: string };
  decisionProject?: Delivery | null;
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
  | "request-other"
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
  | "send-decision-project-eotinish"
  | "hearing-after-decision-project"
  | "deliver"
  | "close-review"
  | "approve-final-response"
  | "sign-final-response"
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
