import { doc, runTransaction, setDoc } from 'firebase/firestore';
import { sendToGoogleScript } from './googleService';
import { db } from './firebase';
import { AppSettings, ApprovalStatus, BTPDocument, Revision, ScheduledDocumentEmailRule, ScheduledDocumentEmailSettings } from '../types';
import { scheduledExcelExportService, ScheduledExcelRow } from './scheduledExcelExportService';

const SCHEDULER_STATE_REF = doc(db, 'config', 'email_scheduler_state');

const DAY_TO_INDEX: Record<string, number> = {
  SUNDAY: 0,
  MONDAY: 1,
  TUESDAY: 2,
  WEDNESDAY: 3,
  THURSDAY: 4,
  FRIDAY: 5,
  SATURDAY: 6,
};

const STATUS_LABELS: Record<ApprovalStatus, string> = {
  [ApprovalStatus.PENDING]: 'En cours de revision',
  [ApprovalStatus.APPROVED]: 'Approuve',
  [ApprovalStatus.APPROVED_WITH_COMMENTS]: 'Approuve (R)',
  [ApprovalStatus.REJECTED]: 'Non approuve',
  [ApprovalStatus.NO_RESPONSE]: 'Sans reponse',
};

interface SchedulerResult {
  attempted: boolean;
  sentCount: number;
  slotKey?: string;
}

interface SchedulerState {
  currentSlotKey?: string;
  status?: 'processing' | 'completed' | 'failed';
  claimedAt?: string;
  claimedBy?: string;
  completedAt?: string;
  sentCount?: number;
  error?: string;
}

interface DueSlot {
  slotKey: string;
  scheduledLabel: string;
}

const defaultScheduleSettings = (): ScheduledDocumentEmailSettings => ({
  enabled: false,
  dayOfWeek: 'MONDAY',
  time: '08:00',
  timezone: 'Africa/Tunis',
  rules: [],
});

const normalizeScheduleSettings = (settings?: AppSettings): ScheduledDocumentEmailSettings => ({
  ...defaultScheduleSettings(),
  ...(settings?.scheduledDocumentEmailSettings || {}),
  rules: settings?.scheduledDocumentEmailSettings?.rules || [],
});

const getCurrentRevision = (docItem: BTPDocument): Revision | undefined => {
  if (!docItem.revisions.length) return undefined;
  return docItem.revisions[docItem.currentRevisionIndex] || docItem.revisions[docItem.revisions.length - 1];
};

const getEffectiveStatus = (revision?: Revision): ApprovalStatus | undefined => {
  if (!revision) return undefined;
  if (revision.sendHistory && revision.sendHistory.length > 0) {
    return revision.sendHistory[revision.sendHistory.length - 1].status;
  }
  return revision.status;
};

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const getZonedDate = (date: Date, timezone: string) => new Date(date.toLocaleString('en-US', { timeZone: timezone }));

const pad2 = (value: number) => String(value).padStart(2, '0');

const computeDueSlot = (schedule: ScheduledDocumentEmailSettings, now = new Date()): DueSlot | null => {
  if (!schedule.enabled || !schedule.time || !schedule.dayOfWeek) {
    return null;
  }

  const targetDay = DAY_TO_INDEX[schedule.dayOfWeek];
  if (targetDay === undefined) {
    return null;
  }

  const [hourText, minuteText] = schedule.time.split(':');
  const hour = Number(hourText);
  const minute = Number(minuteText);

  if (!Number.isFinite(hour) || !Number.isFinite(minute)) {
    return null;
  }

  const zonedNow = getZonedDate(now, schedule.timezone || 'Africa/Tunis');
  const scheduled = new Date(zonedNow);
  scheduled.setHours(hour, minute, 0, 0);

  const diffDays = (zonedNow.getDay() - targetDay + 7) % 7;
  scheduled.setDate(zonedNow.getDate() - diffDays);

  if (diffDays === 0 && zonedNow < scheduled) {
    scheduled.setDate(scheduled.getDate() - 7);
  }

  const slotKey = `${scheduled.getFullYear()}-${pad2(scheduled.getMonth() + 1)}-${pad2(scheduled.getDate())}_${pad2(hour)}:${pad2(minute)}_${schedule.timezone}`;
  const scheduledLabel = `${pad2(scheduled.getDate())}/${pad2(scheduled.getMonth() + 1)}/${scheduled.getFullYear()} ${pad2(hour)}:${pad2(minute)} (${schedule.timezone})`;

  return { slotKey, scheduledLabel };
};

const shouldIncludeStatus = (rule: ScheduledDocumentEmailRule, status: ApprovalStatus) => {
  const includeAll = !rule.includeStatuses || rule.includeStatuses.length === 0;
  const included = includeAll || rule.includeStatuses.includes(status);
  const excluded = !!rule.excludeStatuses?.includes(status);
  return included && !excluded;
};

