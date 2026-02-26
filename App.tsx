import React, { useState, useEffect } from 'react';
import { Layout } from './components/Layout';
import { DocumentList } from './components/DocumentList';
import { BordereauView } from './components/BordereauView';
import { SettingsView } from './components/SettingsView';
import { Dashboard } from './components/Dashboard';
import { BTPDocument, ApprovalStatus } from './types';
import { fetchDocumentsFromSheet, saveDocumentsToSheet } from './services/googleSheetService';
import { Loader2 } from 'lucide-react';

const INITIAL_DOCS: BTPDocument[] = [
  {
    id: '1',
    lot: '01',
    classement: 'A',
    poste: 'GC',
    code: 'GC-FND-Z1-001',
    name: 'Plan de fondation - Zone Nord',
    currentRevisionIndex: 0,
    revisions: [
      { 
        id: 'r1', 
        index: '00', 
        transmittalRef: 'B-001', 
        transmittalDate: '2023-10-15', 
        observationRef: 'VISA-001', 
        observationDate: '2023-10-20',
        approvalDate: '2023-10-22',
        returnDate: '2023-10-25',
        status: ApprovalStatus.APPROVED,
        transmittalFiles: [],
        observationFiles: []
      }
    ]
  },
  {
    id: '2',
    lot: '02',
    classement: 'B',
    poste: 'ELEC',
    code: 'EL-SCH-GEN-001',
    name: 'Schéma unifilaire général',
    currentRevisionIndex: 0,
    revisions: [
      { 
        id: 'r1', 
        index: '01', 
        transmittalRef: 'B-002', 
        transmittalDate: '2023-10-28', 
        observationRef: 'OBS-005', 
        observationDate: '2023-11-02', 
        status: ApprovalStatus.REJECTED,
        transmittalFiles: [],
        observationFiles: [] 
      }
    ]
  },
  {
    id: '3',
    lot: '01',
    classement: 'A',
    poste: 'GC',
    code: 'GC-COU-MV-004',
    name: 'Coupe de principe Mur Voile',
    currentRevisionIndex: 0,
    revisions: [
      { 
        id: 'r1', 
        index: '00', 
        transmittalRef: 'B-003', 
        transmittalDate: '2023-11-05', 
        status: ApprovalStatus.NO_RESPONSE,
        transmittalFiles: [],
        observationFiles: [] 
      }
    ]
  }
];

