import React, { useState } from 'react';
import { Search, Loader2, ExternalLink, Globe } from 'lucide-react';
import { searchConstructionInfo } from '../services/geminiService';

export const SearchTool: React.FC = () => {
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<{text: string, sources: any[]} | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    
    setLoading(true);
    setResult(null);
    try {
      const response = await searchConstructionInfo(query);
      setResult(response);
    } catch (err) {
      console.error(err);
      alert("Erreur lors de la recherche");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-bold text-gray-800 flex items-center justify-center gap-2">
          <Globe className="text-blue-500" />
          Recherche Web BTP
        </h2>
        <p className="text-gray-500">Trouvez des normes, prix et actualités à jour avec Gemini & Google Search.</p>
      </div>

      <form onSubmit={handleSearch} className="relative">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Ex: Prix du béton C25/30 en 2025 ou Norme NF P 03-001"
          className="w-full px-5 py-4 pl-12 rounded-2xl border border-gray-300 shadow-sm focus:ring-2 focus:ring-blue-500 outline-none text-lg"
        />
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
        <button 
          type="submit" 
          disabled={loading}
          className="absolute right-3 top-1/2 -translate-y-1/2 bg-blue-600 text-white px-6 py-2 rounded-xl hover:bg-blue-700 disabled:opacity-50 font-medium transition-colors"
        >
          {loading ? <Loader2 className="animate-spin" /> : 'Rechercher'}
        </button>
      </form>

      {result && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-6 animate-in fade-in slide-in-from-bottom-4">
          <div className="prose prose-blue max-w-none">
             <p className="whitespace-pre-wrap text-gray-800 leading-relaxed">{result.text}</p>
          </div>

          {result.sources && result.sources.length > 0 && (
            <div className="border-t border-gray-100 pt-4">
              <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Sources Vérifiées</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {result.sources.map((chunk, idx) => {
                  const web = chunk.web;
                  if (!web) return null;
                  return (
                    <a 
                      key={idx} 
                      href={web.uri} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 p-3 rounded-lg border border-gray-100 hover:bg-gray-50 hover:border-blue-200 transition-all group"
                    >
                      <div className="bg-blue-50 p-2 rounded text-blue-600 group-hover:bg-blue-100">
                        <ExternalLink size={16} />
                      </div>
                      <div className="flex-1 overflow-hidden">
                        <div className="font-medium text-sm truncate text-gray-900">{web.title}</div>
                        <div className="text-xs text-gray-400 truncate">{web.uri}</div>
                      </div>
                    </a>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};