const buildRowsForRule = (documents: BTPDocument[], rule: ScheduledDocumentEmailRule) => {
  return documents.flatMap((docItem) => {
    const revision = getCurrentRevision(docItem);

    if (!revision) {
      return [];
    }

    if (revision.sendHistory && revision.sendHistory.length > 0) {
      return revision.sendHistory
        .filter((sendRecord) => shouldIncludeStatus(rule, sendRecord.status))
        .map((sendRecord) => ({
          lot: docItem.lot || '-',
          poste: docItem.poste || '-',
          type: docItem.classement || '-',
          code: docItem.code || '-',
          name: docItem.name || '-',
          revision: revision.index || '-',
          status: sendRecord.status,
          statusLabel: STATUS_LABELS[sendRecord.status],
          transmittalRef: sendRecord.transmittalRef || '-',
          transmittalDate: sendRecord.transmittalDate || '-',
          observationDate: sendRecord.observationDate || '-',
          observationRef: sendRecord.observationRef || '-',
          recipient: sendRecord.recipientName || '-',
          approvedSendDate: sendRecord.approvalDate || '-',
          approvedSendRef: sendRecord.approvalRef || '-',
          approvedReturnDate: revision.approvedReturnDate || '-',
        }));
    }

    const status = getEffectiveStatus(revision);

    if (!status || !shouldIncludeStatus(rule, status)) {
      return [];
    }

    return [{
      lot: docItem.lot || '-',
      poste: docItem.poste || '-',
      type: docItem.classement || '-',
      code: docItem.code || '-',
      name: docItem.name || '-',
      revision: revision.index || '-',
      status,
      statusLabel: STATUS_LABELS[status],
      transmittalRef: revision.transmittalRef || '-',
      transmittalDate: revision.transmittalDate || '-',
      observationDate: revision.observationDate || '-',
      observationRef: revision.observationRef || '-',
      recipient: revision.recipients?.join(', ') || revision.recipient || '-',
      approvedSendDate: revision.approvedSendDate || '-',
      approvedSendRef: revision.approvedSendRef || '-',
      approvedReturnDate: revision.approvedReturnDate || '-',
    }];
  });
};

const toExcelRows = (rows: ReturnType<typeof buildRowsForRule>): ScheduledExcelRow[] =>
  rows.map((row) => ({
    lot: row.lot,
    poste: row.poste,
    type: row.type,
    code: row.code,
    index: row.revision,
    name: row.name,
    transmittalDate: row.transmittalDate,
    transmittalRef: row.transmittalRef,
    observationDate: row.observationDate,
    observationRef: row.observationRef,
    status: row.status,
    statusLabel: row.statusLabel,
    recipient: row.recipient,
    approvedSendDate: row.approvedSendDate,
    approvedSendRef: row.approvedSendRef,
    approvedReturnDate: row.approvedReturnDate,
  }));

const buildHtmlTable = (rows: ReturnType<typeof buildRowsForRule>, rule: ScheduledDocumentEmailRule, scheduledLabel: string, projectName: string) => {
  const intro = `<p>${escapeHtml(rule.customMessage || 'Veuillez trouver ci-joint le tableau de suivi des documents.')}</p>`;
  const meta = `
    <p>
      <strong>Projet :</strong> ${escapeHtml(projectName || '-') }<br />
      <strong>Destinataire :</strong> ${escapeHtml(rule.userEmail)}<br />
      <strong>Execution :</strong> ${escapeHtml(scheduledLabel)}
    </p>
  `;

  if (rows.length === 0) {
    return `
      <div style="font-family:Arial,sans-serif;font-size:14px;color:#0f172a;">
        ${intro}
        ${meta}
        <p>Aucun document ne correspond aux filtres configures pour cet envoi hebdomadaire.</p>
      </div>
    `;
  }

  return `
    <div style="font-family:Arial,sans-serif;font-size:14px;color:#0f172a;">
      ${intro}
      ${meta}
      <p>Le fichier Excel contenant les données est en pièce jointe.</p>
    </div>
  `;
};

const buildPlainText = (rows: ReturnType<typeof buildRowsForRule>, rule: ScheduledDocumentEmailRule, scheduledLabel: string, projectName: string) => {
  const lines = [
    rule.customMessage || 'Veuillez trouver ci-joint le tableau de suivi des documents.',
    '',
    `Projet: ${projectName || '-'}`,
    `Destinataire: ${rule.userEmail}`,
    `Execution: ${scheduledLabel}`,
    '',
  ];

  if (!rows.length) {
    lines.push('Aucun document ne correspond aux filtres configures pour cet envoi hebdomadaire.');
    return lines.join('\n');
  }

  lines.push('Le fichier Excel contenant les données est en pièce jointe.');

  return lines.join('\n');
};

