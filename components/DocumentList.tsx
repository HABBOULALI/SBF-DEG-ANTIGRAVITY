import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Plus, Filter, Download, Clock, Edit2, Save, X, Loader2, FileSpreadsheet, ChevronUp, ChevronDown, ArrowUpDown, Bell, BellRing, Calendar, Send, Trash2, AlertTriangle, UploadCloud, FileText, Search, Mic, MicOff, ListPlus, Paperclip, File as FileIcon } from 'lucide-react';
import { BTPDocument, ApprovalStatus, Revision } from '../types';
import { Logo } from './Logo';
import * as XLSX from 'xlsx';

interface DocumentListProps {
  documents: BTPDocument[];
  onAddDocument: (doc: BTPDocument) => void;
  onUpdateDocument: (doc: BTPDocument) => void;
  onDeleteDocument: (id: string) => void;
  onNavigateToBordereau?: () => void;
  onAddToBordereau: (docId: string) => void;
  initialFilter?: ApprovalStatus | 'ALL';
}

type SortKey = 'lot' | 'classement' | 'poste' | 'name' | 'code' | 'index' | 'transmittalDate' | 'transmittalRef' | 'observationDate' | 'observationRef' | 'status' | 'approvalDate' | 'returnDate';

// Helper type for flattened rows
interface FlatRow {
    doc: BTPDocument;
    rev: Revision;
    isLatest: boolean;
}

// Augment window for SpeechRecognition
declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
    html2pdf: any;
  }
}

