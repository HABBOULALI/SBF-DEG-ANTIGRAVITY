import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Plus, Filter, Download, Clock, Edit2, Edit3, Save, X, Loader2, FileSpreadsheet, ChevronUp, ChevronDown, ArrowUpDown, Bell, BellRing, Calendar, Send, Trash2, Trash, AlertTriangle, UploadCloud, FileText, Search, Mic, MicOff, Paperclip, File as FileIcon } from 'lucide-react';
import { BTPDocument, ApprovalStatus, Revision, SendRecord } from '../types';
import { Logo } from './Logo';
import { useAuth } from '../context/AuthContext';
import * as XLSX from 'xlsx';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { storageService } from '../services/storageService';

interface DocumentListProps {
  documents: BTPDocument[];
  onAddDocument: (doc: BTPDocument) => void;
  onUpdateDocument: (doc: BTPDocument) => void;
  onDeleteDocument: (id: string) => void;
  onNavigateToBordereau?: () => void;
  onAddToBordereau: (docId: string) => void;
  initialFilter?: ApprovalStatus | 'ALL';
}

type SortKey = 'lot' | 'classement' | 'poste' | 'name' | 'code' | 'index' | 'transmittalDate' | 'transmittalRef' | 'observationDate' | 'observationRef' | 'status' | 'approvalDate' | 'returnDate' | 'approvedSendDate' | 'approvedSendRef' | 'approvedReturnDate';

// Helper type for flattened rows
interface FlatRow {
    doc: BTPDocument;
    rev: Revision;
    isLatest: boolean;
}

type AttachmentType = 'transmittal' | 'observation' | 'approval';

