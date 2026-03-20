import { genai, MODEL_NAME } from './gemini';
import { getClientSystemPrompt, getAdminSystemPrompt, getProfessionalSystemPrompt } from './prompts';
import { clientFunctionDeclarations, adminAllFunctionDeclarations, professionalAllFunctionDeclarations, executeFunction } from './functions';
import { logger } from '../utils/logger';
import type { Content, Part } from '@google/genai';
import type { ChannelType } from '../channels/types';

const MAX_FUNCTION_CALLS = 5;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

/**
 * Chama Gemini com retry automatico em caso de 429 (rate limit)
 */
async function callGeminiWithRetry(params: any): Promise<any> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      return await genai.models.generateContent(params);
    } catch (error: any) {
      if (error?.status === 429 && attempt < MAX_RETRIES - 1) {
        const delay = RETRY_DELAY_MS * (attempt + 1);
        logger.warn({ msg: `Gemini 429 - retry ${attempt + 1}/${MAX_RETRIES} em ${delay}ms` });
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      throw error;
    }
  }
}

/**
 * Processa uma mensagem do usuario e retorna a resposta do agente
 */
export async function processMessage(params: {
  userMessage: string;
  conversationHistory: { role: string; content: string }[];
  role?: 'admin' | 'professional' | 'client';
  clientPhone: string;
  channel?: ChannelType;
  clientName?: string;
  preferredProfessional?: string;
  igsid?: string;
  adminName?: string;
  professionalId?: number;
  professionalName?: string;
  // Backward compatibility
  isAdmin?: boolean;
}): Promise<string> {
  const {
    userMessage, conversationHistory, clientPhone,
    channel = 'whatsapp', clientName, preferredProfessional, igsid,
    adminName, professionalId, professionalName,
  } = params;

  // Determinar role (backward compat)
  const role = params.role || (params.isAdmin ? 'admin' : 'client');

  // Selecionar prompt e funções baseado no papel
  let systemPrompt: string;
  let functionDeclarations: any[];

  switch (role) {
    case 'admin':
      systemPrompt = getAdminSystemPrompt(adminName);
      functionDeclarations = adminAllFunctionDeclarations;
      break;
    case 'professional':
      systemPrompt = getProfessionalSystemPrompt(professionalName || 'Profissional');
      functionDeclarations = professionalAllFunctionDeclarations;
      break;
    default:
      systemPrompt = getClientSystemPrompt(channel, !!clientPhone, clientName, preferredProfessional);
      functionDeclarations = clientFunctionDeclarations;
  }

  // Montar historico de conversa no formato do Gemini
  const contents: Content[] = [];

  for (const msg of conversationHistory) {
    contents.push({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: [{ text: msg.content }],
    });
  }

  // Adicionar mensagem atual
  contents.push({
    role: 'user',
    parts: [{ text: userMessage }],
  });

  try {
    let response = await callGeminiWithRetry({
      model: MODEL_NAME,
      contents,
      config: {
        systemInstruction: systemPrompt,
        temperature: 0.3,
        tools: [{
          functionDeclarations: functionDeclarations as any,
        }],
      },
    });

    // Loop de function calling
    let iterations = 0;
    while (iterations < MAX_FUNCTION_CALLS) {
      const candidate = response.candidates?.[0];
      if (!candidate?.content?.parts) break;

      // Verificar se tem function calls
      const functionCallParts = candidate.content.parts.filter(
        (part: any) => !!part.functionCall
      );

      if (functionCallParts.length === 0) break;

      // Executar todas as function calls
      const functionResponses: Part[] = [];

      for (const part of functionCallParts) {
        const fc = (part as any).functionCall;
        const name: string = fc.name;
        const args: Record<string, any> = fc.args || {};

        logger.info({
          msg: 'Gemini function call',
          function: name,
          args,
          channel,
          phone: clientPhone || '(instagram)',
          role,
        });

        // Injetar telefone da cliente em funcoes que precisam
        const enrichedArgs = { ...args };
        if (name === 'book_appointment' || name === 'get_client_appointments' || name === 'save_client_name') {
          // Admin: NÃO forçar o telefone da admin como cliente
          // O Gemini deve usar o telefone que a admin forneceu
          if (role === 'admin') {
            // Não sobrescreve — usa o que o Gemini passou
          } else if (channel === 'whatsapp' && clientPhone) {
            // Cliente WhatsApp: SEMPRE usar o telefone real
            enrichedArgs.client_phone = clientPhone;
          } else if (!enrichedArgs.client_phone && clientPhone) {
            enrichedArgs.client_phone = clientPhone;
          }
        }

        // Injetar IGSID para persistir mapeamento Instagram → phone apos booking
        if (channel === 'instagram' && igsid) {
          enrichedArgs.__igsid = igsid;
        }

        let result: any;
        try {
          result = await executeFunction(name, enrichedArgs, professionalId);
        } catch (error) {
          logger.error({ msg: 'Erro ao executar funcao', function: name, error });
          result = { error: 'Erro interno ao processar. Tente novamente.' };
        }

        logger.info({
          msg: 'Function result',
          function: name,
          result: JSON.stringify(result).substring(0, 500),
        });

        functionResponses.push({
          functionResponse: {
            name,
            response: result,
          },
        });
      }

      // Adicionar APENAS as function calls ao historico do modelo
      // (descarta texto pre-funcao que pode conter dados inventados)
      const modelParts = candidate.content.parts.filter(
        (part: any) => !!part.functionCall
      );
      contents.push({
        role: 'model',
        parts: modelParts,
      });

      contents.push({
        role: 'user',
        parts: functionResponses,
      });

      // Chamar Gemini novamente com os resultados
      response = await callGeminiWithRetry({
        model: MODEL_NAME,
        contents,
        config: {
          systemInstruction: systemPrompt,
          temperature: 0.3,
          tools: [{
            functionDeclarations: functionDeclarations as any,
          }],
        },
      });

      iterations++;
    }

    // Extrair resposta texto final
    let finalParts = response.candidates?.[0]?.content?.parts || [];
    logger.debug({
      msg: 'Final response parts',
      partsCount: finalParts.length,
      parts: JSON.stringify(finalParts).substring(0, 1000),
    });

    let finalText = finalParts
      .filter((part: any) => part.text && part.text.trim().length > 0)
      .map((part: any) => part.text)
      .join('');

    // Se Gemini retornou vazio apos function call, tentar mais uma vez
    if (!finalText && iterations > 0) {
      logger.warn({ msg: 'Gemini retornou vazio apos function call, retentando...' });
      const retryResponse = await callGeminiWithRetry({
        model: MODEL_NAME,
        contents,
        config: {
          systemInstruction: systemPrompt,
          temperature: 0.5,
          tools: [{
            functionDeclarations: functionDeclarations as any,
          }],
        },
      });

      const retryParts = retryResponse.candidates?.[0]?.content?.parts || [];
      finalText = retryParts
        .filter((part: any) => part.text && part.text.trim().length > 0)
        .map((part: any) => part.text)
        .join('');
    }

    return finalText || 'Desculpa, não consegui processar sua mensagem. Pode repetir?';
  } catch (error) {
    logger.error({ msg: 'Erro no Gemini', error });
    return 'Ops, tive um probleminha técnico. Pode tentar de novo em alguns segundos?';
  }
}
