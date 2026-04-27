import ExcelJS from 'exceljs';
import { ApprovalStatus } from '../types';

export interface ScheduledExcelRow {
  lot: string;
  poste: string;
  type: string;
  code: string;
  index: string;
  name: string;
  transmittalDate: string;
  transmittalRef: string;
  observationDate: string;
  observationRef: string;
  status: ApprovalStatus;
  statusLabel: string;
  recipient: string;
  approvedSendDate: string;
  approvedSendRef: string;
  approvedReturnDate: string;
}

const toBase64 = (buffer: Uint8Array) => {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < buffer.length; i += chunkSize) {
    const chunk = buffer.slice(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
};

export const scheduledExcelExportService = {
  buildWorkbookBase64: async ({
    rows,
    fileName,
    sheetName = 'Suivi Documents',
  }: {
    rows: ScheduledExcelRow[];
    fileName: string;
    sheetName?: string;
  }) => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet(sheetName);

    sheet.columns = [
      { header: 'N°', key: 'num', width: 5 },
      { header: 'Lot', key: 'lot', width: 6 },
      { header: 'Poste', key: 'poste', width: 8 },
      { header: 'Type', key: 'type', width: 8 },
      { header: 'CODE', key: 'code', width: 20 },
      { header: 'Indice', key: 'index', width: 8 },
      { header: 'Désignation', key: 'name', width: 40 },
      { header: 'Date Envoi', key: 'transmittalDate', width: 12 },
      { header: 'Réf Envoi', key: 'transmittalRef', width: 15 },
      { header: 'Date Obs.', key: 'observationDate', width: 12 },
      { header: 'Réf Obs.', key: 'observationRef', width: 15 },
      { header: 'Statut', key: 'status', width: 18 },
      { header: 'Destinataire', key: 'recipient', width: 20 },
      { header: 'Date Envoi App.', key: 'approvedSendDate', width: 14 },
      { header: 'Réf Envoi App.', key: 'approvedSendRef', width: 15 },
      { header: 'Ret. App.', key: 'approvedReturnDate', width: 12 },
    ];

    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 9 };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
    headerRow.alignment = { horizontal: 'center', vertical: 'middle' };
    headerRow.height = 24;

    rows.forEach((row, idx) => {
      const dataRow = sheet.addRow({
        num: idx + 1,
        lot: row.lot,
        poste: row.poste,
        type: row.type,
        code: row.code,
        index: row.index,
        name: row.name,
        transmittalDate: row.transmittalDate,
        transmittalRef: row.transmittalRef,
        observationDate: row.observationDate,
        observationRef: row.observationRef,
        status: row.statusLabel,
        recipient: row.recipient,
        approvedSendDate: row.approvedSendDate,
        approvedSendRef: row.approvedSendRef,
        approvedReturnDate: row.approvedReturnDate,
      });

      dataRow.font = { size: 9 };
      dataRow.alignment = { vertical: 'middle' };
    });

    sheet.autoFilter = { from: 'A1', to: `P${Math.max(sheet.rowCount, 1)}` };
    sheet.eachRow((row) => {
      row.eachCell((cell) => {
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' },
        };
      });
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const uint8 = new Uint8Array(buffer as ArrayBuffer);

    return {
      fileName,
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      contentBase64: toBase64(uint8),
    };
  },
};
