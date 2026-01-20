
import { GoogleGenAI, Type } from "@google/genai";
import { SchoolReport, AIInsight } from "../types";

// Fixed: Use process.env.API_KEY directly as required by guidelines
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const analyzeEducationData = async (reports: SchoolReport[]): Promise<AIInsight> => {
  const reportsText = reports.map(r => 
    `School: ${r.schoolName}, District: ${r.district}, Issues: ${r.issues}`
  ).join('\n---\n');

  const prompt = `Analyze the following school reports from Pakistan and provide a strategic summary.
  Reports:
  ${reportsText}
  
  Focus on identifying systemic patterns and critical infrastructure gaps.`;

  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          summary: { type: Type.STRING, description: 'A high-level executive summary of the situation.' },
          priorities: { 
            type: Type.ARRAY, 
            items: { type: Type.STRING },
            description: 'List of immediate intervention priorities.' 
          },
          suggestedResources: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: 'Types of resources or departments needed (e.g., Wash, Infrastructure, Pedagogy).'
          }
        },
        required: ['summary', 'priorities', 'suggestedResources']
      }
    }
  });

  try {
    return JSON.parse(response.text || '{}') as AIInsight;
  } catch (e) {
    console.error("Failed to parse AI response", e);
    return {
      summary: "Strategic analysis unavailable at this moment.",
      priorities: ["Manual review required"],
      suggestedResources: ["General Support"]
    };
  }
};

// Audio Helpers
export function decode(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

export function encode(bytes: Uint8Array): string {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}
