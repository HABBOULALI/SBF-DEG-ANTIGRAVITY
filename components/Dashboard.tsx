import React, { useState, useEffect } from 'react';
import { BTPDocument, ApprovalStatus } from '../types';
import { AlertTriangle, CheckCircle2, Clock, XCircle, Activity, ArrowRight, AlertCircle, CalendarClock } from 'lucide-react';
import { Logo } from './Logo';

interface DashboardProps {
  documents: BTPDocument[];
  onNavigateToDocs: (filter: ApprovalStatus | 'ALL') => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ documents, onNavigateToDocs }) => {
  const [customLogo, setCustomLogo] = useState<string | null>(null);

  useEffect(() => {
    const loadSettings = () => {
        const saved = localStorage.getItem('btp-app-settings');
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                setCustomLogo(parsed.logo || null);
            } catch (e) {
                console.error(e);
            }
        }
    };
    loadSettings();
    window.addEventListener('btp-app-settings-updated', loadSettings);
    return () => window.removeEventListener('btp-app-settings-updated', loadSettings);
  }, []);

  // Calcul des statistiques
  const stats = React.useMemo(() => {
    const s = {
      total: documents.length,
      approved: 0,
      pending: 0,
      rejected: 0,
      noResponse: 0,
      approvedWithComments: 0
    };

    documents.forEach(doc => {
      // Get latest revision status
      const revIdx = (doc.currentRevisionIndex !== undefined) ? doc.currentRevisionIndex : doc.revisions.length - 1;
      const status = doc.revisions[revIdx]?.status;

      // Stats Globales
      if (status === ApprovalStatus.APPROVED) s.approved++;
      else if (status === ApprovalStatus.APPROVED_WITH_COMMENTS) s.approvedWithComments++;
      else if (status === ApprovalStatus.REJECTED) s.rejected++;
      else if (status === ApprovalStatus.NO_RESPONSE) s.noResponse++;
      else if (status === ApprovalStatus.PENDING) s.pending++;
    });

    return s;
  }, [documents]);

  // Documents urgents (En cours ou Sans Réponse)
  const urgentDocs = documents.filter(doc => {
      const revIdx = (doc.currentRevisionIndex !== undefined) ? doc.currentRevisionIndex : doc.revisions.length - 1;
      const status = doc.revisions[revIdx]?.status;
      return status === ApprovalStatus.PENDING || status === ApprovalStatus.NO_RESPONSE;
  }).slice(0, 10); // Top 10

  const StatCard = ({ title, value, total, icon: Icon, color, bgClass, onClick, isBlinking = false }: any) => {
      const percentage = total > 0 ? Math.round((value / total) * 100) : 0;
      const textColor = color.replace('bg-', 'text-');
      
      return (
          <div 
            onClick={onClick}
            className={`p-5 rounded-xl border shadow-sm hover:shadow-md transition-all cursor-pointer group flex items-center justify-between ${bgClass || 'bg-white border-gray-200'} ${isBlinking ? 'animate-pulse ring-4 ring-red-400 ring-opacity-50' : ''}`}
          >
              <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2 mb-1">
                      <div className={`p-1.5 rounded-md ${color} bg-opacity-10`}>
                          <Icon size={16} className={textColor} />
                      </div>
                      <p className={`text-[10px] font-bold uppercase tracking-wider ${isBlinking ? 'text-red-900' : 'text-gray-500'}`}>{title}</p>
                  </div>
                  <div className="flex items-baseline gap-1">
                    <h3 className={`text-3xl font-extrabold ${textColor}`}>
                        {value}
                    </h3>
                    <span className={`text-xs font-medium ${isBlinking ? 'text-red-800' : 'text-gray-400'}`}>doc{value > 1 ? 's' : ''}</span>
                  </div>
              </div>
              
              {/* Histogramme Anneau (Donut Chart) */}
              <div className="relative w-14 h-14 shrink-0">
                  <svg viewBox="0 0 36 36" className="w-full h-full">
                      {/* Fond de l'anneau */}
                      <path
                        className={isBlinking ? "text-red-300" : "text-gray-100"}
                        d="M18 2.0845
                          a 15.9155 15.9155 0 0 1 0 31.831
                          a 15.9155 15.9155 0 0 1 0 -31.831"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="3"
                      />
                      {/* Indicateur de valeur */}
                      <path
                        className={textColor}
                        strokeDasharray={`${percentage}, 100`}
                        d="M18 2.0845
                          a 15.9155 15.9155 0 0 1 0 31.831
                          a 15.9155 15.9155 0 0 1 0 -31.831"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="3"
                        strokeLinecap="round"
                      />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                      <span className={`text-[10px] font-bold ${textColor}`}>{percentage}%</span>
                  </div>
              </div>
          </div>
      );
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-gray-200 pb-4">
          <div>
            <div className="flex items-center gap-3">
                {customLogo ? (
                    <img src={customLogo} alt="Logo" className="h-12 w-auto object-contain bg-white rounded-md p-1 border border-gray-100" />
                ) : (
                    <Logo className="w-10 h-10 text-blue-600" />
                )}
                <h2 className="text-2xl font-bold text-gray-800">
                    Tableau de Bord
                </h2>
            </div>
            <p className="text-gray-500 text-sm mt-1 ml-1">Synthèse des validations et alertes.</p>
          </div>
          <div className="bg-white px-4 py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-600 shadow-sm">
              Total Documents : <span className="text-blue-600 font-bold ml-1">{stats.total}</span>
          </div>
      </div>

      {/* STAT CARDS ROW */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* 1. Approuvé */}
          <StatCard 
            title="Approuvé" 
            value={stats.approved + stats.approvedWithComments} 
            total={stats.total} 
            icon={CheckCircle2} 
            color="bg-green-600" 
            onClick={() => onNavigateToDocs(ApprovalStatus.APPROVED)}
          />

          {/* 2. En Cours */}
          <StatCard 
            title="En cours" 
            value={stats.pending} 
            total={stats.total} 
            icon={Clock} 
            color="bg-blue-500" 
            onClick={() => onNavigateToDocs(ApprovalStatus.PENDING)}
          />

          {/* 3. Non Approuvé */}
          <StatCard 
            title="Rejeté" 
            value={stats.rejected} 
            total={stats.total} 
            icon={XCircle} 
            color="bg-red-500" 
            onClick={() => onNavigateToDocs(ApprovalStatus.REJECTED)}
          />

           {/* 4. SANS RÉPONSE (ALERTE ROUGE CLIGNOTANTE) */}
           <StatCard 
            title="Sans Réponse" 
            value={stats.noResponse} 
            total={stats.total} 
            icon={AlertTriangle} 
            color="bg-red-600"
            bgClass="bg-red-200 border-2 border-red-600 shadow-xl"
            isBlinking={true}
            onClick={() => onNavigateToDocs(ApprovalStatus.NO_RESPONSE)}
          />
      </div>

      {/* LISTE UNIQUE PLEINE LARGEUR */}
      <div className="w-full bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col">
          <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-gray-50">
              <h3 className="font-bold text-gray-800 flex items-center gap-2">
                  <AlertCircle size={18} className="text-blue-500" />
                  Attention Requise (Documents En cours ou Sans Réponse)
              </h3>
              <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded font-bold">Prioritaire</span>
          </div>
          <div className="flex-1 overflow-auto">
            {urgentDocs.length === 0 ? (
                <div className="p-12 text-center text-gray-400 flex flex-col items-center">
                    <CheckCircle2 size={48} className="mb-4 text-green-100" />
                    <p className="text-lg font-medium text-gray-600">Tout est à jour !</p>
                    <p className="text-sm">Aucun document en attente ou sans réponse.</p>
                </div>
            ) : (
                <table className="w-full text-sm text-left">
                    <thead className="text-xs text-gray-500 bg-gray-50 uppercase font-semibold">
                        <tr>
                            <th className="px-6 py-4">Code</th>
                            <th className="px-6 py-4">Document</th>
                            <th className="px-6 py-4">Lot</th>
                            <th className="px-6 py-4">Statut</th>
                            <th className="px-6 py-4">Délai (j)</th>
                            <th className="px-6 py-4 text-right">Action</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {urgentDocs.map(doc => {
                            const revIdx = (doc.currentRevisionIndex !== undefined) ? doc.currentRevisionIndex : doc.revisions.length - 1;
                            const currentRev = doc.revisions[revIdx];
                            const status = currentRev?.status;
                            
                            // Calcul du délai (Aujourd'hui - Date Envoi)
                            let delayDays = 0;
                            if (currentRev?.transmittalDate) {
                                const transmittalDate = new Date(currentRev.transmittalDate);
                                const today = new Date();
                                // Reset des heures pour un calcul en jours pleins
                                transmittalDate.setHours(0,0,0,0);
                                today.setHours(0,0,0,0);
                                const diffTime = today.getTime() - transmittalDate.getTime();
                                delayDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                            }

                            return (
                                <tr key={doc.id} className="hover:bg-gray-50 transition-colors">
                                    <td className="px-6 py-4 font-mono text-xs font-bold text-gray-700">{doc.code}</td>
                                    <td className="px-6 py-4 font-medium text-gray-800">{doc.name}</td>
                                    <td className="px-6 py-4 text-gray-500">{doc.lot}</td>
                                    <td className="px-6 py-4">
                                        <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase flex w-fit items-center gap-1 ${
                                            status === ApprovalStatus.PENDING ? 'bg-blue-100 text-blue-800 border border-blue-200' : 'bg-red-600 text-white animate-pulse shadow-md'
                                        }`}>
                                            {status === ApprovalStatus.PENDING ? <Clock size={10} /> : <AlertTriangle size={10} />}
                                            {status === ApprovalStatus.PENDING ? 'En cours' : 'Sans Réponse'}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className={`flex items-center gap-1 font-bold ${delayDays > 15 ? 'text-red-600' : 'text-gray-600'}`}>
                                            <CalendarClock size={14} />
                                            {delayDays}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <button 
                                            onClick={() => onNavigateToDocs(status)}
                                            className="text-blue-600 hover:text-blue-800 text-xs font-bold flex items-center justify-end gap-1 ml-auto"
                                        >
                                            Gérer <ArrowRight size={12} />
                                        </button>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            )}
          </div>
          <div className="p-4 bg-gray-50 border-t border-gray-200 text-center">
              <button onClick={() => onNavigateToDocs('ALL')} className="text-xs text-gray-500 hover:text-blue-600 font-medium transition-colors">
                  Voir tous les documents
              </button>
          </div>
      </div>
    </div>
  );
};