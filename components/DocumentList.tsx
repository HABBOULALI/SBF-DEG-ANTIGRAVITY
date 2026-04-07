import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Plus, Filter, Download, Clock, Edit2, Save, X, Loader2, FileSpreadsheet, ChevronUp, ChevronDown, ArrowUpDown, Bell, BellRing, Calendar, Send, Trash2, AlertTriangle, UploadCloud, FileText, Search, Mic, MicOff, ListPlus, Paperclip, File as FileIcon } from 'lucide-react';
import { BTPDocument, ApprovalStatus, Revision, SendRecord } from '../types';
import { Logo } from './Logo';
import { useAuth } from '../context/AuthContext';
import * as XLSX from 'xlsx';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';

interface DocumentListProps {
  documents: BTPDocument[];
  onAddDocument: (doc: BTPDocument) => void;
  onUpdateDocument: (doc: BTPDocument) => void;
  onDeleteDocument: (id: string) => void;
  onNavigateToBordereau?: () => void;
  onAddToBordereau: (docId: string) => void;
  initialFilter?: ApprovalStatus | 'ALL';
}

type SortKey = 'lot' | 'classement' | 'poste' | 'name' | 'code' | 'index' | 'transmittalDate' | 'transmittalRef' | 'observationDate' | 'observationRef' | 'status' | 'approvalDate' | 'returnDate' | 'approvedSendDate' | 'approvedReturnDate';

// Helper type for flattened rows
interface FlatRow {
    doc: BTPDocument;
    rev: Revision;
    isLatest: boolean;
}

// Helper to get next revision index (Numeric 00->01, or Alphabetic A->B)
const getNextIndex = (currentIndex: string): string => {
    const isNum = !isNaN(parseInt(currentIndex));
    if (isNum) {
        return (parseInt(currentIndex) + 1).toString().padStart(2, '0');
    } else {
        const charCode = currentIndex.charCodeAt(0);
        return String.fromCharCode(charCode + 1);
    }
};

// Augment window for SpeechRecognition
declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
    html2pdf: any;
  }
}

