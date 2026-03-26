import { openai, MODEL_NAME } from './openai';
import { getClientSystemPrompt, getAdminSystemPrompt, getProfessionalSystemPrompt } from './prompts';
import { clientFunctionDeclarations, clientFunctionDeclarationsWhatsApp, adminAllFunctionDeclarations, professionalAllFunctionDeclarations, executeFunction } from './functions';
import { logger } from '../utils/logger';
import { getSendMessageFunction } from '../services/notification';
import { PrismaClient } from '@prisma/client';

const prismaAgent = new PrismaClient();
import type { ChannelType } from '../channels/types';
import type { ChatCompletionMessageParam, ChatCompletionTool } from 'openai/resources/chat/completions';

const MAX_FUNCTION_CALLS_DEFAULT = 5;
const MAX_FUNCTION_CALLS_ADMIN = 8;
const MAX_RETRIES = 5;
const RETRY_DELAY_MS = 2000;

/**
 * Chama OpenAI com retry automatico em caso de 429 (rate limit)
 */
async function callWithRetry(params: any): Promise<any> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      return await openai.chat.completions.create(params);
    } catch (error: any) {
      if (error?.status === 429 && attempt < MAX_RETRIES - 1) {
        const delay = RETRY_DELAY_MS * (attempt + 1);
        logger.warn({ msg: `OpenAI 429 - retry ${attempt + 1}/${MAX_RETRIES} em ${delay}ms` });
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      throw error;
    }
  }
}

/**
 * Converte function declarations do formato interno para OpenAI tools
 */
