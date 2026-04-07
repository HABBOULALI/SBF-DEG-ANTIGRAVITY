import React, { useState, useEffect } from 'react';
import { Layout } from './components/Layout';
import { DocumentList } from './components/DocumentList';
import { BordereauView } from './components/BordereauView';
import { SettingsView } from './components/SettingsView';
import { Dashboard } from './components/Dashboard';
import { BTPDocument, ApprovalStatus } from './types';
import { Loader2 } from 'lucide-react';
import { useAuth } from './context/AuthContext';
import { Login } from './components/Login';
import { firestoreService } from './services/firestoreService';
import toast, { Toaster } from 'react-hot-toast';

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
  const { user, loading: authLoading } = useAuth();
  
  // THEME MANAGEMENT (Dark mode by default)
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
      const saved = localStorage.getItem('sbf-theme');
      return (saved as 'light' | 'dark') || 'dark';
  });

  useEffect(() => {
      document.documentElement.classList.remove('light', 'dark');
      document.documentElement.classList.add(theme);
      localStorage.setItem('sbf-theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme(prev => prev === 'light' ? 'dark' : 'light');

  const [documents, setDocuments] = useState<BTPDocument[]>([]);
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
      // If we aren't logged in, don't try to fetch
      if (!user) {
          return;
      }
      
      setLoading(true);
      let isInitialLoad = true;

      const unsubscribe = firestoreService.subscribeToDocuments((fetchedDocs) => {
          if (isInitialLoad) {
              if (fetchedDocs.length === 0) {
                  // Fallback for visual testing
                  setDocuments(INITIAL_DOCS);
              } else {
                  setDocuments(fetchedDocs);
              }
              setLoading(false);
              setIsInitialized(true);
              isInitialLoad = false;
          } else {
              setDocuments(fetchedDocs);
          }
      }, (error) => {
          console.error("Firestore Init Error (Peut-être lié aux règles de sécurité Firestore):", error);
          // Fallback to local
          const localSaved = localStorage.getItem('btp-docs');
          setDocuments(localSaved ? JSON.parse(localSaved) : INITIAL_DOCS);
          setLoading(false);
          setIsInitialized(true);
      });

      return () => unsubscribe();
  }, [user]);

  // Keep a small local backup just in case
  useEffect(() => {
      if (isInitialized && documents.length > 0) {
          localStorage.setItem('btp-docs', JSON.stringify(documents));
      }
  }, [documents, isInitialized]);

  const addDocument = async (doc: BTPDocument) => {
    // Optimistic UI update
    setDocuments(prev => [...prev, doc]);
    setSyncing(true);
    try {
        await firestoreService.addDocument(doc);
        toast.success("Document ajouté avec succès !");
    } catch(err) {
        toast.error("Erreur de sauvegarde Firestore. Veuillez vérifier les permissions.");
        // Revert 
        setDocuments(prev => prev.filter(d => d.id !== doc.id));
    } finally {
        setSyncing(false);
    }
  };

  const updateDocument = async (updatedDoc: BTPDocument) => {
    const backup = documents;
    setDocuments(prev => prev.map(d => d.id === updatedDoc.id ? updatedDoc : d));
    setSyncing(true);
    try {
        await firestoreService.updateDocument(updatedDoc);
        toast.success("Document mis à jour !");
    } catch(err) {
        toast.error("Erreur de modification Firestore.");
        setDocuments(backup);
    } finally {
        setSyncing(false);
    }
  };

  const deleteDocument = async (id: string) => {
    const backup = documents;
    setDocuments(prev => prev.filter(d => d.id !== id));
    setBordereauSelectedDocs(prev => prev.filter(docId => docId !== id));
    setSyncing(true);
    try {
        await firestoreService.deleteDocument(id);
        toast.success("Document supprimé définitivement.");
    } catch(err) {
        toast.error("Erreur de suppression Firestore.");
        setDocuments(backup);
    } finally {
        setSyncing(false);
    }
  };

  const handleNavigateToDocs = (filter: ApprovalStatus | 'ALL') => {
      setInitialDocFilter(filter);
      setActiveTab('documents');
  };

  const handleAddToBordereau = (docId: string) => {
      if (user?.role === 'viewer') {
          toast.error("Action non autorisée pour votre profil.");
          return;
      }
      if (!bordereauSelectedDocs.includes(docId)) {
          setBordereauSelectedDocs(prev => [...prev, docId]);
      }
      setActiveTab('bordereaux');
  };

  const renderContent = () => {
    // Role-based security redirection
    if (user?.role === 'viewer' && ['bordereaux', 'settings'].includes(activeTab)) {
        setActiveTab('overview');
        return <Dashboard documents={documents} onNavigateToDocs={handleNavigateToDocs} />;
    }
    if (user?.role === 'editor' && activeTab === 'settings') {
        setActiveTab('overview');
        return <Dashboard documents={documents} onNavigateToDocs={handleNavigateToDocs} />;
    }

    switch (activeTab) {
      case 'overview':
        return <Dashboard documents={documents} onNavigateToDocs={handleNavigateToDocs} />;
      case 'documents':
        return <DocumentList 
            documents={documents} 
            onAddDocument={addDocument} 
            onUpdateDocument={updateDocument} 
            onDeleteDocument={deleteDocument}
            onNavigateToBordereau={() => {
                if (user?.role === 'viewer') toast.error("Action non autorisée.");
                else setActiveTab('bordereaux');
            }}
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

  if (loading || authLoading) {
      return (
          <div className="h-screen w-screen flex flex-col items-center justify-center bg-gray-50 dark:bg-slate-900 text-gray-500 dark:text-slate-400 gap-4 transition-colors">
              <Loader2 className="animate-spin text-blue-600" size={48} />
              <p>Chargement et Synchronisation SBF...</p>
          </div>
      );
  }

  if (!user) {
    return <Login />;
  }

  return (
    <Layout activeTab={activeTab} setActiveTab={setActiveTab} theme={theme} onToggleTheme={toggleTheme}>
      <Toaster 
          position="bottom-right" 
          toastOptions={{
              duration: 4000,
              style: {
                  background: theme === 'dark' ? '#1e293b' : '#333',
                  color: '#fff',
                  fontSize: '14px',
                  borderRadius: '10px',
                  border: theme === 'dark' ? '1px solid #334155' : 'none',
              },
              success: { style: { background: '#16a34a' } },
              error: { style: { background: '#dc2626' } },
          }} 
      />
      {syncing && (
          <div className="fixed bottom-4 right-4 bg-white/90 dark:bg-slate-800/90 shadow-lg border border-blue-100 dark:border-blue-900 rounded-full px-4 py-2 flex items-center gap-2 text-xs font-medium text-blue-600 dark:text-blue-400 z-50 animate-pulse transition-colors">
              <Loader2 className="animate-spin" size={12} />
              Sauvegarde ...
          </div>
      )}
      {renderContent()}
    </Layout>
  );
}