export interface GoogleScriptRequest {
  action: string;
  [key: string]: any;
}

const parseJsonSafely = async (response: Response) => {
  const text = await response.text();

  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`Réponse Google Script invalide: ${text.slice(0, 200)}`);
  }
};

export const sendToGoogleScript = async (scriptUrl: string, data: GoogleScriptRequest) => {
  try {
    const response = await fetch(scriptUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8',
      },
      body: JSON.stringify(data),
    });

    const json = await parseJsonSafely(response);

    if (!response.ok || json?.success === false) {
      throw new Error(json?.error || `Google Script a répondu avec le statut ${response.status}.`);
    }

    return json;
  } catch (error) {
    console.error('Google Script Error:', error);
    throw error;
  }
};
