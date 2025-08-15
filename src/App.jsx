import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken } from 'firebase/auth';
import { getFirestore, collection, addDoc, query, onSnapshot } from 'firebase/firestore';
import { ArrowRight, Bot, User, FileText, BrainCircuit, Mic, Send, ChevronLeft, Link as LinkIcon } from 'lucide-react';


// --- Firebase Configuration ---
const firebaseConfig = {
    apiKey: "AIzaSyBKK1dRvvBYcjj5sZlvi72dziwPyAwWLpc",
    authDomain: "community-88bbb.firebaseapp.com",
    projectId: "community-88bbb",
    storageBucket: "community-88bbb.appspot.com",
    messagingSenderId: "250393767715",
    appId: "1:250393767715:web:9b1ba40659ff541d04a696"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// --- Gemini API & Web Speech API ---
const API_KEY = "AIzaSyC7xMEbIYz6HCojxJsERrXHZmXK40MStkM";
const API_URL_BASE = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${API_KEY}`;

// Speech Recognition setup
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
const recognition = SpeechRecognition ? new SpeechRecognition() : null;
if (recognition) {
  recognition.continuous = true; // Allow continuous speech
  recognition.lang = 'ko-KR';    // Korean is primary, but often handles English well
  recognition.interimResults = true; // Get interim results
}

const fetchWithBackoff = async (url, options, retries = 3, delay = 1000) => {
    for (let i = 0; i < retries; i++) {
        try {
            const response = await fetch(url, options);
            if (response.ok) { return response.json(); }
            if (response.status >= 400 && response.status < 500) {
                 console.error("Client-side error:", response.status, await response.text());
                 throw new Error(`Client error: ${response.status}`);
            }
        } catch (error) {
            if (i === retries - 1) throw error;
        }
        await new Promise(res => setTimeout(res, delay * Math.pow(2, i)));
    }
};

const geminiAPI = {
  generateBriefing: async (company, role) => {
    const prompt = `You are an expert career consultant. For the company "${company}" and the job role "${role}", provide a concise briefing for an interview candidate. The output must be a JSON object, and all text must be in Korean. The company is located in South Korea, so all analysis should be based on the Korean market.

JSON Output Structure:
- "companySummary": A summary of the company's recent activities and market position.
- "industryTrends": 3-4 key industry trends relevant to the role.
- "companyCulture": An educated guess on the company's culture.
- "recommendedTone": Recommend a specific tone for the interview.`;
    
    const payload = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            companySummary: { type: "STRING" },
            industryTrends: { type: "ARRAY", items: { type: "STRING" } },
            companyCulture: { type: "STRING" },
            recommendedTone: { type: "STRING" }
          },
          required: ["companySummary", "industryTrends", "companyCulture", "recommendedTone"]
        }
      }
    };
    const result = await fetchWithBackoff(API_URL_BASE, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const text = result?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error("AI 브리핑 파싱 실패");
    return JSON.parse(text);
  },

  generateQuestions: async (role) => {
    const prompt = `You are an expert interviewer. For a "${role}" position in a South Korean tech company, generate 5 essential interview questions. The output must be a JSON array of objects, with each object having a "type" and "text" in Korean. Types: '기초', '직무', '경험', '협업', '심화'.`;
    const payload = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: { type: "ARRAY", items: { type: "OBJECT", properties: { type: { type: "STRING" }, text: { type: "STRING" } }, required: ["type", "text"] } }
      }
    };
    const result = await fetchWithBackoff(API_URL_BASE, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const text = result?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error("AI 질문 파싱 실패");
    return JSON.parse(text);
  },

  getFeedback: async (question, answer) => {
    const prompt = `You are an expert interview coach AI. A candidate has answered a question via voice, and this is the transcription.
- Question: "${question}"
- Transcribed Answer: "${answer}"

Provide feedback in a JSON object, with all text in Korean. Analyze the text to infer the speaker's vocal delivery.
1.  **logic**: Evaluate the logical structure (e.g., STAR method). Score (0-100) and comment.
2.  **clarity**: Evaluate the clarity of the content. Score (0-100) and comment.
3.  **vocalTone**: Based on the text's wording, structure, and flow, infer and evaluate the speaker's vocal tone and confidence. Score (0-100) and provide a comment as if you heard the actual voice (e.g., mention confidence, pace, conviction).
4.  **betterExample**: Rewrite the answer into a more ideal and impactful response.`;
    
    const payload = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            logic: { type: "OBJECT", properties: { score: { type: "NUMBER" }, comment: { type: "STRING" } }, required: ["score", "comment"] },
            clarity: { type: "OBJECT", properties: { score: { type: "NUMBER" }, comment: { type: "STRING" } }, required: ["score", "comment"] },
            vocalTone: { type: "OBJECT", properties: { score: { type: "NUMBER" }, comment: { type: "STRING" } }, required: ["score", "comment"] },
            betterExample: { type: "STRING" }
          },
          required: ["logic", "clarity", "vocalTone", "betterExample"]
        }
      }
    };
    const result = await fetchWithBackoff(API_URL_BASE, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const text = result?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error("AI 피드백 파싱 실패");
    return JSON.parse(text);
  },
  
  generateRecommendedQuestions: async (weakness) => {
    const prompt = `You are an expert interviewer. A candidate needs to improve on: "${weakness}". Generate 3 new, targeted interview questions to practice this area. The output must be a JSON array of objects (type, text), all in Korean.`;
    const payload = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: { type: "ARRAY", items: { type: "OBJECT", properties: { type: { type: "STRING" }, text: { type: "STRING" } }, required: ["type", "text"] } }
      }
    };
    const result = await fetchWithBackoff(API_URL_BASE, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const text = result?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error("AI 추천 질문 파싱 실패");
    return JSON.parse(text);
  },
};

// The rest of the code continues exactly as provided by the user...