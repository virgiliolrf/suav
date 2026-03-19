import { PrismaClient } from '@prisma/client';
import { processMessage } from '../ai/agent';
import { addMessage, getHistory } from '../conversation/manager';
import { isAdminPhone } from '../conversation/context';
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

    // Mostrar "digitando..."
    await sender.sendTyping(message.senderId);

    // Verificar admin (so funciona com telefone/WhatsApp)
    const isAdmin = message.senderPhone
      ? await isAdminPhone(message.senderPhone)
      : false;

    if (isAdmin) {
      logger.info({ msg: 'ADMIN DETECTADO', phone: message.senderPhone, channel: message.channel });
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

    // Buscar nome e profissional preferida do cliente (se tiver telefone)
    if (resolvedPhone) {
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

    // Processar com Gemini
    const response = await processMessage({
      userMessage: sanitizedText,
      conversationHistory: history,
      isAdmin,
      clientPhone: resolvedPhone,
      channel: message.channel,
      clientName,
      preferredProfessional,
      igsid: message.igsid,
    });

    // Salvar resposta
    await addMessage(conversationId, 'assistant', response);

    // Parar "digitando..." e enviar resposta
    await sender.stopTyping(message.senderId);
    await sender.sendText(message.senderId, response);

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
