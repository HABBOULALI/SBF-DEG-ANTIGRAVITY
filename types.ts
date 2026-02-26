export enum ApprovalStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  APPROVED_WITH_COMMENTS = 'APPROVED_WITH_COMMENTS',
  REJECTED = 'REJECTED',
  NO_RESPONSE = 'NO_RESPONSE'
}

export interface ReminderConfig {
  active: boolean;
  frequencyDays: number; // e.g., 3, 7
  nextReminderDate?: string;
}

export interface Revision {
  id: string;
  index: string; // e.g., "00", "01"
  transmittalRef: string; // Réf Env (B-001)
  transmittalDate: string; // Date Env
  transmittalFiles?: string[]; // Nouveau : Tableau de fichiers (DataURL), max 3
  observationRef?: string; // Réf Rép (VISA-001, OBS-005)
  observationDate?: string; // Date Rép
  observationFiles?: string[]; // Nouveau : Tableau de fichiers (DataURL), max 3
  approvalDate?: string; // Approb.
  returnDate?: string; // Retour
  status: ApprovalStatus;
  comments?: string;
  reminder?: ReminderConfig;
}

export interface BTPDocument {
  id: string;
  lot: string; // e.g., "01"
  classement: string; // e.g., "A"
  poste: string; // e.g., "GC"
  code: string; // e.g., "GC-FND-Z1-001"
  name: string;
  revisions: Revision[];
  currentRevisionIndex: number;
}

// AI Types
export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
  timestamp: Date;
}