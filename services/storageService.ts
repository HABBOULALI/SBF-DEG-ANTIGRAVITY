import { sendToGoogleScript } from './googleService';

const SETTINGS_KEY = 'btp-app-settings';

const sanitizeSegment = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'file';

const getExtensionFromMimeType = (mimeType?: string) => {
  if (!mimeType) return 'bin';
  const [, subtype = 'bin'] = mimeType.split('/');
  return subtype.replace(/[^a-zA-Z0-9]/g, '') || 'bin';
};

const dataUrlToBlob = async (dataUrl: string): Promise<Blob> => {
  const response = await fetch(dataUrl);
  return response.blob();
};

const blobToBase64 = async (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        reject(new Error('Conversion base64 impossible.'));
        return;
      }

      const [, base64 = ''] = result.split(',');
      resolve(base64);
    };
    reader.onerror = () => reject(reader.error || new Error('Lecture du fichier impossible.'));
    reader.readAsDataURL(blob);
  });

const getDriveConfig = () => {
  const raw = localStorage.getItem(SETTINGS_KEY);
  if (!raw) {
    throw new Error("La configuration Google Drive est introuvable dans les paramètres de l'application.");
  }

  const settings = JSON.parse(raw);
  const scriptUrl = settings.googleDriveScriptUrl?.trim();
  const rootFolderId = settings.googleDriveRootFolderId?.trim() || '';

  if (!scriptUrl) {
    throw new Error("L'URL du script Google Drive n'est pas configurée.");
  }

  return {
    scriptUrl,
    rootFolderId,
  };
};

const splitVirtualPath = (path: string) => {
  const normalized = path.split('/').filter(Boolean);
  const fileName = normalized.pop() || 'file.bin';

  return {
    folderPath: normalized.join('/'),
    fileName,
  };
};

const extractDriveFileId = (fileUrl: string) => {
  const directMatch = fileUrl.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (directMatch?.[1]) return directMatch[1];

  const idQueryMatch = fileUrl.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (idQueryMatch?.[1]) return idQueryMatch[1];

  return null;
};

export const storageService = {
  buildPath: (...segments: string[]) => segments.map(sanitizeSegment).join('/'),

  isRemoteFileUrl: (value: string) => /^https?:\/\//i.test(value),

  isDataUrl: (value: string) => /^data:/i.test(value),

  uploadFile: async (path: string, file: Blob, metadata?: { contentType?: string }) => {
    const { scriptUrl, rootFolderId } = getDriveConfig();
    const { folderPath, fileName } = splitVirtualPath(path);
    const base64 = await blobToBase64(file);

    const json = await sendToGoogleScript(scriptUrl, {
      action: 'uploadFile',
      rootFolderId,
      folderPath,
      fileName,
      mimeType: metadata?.contentType || file.type || 'application/octet-stream',
      contentBase64: base64,
    });

    return {
      path,
      downloadURL: json.webViewLink || json.webContentLink || json.url,
      fileId: json.fileId,
    };
  },

  uploadDataUrl: async (basePath: string, dataUrl: string, filePrefix: string) => {
    const blob = await dataUrlToBlob(dataUrl);
    const extension = getExtensionFromMimeType(blob.type);
    const filePath = `${basePath}/${sanitizeSegment(filePrefix)}.${extension}`;

    return this.uploadFile(filePath, blob, { contentType: blob.type || 'application/octet-stream' });
  },

  deleteByUrl: async (fileUrl: string) => {
    if (!/^https?:\/\//i.test(fileUrl)) return;

    const fileId = extractDriveFileId(fileUrl);
    if (!fileId) return;

    try {
      const { scriptUrl } = getDriveConfig();
      await sendToGoogleScript(scriptUrl, {
        action: 'deleteFile',
        fileId,
      });
    } catch (error) {
      console.warn('Unable to delete file from Google Drive:', error);
    }
  },
};
