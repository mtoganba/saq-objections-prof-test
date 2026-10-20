export type CaseType = "notice" | "audit" | "control";
export type Role =
  | "work"
  | "director"
  | "dvga"
  | "commission"
  | "subject"
  | "higher";
export type CaseStatus =
  | "received"
  | "accepted"
  | "requested"
  | "request_approval"
  | "request_approved"
  | "materials"
  | "certificate_approval"
  | "certificate_approved"
  | "circulated"
  | "hearing"
  | "hearing_ready"
  | "meeting"
  | "protocol"
  | "decided"
  | "delivered"
  | "completed"
  | "refused"
  | "withdrawn"
  | "forwarded"
  | "paused"
  | "court";
export type Outcome = "accept" | "partial" | "reject";
export type Page = "registry" | "detail" | "sessions" | "processes" | "sources";
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
  signed?: string;
}

export interface Delivery {
  date: string;
  number: string;
  receipt: string;
  channel: string;
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
  customText?: string;
  responded?: string;
}

export interface CertificateMemberPosition {
  id: string;
  name: string;
  argument: string;
}

export interface CaseCertificate {
  authorityArguments: string;
  memberPositions: CertificateMemberPosition[];
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
  members: CommissionMember[];
  history: HistoryEvent[];
  screening?: string;
  actEffect?: string;
  memberPosition?: string;
  certificate?: CaseCertificate | null;
  hearing?: Hearing | null;
  meeting?: Meeting | null;
  votes?: Record<string, VoteResult> | null;
  result?: CaseResult | null;
  delivery?: Delivery | null;
  pause?: { date: string; recipient: string; text: string } | null;
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
  Partial<Pick<ObjectionCase, "procurement" | "affectedParties">>;
export interface DemoState {
  version: number;
  date: string;
  cases: ObjectionCase[];
}
export interface Route {
  page: Page;
  caseId?: string;
  tab?: CaseTab;
}

export type Action =
  | "screen"
  | "request"
  | "send-request-approval"
  | "approve-request"
  | "approve-certificate"
  | "send-certificate-to-commission"
  | "fill-request-response"
  | "position"
  | "analysis"
  | "members"
  | "hearing"
  | "hearing-held"
  | "vote"
  | "sign"
  | "deliver"
  | "execute"
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