export default function App() {
  const [activeTab, setActiveTab] = useState('overview'); // Default to overview (Dashboard)
  const [initialDocFilter, setInitialDocFilter] = useState<ApprovalStatus | 'ALL'>('ALL');
  const [bordereauSelectedDocs, setBordereauSelectedDocs] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const [documents, setDocuments] = useState<BTPDocument[]>([]);
  const [isInitialized, setIsInitialized] = useState(false);

  // 1. Initial Load: Try Sheet first, merge with LocalStorage to keep files
  useEffect(() => {
      const initData = async () => {
          setLoading(true);
          
          try {
              // Fetch Cloud Data (Metadata mostly)
              const sheetDocs = await fetchDocumentsFromSheet();
              
              // Fetch Local Data (Contains Files)
              const localSaved = localStorage.getItem('btp-docs');
              const localDocs: BTPDocument[] = localSaved ? JSON.parse(localSaved) : [];

              if (sheetDocs && sheetDocs.length > 0) {
                  // Merge Strategy:
                  // Use Sheet docs as the master list (for rows/status), 
                  // but inject files from LocalStorage if IDs match.
                  const mergedDocs = sheetDocs.map(sDoc => {
                      const lDoc = localDocs.find(l => l.id === sDoc.id);
                      if (lDoc) {
                          // Restore files from local version to cloud version
                          const mergedRevisions = sDoc.revisions.map(sRev => {
                              const lRev = lDoc.revisions.find(r => r.id === sRev.id);
                              if (lRev) {
                                  return {
                                      ...sRev,
                                      transmittalFiles: (sRev.transmittalFiles && sRev.transmittalFiles.length > 0) ? sRev.transmittalFiles : lRev.transmittalFiles,
                                      observationFiles: (sRev.observationFiles && sRev.observationFiles.length > 0) ? sRev.observationFiles : lRev.observationFiles
                                  };
                              }
                              return sRev;
                          });
                          return { ...sDoc, revisions: mergedRevisions };
                      }
                      return sDoc;
                  });
                  setDocuments(mergedDocs);
              } else if (localDocs.length > 0) {
                  setDocuments(localDocs);
              } else {
                  setDocuments(INITIAL_DOCS);
              }
          } catch (e) {
              console.error("Init Error", e);
              // Fallback
              const localSaved = localStorage.getItem('btp-docs');
              setDocuments(localSaved ? JSON.parse(localSaved) : INITIAL_DOCS);
          } finally {
              setLoading(false);
              setIsInitialized(true);
          }
      };

      initData();
  }, []);

  // 2. Sync Effect: Update LocalStorage AND Google Sheet on changes
  useEffect(() => {
    if (!isInitialized) return;

    // Save Local (Full data with files)
    localStorage.setItem('btp-docs', JSON.stringify(documents));

    // Save Remote (Debounced, metadata only stripped in service)
    const syncToSheet = async () => {
        setSyncing(true);
        await saveDocumentsToSheet(documents);
        setSyncing(false);
    };

    const timeoutId = setTimeout(() => {
        syncToSheet();
    }, 2000);

    return () => clearTimeout(timeoutId);

  }, [documents, isInitialized]);


  const addDocument = (doc: BTPDocument) => {
    setDocuments(prev => [...prev, doc]);
  };

  const updateDocument = (updatedDoc: BTPDocument) => {
    setDocuments(prev => prev.map(d => d.id === updatedDoc.id ? updatedDoc : d));
  };

  const deleteDocument = (id: string) => {
    setDocuments(prev => prev.filter(d => d.id !== id));
    setBordereauSelectedDocs(prev => prev.filter(docId => docId !== id));
  };

  const handleNavigateToDocs = (filter: ApprovalStatus | 'ALL') => {
      setInitialDocFilter(filter);
      setActiveTab('documents');
  };

  const handleAddToBordereau = (docId: string) => {
      if (!bordereauSelectedDocs.includes(docId)) {
          setBordereauSelectedDocs(prev => [...prev, docId]);
      }
      setActiveTab('bordereaux');
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'overview':
        return <Dashboard documents={documents} onNavigateToDocs={handleNavigateToDocs} />;
      case 'documents':
        return <DocumentList 
            documents={documents} 
            onAddDocument={addDocument} 
            onUpdateDocument={updateDocument} 
            onDeleteDocument={deleteDocument}
            onNavigateToBordereau={() => setActiveTab('bordereaux')}
            onAddToBordereau={handleAddToBordereau}
            initialFilter={initialDocFilter}
        />;
      case 'bordereaux':
        return <BordereauView 
            documents={documents} 
            onAddDocument={addDocument} 
            onUpdateDocument={updateDocument} 
            onDeleteDocument={deleteDocument}
            selectedDocs={bordereauSelectedDocs}
            setSelectedDocs={setBordereauSelectedDocs}
        />;
      case 'settings':
        return <SettingsView />;
      default:
        return <Dashboard documents={documents} onNavigateToDocs={handleNavigateToDocs} />;
    }
  };

  if (loading) {
      return (
          <div className="h-screen w-screen flex flex-col items-center justify-center bg-gray-50 text-gray-500 gap-4">
              <Loader2 className="animate-spin text-blue-600" size={48} />
              <p>Chargement et Synchronisation SBF...</p>
          </div>
      );
  }

  return (
    <Layout activeTab={activeTab} setActiveTab={setActiveTab}>
      {syncing && (
          <div className="fixed bottom-4 right-4 bg-white/90 shadow-lg border border-blue-100 rounded-full px-4 py-2 flex items-center gap-2 text-xs font-medium text-blue-600 z-50 animate-pulse">
              <Loader2 className="animate-spin" size={12} />
              Sauvegarde Cloud...
          </div>
      )}
      {renderContent()}
    </Layout>
  );
}