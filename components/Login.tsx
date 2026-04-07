import React, { useState } from 'react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../services/firebase';
import { Building2, KeyRound, Mail, AlertCircle, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';

export const Login: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err: any) {
      setError("Email ou mot de passe incorrect.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-950 flex items-center justify-center p-4 transition-colors">
      <div className="max-w-md w-full bg-white dark:bg-slate-900 rounded-2xl shadow-xl overflow-hidden border border-gray-100 dark:border-slate-800 transition-colors">
        <div className="bg-blue-600 p-8 text-center">
            <div className="w-16 h-16 bg-white shrink-0 rounded-full flex items-center justify-center mx-auto mb-4 shadow-md">
                 <Building2 className="text-blue-600" size={32} />
            </div>
            <h1 className="text-xl font-bold text-white uppercase tracking-wider">SBF-GED</h1>
            <p className="text-blue-100 text-[11px] mt-2">Gestion Électronique des Documents BTP</p>
        </div>

        <div className="p-8">
          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 p-4 rounded-lg flex items-start gap-3 border border-red-100 dark:border-red-900/30">
                <AlertCircle size={20} className="shrink-0 mt-0.5" />
                <p className="text-[13px] font-medium">{error}</p>
              </div>
            )}

            <div>
              <label className="block text-[13px] font-medium text-gray-700 dark:text-slate-300 mb-2">Adresse Email</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Mail size={18} className="text-gray-400" />
                </div>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="block w-full pl-10 pr-3 py-3 bg-gray-50 dark:bg-slate-800 border border-gray-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 dark:text-white text-[13px] transition-colors"
                  placeholder="exemple@sbf.com"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-[13px] font-medium text-gray-700 dark:text-slate-300 mb-2">Mot de passe</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <KeyRound size={18} className="text-gray-400" />
                </div>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="block w-full pl-10 pr-3 py-3 bg-gray-50 dark:bg-slate-800 border border-gray-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 dark:text-white text-[13px] transition-colors"
                  placeholder="••••••••"
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex justify-center items-center gap-2 py-3 px-4 border border-transparent rounded-lg shadow-sm text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 transition-all transform active:scale-95 disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {loading ? <Loader2 size={18} className="animate-spin" /> : "Se Connecter"}
            </button>

            <div className="text-center">
              <button
                type="button"
                onClick={async () => {
                  if (!email) {
                    toast.error("Veuillez saisir votre adresse email d'abord.");
                    return;
                  }
                  try {
                    const { getAuth, sendPasswordResetEmail } = await import('firebase/auth');
                    const auth = getAuth();
                    await sendPasswordResetEmail(auth, email);
                    toast.success("Email de réinitialisation envoyé ! Vérifiez votre boîte aux lettres.");
                  } catch (err: any) {
                    toast.error("Erreur : " + err.message);
                  }
                }}
                className="text-[11px] text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 font-medium transition-colors"
              >
                Mot de passe oublié ?
              </button>
            </div>
          </form>
          
          <div className="mt-8 border-t border-gray-200 dark:border-slate-800 pt-6 text-center">
              <p className="text-[11px] text-gray-400 italic">
                  Plateforme privée. Contactez l'administrateur SBF pour obtenir vos accès.
              </p>
          </div>
        </div>
      </div>
    </div>
  );
};
