import React, { useState, useEffect, useRef, useCallback } from 'react';
import { LayoutDashboard, Send, Settings, Menu, X, FileText, LogOut, UserCircle, Sun, Moon, ChevronDown } from 'lucide-react';
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
  const [customLogo, setCustomLogo] = useState<string | null>(null);
  const [isNavbarVisible, setIsNavbarVisible] = useState(true);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const lastScrollY = useRef(0);
  const mainRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);

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

  // Close user menu on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setIsUserMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Auto-hide navbar on scroll down, show on scroll up
  const handleScroll = useCallback(() => {
    const el = mainRef.current;
    if (!el) return;
    const currentScrollY = el.scrollTop;
    
    if (currentScrollY > lastScrollY.current && currentScrollY > 60) {
      // Scrolling down - hide navbar
      setIsNavbarVisible(false);
      setIsUserMenuOpen(false);
    } else {
      // Scrolling up - show navbar
      setIsNavbarVisible(true);
    }
    lastScrollY.current = currentScrollY;
  }, []);

  useEffect(() => {
    const el = mainRef.current;
    if (!el) return;
    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => el.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

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
    <div className="flex flex-col h-screen bg-gray-50 dark:bg-slate-950 overflow-hidden transition-colors duration-300 print:h-auto print:overflow-visible print:block font-sans">
      
      {/* === HORIZONTAL TOP NAVBAR === */}
      <header 
        className={`fixed top-0 left-0 right-0 z-50 no-print transition-transform duration-300 ease-in-out ${
          isNavbarVisible ? 'translate-y-0' : '-translate-y-full'
        }`}
      >
        {/* Main navbar */}
        <div className="bg-orange-100 dark:bg-orange-200 backdrop-blur-xl border-b border-orange-200 dark:border-orange-300 shadow-lg shadow-orange-200/30 dark:shadow-orange-300/20">
          <div className="flex items-center justify-between px-4 md:px-6 h-14">
            
            {/* Left: Logo + App Name */}
            <div className="flex items-center gap-3 shrink-0">
              <div className="text-blue-500 shrink-0">
                {customLogo ? (
                  <img src={customLogo} alt="Logo" className="w-9 h-9 object-contain bg-white rounded-lg p-0.5 shadow-sm" />
                ) : (
                  <Logo className="w-9 h-9" />
                )}
              </div>
              <div className="hidden sm:block">
                <h1 className="text-sm font-black text-white tracking-tight leading-none uppercase">
                  SBF GED
                </h1>
                <p className="text-[9px] text-slate-400 uppercase tracking-widest font-medium mt-0.5">Gestion Electronique</p>
              </div>
            </div>

            {/* Center: Navigation Items (Desktop) */}
            <nav className="hidden md:flex items-center gap-1">
              {navItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[12px] font-bold uppercase tracking-wide transition-all duration-200 group relative ${
                    activeTab === item.id
                      ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/25'
                      : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  <item.icon size={16} className={`transition-transform duration-200 shrink-0 ${activeTab === item.id ? 'scale-110' : 'group-hover:scale-110'}`} />
                  <span className="whitespace-nowrap">{item.label}</span>
                </button>
              ))}
            </nav>

            {/* Right: Theme + User + Mobile Toggle */}
            <div className="flex items-center gap-2">
              {/* Theme Toggle */}
              <button 
                onClick={onToggleTheme}
                className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-400 transition-all border border-slate-700/50"
                title={theme === 'dark' ? 'Passer au mode clair' : 'Passer au mode sombre'}
              >
                {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} className="text-blue-400" />}
              </button>

              {/* User Menu (Desktop) */}
              <div ref={userMenuRef} className="relative hidden md:block">
                <button 
                  onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-800/50 hover:bg-slate-800 border border-slate-700/50 transition-all"
                >
                  <div className="w-7 h-7 rounded-full bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400 shrink-0">
                    <UserCircle size={18} />
                  </div>
                  <div className="text-left hidden lg:block">
                    <p className="text-[11px] font-bold text-white truncate max-w-[100px]">
                      {user?.displayName || user?.email?.split('@')[0]}
                    </p>
                    <span className={`text-[8px] uppercase font-black px-1.5 py-0.5 rounded inline-block ${
                      user?.role === 'admin' ? 'bg-red-500/20 text-red-400' :
                      user?.role === 'editor' ? 'bg-blue-500/20 text-blue-400' :
                      'bg-slate-500/20 text-slate-400'
                    }`}>
                      {user?.role === 'admin' ? 'Admin' : user?.role === 'editor' ? 'Éditeur' : 'Lecteur'}
                    </span>
                  </div>
                  <ChevronDown size={14} className={`text-slate-400 transition-transform duration-200 ${isUserMenuOpen ? 'rotate-180' : ''}`} />
                </button>

                {/* Dropdown */}
                {isUserMenuOpen && (
                  <div className="absolute right-0 top-full mt-2 w-56 bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl shadow-black/40 p-2 animate-in fade-in slide-in-from-top-2 duration-200 z-50">
                    <div className="px-3 py-2 mb-1">
                      <p className="text-xs font-bold text-white truncate">
                        {user?.displayName || user?.email?.split('@')[0]}
                      </p>
                      <p className="text-[10px] text-slate-400 truncate">{user?.email}</p>
                      <span className={`text-[9px] uppercase font-black px-2 py-0.5 rounded-md inline-block mt-2 ${
                        user?.role === 'admin' ? 'bg-red-500/20 text-red-400 border border-red-500/30' :
                        user?.role === 'editor' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' :
                        'bg-slate-500/20 text-slate-400 border border-slate-500/30'
                      }`}>
                        {user?.role === 'admin' ? 'Administrateur' : user?.role === 'editor' ? 'Éditeur' : 'Lecteur'}
                      </span>
                    </div>
                    <div className="border-t border-slate-700 my-1"></div>
                    <button 
                      onClick={() => { logout(); setIsUserMenuOpen(false); }}
                      className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-slate-400 hover:bg-red-500 hover:text-white transition-all text-xs font-bold uppercase"
                    >
                      <LogOut size={14} />
                      Déconnexion
                    </button>
                  </div>
                )}
              </div>

              {/* Mobile Menu Toggle */}
              <button 
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} 
                className="md:hidden p-2 rounded-xl bg-slate-800 text-white border border-slate-700/50"
              >
                {isMobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Dropdown Menu */}
        {isMobileMenuOpen && (
          <div className="md:hidden bg-slate-900/98 backdrop-blur-xl border-b border-slate-700/50 shadow-2xl animate-in fade-in slide-in-from-top-2 duration-200">
            <nav className="p-3 space-y-1">
              {navItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => {
                    setActiveTab(item.id);
                    setIsMobileMenuOpen(false);
                  }}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all ${
                    activeTab === item.id 
                      ? 'bg-blue-600 text-white shadow-lg' 
                      : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  <item.icon size={20} />
                  <span>{item.label}</span>
                </button>
              ))}
            </nav>

            <div className="p-3 pt-0 border-t border-slate-800 mt-1">
              <div className="flex items-center gap-3 px-4 py-3">
                <div className="w-10 h-10 rounded-full bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400">
                  <UserCircle size={24} />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-bold text-white">{user?.displayName || user?.email?.split('@')[0]}</p>
                  <span className={`text-[9px] uppercase font-black px-2 py-0.5 rounded-md inline-block mt-1 ${
                    user?.role === 'admin' ? 'bg-red-500/20 text-red-400 border border-red-500/30' :
                    user?.role === 'editor' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' :
                    'bg-slate-500/20 text-slate-400 border border-slate-500/30'
                  }`}>
                    {user?.role === 'admin' ? 'Admin' : user?.role === 'editor' ? 'Éditeur' : 'Lecteur'}
                  </span>
                </div>
              </div>
              <button 
                onClick={() => { logout(); setIsMobileMenuOpen(false); }}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-red-600 text-white font-black uppercase text-xs shadow-lg mt-2"
              >
                <LogOut size={16} />
                Se déconnecter
              </button>
            </div>
          </div>
        )}
      </header>

      {/* Main Content - with top padding for navbar */}
      <main 
        ref={mainRef}
        className="flex-1 overflow-auto p-4 md:p-8 pt-20 md:pt-[5.5rem] relative w-full scroll-smooth print:p-0 print:overflow-visible print:h-auto print:block print:pt-0"
      >
        {children}
      </main>

      {/* Version Footer */}
      <div className="text-center text-[9px] text-slate-500 font-medium py-1 bg-gray-50 dark:bg-slate-950 no-print transition-colors">
        v1.4.0 - © 2024 SBF Digital
      </div>
    </div>
  );
};