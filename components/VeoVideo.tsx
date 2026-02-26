import React, { useState, useRef, useEffect } from 'react';
import { Video, Upload, Play, Loader2, Key } from 'lucide-react';
import { generateVeoVideo } from '../services/geminiService';

export const VeoVideo: React.FC = () => {
  const [image, setImage] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [hasKey, setHasKey] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Check for API Key selection on mount
    if (window.aistudio && window.aistudio.hasSelectedApiKey) {
        window.aistudio.hasSelectedApiKey().then(setHasKey);
    } else {
        // Fallback for dev env without the specific window object if needed, 
        // but instructions say assume it exists. 
        // We'll set false to force the UI to show the button if logic exists.
        setHasKey(false); 
    }
  }, []);

  const handleSelectKey = async () => {
    if (window.aistudio) {
        await window.aistudio.openSelectKey();
        setHasKey(true); // Assume success per instructions
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setImage(reader.result as string);
        setVideoUrl(null); // Reset video when new image loaded
      };
      reader.readAsDataURL(file);
    }
  };

  const handleGenerate = async () => {
    if (!image) return;
    setLoading(true);
    try {
      const url = await generateVeoVideo(image, prompt || "Animate this scene cinematically");
      setVideoUrl(url);
    } catch (err) {
      console.error(err);
      alert("Erreur lors de la génération vidéo. Vérifiez votre clé API.");
      // If failed with 404/Not Found entity likely due to key, reset key state
      setHasKey(false);
    } finally {
      setLoading(false);
    }
  };

  if (!hasKey) {
    return (
        <div className="flex flex-col items-center justify-center h-full space-y-6 text-center max-w-md mx-auto">
            <div className="bg-purple-100 p-4 rounded-full text-purple-600">
                <Video size={48} />
            </div>
            <h2 className="text-2xl font-bold text-gray-800">Génération Vidéo Veo</h2>
            <p className="text-gray-600">
                Pour utiliser le modèle de génération vidéo Veo, vous devez sélectionner une clé API liée à un projet facturable GCP.
            </p>
            <button 
                onClick={handleSelectKey}
                className="bg-purple-600 text-white px-6 py-3 rounded-lg font-bold flex items-center gap-2 hover:bg-purple-700 transition-colors"
            >
                <Key size={20} />
                Sélectionner Clé API Payante
            </button>
            <a 
                href="https://ai.google.dev/gemini-api/docs/billing" 
                target="_blank" 
                rel="noreferrer"
                className="text-sm text-blue-500 hover:underline"
            >
                En savoir plus sur la facturation
            </a>
        </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-8 h-full">
      <div className="md:col-span-1 space-y-6">
        <div>
          <h2 className="text-xl font-bold mb-2">Générateur Vidéo Veo</h2>
          <p className="text-sm text-gray-500">Transformez une image statique en vidéo 720p avec Veo.</p>
        </div>

        <div 
           onClick={() => fileInputRef.current?.click()}
           className="border-2 border-dashed border-gray-300 rounded-xl p-6 flex flex-col items-center justify-center cursor-pointer hover:border-purple-500 hover:bg-purple-50 transition-colors"
        >
           <input type="file" accept="image/*" className="hidden" ref={fileInputRef} onChange={handleFileChange} />
           <Upload className="text-gray-400 mb-2" size={24} />
           <span className="text-xs font-medium text-gray-600">Image Source</span>
        </div>

        {image && (
            <div className="w-full h-32 bg-gray-100 rounded-lg overflow-hidden border border-gray-200">
                <img src={image} alt="Source" className="w-full h-full object-cover" />
            </div>
        )}

        <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">Prompt d'animation</label>
            <textarea 
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              placeholder="Ex: Une caméra drone survole le chantier..."
              className="w-full p-3 border border-gray-300 rounded-lg h-24 resize-none focus:ring-2 focus:ring-purple-500 outline-none text-sm"
            />
        </div>

        <button 
          onClick={handleGenerate}
          disabled={!image || loading}
          className="w-full bg-purple-600 text-white py-3 rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 font-medium"
        >
          {loading ? <Loader2 className="animate-spin" /> : <Video size={18} />}
          Générer Vidéo (Veo)
        </button>
      </div>

      <div className="md:col-span-2 bg-black rounded-xl flex items-center justify-center p-4 overflow-hidden relative shadow-2xl">
        {videoUrl ? (
          <video 
            src={videoUrl} 
            controls 
            autoPlay 
            className="max-w-full max-h-[70vh] rounded shadow-lg" 
          />
        ) : loading ? (
            <div className="text-white text-center space-y-4">
                <Loader2 size={48} className="animate-spin mx-auto text-purple-500" />
                <p>Création de la vidéo en cours... (Cela peut prendre un moment)</p>
            </div>
        ) : (
          <div className="text-center text-gray-600">
            <Play size={64} className="mx-auto mb-4 opacity-30" />
            <p className="text-gray-400">Le résultat vidéo s'affichera ici</p>
          </div>
        )}
      </div>
    </div>
  );
};