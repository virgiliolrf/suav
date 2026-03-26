import { PrismaClient } from '@prisma/client';
import { processMessage } from '../ai/agent';
import { addMessage, getHistory, isEscalated } from '../conversation/manager';
import { isAdminPhone, isProfessionalPhone } from '../conversation/context';
import { logger } from '../utils/logger';
import type { ChannelType, ChannelSender, IncomingMessage } from './types';
import { getConversationId } from './types';

const prisma = new PrismaClient();

// Rate limiting por conversa
const lastMessage = new Map<string, number>();
const MIN_INTERVAL_MS = 2000;

// Queue de processamento (evita processamento paralelo)
const processingQueue = new Map<string, boolean>();

const MEDIA_REPLY = 'Oi! Recebi sua mídia, mas por enquanto só consigo responder texto por aqui 😊\nPode me contar o que precisa em texto?';

/**
 * Calcula delay de digitação proporcional ao tamanho da mensagem
 * Simula tempo de digitação real
 */
function calculateTypingDelay(text: string): number {
  const baseDelay = 800;
  const perChar = 30;
  const maxDelay = 3000;
  return Math.min(baseDelay + text.length * perChar, maxDelay);
}

/**
 * Divide a resposta em segmentos e envia com delay de digitação entre eles
 * Simula comportamento real de uma pessoa no WhatsApp
 */
async function splitAndSend(
  sender: ChannelSender,
  recipientId: string,
  response: string
): Promise<void> {
  // Split case-insensitive pra garantir
  const segments = response
    .split(/\[BREAK\]/gi)
    .map(s => s.trim())
    .filter(s => s.length > 0);

  logger.info({ msg: 'splitAndSend', totalSegments: segments.length, rawLength: response.length, hasBreak: /\[BREAK\]/i.test(response) });

  for (let i = 0; i < segments.length; i++) {
    if (i > 0) {
      // Simula digitação entre mensagens
      await sender.sendTyping(recipientId);
      await new Promise(r => setTimeout(r, calculateTypingDelay(segments[i])));
    }
    await sender.stopTyping(recipientId);
    await sender.sendText(recipientId, segments[i]);
  }
}

/**
 * Handler unificado de mensagens — funciona com qualquer canal
 */