export const DocumentList: React.FC<DocumentListProps> = ({ documents, onAddDocument, onUpdateDocument, onDeleteDocument, onNavigateToBordereau, onAddToBordereau, initialFilter }) => {
  const { user } = useAuth();
  const isViewer = user?.role === 'viewer';
  const isEditor = user?.role === 'editor';
  const isAdmin = user?.role === 'admin';
  const canModify = isAdmin || isEditor;
  const canDelete = isAdmin;

  const [filter, setFilter] = useState<ApprovalStatus | 'ALL'>(initialFilter || 'ALL');
  const [searchQuery, setSearchQuery] = useState(''); // State pour la recherche textuelle
  const [isListening, setIsListening] = useState(false); // State pour le micro

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  
  // File Upload State
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadTarget, setUploadTarget] = useState<{docId: string, revId: string, type: 'transmittal' | 'observation', sendId?: string} | null>(null);

  // Edit Send Modal State
  const [editSendModal, setEditSendModal] = useState<{docId: string, revIdx: number, sendIdx: number} | null>(null);
  const [editSendForm, setEditSendForm] = useState<Partial<SendRecord>>({});

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
    logo: '',
    logoMDO: ''
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
  
  const [newStatus, setNewStatus] = useState<ApprovalStatus>(ApprovalStatus.NO_RESPONSE);
  const [newApprovedSendDate, setNewApprovedSendDate] = useState('');
  const [newApprovedReturnDate, setNewApprovedReturnDate] = useState('');

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
          case 'approvedSendDate': valA = rowA.rev.approvedSendDate || ''; valB = rowB.rev.approvedSendDate || ''; break;
          case 'approvedReturnDate': valA = rowA.rev.approvedReturnDate || ''; valB = rowB.rev.approvedReturnDate || ''; break;
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
            className={`px-2 py-1.5 border border-slate-600 font-bold text-[9px] uppercase tracking-wider cursor-pointer hover:bg-slate-700 transition-colors select-none group align-middle ${className}`}
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
    setNewStatus(ApprovalStatus.NO_RESPONSE);
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
      setNewApprovedSendDate(rev.approvedSendDate || '');
      setNewApprovedReturnDate(rev.approvedReturnDate || '');
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
            approvedSendDate: newApprovedSendDate,
            approvedReturnDate: newApprovedReturnDate,
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
             const nextIndex = getNextIndex(newIndex);
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
                approvedSendDate: newApprovedSendDate,
                approvedReturnDate: newApprovedReturnDate,
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

  const triggerFileUpload = (docId: string, revId: string, type: 'transmittal' | 'observation', sendId?: string) => {
      setUploadTarget({ docId, revId, type, sendId });
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
                  const rev = updatedDoc.revisions[revIdx];
                  if (uploadTarget.sendId && rev.sendHistory) {
                      const sendIdx = rev.sendHistory.findIndex(s => s.id === uploadTarget.sendId);
                      if (sendIdx !== -1) {
                          const send = rev.sendHistory[sendIdx];
                          if (uploadTarget.type === 'transmittal') {
                              const currentFiles = send.transmittalFiles || [];
                              if (currentFiles.length >= 3) {
                                  alert("Maximum 3 bordereaux autorisés par envoi.");
                              } else {
                                  send.transmittalFiles = [...currentFiles, fileDataUrl];
                              }
                          } else {
                              const currentFiles = send.observationFiles || [];
                              if (currentFiles.length >= 3) {
                                  alert("Maximum 3 notes autorisées par envoi.");
                              } else {
                                  send.observationFiles = [...currentFiles, fileDataUrl];
                              }
                          }
                          onUpdateDocument(updatedDoc);
                      }
                  } else {
                      // Legacy logic
                      if (uploadTarget.type === 'transmittal') {
                          const currentFiles = rev.transmittalFiles || [];
                          if (currentFiles.length >= 3) {
                              alert("Maximum 3 bordereaux autorisés.");
                          } else {
                              rev.transmittalFiles = [...currentFiles, fileDataUrl];
                              onUpdateDocument(updatedDoc);
                          }
                      } else {
                          const currentFiles = rev.observationFiles || [];
                          if (currentFiles.length >= 3) {
                              alert("Maximum 3 notes d'observation autorisées.");
                          } else {
                              rev.observationFiles = [...currentFiles, fileDataUrl];
                              onUpdateDocument(updatedDoc);
                          }
                      }
                  }
              }
          }
          setUploadTarget(null);
          if (fileInputRef.current) fileInputRef.current.value = '';
      };
      reader.readAsDataURL(file);
  };

  const openEditSendModal = (docId: string, revIdx: number, sendIdx: number) => {
      const doc = documents.find(d => d.id === docId);
      if (!doc) return;
      const send = doc.revisions[revIdx].sendHistory?.[sendIdx];
      if (!send) return;
      setEditSendModal({ docId, revIdx, sendIdx });
      setEditSendForm({ ...send });
  };

  const updateSendRecord = () => {
    if (!editSendModal) return;
    const { docId, revIdx, sendIdx } = editSendModal;
    const doc = documents.find(d => d.id === docId);
    if (!doc) return;

    const updatedDoc = { ...doc };
    const rev = { ...updatedDoc.revisions[revIdx] };
    const sendHistory = [...(rev.sendHistory || [])];
    
    const oldStatus = doc.revisions[revIdx].sendHistory?.[sendIdx].status;
    const newStatus = editSendForm.status;

    sendHistory[sendIdx] = { ...sendHistory[sendIdx], ...editSendForm } as SendRecord;
    rev.sendHistory = sendHistory;
    updatedDoc.revisions[revIdx] = rev;

    // Logic 1: If status is set to REJECTED and this is the latest revision, 
    // automatically create a new revision with next index.
    if (newStatus === ApprovalStatus.REJECTED && revIdx === updatedDoc.revisions.length - 1) {
        const nextIndex = getNextIndex(rev.index);
        // Avoid duplicates if already exists
        const alreadyExists = updatedDoc.revisions.some(r => r.index === nextIndex);
        if (!alreadyExists) {
            const newRev: Revision = {
                id: crypto.randomUUID(),
                index: nextIndex,
                transmittalRef: '',
                transmittalDate: '',
                status: ApprovalStatus.PENDING,
                observationDate: undefined,
                observationRef: undefined,
                transmittalFiles: [],
                observationFiles: [],
                sendHistory: []
            };
            updatedDoc.revisions.push(newRev);
            updatedDoc.currentRevisionIndex = updatedDoc.revisions.length - 1;
        }
    }
    // Logic 2: UNDO. If oldStatus was REJECTED and newStatus is NOT REJECTED,
    // and we have a "orphan" next revision that is still empty, remove it.
    else if (oldStatus === ApprovalStatus.REJECTED && newStatus !== ApprovalStatus.REJECTED) {
        const nextIdx = revIdx + 1;
        if (updatedDoc.revisions[nextIdx]) {
            const nextRev = updatedDoc.revisions[nextIdx];
            const expectedIndex = getNextIndex(rev.index);
            
            // Check if next revision was the auto-generated one (same index and empty)
            const isAutoGenerated = nextRev.index === expectedIndex;
            const isEmpty = (!nextRev.sendHistory || nextRev.sendHistory.length === 0) && 
                            (!nextRev.transmittalFiles || nextRev.transmittalFiles.length === 0) &&
                            (!nextRev.transmittalDate);
            
            if (isAutoGenerated && isEmpty) {
                updatedDoc.revisions.splice(nextIdx, 1);
                updatedDoc.currentRevisionIndex = updatedDoc.revisions.length - 1;
            }
        }
    }
    
    onUpdateDocument(updatedDoc);
    setEditSendModal(null);
  };

  const deleteSendRecord = (docId: string, revIdx: number, sendIdx: number) => {
    if (!window.confirm("Êtes-vous sûr de vouloir supprimer cet envoi de l'historique ?")) return;
    const doc = documents.find(d => d.id === docId);
    if (!doc) return;

    const updatedDoc = { ...doc };
    const rev = { ...updatedDoc.revisions[revIdx] };
    const sendHistory = [...(rev.sendHistory || [])];
    
    sendHistory.splice(sendIdx, 1);
    rev.sendHistory = sendHistory;
    updatedDoc.revisions[revIdx] = rev;
    
    onUpdateDocument(updatedDoc);
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
          margin: [10, 10, 10, 10], // Consistant margins
          filename: `SBF_GED_Suivi_${new Date().toLocaleDateString('fr-FR').replace(/\//g, '-')}.pdf`,
          image: { type: 'jpeg', quality: 1.0 },
          html2canvas: { 
            scale: 2, 
            useCORS: true, 
            logging: false,
            backgroundColor: '#ffffff', // Force white background for capture
            scrollY: 0, // Prevent issues with scrolled content
            windowWidth: element.scrollWidth + 100 // Dynamic window width based on content
          },
          jsPDF: { unit: 'mm', format: 'a3', orientation: 'landscape', compress: true },
          pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
        };

        // @ts-ignore
        if (window.html2pdf) {
          // @ts-ignore
          window.html2pdf().set(opt).from(element).save().then(() => {
            setIsExportingPdf(false);
          }).catch((err: any) => {
            console.error("PDF Export Error:", err);
            setIsExportingPdf(false);
          });
        } else {
          alert("Une erreur technique est survenue: la librairie de génération PDF n'est pas disponible.");
          setIsExportingPdf(false);
        }
    }, 1200); // Increased timeout to ensure full render even with large tables
  };

  const handleExportExcel = async () => {
    setIsExporting(true);
    try {
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Suivi');

        // 1. Gestion des Logos
        // Logo SBF (Gauche - Col A1:D5)
        if (appSettings.logo) {
            try {
                const response = await fetch(appSettings.logo);
                const buffer = await response.arrayBuffer();
                const imageId = workbook.addImage({ buffer, extension: 'png' });
                worksheet.addImage(imageId, {
                    tl: { col: 0, row: 0 },
                    ext: { width: 140, height: 75 },
                    editAs: 'oneCell'
                });
            } catch (e) { console.error("Logo SBF error", e); }
        }

        // Logo MDO (Droite - Col M1:O5)
        if (appSettings.logoMDO) {
            try {
                const response = await fetch(appSettings.logoMDO);
                const buffer = await response.arrayBuffer();
                const imageId = workbook.addImage({ buffer, extension: 'png' });
                worksheet.addImage(imageId, {
                    tl: { col: 12, row: 0 },
                    ext: { width: 100, height: 70 },
                    editAs: 'oneCell'
                });
            } catch (e) { console.error("Logo MDO error", e); }
        }

        // 2. En-têtes (Merged Cells)
        // [A1:D5] - Cellule Logo Gauche
        worksheet.mergeCells('A1:D5');
        worksheet.getCell('A1').border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };

        // [E1:L5] - Titre Central
        worksheet.mergeCells('E1:L5');
        const titleCell = worksheet.getCell('E1');
        titleCell.value = "REGISTRE DES SUIVI DES PLANS D'EXECUTION";
        titleCell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
        titleCell.font = { bold: true, size: 16, color: { argb: 'FF1E3A8A' } };
        titleCell.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };
        
        // [M1:O5] - Cellule Logo Droite
        worksheet.mergeCells('M1:O5');
        worksheet.getCell('M1').border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };

        // 3. Ligne d'informations (Ligne 6)
        worksheet.mergeCells('A6:G6');
        const projectCell = worksheet.getCell('A6');
        projectCell.value = `PROJET : ${appSettings.projectName} (${appSettings.projectCode})`;
        projectCell.font = { bold: true, italic: true, size: 10 };
        projectCell.alignment = { vertical: 'middle', horizontal: 'left' };

        worksheet.mergeCells('H6:O6');
        const dateCell = worksheet.getCell('H6');
        dateCell.value = `Date d'édition : ${new Date().toLocaleDateString()}`;
        dateCell.font = { bold: true, size: 10 };
        dateCell.alignment = { vertical: 'middle', horizontal: 'right' };

        // 4. Table Headers (Row 7 & 8)
        const applyHeaderStyle = (cell: ExcelJS.Cell) => {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E40AF' } }; // Corporate Blue (blue-800)
            cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 9 };
            cell.alignment = { vertical: 'middle', horizontal: 'center' };
            cell.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };
        };

        // Merges for headers
        worksheet.mergeCells(7, 1, 8, 1); worksheet.getCell(7, 1).value = "N°";
        worksheet.mergeCells(7, 2, 8, 2); worksheet.getCell(7, 2).value = "Lot";
        worksheet.mergeCells(7, 3, 8, 3); worksheet.getCell(7, 3).value = "Poste";
        worksheet.mergeCells(7, 4, 8, 4); worksheet.getCell(7, 4).value = "Type";
        worksheet.mergeCells(7, 5, 8, 5); worksheet.getCell(7, 5).value = "CODE";
        worksheet.mergeCells(7, 6, 8, 6); worksheet.getCell(7, 6).value = "Indice";
        worksheet.mergeCells(7, 7, 8, 7); worksheet.getCell(7, 7).value = "Désignation Document";
        
        worksheet.mergeCells(7, 8, 7, 9); worksheet.getCell(7, 8).value = "Transmis par SBF";
        worksheet.getCell(8, 8).value = "Date Envoi";
        worksheet.getCell(8, 9).value = "Réf Envoi";
        
        worksheet.mergeCells(7, 10, 7, 11); worksheet.getCell(7, 10).value = "Note d'observation";
        worksheet.getCell(8, 10).value = "Date Rép.";
        worksheet.getCell(8, 11).value = "Réf Rép.";
        
        worksheet.mergeCells(7, 12, 8, 12); worksheet.getCell(7, 12).value = "Statut";
        worksheet.mergeCells(7, 13, 8, 13); worksheet.getCell(7, 13).value = "Date Visa";
        worksheet.mergeCells(7, 14, 8, 14); worksheet.getCell(7, 14).value = "Date Retour";
        worksheet.mergeCells(7, 15, 8, 15); worksheet.getCell(7, 15).value = "Destinataire";

        for(let c=1; c<=15; c++) {
            applyHeaderStyle(worksheet.getCell(7, c));
            applyHeaderStyle(worksheet.getCell(8, c));
        }

        // 5. Data Rows
        sortedRows.forEach((row, index) => {
            const hasHistory = row.rev.sendHistory && row.rev.sendHistory.length > 0;
            const sends = hasHistory ? row.rev.sendHistory! : [{
                transmittalDate: row.rev.transmittalDate,
                transmittalRef: row.rev.transmittalRef,
                observationDate: row.rev.observationDate,
                observationRef: row.rev.observationRef,
                status: row.rev.status,
                approvalDate: row.rev.approvalDate,
                returnDate: row.rev.returnDate,
                recipientName: (row.rev.recipients && row.rev.recipients.length > 0 ? row.rev.recipients.join(', ') : (row.rev.recipient || ''))
            } as SendRecord];

            const firstRowIdx = worksheet.rowCount + 1;

            sends.forEach((s) => {
                const r = worksheet.addRow([
                    index + 1,
                    row.doc.lot,
                    row.doc.poste,
                    row.doc.classement,
                    row.doc.code,
                    row.rev.index,
                    row.doc.name,
                    s.transmittalDate || '-',
                    s.transmittalRef || '-',
                    s.observationDate || '-',
                    s.observationRef || '-',
                    getStatusText(s.status),
                    s.approvalDate || '-',
                    s.returnDate || '-',
                    s.recipientName || '-'
                ]);

                const isEven = index % 2 === 0;
                r.eachCell((cell, colNumber) => {
                    cell.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };
                    
                    // Alternating background for better readability
                    if (!isEven) {
                        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } }; // Light gray
                    }

                    cell.alignment = { 
                        vertical: 'middle', 
                        horizontal: [1,2,3,4,6,8,9,10,11,12,13,14,15].includes(colNumber) ? 'center' : 'left',
                        wrapText: colNumber === 7 // Only wrap doc name
                    };
                    cell.font = { size: 8 };
                    if (colNumber === 5) cell.font = { bold: true, size: 8 };
                    
                    if (colNumber === 12) {
                        if (s.status === ApprovalStatus.APPROVED) cell.font = { color: { argb: 'FF15803D' }, bold: true, size: 8 };
                        else if (s.status === ApprovalStatus.REJECTED) cell.font = { color: { argb: 'FFB91C1C' }, bold: true, size: 8 };
                    }
                    if (colNumber === 15) {
                        cell.font = { color: { argb: 'FF1E40AF' }, bold: true, size: 8 };
                    }
                });
            });

            // Merge metadata cells if multiple sends
            if (sends.length > 1) {
                const lastRowIdx = worksheet.rowCount;
                for (let col = 1; col <= 7; col++) {
                    worksheet.mergeCells(firstRowIdx, col, lastRowIdx, col);
                }
            }
        });

        // 6. Column Widths (Reduced as requested)
        worksheet.columns = [
            { width: 4 }, { width: 6 }, { width: 6 }, { width: 6 }, { width: 18 }, { width: 6 }, { width: 40 }, 
            { width: 11 }, { width: 11 }, { width: 11 }, { width: 11 }, { width: 14 }, { width: 11 }, { width: 11 }, { width: 13 }
        ];

        // Final Logo adjustment
        if (appSettings.logoMDO) {
            try {
                const response = await fetch(appSettings.logoMDO);
                const buffer2 = await response.arrayBuffer();
                const imageId2 = workbook.addImage({ buffer: buffer2, extension: 'png' });
                worksheet.addImage(imageId2, {
                    tl: { col: 12, row: 0 },
                    ext: { width: 100, height: 70 },
                    editAs: 'oneCell'
                });
            } catch (e) { console.error("Logo MDO reposition error", e); }
        }

        const buffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        saveAs(blob, `Suivi_Documents_${appSettings.projectCode}_${new Date().toISOString().split('T')[0]}.xlsx`);

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

                {canModify && (
                  <button 
                    onClick={handleCreateClick}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 shadow-sm active:scale-95 transition-all text-sm font-medium whitespace-nowrap w-full justify-start"
                  >
                    <Plus size={16} />
                    <span>Nouveau</span>
                  </button>
                )}
            </div>
        </div>
      </div>

      {/* --- TABLE --- */}
      <div className="flex-1 overflow-auto p-4">
        {/* Dynamic Class for PDF Mode: Forces white bg, no border, full visible overflow */}
        <div id="document-table-container" className={`bg-white dark:bg-slate-900 rounded-xl shadow border border-gray-200 dark:border-slate-800 overflow-hidden relative transition-colors ${isExportingPdf ? 'pdf-mode' : ''}`}>
          
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
            <table className="w-full text-[11px] text-left border-collapse">
              <thead className="bg-slate-800 dark:bg-slate-950 text-white text-[9px] uppercase sticky top-0 z-10 transition-colors">
                <tr>
                  <th className="px-2 py-2 border border-slate-600 font-bold text-center w-10 align-middle" rowSpan={2}>N°</th>
                  <SortHeader label="Lot" sortKey="lot" className="w-12 text-center" rowSpan={2} />
                  <SortHeader label="Poste" sortKey="poste" className="w-12 text-center" rowSpan={2} />
                  <SortHeader label="Type" sortKey="classement" className="w-12 text-center" rowSpan={2} />
                  <SortHeader label="CODE" sortKey="code" className="w-32 text-center" rowSpan={2} />
                  <SortHeader label="Indice" sortKey="index" className="w-12 text-center" rowSpan={2} />
                  <SortHeader label="Désignation Document" sortKey="name" className="min-w-[200px]" rowSpan={2} />
                  
                  {/* Dynamic ColSpan for PDF Export */}
                  <th id="th-transmis" colSpan={isExportingPdf ? 2 : 3} className="px-2 py-1 border border-slate-600 text-center bg-slate-900 dark:bg-slate-800 font-bold align-middle transition-colors">Transmis par SBF</th>
                  <th id="th-visa" colSpan={isExportingPdf ? 2 : 3} className="px-2 py-1 border border-slate-600 text-center bg-slate-900 dark:bg-slate-800 font-bold align-middle transition-colors">Note d'Obser</th>
                  
                  <SortHeader label="Statut" sortKey="status" className="w-32 text-center" rowSpan={2} />
                  <th className="px-2 py-2 border border-slate-600 text-center font-bold align-middle w-24" rowSpan={2}>Destinataire</th>
                  <SortHeader label="Envoi App." sortKey="approvedSendDate" className="w-24 text-center" rowSpan={2} />
                  <SortHeader label="Ret. App." sortKey="approvedReturnDate" className="w-24 text-center" rowSpan={2} />
                  {/* Hide Actions Column in PDF and for Viewers */}
                  {!isExportingPdf && canModify && <th className="px-2 py-2 border border-slate-600 text-center font-bold align-middle no-print" rowSpan={2}>Actions</th>}
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
                    <td colSpan={16} className="p-8 text-center text-gray-500">
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
                      <td className="px-1.5 py-1 border border-gray-300 dark:border-slate-700 text-center font-medium text-gray-400 align-middle text-[10px]">{idx + 1}</td>
                      <td className="px-1.5 py-1 border border-gray-300 dark:border-slate-700 font-bold text-center align-middle dark:text-slate-300">{doc.lot}</td>
                      <td className="px-1.5 py-1 border border-gray-300 dark:border-slate-700 text-center align-middle dark:text-slate-400 uppercase italic text-[10px]">{doc.poste}</td>
                      <td className="px-1.5 py-1 border border-gray-300 dark:border-slate-700 text-center align-middle dark:text-slate-400">{doc.classement}</td>
                      <td className="px-1.5 py-1 border border-gray-300 dark:border-slate-700 font-mono font-bold text-blue-900 dark:text-blue-400 text-center align-middle whitespace-nowrap text-[11px]">{doc.code}</td>
                      <td className="px-1.5 py-1 border border-gray-300 dark:border-slate-700 text-center font-black align-middle text-indigo-600 dark:text-indigo-400">{rev.index}</td>
                      <td className="px-1.5 py-1 border border-gray-300 dark:border-slate-700 max-w-[250px] align-middle dark:text-slate-200 leading-tight" title={doc.name}>
                          <div className="line-clamp-2">{doc.name}</div>
                      </td>
                      
                      {/* Transmittal */}
                      <td className="px-2 py-3 text-center border border-gray-300 align-middle whitespace-nowrap">
                          {rev.sendHistory && rev.sendHistory.length > 0 ? (
                              <div className="flex flex-col gap-2">
                                  {rev.sendHistory.map((s, i) => <div key={i} className="h-[24px] flex items-center justify-center">{s.transmittalDate || '-'}</div>)}
                              </div>
                          ) : ( rev.transmittalDate )}
                      </td>
                      <td className="px-2 py-3 text-center border border-gray-300 text-xs align-middle whitespace-nowrap">
                          {rev.sendHistory && rev.sendHistory.length > 0 ? (
                              <div className="flex flex-col gap-2">
                                  {rev.sendHistory.map((s, i) => <div key={i} className="h-[24px] flex items-center justify-center font-mono">{s.transmittalRef || '-'}</div>)}
                              </div>
                          ) : ( rev.transmittalRef )}
                      </td>
                      
                      {!isExportingPdf && (
                        <td className="px-2 py-3 text-center border border-gray-300 align-middle no-print">
                            {rev.sendHistory && rev.sendHistory.length > 0 ? (
                                <div className="flex flex-col gap-2 scale-90">
                                    {rev.sendHistory.map((s, i) => {
                                        const sFiles = s.transmittalFiles || [];
                                        return (
                                            <div key={i} className="h-[24px] flex items-center justify-center">
                                                {sFiles.length > 0 ? (
                                                    <button onClick={() => openFile(sFiles[0])} className="text-blue-600 hover:text-blue-800 relative inline-flex justify-center items-center">
                                                        <FileText size={14} />
                                                        {sFiles.length > 1 && <span className="absolute -top-2 -right-2 bg-blue-600 text-white text-[7px] w-2.5 h-2.5 rounded-full flex items-center justify-center">{sFiles.length}</span>}
                                                    </button>
                                                ) : (
                                                    isLatest && canModify && <button onClick={() => triggerFileUpload(doc.id, rev.id, 'transmittal', s.id)} className="text-gray-300 hover:text-blue-500 inline-flex justify-center items-center"><UploadCloud size={14}/></button>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                tFiles.length > 0 ? (
                                    <button onClick={() => openFile(tFiles[0])} className="text-blue-600 hover:text-blue-800 relative inline-flex justify-center items-center">
                                        <FileText size={16} />
                                        {tFiles.length > 1 && <span className="absolute -top-2 -right-2 bg-blue-600 text-white text-[8px] w-3 h-3 rounded-full flex items-center justify-center">{tFiles.length}</span>}
                                    </button>
                                ) : (
                                    isLatest && canModify && <button onClick={() => triggerFileUpload(doc.id, rev.id, 'transmittal')} className="text-gray-300 hover:text-blue-500 inline-flex justify-center items-center"><UploadCloud size={16}/></button>
                                )
                            )}
                        </td>
                      )}

                      {/* Observation */}
                      <td className="px-2 py-3 text-center border border-gray-300 align-middle whitespace-nowrap">
                          {rev.sendHistory && rev.sendHistory.length > 0 ? (
                              <div className="flex flex-col gap-2">
                                  {rev.sendHistory.map((s, i) => <div key={i} className="h-[24px] flex items-center justify-center">{s.observationDate || '-'}</div>)}
                              </div>
                          ) : ( rev.observationDate || '-' )}
                      </td>
                      <td className="px-2 py-3 text-center border border-gray-300 text-xs align-middle whitespace-nowrap">
                          {rev.sendHistory && rev.sendHistory.length > 0 ? (
                              <div className="flex flex-col gap-2">
                                  {rev.sendHistory.map((s, i) => <div key={i} className="h-[24px] flex items-center justify-center font-mono">{s.observationRef || '-'}</div>)}
                              </div>
                          ) : ( rev.observationRef || '-' )}
                      </td>
                      
                      {!isExportingPdf && (
                        <td className="px-2 py-3 text-center border border-gray-300 align-middle no-print">
                            {rev.sendHistory && rev.sendHistory.length > 0 ? (
                                <div className="flex flex-col gap-2 scale-90">
                                    {rev.sendHistory.map((s, i) => {
                                        const sFiles = s.observationFiles || [];
                                        return (
                                            <div key={i} className="h-[24px] flex items-center justify-center">
                                                {sFiles.length > 0 ? (
                                                    <button onClick={() => openFile(sFiles[0])} className="text-amber-600 hover:text-amber-800 relative inline-flex justify-center items-center">
                                                        <FileText size={14} />
                                                        {sFiles.length > 1 && <span className="absolute -top-2 -right-2 bg-amber-600 text-white text-[7px] w-2.5 h-2.5 rounded-full flex items-center justify-center">{sFiles.length}</span>}
                                                    </button>
                                                ) : (
                                                    isLatest && canModify && <button onClick={() => triggerFileUpload(doc.id, rev.id, 'observation', s.id)} className="text-gray-300 hover:text-amber-500 inline-flex justify-center items-center"><UploadCloud size={14}/></button>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                oFiles.length > 0 ? (
                                    <button onClick={() => openFile(oFiles[0])} className="text-amber-600 hover:text-amber-800 relative inline-flex justify-center items-center">
                                        <FileText size={16} />
                                        {oFiles.length > 1 && <span className="absolute -top-2 -right-2 bg-amber-600 text-white text-[8px] w-3 h-3 rounded-full flex items-center justify-center">{oFiles.length}</span>}
                                    </button>
                                ) : (
                                    isLatest && canModify && <button onClick={() => triggerFileUpload(doc.id, rev.id, 'observation')} className="text-gray-300 hover:text-amber-500 inline-flex justify-center items-center"><UploadCloud size={16}/></button>
                                )
                            )}
                        </td>
                      )}
                      
                      {/* Status */}
                      <td className="px-2 py-3 text-center border border-gray-300 align-middle">
                          {rev.sendHistory && rev.sendHistory.length > 0 ? (
                              <div className="flex flex-col gap-2 items-center">
                                  {rev.sendHistory.map((s, i) => (
                                      <span key={i} className={`h-[24px] px-2 py-0.5 rounded-full text-[9px] font-bold uppercase inline-flex items-center justify-center gap-1 border min-w-[110px] ${
                                          s.status === ApprovalStatus.APPROVED ? 'bg-green-100 text-green-700 border-green-200' :
                                          s.status === ApprovalStatus.APPROVED_WITH_COMMENTS ? 'bg-green-50 text-green-600 border-green-200' :
                                          s.status === ApprovalStatus.REJECTED ? 'bg-red-100 text-red-700 border-red-200' :
                                          s.status === ApprovalStatus.NO_RESPONSE ? 'bg-orange-100 text-orange-700 border-orange-200' :
                                          'bg-blue-50 text-blue-600 border-blue-200'
                                      }`}>
                                          {s.status === ApprovalStatus.NO_RESPONSE && <AlertTriangle size={10} />}
                                          {
                                              s.status === ApprovalStatus.APPROVED ? "Approuvé" :
                                              s.status === ApprovalStatus.REJECTED ? "Non Approuvé" :
                                              s.status === ApprovalStatus.NO_RESPONSE ? "Sans réponse" :
                                              s.status === ApprovalStatus.PENDING ? "En cours de révision" :
                                              s.status === ApprovalStatus.APPROVED_WITH_COMMENTS ? "Approuvé (R)" :
                                              s.status
                                          }
                                      </span>
                                  ))}
                              </div>
                          ) : (
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
                          )}
                      </td>

                      {/* Destinataire */}
                      <td className="px-2 py-3 text-center border border-gray-300 align-middle">
                          {rev.sendHistory && rev.sendHistory.length > 0 ? (
                              <div className="flex flex-col gap-2 items-center justify-center">
                                  {rev.sendHistory.map((s, i) => (
                                      <div key={i} className="h-[24px] flex items-center justify-center w-full">
                                          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-indigo-100 text-indigo-800 border border-indigo-200 whitespace-nowrap">
                                              {s.recipientName || 'Néant'}
                                          </span>
                                      </div>
                                  ))}
                              </div>
                          ) : (
                              // Legacy
                              (() => {
                                  const allRecipients: string[] = rev.recipients && rev.recipients.length > 0
                                      ? rev.recipients
                                      : rev.recipient
                                          ? [rev.recipient]
                                          : [];
                                  if (allRecipients.length === 0) return <span className="text-gray-300 text-xs">—</span>;
                                  return (
                                      <div className="flex flex-wrap gap-1 justify-center">
                                          {allRecipients.map((r, i) => (
                                              <span key={i} className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-indigo-100 text-indigo-800 border border-indigo-200 whitespace-nowrap">
                                                  {r}
                                              </span>
                                          ))}
                                      </div>
                                  );
                              })()
                          )}
                      </td>
                      <td className="px-1.5 py-1 border border-gray-300 dark:border-slate-700 text-center align-middle bg-slate-50/10 font-bold text-blue-700 dark:text-blue-400 w-24">
                          {rev.approvedSendDate ? new Date(rev.approvedSendDate).toLocaleDateString('fr-FR') : '-'}
                      </td>
                      <td className="px-1.5 py-1 border border-gray-300 dark:border-slate-700 text-center align-middle bg-slate-50/10 font-bold text-green-700 dark:text-green-400 w-24">
                          {rev.approvedReturnDate ? new Date(rev.approvedReturnDate).toLocaleDateString('fr-FR') : '-'}
                      </td>

                      {/* Actions */}
                      {!isExportingPdf && (
                        <td className="px-2 py-3 text-center border border-gray-300 align-middle no-print min-w-[120px]">
                            {rev.sendHistory && rev.sendHistory.length > 0 ? (
                                <div className="flex flex-col gap-2">
                                    {rev.sendHistory.map((s, sIdx) => (
                                        <div key={sIdx} className="h-[24px] flex items-center justify-center gap-1 opacity-100 sm:opacity-0 group-hover:opacity-100 transition-opacity">
                                            {canModify && (
                                                <button 
                                                    onClick={() => openEditSendModal(doc.id, doc.revisions.indexOf(rev), sIdx)}
                                                    className="p-1 text-blue-500 hover:bg-blue-50 rounded"
                                                    title="Modifier cet envoi"
                                                >
                                                    <Edit2 size={12} />
                                                </button>
                                            )}
                                            <button 
                                                onClick={() => openReminderModal(doc.id, rev.id, rev.reminder)}
                                                className={`p-1 rounded ${rev.reminder?.active ? 'text-amber-600 bg-amber-50' : 'text-gray-400 hover:bg-gray-50'}`}
                                                title="Rappel"
                                            >
                                                <Bell size={12} />
                                            </button>
                                            {canDelete && (
                                                <button 
                                                    onClick={() => deleteSendRecord(doc.id, doc.revisions.indexOf(rev), sIdx)}
                                                    className="p-1 text-red-400 hover:bg-red-50 rounded"
                                                    title="Supprimer cet envoi"
                                                >
                                                    <Trash2 size={12} />
                                                </button>
                                            )}
                                        </div>
                                    ))}
                                    {isLatest && canModify && (
                                        <button 
                                            onClick={() => onAddToBordereau(doc.id)}
                                            className="mt-1 text-[10px] font-bold text-purple-600 hover:underline flex items-center justify-center gap-1"
                                        >
                                            <Send size={10} /> Nouvel Envoi
                                        </button>
                                    )}
                                </div>
                            ) : (
                                canModify && (
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

                                        {isLatest && (
                                            <button 
                                                onClick={() => onAddToBordereau(doc.id)}
                                                className="p-1.5 text-purple-600 hover:bg-purple-100 rounded"
                                                title="Ajouter au Bordereau"
                                            >
                                                <Send size={14} />
                                            </button>
                                        )}
                                        
                                        {isLatest && canDelete && (
                                            <button 
                                                onClick={(e) => handleDeleteClick(doc.id, e)} 
                                                className="p-1.5 text-red-600 hover:bg-red-100 rounded"
                                                title="Supprimer"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        )}
                                    </div>
                                )
                            )}
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
          <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm transition-all animate-in fade-in duration-200">
              <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto border border-gray-100 dark:border-slate-800 transition-colors">
                  <div className="p-6 border-b border-gray-200 dark:border-slate-800 flex justify-between items-center bg-gray-50 dark:bg-slate-800/50 transition-colors">
                      <h3 className="text-xl font-bold text-gray-800 dark:text-white flex items-center gap-2">
                          {editingDocId ? <Edit2 size={20} className="text-blue-600 dark:text-blue-400" /> : <Plus size={20} className="text-blue-600 dark:text-blue-400" />}
                          {editingDocId ? 'Modifier le Document' : 'Nouveau Document'}
                      </h3>
                      <button onClick={closeAllModals} className="text-gray-500 hover:text-red-500 transition-colors p-1 rounded-full hover:bg-red-50 dark:hover:bg-red-900/20">
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
                              <div className="grid grid-cols-2 gap-4 mt-2">
                                  <div>
                                      <label className="block text-[10px] font-bold text-blue-600 uppercase mb-1">Date d'envoi Approbation</label>
                                      <input type="date" value={newApprovedSendDate} onChange={e => setNewApprovedSendDate(e.target.value)} className="w-full p-2 border border-blue-100 rounded focus:ring-2 focus:ring-blue-500 outline-none bg-blue-50/30 text-xs" />
                                  </div>
                                  <div>
                                      <label className="block text-[10px] font-bold text-green-600 uppercase mb-1">Date de retour Approbation</label>
                                      <input type="date" value={newApprovedReturnDate} onChange={e => setNewApprovedReturnDate(e.target.value)} className="w-full p-2 border border-green-100 rounded focus:ring-2 focus:ring-green-500 outline-none bg-green-50/30 text-xs" />
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
        .pdf-mode #pdf-export-header { display: flex !important; visibility: visible !important; }
        .pdf-mode .pdf-spacer { display: block !important; }
        .pdf-mode { 
            padding: 20px !important;
            background: white !important;
            color: black !important;
            min-width: 1400px !important;
            overflow: visible !important;
        }
        .pdf-mode * {
            color: black !important;
            background-color: transparent !important;
        }
        .pdf-mode #pdf-export-header, .pdf-mode #pdf-export-header * {
            background-color: white !important;
        }
        .pdf-mode table {
             width: 100% !important;
             border-collapse: collapse !important;
        }
        .pdf-mode th, .pdf-mode td {
             border: 1px solid #334155 !important;
             background: white !important;
        }
      `}</style>
      {/* Edit Send Record Modal */}
      {editSendModal && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
              <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200 border border-gray-100">
                  <div className="bg-gradient-to-r from-blue-600 to-indigo-700 p-4 flex justify-between items-center">
                      <h3 className="text-white font-bold flex items-center gap-2">
                          <Edit2 size={18} /> Modifier l'envoi
                      </h3>
                      <button onClick={() => setEditSendModal(null)} className="text-white/80 hover:text-white transition-colors">
                          <X size={20} />
                      </button>
                  </div>
                  
                  <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
                      <div className="grid grid-cols-1 gap-4">
                          <div>
                              <label className="block text-[10px] font-bold uppercase text-gray-500 mb-1">Destinataire</label>
                              <input 
                                  type="text" 
                                  value={editSendForm.recipientName || ''} 
                                  onChange={e => setEditSendForm({...editSendForm, recipientName: e.target.value})}
                                  className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-medium transition-all" 
                              />
                          </div>
                          
                          <div className="grid grid-cols-2 gap-3">
                              <div>
                                  <label className="block text-[10px] font-bold uppercase text-gray-500 mb-1">Réf. Envoi</label>
                                  <input 
                                      type="text" 
                                      value={editSendForm.transmittalRef || ''} 
                                      onChange={e => setEditSendForm({...editSendForm, transmittalRef: e.target.value})}
                                      className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-medium" 
                                  />
                              </div>
                              <div>
                                  <label className="block text-[10px] font-bold uppercase text-gray-500 mb-1">Date Envoi</label>
                                  <input 
                                      type="date" 
                                      value={editSendForm.transmittalDate || ''} 
                                      onChange={e => setEditSendForm({...editSendForm, transmittalDate: e.target.value})}
                                      className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-medium" 
                                  />
                              </div>
                          </div>

                          <div className="grid grid-cols-2 gap-3">
                              <div>
                                  <label className="block text-[10px] font-bold uppercase text-gray-500 mb-1">Réf. Réponse</label>
                                  <input 
                                      type="text" 
                                      value={editSendForm.observationRef || ''} 
                                      onChange={e => setEditSendForm({...editSendForm, observationRef: e.target.value})}
                                      className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-medium" 
                                  />
                              </div>
                              <div>
                                  <label className="block text-[10px] font-bold uppercase text-gray-500 mb-1">Date Réponse</label>
                                  <input 
                                      type="date" 
                                      value={editSendForm.observationDate || ''} 
                                      onChange={e => setEditSendForm({...editSendForm, observationDate: e.target.value})}
                                      className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-medium" 
                                  />
                              </div>
                          </div>

                          <div>
                              <label className="block text-[10px] font-bold uppercase text-gray-500 mb-1">Statut Approbation</label>
                              <select 
                                  value={editSendForm.status}
                                  onChange={e => setEditSendForm({...editSendForm, status: e.target.value as ApprovalStatus})}
                                  className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-bold"
                              >
                                  <option value={ApprovalStatus.PENDING}>EN COURS</option>
                                  <option value={ApprovalStatus.APPROVED}>APPROUVÉ</option>
                                  <option value={ApprovalStatus.APPROVED_WITH_COMMENTS}>APPROUVÉ (R)</option>
                                  <option value={ApprovalStatus.REJECTED}>NON APPROUVÉ</option>
                                  <option value={ApprovalStatus.NO_RESPONSE}>SANS RÉPONSE</option>
                              </select>
                          </div>
                      </div>
                  </div>
                  
                  <div className="p-4 bg-gray-50 border-t border-gray-100 flex gap-2">
                      <button 
                        onClick={() => setEditSendModal(null)}
                        className="flex-1 py-2.5 text-sm font-bold text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-100 transition-all"
                      >
                          Annuler
                      </button>
                      <button 
                        onClick={updateSendRecord}
                        className="flex-1 py-2.5 text-sm font-bold text-white bg-blue-600 rounded-xl hover:bg-blue-700 shadow-lg shadow-blue-200 transition-all flex items-center justify-center gap-2"
                      >
                          <Save size={16} /> Enregistrer
                      </button>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};