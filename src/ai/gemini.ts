import { GoogleGenAI } from '@google/genai';
import { env } from '../config/env';

export const genai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });

export const MODEL_NAME = 'gemini-2.0-flash';
