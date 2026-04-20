import React, { useState, useEffect, useRef } from 'react';
import { Save, Building, FileText, MapPin, Phone, Upload, Image as ImageIcon, Trash2, Check, Users, Plus, X, Database, Link, AlertTriangle, AlertCircle, Play, CheckCircle2, XCircle, Loader2, UserPlus, Shield, Mail, KeyRound, Search, UserCog } from 'lucide-react';
import { Logo } from './Logo';
import { useAuth, UserRole } from '../context/AuthContext';
import { db, firebaseConfig } from '../services/firebase';
import { collection, doc, getDocs, setDoc, updateDoc, onSnapshot, query, orderBy } from 'firebase/firestore';
import { initializeApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signOut, sendPasswordResetEmail } from 'firebase/auth';
import toast from 'react-hot-toast';

interface Stakeholder {
    name: string;
    contacts: string[];
}

interface AppSettings {
    companyName: string;
    companySubtitle: string;
    projectCode: string;
    projectName: string;
    address: string;
    contact: string;
    defaultValidator: string;
    logoMDO?: string;
    documentNatures: string[];
    stakeholders: {
        client: Stakeholder;
        consultant: Stakeholder;
        control: Stakeholder;
    };
    recipients: Stakeholder[];
    senders: string[];
    googleDriveScriptUrl?: string;
    googleDriveRootFolderId?: string;
}

interface UserData {
    uid: string;
    email: string;
    role: UserRole;
    createdAt?: string;
}

