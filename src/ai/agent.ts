import { genai, MODEL_NAME } from './gemini';
import { getClientSystemPrompt, getAdminSystemPrompt } from './prompts';
import { clientFunctionDeclarations, adminAllFunctionDeclarations, executeFunction } from './functions';
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
  isAdmin: boolean;
  clientPhone: string;
  channel?: ChannelType;
  clientName?: string;
  preferredProfessional?: string;
  igsid?: string;
}): Promise<string> {
  const { userMessage, conversationHistory, isAdmin, clientPhone, channel = 'whatsapp', clientName, preferredProfessional, igsid } = params;

  const systemPrompt = isAdmin
    ? getAdminSystemPrompt()
    : getClientSystemPrompt(channel, !!clientPhone, clientName, preferredProfessional);
  const functionDeclarations = isAdmin ? adminAllFunctionDeclarations : clientFunctionDeclarations;

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
        temperature: 0.4,
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
        });

        // Injetar telefone da cliente em funcoes que precisam
        const enrichedArgs = { ...args };
        if (name === 'book_appointment' || name === 'get_client_appointments') {
          if (!enrichedArgs.client_phone && clientPhone) {
            enrichedArgs.client_phone = clientPhone;
          }
        }

        // Injetar IGSID para persistir mapeamento Instagram → phone apos booking
        if (channel === 'instagram' && igsid) {
          enrichedArgs.__igsid = igsid;
        }

        let result: any;
        try {
          result = await executeFunction(name, enrichedArgs);
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

      // Adicionar as chamadas de funcao e respostas ao historico
      contents.push({
        role: 'model',
        parts: candidate.content.parts,
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
          temperature: 0.4,
          tools: [{
            functionDeclarations: functionDeclarations as any,
          }],
        },
      });

      iterations++;
    }

    // Extrair resposta texto final
    const finalText = response.candidates?.[0]?.content?.parts
      ?.filter((part: any) => part.text)
      .map((part: any) => part.text)
      .join('') || 'Desculpa, nao consegui processar sua mensagem. Pode repetir?';

    return finalText;
  } catch (error) {
    logger.error({ msg: 'Erro no Gemini', error });
    return 'Ops, tive um probleminha tecnico. Pode tentar de novo em alguns segundos?';
  }
}