interface UploadTarget {
    docId: string;
    revId: string;
    type: AttachmentType;
    sendId?: string;
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

// Helper to get effective status from a revision (considering sendHistory)
const getEffectiveStatus = (rev: Revision): ApprovalStatus => {
    if (rev.sendHistory && rev.sendHistory.length > 0) {
        return rev.sendHistory[rev.sendHistory.length - 1].status;
    }
    return rev.status;
};

export const DocumentList: React.FC<DocumentListProps> = ({ documents, onAddDocument, onUpdateDocument, onDeleteDocument, onNavigateToBordereau, onAddToBordereau, initialFilter }) => {
  const { user } = useAuth();
  const isViewer = user?.role === 'viewer';
  const isEditor = user?.role === 'editor';
  const isAdmin = user?.role === 'admin';
  const canModify = isAdmin || isEditor;
  const canDelete = isAdmin;

  const [filter, setFilter] = useState<string>(initialFilter || 'ALL');
  const [natureFilter, setNatureFilter] = useState<string>('ALL');
  const [recipientFilter, setRecipientFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState(''); // State pour la recherche textuelle
  const [isListening, setIsListening] = useState(false); // State pour le micro

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  
  // File Upload State
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadTarget, setUploadTarget] = useState<UploadTarget | null>(null);
  const [isUploadingFile, setIsUploadingFile] = useState(false);

  // Edit Send Modal State
  const [editSendModal, setEditSendModal] = useState<{docId: string, revIdx: number, sendIdx: number | null} | null>(null);
  const [editSendForm, setEditSendForm] = useState<Partial<SendRecord>>({});

  // Confirmation Modals State
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  // attachmentToDelete is now object to track index
  const [attachmentToDelete, setAttachmentToDelete] = useState<{ type: 'transmittal' | 'observation' | 'approval', index: number } | null>(null);
  
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
    logoMDO: '',
    documentNatures: ['Plans', 'Notes de calcul', 'Fiches Techniques', 'Documents Administratifs']
  });

  const loadSettings = () => {
    const saved = localStorage.getItem('btp-app-settings');
    if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && !parsed.documentNatures && parsed.documentTypes) {
            parsed.documentNatures = parsed.documentTypes;
        }
        if (parsed && !parsed.documentNatures) {
            parsed.documentNatures = ['Plans', 'Notes de calcul', 'Fiches Techniques', 'Documents Administratifs'];
        }
        setAppSettings(prev => {
            const newSettings = { ...prev, ...parsed };
            return newSettings;
        });
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
  const [newNature, setNewNature] = useState('');
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
  const [newApprovedSendRef, setNewApprovedSendRef] = useState('');
  const [newApprovedSendFiles, setNewApprovedSendFiles] = useState<string[]>([]);
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

  const uniqueRecipients = useMemo(() => {
    const recipients = new Set<string>();
    documents.forEach(doc => {
        doc.revisions.forEach(rev => {
            if (rev.sendHistory) {
                rev.sendHistory.forEach(s => {
                    if (s.recipientName) recipients.add(s.recipientName.trim());
                });
            }
            if (rev.recipient) recipients.add(rev.recipient.trim());
            if (rev.recipients) {
                rev.recipients.forEach(r => { if(r) recipients.add(r.trim()); });
            }
        });
    });
    return Array.from(recipients).filter(Boolean).sort();
  }, [documents]);

  // 2. FILTRER (Status + Recherche Texte + Nature)
  const filteredRows = useMemo(() => {
    return allRows.filter(({ rev, doc, isLatest }) => {
        // Filtre Statut - synchronisé avec la dernière révision
        let matchStatus = true;
        if (filter !== 'ALL') {
            // Pour le suivi par statut, on ne s'intéresse qu'à la révision la plus récente
            if (!isLatest) return false;

            // Utiliser le statut effectif (dernier envoi de sendHistory si existe)
            const effectiveStatus = getEffectiveStatus(rev);

            if (filter === 'APPROVED_GROUP') {
                matchStatus = effectiveStatus === ApprovalStatus.APPROVED || effectiveStatus === ApprovalStatus.APPROVED_WITH_COMMENTS;
            } else if (filter === 'REJECTED') {
                matchStatus = effectiveStatus === ApprovalStatus.REJECTED;
            } else if (filter === 'PENDING') {
                matchStatus = effectiveStatus === ApprovalStatus.PENDING;
            } else if (filter === 'NO_RESPONSE') {
                matchStatus = effectiveStatus === ApprovalStatus.NO_RESPONSE;
            } else {
                matchStatus = effectiveStatus === filter;
            }
        }
        
        // Filtre Nature
        const matchNature = natureFilter === 'ALL' || doc.nature === natureFilter;

        // Filtre Destinataire
        const rowRecipients = new Set<string>();
        if (rev.sendHistory) rev.sendHistory.forEach(s => { if (s.recipientName) rowRecipients.add(s.recipientName.trim()); });
        if (rev.recipient) rowRecipients.add(rev.recipient.trim());
        if (rev.recipients) rev.recipients.forEach(r => { if(r) rowRecipients.add(r.trim()); });

        let matchRecipient = true;
        if (recipientFilter !== 'ALL') {
            matchRecipient = rowRecipients.has(recipientFilter.trim());
        }
        
        // Filtre Recherche (Code, Nom, Lot, Poste, Destinataire)
        const lowerQuery = searchQuery.toLowerCase();
        const recipientListStr = Array.from(rowRecipients).join(' ').toLowerCase();
        const matchSearch = !searchQuery || 
            doc.code.toLowerCase().includes(lowerQuery) ||
            doc.name.toLowerCase().includes(lowerQuery) ||
            doc.lot.toLowerCase().includes(lowerQuery) ||
            doc.poste.toLowerCase().includes(lowerQuery) ||
            recipientListStr.includes(lowerQuery);

        return matchStatus && matchNature && matchRecipient && matchSearch;
    });
  }, [allRows, filter, natureFilter, recipientFilter, searchQuery]);

  // 3. TRIER (SORT)
  const sortedRows = useMemo(() => {
    let sortableItems = [...filteredRows];
    // Primary Sorting for Grouping: NATURE
    sortableItems.sort((a, b) => {
        const natA = a.doc.nature || 'Non classé';
        const natB = b.doc.nature || 'Non classé';
        if (natA < natB) return -1;
        if (natA > natB) return 1;

        // Within group, follow secondary sort
        if (sortConfig === null) {
            if (a.doc.code < b.doc.code) return -1;
            if (a.doc.code > b.doc.code) return 1;
            if (a.rev.index < b.rev.index) return -1;
            if (a.rev.index > b.rev.index) return 1;
            return 0;
        }

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

        if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
        if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
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
            className={`px-1 py-1 border border-slate-600 font-bold text-[8px] uppercase tracking-wider cursor-pointer hover:bg-slate-700 transition-colors select-none group align-middle ${className}`}
            onClick={() => requestSort(sortKey)}
            rowSpan={rowSpan}
        >
            <div className={`flex items-center gap-0.5 ${className?.includes('text-center') ? 'justify-center' : ''}`}>
                {label}
                <div className="flex flex-col text-slate-400 group-hover:text-white">
                    {isActive ? (
                        sortConfig.direction === 'asc' ? <ChevronUp size={10} className="text-blue-400" /> : <ChevronDown size={10} className="text-blue-400" />
                    ) : (
                        <ArrowUpDown size={10} className="opacity-0 group-hover:opacity-50" />
                    )}
                </div>
            </div>
        </th>
    );
  };

  // --- STATUS COUNTS (synchronisé avec le statut effectif et les filtres) ---
  const statusCounts = useMemo(() => {
    const counts = { all: 0, approved: 0, rejected: 0, noResponse: 0, pending: 0 };
    documents.forEach(doc => {
      // Appliquer les filtres de document (Nature)
      if (natureFilter !== 'ALL' && doc.nature !== natureFilter) return;

      const latestRev = doc.revisions[doc.revisions.length - 1];
      if (!latestRev) return;

      // Appliquer le filtre destinataire sur la dernière révision
      if (recipientFilter !== 'ALL') {
         const rowRecipients = new Set<string>();
         if (latestRev.sendHistory) latestRev.sendHistory.forEach(s => { if (s.recipientName) rowRecipients.add(s.recipientName.trim()); });
         if (latestRev.recipient) rowRecipients.add(latestRev.recipient.trim());
         if (latestRev.recipients) latestRev.recipients.forEach(r => { if(r) rowRecipients.add(r.trim()); });
         if (!rowRecipients.has(recipientFilter.trim())) return;
      }

      const effectiveStatus = getEffectiveStatus(latestRev);
      counts.all++;
      if (effectiveStatus === ApprovalStatus.APPROVED || effectiveStatus === ApprovalStatus.APPROVED_WITH_COMMENTS) counts.approved++;
      else if (effectiveStatus === ApprovalStatus.REJECTED) counts.rejected++;
      else if (effectiveStatus === ApprovalStatus.NO_RESPONSE) counts.noResponse++;
      else if (effectiveStatus === ApprovalStatus.PENDING) counts.pending++;
    });
    return counts;
  }, [documents, natureFilter, recipientFilter]);

  // ... (Reset Form, etc.)
  const resetForm = () => {
    setEditingDocId(null);
    setEditingRevId(null);
    setNewCode('');
    setNewName('');
    setNewIndex('00');
    setNewLot('01');
    
    // Smart default for Nature
    if (natureFilter !== 'ALL') {
        setNewNature(natureFilter);
    } else if (appSettings.documentNatures && appSettings.documentNatures.length > 0) {
        setNewNature(appSettings.documentNatures[0]);
    } else {
        setNewNature('Plans');
    }

    setNewCl('A');

    setNewPoste('GC');
    setNewTransmittalDate(new Date().toISOString().slice(0, 10));
    setNewTransmittalRef('');
    setNewTransmittalFiles([]);
    setNewObservationDate('');
    setNewObservationRef('');
    setNewObservationFiles([]);
    setNewStatus(ApprovalStatus.NO_RESPONSE);
    setNewApprovedSendDate('');
    setNewApprovedSendRef('');
    setNewApprovedSendFiles([]);
    setNewApprovedReturnDate('');
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
      setNewNature(doc.nature || '');
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
      setNewApprovedSendRef(rev.approvedSendRef || '');
      setNewApprovedSendFiles(rev.approvedSendFiles || []);
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

  const getAttachmentFolderName = (type: AttachmentType) => {
      switch (type) {
          case 'transmittal': return "Bordereaux d'Envoi";
          case 'observation': return "Notes d'Observation";
          case 'approval': return "Envois Approuvés";
          default: return 'Autres';
      }
  };

  const buildAttachmentBasePath = (type: AttachmentType) => {
      return storageService.buildPath(getAttachmentFolderName(type));
  };

  const persistAttachmentList = async (
      files: string[],
      doc: BTPDocument,
      rev: Revision,
      type: AttachmentType
  ) => {
      const basePath = buildAttachmentBasePath(type);
      const persistedFiles: string[] = [];

      for (const [idx, fileEntry] of files.entries()) {
          if (!fileEntry) continue;

          if (storageService.isRemoteFileUrl(fileEntry)) {
              persistedFiles.push(fileEntry);
              continue;
          }

          if (!storageService.isDataUrl(fileEntry)) {
              continue;
          }

          // Filename: [DOC_CODE]_Indice_[XX]_[Counter]
          const filePrefix = `${doc.code}_Indice_${rev.index}_${idx + 1}`;

          const uploadResult = await storageService.uploadDataUrl(
              basePath,
              fileEntry,
              filePrefix
          );
          persistedFiles.push(uploadResult.downloadURL);
      }

      return persistedFiles;
  };

  const confirmAttachmentDelete = () => {
      if (!attachmentToDelete) return;

      const deleteFileIcon = (prev: string[]) => {
          const target = prev[attachmentToDelete.index];
          if (target && storageService.isRemoteFileUrl(target)) {
              void storageService.deleteByUrl(target);
          }
          const newList = prev.filter((_, i) => i !== attachmentToDelete.index);
          
          // Force immediate update to Firestore if editing
          if (editingDocId) {
              const doc = documents.find(d => d.id === editingDocId);
              if (doc) {
                  const updatedDoc = JSON.parse(JSON.stringify(doc)) as BTPDocument;
                  const revIdx = updatedDoc.revisions.findIndex(r => r.id === editingRevId);
                  if (revIdx !== -1) {
                      const rev = updatedDoc.revisions[revIdx];
                      if (attachmentToDelete.type === 'transmittal') rev.transmittalFiles = newList;
                      else if (attachmentToDelete.type === 'observation') rev.observationFiles = newList;
                      else if (attachmentToDelete.type === 'approval') rev.approvedSendFiles = newList;
                      onUpdateDocument(updatedDoc);
                  }
              }
          }
          return newList;
      };

      if (attachmentToDelete.type === 'transmittal') {
          setNewTransmittalFiles(prev => deleteFileIcon(prev));
      } else if (attachmentToDelete.type === 'observation') {
          setNewObservationFiles(prev => deleteFileIcon(prev));
      } else if (attachmentToDelete.type === 'approval') {
          setNewApprovedSendFiles(prev => deleteFileIcon(prev));
      }
      setAttachmentToDelete(null);
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    let docToSave: BTPDocument | null = null;

    try {
        setIsUploadingFile(true);

        if (editingDocId && editingRevId) {
            const docToUpdate = documents.find(d => d.id === editingDocId);
            if (!docToUpdate) return;

            const updatedDoc: BTPDocument = { ...docToUpdate };
            updatedDoc.lot = newLot;
            updatedDoc.classement = newCl;
            updatedDoc.nature = newNature;
            updatedDoc.poste = newPoste;
            updatedDoc.code = newCode;
            updatedDoc.name = newName;

            let updatedRevs = [...updatedDoc.revisions];
            const targetRevIdx = updatedRevs.findIndex(r => r.id === editingRevId);
            if (targetRevIdx === -1) return;

            const persistedTransmittalFiles = await persistAttachmentList(newTransmittalFiles, updatedDoc, updatedRevs[targetRevIdx], 'transmittal');
            const persistedObservationFiles = await persistAttachmentList(newObservationFiles, updatedDoc, updatedRevs[targetRevIdx], 'observation');
            const persistedApprovalFiles = await persistAttachmentList(newApprovedSendFiles, updatedDoc, updatedRevs[targetRevIdx], 'approval');

            updatedRevs[targetRevIdx] = {
                ...updatedRevs[targetRevIdx],
                index: newIndex,
                transmittalDate: newTransmittalDate,
                transmittalRef: newTransmittalRef,
                transmittalFiles: persistedTransmittalFiles,
                observationDate: newObservationDate,
                observationRef: newObservationRef,
                observationFiles: persistedObservationFiles,
                approvedSendDate: newApprovedSendDate,
                approvedSendRef: newApprovedSendRef,
                approvedSendFiles: persistedApprovalFiles,
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
            } else if (newStatus === ApprovalStatus.REJECTED) {
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
            const docId = crypto.randomUUID();
            const revId = crypto.randomUUID();
            const finalRef = newTransmittalRef || `B-${String(documents.length + 1).padStart(3, '0')}`;

            const tempDoc = { nature: newNature, code: newCode } as BTPDocument;
            const tempRev = { index: newIndex } as Revision;

            const persistedTransmittalFiles = await persistAttachmentList(newTransmittalFiles, tempDoc, tempRev, 'transmittal');
            const persistedObservationFiles = await persistAttachmentList(newObservationFiles, tempDoc, tempRev, 'observation');
            const persistedApprovalFiles = await persistAttachmentList(newApprovedSendFiles, tempDoc, tempRev, 'approval');

            docToSave = {
                id: docId,
                lot: newLot,
                classement: newCl,
                nature: newNature,
                poste: newPoste,
                code: newCode,
                name: newName,
                currentRevisionIndex: 0,
                revisions: [
                    {
                        id: revId,
                        index: newIndex,
                        transmittalRef: finalRef,
                        transmittalDate: newTransmittalDate,
                        transmittalFiles: persistedTransmittalFiles,
                        observationDate: newObservationDate,
                        observationRef: newObservationRef,
                        observationFiles: persistedObservationFiles,
                        approvedSendDate: newApprovedSendDate,
                        approvedSendRef: newApprovedSendRef,
                        approvedSendFiles: persistedApprovalFiles,
                        approvedReturnDate: newApprovedReturnDate,
                        status: newStatus
                    }
                ]
            };
        }

        if (!docToSave) return;

        if (editingDocId) {
            await onUpdateDocument(docToSave);
        } else {
            await onAddDocument(docToSave);
        }

        closeAllModals();
    } catch (error) {
        console.error('File persistence error:', error);
        alert("Erreur lors de l'enregistrement des fichiers dans le cloud.");
    } finally {
        setIsUploadingFile(false);
    }
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

  const triggerFileUpload = (docId: string, revId: string, type: AttachmentType, sendId?: string) => {
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
                          } else if (uploadTarget.type === 'observation') {
                              const currentFiles = send.observationFiles || [];
                              if (currentFiles.length >= 3) {
                                  alert("Maximum 3 notes autorisées par envoi.");
                              } else {
                                  send.observationFiles = [...currentFiles, fileDataUrl];
                              }
                          } else if (uploadTarget.type === 'approval') {
                              const currentFiles = send.approvalFiles || [];
                              if (currentFiles.length >= 3) {
                                  alert("Maximum 3 fichiers approuvés autorisés par envoi.");
                              } else {
                                  send.approvalFiles = [...currentFiles, fileDataUrl];
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
                      } else if (uploadTarget.type === 'observation') {
                          const currentFiles = rev.observationFiles || [];
                          if (currentFiles.length >= 3) {
                              alert("Maximum 3 notes d'observation autorisées.");
                          } else {
                              rev.observationFiles = [...currentFiles, fileDataUrl];
                              onUpdateDocument(updatedDoc);
                          }
                      } else if (uploadTarget.type === 'approval') {
                          const currentFiles = rev.approvedSendFiles || [];
                          if (currentFiles.length >= 3) {
                              alert("Maximum 3 fichiers approuvés autorisés.");
                          } else {
                              rev.approvedSendFiles = [...currentFiles, fileDataUrl];
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

  const handleCloudFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file || !uploadTarget) return;

      try {
          setIsUploadingFile(true);

          const doc = documents.find(d => d.id === uploadTarget.docId);
          if (!doc) return;

          const updatedDoc = { ...doc };
          const revIdx = updatedDoc.revisions.findIndex(r => r.id === uploadTarget.revId);
          if (revIdx === -1) return;

          const rev = updatedDoc.revisions[revIdx];
          const fileBasePath = buildAttachmentBasePath(uploadTarget.type);
          const sanitizedFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
          // Filename: [DOC_CODE]_Indice_[XX]_[Timestamp]_[FileName]
          const finalPath = `${fileBasePath}/${storageService.buildPath(`${doc.code}_Indice_${rev.index}_${Date.now()}_${sanitizedFileName}`)}`;
          
          const uploadResult = await storageService.uploadFile(
              finalPath,
              file,
              { contentType: file.type || 'application/octet-stream' }
          );

          if (uploadTarget.sendId && rev.sendHistory) {
              const sendIdx = rev.sendHistory.findIndex(s => s.id === uploadTarget.sendId);
              if (sendIdx === -1) return;

              const send = rev.sendHistory[sendIdx];
              if (uploadTarget.type === 'transmittal') {
                  const currentFiles = send.transmittalFiles || [];
                  if (currentFiles.length >= 3) {
                      alert("Maximum 3 bordereaux autorisés par envoi.");
                      return;
                  }
                  send.transmittalFiles = [...currentFiles, uploadResult.downloadURL];
              } else if (uploadTarget.type === 'observation') {
                  const currentFiles = send.observationFiles || [];
                  if (currentFiles.length >= 3) {
                      alert("Maximum 3 notes autorisées par envoi.");
                      return;
                  }
                  send.observationFiles = [...currentFiles, uploadResult.downloadURL];
              } else {
                  const currentFiles = send.approvalFiles || [];
                  if (currentFiles.length >= 3) {
                      alert("Maximum 3 fichiers approuvés autorisés par envoi.");
                      return;
                  }
                  send.approvalFiles = [...currentFiles, uploadResult.downloadURL];
              }
          } else if (uploadTarget.type === 'transmittal') {
              const currentFiles = rev.transmittalFiles || [];
              if (currentFiles.length >= 3) {
                  alert("Maximum 3 bordereaux autorisés.");
                  return;
              }
              rev.transmittalFiles = [...currentFiles, uploadResult.downloadURL];
          } else if (uploadTarget.type === 'observation') {
              const currentFiles = rev.observationFiles || [];
              if (currentFiles.length >= 3) {
                  alert("Maximum 3 notes d'observation autorisées.");
                  return;
              }
              rev.observationFiles = [...currentFiles, uploadResult.downloadURL];
          } else {
              const currentFiles = rev.approvedSendFiles || [];
              if (currentFiles.length >= 3) {
                  alert("Maximum 3 fichiers approuvés autorisés.");
                  return;
              }
              rev.approvedSendFiles = [...currentFiles, uploadResult.downloadURL];
          }

          await onUpdateDocument(updatedDoc);
      } catch (error) {
          console.error('Cloud upload error:', error);
          alert("Erreur lors de l'upload du fichier vers Google Drive.");
      } finally {
          setUploadTarget(null);
          if (fileInputRef.current) fileInputRef.current.value = '';
          setIsUploadingFile(false);
      }
  };

  const openEditSendModal = (docId: string, revIdx: number, sendIdx: number) => {
      const doc = documents.find(d => d.id === docId);
      if (!doc) return;
      const send = doc.revisions[revIdx].sendHistory?.[sendIdx];
      if (!send) return;
      setEditSendModal({ docId, revIdx, sendIdx });
      setEditSendForm({ ...send });
  };

  const openEditRevisionSpecificModal = (docId: string, revIdx: number) => {
      const doc = documents.find(d => d.id === docId);
      if (!doc) return;
      const rev = doc.revisions[revIdx];
      if (!rev) return;

      setEditSendModal({ docId, revIdx, sendIdx: null });
      setEditSendForm({
          recipientName: rev.recipients?.join(', ') || rev.recipient || '',
          transmittalRef: rev.transmittalRef || '',
          transmittalDate: rev.transmittalDate || '',
          observationRef: rev.observationRef || '',
          observationDate: rev.observationDate || '',
          approvalRef: rev.approvedSendRef || '',
          approvalDate: rev.approvedSendDate || '',
          status: rev.status,
          transmittalFiles: rev.transmittalFiles || [],
          observationFiles: rev.observationFiles || [],
          approvalFiles: rev.approvedSendFiles || [],
      });
  };

  const updateSendRecord = () => {
    if (!editSendModal) return;
    const { docId, revIdx, sendIdx } = editSendModal;
    const doc = documents.find(d => d.id === docId);
    if (!doc) return;

    const updatedDoc = { ...doc };
    const rev = { ...updatedDoc.revisions[revIdx] };
    const sendHistory = [...(rev.sendHistory || [])];
    
    if (sendIdx === null) {
        const oldStatus = rev.status;
        rev.transmittalRef = editSendForm.transmittalRef || '';
        rev.transmittalDate = editSendForm.transmittalDate || '';
        rev.observationRef = editSendForm.observationRef;
        rev.observationDate = editSendForm.observationDate;
        rev.approvedSendRef = editSendForm.approvalRef;
        rev.approvedSendDate = editSendForm.approvalDate;
        rev.status = (editSendForm.status as ApprovalStatus) || rev.status;
        rev.transmittalFiles = editSendForm.transmittalFiles || [];
        rev.observationFiles = editSendForm.observationFiles || [];
        rev.approvedSendFiles = editSendForm.approvalFiles || [];
        updatedDoc.revisions[revIdx] = rev;

        if (rev.recipient || rev.recipients?.length) {
            rev.recipient = editSendForm.recipientName || rev.recipient;
        }

        if (rev.status === ApprovalStatus.REJECTED && revIdx === updatedDoc.revisions.length - 1) {
            const nextIndex = getNextIndex(rev.index);
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
        } else if (oldStatus === ApprovalStatus.REJECTED && rev.status !== ApprovalStatus.REJECTED) {
            const nextIdx = revIdx + 1;
            if (updatedDoc.revisions[nextIdx]) {
                const nextRev = updatedDoc.revisions[nextIdx];
                const expectedIndex = getNextIndex(rev.index);
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
        return;
    }

    const oldStatus = doc.revisions[revIdx].sendHistory?.[sendIdx].status;
    const newSendStatus = editSendForm.status;

    sendHistory[sendIdx] = { 
        ...sendHistory[sendIdx], 
        ...editSendForm,
        approvalRef: editSendForm.approvalRef,
        approvalFiles: editSendForm.approvalFiles
    } as SendRecord;
    rev.sendHistory = sendHistory;
    updatedDoc.revisions[revIdx] = rev;

    // Logic 1: If status is set to REJECTED and this is the latest revision, 
    // automatically create a new revision with next index.
    if (newSendStatus === ApprovalStatus.REJECTED && revIdx === updatedDoc.revisions.length - 1) {
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
    else if (oldStatus === ApprovalStatus.REJECTED && newSendStatus !== ApprovalStatus.REJECTED) {
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

  const handleModalFileChange = async (e: React.ChangeEvent<HTMLInputElement>, type: 'transmittal' | 'observation' | 'approval') => {
      const file = e.target.files?.[0];
      if (!file) return;

      // Si on modifie un document existant, on upload directement sur Drive pour plus de réactivité
      if (editingDocId) {
          setIsUploadingFile(true);
          try {
              const fileBasePath = buildAttachmentBasePath(type);
              const sanitizedFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
              const finalPath = `${fileBasePath}/${storageService.buildPath(`${newCode}_Indice_${newIndex}_${type}_${Date.now()}_${sanitizedFileName}`)}`;
              
              const uploadResult = await storageService.uploadFile(
                  finalPath,
                  file,
                  { contentType: file.type || 'application/octet-stream' }
              );

              // 1. Update Document in Firestore/AppState immediately for table sync
              const doc = documents.find(d => d.id === editingDocId);
              if (doc) {
                  const updatedDoc = JSON.parse(JSON.stringify(doc)) as BTPDocument;
                  const revIdx = updatedDoc.revisions.findIndex(r => r.id === editingRevId);
                  if (revIdx !== -1) {
                        const rev = updatedDoc.revisions[revIdx];
                        if (type === 'transmittal') {
                            rev.transmittalFiles = [...(rev.transmittalFiles || []), uploadResult.downloadURL];
                            setNewTransmittalFiles(rev.transmittalFiles);
                        } else if (type === 'observation') {
                            rev.observationFiles = [...(rev.observationFiles || []), uploadResult.downloadURL];
                            setNewObservationFiles(rev.observationFiles);
                        } else if (type === 'approval') {
                            rev.approvedSendFiles = [...(rev.approvedSendFiles || []), uploadResult.downloadURL];
                            setNewApprovedSendFiles(rev.approvedSendFiles);
                        }
                        onUpdateDocument(updatedDoc);
                  }
              }
          } catch (error) {
              console.error(error);
              alert("Erreur lors de l'upload vers Google Drive.");
          } finally {
              setIsUploadingFile(false);
              e.target.value = '';
          }
          return;
      }

      // Pour les nouveaux documents, on garde en mémoire locale avant validation finale
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
          else if (type === 'observation') {
              if (newObservationFiles.length >= 3) {
                  alert("Maximum 3 fichiers.");
                  return;
              }
              setNewObservationFiles(prev => [...prev, result]);
          }
          else if (type === 'approval') {
              if (newApprovedSendFiles.length >= 3) {
                  alert("Maximum 3 fichiers.");
                  return;
              }
              setNewApprovedSendFiles(prev => [...prev, result]);
          }
      };
      reader.readAsDataURL(file);
      e.target.value = '';
  };

  // --- LOGIQUE FICHIERS MODAL SPÉCIFIQUE ---
  const handleSpecificFileChange = async (e: React.ChangeEvent<HTMLInputElement>, type: 'transmittal' | 'observation' | 'approval') => {
    const file = e.target.files?.[0];
    if (!file || !editSendModal) return;

    setIsUploadingFile(true);
    try {
        const doc = documents.find(d => d.id === editSendModal.docId);
        if (!doc) return;

        const rev = doc.revisions[editSendModal.revIdx];
        const fileBasePath = buildAttachmentBasePath(type);
        const sanitizedFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
        const finalPath = `${fileBasePath}/${storageService.buildPath(`${doc.code}_Indice_${rev.index}_${type}_${Date.now()}_${sanitizedFileName}`)}`;
        
        const uploadResult = await storageService.uploadFile(
            finalPath,
            file,
            { contentType: file.type || 'application/octet-stream' }
        );

        // Update local form state
        const currentFiles = [...(editSendForm[type === 'transmittal' ? 'transmittalFiles' : type === 'observation' ? 'observationFiles' : 'approvalFiles'] || [])];
        const newFiles = [...currentFiles, uploadResult.downloadURL];
        
        setEditSendForm(prev => ({
            ...prev,
            [type === 'transmittal' ? 'transmittalFiles' : type === 'observation' ? 'observationFiles' : 'approvalFiles']: newFiles
        }));

        // Update document state for immediate sync
        const updatedDoc = JSON.parse(JSON.stringify(doc)) as BTPDocument;
        if (editSendModal.sendIdx === null) {
            const targetRev = updatedDoc.revisions[editSendModal.revIdx];
            if (type === 'transmittal') targetRev.transmittalFiles = newFiles;
            else if (type === 'observation') targetRev.observationFiles = newFiles;
            else if (type === 'approval') targetRev.approvedSendFiles = newFiles;
            onUpdateDocument(updatedDoc);
        } else {
            const targetSend = updatedDoc.revisions[editSendModal.revIdx].sendHistory?.[editSendModal.sendIdx];
            if (targetSend) {
                if (type === 'transmittal') targetSend.transmittalFiles = newFiles;
                else if (type === 'observation') targetSend.observationFiles = newFiles;
                else if (type === 'approval') targetSend.approvalFiles = newFiles;
                onUpdateDocument(updatedDoc);
            }
        }
    } catch (error) {
        console.error(error);
        alert("Erreur lors de l'upload vers Google Drive.");
    } finally {
        setIsUploadingFile(false);
        e.target.value = '';
    }
  };

  const handleSpecificFileDelete = async (type: 'transmittal' | 'observation' | 'approval', index: number) => {
    if (!editSendModal) return;
    if (!window.confirm("Supprimer cette pièce jointe ?")) return;

    const doc = documents.find(d => d.id === editSendModal.docId);
    if (!doc) return;

    const currentFiles = [...(editSendForm[type === 'transmittal' ? 'transmittalFiles' : type === 'observation' ? 'observationFiles' : 'approvalFiles'] || [])];
    const fileUrl = currentFiles[index];

    if (fileUrl && storageService.isRemoteFileUrl(fileUrl)) {
        void storageService.deleteByUrl(fileUrl);
    }

    const newFiles = currentFiles.filter((_, i) => i !== index);
    
    // Update local form state
    setEditSendForm(prev => ({
        ...prev,
        [type === 'transmittal' ? 'transmittalFiles' : type === 'observation' ? 'observationFiles' : 'approvalFiles']: newFiles
    }));

    // Update document state for immediate sync
    const updatedDoc = JSON.parse(JSON.stringify(doc)) as BTPDocument;
    if (editSendModal.sendIdx === null) {
        const targetRev = updatedDoc.revisions[editSendModal.revIdx];
        if (type === 'transmittal') targetRev.transmittalFiles = newFiles;
        else if (type === 'observation') targetRev.observationFiles = newFiles;
        else if (type === 'approval') targetRev.approvedSendFiles = newFiles;
        onUpdateDocument(updatedDoc);
    } else {
        const targetSend = updatedDoc.revisions[editSendModal.revIdx].sendHistory?.[editSendModal.sendIdx];
        if (targetSend) {
            if (type === 'transmittal') targetSend.transmittalFiles = newFiles;
            else if (type === 'observation') targetSend.observationFiles = newFiles;
            else if (type === 'approval') targetSend.approvalFiles = newFiles;
            onUpdateDocument(updatedDoc);
        }
    }
  };

  const openFile = (fileUrl: string) => {
      window.open(fileUrl, '_blank', 'noopener,noreferrer');
  };

  // --- EXPORT TO XLSX ---
  const exportToXlsx = async () => {
    setIsExporting(true);
    try {
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet('Suivi Documents');

      // Headers
      sheet.columns = [
        { header: 'N°', key: 'num', width: 5 },
        { header: 'Lot', key: 'lot', width: 6 },
        { header: 'Poste', key: 'poste', width: 8 },
        { header: 'Type', key: 'type', width: 6 },
        { header: 'CODE', key: 'code', width: 20 },
        { header: 'Indice', key: 'index', width: 8 },
        { header: 'Désignation', key: 'name', width: 40 },
        { header: 'Date Envoi', key: 'transmittalDate', width: 12 },
        { header: 'Réf Envoi', key: 'transmittalRef', width: 15 },
        { header: 'Date Obs.', key: 'observationDate', width: 12 },
        { header: 'Réf Obs.', key: 'observationRef', width: 15 },
        { header: 'Statut', key: 'status', width: 18 },
        { header: 'Destinataire', key: 'recipient', width: 15 },
        { header: 'Date Envoi App.', key: 'approvedSendDate', width: 14 },
        { header: 'Réf Envoi App.', key: 'approvedSendRef', width: 15 },
        { header: 'Ret. App.', key: 'approvedReturnDate', width: 12 },
      ];

      // Style header row
      const headerRow = sheet.getRow(1);
      headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 9 };
      headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
      headerRow.alignment = { horizontal: 'center', vertical: 'middle' };
      headerRow.height = 24;

      const statusLabel = (s: ApprovalStatus) => {
        const map: Record<string, string> = {
          [ApprovalStatus.APPROVED]: 'Approuvé',
          [ApprovalStatus.APPROVED_WITH_COMMENTS]: 'Approuvé (R)',
          [ApprovalStatus.REJECTED]: 'Non Approuvé',
          [ApprovalStatus.NO_RESPONSE]: 'Sans réponse',
          [ApprovalStatus.PENDING]: 'En cours',
        };
        return map[s] || s;
      };

      // Data rows
      sortedRows.forEach((row, idx) => {
        const { doc, rev } = row;

        if (rev.sendHistory && rev.sendHistory.length > 0) {
          rev.sendHistory.forEach(s => {
            const dataRow = sheet.addRow({
              num: idx + 1,
              lot: doc.lot,
              poste: doc.poste,
              type: doc.classement,
              code: doc.code,
              index: rev.index,
              name: doc.name,
              transmittalDate: s.transmittalDate,
              transmittalRef: s.transmittalRef,
              observationDate: s.observationDate || '',
              observationRef: s.observationRef || '',
              status: statusLabel(s.status),
              recipient: s.recipientName || '',
              approvedSendDate: s.approvalDate || '',
              approvedSendRef: s.approvalRef || '',
              approvedReturnDate: rev.approvedReturnDate || '',
            });
            dataRow.font = { size: 9 };
            dataRow.alignment = { vertical: 'middle' };
          });
        } else {
          const dataRow = sheet.addRow({
            num: idx + 1,
            lot: doc.lot,
            poste: doc.poste,
            type: doc.classement,
            code: doc.code,
            index: rev.index,
            name: doc.name,
            transmittalDate: rev.transmittalDate,
            transmittalRef: rev.transmittalRef,
            observationDate: rev.observationDate || '',
            observationRef: rev.observationRef || '',
            status: statusLabel(rev.status),
            recipient: rev.recipients?.join(', ') || rev.recipient || '',
            approvedSendDate: rev.approvedSendDate || '',
            approvedSendRef: rev.approvedSendRef || '',
            approvedReturnDate: rev.approvedReturnDate || '',
          });
          dataRow.font = { size: 9 };
          dataRow.alignment = { vertical: 'middle' };
        }
      });

      // Auto-filter & borders
      sheet.autoFilter = { from: 'A1', to: `P${sheet.rowCount}` };
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
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      saveAs(blob, `Suivi_${appSettings.projectCode}.xlsx`);
    } catch (error) {
      console.error('Export error:', error);
      alert("Erreur lors de l'export Excel.");
    } finally {
      setIsExporting(false);
    }
  };

  // --- EXPORT TO PDF ---
  const exportToPdf = async () => {
    setIsExportingPdf(true);
    await new Promise(r => setTimeout(r, 100));
    try {
      const element = document.getElementById('document-list-root');
      if (!element) return;
      element.classList.add('pdf-mode');

      const opt = {
        margin: [5, 5, 5, 5],
        filename: `Suivi_${appSettings.projectCode}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, letterRendering: true },
        jsPDF: { unit: 'mm', format: 'a3', orientation: 'landscape' as const },
        pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
      };

      await window.html2pdf().set(opt).from(element).save();
      element.classList.remove('pdf-mode');
    } catch (error) {
      console.error('PDF export error:', error);
      alert("Erreur lors de l'export PDF.");
    } finally {
      setIsExportingPdf(false);
    }
  };

  // ====================== RENDER ======================
  return (
    <>
      <div id="document-list-root" className="flex flex-col h-full bg-gray-50 dark:bg-slate-900 transition-colors">
      
      {/* --- TOOLBAR --- */}
      {!isExportingPdf && (
        <div className="bg-white dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700 px-4 py-3 space-y-3 no-print transition-colors">
          {/* Top Row: Title + Actions */}
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-lg font-black text-slate-800 dark:text-white uppercase tracking-wider flex items-center gap-2">
              <FileSpreadsheet size={20} className="text-blue-600" />
              Suivi des Documents
              <span className="text-xs font-normal text-gray-400 ml-2">({statusCounts.all} docs)</span>
            </h2>
            <div className="flex items-center gap-2">
              {/* Export Buttons */}
              <button
                onClick={exportToXlsx}
                disabled={isExporting}
                className="px-3 py-1.5 text-[10px] font-bold uppercase bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-all flex items-center gap-1.5 shadow-sm disabled:opacity-50"
              >
                {isExporting ? <Loader2 size={14} className="animate-spin" /> : <FileSpreadsheet size={14} />}
                Excel
              </button>
              <button
                onClick={exportToPdf}
                disabled={isExportingPdf}
                className="px-3 py-1.5 text-[10px] font-bold uppercase bg-red-600 text-white rounded-lg hover:bg-red-700 transition-all flex items-center gap-1.5 shadow-sm disabled:opacity-50"
              >
                {isExportingPdf ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                PDF
              </button>
              {/* New Document Button */}
              {canModify && (
                <button
                  onClick={handleCreateClick}
                  className="px-3 py-1.5 text-[10px] font-bold uppercase bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all flex items-center gap-1.5 shadow-lg shadow-blue-200 dark:shadow-blue-900/30"
                >
                  <Plus size={14} /> Nouveau
                </button>
              )}
            </div>
          </div>

          {/* Middle Row: Status Filters */}
          <div className="flex items-center gap-2 flex-wrap">
            <Filter size={14} className="text-gray-400" />
            {[
              { key: 'ALL', label: 'Tous', count: statusCounts.all, color: 'bg-gray-100 text-gray-700 border-gray-300 dark:bg-slate-700 dark:text-slate-200 dark:border-slate-600' },
              { key: 'APPROVED_GROUP', label: 'Approuvé', count: statusCounts.approved, color: 'bg-green-50 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800' },
              { key: 'REJECTED', label: 'Non Approuvé', count: statusCounts.rejected, color: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800' },
              { key: 'NO_RESPONSE', label: 'Sans réponse', count: statusCounts.noResponse, color: 'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-800' },
              { key: 'PENDING', label: 'En cours', count: statusCounts.pending, color: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800' },
            ].map(f => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`px-2.5 py-1 text-[10px] font-bold rounded-full border transition-all ${
                  filter === f.key
                    ? `${f.color} ring-2 ring-offset-1 ring-blue-400 scale-105`
                    : 'bg-white dark:bg-slate-700 text-gray-500 dark:text-slate-400 border-gray-200 dark:border-slate-600 hover:border-blue-300'
                }`}
              >
                {f.label} <span className="ml-1 opacity-70">({f.count})</span>
              </button>
            ))}
          </div>

          {/* Bottom Row: Nature Filter + Search */}
          <div className="flex items-center gap-3">
            {/* Nature Filter */}
            <select
              value={natureFilter}
              onChange={e => setNatureFilter(e.target.value)}
              className="px-2 py-1.5 text-[10px] font-bold border border-gray-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-700 dark:text-slate-200 focus:ring-2 focus:ring-blue-500 outline-none uppercase"
            >
              <option value="ALL">Toutes Natures</option>
              {appSettings.documentNatures?.map(n => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>

            {/* Recipient Filter */}
            <select
              value={recipientFilter}
              onChange={e => setRecipientFilter(e.target.value)}
              className="px-2 py-1.5 text-[10px] font-bold border border-gray-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-700 dark:text-slate-200 focus:ring-2 focus:ring-blue-500 outline-none uppercase"
            >
              <option value="ALL">Tous Destinataires</option>
              {uniqueRecipients.map(r => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>

            {/* Search Bar */}
            <div className="flex-1 relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Rechercher par code, désignation, lot, poste..."
                className="w-full pl-9 pr-10 py-1.5 text-xs border border-gray-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-700 dark:text-slate-200 focus:ring-2 focus:ring-blue-500 outline-none placeholder:text-gray-400"
              />
              <button
                onClick={handleVoiceSearch}
                className={`absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-full transition-all ${
                  isListening ? 'text-red-500 bg-red-50 animate-pulse' : 'text-gray-400 hover:text-blue-500'
                }`}
                title="Recherche vocale"
              >
                {isListening ? <MicOff size={14} /> : <Mic size={14} />}
              </button>
            </div>

            {/* Results count */}
            <span className="text-[10px] text-gray-400 font-medium whitespace-nowrap">
              {sortedRows.length} résultat{sortedRows.length !== 1 ? 's' : ''}
            </span>
          </div>
        </div>
      )}

      {/* --- CONTENT AREA --- */}
      <div className="flex-1 flex flex-col min-h-0">
        {/* Upload indicator */}
        {isUploadingFile && (
          <div className="bg-blue-50 dark:bg-blue-900/30 px-4 py-2 flex items-center gap-2 text-blue-700 dark:text-blue-300 text-xs font-medium border-b border-blue-100 dark:border-blue-800">
            <Loader2 size={14} className="animate-spin" /> Upload en cours...
          </div>
        )}

        {/* PDF Export Header (hidden by default, shown in pdf-mode) */}
        <div id="pdf-export-header" className="hidden border-2 border-slate-900 bg-white" style={{ minHeight: '120px' }}>
            <div className="flex h-full">
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
        </div>

        <div className="hidden pdf-spacer w-full h-8 bg-white"></div>

        <div className={`overflow-auto flex-1 ${isExportingPdf ? 'overflow-visible' : ''}`}>
            <table className="w-full text-[9px] text-left border-collapse">
              <thead className="bg-slate-800 dark:bg-slate-950 text-white text-[8px] uppercase sticky top-0 z-20 transition-colors">
                <tr>
                  <th className="px-1 py-1 border border-slate-600 font-bold text-center w-8 align-middle text-[8px]" rowSpan={2}>N°</th>
                  <SortHeader label="Lot" sortKey="lot" className="w-12 text-center" rowSpan={2} />
                  <SortHeader label="Poste" sortKey="poste" className="w-12 text-center" rowSpan={2} />
                  <SortHeader label="Type" sortKey="classement" className="w-12 text-center" rowSpan={2} />
                  <SortHeader label="CODE" sortKey="code" className="w-32 text-center" rowSpan={2} />
                  <SortHeader label="Indice" sortKey="index" className="w-12 text-center" rowSpan={2} />
                  <SortHeader label="Désignation Document" sortKey="name" className="min-w-[200px]" rowSpan={2} />
                  
                  {/* Group headers with 3 sub-columns */}
                  <th id="th-transmis" colSpan={isExportingPdf ? 2 : 3} className="px-1 py-1 border border-slate-600 text-center bg-slate-900 dark:bg-slate-800 font-bold align-middle transition-colors text-[8px]">Date d'Envoi</th>
                  <th id="th-visa" colSpan={isExportingPdf ? 2 : 3} className="px-1 py-1 border border-slate-600 text-center bg-slate-900 dark:bg-slate-800 font-bold align-middle transition-colors text-[8px]">Note d'Obs.</th>
                  
                  <SortHeader label="Statut" sortKey="status" className="w-32 text-center" rowSpan={2} />
                  <th className="px-1 py-1 border border-slate-600 text-center font-bold align-middle w-20 text-[8px]" rowSpan={2}>Destinataire</th>
                  
                  <th id="th-envoi-app" colSpan={isExportingPdf ? 2 : 3} className="px-1 py-1 border border-slate-600 text-center bg-slate-900 dark:bg-slate-800 font-bold align-middle transition-colors text-[8px]">Envoi App.</th>
                  <SortHeader label="Ret. App." sortKey="approvedReturnDate" className="w-24 text-center" rowSpan={2} />
                  {/* Hide Actions Column in PDF and for Viewers */}
                  {!isExportingPdf && canModify && <th className="px-1 py-1 border border-slate-600 text-center font-bold align-middle no-print text-[8px]" rowSpan={2}>Actions</th>}
                </tr>
                <tr>
                  <SortHeader label="Date" sortKey="transmittalDate" className="w-24 bg-slate-800 text-center" />
                  <SortHeader label="Réf" sortKey="transmittalRef" className="w-24 bg-slate-800 text-center" />
                  {/* Conditionally Render File Icon Header with PJ title */}
                  {!isExportingPdf && <th className="px-0.5 py-0.5 border border-slate-600 w-8 text-center align-middle no-print text-[7px]">P.J</th>}
                  
                  <SortHeader label="Date" sortKey="observationDate" className="w-24 bg-slate-800 text-center" />
                  <SortHeader label="Réf" sortKey="observationRef" className="w-24 bg-slate-800 text-center" />
                   {/* Conditionally Render File Icon Header with PJ title */}
                  {!isExportingPdf && <th className="px-1 py-1 border border-slate-600 w-10 text-center align-middle no-print text-[7px]">P.J</th>}

                  <SortHeader label="Date" sortKey="approvedSendDate" className="w-24 bg-slate-800 text-center" />
                  <SortHeader label="Réf" sortKey="approvedSendRef" className="w-24 bg-slate-800 text-center" />
                  {!isExportingPdf && <th className="px-1 py-1 border border-slate-600 w-10 text-center align-middle no-print text-[7px]">P.J</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sortedRows.length === 0 ? (
                  <tr>
                   <td colSpan={20} className="p-8 text-center text-gray-500">
                      Aucun document trouvé.
                    </td>
                  </tr>
                ) : sortedRows.map(({ doc, rev, isLatest }, idx) => {
                  const currentNature = doc.nature || 'Général / Sans Nature';
                  const prevNature = idx > 0 ? sortedRows[idx-1].doc.nature || 'Général / Sans Nature' : null;
                  const showNatureHeader = currentNature !== prevNature;

                  // @ts-ignore
                  const tFiles = rev.transmittalFiles || (rev.transmittalFile ? [rev.transmittalFile] : []);
                  // @ts-ignore
                  const oFiles = rev.observationFiles || (rev.observationFile ? [rev.observationFile] : []);

                  return (
                    <React.Fragment key={`${doc.id}-${rev.id}`}>
                      {showNatureHeader && (
                        <tr className="bg-slate-100 dark:bg-slate-800 transition-colors border-y border-gray-200 dark:border-slate-700">
                          <td colSpan={20} className="px-3 py-1.5 text-[10px] font-black uppercase text-blue-700 dark:text-blue-400 tracking-widest bg-gradient-to-r from-blue-50/50 to-transparent">
                             <div className="flex items-center gap-2">
                               <div className="w-1.5 h-4 bg-blue-600 rounded-full"></div>
                               {currentNature}
                             </div>
                          </td>
                        </tr>
                      )}
                    <tr 
                      className={`hover:bg-blue-50/50 transition-colors group ${!isLatest ? 'bg-gray-50/50 text-gray-400 text-[8px] italic' : ''}`}
                    >
                      <td className="px-1 py-0.5 border border-gray-300 dark:border-slate-700 text-center font-medium text-gray-400 align-middle text-[8px]">{idx + 1}</td>
                      <td className="px-1 py-0.5 border border-gray-300 dark:border-slate-700 font-bold text-center align-middle dark:text-slate-300 text-[9px]">{doc.lot}</td>
                      <td className="px-1 py-0.5 border border-gray-300 dark:border-slate-700 text-center align-middle dark:text-slate-400 uppercase italic text-[8px]">{doc.poste}</td>
                      <td className="px-1 py-0.5 border border-gray-300 dark:border-slate-700 text-center align-middle dark:text-slate-400 text-[9px]">{doc.classement}</td>
                      <td className="px-1 py-0.5 border border-gray-300 dark:border-slate-700 font-mono font-bold text-blue-900 dark:text-blue-400 text-center align-middle whitespace-nowrap text-[9px]">{doc.code}</td>
                      <td className="px-1 py-0.5 border border-gray-300 dark:border-slate-700 text-center font-black align-middle text-indigo-600 dark:text-indigo-400 text-[9px]">{rev.index}</td>
                      <td className="px-1 py-0.5 border border-gray-300 dark:border-slate-700 max-w-[220px] align-middle dark:text-slate-200 leading-tight text-[9px]" title={doc.name}>
                          <div className="line-clamp-2">{doc.name}</div>
                      </td>
                      
                      {/* Transmittal */}
                      <td className="px-1 py-1 text-center border border-gray-300 align-middle whitespace-nowrap text-[8px]">
                          {rev.sendHistory && rev.sendHistory.length > 0 ? (
                              <div className="flex flex-col gap-2">
                                  {rev.sendHistory.map((s, i) => <div key={i} className="h-[24px] flex items-center justify-center">{s.transmittalDate || '-'}</div>)}
                              </div>
                          ) : ( rev.transmittalDate )}
                      </td>
                      <td className="px-1 py-1 text-center border border-gray-300 text-[8px] align-middle whitespace-nowrap">
                          {rev.sendHistory && rev.sendHistory.length > 0 ? (
                              <div className="flex flex-col gap-2">
                                  {rev.sendHistory.map((s, i) => <div key={i} className="h-[24px] flex items-center justify-center font-mono">{s.transmittalRef || '-'}</div>)}
                              </div>
                          ) : ( rev.transmittalRef )}
                      </td>
                      
                      {!isExportingPdf && (
                        <td className="px-1 py-1 text-center border border-gray-300 align-middle no-print text-[8px]">
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
                      <td className="px-1 py-1 text-center border border-gray-300 align-middle whitespace-nowrap text-[8px]">
                          {rev.sendHistory && rev.sendHistory.length > 0 ? (
                              <div className="flex flex-col gap-2">
                                  {rev.sendHistory.map((s, i) => <div key={i} className="h-[24px] flex items-center justify-center">{s.observationDate || '-'}</div>)}
                              </div>
                          ) : ( rev.observationDate || '-' )}
                      </td>
                      <td className="px-1 py-1 text-center border border-gray-300 text-[8px] align-middle whitespace-nowrap">
                          {rev.sendHistory && rev.sendHistory.length > 0 ? (
                              <div className="flex flex-col gap-2">
                                  {rev.sendHistory.map((s, i) => <div key={i} className="h-[24px] flex items-center justify-center font-mono">{s.observationRef || '-'}</div>)}
                              </div>
                          ) : ( rev.observationRef || '-' )}
                      </td>
                      
                      {!isExportingPdf && (
                        <td className="px-1 py-1 text-center border border-gray-300 align-middle no-print text-[8px]">
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
                      <td className="px-1 py-1 text-center border border-gray-300 align-middle text-[8px]">
                          {rev.sendHistory && rev.sendHistory.length > 0 ? (
                              <div className="flex flex-col gap-2 items-center">
                                  {rev.sendHistory.map((s, i) => (
                                      <span key={i} className={`h-[20px] px-1.5 py-0 rounded-full text-[7px] font-bold uppercase inline-flex items-center justify-center gap-0.5 border min-w-[90px] ${
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
                            <span className={`px-1.5 py-0.5 rounded-full text-[8px] font-bold uppercase inline-flex items-center gap-0.5 border ${
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
                      <td className="px-1 py-1 text-center border border-gray-300 align-middle text-[8px]">
                          {rev.sendHistory && rev.sendHistory.length > 0 ? (
                              <div className="flex flex-col gap-2 items-center justify-center">
                                  {rev.sendHistory.map((s, i) => (
                                      <div key={i} className="h-[24px] flex items-center justify-center w-full">
                                          <span className="px-1 py-0 rounded text-[8px] font-bold bg-indigo-100 text-indigo-800 border border-indigo-200 whitespace-nowrap">
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
                                              <span key={i} className="px-1 py-0 rounded text-[8px] font-bold bg-indigo-100 text-indigo-800 border border-indigo-200 whitespace-nowrap">
                                                  {r}
                                              </span>
                                          ))}
                                      </div>
                                  );
                              })()
                          )}
                      </td>
                      {/* Envoi Approuvé Group (3 sub-columns) */}
                      <td className="px-1 py-1 text-center border border-gray-300 align-middle whitespace-nowrap text-[8px]">
                          {rev.sendHistory && rev.sendHistory.length > 0 ? (
                              <div className="flex flex-col gap-2">{rev.sendHistory.map((s, i) => <div key={i} className="h-[24px] flex items-center justify-center">{s.approvalDate || '-'}</div>)}</div>
                          ) : (rev.approvedSendDate || '-')}
                      </td>
                      <td className="px-1 py-1 text-center border border-gray-300 text-[8px] align-middle whitespace-nowrap">
                          {rev.sendHistory && rev.sendHistory.length > 0 ? (
                              <div className="flex flex-col gap-2">{rev.sendHistory.map((s, i) => <div key={i} className="h-[24px] flex items-center justify-center font-mono">{s.approvalRef || '-'}</div>)}</div>
                          ) : (rev.approvedSendRef || '-')}
                      </td>
                      {!isExportingPdf && (
                        <td className="px-1 py-1 text-center border border-gray-300 align-middle no-print text-[8px]">
                            {rev.sendHistory && rev.sendHistory.length > 0 ? (
                                <div className="flex flex-col gap-2 scale-90">
                                    {rev.sendHistory.map((s, i) => {
                                        const sFiles = s.approvalFiles || [];
                                        return (
                                            <div key={i} className="h-[24px] flex items-center justify-center">
                                                {sFiles.length > 0 ? (
                                                    <button onClick={() => openFile(sFiles[0])} className="text-blue-600 hover:text-blue-800 relative inline-flex justify-center items-center">
                                                        <FileText size={14} />
                                                        {sFiles.length > 1 && <span className="absolute -top-2 -right-2 bg-blue-600 text-white text-[7px] w-2.5 h-2.5 rounded-full flex items-center justify-center">{sFiles.length}</span>}
                                                    </button>
                                                ) : (
                                                    isLatest && canModify && <button onClick={() => triggerFileUpload(doc.id, rev.id, 'approval', s.id)} className="text-gray-300 hover:text-blue-500 inline-flex justify-center items-center"><UploadCloud size={14}/></button>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                (rev.approvedSendFiles || []).length > 0 ? (
                                    <button onClick={() => openFile(rev.approvedSendFiles![0])} className="text-blue-600 hover:text-blue-800 relative inline-flex justify-center items-center">
                                        <FileText size={16} />
                                        {rev.approvedSendFiles!.length > 1 && <span className="absolute -top-2 -right-2 bg-blue-600 text-white text-[8px] w-3 h-3 rounded-full flex items-center justify-center">{rev.approvedSendFiles!.length}</span>}
                                    </button>
                                ) : (
                                    isLatest && canModify && <button onClick={() => triggerFileUpload(doc.id, rev.id, 'approval')} className="text-gray-300 hover:text-blue-500 inline-flex justify-center items-center"><UploadCloud size={16}/></button>
                                )
                            )}
                        </td>
                      )}
                      <td className="px-1 py-0.5 border border-gray-300 dark:border-slate-700 text-center align-middle bg-slate-50/10 font-bold text-green-700 dark:text-green-400 w-20 text-[8px]">
                          {rev.approvedReturnDate ? new Date(rev.approvedReturnDate).toLocaleDateString('fr-FR') : '-'}
                      </td>

                      {/* Actions */}
                      {!isExportingPdf && (
                        <td className="px-1 py-1 text-center border border-gray-300 align-middle no-print min-w-[100px] text-[8px]">
                            {/* ACTIONS GLOBALES (Document/Révision) */}
                            <div className="flex items-center justify-center gap-1 mb-2 pb-2 border-b border-gray-100 opacity-100 sm:opacity-0 group-hover:opacity-100 transition-opacity">
                                {canModify && (
                                    <button 
                                        onClick={(e) => handleEditClick(doc, rev, e)} 
                                        className="p-1 px-2 text-[8px] text-blue-600 bg-blue-50/50 hover:bg-blue-100 rounded border border-blue-100 flex items-center gap-1 font-bold whitespace-nowrap transition-all"
                                        title="Modifier les données de base du Document"
                                    >
                                        <Edit2 size={10} /> MODIF. DOC
                                    </button>
                                )}
                                <button 
                                    onClick={() => openReminderModal(doc.id, rev.id, rev.reminder)}
                                    className={`p-1.5 rounded ${rev.reminder?.active ? 'text-amber-600 bg-amber-50' : 'text-gray-400 hover:bg-gray-50'}`}
                                    title="Rappel"
                                >
                                    <Bell size={12} />
                                </button>
                                {canModify && isLatest && (
                                    <button 
                                        onClick={() => onAddToBordereau(doc.id)}
                                        className="p-1.5 text-purple-600 hover:bg-purple-100 rounded"
                                        title="Créer un nouvel envoi"
                                    >
                                        <Send size={12} />
                                    </button>
                                )}
                                {canDelete && isLatest && (
                                    <button 
                                        onClick={(e) => handleDeleteClick(doc.id, e)}
                                        className="p-1.5 text-red-500 hover:bg-red-50 rounded"
                                        title="Supprimer le document"
                                    >
                                        <Trash2 size={12} />
                                    </button>
                                )}
                            </div>

                            {/* ACTIONS PAR ENVOI (DESTINATAIRES) */}
                            {rev.sendHistory && rev.sendHistory.length > 0 ? (
                                <div className="flex flex-col gap-1">
                                    {rev.sendHistory.map((s, sIdx) => (
                                        <div key={sIdx} className="h-[24px] flex items-center justify-center gap-1 opacity-100 sm:opacity-0 group-hover:opacity-100 transition-opacity bg-gray-50/50 rounded hover:bg-gray-100/50 px-1 border border-transparent hover:border-gray-200">
                                            <span className="text-[7px] text-gray-400 font-mono mr-1">#{sIdx + 1}</span>
                                            {canModify && (
                                                <button 
                                                    onClick={() => openEditSendModal(doc.id, doc.revisions.indexOf(rev), sIdx)}
                                                    className="p-1 px-2 text-[8px] text-indigo-600 bg-indigo-50/50 hover:bg-indigo-100 rounded border border-indigo-100 flex items-center gap-1 font-bold whitespace-nowrap transition-all"
                                                    title="Modifier les pièces jointes et détails de l'envoi"
                                                >
                                                    <Edit3 size={10} /> MODIF. SPÉCIFIQUE
                                                </button>
                                            )}
                                            {canDelete && (
                                                <button 
                                                    onClick={() => deleteSendRecord(doc.id, doc.revisions.indexOf(rev), sIdx)}
                                                    className="p-1 text-red-400 hover:bg-red-100 rounded"
                                                    title="Supprimer cet envoi"
                                                >
                                                    <Trash2 size={11} />
                                                </button>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="flex flex-col gap-1">
                                    <div className="h-[24px] flex items-center justify-center gap-1 opacity-100 sm:opacity-0 group-hover:opacity-100 transition-opacity bg-gray-50/50 rounded hover:bg-gray-100/50 px-1 border border-transparent hover:border-gray-200">
                                        <span className="text-[7px] text-gray-400 font-mono mr-1">#1</span>
                                        {canModify && (
                                            <button 
                                                onClick={() => openEditRevisionSpecificModal(doc.id, doc.revisions.indexOf(rev))}
                                                className="p-1 px-2 text-[8px] text-indigo-600 bg-indigo-50/50 hover:bg-indigo-100 rounded border border-indigo-100 flex items-center gap-1 font-bold whitespace-nowrap transition-all"
                                                title="Modifier les pièces jointes et détails de l'envoi"
                                            >
                                                <Edit3 size={10} /> MODIF. SPÉCIFIQUE
                                            </button>
                                        )}
                                    </div>
                                </div>
                            )}
                        </td>
                      )}
                    </tr>
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      
      {/* Hidden File Input for Icon Clicks */}
      <input type="file" ref={fileInputRef} className="hidden" accept=".pdf,.jpg,.png,.doc,.docx,.xls,.xlsx" onChange={handleCloudFileChange} />

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
                          <div className="flex justify-between items-center mb-2">
                              <h4 className="text-sm font-bold text-slate-700 uppercase tracking-wider">Identification</h4>
                              <div className="flex items-center gap-2">
                                  <label className="text-[11px] font-bold text-blue-600 uppercase">Nature :</label>
                                  <select value={newNature} onChange={e => setNewNature(e.target.value)} className="p-1.5 border border-blue-200 rounded text-xs font-bold bg-blue-50 outline-none focus:ring-2 focus:ring-blue-500">
                                      {appSettings.documentNatures?.map(t => (
                                          <option key={t} value={t}>{t}</option>
                                      ))}
                                  </select>
                              </div>
                          </div>
                          
                          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                              <div>
                                  <label className="block text-xs font-semibold text-gray-500 mb-1">Lot</label>
                                  <input required value={newLot} onChange={e => setNewLot(e.target.value)} className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500 outline-none bg-white" placeholder="01" />
                              </div>
                              <div>
                                  <label className="block text-xs font-semibold text-gray-500 mb-1">Type (Code)</label>
                                  <input required value={newCl} onChange={e => setNewCl(e.target.value)} className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500 outline-none font-bold bg-white text-center" placeholder="A" />
                              </div>
                              <div>
                                  <label className="block text-xs font-semibold text-gray-500 mb-1">Poste</label>
                                  <input required value={newPoste} onChange={e => setNewPoste(e.target.value)} className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500 outline-none bg-white" placeholder="GC" />
                              </div>
                              <div>
                                  <label className="block text-xs font-semibold text-gray-500 mb-1">CODE</label>
                                  <input required value={newCode} onChange={e => setNewCode(e.target.value)} className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500 outline-none font-mono bg-white" placeholder="GC-PL-001" />
                              </div>
                              <div>
                                  <label className="block text-xs font-semibold text-gray-500 mb-1">Indice</label>
                                  <input required value={newIndex} onChange={e => setNewIndex(e.target.value)} className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500 outline-none font-bold text-center bg-white" />
                              </div>
                          </div>
                          <div>
                              <label className="block text-xs font-semibold text-gray-500 mb-1">Désignation Document</label>
                              <input required value={newName} onChange={e => setNewName(e.target.value)} className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500 outline-none bg-white" placeholder="Plan de ferraillage..." />
                          </div>
                      </div>

                      {/* Envoi Info - Only for NEW documents */}
                      {!editingDocId && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {/* Transmittal Info */}
                            <div className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm space-y-4">
                                <h4 className="text-sm font-bold text-slate-700 uppercase tracking-wider mb-2">Envoi (Transmittal)</h4>
                                <div className="grid grid-cols-1 gap-4">
                                    <div>
                                        <label className="block text-xs font-semibold text-gray-500 mb-1">Date d'envoi</label>
                                        <input type="date" required value={newTransmittalDate} onChange={e => setNewTransmittalDate(e.target.value)} className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500 outline-none bg-white" />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-gray-500 mb-1">Réf d'envoi</label>
                                        <input value={newTransmittalRef} onChange={e => setNewTransmittalRef(e.target.value)} className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500 outline-none bg-white" placeholder="B-00X" />
                                    </div>
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
                                
                                <div className="space-y-4">
                                    <div className="flex items-center gap-4">
                                        <div className="flex-1">
                                            <label className="block text-xs font-semibold text-gray-500 mb-1">Statut</label>
                                            <select value={newStatus} onChange={e => setNewStatus(e.target.value as ApprovalStatus)} className="w-full p-2 border rounded focus:ring-2 focus:ring-amber-500 outline-none font-medium bg-white text-xs">
                                                <option value={ApprovalStatus.APPROVED}>Approuvé</option>
                                                <option value={ApprovalStatus.REJECTED}>Non Approuvé</option>
                                                <option value={ApprovalStatus.NO_RESPONSE}>Sans réponse</option>
                                                <option value={ApprovalStatus.PENDING}>En cours de révision</option>
                                                <option value={ApprovalStatus.APPROVED_WITH_COMMENTS}>Approuvé (R)</option>
                                            </select>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                      )}

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

                          <div className="grid grid-cols-2 gap-3">
                              <div>
                                  <label className="block text-[10px] font-bold uppercase text-blue-600 mb-1">Réf. Envoi App.</label>
                                  <input 
                                      type="text" 
                                      value={editSendForm.approvalRef || ''} 
                                      onChange={e => setEditSendForm({...editSendForm, approvalRef: e.target.value})}
                                      className="w-full p-2.5 bg-blue-50/30 border border-blue-100 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-medium" 
                                  />
                              </div>
                              <div>
                                  <label className="block text-[10px] font-bold uppercase text-blue-600 mb-1">Date Envoi App.</label>
                                  <input 
                                      type="date" 
                                      value={editSendForm.approvalDate || ''} 
                                      onChange={e => setEditSendForm({...editSendForm, approvalDate: e.target.value})}
                                      className="w-full p-2.5 bg-blue-50/30 border border-blue-100 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-medium" 
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

                          <div className="mt-6 space-y-6 border-t border-gray-100 pt-6">
                              <h4 className="text-xs font-black text-indigo-600 uppercase tracking-widest flex items-center gap-2">
                                  <Paperclip size={14} /> Pièces Jointes & Synchronisation
                              </h4>

                              {/* Transmittal Files */}
                              <div>
                                  <label className="block text-[10px] font-bold uppercase text-gray-400 mb-2">Bordereaux d'Envoi (BE)</label>
                                  <div className="space-y-1.5">
                                      {(editSendForm.transmittalFiles || []).map((file, idx) => (
                                          <div key={idx} className="flex items-center gap-2 text-xs bg-blue-50/50 border border-blue-100 p-2 rounded-lg group/file">
                                              <FileText size={14} className="text-blue-500" />
                                              <span className="truncate flex-1 font-medium text-blue-900">BE_{idx + 1}</span>
                                              <div className="flex items-center gap-1">
                                                  <button type="button" onClick={() => openFile(file)} className="p-1 text-blue-600 hover:bg-blue-100 rounded transition-colors"><FileIcon size={12}/></button>
                                                  <button type="button" onClick={() => handleSpecificFileDelete('transmittal', idx)} className="p-1 text-red-500 hover:bg-red-100 rounded transition-colors"><X size={12}/></button>
                                              </div>
                                          </div>
                                      ))}
                                      {(editSendForm.transmittalFiles || []).length < 3 && (
                                          <div className="relative">
                                              <input type="file" id="specific-be-upload" className="hidden" onChange={(e) => handleSpecificFileChange(e, 'transmittal')} />
                                              <label htmlFor="specific-be-upload" className="flex items-center justify-center gap-2 w-full p-2 border-2 border-dashed border-gray-200 rounded-lg text-gray-400 hover:border-blue-400 hover:text-blue-500 cursor-pointer text-[10px] font-bold uppercase bg-gray-50/50 transition-all">
                                                  <UploadCloud size={14} /> Ajouter BE
                                              </label>
                                          </div>
                                      )}
                                  </div>
                              </div>

                              {/* Observation Files */}
                              <div>
                                  <label className="block text-[10px] font-bold uppercase text-gray-400 mb-2">Notes d'Observation / Visas</label>
                                  <div className="space-y-1.5">
                                      {(editSendForm.observationFiles || []).map((file, idx) => (
                                          <div key={idx} className="flex items-center gap-2 text-xs bg-amber-50/50 border border-amber-100 p-2 rounded-lg group/file">
                                              <FileText size={14} className="text-amber-500" />
                                              <span className="truncate flex-1 font-medium text-amber-900">Note_{idx + 1}</span>
                                              <div className="flex items-center gap-1">
                                                  <button type="button" onClick={() => openFile(file)} className="p-1 text-amber-600 hover:bg-amber-100 rounded transition-colors"><FileIcon size={12}/></button>
                                                  <button type="button" onClick={() => handleSpecificFileDelete('observation', idx)} className="p-1 text-red-500 hover:bg-red-100 rounded transition-colors"><X size={12}/></button>
                                              </div>
                                          </div>
                                      ))}
                                      {(editSendForm.observationFiles || []).length < 3 && (
                                          <div className="relative">
                                              <input type="file" id="specific-obs-upload" className="hidden" onChange={(e) => handleSpecificFileChange(e, 'observation')} />
                                              <label htmlFor="specific-obs-upload" className="flex items-center justify-center gap-2 w-full p-2 border-2 border-dashed border-gray-200 rounded-lg text-gray-400 hover:border-amber-400 hover:text-amber-500 cursor-pointer text-[10px] font-bold uppercase bg-gray-50/50 transition-all">
                                                  <UploadCloud size={14} /> Ajouter Note
                                              </label>
                                          </div>
                                      )}
                                  </div>
                              </div>

                              {/* Approval Files */}
                              <div>
                                  <label className="block text-[10px] font-bold uppercase text-gray-400 mb-2">Pièces Jointes Approuvées</label>
                                  <div className="space-y-1.5">
                                      {(editSendForm.approvalFiles || []).map((file, idx) => (
                                          <div key={idx} className="flex items-center gap-2 text-xs bg-green-50/50 border border-green-100 p-2 rounded-lg group/file">
                                              <FileText size={14} className="text-green-500" />
                                              <span className="truncate flex-1 font-medium text-green-900">Approbation_{idx + 1}</span>
                                              <div className="flex items-center gap-1">
                                                  <button type="button" onClick={() => openFile(file)} className="p-1 text-green-600 hover:bg-green-100 rounded transition-colors"><FileIcon size={12}/></button>
                                                  <button type="button" onClick={() => handleSpecificFileDelete('approval', idx)} className="p-1 text-red-500 hover:bg-red-100 rounded transition-colors"><X size={12}/></button>
                                              </div>
                                          </div>
                                      ))}
                                      {(editSendForm.approvalFiles || []).length < 3 && (
                                          <div className="relative">
                                              <input type="file" id="specific-app-upload" className="hidden" onChange={(e) => handleSpecificFileChange(e, 'approval')} />
                                              <label htmlFor="specific-app-upload" className="flex items-center justify-center gap-2 w-full p-2 border-2 border-dashed border-gray-200 rounded-lg text-gray-400 hover:border-green-400 hover:text-green-500 cursor-pointer text-[10px] font-bold uppercase bg-gray-50/50 transition-all">
                                                  <UploadCloud size={14} /> Ajouter Fichier
                                              </label>
                                          </div>
                                      )}
                                  </div>
                              </div>
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
    </>
  );
};
