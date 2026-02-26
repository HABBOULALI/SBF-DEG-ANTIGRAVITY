import React, { useState, useRef } from 'react';
import { Image, Upload, Wand2, Loader2, Download } from 'lucide-react';
import { editImage } from '../services/geminiService';

export const ImageEditor: React.FC = () => {
  const [image, setImage] = useState<string | null>(null);
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleEdit = async () => {
    if (!image || !prompt) return;
    setLoading(true);
    try {
      const newImage = await editImage(image, prompt);
      setImage(newImage);
      setPrompt('');
    } catch (err) {
      console.error(err);
      alert("Erreur lors de la génération de l'image.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-8 h-full">
      <div className="md:col-span-1 space-y-6">
        <div>
          <h2 className="text-xl font-bold mb-2">Éditeur Visuel IA</h2>
          <p className="text-sm text-gray-500">Modifiez des photos de chantier avec Gemini 2.5 Flash.</p>
        </div>

        <div className="space-y-4">
          <div 
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-gray-300 rounded-xl p-8 flex flex-col items-center justify-center cursor-pointer hover:border-blue-500 hover:bg-blue-50 transition-colors"
          >
            <input 
              type="file" 
              accept="image/*" 
              className="hidden" 
              ref={fileInputRef} 
              onChange={handleFileChange} 
            />
            <Upload className="text-gray-400 mb-2" size={32} />
            <span className="text-sm font-medium text-gray-600">Cliquez pour uploader une photo</span>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">Votre demande de modification</label>
            <textarea 
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              placeholder="Ex: Ajoute un casque de sécurité jaune sur la table, ou rend le ciel bleu."
              className="w-full p-3 border border-gray-300 rounded-lg h-32 resize-none focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>

          <button 
            onClick={handleEdit}
            disabled={!image || !prompt || loading}
            className="w-full bg-indigo-600 text-white py-3 rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 font-medium"
          >
            {loading ? <Loader2 className="animate-spin" /> : <Wand2 size={18} />}
            Générer Modification
          </button>
        </div>
      </div>

      <div className="md:col-span-2 bg-gray-100 rounded-xl flex items-center justify-center p-4 relative border border-gray-200 min-h-[400px]">
        {image ? (
          <div className="relative max-w-full max-h-full">
            <img src={image} alt="Preview" className="max-w-full max-h-[70vh] rounded shadow-lg object-contain" />
            <a 
              href={image} 
              download="chantier_edit.png" 
              className="absolute top-4 right-4 bg-white/90 p-2 rounded-full shadow hover:bg-white text-gray-700"
            >
              <Download size={20} />
            </a>
          </div>
        ) : (
          <div className="text-center text-gray-400">
            <Image size={48} className="mx-auto mb-2 opacity-50" />
            <p>L'aperçu de l'image apparaîtra ici</p>
          </div>
        )}
      </div>
    </div>
  );
};