export const SettingsView: React.FC = () => {
  const { user: currentUser } = useAuth();
  const isAdmin = currentUser?.role === 'admin';
  
  const [activeTab, setActiveTab] = useState<'general' | 'users'>('general');
  const [settings, setSettings] = useState<AppSettings>({
    companyName: 'Société Bouzguenda Frères',
    companySubtitle: 'Entreprise Générale de Bâtiments',
    projectCode: 'PRJ-2024-HZ',
    projectName: 'Construction Siège Horizon',
    address: '41 Rue 8600 ZI La Charguia 1. Tunis',
    contact: 'Tél. : 70 557 900 - Fax : 70 557 999',
    defaultValidator: 'Bureau de Contrôle',
    logo: '',
    logoMDO: '',
    documentNatures: ['Plans', 'Notes de calcul', 'Fiches Techniques', 'Documents Administratifs'],
    stakeholders: {
        client: { name: 'Maître d\'Ouvrage', contacts: ['M. Le Directeur Technique'] },
        consultant: { name: 'Bureau d\'Études Structure', contacts: ['M. L\'Ingénieur Conseil'] },
        control: { name: 'Bureau de Contrôle', contacts: ['M. Le Contrôleur Technique'] }
    },
    recipients: [
        { name: 'Maître d\'Ouvrage', contacts: ['Directeur Technique'] },
        { name: 'Bureau de Contrôle', contacts: ['Contrôleur Technique'] }
    ],
    senders: ['Directeur de Projet', 'Chef de Chantier', 'Ingénieur Méthodes']
    ,
    googleDriveScriptUrl: '',
    googleDriveRootFolderId: ''
  });

  const [selectedRecipientIdx, setSelectedRecipientIdx] = useState<number | null>(null);
  const [newContact, setNewContact] = useState('');

  const [newType, setNewType] = useState('');
  const [newRecipient, setNewRecipient] = useState('');
  const [newSender, setNewSender] = useState('');
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState<UserData[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Create User Modal
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newUser, setNewUser] = useState({ email: '', password: '', role: 'viewer' as UserRole });
  const [creatingUser, setCreatingUser] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserData | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [resettingPassword, setResettingPassword] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const fileInputMdoRef = useRef<HTMLInputElement>(null);

  // Load Settings from Firestore
  useEffect(() => {
    const fetchSettings = async () => {
        const docRef = doc(db, 'config', 'app_settings');
        const snap = await getDocs(query(collection(db, 'config'))); // Just to check
        // For simplicity, we use one doc 'app_settings'
        const unsubscribe = onSnapshot(doc(db, 'config', 'app_settings'), (doc) => {
            if (doc.exists()) {
                const data = doc.data() as AppSettings;
                if (!data.documentNatures && (data as any).documentTypes) {
                    data.documentNatures = (data as any).documentTypes;
                }
                if (!data.documentNatures) {
                    data.documentNatures = ['Plans', 'Notes de calcul', 'Fiches Techniques', 'Documents Administratifs'];
                }
                setSettings(data);
            } else {
                // If not in Firestore, try local as backup
                const saved = localStorage.getItem('btp-app-settings');
                if (saved) setSettings(JSON.parse(saved));
            }
        });
        return () => unsubscribe();
    };
    fetchSettings();
  }, []);

  // Load Users from Firestore
  useEffect(() => {
    if (activeTab === 'users' && isAdmin) {
        setUsersLoading(true);
        const q = query(collection(db, 'users'), orderBy('email'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const usersList: UserData[] = [];
            snapshot.forEach((doc) => {
                usersList.push({ uid: doc.id, ...doc.data() } as UserData);
            });
            setUsers(usersList);
            setUsersLoading(false);
        });
        return () => unsubscribe();
    }
  }, [activeTab, isAdmin]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSettings({ ...settings, [e.target.name]: e.target.value });
  };

  const handleSave = async () => {
    setLoading(true);
    try {
        await setDoc(doc(db, 'config', 'app_settings'), settings);
        localStorage.setItem('btp-app-settings', JSON.stringify(settings));
        window.dispatchEvent(new Event('btp-app-settings-updated'));
        toast.success("Paramètres enregistrés dans le cloud !");
    } catch (e) {
        console.error(e);
        toast.error("Erreur d'enregistrement.");
    } finally {
        setLoading(false);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
     e.preventDefault();
     if (!newUser.email || !newUser.password) return;
     setCreatingUser(true);
     
     try {
         // IMPORTANT: To create a user WITHOUT logging out the admin, 
         // we initialize a secondary Firebase app instance
         const secondaryApp = initializeApp(firebaseConfig, 'SecondaryApp');
         const secondaryAuth = getAuth(secondaryApp);
         
         const userCredential = await createUserWithEmailAndPassword(secondaryAuth, newUser.email, newUser.password);
         const uid = userCredential.user.uid;
         
         // Create the Firestore document for user record/role
         await setDoc(doc(db, 'users', uid), {
             email: newUser.email,
             role: newUser.role,
             createdAt: new Date().toISOString()
         });

         // Sign out from the secondary instance
         await signOut(secondaryAuth);
         
         toast.success(`Compte créé pour ${newUser.email}`);
         setIsAddModalOpen(false);
         setNewUser({ email: '', password: '', role: 'viewer' });
     } catch (err: any) {
         console.error(err);
         toast.error(err.message || "Erreur lors de la création du compte.");
     } finally {
         setCreatingUser(false);
     }
  };

  const handleUpdateUser = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!selectedUser) return;
      setLoading(true);
      try {
          await updateDoc(doc(db, 'users', selectedUser.uid), {
              role: selectedUser.role,
              email: selectedUser.email
          });
          toast.success("Informations mises à jour.");
          setIsEditModalOpen(false);
      } catch (err) {
          toast.error("Échec de la mise à jour.");
      } finally {
          setLoading(false);
      }
  };

  const handlePasswordReset = async (email: string) => {
      if (!window.confirm(`Envoyer un email de réinitialisation à ${email} ?`)) return;
      setResettingPassword(true);
      try {
          const auth = getAuth();
          await sendPasswordResetEmail(auth, email);
          toast.success("Email de réinitialisation envoyé !");
      } catch (err: any) {
          console.error(err);
          toast.error("Erreur lors de l'envoi de l'email.");
      } finally {
          setResettingPassword(false);
      }
  };

  const handleUpdateRole = async (targetUid: string, newRole: UserRole) => {
      // Prevent self-demotion
      if (targetUid === currentUser?.uid) {
          toast.error("Vous ne pouvez pas changer votre propre rôle.");
          return;
      }
      
      try {
          await updateDoc(doc(db, 'users', targetUid), { role: newRole });
          toast.success("Rôle mis à jour.");
      } catch (err) {
          toast.error("Échec de la mise à jour.");
      }
  };

  const addContact = (type: 'client' | 'consultant' | 'control') => {
      // Logic remained the same
  };

  const renderGeneralTab = () => (
    <div className="space-y-8 animate-in fade-in duration-300">
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-900/30 p-4 rounded-lg flex items-start gap-3">
            <AlertCircle className="text-blue-600 dark:text-blue-400 mt-0.5" size={20} />
            <p className="text-[13px] text-blue-800 dark:text-blue-200">
                L'intégration <b>Google Sheets</b> a été supprimée. Vos données sont désormais directement synchronisées en temps réel via <b>Firebase Firestore</b>.
            </p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 transition-colors space-y-4">
            <div>
                <h3 className="text-base font-semibold text-gray-700 dark:text-slate-300 transition-colors">Configuration Google Drive</h3>
                <p className="text-xs text-gray-500 mt-1">
                    Ajoutez l'URL du Web App Apps Script et, si vous en avez un, l'identifiant du dossier racine Drive.
                </p>
            </div>
            <div className="space-y-3">
                <input
                    name="googleDriveScriptUrl"
                    value={settings.googleDriveScriptUrl || ''}
                    onChange={handleChange}
                    className="w-full p-2.5 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-white rounded-lg text-[13px] transition-colors"
                    placeholder="https://script.google.com/macros/s/.../exec"
                />
                <input
                    name="googleDriveRootFolderId"
                    value={settings.googleDriveRootFolderId || ''}
                    onChange={handleChange}
                    className="w-full p-2.5 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-white rounded-lg text-[13px] transition-colors"
                    placeholder="ID du dossier Drive racine (optionnel)"
                />
            </div>
        </div>

        {/* Section Logo */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Logo SBF (Gauche) */}
                <div className="flex flex-col gap-3">
                    <h4 className="text-[11px] font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider">Logo Entreprise (Gauche)</h4>
                    <div className="flex items-start gap-4">
                        <div className="w-24 h-24 border-2 border-dashed border-gray-300 dark:border-slate-700 rounded-lg flex items-center justify-center bg-gray-50 dark:bg-slate-800 overflow-hidden relative group shrink-0">
                            {settings.logo ? (
                                <img src={settings.logo} alt="Logo SBF" className="w-full h-full object-contain p-2" />
                            ) : (
                                <Logo className="w-12 h-12 text-gray-300 dark:text-slate-600" />
                            )}
                        </div>
                        <div className="space-y-2">
                            <button 
                                onClick={() => fileInputRef.current?.click()}
                                className="bg-white border border-gray-300 text-gray-700 px-3 py-1.5 rounded-lg flex items-center gap-2 hover:bg-gray-50 transition-colors text-xs font-medium"
                            >
                                <Upload size={14} /> SBF Logo
                            </button>
                            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" 
                                onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) {
                                        const reader = new FileReader();
                                        reader.onloadend = () => setSettings({...settings, logo: reader.result as string});
                                        reader.readAsDataURL(file);
                                    }
                                }} 
                            />
                            <p className="text-[10px] text-gray-400">PNG/JPG (Max 500KB).</p>
                        </div>
                    </div>
                </div>

                {/* Logo MDO (Droite) */}
                <div className="flex flex-col gap-3">
                    <h4 className="text-sm font-bold text-gray-500 uppercase">Logo Maître d'Ouvrage (Droite)</h4>
                    <div className="flex items-start gap-4">
                        <div className="w-24 h-24 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center bg-gray-50 overflow-hidden relative group shrink-0">
                            {settings.logoMDO ? (
                                <img src={settings.logoMDO} alt="Logo MDO" className="w-full h-full object-contain p-2" />
                            ) : (
                                <ImageIcon className="w-12 h-12 text-gray-300" />
                            )}
                        </div>
                        <div className="space-y-2">
                            <button 
                                onClick={() => fileInputMdoRef.current?.click()}
                                className="bg-white border border-gray-300 text-gray-700 px-3 py-1.5 rounded-lg flex items-center gap-2 hover:bg-gray-50 transition-colors text-xs font-medium"
                            >
                                <Upload size={14} /> MDO Logo
                            </button>
                            <input ref={fileInputMdoRef} type="file" accept="image/*" className="hidden" 
                                onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) {
                                        const reader = new FileReader();
                                        reader.onloadend = () => setSettings({...settings, logoMDO: reader.result as string});
                                        reader.readAsDataURL(file);
                                    }
                                }} 
                            />
                            <p className="text-[10px] text-gray-400">Pour l'export Excel.</p>
                        </div>
                    </div>
                </div>
            </div>

        {/* Section Entreprise & Projet */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
                <h3 className="text-base font-semibold border-b dark:border-slate-800 pb-2 text-gray-700 dark:text-slate-300 transition-colors">Informations Entreprise</h3>
                <div className="space-y-3">
                    <input name="companyName" value={settings.companyName} onChange={handleChange} className="w-full p-2.5 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-white rounded-lg text-[13px] transition-colors" placeholder="Nom Société" />
                    <input name="companySubtitle" value={settings.companySubtitle} onChange={handleChange} className="w-full p-2.5 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-white rounded-lg text-[13px] transition-colors" placeholder="Activité" />
                    <input name="address" value={settings.address} onChange={handleChange} className="w-full p-2.5 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-white rounded-lg text-[13px] transition-colors" placeholder="Adresse" />
                </div>
            </div>
            <div className="space-y-4">
                <h3 className="text-base font-semibold border-b dark:border-slate-800 pb-2 text-gray-700 dark:text-slate-300 transition-colors">Informations Projet</h3>
                <div className="space-y-3">
                    <input name="projectName" value={settings.projectName} onChange={handleChange} className="w-full p-2.5 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-white rounded-lg text-[13px] transition-colors" placeholder="Projet" />
                    <input name="projectCode" value={settings.projectCode} onChange={handleChange} className="w-full p-2.5 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-white rounded-lg text-[13px] transition-colors" placeholder="Code Projet" />
                </div>
            </div>
        </div>

        <div className="space-y-4">
            <h3 className="text-base font-semibold border-b dark:border-slate-800 pb-2 text-gray-700 dark:text-slate-300 transition-colors flex items-center gap-2">
                <FileText size={18} className="text-blue-500" /> Gestion des Natures de Documents
            </h3>
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 transition-colors space-y-4">
                <p className="text-xs text-gray-500">Ces natures seront disponibles dans la liste déroulante du suivi des documents.</p>
                <div className="flex flex-wrap gap-2">
                    {settings.documentNatures.map((nature, idx) => (
                        <div key={idx} className="flex items-center gap-2 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 px-3 py-1.5 rounded-lg border border-blue-100 dark:border-blue-900/30 text-[13px] font-medium group">
                            {nature}
                            <button 
                                onClick={() => setSettings({...settings, documentNatures: settings.documentNatures.filter((_, i) => i !== idx)})}
                                className="text-blue-400 hover:text-red-500 transition-colors"
                            >
                                <X size={14} />
                            </button>
                        </div>
                    ))}
                </div>
                <div className="flex gap-2 max-w-sm mt-4">
                    <input 
                        type="text" 
                        value={newType}
                        onChange={(e) => setNewType(e.target.value)}
                        placeholder="Nouvelle nature (ex: Rapport Géo)"
                        className="flex-1 p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-white rounded-lg text-[13px] outline-none focus:ring-2 focus:ring-blue-500"
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && newType.trim()) {
                                e.preventDefault();
                                if (!settings.documentNatures.includes(newType.trim())) {
                                    setSettings({...settings, documentNatures: [...settings.documentNatures, newType.trim()]});
                                }
                                setNewType('');
                            }
                        }}
                    />
                    <button 
                        onClick={() => {
                            if (newType.trim()) {
                                if (!settings.documentNatures.includes(newType.trim())) {
                                    setSettings({...settings, documentNatures: [...settings.documentNatures, newType.trim()]});
                                }
                                setNewType('');
                            }
                        }}
                        className="bg-blue-600 text-white px-3 rounded-lg hover:bg-blue-700 transition-colors"
                    >
                        <Plus size={18} />
                    </button>
                </div>
            </div>
        </div>

        {/* Nouveaux Listes : Destinataires et Expéditeurs */}
        <div className="space-y-8 mt-8">
            <div className="space-y-4">
                <h3 className="text-base font-semibold border-b dark:border-slate-800 pb-2 text-gray-700 dark:text-slate-300 transition-colors flex items-center gap-2">
                    <Users size={18} className="text-green-500" /> Gestion des Destinataires et Contacts
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Liste des Destinataires */}
                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 transition-colors space-y-4">
                        <label className="text-xs font-bold text-gray-400 uppercase tracking-wider block">Destinataires</label>
                        <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2">
                            {(settings.recipients || []).map((rec, idx) => (
                                <div 
                                    key={idx} 
                                    onClick={() => setSelectedRecipientIdx(idx)}
                                    className={`flex items-center justify-between p-3 rounded-xl border transition-all cursor-pointer group ${selectedRecipientIdx === idx ? 'bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800' : 'bg-slate-50 border-slate-100 dark:bg-slate-800/50 dark:border-slate-700 hover:border-green-200'}`}
                                >
                                    <span className={`text-sm font-bold ${selectedRecipientIdx === idx ? 'text-green-700 dark:text-green-400' : 'text-slate-600 dark:text-slate-300'}`}>
                                        {rec.name}
                                    </span>
                                    <button 
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            const newRecs = settings.recipients.filter((_, i) => i !== idx);
                                            setSettings({...settings, recipients: newRecs});
                                            if (selectedRecipientIdx === idx) setSelectedRecipientIdx(null);
                                        }}
                                        className="text-slate-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            ))}
                        </div>
                        <div className="flex gap-2 mt-4 pt-4 border-t dark:border-slate-800">
                            <input 
                                type="text" 
                                value={newRecipient}
                                onChange={(e) => setNewRecipient(e.target.value)}
                                placeholder="Nom du destinataire..."
                                className="flex-1 p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-white rounded-lg text-sm outline-none focus:ring-2 focus:ring-green-500"
                            />
                            <button 
                                onClick={() => {
                                    if (newRecipient.trim()) {
                                        const val = newRecipient.trim();
                                        if (!settings.recipients.some(r => r.name === val)) {
                                            const newR = { name: val, contacts: [] };
                                            setSettings({...settings, recipients: [...settings.recipients, newR]});
                                            setSelectedRecipientIdx(settings.recipients.length);
                                        }
                                        setNewRecipient('');
                                    }
                                }}
                                className="bg-green-600 text-white px-3 rounded-lg hover:bg-green-700 transition-colors"
                            >
                                <Plus size={18} />
                            </button>
                        </div>
                    </div>

                    {/* Liste des Contacts (À l'attention de) */}
                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 transition-colors space-y-4">
                        <label className="text-xs font-bold text-gray-400 uppercase tracking-wider block">
                            Contacts pour : <span className="text-green-600 dark:text-green-400">
                                {selectedRecipientIdx !== null ? settings.recipients[selectedRecipientIdx]?.name : '---'}
                            </span>
                        </label>
                        
                        {selectedRecipientIdx !== null ? (
                            <>
                                <div className="flex flex-wrap gap-2 min-h-[100px] content-start">
                                    {settings.recipients[selectedRecipientIdx].contacts.map((contact, cIdx) => (
                                        <div key={cIdx} className="flex items-center gap-2 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 px-3 py-1.5 rounded-lg border border-blue-100 dark:border-blue-900/30 text-[13px] font-medium group">
                                            {contact}
                                            <button 
                                                onClick={() => {
                                                    const updatedRecs = [...settings.recipients];
                                                    updatedRecs[selectedRecipientIdx].contacts = updatedRecs[selectedRecipientIdx].contacts.filter((_, i) => i !== cIdx);
                                                    setSettings({...settings, recipients: updatedRecs});
                                                }}
                                                className="text-blue-400 hover:text-red-500 transition-colors"
                                            >
                                                <X size={14} />
                                            </button>
                                        </div>
                                    ))}
                                    {settings.recipients[selectedRecipientIdx].contacts.length === 0 && (
                                        <div className="w-full py-8 text-center text-slate-400 text-xs italic border-2 border-dashed border-slate-100 dark:border-slate-800 rounded-xl">
                                            Aucun responsable configuré
                                        </div>
                                    )}
                                </div>
                                <div className="flex gap-2 mt-4 pt-4 border-t dark:border-slate-800">
                                    <input 
                                        type="text" 
                                        value={newContact}
                                        onChange={(e) => setNewContact(e.target.value)}
                                        placeholder="Nom du responsable (À l'attention de...)"
                                        className="flex-1 p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-white rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
                                    />
                                    <button 
                                        onClick={() => {
                                            if (newContact.trim()) {
                                                const updatedRecs = [...settings.recipients];
                                                if (!updatedRecs[selectedRecipientIdx].contacts.includes(newContact.trim())) {
                                                    updatedRecs[selectedRecipientIdx].contacts.push(newContact.trim());
                                                    setSettings({...settings, recipients: updatedRecs});
                                                }
                                                setNewContact('');
                                            }
                                        }}
                                        className="bg-blue-600 text-white px-3 rounded-lg hover:bg-blue-700 transition-colors"
                                    >
                                        <Plus size={18} />
                                    </button>
                                </div>
                            </>
                        ) : (
                            <div className="flex flex-col items-center justify-center h-48 text-slate-400 space-y-2">
                                <Users size={32} className="opacity-20" />
                                <p className="text-xs">Sélectionnez un destinataire à gauche pour gérer ses contacts</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <div className="space-y-4">
                <h3 className="text-base font-semibold border-b dark:border-slate-800 pb-2 text-gray-700 dark:text-slate-300 transition-colors flex items-center gap-2">
                    <UserPlus size={18} className="text-purple-500" /> Liste "De la part de"
                </h3>
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 transition-colors space-y-4">
                    <div className="flex flex-wrap gap-2">
                        {(settings.senders || []).map((sender, idx) => (
                            <div key={idx} className="flex items-center gap-2 bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300 px-3 py-1.5 rounded-lg border border-purple-100 dark:border-purple-900/30 text-[13px] font-medium group">
                                {sender}
                                <button 
                                    onClick={() => setSettings({...settings, senders: settings.senders.filter((_, i) => i !== idx)})}
                                    className="text-purple-400 hover:text-red-500 transition-colors"
                                >
                                    <X size={14} />
                                </button>
                            </div>
                        ))}
                    </div>
                    <div className="flex gap-2 mt-4">
                        <input 
                            type="text" 
                            value={newSender}
                            onChange={(e) => setNewSender(e.target.value)}
                            placeholder="Nouvel expéditeur..."
                            className="flex-1 p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-white rounded-lg text-[13px] outline-none focus:ring-2 focus:ring-purple-500"
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && newSender.trim()) {
                                    e.preventDefault();
                                    const val = newSender.trim();
                                    if (!(settings.senders || []).includes(val)) {
                                        setSettings({...settings, senders: [...(settings.senders || []), val]});
                                    }
                                    setNewSender('');
                                }
                            }}
                        />
                        <button 
                            onClick={() => {
                                if (newSender.trim()) {
                                    const val = newSender.trim();
                                    if (!(settings.senders || []).includes(val)) {
                                        setSettings({...settings, senders: [...(settings.senders || []), val]});
                                    }
                                    setNewSender('');
                                }
                            }}
                            className="bg-purple-600 text-white px-3 rounded-lg hover:bg-purple-700 transition-colors"
                        >
                            <Plus size={18} />
                        </button>
                    </div>
                </div>
            </div>
        </div>

        <div className="pt-6 border-t flex justify-end">
            <button onClick={handleSave} disabled={loading} className="bg-blue-600 text-white px-6 py-2.5 rounded-lg flex items-center gap-2 hover:bg-blue-700 font-bold transition-all shadow-md active:scale-95 disabled:opacity-50">
                {loading ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />} Enregistrer tout
            </button>
        </div>
    </div>
  );

  const renderUsersTab = () => (
    <div className="space-y-6 animate-in fade-in duration-300">
        <div className="flex flex-col md:flex-row justify-between gap-4">
            <div className="relative flex-1">
                <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input 
                    type="text" placeholder="Rechercher un utilisateur..." 
                    className="w-full pl-10 pr-4 py-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-white rounded-lg outline-none focus:ring-2 focus:ring-blue-500 text-[13px] transition-colors"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
            </div>
            <button 
                onClick={() => setIsAddModalOpen(true)}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-blue-700 font-bold shadow-md transition-all active:scale-95 text-[13px]"
            >
                <UserPlus size={18} /> Créer un accès
            </button>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden transition-colors">
            <table className="w-full text-left text-[13px]">
                <thead className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
                    <tr>
                        <th className="p-2 text-gray-500 dark:text-slate-400 font-bold uppercase tracking-wider text-[9px]">Utilisateur</th>
                        <th className="p-2 text-gray-500 dark:text-slate-400 font-bold uppercase tracking-wider text-[9px]">Rôle / Accès</th>
                        <th className="p-2 text-gray-500 dark:text-slate-400 font-bold uppercase tracking-wider text-[9px]">Date Création</th>
                        <th className="p-2 text-gray-500 dark:text-slate-400 font-bold uppercase tracking-wider text-[9px]">Action</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
                    {usersLoading ? (
                        <tr><td colSpan={4} className="p-10 text-center text-gray-400 font-medium">Chargements des membres...</td></tr>
                    ) : users.filter(u => u.email.toLowerCase().includes(searchTerm.toLowerCase())).map(u => (
                        <tr key={u.uid} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                            <td className="p-2">
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-700 dark:text-blue-400 font-bold">
                                        {u.email[0].toUpperCase()}
                                    </div>
                                    <span className="font-medium text-gray-900 dark:text-white">{u.email}</span>
                                </div>
                            </td>
                            <td className="p-2">
                                <select 
                                    value={u.role}
                                    onChange={(e) => handleUpdateRole(u.uid, e.target.value as UserRole)}
                                    className={`text-[11px] font-bold px-2 py-1 rounded bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 outline-none focus:ring-2 focus:ring-blue-500 transition-colors ${
                                        u.role === 'admin' ? 'text-red-600' : 
                                        u.role === 'editor' ? 'text-amber-600' : 
                                        'text-blue-600'
                                    }`}
                                >
                                    <option value="admin">ADMINISTRATEUR</option>
                                    <option value="editor">ÉDITEUR (Modifie)</option>
                                    <option value="viewer">LECTEUR (Lecture Seule)</option>
                                </select>
                            </td>
                            <td className="p-2 text-gray-400 text-[10px]">
                                {u.createdAt ? new Date(u.createdAt).toLocaleDateString('fr-FR') : '-'}
                            </td>
                            <td className="p-2 flex gap-2">
                                <button 
                                    onClick={() => {
                                        setSelectedUser(u);
                                        setIsEditModalOpen(true);
                                    }}
                                    className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" 
                                    title="Modifier / Gérer"
                                >
                                    <UserCog size={16} />
                                </button>
                                <button className="p-2 text-gray-400 hover:bg-gray-100 rounded-lg transition-colors" title="Contacter">
                                    <Mail size={16} />
                                </button>
                             </td>
                         </tr>
                     ))}
                 </tbody>
            </table>
        </div>
    </div>
  );

  return (
    <div className="max-w-5xl mx-auto space-y-6 mb-20 p-4">
        {/* TAB NAVIGATION */}
        <div className="flex items-center border-b border-gray-200 space-x-8">
            <button 
                onClick={() => setActiveTab('general')}
                className={`py-4 px-1 text-sm font-bold flex items-center gap-2 border-b-2 transition-all ${activeTab === 'general' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-400 hover:text-gray-600'}`}
            >
                <Database size={18} /> Configuration Globale
            </button>
            {isAdmin && (
                <button 
                    onClick={() => setActiveTab('users')}
                    className={`py-4 px-1 text-sm font-bold flex items-center gap-2 border-b-2 transition-all ${activeTab === 'users' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-400 hover:text-gray-600'}`}
                >
                    <Users size={18} /> Gestion des Utilisateurs
                </button>
            )}
        </div>

        {activeTab === 'general' ? renderGeneralTab() : renderUsersTab()}

        {/* MODAL CREATION UTILISATEUR */}
        {isAddModalOpen && (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in fade-in duration-200 border border-gray-100 dark:border-slate-800 transition-colors">
                    <div className="bg-blue-600 p-6 text-white flex justify-between items-center text-[13px]">
                        <div>
                            <h3 className="text-lg font-bold">Créer un nouvel accès</h3>
                            <p className="text-blue-100 text-[11px]">Le mot de passe pourra être changé par l'utilisateur plus tard.</p>
                        </div>
                        <button onClick={() => setIsAddModalOpen(false)} className="hover:bg-blue-500 p-1 rounded-full transition-colors"><X size={20}/></button>
                    </div>
                    
                    <form onSubmit={handleCreateUser} className="p-6 space-y-5">
                        <div>
                            <label className="block text-[11px] font-bold text-gray-500 dark:text-slate-400 uppercase mb-2">Adresse Email</label>
                            <div className="relative">
                                <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                <input 
                                    type="email" required placeholder="nom.prenom@sbf.com" 
                                    className="w-full pl-10 pr-4 py-2.5 bg-gray-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-[13px] text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
                                    value={newUser.email} onChange={e => setNewUser({...newUser, email: e.target.value})}
                                />
                            </div>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Mot de Passe Temporaire</label>
                            <div className="relative">
                                <KeyRound size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                <input 
                                    type="password" required minLength={6} placeholder="••••••"
                                    className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
                                    value={newUser.password} onChange={e => setNewUser({...newUser, password: e.target.value})}
                                />
                            </div>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Rôle de l'utilisateur</label>
                            <div className="grid grid-cols-3 gap-3">
                                {(['viewer', 'editor', 'admin'] as UserRole[]).map(role => (
                                    <button 
                                        key={role} type="button"
                                        onClick={() => setNewUser({...newUser, role})}
                                        className={`py-2 px-1 border rounded-lg text-[10px] font-bold uppercase transition-all ${
                                            newUser.role === role ? 'bg-blue-600 border-blue-600 text-white shadow-md' : 'bg-white border-slate-200 text-gray-400 hover:border-blue-200'
                                        }`}
                                    >
                                        {role === 'admin' ? 'Admin' : role === 'editor' ? 'Éditeur' : 'Lecteur'}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="pt-4 border-t flex justify-end gap-3">
                            <button type="button" onClick={() => setIsAddModalOpen(false)} className="px-4 py-2 text-gray-500 text-sm font-medium hover:bg-gray-100 rounded-lg">Annuler</button>
                            <button 
                                type="submit" disabled={creatingUser}
                                className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-md hover:bg-blue-700 disabled:opacity-50"
                            >
                                {creatingUser ? "Création..." : "Confirmer la création"}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        )}

        {/* MODAL MODIFICATION UTILISATEUR */}
        {isEditModalOpen && selectedUser && (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in fade-in duration-200 border border-gray-100 dark:border-slate-800 transition-colors">
                    <div className="bg-slate-900 dark:bg-slate-800 p-6 text-white flex justify-between items-center transition-colors">
                        <div>
                            <h3 className="text-lg font-bold">Gérer l'utilisateur</h3>
                            <p className="text-slate-400 text-[11px] font-medium">{selectedUser.email}</p>
                        </div>
                        <button onClick={() => setIsEditModalOpen(false)} className="hover:bg-slate-800 dark:hover:bg-slate-700 p-1 rounded-full transition-colors"><X size={20}/></button>
                    </div>
                    
                    <div className="p-6 space-y-6">
                        <section className="space-y-4">
                            <h4 className="text-xs font-bold text-gray-500 uppercase border-b pb-2">Accès & Rôle</h4>
                            <div>
                                <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Changer le Rôle</label>
                                <div className="grid grid-cols-3 gap-2">
                                    {(['viewer', 'editor', 'admin'] as UserRole[]).map(role => (
                                        <button 
                                            key={role} type="button"
                                            onClick={() => setSelectedUser({...selectedUser, role})}
                                            className={`py-2 px-1 border rounded-lg text-[10px] font-bold uppercase transition-all ${
                                                selectedUser.role === role ? 'bg-blue-600 border-blue-600 text-white shadow-md' : 'bg-white border-slate-200 text-gray-400 hover:border-blue-200'
                                            }`}
                                        >
                                            {role === 'admin' ? 'Admin' : role === 'editor' ? 'Éditeur' : 'Lecteur'}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </section>

                        <section className="space-y-4 pt-4 border-t border-slate-100">
                            <h4 className="text-xs font-bold text-gray-500 uppercase border-b pb-2">Sécurité</h4>
                            <div className="bg-amber-50 p-3 rounded-lg border border-amber-100">
                                <p className="text-[11px] text-amber-800 leading-relaxed mb-3">
                                    En cas d'oubli de mot de passe, l'administrateur peut envoyer un lien de réinitialisation sécurisé par email.
                                </p>
                                <button 
                                    onClick={() => handlePasswordReset(selectedUser.email)}
                                    disabled={resettingPassword}
                                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-white border border-amber-200 text-amber-700 hover:bg-amber-100 transition-all font-bold text-xs shadow-sm disabled:opacity-50"
                                >
                                    {resettingPassword ? <Loader2 className="animate-spin" size={14}/> : <Mail size={14} />}
                                    Envoyer l'email de réinitialisation
                                </button>
                            </div>
                        </section>

                        <div className="pt-6 border-t flex justify-end gap-3">
                            <button onClick={() => setIsEditModalOpen(false)} className="px-4 py-2 text-gray-500 text-sm font-medium hover:bg-gray-100 rounded-lg">Annuler</button>
                            <button 
                                onClick={handleUpdateUser}
                                disabled={loading}
                                className="bg-slate-900 text-white px-6 py-2 rounded-lg text-sm font-bold shadow-md hover:bg-black transition-all disabled:opacity-50 flex items-center gap-2"
                            >
                                {loading && <Loader2 className="animate-spin" size={16}/>}
                                Enregistrer les modifications
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        )}
    </div>
  );
};
