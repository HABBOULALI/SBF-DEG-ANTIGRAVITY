import { GoogleGenAI, Type } from "@google/genai";

// Helper to get AI instance safely
const getAI = () => new GoogleGenAI({ apiKey: process.env.API_KEY });

// 1. Chat Bot (Gemini 3 Pro)
export const sendChatMessage = async (history: { role: string; parts: { text: string }[] }[], newMessage: string) => {
  const ai = getAI();
  const chat = ai.chats.create({
    model: 'gemini-3-pro-preview',
    history: history,
    config: {
      systemInstruction: "Tu es un assistant expert en BTP (Bâtiment et Travaux Publics). Tu aides à rédiger des courriers, analyser des normes techniques et résumer des documents.",
    }
  });

  const result = await chat.sendMessage({ message: newMessage });
  return result.text;
};

// 2. Search Grounding (Gemini 3 Flash + Google Search)
export const searchConstructionInfo = async (query: string) => {
  const ai = getAI();
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: query,
    config: {
      tools: [{ googleSearch: {} }],
      systemInstruction: "Tu es un assistant de recherche pour le BTP. Trouve des normes, des prix de matériaux ou des actualités du secteur."
    }
  });
  
  return {
    text: response.text,
    sources: response.candidates?.[0]?.groundingMetadata?.groundingChunks || []
  };
};

// 3. Image Editing (Gemini 2.5 Flash Image)
export const editImage = async (imageBase64: string, prompt: string) => {
  const ai = getAI();
  // Strip header if present
  const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");
  
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash-image',
    contents: {
      parts: [
        {
          inlineData: {
            mimeType: 'image/png', // Assuming PNG for canvas exports usually
            data: base64Data
          }
        },
        { text: prompt }
      ]
    }
  });

  // Extract image
  for (const part of response.candidates?.[0]?.content?.parts || []) {
    if (part.inlineData) {
      return `data:image/png;base64,${part.inlineData.data}`;
    }
  }
  throw new Error("No image returned");
};

// 4. Video Generation (Veo)
export const generateVeoVideo = async (imageBase64: string, prompt: string = "Animate this construction site cinematically") => {
  const ai = getAI();
  const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");

  let operation = await ai.models.generateVideos({
    model: 'veo-3.1-fast-generate-preview',
    prompt: prompt,
    image: {
      imageBytes: base64Data,
      mimeType: 'image/png'
    },
    config: {
      numberOfVideos: 1,
      resolution: '720p',
      aspectRatio: '16:9'
    }
  });

  while (!operation.done) {
    await new Promise(resolve => setTimeout(resolve, 5000));
    operation = await ai.operations.getVideosOperation({ operation: operation });
  }

  const videoUri = operation.response?.generatedVideos?.[0]?.video?.uri;
  if (!videoUri) throw new Error("Video generation failed");

  return `${videoUri}&key=${process.env.API_KEY}`;
};