export const DocumentList: React.FC<DocumentListProps> = ({ documents, onAddDocument, onUpdateDocument, onDeleteDocument, onNavigateToBordereau, onAddToBordereau, initialFilter }) => {
  const [filter, setFilter] = useState<ApprovalStatus | 'ALL'>(initialFilter || 'ALL');
  const [searchQuery, setSearchQuery] = useState(''); // State pour la recherche textuelle
  const [isListening, setIsListening] = useState(false); // State pour le micro

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  
  // File Upload State
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadTarget, setUploadTarget] = useState<{docId: string, revId: string, type: 'transmittal' | 'observation'} | null>(null);

  // Confirmation Modals State
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  // attachmentToDelete is now object to track index
  const [attachmentToDelete, setAttachmentToDelete] = useState<{ type: 'transmittal' | 'observation', index: number } | null>(null);
  
  // Edit Mode State
  const [editingDocId, setEditingDocId] = useState<string | null>(null);
  const [editingRevId, setEditingRevId] = useState<string | null>(null);

  // Reminder State
  const [reminderModal, setReminderModal] = useState<{docId: string, revId: string} | null>(null);
  const [reminderForm, setReminderForm] = useState<{ active: boolean; frequencyDays: number }>({ active: true, frequencyDays: 3 });

  // Sorting State
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: 'asc' | 'desc' } | null>(null);

  // App Settings
  const [appSettings, setAppSettings] = useState({
    companyName: 'Société Bouzguenda Frères',
    companySubtitle: 'Entreprise Générale de Bâtiments',
    projectCode: 'PRJ-2024-HZ',
    projectName: 'Construction Siège Horizon',
    logo: ''
  });

  const loadSettings = () => {
    const saved = localStorage.getItem('btp-app-settings');
    if (saved) {
        const parsed = JSON.parse(saved);
        setAppSettings(prev => ({ ...prev, ...parsed }));
    }
  };

  useEffect(() => {
    if (initialFilter) {
        setFilter(initialFilter);
    }
  }, [initialFilter]);

  useEffect(() => {
    loadSettings();
    // Listen for live updates
    const handleUpdate = () => loadSettings();
    window.addEventListener('btp-app-settings-updated', handleUpdate);
    return () => window.removeEventListener('btp-app-settings-updated', handleUpdate);
  }, []);

  // Form State
  const [newLot, setNewLot] = useState('01');
  const [newCl, setNewCl] = useState('A');
  const [newPoste, setNewPoste] = useState('GC');
  const [newCode, setNewCode] = useState('');
  const [newName, setNewName] = useState('');
  const [newIndex, setNewIndex] = useState('00');
  
  // Revision Form State
  const [newTransmittalDate, setNewTransmittalDate] = useState(new Date().toISOString().slice(0, 10));
  const [newTransmittalRef, setNewTransmittalRef] = useState('');
  const [newTransmittalFiles, setNewTransmittalFiles] = useState<string[]>([]); // Changed to Array

  // New Response Fields
  const [newObservationDate, setNewObservationDate] = useState('');
  const [newObservationRef, setNewObservationRef] = useState('');
  const [newObservationFiles, setNewObservationFiles] = useState<string[]>([]); // Changed to Array
  
  const [newStatus, setNewStatus] = useState<ApprovalStatus>(ApprovalStatus.PENDING);

  // --- LOGIQUE RECHERCHE VOCALE ---
  const handleVoiceSearch = () => {
    if (isListening) {
      setIsListening(false);
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Votre navigateur ne supporte pas la reconnaissance vocale.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'fr-FR';
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onstart = () => {
      setIsListening(true);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setSearchQuery(transcript);
    };

    recognition.onerror = (event: any) => {
      console.error("Erreur reconnaissance vocale", event.error);
      setIsListening(false);
    };

    recognition.start();
  };


  // 1. APLATIR LA STRUCTURE (Flatten)
  const allRows: FlatRow[] = useMemo(() => {
      const rows: FlatRow[] = [];
      documents.forEach(doc => {
          doc.revisions.forEach((rev, idx) => {
              rows.push({
                  doc: doc,
                  rev: rev,
                  isLatest: idx === doc.revisions.length - 1
              });
          });
      });
      return rows;
  }, [documents]);

  // 2. FILTRER (Status + Recherche Texte)
  const filteredRows = allRows.filter(({ rev, doc }) => {
    // Filtre Statut
    const matchStatus = filter === 'ALL' || rev.status === filter;
    
    // Filtre Recherche (Code, Nom, Lot, Poste)
    const lowerQuery = searchQuery.toLowerCase();
    const matchSearch = !searchQuery || 
        doc.code.toLowerCase().includes(lowerQuery) ||
        doc.name.toLowerCase().includes(lowerQuery) ||
        doc.lot.toLowerCase().includes(lowerQuery) ||
        doc.poste.toLowerCase().includes(lowerQuery);

    return matchStatus && matchSearch;
  });

  // 3. TRIER (SORT)
  const sortedRows = useMemo(() => {
    let sortableItems = [...filteredRows];
    
    // Default Sort: Code ASC, then Index ASC
    if (sortConfig === null) {
        sortableItems.sort((a, b) => {
            if (a.doc.code < b.doc.code) return -1;
            if (a.doc.code > b.doc.code) return 1;
            // Same code, sort by index
            if (a.rev.index < b.rev.index) return -1;
            if (a.rev.index > b.rev.index) return 1;
            return 0;
        });
        return sortableItems;
    }

    // Custom Sort
    sortableItems.sort((a, b) => {
      const rowA = a;
      const rowB = b;
      
      let valA: string = '';
      let valB: string = '';

      switch (sortConfig.key) {
          case 'lot': valA = rowA.doc.lot; valB = rowB.doc.lot; break;
          case 'classement': valA = rowA.doc.classement; valB = rowB.doc.classement; break;
          case 'poste': valA = rowA.doc.poste; valB = rowB.doc.poste; break;
          case 'name': valA = rowA.doc.name; valB = rowB.doc.name; break;
          case 'code': valA = rowA.doc.code; valB = rowB.doc.code; break;
          case 'index': valA = rowA.rev.index; valB = rowB.rev.index; break;
          case 'transmittalDate': valA = rowA.rev.transmittalDate; valB = rowB.rev.transmittalDate; break;
          case 'transmittalRef': valA = rowA.rev.transmittalRef; valB = rowB.rev.transmittalRef; break;
          case 'observationDate': valA = rowA.rev.observationDate || ''; valB = rowB.rev.observationDate || ''; break;
          case 'observationRef': valA = rowA.rev.observationRef || ''; valB = rowB.rev.observationRef || ''; break;
          case 'status': valA = rowA.rev.status; valB = rowB.rev.status; break;
          case 'approvalDate': valA = rowA.rev.approvalDate || ''; valB = rowB.rev.approvalDate || ''; break;
          case 'returnDate': valA = rowA.rev.returnDate || ''; valB = rowB.rev.returnDate || ''; break;
      }

      if (valA < valB) {
        return sortConfig.direction === 'asc' ? -1 : 1;
      }
      if (valA > valB) {
        return sortConfig.direction === 'asc' ? 1 : -1;
      }
      return 0;
    });
    return sortableItems;
  }, [filteredRows, sortConfig]);

  const requestSort = (key: SortKey) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const SortHeader: React.FC<{ label: string; sortKey: SortKey; className?: string, rowSpan?: number }> = ({ label, sortKey, className, rowSpan }) => {
    const isActive = sortConfig?.key === sortKey;
    return (
        <th 
            className={`px-3 py-3 border border-slate-600 font-bold text-xs uppercase tracking-wider cursor-pointer hover:bg-slate-700 transition-colors select-none group align-middle ${className}`}
            onClick={() => requestSort(sortKey)}
            rowSpan={rowSpan}
        >
            <div className={`flex items-center gap-1 ${className?.includes('text-center') ? 'justify-center' : ''}`}>
                {label}
                <div className="flex flex-col text-slate-400 group-hover:text-white">
                    {isActive ? (
                        sortConfig.direction === 'asc' ? <ChevronUp size={12} className="text-blue-400" /> : <ChevronDown size={12} className="text-blue-400" />
                    ) : (
                        <ArrowUpDown size={12} className="opacity-0 group-hover:opacity-50" />
                    )}
                </div>
            </div>
        </th>
    );
  };

  // ... (Reset Form, etc.)
  const resetForm = () => {
    setEditingDocId(null);
    setEditingRevId(null);
    setNewCode('');
    setNewName('');
    setNewIndex('00');
    setNewLot('01');
    setNewCl('A');
    setNewPoste('GC');
    setNewTransmittalDate(new Date().toISOString().slice(0, 10));
    setNewTransmittalRef('');
    setNewTransmittalFiles([]);
    setNewObservationDate('');
    setNewObservationRef('');
    setNewObservationFiles([]);
    setNewStatus(ApprovalStatus.PENDING);
  };

  const handleCreateClick = () => {
      resetForm();
      setIsModalOpen(true);
  };

  const handleEditClick = (doc: BTPDocument, rev: Revision, e: React.MouseEvent) => {
      e.stopPropagation(); 
      setEditingDocId(doc.id);
      setEditingRevId(rev.id);
      setNewLot(doc.lot);
      setNewCl(doc.classement);
      setNewPoste(doc.poste);
      setNewCode(doc.code);
      setNewName(doc.name);
      setNewIndex(rev.index);
      setNewTransmittalDate(rev.transmittalDate);
      setNewTransmittalRef(rev.transmittalRef);
      // @ts-ignore
      const tFiles = rev.transmittalFiles || (rev.transmittalFile ? [rev.transmittalFile] : []);
      setNewTransmittalFiles(tFiles);
      setNewObservationDate(rev.observationDate || '');
      setNewObservationRef(rev.observationRef || '');
      // @ts-ignore
      const oFiles = rev.observationFiles || (rev.observationFile ? [rev.observationFile] : []);
      setNewObservationFiles(oFiles);
      setNewStatus(rev.status);
      setIsModalOpen(true);
  };

  const handleDeleteClick = (docId: string, e: React.MouseEvent) => {
      e.stopPropagation();
      setDeleteConfirmId(docId);
  };

  const confirmDelete = () => {
      if (deleteConfirmId) {
          onDeleteDocument(deleteConfirmId);
          setDeleteConfirmId(null);
      }
  };

  const confirmAttachmentDelete = () => {
      if (!attachmentToDelete) return;

      if (attachmentToDelete.type === 'transmittal') {
          setNewTransmittalFiles(prev => prev.filter((_, i) => i !== attachmentToDelete.index));
      } else if (attachmentToDelete.type === 'observation') {
          setNewObservationFiles(prev => prev.filter((_, i) => i !== attachmentToDelete.index));
      }
      setAttachmentToDelete(null);
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    let docToSave: BTPDocument | null = null;

    if (editingDocId && editingRevId) {
        const docToUpdate = documents.find(d => d.id === editingDocId);
        if (!docToUpdate) return;
        const updatedDoc: BTPDocument = { ...docToUpdate };
        updatedDoc.lot = newLot;
        updatedDoc.classement = newCl;
        updatedDoc.poste = newPoste;
        updatedDoc.code = newCode;
        updatedDoc.name = newName;
        let updatedRevs = [...updatedDoc.revisions];
        const targetRevIdx = updatedRevs.findIndex(r => r.id === editingRevId);
        if (targetRevIdx === -1) return;
        updatedRevs[targetRevIdx] = {
            ...updatedRevs[targetRevIdx],
            index: newIndex,
            transmittalDate: newTransmittalDate,
            transmittalRef: newTransmittalRef,
            transmittalFiles: newTransmittalFiles,
            observationDate: newObservationDate,
            observationRef: newObservationRef,
            observationFiles: newObservationFiles,
            status: newStatus 
        };
        if (
             newStatus === ApprovalStatus.APPROVED || 
             newStatus === ApprovalStatus.APPROVED_WITH_COMMENTS ||
             newStatus === ApprovalStatus.PENDING ||
             newStatus === ApprovalStatus.NO_RESPONSE
        ) {
             updatedRevs = updatedRevs.slice(0, targetRevIdx + 1);
             updatedDoc.currentRevisionIndex = targetRevIdx;
        }
        else if (newStatus === ApprovalStatus.REJECTED) {
             let nextIndex = '00';
             const isNum = !isNaN(parseInt(newIndex));
             if (isNum) {
                 nextIndex = (parseInt(newIndex) + 1).toString().padStart(2, '0');
             } else {
                 const charCode = newIndex.charCodeAt(0);
                 nextIndex = String.fromCharCode(charCode + 1);
             }
             const newRev: Revision = {
               id: crypto.randomUUID(),
               index: nextIndex,
               transmittalRef: '', 
               transmittalDate: '', 
               status: ApprovalStatus.PENDING,
               observationDate: undefined,
               observationRef: undefined,
               transmittalFiles: [],
               observationFiles: []
             };
             updatedRevs.push(newRev);
             updatedDoc.currentRevisionIndex = updatedRevs.length - 1;
        }
        updatedDoc.revisions = updatedRevs;
        docToSave = updatedDoc;
    } else {
        const finalRef = newTransmittalRef || `B-${String(documents.length + 1).padStart(3, '0')}`;
        docToSave = {
            id: crypto.randomUUID(),
            lot: newLot,
            classement: newCl,
            poste: newPoste,
            code: newCode,
            name: newName,
            currentRevisionIndex: 0,
            revisions: [
                {
                id: crypto.randomUUID(),
                index: newIndex,
                transmittalRef: finalRef,
                transmittalDate: newTransmittalDate,
                transmittalFiles: newTransmittalFiles,
                status: newStatus,
                observationFiles: []
                }
            ]
        };
    }
    if (!docToSave) return;
    if (editingDocId) {
        onUpdateDocument(docToSave);
    } else {
        onAddDocument(docToSave);
    }
    closeAllModals();
  };

  const closeAllModals = () => {
      setIsModalOpen(false);
      resetForm();
  };

  const openReminderModal = (docId: string, revId: string, currentConfig?: any) => {
      setReminderModal({ docId, revId });
      if (currentConfig) {
          setReminderForm({ active: currentConfig.active, frequencyDays: currentConfig.frequencyDays });
      } else {
          setReminderForm({ active: true, frequencyDays: 3 });
      }
  };

  const saveReminder = () => {
      if (!reminderModal) return;
      const doc = documents.find(d => d.id === reminderModal.docId);
      if (!doc) return;
      const updatedDoc = { ...doc };
      const revIndex = updatedDoc.revisions.findIndex(r => r.id === reminderModal.revId);
      if (revIndex === -1) return;
      const nextDate = new Date();
      nextDate.setDate(nextDate.getDate() + reminderForm.frequencyDays);
      updatedDoc.revisions[revIndex] = {
          ...updatedDoc.revisions[revIndex],
          reminder: {
              active: reminderForm.active,
              frequencyDays: reminderForm.frequencyDays,
              nextReminderDate: reminderForm.active ? nextDate.toISOString().slice(0, 10) : undefined
          }
      };
      onUpdateDocument(updatedDoc);
      setReminderModal(null);
  };

  const triggerFileUpload = (docId: string, revId: string, type: 'transmittal' | 'observation') => {
      setUploadTarget({ docId, revId, type });
      setTimeout(() => {
          fileInputRef.current?.click();
      }, 0);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file || !uploadTarget) return;
      const reader = new FileReader();
      reader.onloadend = () => {
          const fileDataUrl = reader.result as string;
          const doc = documents.find(d => d.id === uploadTarget.docId);
          if (doc) {
              const updatedDoc = { ...doc };
              const revIdx = updatedDoc.revisions.findIndex(r => r.id === uploadTarget.revId);
              if (revIdx !== -1) {
                  if (uploadTarget.type === 'transmittal') {
                      const currentFiles = updatedDoc.revisions[revIdx].transmittalFiles || [];
                      if (currentFiles.length >= 3) {
                          alert("Maximum 3 bordereaux autorisés.");
                      } else {
                          updatedDoc.revisions[revIdx].transmittalFiles = [...currentFiles, fileDataUrl];
                          onUpdateDocument(updatedDoc);
                      }
                  } else {
                      const currentFiles = updatedDoc.revisions[revIdx].observationFiles || [];
                      if (currentFiles.length >= 3) {
                          alert("Maximum 3 notes d'observation autorisées.");
                      } else {
                          updatedDoc.revisions[revIdx].observationFiles = [...currentFiles, fileDataUrl];
                          onUpdateDocument(updatedDoc);
                      }
                  }
              }
          }
          setUploadTarget(null);
          e.target.value = '';
      };
      reader.readAsDataURL(file);
  };

  const handleModalFileChange = (e: React.ChangeEvent<HTMLInputElement>, type: 'transmittal' | 'observation') => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onloadend = () => {
          const result = reader.result as string;
          if (type === 'transmittal') {
              if (newTransmittalFiles.length >= 3) {
                  alert("Maximum 3 fichiers.");
                  return;
              }
              setNewTransmittalFiles(prev => [...prev, result]);
          }
          else {
              if (newObservationFiles.length >= 3) {
                  alert("Maximum 3 fichiers.");
                  return;
              }
              setNewObservationFiles(prev => [...prev, result]);
          }
      };
      reader.readAsDataURL(file);
      e.target.value = '';
  };

  const openFile = (fileUrl: string) => {
      const win = window.open();
      if(win) {
          win.document.write(`<iframe src="${fileUrl}" frameborder="0" style="border:0; top:0px; left:0px; bottom:0px; right:0px; width:100%; height:100%;" allowfullscreen></iframe>`);
      }
  };

  const getStatusText = (status: ApprovalStatus) => {
      switch (status) {
        case ApprovalStatus.APPROVED: return "Approuvé";
        case ApprovalStatus.APPROVED_WITH_COMMENTS: return "Approuvé avec réserves";
        case ApprovalStatus.REJECTED: return "Non Approuvé";
        case ApprovalStatus.NO_RESPONSE: return "Sans Réponse";
        case ApprovalStatus.PENDING: return "En cours de révision";
        default: return status;
      }
  };

  const handleExportPDF = () => {
    const element = document.getElementById('document-table-container');
    if (!element) return;

    // Trigger state change to re-render table without unwanted columns and with proper colspan
    setIsExportingPdf(true);

    // Give React a moment to re-render before capturing
    setTimeout(() => {
        const opt = {
          margin: 5,
          filename: `Suivi_Documents_${new Date().toISOString().split('T')[0]}.pdf`,
          image: { type: 'jpeg', quality: 0.98 },
          html2canvas: { scale: 2, useCORS: true, windowWidth: 1600 },
          jsPDF: { unit: 'mm', format: 'a3', orientation: 'landscape' }
        };

        // @ts-ignore
        if (window.html2pdf) {
          // @ts-ignore
          window.html2pdf().set(opt).from(element).save().then(() => {
            setIsExportingPdf(false);
          }).catch((err: any) => {
            console.error(err);
            setIsExportingPdf(false);
          });
        } else {
          alert("Erreur: Librairie PDF non chargée");
          setIsExportingPdf(false);
        }
    }, 500);
  };

  const handleExportExcel = () => {
    setIsExporting(true);
    try {
        if (!XLSX) {
            alert("Erreur: Librairie Excel non chargée correctement.");
            return;
        }

        const borderStyle = { top: { style: "thin", color: { rgb: "000000" } }, bottom: { style: "thin", color: { rgb: "000000" } }, left: { style: "thin", color: { rgb: "000000" } }, right: { style: "thin", color: { rgb: "000000" } } };
        const titleStyle = { alignment: { horizontal: "center", vertical: "center" }, font: { bold: true, sz: 16 } };
        const subtitleStyle = { alignment: { horizontal: "center", vertical: "center" }, font: { bold: false, sz: 11, color: { rgb: "555555" } } };
        
        const ws_data: any[][] = [
            ["", "", "", "", "", "", "", "", "", "", "", "", "", ""],
            ["", "", "", "", "", "", "", "", "", "", "", "", "", ""],
            ["", "", "", "", "", "", "", "", "", "", "", "", "", ""],
            ["", "", "", "", "", "", "", "", "", "", "", "", "", ""],
            ["", "", "", "", "", "", "", "", "", "", "", "", "", ""],
            [""], 
            ["N°", "Lot", "Poste", "Type", "CODE", "Indice", "Désignation Document", "Transmis par SBF", "", "Note d'observation", "", "Statut", "Date d'envoi pour visa", "Date de retour"],
            ["", "", "", "", "", "", "", "Date Envoi", "Réf Envoi", "Date Rép.", "Réf Rép.", "", "", ""]
        ];

        sortedRows.forEach((row, index) => {
          ws_data.push([
            index + 1,
            row.doc.lot,
            row.doc.poste,
            row.doc.classement,
            row.doc.code,
            row.rev.index,
            row.doc.name,
            row.rev.transmittalDate,
            row.rev.transmittalRef,
            row.rev.observationDate || '',
            row.rev.observationRef || '',
            getStatusText(row.rev.status),
            row.rev.approvalDate || '',
            row.rev.returnDate || ''
          ]);
        });

        const ws = XLSX.utils.aoa_to_sheet(ws_data);
        
        ws['A3'] = { v: appSettings.companyName.toUpperCase(), t: 's', s: { font: { bold: true }, alignment: { horizontal: "center", vertical: "center" } } };
        ws['D2'] = { v: "TABLEAU DE SUIVI DES DOCUMENTS", t: 's', s: titleStyle };
        ws['D3'] = { v: `PROJET : ${appSettings.projectName} (${appSettings.projectCode})`, t: 's', s: subtitleStyle };
        ws['D4'] = { v: `Date d'édition : ${new Date().toLocaleDateString()}`, t: 's', s: subtitleStyle };
        ws['K3'] = { v: "Validation / Cachet", t: 's', s: { font: { italic: true, color: { rgb: "AAAAAA" } }, alignment: { horizontal: "center", vertical: "center" } } };

        ws['!merges'] = [
            { s: {r:0, c:0}, e: {r:4, c:2} },   
            { s: {r:0, c:3}, e: {r:4, c:9} },   
            { s: {r:0, c:10}, e: {r:4, c:13} }, 
            { s: {r:6, c:0}, e: {r:7, c:0} }, { s: {r:6, c:1}, e: {r:7, c:1} }, { s: {r:6, c:2}, e: {r:7, c:2} }, { s: {r:6, c:3}, e: {r:7, c:3} }, { s: {r:6, c:4}, e: {r:7, c:4} }, { s: {r:6, c:5}, e: {r:7, c:5} }, { s: {r:6, c:6}, e: {r:7, c:6} },
            { s: {r:6, c:7}, e: {r:6, c:8} }, 
            { s: {r:6, c:9}, e: {r:6, c:10} }, 
            { s: {r:6, c:11}, e: {r:7, c:11} }, 
            { s: {r:6, c:12}, e: {r:7, c:12} }, 
            { s: {r:6, c:13}, e: {r:7, c:13} }, 
        ];

        const applyStyleToRange = (sR: number, eR: number, sC: number, eC: number, style: any) => {
            for(let r=sR; r<=eR; r++) {
                for(let c=sC; c<=eC; c++) {
                    const cellRef = XLSX.utils.encode_cell({r, c});
                    if(!ws[cellRef]) ws[cellRef] = { v: '', t: 's'};
                    ws[cellRef].s = style;
                }
            }
        };

        const headerBoxStyle = { border: borderStyle, alignment: { horizontal: "center", vertical: "center" } };
        applyStyleToRange(0, 4, 0, 2, headerBoxStyle);
        applyStyleToRange(0, 4, 3, 9, headerBoxStyle);
        applyStyleToRange(0, 4, 10, 13, headerBoxStyle);
        
        if(ws['A3']) ws['A3'].s = { ...headerBoxStyle, font: { bold: true, sz: 12 } };
        if(ws['D2']) ws['D2'].s = { ...headerBoxStyle, ...titleStyle };
        if(ws['D3']) ws['D3'].s = { ...headerBoxStyle, ...subtitleStyle };
        if(ws['D4']) ws['D4'].s = { ...headerBoxStyle, ...subtitleStyle };

        const tableHeaderStyle = { font: { bold: true, color: { rgb: "FFFFFF" } }, fill: { fgColor: { rgb: "374151" } }, alignment: { horizontal: "center", vertical: "center" }, border: borderStyle };
        applyStyleToRange(6, 7, 0, 13, tableHeaderStyle);

        const dataRange = { s: {r: 8, c: 0}, e: {r: ws_data.length -1, c: 13} };
        for (let R = dataRange.s.r; R <= dataRange.e.r; ++R) {
             for (let C = dataRange.s.c; C <= dataRange.e.c; ++C) {
                 const cell = ws[XLSX.utils.encode_cell({ r: R, c: C })];
                 if (cell) cell.s = { border: borderStyle, alignment: { vertical: "center", horizontal: [0,4,5,7,8,9,10,11,12].includes(C) ? "center" : "left" } };
             }
        }

        ws['!cols'] = [{wch:5}, {wch:5}, {wch:5}, {wch:5}, {wch:15}, {wch:5}, {wch:40}, {wch:12}, {wch:12}, {wch:12}, {wch:12}, {wch:15}, {wch:12}, {wch:12}];

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Suivi");
        XLSX.writeFile(wb, `Suivi_${appSettings.projectCode}.xlsx`);
    } catch (error) {
        console.error("Erreur export Excel", error);
        alert("Erreur lors de l'export Excel : " + (error instanceof Error ? error.message : String(error)));
    } finally {
        setIsExporting(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-gray-50/50">
      {/* --- HEADER --- */}
      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center p-4 bg-white border-b border-gray-200 shadow-sm gap-4">
        <div className="mb-2 xl:mb-0">
          <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
            <FileText className="text-blue-600" />
            Suivi des Documents
          </h2>
          <p className="text-sm text-gray-500">Gérez les révisions et le statut d'approbation</p>
        </div>
        
        <div className="flex flex-col md:flex-row items-center gap-3 w-full xl:w-auto">
            {/* Search & Filter Group */}
            <div className="flex items-center gap-3 w-full md:w-auto h-10">
                <div className="relative flex-1 md:w-64 h-full">
                    <input 
                      type="text" 
                      placeholder="Rechercher (Code, Nom...)" 
                      className="w-full h-full pl-9 pr-8 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none shadow-sm"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <button 
                      onClick={handleVoiceSearch}
                      className={`absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-gray-100 ${isListening ? 'text-red-500 animate-pulse' : 'text-gray-400'}`}
                    >
                      {isListening ? <MicOff size={14} /> : <Mic size={14} />}
                    </button>
                </div>

                <div className="relative h-full">
                    <select 
                      className="h-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none appearance-none bg-white shadow-sm cursor-pointer hover:border-blue-400 transition-colors"
                      value={filter}
                      onChange={(e) => setFilter(e.target.value as any)}
                    >
                      <option value="ALL">Tous les statuts</option>
                      <option value={ApprovalStatus.PENDING}>En cours</option>
                      <option value={ApprovalStatus.APPROVED}>Approuvé</option>
                      <option value={ApprovalStatus.APPROVED_WITH_COMMENTS}>Approuvé (R)</option>
                      <option value={ApprovalStatus.REJECTED}>Rejeté</option>
                      <option value={ApprovalStatus.NO_RESPONSE}>Sans réponse</option>
                    </select>
                    <Filter size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                </div>
            </div>

            {/* Buttons Group - Vertical List */}
            <div className="flex flex-col gap-2 w-full md:w-auto min-w-[140px]">
                <button 
                  onClick={handleExportExcel}
                  className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 shadow-sm active:scale-95 transition-all text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap w-full justify-start"
                  disabled={isExporting}
                  title="Exporter Excel"
                >
                  {isExporting ? <Loader2 className="animate-spin" size={16} /> : <FileSpreadsheet size={16} />}
                  <span>Excel</span>
                </button>

                <button 
                  onClick={handleExportPDF}
                  className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 shadow-sm active:scale-95 transition-all text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap w-full justify-start"
                  disabled={isExportingPdf}
                  title="Exporter PDF"
                >
                  {isExportingPdf ? <Loader2 className="animate-spin" size={16} /> : <FileIcon size={16} />}
                  <span>PDF</span>
                </button>

                <button 
                  onClick={handleCreateClick}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 shadow-sm active:scale-95 transition-all text-sm font-medium whitespace-nowrap w-full justify-start"
                >
                  <Plus size={16} />
                  <span>Nouveau</span>
                </button>
            </div>
        </div>
      </div>

      {/* --- TABLE --- */}
      <div className="flex-1 overflow-auto p-4">
        {/* Dynamic Class for PDF Mode: Forces white bg, no border, full visible overflow */}
        <div id="document-table-container" className={`bg-white rounded-xl shadow border border-gray-200 overflow-hidden relative ${isExportingPdf ? 'pdf-mode' : ''}`}>
          
          {/* --- PDF EXPORT HEADER (Visible only in PDF Mode via CSS) --- */}
          <div id="pdf-export-header" className="hidden flex-row border-4 border-slate-900 bg-white h-40">
              {/* Left: Logo */}
              <div className="w-[20%] border-r-2 border-slate-900 flex items-center justify-center p-4">
                  {appSettings.logo ? (
                      <img src={appSettings.logo} alt="Logo" className="max-w-full max-h-full object-contain" />
                  ) : (
                      <Logo className="w-20 h-20 text-slate-800" />
                  )}
              </div>
              
              {/* Center: Title & Info */}
              <div className="flex-1 flex flex-col justify-center items-center text-center p-2 bg-white">
                  <h1 className="text-xl font-bold uppercase text-slate-900 mb-1">{appSettings.companyName}</h1>
                  <h2 className="text-2xl font-black text-slate-900 uppercase tracking-widest border-b-2 border-slate-900 mb-3 pb-1 px-4">TABLEAU DE SUIVI DES DOCUMENTS</h2>
                  <div className="text-sm font-semibold text-slate-700">
                      <p className="uppercase">{appSettings.projectName} ({appSettings.projectCode})</p>
                      <p className="text-xs text-slate-500 mt-1">Édité le : {new Date().toLocaleDateString()}</p>
                  </div>
              </div>

              {/* Right: Empty Box */}
              <div className="w-[20%] border-l-2 border-slate-900 relative bg-slate-50">
                  <div className="absolute top-2 left-0 right-0 text-center text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                      Cadre Réservé Administration
                  </div>
              </div>
          </div>

          <div className="hidden pdf-spacer w-full h-8 bg-white"></div>

          <div className={`overflow-x-auto ${isExportingPdf ? 'overflow-visible' : ''}`}>
            <table className="w-full text-sm text-left border-collapse">
              <thead className="bg-slate-800 text-white text-xs uppercase sticky top-0 z-10">
                <tr>
                  <th className="px-2 py-3 border border-slate-600 font-bold text-center w-10 align-middle" rowSpan={2}>N°</th>
                  <SortHeader label="Lot" sortKey="lot" className="w-16 text-center" rowSpan={2} />
                  <SortHeader label="Poste" sortKey="poste" className="w-16 text-center" rowSpan={2} />
                  <SortHeader label="Type" sortKey="classement" className="w-16 text-center" rowSpan={2} />
                  <SortHeader label="CODE" sortKey="code" className="w-40 text-center" rowSpan={2} />
                  <SortHeader label="Indice" sortKey="index" className="w-16 text-center" rowSpan={2} />
                  <SortHeader label="Désignation Document" sortKey="name" className="min-w-[250px]" rowSpan={2} />
                  
                  {/* Dynamic ColSpan for PDF Export */}
                  <th id="th-transmis" colSpan={isExportingPdf ? 2 : 3} className="px-2 py-1 border border-slate-600 text-center bg-slate-900 font-bold align-middle">Transmis par SBF</th>
                  <th id="th-visa" colSpan={isExportingPdf ? 2 : 3} className="px-2 py-1 border border-slate-600 text-center bg-slate-900 font-bold align-middle">Retour Visa</th>
                  
                  <SortHeader label="Statut" sortKey="status" className="w-32 text-center" rowSpan={2} />
                  {/* Hide Actions Column in PDF */}
                  {!isExportingPdf && <th className="px-2 py-2 border border-slate-600 text-center font-bold align-middle no-print" rowSpan={2}>Actions</th>}
                </tr>
                <tr>
                  <SortHeader label="Date" sortKey="transmittalDate" className="w-24 bg-slate-800 text-center" />
                  <SortHeader label="Réf" sortKey="transmittalRef" className="w-24 bg-slate-800 text-center" />
                  {/* Conditionally Render File Icon Header */}
                  {!isExportingPdf && <th className="px-2 py-1 border border-slate-600 w-10 text-center align-middle no-print"><Paperclip size={12} className="mx-auto"/></th>}
                  
                  <SortHeader label="Date" sortKey="observationDate" className="w-24 bg-slate-800 text-center" />
                  <SortHeader label="Réf" sortKey="observationRef" className="w-24 bg-slate-800 text-center" />
                   {/* Conditionally Render File Icon Header */}
                  {!isExportingPdf && <th className="px-2 py-1 border border-slate-600 w-10 text-center align-middle no-print"><Paperclip size={12} className="mx-auto"/></th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sortedRows.length === 0 ? (
                  <tr>
                    <td colSpan={15} className="p-8 text-center text-gray-500">
                      Aucun document trouvé.
                    </td>
                  </tr>
                ) : sortedRows.map(({ doc, rev, isLatest }, idx) => {
                  // @ts-ignore
                  const tFiles = rev.transmittalFiles || (rev.transmittalFile ? [rev.transmittalFile] : []);
                  // @ts-ignore
                  const oFiles = rev.observationFiles || (rev.observationFile ? [rev.observationFile] : []);

                  return (
                    <tr 
                      key={`${doc.id}-${rev.id}`} 
                      className={`hover:bg-blue-50/50 transition-colors group ${!isLatest ? 'bg-gray-50/50 text-gray-400 text-xs italic' : ''}`}
                    >
                      <td className="px-2 py-3 border border-gray-300 text-center font-medium text-gray-500 align-middle">{idx + 1}</td>
                      <td className="px-2 py-3 border border-gray-300 font-medium text-center align-middle">{doc.lot}</td>
                      <td className="px-2 py-3 border border-gray-300 text-center align-middle">{doc.poste}</td>
                      <td className="px-2 py-3 border border-gray-300 text-center align-middle">{doc.classement}</td>
                      <td className="px-2 py-3 border border-gray-300 font-mono font-bold text-blue-900 text-center align-middle whitespace-nowrap">{doc.code}</td>
                      <td className="px-2 py-3 border border-gray-300 text-center font-bold align-middle">{rev.index}</td>
                      <td className="px-2 py-3 border border-gray-300 max-w-[250px] align-middle" title={doc.name}>{doc.name}</td>
                      
                      {/* Transmittal */}
                      <td className="px-2 py-3 text-center border border-gray-300 align-middle whitespace-nowrap">{rev.transmittalDate}</td>
                      <td className="px-2 py-3 text-center border border-gray-300 text-xs align-middle whitespace-nowrap">{rev.transmittalRef}</td>
                      
                      {!isExportingPdf && (
                        <td className="px-2 py-3 text-center border border-gray-300 align-middle no-print">
                            {tFiles.length > 0 ? (
                                <button onClick={() => openFile(tFiles[0])} className="text-blue-600 hover:text-blue-800 relative inline-flex justify-center items-center">
                                    <FileText size={16} />
                                    {tFiles.length > 1 && <span className="absolute -top-2 -right-2 bg-blue-600 text-white text-[8px] w-3 h-3 rounded-full flex items-center justify-center">{tFiles.length}</span>}
                                </button>
                            ) : (
                                isLatest && <button onClick={() => triggerFileUpload(doc.id, rev.id, 'transmittal')} className="text-gray-300 hover:text-blue-500 inline-flex justify-center items-center"><UploadCloud size={16}/></button>
                            )}
                        </td>
                      )}

                      {/* Observation */}
                      <td className="px-2 py-3 text-center border border-gray-300 align-middle whitespace-nowrap">{rev.observationDate || '-'}</td>
                      <td className="px-2 py-3 text-center border border-gray-300 text-xs align-middle whitespace-nowrap">{rev.observationRef || '-'}</td>
                      
                      {!isExportingPdf && (
                        <td className="px-2 py-3 text-center border border-gray-300 align-middle no-print">
                            {oFiles.length > 0 ? (
                                <button onClick={() => openFile(oFiles[0])} className="text-amber-600 hover:text-amber-800 relative inline-flex justify-center items-center">
                                    <FileText size={16} />
                                    {oFiles.length > 1 && <span className="absolute -top-2 -right-2 bg-amber-600 text-white text-[8px] w-3 h-3 rounded-full flex items-center justify-center">{oFiles.length}</span>}
                                </button>
                            ) : (
                                isLatest && <button onClick={() => triggerFileUpload(doc.id, rev.id, 'observation')} className="text-gray-300 hover:text-amber-500 inline-flex justify-center items-center"><UploadCloud size={16}/></button>
                            )}
                        </td>
                      )}
                      
                      {/* Status */}
                      <td className="px-2 py-3 text-center border border-gray-300 align-middle">
                        <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase inline-flex items-center gap-1 border ${
                          rev.status === ApprovalStatus.APPROVED ? 'bg-green-100 text-green-700 border-green-200' :
                          rev.status === ApprovalStatus.APPROVED_WITH_COMMENTS ? 'bg-green-50 text-green-600 border-green-200' :
                          rev.status === ApprovalStatus.REJECTED ? 'bg-red-100 text-red-700 border-red-200' :
                          rev.status === ApprovalStatus.NO_RESPONSE ? 'bg-orange-100 text-orange-700 border-orange-200' :
                          'bg-blue-50 text-blue-600 border-blue-200'
                        }`}>
                           {rev.status === ApprovalStatus.NO_RESPONSE && <AlertTriangle size={10} />}
                           {
                             rev.status === ApprovalStatus.APPROVED ? "Approuvé" :
                             rev.status === ApprovalStatus.REJECTED ? "Non Approuvé" :
                             rev.status === ApprovalStatus.NO_RESPONSE ? "Sans réponse" :
                             rev.status === ApprovalStatus.PENDING ? "En cours de révision" :
                             rev.status === ApprovalStatus.APPROVED_WITH_COMMENTS ? "Approuvé (R)" :
                             rev.status
                           }
                        </span>
                      </td>

                      {/* Actions */}
                      {!isExportingPdf && (
                        <td className="px-2 py-3 text-center border border-gray-300 align-middle no-print">
                            <div className="flex items-center justify-center gap-1 opacity-100 sm:opacity-0 group-hover:opacity-100 transition-opacity">
                                <button 
                                    onClick={(e) => handleEditClick(doc, rev, e)} 
                                    className="p-1.5 text-blue-600 hover:bg-blue-100 rounded"
                                    title="Modifier"
                                >
                                    <Edit2 size={14} />
                                </button>
                                
                                <button 
                                    onClick={() => openReminderModal(doc.id, rev.id, rev.reminder)}
                                    className={`p-1.5 rounded ${rev.reminder?.active ? 'text-amber-600 bg-amber-100' : 'text-gray-400 hover:bg-gray-100'}`}
                                    title="Rappel"
                                >
                                    <Bell size={14} />
                                </button>

                                <button 
                                    onClick={() => onAddToBordereau(doc.id)}
                                    className="p-1.5 text-purple-600 hover:bg-purple-100 rounded"
                                    title="Ajouter au Bordereau"
                                >
                                    <Send size={14} />
                                </button>
                                
                                {isLatest && (
                                    <button 
                                        onClick={(e) => handleDeleteClick(doc.id, e)} 
                                        className="p-1.5 text-red-600 hover:bg-red-100 rounded"
                                        title="Supprimer"
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                )}
                            </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      
      {/* Hidden File Input for Icon Clicks */}
      <input type="file" ref={fileInputRef} className="hidden" accept=".pdf,.jpg,.png,.doc,.docx,.xls,.xlsx" onChange={handleFileChange} />

      {/* --- CREATE / EDIT MODAL --- */}
      {isModalOpen && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
              <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in duration-200">
                  <div className="p-6 border-b border-gray-200 flex justify-between items-center bg-gray-50">
                      <h3 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                          {editingDocId ? <Edit2 size={20} className="text-blue-600" /> : <Plus size={20} className="text-blue-600" />}
                          {editingDocId ? 'Modifier le Document' : 'Nouveau Document'}
                      </h3>
                      <button onClick={closeAllModals} className="text-gray-500 hover:text-red-500 transition-colors">
                          <X size={24} />
                      </button>
                  </div>
                  
                  <form onSubmit={handleFormSubmit} className="p-6 space-y-6">
                      {/* Identité du Document */}
                      <div className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm space-y-4">
                          <h4 className="text-sm font-bold text-slate-700 uppercase tracking-wider mb-2">Identification</h4>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                              <div>
                                  <label className="block text-xs font-semibold text-gray-500 mb-1">Lot</label>
                                  <input required value={newLot} onChange={e => setNewLot(e.target.value)} className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500 outline-none bg-white" placeholder="01" />
                              </div>
                              <div>
                                  <label className="block text-xs font-semibold text-gray-500 mb-1">Type</label>
                                  <select value={newCl} onChange={e => setNewCl(e.target.value)} className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500 outline-none bg-white">
                                      <option value="A">A - Plans</option>
                                      <option value="B">B - Notes</option>
                                      <option value="C">C - Tech</option>
                                      <option value="D">D - Admin</option>
                                  </select>
                              </div>
                              <div>
                                  <label className="block text-xs font-semibold text-gray-500 mb-1">Poste</label>
                                  <input required value={newPoste} onChange={e => setNewPoste(e.target.value)} className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500 outline-none bg-white" placeholder="GC" />
                              </div>
                              <div>
                                  <label className="block text-xs font-semibold text-gray-500 mb-1">CODE</label>
                                  <input required value={newCode} onChange={e => setNewCode(e.target.value)} className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500 outline-none font-mono bg-white" placeholder="GC-PL-001" />
                              </div>
                          </div>
                          <div>
                              <label className="block text-xs font-semibold text-gray-500 mb-1">Désignation Document</label>
                              <input required value={newName} onChange={e => setNewName(e.target.value)} className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500 outline-none bg-white" placeholder="Plan de ferraillage..." />
                          </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          {/* Transmittal Info */}
                          <div className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm space-y-4">
                              <h4 className="text-sm font-bold text-slate-700 uppercase tracking-wider mb-2">Envoi (Transmittal)</h4>
                              <div className="grid grid-cols-2 gap-4">
                                  <div>
                                      <label className="block text-xs font-semibold text-gray-500 mb-1">Indice</label>
                                      <input required value={newIndex} onChange={e => setNewIndex(e.target.value)} className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500 outline-none font-bold text-center bg-white" />
                                  </div>
                                  <div>
                                      <label className="block text-xs font-semibold text-gray-500 mb-1">Date</label>
                                      <input type="date" required value={newTransmittalDate} onChange={e => setNewTransmittalDate(e.target.value)} className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500 outline-none bg-white" />
                                  </div>
                              </div>
                              <div>
                                  <label className="block text-xs font-semibold text-gray-500 mb-1">Réf</label>
                                  <input value={newTransmittalRef} onChange={e => setNewTransmittalRef(e.target.value)} className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500 outline-none bg-white" placeholder="B-00X" />
                              </div>
                              {/* File List Transmittal */}
                              <div>
                                  <label className="block text-xs font-semibold text-gray-500 mb-1">Pièces Jointes (B.E)</label>
                                  {newTransmittalFiles.map((file, idx) => (
                                      <div key={idx} className="flex items-center gap-2 text-xs bg-white border p-1 rounded mb-1">
                                          <span className="truncate flex-1">Fichier {idx + 1}</span>
                                          <button type="button" onClick={() => setAttachmentToDelete({ type: 'transmittal', index: idx })} className="text-red-500"><X size={12}/></button>
                                      </div>
                                  ))}
                                  {newTransmittalFiles.length < 3 && (
                                    <div className="relative mt-2">
                                        <input type="file" id="transmittal-upload" className="hidden" onChange={(e) => handleModalFileChange(e, 'transmittal')} />
                                        <label htmlFor="transmittal-upload" className="flex items-center justify-center gap-2 w-full p-2 border-2 border-dashed border-gray-300 rounded text-gray-500 hover:border-blue-500 hover:text-blue-500 cursor-pointer text-xs bg-white">
                                            <UploadCloud size={14} /> Ajouter Fichier
                                        </label>
                                    </div>
                                  )}
                              </div>
                          </div>

                          {/* Observation / Response Info */}
                          <div className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm space-y-4">
                              <h4 className="text-sm font-bold text-slate-700 uppercase tracking-wider mb-2">Réponse / Validation</h4>
                              <div>
                                  <label className="block text-xs font-semibold text-gray-500 mb-1">Statut</label>
                                  <select value={newStatus} onChange={e => setNewStatus(e.target.value as ApprovalStatus)} className="w-full p-2 border rounded focus:ring-2 focus:ring-amber-500 outline-none font-medium bg-white">
                                      <option value={ApprovalStatus.APPROVED}>Approuvé</option>
                                      <option value={ApprovalStatus.REJECTED}>Non Approuvé</option>
                                      <option value={ApprovalStatus.NO_RESPONSE}>Sans réponse</option>
                                      <option value={ApprovalStatus.PENDING}>En cours de révision</option>
                                  </select>
                              </div>
                              <div className="grid grid-cols-2 gap-4">
                                  <div>
                                      <label className="block text-xs font-semibold text-gray-500 mb-1">Date</label>
                                      <input type="date" value={newObservationDate} onChange={e => setNewObservationDate(e.target.value)} className="w-full p-2 border rounded focus:ring-2 focus:ring-amber-500 outline-none bg-white" />
                                  </div>
                                  <div>
                                      <label className="block text-xs font-semibold text-gray-500 mb-1">Réf</label>
                                      <input value={newObservationRef} onChange={e => setNewObservationRef(e.target.value)} className="w-full p-2 border rounded focus:ring-2 focus:ring-amber-500 outline-none bg-white" placeholder="OBS-..." />
                                  </div>
                              </div>
                              {/* File List Obs */}
                              <div>
                                  <label className="block text-xs font-semibold text-gray-500 mb-1">Fichiers Annotés (Visa)</label>
                                  {newObservationFiles.map((file, idx) => (
                                      <div key={idx} className="flex items-center gap-2 text-xs bg-white border p-1 rounded mb-1">
                                          <span className="truncate flex-1">Note {idx + 1}</span>
                                          <button type="button" onClick={() => setAttachmentToDelete({ type: 'observation', index: idx })} className="text-red-500"><X size={12}/></button>
                                      </div>
                                  ))}
                                  {newObservationFiles.length < 3 && (
                                    <div className="relative mt-2">
                                        <input type="file" id="obs-upload" className="hidden" onChange={(e) => handleModalFileChange(e, 'observation')} />
                                        <label htmlFor="obs-upload" className="flex items-center justify-center gap-2 w-full p-2 border-2 border-dashed border-gray-300 rounded text-gray-500 hover:border-amber-500 hover:text-amber-500 cursor-pointer text-xs bg-white">
                                            <UploadCloud size={14} /> Ajouter Note/Visa
                                        </label>
                                    </div>
                                  )}
                              </div>
                          </div>
                      </div>

                      <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
                          <button type="button" onClick={closeAllModals} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg font-medium">Annuler</button>
                          <button type="submit" className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-bold shadow-sm flex items-center gap-2">
                              <Save size={18} /> Enregistrer
                          </button>
                      </div>
                  </form>
              </div>
          </div>
      )}

      {/* --- CONFIRMATION MODALS --- */}
      {deleteConfirmId && (
          <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4 backdrop-blur-sm">
              <div className="bg-white rounded-lg p-6 max-w-sm w-full shadow-2xl">
                  <h3 className="text-lg font-bold text-gray-800 mb-2">Confirmer la suppression</h3>
                  <p className="text-gray-600 text-sm mb-6">Êtes-vous sûr de vouloir supprimer ce document ? Cette action est irréversible.</p>
                  <div className="flex justify-end gap-3">
                      <button onClick={() => setDeleteConfirmId(null)} className="px-4 py-2 border rounded hover:bg-gray-50">Annuler</button>
                      <button onClick={confirmDelete} className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700">Supprimer</button>
                  </div>
              </div>
          </div>
      )}
      
      {attachmentToDelete && (
          <div className="fixed inset-0 bg-black/50 z-[70] flex items-center justify-center p-4">
              <div className="bg-white rounded-lg p-6 max-w-sm w-full shadow-2xl">
                  <h3 className="font-bold mb-4">Supprimer la pièce jointe ?</h3>
                  <div className="flex justify-end gap-3">
                      <button onClick={() => setAttachmentToDelete(null)} className="px-4 py-2 border rounded">Non</button>
                      <button onClick={confirmAttachmentDelete} className="px-4 py-2 bg-red-600 text-white rounded">Oui</button>
                  </div>
              </div>
          </div>
      )}

      {/* --- REMINDER MODAL --- */}
      {reminderModal && (
          <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4 backdrop-blur-sm">
              <div className="bg-white rounded-xl p-6 max-w-sm w-full shadow-2xl border-t-4 border-amber-500">
                  <div className="flex items-center gap-2 mb-4 text-amber-600 font-bold text-lg">
                      <BellRing /> Configurer le Rappel
                  </div>
                  <div className="space-y-4">
                      <div className="flex items-center justify-between">
                          <label className="font-medium text-gray-700">Activer le rappel</label>
                          <input 
                              type="checkbox" 
                              checked={reminderForm.active} 
                              onChange={e => setReminderForm({...reminderForm, active: e.target.checked})} 
                              className="w-5 h-5 text-amber-600 rounded focus:ring-amber-500"
                          />
                      </div>
                      {reminderForm.active && (
                          <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">Fréquence de relance (jours)</label>
                              <input 
                                  type="number" 
                                  min="1"
                                  value={reminderForm.frequencyDays}
                                  onChange={e => setReminderForm({...reminderForm, frequencyDays: parseInt(e.target.value)})}
                                  className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-amber-500 outline-none"
                              />
                              <p className="text-xs text-gray-500 mt-2 flex items-center gap-1">
                                  <Clock size={12}/> Prochaine relance prévue dans {reminderForm.frequencyDays} jours.
                              </p>
                          </div>
                      )}
                  </div>
                  <div className="flex justify-end gap-3 mt-6">
                      <button onClick={() => setReminderModal(null)} className="px-4 py-2 text-gray-500 hover:bg-gray-100 rounded">Fermer</button>
                      <button onClick={saveReminder} className="px-4 py-2 bg-amber-600 text-white rounded hover:bg-amber-700 font-medium shadow-sm">Enregistrer</button>
                  </div>
              </div>
          </div>
      )}
      {/* --- STYLE FOR PDF EXPORT --- */}
      <style>{`
        .pdf-mode #pdf-export-header { display: flex !important; }
        .pdf-mode .pdf-spacer { display: block !important; }
        .pdf-mode { 
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            z-index: 50;
            background: white;
            overflow: visible !important;
            height: auto !important;
            border: none !important;
            box-shadow: none !important;
        }
        .pdf-mode table {
             width: 100% !important;
        }
        .pdf-mode .overflow-x-auto {
             overflow: visible !important;
        }
      `}</style>
    </div>
  );
};