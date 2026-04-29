import React, { useState, useEffect } from 'react';
import { BTPDocument, ApprovalStatus } from '../types';
import { AlertTriangle, CheckCircle2, Clock, XCircle, Activity, ArrowRight, AlertCircle, CalendarClock, TrendingUp, User, Send, FileText } from 'lucide-react';
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
      totalDocuments: documents.length,
      totalSends: 0,
      approved: 0,
      pending: 0,
      rejected: 0,
      noResponse: 0,
      approvedWithComments: 0
    };

    documents.forEach(doc => {
      const revIdx = (doc.currentRevisionIndex !== undefined) ? doc.currentRevisionIndex : doc.revisions.length - 1;
      const currentRev = doc.revisions[revIdx];
      
      if (currentRev?.sendHistory && currentRev.sendHistory.length > 0) {
          currentRev.sendHistory.forEach(send => {
              s.totalSends++;
              if (send.status === ApprovalStatus.APPROVED) s.approved++;
              else if (send.status === ApprovalStatus.APPROVED_WITH_COMMENTS) s.approvedWithComments++;
              else if (send.status === ApprovalStatus.REJECTED) s.rejected++;
              else if (send.status === ApprovalStatus.NO_RESPONSE) s.noResponse++;
              else if (send.status === ApprovalStatus.PENDING) s.pending++;
          });
      } else {
          s.totalSends++;
          const status = currentRev?.status;
          if (status === ApprovalStatus.APPROVED) s.approved++;
          else if (status === ApprovalStatus.APPROVED_WITH_COMMENTS) s.approvedWithComments++;
          else if (status === ApprovalStatus.REJECTED) s.rejected++;
          else if (status === ApprovalStatus.NO_RESPONSE) s.noResponse++;
          else if (status === ApprovalStatus.PENDING) s.pending++;
      }
    });

    return s;
  }, [documents]);

  // Documents urgents (en attente de réponse)
  const urgentItems = React.useMemo(() => {
    const items: any[] = [];
    documents.forEach(doc => {
      const revIdx = (doc.currentRevisionIndex !== undefined) ? doc.currentRevisionIndex : doc.revisions.length - 1;
      const currentRev = doc.revisions[revIdx];
      
      if (currentRev?.sendHistory && currentRev.sendHistory.length > 0) {
          currentRev.sendHistory.forEach(send => {
              if (send.status === ApprovalStatus.PENDING || send.status === ApprovalStatus.NO_RESPONSE) {
                  items.push({
                      id: `${doc.id}-${send.id}`,
                      doc,
                      rev: currentRev,
                      status: send.status,
                      recipient: send.recipientName,
                      transDate: send.transmittalDate,
                  });
              }
          });
      } else {
          const status = currentRev?.status;
          if (status === ApprovalStatus.PENDING || status === ApprovalStatus.NO_RESPONSE) {
              items.push({
                  id: doc.id,
                  doc,
                  rev: currentRev,
                  status: status || ApprovalStatus.PENDING,
                  recipient: currentRev?.recipient || 'N/A',
                  transDate: currentRev?.transmittalDate || '',
              });
          }
      }
    });

    // Tri par date la plus ancienne (plus urgent)
    return items.sort((a, b) => {
        const dateA = a.transDate ? new Date(a.transDate).getTime() : 0;
        const dateB = b.transDate ? new Date(b.transDate).getTime() : 0;
        return dateA - dateB;
    }).slice(0, 12);
  }, [documents]);

  // === NOUVEAU: Documents envoyés pour visa (Envoi App renseigné) mais pas encore retournés (Retour App vide) ===
  const pendingVisaItems = React.useMemo(() => {
    const items: {
      id: string;
      doc: BTPDocument;
      revIndex: string;
      approvedSendDate: string;
      approvedSendRef: string;
      transmittalRef: string;
      recipient: string;
      daysSinceSend: number;
    }[] = [];

    documents.forEach(doc => {
      doc.revisions.forEach(rev => {
        const hasSendHistory = rev.sendHistory && rev.sendHistory.length > 0;

        if (hasSendHistory) {
          // Si sendHistory existe, vérifier UNIQUEMENT les envois du sendHistory (éviter les doublons)
          rev.sendHistory!.forEach(send => {
            if (send.approvalDate && !send.returnDate) {
              const daysSinceSend = Math.ceil(
                (new Date().getTime() - new Date(send.approvalDate).getTime()) / (1000 * 60 * 60 * 24)
              );
              items.push({
                id: `${doc.id}-${rev.id}-${send.id}-visa`,
                doc,
                revIndex: rev.index,
                approvedSendDate: send.approvalDate,
                approvedSendRef: send.approvalRef || '',
                transmittalRef: send.transmittalRef || '',
                recipient: send.recipientName || '',
                daysSinceSend,
              });
            }
          });
        } else {
          // Pas de sendHistory : vérifier les champs de la révision directement
          if (rev.approvedSendDate && !rev.approvedReturnDate) {
            const daysSinceSend = Math.ceil(
              (new Date().getTime() - new Date(rev.approvedSendDate).getTime()) / (1000 * 60 * 60 * 24)
            );
            items.push({
              id: `${doc.id}-${rev.id}-visa`,
              doc,
              revIndex: rev.index,
              approvedSendDate: rev.approvedSendDate,
              approvedSendRef: rev.approvedSendRef || '',
              transmittalRef: rev.transmittalRef || '',
              recipient: rev.recipients?.join(', ') || rev.recipient || '',
              daysSinceSend,
            });
          }
        }
      });
    });

    // Tri par nombre de jours (les plus anciens en premier)
    return items.sort((a, b) => b.daysSinceSend - a.daysSinceSend);
  }, [documents]);

  const StatCard = ({ title, value, total, icon: Icon, colorClass, gradient, onClick, active = false }: any) => {
      const percentage = total > 0 ? Math.round((value / total) * 100) : 0;
      return (
          <div 
            onClick={onClick}
            className={`relative overflow-hidden p-6 rounded-3xl border transition-all duration-300 cursor-pointer group shadow-sm hover:shadow-xl hover:-translate-y-1 ${
                active 
                ? 'bg-white dark:bg-slate-800 border-red-500/50 ring-4 ring-rose-500/10' 
                : 'bg-white dark:bg-slate-900 border-slate-100 dark:border-slate-800 backdrop-blur-xl'
            }`}
          >
              <div className={`absolute top-0 right-0 w-24 h-24 -mr-8 -mt-8 rounded-full opacity-10 ${gradient}`}></div>
              
              <div className="flex justify-between items-start mb-4 relative z-10">
                  <div className={`p-3 rounded-2xl ${colorClass} bg-opacity-10 dark:bg-opacity-20`}>
                      <Icon size={24} className={colorClass.replace('bg-', 'text-')} />
                  </div>
                  <div className="text-right">
                      <span className="text-xl font-black text-slate-800 dark:text-white leading-none">{value}</span>
                      <p className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-tighter mt-1">documents</p>
                  </div>
              </div>
              
              <div className="relative z-10">
                  <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-3">{title}</h3>
                  <div className="w-full bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
                      <div 
                        className={`h-full rounded-full transition-all duration-1000 ${gradient}`} 
                        style={{ width: `${percentage}%` }}
                      ></div>
                  </div>
                  <div className="flex justify-between mt-2">
                       <span className="text-[10px] font-bold text-slate-400">{percentage}% du total</span>
                       <ArrowRight size={12} className="text-slate-300 dark:text-slate-600 group-hover:translate-x-1 transition-transform" />
                  </div>
              </div>
          </div>
      );
  };

  const getDelayBadgeClass = (days: number) => {
    if (days > 15) return 'bg-rose-500 text-white border-rose-600';
    if (days > 7) return 'bg-amber-500/20 text-amber-600 dark:text-amber-400 border-amber-500/30';
    return 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20';
  };

  return (
    <div className="max-w-[1600px] mx-auto space-y-8 animate-in fade-in duration-700 pb-12">
      {/* HEADER SECTION */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-end gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 text-[10px] font-bold uppercase tracking-widest border border-blue-500/20 mb-2">
                <Activity size={12} /> Live Status
            </div>
            <h2 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-4 transition-colors">
                Tableau de Bord <span className="text-blue-600 text-4xl">.</span>
            </h2>
            <p className="text-slate-500 dark:text-slate-400 font-medium max-w-md text-sm">Bienvenue sur votre centre de contrôle SBF GED. Suivez vos validations en temps réel.</p>
          </div>
          
          <div className="flex gap-4 p-1.5 bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm transition-colors">
              <div className="px-6 py-3 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 transition-colors">
                  <span className="block text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">Total Plans</span>
                  <span className="text-lg font-black text-slate-800 dark:text-white transition-colors">{stats.totalDocuments}</span>
              </div>
              <div className="px-6 py-3 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 transition-colors">
                  <span className="block text-[9px] font-bold text-indigo-400 uppercase tracking-widest mb-1">Total Envois</span>
                  <span className="text-lg font-black text-indigo-600 dark:text-indigo-400 transition-colors">{stats.totalSends}</span>
              </div>
          </div>
      </div>

      {/* STAT CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
          <StatCard 
            title="Approuvé" value={stats.approved + stats.approvedWithComments} total={stats.totalSends} 
            icon={CheckCircle2} colorClass="bg-emerald-500" gradient="bg-gradient-to-r from-emerald-500 to-teal-500"
            onClick={() => onNavigateToDocs(ApprovalStatus.APPROVED)}
          />
          <StatCard 
            title="En Révision" value={stats.pending} total={stats.totalSends} 
            icon={Clock} colorClass="bg-blue-500" gradient="bg-gradient-to-r from-blue-500 to-indigo-500"
            onClick={() => onNavigateToDocs(ApprovalStatus.PENDING)}
          />
          <StatCard 
            title="Non Approuvé" value={stats.rejected} total={stats.totalSends} 
            icon={XCircle} colorClass="bg-orange-500" gradient="bg-gradient-to-r from-orange-500 to-red-500"
            onClick={() => onNavigateToDocs(ApprovalStatus.REJECTED)}
          />
          <StatCard 
            title="Sans Réponse" value={stats.noResponse} total={stats.totalSends} 
            icon={AlertTriangle} colorClass="bg-rose-500" gradient="bg-gradient-to-r from-rose-500 to-pink-600"
            active={stats.noResponse > 0}
            onClick={() => onNavigateToDocs(ApprovalStatus.NO_RESPONSE)}
          />
      </div>

      {/* Table 1: Suivi des Documents Envoyés pour Avis & révision (ex Actions Prioritaires) */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm transition-colors overflow-hidden flex flex-col">
          <div className="p-6 md:p-8 border-b border-slate-50 dark:border-slate-800 flex justify-between items-center">
              <div>
                <h3 className="font-black text-slate-800 dark:text-white text-lg tracking-tight flex items-center gap-3">
                    <TrendingUp size={20} className="text-rose-500" />
                    Suivi des Documents Envoyés pour Avis & révision
                </h3>
                <p className="text-slate-400 text-xs font-medium mt-1 uppercase tracking-widest">En attente de réponse ({urgentItems.length})</p>
              </div>
              <button onClick={() => onNavigateToDocs('ALL')} className="px-4 py-2 text-[10px] font-black uppercase text-blue-600 dark:text-blue-400 hover:bg-blue-500/10 rounded-xl transition-all">Tout voir</button>
          </div>
          
          <div className="flex-1 overflow-x-auto">
              {urgentItems.length === 0 ? (
                  <div className="p-16 text-center">
                      <div className="w-20 h-20 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto mb-4 border border-emerald-500/20">
                          <CheckCircle2 size={32} className="text-emerald-500" />
                      </div>
                      <p className="text-slate-800 dark:text-white font-bold">Excellent travail !</p>
                      <p className="text-slate-400 text-sm">Tous les documents ont été traités.</p>
                  </div>
              ) : (
                  <table className="w-full text-left">
                      <thead className="bg-slate-50 dark:bg-slate-800/30 text-[9px] font-black text-slate-400 uppercase tracking-widest">
                          <tr>
                              <th className="px-5 py-3">Document</th>
                              <th className="px-4 py-3">Statut</th>
                              <th className="px-4 py-3">Destinataire</th>
                              <th className="px-4 py-3">Délai</th>
                              <th className="px-5 py-3 text-right">Action</th>
                          </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50 dark:divide-slate-800/50">
                          {urgentItems.map(item => {
                              const { doc, rev, status, recipient, transDate, id } = item;
                              const days = transDate ? Math.ceil((new Date().getTime() - new Date(transDate).getTime()) / (1000 * 60 * 60 * 24)) : 0;
                              
                              return (
                                  <tr key={id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors group">
                                      <td className="px-5 py-3">
                                          <div className="font-bold text-slate-800 dark:text-white text-xs group-hover:text-blue-600 transition-colors">{doc.name}</div>
                                          <div className="text-[9px] font-mono text-slate-400 mt-0.5">({doc.lot}-{doc.poste}-{doc.classement}-{doc.code}-{rev.index})</div>
                                      </td>
                                      <td className="px-4 py-3">
                                          <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase inline-flex items-center gap-1.5 border shadow-sm ${
                                              status === ApprovalStatus.NO_RESPONSE 
                                              ? 'bg-rose-500 text-white border-rose-600 animate-pulse' 
                                              : 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800'
                                          }`}>
                                              {status === ApprovalStatus.NO_RESPONSE ? <AlertTriangle size={10} /> : <Clock size={10} />}
                                              {status === ApprovalStatus.NO_RESPONSE ? 'Sans Réponse' : 'En cours'}
                                          </span>
                                      </td>
                                      <td className="px-4 py-3">
                                          <div className="text-[11px] font-bold text-slate-600 dark:text-slate-300 flex items-center gap-2">
                                              <User size={14} className="text-slate-300 dark:text-slate-600" />
                                              {recipient}
                                          </div>
                                      </td>
                                      <td className="px-4 py-3">
                                          <div className={`text-xs font-black flex items-center gap-1.5 ${days > 15 ? 'text-rose-500' : 'text-slate-700 dark:text-slate-300'}`}>
                                              <CalendarClock size={14} className="opacity-40" />
                                              {days} <span className="text-[9px] font-bold text-slate-400 uppercase">jours</span>
                                          </div>
                                      </td>
                                      <td className="px-5 py-3 text-right">
                                          <button 
                                            onClick={() => onNavigateToDocs(status)}
                                            className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 hover:bg-blue-600 hover:text-white transition-all ml-auto"
                                          >
                                              <ArrowRight size={16} />
                                          </button>
                                      </td>
                                  </tr>
                              );
                          })}
                      </tbody>
                  </table>
              )}
          </div>
      </div>

      {/* Table 2: SUIVI DES DOCUMENTS ENVOYÉS POUR VISA */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm transition-colors overflow-hidden flex flex-col">
          <div className="p-6 md:p-8 border-b border-slate-50 dark:border-slate-800 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div>
                <h3 className="font-black text-slate-800 dark:text-white text-lg tracking-tight flex items-center gap-3">
                    <Send size={20} className="text-indigo-500" />
                    Suivi des Documents Envoyés pour Visa
                </h3>
                <p className="text-slate-400 text-xs font-medium mt-1 uppercase tracking-widest">
                  Envoyés mais pas encore retournés ({pendingVisaItems.length})
                </p>
              </div>
              {pendingVisaItems.length > 0 && (
                <div className="flex items-center gap-3 px-4 py-2 bg-amber-500/10 border border-amber-500/20 rounded-2xl text-amber-600 dark:text-amber-400 text-xs font-bold shrink-0">
                    <AlertCircle size={16} />
                    {pendingVisaItems.length} document{pendingVisaItems.length > 1 ? 's' : ''} en attente de retour
                </div>
              )}
          </div>

          <div className="flex-1 overflow-x-auto">
              {pendingVisaItems.length === 0 ? (
                  <div className="p-16 text-center">
                      <div className="w-20 h-20 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto mb-4 border border-emerald-500/20">
                          <CheckCircle2 size={32} className="text-emerald-500" />
                      </div>
                      <p className="text-slate-800 dark:text-white font-bold">Aucun document en attente</p>
                      <p className="text-slate-400 text-sm">Tous les documents envoyés pour visa ont été retournés.</p>
                  </div>
              ) : (
                  <table className="w-full text-left">
                      <thead className="bg-slate-50 dark:bg-slate-800/30 text-[9px] font-black text-slate-400 uppercase tracking-widest">
                          <tr>
                              <th className="px-5 py-3">N°</th>
                              <th className="px-4 py-3">Code Document</th>
                              <th className="px-4 py-3">Désignation</th>
                              <th className="px-4 py-3 text-center">Indice</th>
                              <th className="px-4 py-3">Destinataire</th>
                              <th className="px-4 py-3 text-center">Date Envoi App.</th>
                              <th className="px-4 py-3 text-center">Réf Envoi App.</th>
                              <th className="px-4 py-3 text-center">Retour App.</th>
                              <th className="px-4 py-3 text-center">Délai</th>
                          </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50 dark:divide-slate-800/50">
                          {pendingVisaItems.map((item, idx) => (
                              <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors group">
                                  <td className="px-5 py-3">
                                      <span className="text-[11px] font-bold text-slate-400">{idx + 1}</span>
                                  </td>
                                  <td className="px-4 py-3">
                                      <div className="text-[11px] font-mono font-bold text-blue-600 dark:text-blue-400">{item.doc.code}</div>
                                  </td>
                                  <td className="px-4 py-3">
                                      <div className="font-bold text-slate-800 dark:text-white text-xs group-hover:text-blue-600 transition-colors max-w-[250px] truncate" title={item.doc.name}>
                                        {item.doc.name}
                                      </div>
                                      <div className="text-[9px] font-medium text-slate-400 mt-0.5">
                                        {item.doc.lot} - {item.doc.poste} - {item.doc.nature || 'N/A'}
                                      </div>
                                  </td>
                                  <td className="px-4 py-3 text-center">
                                      <span className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-[11px] font-black text-slate-700 dark:text-slate-300">
                                        {item.revIndex}
                                      </span>
                                  </td>
                                  <td className="px-4 py-3">
                                      <div className="text-[11px] font-bold text-slate-600 dark:text-slate-300 flex items-center gap-2">
                                          <User size={14} className="text-slate-300 dark:text-slate-600 shrink-0" />
                                          <span className="truncate max-w-[120px]">{item.recipient || '—'}</span>
                                      </div>
                                  </td>
                                  <td className="px-4 py-3 text-center">
                                      <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300">{item.approvedSendDate}</span>
                                  </td>
                                  <td className="px-4 py-3 text-center">
                                      <span className="text-[11px] font-medium text-slate-500">{item.approvedSendRef || '—'}</span>
                                  </td>
                                  <td className="px-4 py-3 text-center">
                                      <span className="px-3 py-1 rounded-full text-[9px] font-black uppercase bg-rose-500/10 text-rose-500 border border-rose-500/20 inline-flex items-center gap-1">
                                          <AlertTriangle size={10} />
                                          En attente
                                      </span>
                                  </td>
                                  <td className="px-4 py-3 text-center">
                                      <span className={`px-3 py-1 rounded-full text-[10px] font-black border inline-flex items-center gap-1.5 ${getDelayBadgeClass(item.daysSinceSend)}`}>
                                          <CalendarClock size={12} className="opacity-60" />
                                          {item.daysSinceSend} <span className="text-[8px] uppercase">jours</span>
                                      </span>
                                  </td>
                              </tr>
                          ))}
                      </tbody>
                  </table>
              )}
          </div>
      </div>
    </div>
  );
};