function toOpenAITools(declarations: any[]): ChatCompletionTool[] {
  return declarations.map(decl => ({
    type: 'function' as const,
    function: {
      name: decl.name,
      description: decl.description,
      parameters: decl.parameters,
    },
  }));
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
  // Cliente: temperatura um pouco maior pra mais variedade no tom
  // Admin/Professional: temperatura baixa pra precisão com dados
  const temperature = role === 'client' ? 0.4 : 0.3;

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
      functionDeclarations = channel === 'whatsapp' ? clientFunctionDeclarationsWhatsApp : clientFunctionDeclarations;
  }

  // Montar historico no formato OpenAI
  const messages: ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt },
  ];

  for (const msg of conversationHistory) {
    messages.push({
      role: msg.role === 'user' ? 'user' : 'assistant',
      content: msg.content,
    } as ChatCompletionMessageParam);
  }

  // Adicionar mensagem atual
  messages.push({ role: 'user', content: userMessage });

  const tools = toOpenAITools(functionDeclarations);

  try {
    let response = await callWithRetry({
      model: MODEL_NAME,
      messages,
      tools,
      temperature,
    });

    // Track which functions were called and their results
    const calledFunctions: string[] = [];
    const functionResults: Map<string, any> = new Map();

    // Loop de function calling
    let iterations = 0;
    const maxCalls = role === 'admin' ? MAX_FUNCTION_CALLS_ADMIN : MAX_FUNCTION_CALLS_DEFAULT;
    while (iterations < maxCalls) {
      const choice = response.choices?.[0];
      if (!choice?.message) break;

      const toolCalls = choice.message.tool_calls;
      if (!toolCalls || toolCalls.length === 0) break;

      // Adicionar a resposta do assistente (com tool_calls) ao historico
      messages.push(choice.message);

      // Executar todas as tool calls
      for (const toolCall of toolCalls) {
        const name = toolCall.function.name;
        let args: Record<string, any> = {};
        try {
          args = JSON.parse(toolCall.function.arguments || '{}');
        } catch {
          args = {};
        }

        calledFunctions.push(name);
        logger.info({
          msg: 'OpenAI function call',
          function: name,
          args,
          channel,
          phone: clientPhone || '(instagram)',
          role,
        });

        // Injetar telefone da cliente em funcoes que precisam
        const enrichedArgs = { ...args };
        if (name === 'book_appointment' || name === 'get_client_appointments' || name === 'save_client_name') {
          if (role === 'admin') {
            // Não sobrescreve — usa o que o modelo passou
          } else if (channel === 'whatsapp' && clientPhone) {
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

        // Se report_complaint mandou notificar admins, envia WhatsApp para a gerência
        if (result?.__notify_admins && result?.__admin_message) {
          const sendFn = getSendMessageFunction();
          if (sendFn) {
            try {
              const admins = await prismaAgent.adminUser.findMany();
              for (const admin of admins) {
                if (admin.phone) {
                  const { phoneToJid } = await import('../utils/phone');
                  const jid = phoneToJid(admin.phone);
                  await sendFn(jid, result.__admin_message);
                }
              }
            } catch (notifyErr) {
              logger.error({ msg: 'Erro ao notificar admins sobre reclamação', error: notifyErr });
            }
          }
          // Limpar campos internos antes de passar pro modelo
          delete result.__notify_admins;
          delete result.__admin_message;
        }

        // Salvar resultado para validação posterior
        functionResults.set(name, result);

        logger.info({
          msg: 'Function result',
          function: name,
          result: JSON.stringify(result).substring(0, 500),
        });

        // Adicionar resultado da tool ao historico
        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: JSON.stringify(result),
        });
      }

      // Chamar OpenAI novamente com os resultados
      response = await callWithRetry({
        model: MODEL_NAME,
        messages,
        tools,
        temperature,
      });

      iterations++;
    }

    // Extrair resposta texto final
    let finalText = response.choices?.[0]?.message?.content || '';

    logger.debug({
      msg: 'Final response',
      textLength: finalText.length,
      text: finalText.substring(0, 500),
    });

    // SAFETY NET: Detectar alucinação de nomes de profissionais
    if (role === 'client' && finalText) {
      const serviceKeywords = /\b(unha|gel|cabelo|corte|escova|progressiva|depila|manicure|pedicure|sobrancelha|cílio|cilios|extensão|alongamento|coloração|tintura|mechas|luzes|hidratação|botox|limpeza de pele|design|esmalt)\b/i;
      const hasServiceMention = serviceKeywords.test(userMessage);
      const hasNamePattern = /temos a \w+/i.test(finalText);

      let needsRegeneration = false;
      let functionResultForRegen: any = null;
      let serviceNameForRegen = '';

      if (!calledFunctions.includes('check_service_professionals')) {
        if (hasServiceMention && hasNamePattern) {
          logger.warn({ msg: 'Nomes sem check_service_professionals — forçando chamada' });
          const serviceMatch = userMessage.match(serviceKeywords);
          serviceNameForRegen = serviceMatch ? serviceMatch[0] : userMessage;
          functionResultForRegen = await executeFunction('check_service_professionals', { service_name: serviceNameForRegen });
          needsRegeneration = true;
        }
      } else if (hasNamePattern && functionResults.has('check_service_professionals')) {
        const result = functionResults.get('check_service_professionals');
        const realNames: string[] = [];
        if (result?.professionals) {
          for (const p of result.professionals) {
            if (p.name) realNames.push(p.name.toUpperCase());
          }
        }
        if (realNames.length > 0) {
          const textUpper = finalText.toUpperCase();
          const hasAnyRealName = realNames.some(n => textUpper.includes(n));
          if (!hasAnyRealName) {
            logger.warn({ msg: 'Nomes na resposta não batem com resultado da função — regenerando', realNames });
            const serviceMatch = userMessage.match(serviceKeywords);
            serviceNameForRegen = serviceMatch ? serviceMatch[0] : userMessage;
            functionResultForRegen = result;
            needsRegeneration = true;
          }
        }
      }

      if (needsRegeneration && functionResultForRegen) {
        const realNames: string[] = [];
        if (functionResultForRegen.professionals) {
          for (const p of functionResultForRegen.professionals) {
            if (p.name) realNames.push(p.name);
          }
        }

        if (realNames.length > 0) {
          const namesInstruction = `\n\nOs nomes das profissionais são EXATAMENTE: ${realNames.join(', ')}. Use ESSES nomes e NENHUM outro.`;

          // Adicionar tool call e resultado forçados
          const forcedToolCallId = 'forced_check';
          messages.push({
            role: 'assistant',
            content: null,
            tool_calls: [{
              id: forcedToolCallId,
              type: 'function',
              function: {
                name: 'check_service_professionals',
                arguments: JSON.stringify({ service_name: serviceNameForRegen }),
              },
            }],
          } as any);
          messages.push({
            role: 'tool',
            tool_call_id: forcedToolCallId,
            content: JSON.stringify(functionResultForRegen),
          });

          // Trocar system prompt com instrução extra
          messages[0] = { role: 'system', content: systemPrompt + namesInstruction };

          const correctedResponse = await callWithRetry({
            model: MODEL_NAME,
            messages,
            tools,
            temperature: 0.1,
          });

          const correctedText = correctedResponse.choices?.[0]?.message?.content || '';

          if (correctedText) {
            const correctedUpper = correctedText.toUpperCase();
            const hasRealName = realNames.some(n => correctedUpper.includes(n.toUpperCase()));
            if (hasRealName) {
              finalText = correctedText;
            } else {
              logger.warn({ msg: 'Regeneração também alucinhou — usando fallback com nomes reais' });
              const serviceName = functionResultForRegen.service?.name || serviceNameForRegen;
              const nameList = realNames.join(' e ');
              finalText = `pra ${serviceName.toLowerCase()} temos a ${nameList}![BREAK]qual vc prefere? 😊`;
            }
          }
        }
      }
    }

    // Se retornou vazio apos function call, tentar mais uma vez
    if (!finalText && iterations > 0) {
      logger.warn({ msg: 'OpenAI retornou vazio apos function call, retentando...' });
      const retryResponse = await callWithRetry({
        model: MODEL_NAME,
        messages,
        tools,
        temperature: 0.5,
      });

      finalText = retryResponse.choices?.[0]?.message?.content || '';
    }

    // Pós-processamento do texto final
    if (finalText) {
      // Normalizar variações do delimiter ([break], [ BREAK ], etc.)
      finalText = finalText.replace(/\[\s*break\s*\]/gi, '[BREAK]');

      // Corrigir nomes duplicados (ex: "CamilaCamila" → "Camila")
      finalText = finalText.replace(/([A-ZÁÀÂÃÉÈÊÍÏÓÔÕÖÚÇ][a-záàâãéèêíïóôõöúç]{2,})\1/g, '$1');

      // Anti-bot: substituir frases de robô que o modelo insiste em usar
      const botReplacements: [RegExp, string][] = [
        [/como posso te ajudar\??/gi, ''],
        [/em que posso ajudar\??/gi, ''],
        [/o que (você|vc) precisa\??/gi, ''],
        [/posso te ajudar com algo( mais)?\??/gi, ''],
        [/posso ajudar com algo( mais)?\??/gi, ''],
        [/posso te ajudar a /gi, ''],
        [/precisa de mais alguma coisa\??/gi, ''],
        [/se precisar[^.!?\n]*/gi, ''],
        [/estou à disposição[.!]?/gi, ''],
        [/\binfelizmente\b/gi, 'poxa'],
        [/vou verificar[^.!?\n]*/gi, ''],
        [/aguenta só um instante[.!]?/gi, ''],
        [/só um instante[.!]?/gi, ''],
        [/é só (chamar|falar|mandar mensagem)[.!]?/gi, ''],
        [/qualquer (dúvida|coisa)[, ]*(é só|pode)[^.!?\n]*/gi, ''],
      ];

      for (const [pattern, replacement] of botReplacements) {
        if (pattern.test(finalText)) {
          logger.warn({ msg: 'Anti-bot: substituindo frase de robô', pattern: pattern.source });
          finalText = finalText.replace(pattern, replacement);
        }
      }

      // Limpar espaços duplos e [BREAK] vazios após remoções
      finalText = finalText.replace(/\s{2,}/g, ' ').trim();
      finalText = finalText.replace(/\[BREAK\]\s*\[BREAK\]/g, '[BREAK]');
      finalText = finalText.replace(/^\[BREAK\]|(\[BREAK\]\s*$)/g, '').trim();
    }

    return finalText || 'Desculpa, não consegui processar sua mensagem. Pode repetir?';
  } catch (error) {
    logger.error({ msg: 'Erro no OpenAI', error });
    return 'Ops, tive um probleminha técnico. Pode tentar de novo em alguns segundos?';
  }
}
