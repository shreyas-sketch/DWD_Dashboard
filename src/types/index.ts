// ─── User / Auth ─────────────────────────────────────────────────────────────

export type UserRole = 'admin' | 'backend_manager' | 'backend_assist' | 'calling_assist';

export interface AppUser {
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
  createdAt: string;
  updatedAt: string;
}

// ─── Programs / Levels / Batches / Calls ─────────────────────────────────────

export interface Program {
  id: string;
  name: string;
  mentorName: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

export interface Level {
  id: string;
  programId: string;
  name: string; // e.g. "Level 0", "Level 1"
  order: number;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

export interface Batch {
  id: string;
  programId: string;
  levelId: string;
  batchNumber: string; // e.g. "001"
  batchName: string;
  startDate: string; // ISO date string
  endDate: string;
  remarks: string;
  assignedCallingAssistIds?: string[]; // UIDs of calling_assist users assigned to this batch
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

export type CallSessionType = 'main' | 'doubt1' | 'doubt2';

export interface CallSession {
  id: string;
  batchId: string;
  programId: string;
  levelId: string;
  date: string; // ISO date string
  sessionType?: CallSessionType;
  name: string; // e.g. "1st Day Call"
  order: number;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

// ─── Call Templates ──────────────────────────────────────────────────────────

export interface CallTemplateEntry {
  name: string;
  sessionTypes: CallSessionType[];
}

export interface CallTemplate {
  id: string;
  levelId: string;
  programId: string;
  templateName: string; // e.g. "Standard L0 Schedule"
  entries: CallTemplateEntry[];
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

// ─── Custom Fields ───────────────────────────────────────────────────────────

export type CustomFieldType = 'text' | 'dropdown' | 'checkbox' | 'date';

export interface CustomField {
  id: string;
  batchId: string;
  label: string;
  type: CustomFieldType;
  options?: string[]; // for dropdown
  order: number;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

// ─── Leads ───────────────────────────────────────────────────────────────────

export interface Lead {
  id: string;
  batchId: string;
  programId: string;
  levelId: string;
  name: string;
  email: string;
  phone: string;
  handlerId: string | null; // backend_assist uid
  handlerName: string | null;
  serialNumber: number;
  createdAt: string;
  updatedAt: string;
  source: 'manual' | 'import' | 'api';
  tags?: LeadTag[];
}

export interface LeadTag {
  type: 'deposit' | 'won';
  levelId: string;
  levelName: string;
  addedAt: string;
}

// ─── Call Reports ─────────────────────────────────────────────────────────────

export type CallingAssistStatus =
  | 'Ring-NR'
  | 'Voice Mail-NR'
  | 'Out Of Service-NR'
  | 'Switched Off-NR'
  | 'Busy'
  | 'Disconnected-NR'
  | 'Incoming Inactive-NR'
  | 'Out Of Reach/Network-NR'
  | "Won't Attend-NR"
  | 'Message Sent'
  | 'Will Attend/Will join'
  | 'Call Them';

export type HandlerStatus =
  | 'Ring-NR'
  | 'Voice Mail-NR'
  | 'Out Of Service-NR'
  | 'Switched Off-NR'
  | 'Busy'
  | 'Disconnected-NR'
  | 'Incoming Inactive-NR'
  | 'Out Of Reach/Network-NR'
  | "Won't Attend-NR"
  | 'Message Sent'
  | 'Will Attend/Will join'
  | 'Call Them'
  | "Don't Call Them"
  | 'JOINED'
  | 'Dropped from call'
  | 'Not Active';

export interface LeadCallReport {
  id: string;
  leadId: string;
  batchId: string;
  callSessionId: string;
  registrationReport: string;
  callingAssistReport: CallingAssistStatus | null;
  callingAssistId: string | null;
  handlerReport: HandlerStatus | null;
  handlerId: string | null;
  customFieldValues: Record<string, string>; // customFieldId -> value
  createdAt: string;
  updatedAt: string;
}

// ─── Dropdown options ─────────────────────────────────────────────────────────

export const CALLING_ASSIST_OPTIONS: CallingAssistStatus[] = [
  'Ring-NR',
  'Voice Mail-NR',
  'Out Of Service-NR',
  'Switched Off-NR',
  'Busy',
  'Disconnected-NR',
  'Incoming Inactive-NR',
  'Out Of Reach/Network-NR',
  "Won't Attend-NR",
  'Message Sent',
  'Will Attend/Will join',
  'Call Them',
];

export const HANDLER_OPTIONS: HandlerStatus[] = [
  'Ring-NR',
  'Voice Mail-NR',
  'Out Of Service-NR',
  'Switched Off-NR',
  'Busy',
  'Disconnected-NR',
  'Incoming Inactive-NR',
  'Out Of Reach/Network-NR',
  "Won't Attend-NR",
  'Message Sent',
  'Will Attend/Will join',
  'Call Them',
  "Don't Call Them",
  'JOINED',
  'Dropped from call',
  'Not Active',
];

// ─── Webhooks ─────────────────────────────────────────────────────────────────

export type WebhookEvent = 'lead_created' | 'batch_created' | 'lead_updated';

export interface WebhookSetting {
  id: string;
  name: string;
  url: string;
  events: WebhookEvent[];
  active: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}
