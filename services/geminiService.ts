import { GoogleGenAI } from "@google/genai";

const apiKey = process.env.API_KEY || '';
const ai = new GoogleGenAI({ apiKey });

export const generateResponse = async (prompt: string, context?: string): Promise<string> => {
  if (!apiKey) {
    return "Error: API Key is missing. Please check your environment configuration.";
  }

  try {
    const modelId = "gemini-3-flash-preview";
    const fullPrompt = context 
      ? `Context: ${context}\n\nUser Query: ${prompt}` 
      : prompt;

    const response = await ai.models.generateContent({
      model: modelId,
      contents: fullPrompt,
      config: {
        systemInstruction: "You are a senior Python automation engineer specializing in the YouTube Data API. You are helpful, concise, and provide code examples when asked.",
      }
    });

    return response.text || "I couldn't generate a response.";
  } catch (error) {
    console.error("Gemini API Error:", error);
    return "Sorry, I encountered an error while processing your request.";
  }
};