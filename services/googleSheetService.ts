import { BTPDocument } from '../types';

// Récupérer l'URL configurée dans le localStorage
const getApiUrl = () => {
    const settings = localStorage.getItem('btp-app-settings');
    if (settings) {
        const parsed = JSON.parse(settings);
        return parsed.googleScriptUrl || null;
    }
    return null;
};

// Fonction pour alléger les documents avant envoi (retirer les fichiers Base64)
const stripHeavyData = (documents: BTPDocument[]): BTPDocument[] => {
    return documents.map(doc => ({
        ...doc,
        revisions: doc.revisions.map(rev => ({
            ...rev,
            // On envoie des tableaux vides pour ne pas saturer le Google Sheet
            // Les fichiers restent stockés en local (localStorage) pour l'instant
            transmittalFiles: [], 
            observationFiles: [] 
        }))
    }));
};

export const fetchDocumentsFromSheet = async (): Promise<BTPDocument[] | null> => {
    const url = getApiUrl();
    if (!url) return null;

    try {
        const response = await fetch(url);
        const data = await response.json();
        return Array.isArray(data) ? data : [];
    } catch (error) {
        console.error("Erreur chargement Google Sheet:", error);
        return null;
    }
};

export const saveDocumentsToSheet = async (documents: BTPDocument[]): Promise<boolean> => {
    const url = getApiUrl();
    if (!url) return false;

    // IMPORTANT : On retire les fichiers du payload car une cellule Google Sheet est limitée à 50 000 caractères.
    // Envoyer des PDF/Images en Base64 ferait échouer le script silencieusement.
    const lightDocuments = stripHeavyData(documents);

    try {
        await fetch(url, {
            method: 'POST',
            mode: 'no-cors',
            headers: {
                'Content-Type': 'text/plain'
            },
            body: JSON.stringify(lightDocuments)
        });
        return true;
    } catch (error) {
        console.error("Erreur sauvegarde Google Sheet:", error);
        return false;
    }
};

export const testGoogleSheetConnection = async (testUrl: string): Promise<boolean> => {
    try {
        const response = await fetch(testUrl);
        const data = await response.json();
        return Array.isArray(data);
    } catch (e) {
        console.error(e);
        return false;
    }
};