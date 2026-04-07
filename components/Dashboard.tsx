import React, { useState, useEffect } from 'react';
import { BTPDocument, ApprovalStatus } from '../types';
import { AlertTriangle, CheckCircle2, Clock, XCircle, Activity, ArrowRight, AlertCircle, CalendarClock, PieChart as PieChartIcon, BarChart3, TrendingUp, Layers, User } from 'lucide-react';
import { Logo } from './Logo';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip, Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';

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

  const pieData = [
      { name: 'Approuvé', value: stats.approved, color: '#10b981' },
      { name: 'Approuvé avec réserves', value: stats.approvedWithComments, color: '#34d399' },
      { name: 'En cours de révision', value: stats.pending, color: '#3b82f6' },
      { name: 'Sans Réponse', value: stats.noResponse, color: '#f43f5e' },
      { name: 'Non Approuvé', value: stats.rejected, color: '#ef4444' }
  ].filter(d => d.value > 0);

  const delayData = React.useMemo(() => {
     let delay0_5 = 0, delay6_15 = 0, delay15Plus = 0;
     documents.forEach(doc => {
         const revIdx = (doc.currentRevisionIndex !== undefined) ? doc.currentRevisionIndex : doc.revisions.length - 1;
         const currentRev = doc.revisions[revIdx];
         const processRecord = (status?: ApprovalStatus, transDate?: string) => {
             if ((status === ApprovalStatus.PENDING || status === ApprovalStatus.NO_RESPONSE) && transDate) {
                 const days = Math.ceil((new Date().getTime() - new Date(transDate).getTime()) / (1000 * 60 * 60 * 24));
                 if (days <= 5) delay0_5++;
                 else if (days <= 15) delay6_15++;
                 else delay15Plus++;
             }
         };
         if (currentRev?.sendHistory && currentRev.sendHistory.length > 0) {
             currentRev.sendHistory.forEach(s => processRecord(s.status, s.transmittalDate));
         } else processRecord(currentRev?.status, currentRev?.transmittalDate);
     });
     return [
         { name: '0-5j', docs: delay0_5, color: '#3b82f6' },
         { name: '6-15j', docs: delay6_15, color: '#f59e0b' },
         { name: '>15j', docs: delay15Plus, color: '#f43f5e' }
     ];
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

  return (
    <div className="max-w-[1600px] mx-auto space-y-8 animate-in fade-in duration-700 pb-12">
      {/* HEADER SECTION */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-end gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 text-[10px] font-bold uppercase tracking-widest border border-blue-500/20 mb-2">
                <Activity size={12} /> Live Status
            </div>
            <h2 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-4 transition-colors">
                Dashboard <span className="text-blue-600 text-4xl">.</span>
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

      {/* CHARTS & LISTS */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
          {/* Chart 1: Global Status */}
          <div className="xl:col-span-1 bg-white dark:bg-slate-900 p-8 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm transition-colors overflow-hidden relative">
              <div className="flex justify-between items-center mb-8 relative z-10">
                  <h3 className="font-black text-slate-800 dark:text-white text-lg tracking-tight">Statut Global</h3>
                  <div className="p-2 bg-slate-50 dark:bg-slate-800 rounded-xl"><PieChartIcon size={20} className="text-slate-400" /></div>
              </div>
              <div className="h-[300px] relative z-10">
                  <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                          <Pie data={pieData} cx="50%" cy="50%" innerRadius={70} outerRadius={100} paddingAngle={8} dataKey="value" stroke="none">
                              {pieData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
                          </Pie>
                          <RechartsTooltip contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', background: '#1e293b', color: '#fff' }} />
                          <Legend verticalAlign="bottom" height={36} iconType="circle" />
                      </PieChart>
                  </ResponsiveContainer>
              </div>
          </div>

          {/* Table: Urgent Actions */}
          <div className="xl:col-span-2 bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm transition-colors overflow-hidden flex flex-col">
              <div className="p-8 border-b border-slate-50 dark:border-slate-800 flex justify-between items-center">
                  <div>
                    <h3 className="font-black text-slate-800 dark:text-white text-lg tracking-tight flex items-center gap-3">
                        <TrendingUp size={20} className="text-rose-500" />
                        Actions Prioritaires
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
      </div>
      
      {/* SECOND ROW: DELAY ANALYSIS */}
      <div className="bg-white dark:bg-slate-900 p-8 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm transition-colors">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
              <div>
                <h3 className="font-black text-slate-800 dark:text-white text-lg tracking-tight flex items-center gap-3">
                    <BarChart3 size={20} className="text-indigo-500" />
                    Analyse des Délais de Réponse
                </h3>
                <p className="text-slate-400 text-xs font-medium mt-1">Impact des retards sur le planning global du chantier.</p>
              </div>
              {stats.noResponse > 0 && (
                <div className="flex items-center gap-3 px-4 py-2 bg-rose-500/10 border border-rose-500/20 rounded-2xl text-rose-500 text-xs font-bold">
                    <AlertCircle size={16} /> Attention: {stats.noResponse} documents dépassent les délais
                </div>
              )}
          </div>
          
          <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={delayData} margin={{ top: 20, right: 30, left: 0, bottom: 0 }} barGap={20}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                      <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 700, fill: '#64748b' }} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 700, fill: '#64748b' }} />
                      <RechartsTooltip cursor={{ fill: 'transparent' }} contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', background: '#1e293b', color: '#fff' }} />
                      <Bar dataKey="docs" name="Nombre de Documents" radius={[10, 10, 10, 10]} barSize={50}>
                          {delayData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
                      </Bar>
                  </BarChart>
              </ResponsiveContainer>
          </div>
      </div>
    </div>
  );
};