const claimSlot = async (slotKey: string, runnerId: string) => {
  let claimed = false;

  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(SCHEDULER_STATE_REF);
    const state = (snapshot.exists() ? snapshot.data() : {}) as SchedulerState;

    if (state.currentSlotKey === slotKey && (state.status === 'processing' || state.status === 'completed')) {
      claimed = false;
      return;
    }

    claimed = true;
    transaction.set(
      SCHEDULER_STATE_REF,
      {
        currentSlotKey: slotKey,
        status: 'processing',
        claimedAt: new Date().toISOString(),
        claimedBy: runnerId,
        error: null,
      },
      { merge: true }
    );
  });

  return claimed;
};

const updateSlotState = async (
  slotKey: string,
  payload: Partial<SchedulerState>
) => {
  await setDoc(
    SCHEDULER_STATE_REF,
    {
      currentSlotKey: slotKey,
      ...payload,
    },
    { merge: true }
  );
};

const sendRuleEmail = async ({
  scriptUrl,
  rule,
  documents,
  scheduledLabel,
  projectName,
  projectCode,
}: {
  scriptUrl: string;
  rule: ScheduledDocumentEmailRule;
  documents: BTPDocument[];
  scheduledLabel: string;
  projectName: string;
  projectCode: string;
}) => {
  const rows = buildRowsForRule(documents, rule);
  const subject = rule.customSubject?.trim() || `Tableau de suivi - ${rule.userEmail}`;
  const htmlBody = buildHtmlTable(rows, rule, scheduledLabel, projectName || '');
  const body = buildPlainText(rows, rule, scheduledLabel, projectName || '');
  const attachment = await scheduledExcelExportService.buildWorkbookBase64({
    rows: toExcelRows(rows),
    fileName: `Suivi_${(projectCode || 'Projet').replace(/[^\w-]+/g, '_')}_${rule.userEmail.replace(/[^\w.-]+/g, '_')}.xlsx`,
  });

  await sendToGoogleScript(scriptUrl, {
    action: 'sendScheduledDocumentEmail',
    to: rule.userEmail,
    subject,
    body,
    htmlBody,
    attachments: [attachment],
  });
};

export const emailSchedulerService = {
  processPendingScheduledEmails: async ({
    settings,
    documents,
    runnerId,
  }: {
    settings?: AppSettings | null;
    documents: BTPDocument[];
    runnerId: string;
  }): Promise<SchedulerResult> => {
    const schedule = normalizeScheduleSettings(settings || undefined);
    const scriptUrl = settings?.emailScriptUrl?.trim() || settings?.googleDriveScriptUrl?.trim();

    if (!scriptUrl || !schedule.enabled) {
      return { attempted: false, sentCount: 0 };
    }

    const dueSlot = computeDueSlot(schedule);
    if (!dueSlot) {
      return { attempted: false, sentCount: 0 };
    }

    const claimed = await claimSlot(dueSlot.slotKey, runnerId);
    if (!claimed) {
      return { attempted: false, sentCount: 0, slotKey: dueSlot.slotKey };
    }

    try {
      let sentCount = 0;
      const enabledRules = schedule.rules.filter((rule) => rule.enabled && rule.userEmail?.trim());

      for (const rule of enabledRules) {
        await sendRuleEmail({
          scriptUrl,
          rule,
          documents,
          scheduledLabel: dueSlot.scheduledLabel,
          projectName: settings?.projectName || '',
          projectCode: settings?.projectCode || '',
        });

        sentCount += 1;
      }

      await updateSlotState(dueSlot.slotKey, {
        status: 'completed',
        completedAt: new Date().toISOString(),
        sentCount,
        error: null,
      });

      return {
        attempted: true,
        sentCount,
        slotKey: dueSlot.slotKey,
      };
    } catch (error: any) {
      await updateSlotState(dueSlot.slotKey, {
        status: 'failed',
        error: error?.message || String(error),
      });
      throw error;
    }
  },

  sendTestEmailForRule: async ({
    settings,
    documents,
    rule,
  }: {
    settings?: AppSettings | null;
    documents: BTPDocument[];
    rule: ScheduledDocumentEmailRule;
  }) => {
    const scriptUrl = settings?.emailScriptUrl?.trim() || settings?.googleDriveScriptUrl?.trim();

    if (!scriptUrl) {
      throw new Error("L'URL du script d'envoi email est manquante.");
    }

    if (!rule.enabled) {
      throw new Error("Activez d'abord cette regle avant d'envoyer un test.");
    }

    if (!rule.userEmail?.trim()) {
      throw new Error("Aucune adresse email utilisateur n'est definie pour cette regle.");
    }

    await sendRuleEmail({
      scriptUrl,
      rule,
      documents,
      scheduledLabel: `Test manuel - ${new Date().toLocaleString('fr-FR')}`,
      projectName: settings?.projectName || '',
      projectCode: settings?.projectCode || '',
    });

    return { success: true };
  },
};
