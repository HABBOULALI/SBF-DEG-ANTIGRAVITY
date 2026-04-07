import React, { useState, useEffect } from 'react';
import { LayoutDashboard, Send, Settings, Menu, X, FileText, LogOut, UserCircle, Sun, Moon, ArrowRight } from 'lucide-react';
import { Logo } from './Logo';
import { useAuth } from '../context/AuthContext';

interface LayoutProps {
  children: React.ReactNode;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  theme?: 'light' | 'dark';
  onToggleTheme?: () => void;
}

export const Layout: React.FC<LayoutProps> = ({ children, activeTab, setActiveTab, theme, onToggleTheme }) => {
  const { user, logout } = useAuth();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [customLogo, setCustomLogo] = useState<string | null>(null);

  const loadSettings = () => {
    const savedSettings = localStorage.getItem('btp-app-settings');
    if (savedSettings) {
      try {
        const parsed = JSON.parse(savedSettings);
        setCustomLogo(parsed.logo || null);
      } catch (e) {
        console.error("Erreur lecture settings", e);
      }
    }
  };

  useEffect(() => {
    // Initial load
    loadSettings();

    // Listen for updates from SettingsView
    const handleSettingsUpdate = () => loadSettings();
    window.addEventListener('btp-app-settings-updated', handleSettingsUpdate);

    return () => {
        window.removeEventListener('btp-app-settings-updated', handleSettingsUpdate);
    };
  }, []);

  const allNavItems = [
    { id: 'overview', label: 'Tableau de Bord', icon: LayoutDashboard }, 
    { id: 'documents', label: 'Suivi Documents', icon: FileText }, 
    { id: 'bordereaux', label: 'Bordereaux', icon: Send },
    { id: 'settings', label: 'Paramètres', icon: Settings },
  ];

  const navItems = allNavItems.filter(item => {
    if (user?.role === 'viewer') {
      return ['overview', 'documents'].includes(item.id);
    }
    if (user?.role === 'editor') {
      return ['overview', 'documents', 'bordereaux'].includes(item.id);
    }
    return true; // Admin has all
  });

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-slate-950 overflow-hidden transition-colors duration-300 print:h-auto print:overflow-visible print:block font-sans">
      {/* Sidebar Desktop */}
      <aside 
        onMouseEnter={() => isSidebarCollapsed && setIsSidebarCollapsed(false)}
        onMouseLeave={() => !isSidebarCollapsed && setIsSidebarCollapsed(true)}
        className={`hidden md:flex flex-col ${isSidebarCollapsed ? 'w-16' : 'w-64'} bg-slate-900 text-white shadow-2xl no-print border-r border-slate-800 dark:border-slate-800/50 transition-all duration-300 relative group/sidebar`}
      >
        {/* Toggle Button (3 traits) */}
        <button 
          onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
          className="absolute -right-3 top-6 bg-blue-600 text-white p-1.5 rounded-lg shadow-xl z-50 hover:bg-blue-500 transition-all hover:scale-110 hidden md:flex items-center justify-center border border-blue-400/20"
        >
          <Menu size={16} />
        </button>

        <div className={`p-6 border-b border-slate-700/50 flex items-center gap-3 ${isSidebarCollapsed ? 'justify-center p-4' : ''}`}>
          <div className="text-blue-500 shrink-0">
            {customLogo ? (
                <img src={customLogo} alt="Logo" className="w-10 h-10 object-contain bg-white rounded-md p-0.5" />
            ) : (
                <Logo className="w-10 h-10" />
            )}
          </div>
          {!isSidebarCollapsed && (
            <div className="animate-in fade-in slide-in-from-left-2 duration-300">
              <h1 className="text-lg font-bold text-white tracking-tight leading-none transition-colors">
                SBF GED
              </h1>
              <p className="text-[10px] text-slate-400 mt-1 uppercase tracking-wider font-medium transition-colors">Gestion Electronique</p>
            </div>
          )}
        </div>
        
        <nav className="flex-1 overflow-y-auto py-6">
          <ul className="space-y-1.5 px-3">
            {navItems.map((item) => (
              <li key={item.id}>
                <button
                  onClick={() => setActiveTab(item.id)}
                  title={isSidebarCollapsed ? item.label : ''}
                  className={`w-full flex items-center space-x-3 px-4 py-2.5 rounded-xl transition-all duration-200 group ${isSidebarCollapsed ? 'justify-center' : ''} ${
                    activeTab === item.id
                      ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20 translate-x-1'
                      : 'text-slate-400 hover:bg-slate-800 text-[13px] hover:text-white hover:translate-x-1'
                  }`}
                >
                  <item.icon size={18} className={`transition-transform duration-200 shrink-0 ${activeTab === item.id ? 'scale-110' : 'group-hover:scale-110'}`} />
                  {!isSidebarCollapsed && <span className="font-semibold tracking-wide text-[13px] whitespace-nowrap animate-in fade-in slide-in-from-left-2 duration-300">{item.label}</span>}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <div className="p-4 border-t border-slate-800">
           {/* Theme Toggle Button */}
           <div className={`flex items-center mb-4 px-2 ${isSidebarCollapsed ? 'justify-center' : 'justify-between'}`}>
              {!isSidebarCollapsed && <span className="text-[10px] uppercase font-bold text-slate-500 tracking-widest animate-in fade-in duration-300">Apparence</span>}
              <button 
                onClick={onToggleTheme}
                className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-400 transition-all border border-slate-700/50"
                title={theme === 'dark' ? 'Passer au mode clair' : 'Passer au mode sombre'}
              >
                {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} className="text-blue-400" />}
              </button>
           </div>

           {/* Profil Utilisateur */}
           <div className={`mb-4 px-2 py-3 bg-slate-800/40 rounded-2xl border border-slate-700/30 transition-all ${isSidebarCollapsed ? 'flex flex-col items-center gap-2' : ''}`}>
             <div className={`flex items-center gap-3 mb-2 px-1 ${isSidebarCollapsed ? 'flex-col justify-center' : ''}`}>
               <div className="w-9 h-9 rounded-full bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400 shrink-0">
                 <UserCircle size={22} />
               </div>
               {!isSidebarCollapsed && (
                 <div className="flex-1 overflow-hidden animate-in fade-in duration-300">
                   <p className="text-xs font-bold text-white truncate">
                     {user?.displayName || user?.email?.split('@')[0]}
                   </p>
                   <span className={`text-[9px] uppercase font-black px-2 py-0.5 rounded-md inline-block mt-1 ${
                     user?.role === 'admin' ? 'bg-red-500/20 text-red-500 border border-red-500/30' :
                     user?.role === 'editor' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' :
                     'bg-slate-500/20 text-slate-400 border border-slate-500/30'
                   }`}>
                     {user?.role === 'admin' ? 'Admin' : user?.role === 'editor' ? 'Éditeur' : 'Lecteur'}
                   </span>
                 </div>
               )}
             </div>
             
             <button 
               onClick={() => logout()}
               title="Déconnexion"
               className={`w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-slate-700/30 hover:bg-red-500 text-slate-400 hover:text-white transition-all border border-slate-700/50 hover:border-red-500 font-bold text-[10px] uppercase ${isSidebarCollapsed ? 'px-0' : 'mt-2'} shadow-sm`}
             >
               <LogOut size={12} className="shrink-0" />
               {!isSidebarCollapsed && "Déconnexion"}
             </button>
           </div>
           
           <div className="text-center text-[9px] text-slate-500 font-medium">
             v1.3.0 - © 2024 SBF Digital
           </div>
        </div>
      </aside>

      {/* Mobile Header */}
      <div className="md:hidden fixed top-0 w-full bg-slate-900 text-white z-50 flex items-center justify-between p-4 shadow-md no-print border-b border-slate-800">
        <div className="flex items-center gap-2">
            <div className="text-blue-500">
                {customLogo ? (
                    <img src={customLogo} alt="Logo" className="w-8 h-8 object-contain bg-white rounded-sm p-0.5" />
                ) : (
                    <Logo className="w-8 h-8" />
                )}
            </div>
            <h1 className="text-lg font-bold tracking-tight uppercase">SBF GED</h1>
        </div>
        <div className="flex items-center gap-4">
          <button 
            onClick={onToggleTheme}
            className="p-2 rounded-lg bg-slate-800 text-amber-400 border border-slate-700"
          >
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} className="text-blue-400" />}
          </button>
          <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="p-1">
            {isMobileMenuOpen ? <X /> : <Menu />}
          </button>
        </div>
      </div>

      {/* Mobile Menu */}
      {isMobileMenuOpen && (
        <div className="md:hidden fixed inset-0 bg-slate-900 z-40 pt-20 px-4 no-print flex flex-col animate-in fade-in slide-in-from-top-4">
          <nav className="flex-1">
            <ul className="space-y-2">
              {navItems.map((item) => (
                <li key={item.id}>
                  <button
                    onClick={() => {
                      setActiveTab(item.id);
                      setIsMobileMenuOpen(false);
                    }}
                    className={`w-full flex items-center space-x-4 px-5 py-4 rounded-2xl text-lg font-bold transition-all ${
                      activeTab === item.id 
                        ? 'bg-blue-600 text-white shadow-xl' 
                        : 'text-slate-400 hover:bg-slate-800'
                    }`}
                  >
                    <item.icon size={24} />
                    <span>{item.label}</span>
                  </button>
                </li>
              ))}
            </ul>
          </nav>

          <div className="pb-8 pt-6 border-t border-slate-800">
             <div className="flex items-center gap-4 px-4 mb-6">
                <div className="w-12 h-12 rounded-full bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400">
                    <UserCircle size={32} />
                </div>
                <div>
                   <p className="text-white font-bold text-lg">{user?.displayName || user?.email?.split('@')[0]}</p>
                   <span className={`text-[10px] uppercase font-black px-2 py-0.5 rounded-md inline-block mt-1 ${
                        user?.role === 'admin' ? 'bg-red-500/20 text-red-500 border border-red-500/30' :
                        user?.role === 'editor' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' :
                        'bg-slate-500/20 text-slate-400 border border-slate-500/30'
                    }`}>
                        {user?.role === 'admin' ? 'Administrateur' : user?.role === 'editor' ? 'Éditeur' : 'Lecteur'}
                    </span>
                </div>
             </div>
             <button 
                onClick={() => logout()}
                className="w-full flex items-center justify-center gap-3 py-4 rounded-2xl bg-red-600 text-white font-black uppercase text-sm shadow-lg shadow-red-900/20"
             >
                <LogOut size={20} />
                Se déconnecter
             </button>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 overflow-auto md:p-8 p-4 pt-24 md:pt-8 relative w-full scroll-smooth print:p-0 print:overflow-visible print:h-auto print:block">
        {children}
      </main>
    </div>
  );
};