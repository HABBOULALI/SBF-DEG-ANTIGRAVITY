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

// Un envoi unique vers un destinataire (lié à un bordereau)
export interface SendRecord {
  id: string;
  recipientName: string;   // Ex: "Bureau de Contrôle"
  transmittalRef: string;  // Ex: "BE-PNS-0001"
  transmittalDate: string; // Date d'envoi
  status: ApprovalStatus;
  observationDate?: string;
  observationRef?: string;
  approvalDate?: string;
  returnDate?: string;
  transmittalFiles?: string[];
  observationFiles?: string[];
}

export interface Revision {
  id: string;
  index: string; // e.g., "00", "01"
  transmittalRef: string; // Réf Env (B-001) - primary/last send
  transmittalDate: string; // Date Env - primary/last send
  transmittalFiles?: string[];
  observationRef?: string;
  observationDate?: string;
  observationFiles?: string[];
  approvalDate?: string;
  returnDate?: string;
  approvedSendDate?: string;
  approvedReturnDate?: string;
  status: ApprovalStatus;
  comments?: string;
  recipient?: string;       // Legacy single recipient
  recipients?: string[];    // Multi-recipients (accumulated)
  sendHistory?: SendRecord[]; // Historique complet des envois par bordereau
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