export async function handleIncomingMessage(
  message: IncomingMessage,
  sender: ChannelSender
): Promise<void> {
  const conversationId = getConversationId(message.channel, message.senderId);

  // Rate limiting
  const now = Date.now();
  const last = lastMessage.get(conversationId) || 0;
  if (now - last < MIN_INTERVAL_MS) {
    logger.warn({ msg: 'Rate limit', channel: message.channel, conversationId });
    return;
  }
  lastMessage.set(conversationId, now);

  // Evitar processamento paralelo
  if (processingQueue.get(conversationId)) {
    logger.warn({ msg: 'Ja processando mensagem', channel: message.channel, conversationId });
    return;
  }
  processingQueue.set(conversationId, true);

  try {
    logger.info({
      msg: 'Mensagem recebida',
      channel: message.channel,
      conversationId,
      text: message.text.substring(0, 100),
    });

    // Sanitizar input
    const sanitizedText = message.text.substring(0, 1000).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
    if (!sanitizedText) return;

    // Resposta rapida para midia (sem passar pelo AI)
    if (sanitizedText === '__media__') {
      await sender.sendText(message.senderId, MEDIA_REPLY);
      return;
    }

    // Verificar se conversa está escalada (reclamação encaminhada para gerência)
    // Admin e profissional nunca são bloqueados
    if (message.senderPhone && isEscalated(conversationId)) {
      const isAdmin = await isAdminPhone(message.senderPhone);
      const isProfessional = await isProfessionalPhone(message.senderPhone);
      if (!isAdmin && !isProfessional) {
        logger.info({ msg: 'Mensagem ignorada — conversa escalada', conversationId });
        // Salvar no histórico para a gerente ver depois
        await addMessage(conversationId, 'user', sanitizedText);
        await sender.sendText(
          message.senderId,
          'Sua solicitação já está com nossa gerente. Em breve ela entra em contato com você! 🙏'
        );
        return;
      }
    }

    // Mostrar "digitando..."
    await sender.sendTyping(message.senderId);

    // Determinar o papel do usuário: admin > professional > client
    let role: 'admin' | 'professional' | 'client' = 'client';
    let adminName: string | undefined;
    let professionalInfo: { id: number; name: string } | null = null;

    // DEBUG: Logar telefone recebido SEMPRE
    logger.info({ msg: 'ROLE CHECK — telefone recebido', senderPhone: message.senderPhone || '(vazio)', channel: message.channel });

    if (message.senderPhone) {
      // Verificar admin primeiro
      const isAdmin = await isAdminPhone(message.senderPhone);
      logger.info({ msg: 'ROLE CHECK — isAdmin resultado', phone: message.senderPhone, isAdmin });

      if (isAdmin) {
        role = 'admin';
        // Buscar nome do admin
        const admin = await prisma.adminUser.findFirst({
          where: { phone: { contains: message.senderPhone.replace(/^55/, '') } },
        });
        adminName = admin?.name || undefined;
        logger.info({ msg: 'ADMIN DETECTADO', phone: message.senderPhone, name: adminName, channel: message.channel });
      } else {
        // Verificar se é profissional
        professionalInfo = await isProfessionalPhone(message.senderPhone);
        if (professionalInfo) {
          role = 'professional';
          logger.info({ msg: 'PROFISSIONAL DETECTADA', phone: message.senderPhone, name: professionalInfo.name, channel: message.channel });
        } else {
          logger.info({ msg: 'ROLE CHECK — CLIENTE (nenhum match)', phone: message.senderPhone });
        }
      }
    } else {
      logger.warn({ msg: 'ROLE CHECK — senderPhone VAZIO, default client' });
    }

    // Resolver telefone e dados do cliente
    let resolvedPhone = message.senderPhone || '';
    let clientName: string | undefined;
    let preferredProfessional: string | undefined;

    if (message.channel === 'instagram' && message.igsid) {
      // Verificar se ja temos o telefone salvo para esse IGSID
      const igClient = await prisma.instagramClient.findUnique({
        where: { igsid: message.igsid },
      });
      if (igClient?.phone) {
        resolvedPhone = igClient.phone;
      }
    }

    // Buscar nome e profissional preferida do cliente (se for cliente e tiver telefone)
    if (role === 'client' && resolvedPhone) {
      const client = await prisma.client.findUnique({
        where: { phone: resolvedPhone },
      });
      if (client) {
        clientName = client.name || undefined;
        preferredProfessional = client.preferredProfessional || undefined;
      }
    }

    // Carregar historico
    const history = await getHistory(conversationId);

    // Salvar mensagem do usuario
    await addMessage(conversationId, 'user', sanitizedText);

    // Processar com IA
    const response = await processMessage({
      userMessage: sanitizedText,
      conversationHistory: history,
      role,
      clientPhone: resolvedPhone,
      channel: message.channel,
      clientName,
      preferredProfessional,
      igsid: message.igsid,
      adminName,
      professionalId: professionalInfo?.id,
      professionalName: professionalInfo?.name,
    });

    // Salvar resposta no histórico SEM delimitadores
    const cleanResponse = response.replace(/\[BREAK\]/gi, '\n').trim();
    await addMessage(conversationId, 'assistant', cleanResponse);

    // Enviar resposta em segmentos com delay de digitação
    await splitAndSend(sender, message.senderId, response);

  } catch (error) {
    logger.error({ msg: 'Erro ao processar mensagem', channel: message.channel, conversationId, error });

    try {
      await sender.stopTyping(message.senderId);
      await sender.sendText(message.senderId, 'Desculpa, tive um probleminha. Pode repetir sua mensagem?');
    } catch {
      // Se falhar ate o envio de erro, nao tem mais o que fazer
    }
  } finally {
    processingQueue.set(conversationId, false);
  }
}
