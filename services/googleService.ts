
export const sendToGoogleScript = async (
  scriptUrl: string, 
  data: {
    action: string;
    refBE: string;
    project: string;
    recipient: string;
    documentCount: number;
    documents: any[];
    pdfContent?: string;
    fileName?: string;
  }
) => {
  try {
    // Note: We use 'no-cors' mode often for GAS if we don't need the response, 
    // but here we want to know if it succeeded. GAS handles CORS if the script returns TextOutput with proper headers.
    // However, simplest way from client-side without proxy is often just sending it.
    
    const response = await fetch(scriptUrl, {
      method: 'POST',
      body: JSON.stringify(data)
    });

    const json = await response.json();
    return json;
  } catch (error) {
    console.error("Google Script Error:", error);
    throw error;
  }
};
