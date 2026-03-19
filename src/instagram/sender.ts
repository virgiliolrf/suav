import { env } from '../config/env';
import { logger } from '../utils/logger';
import type { ChannelSender } from '../channels/types';

const GRAPH_API_URL = 'https://graph.instagram.com/v21.0';

/**
 * Envia mensagem de texto via Instagram Graph API
 */
async function sendInstagramMessage(recipientId: string, text: string): Promise<void> {
  if (!env.INSTAGRAM_ACCESS_TOKEN) {
    logger.error('INSTAGRAM_ACCESS_TOKEN nao configurado');
    return;
  }

  // Quebrar mensagens longas (Instagram tem limite de 1000 chars por mensagem)
  const chunks = splitMessage(text, 1000);

  for (const chunk of chunks) {
    const response = await fetch(`${GRAPH_API_URL}/me/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.INSTAGRAM_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        recipient: { id: recipientId },
        message: { text: chunk },
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      logger.error({ msg: 'Erro ao enviar mensagem Instagram', recipientId, error });
      throw new Error(`Instagram API error: ${response.status} — ${error}`);
    }

    logger.info({ msg: 'Mensagem Instagram enviada', recipientId, textLength: chunk.length });
  }
}

/**
 * Marca mensagem como "vista" (sender action)
 */
async function sendAction(recipientId: string, action: 'mark_seen' | 'typing_on' | 'typing_off'): Promise<void> {
  if (!env.INSTAGRAM_ACCESS_TOKEN) return;

  try {
    await fetch(`${GRAPH_API_URL}/me/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.INSTAGRAM_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        recipient: { id: recipientId },
        sender_action: action,
      }),
    });
  } catch {
    // Ignora erros de action
  }
}

/**
 * Quebra mensagem longa em chunks menores
 */
function splitMessage(text: string, maxLength: number): string[] {
  if (text.length <= maxLength) return [text];

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= maxLength) {
      chunks.push(remaining);
      break;
    }

    // Tenta quebrar na ultima quebra de linha antes do limite
    let splitIndex = remaining.lastIndexOf('\n', maxLength);
    if (splitIndex <= 0) {
      // Se nao tem quebra de linha, quebra no ultimo espaco
      splitIndex = remaining.lastIndexOf(' ', maxLength);
    }
    if (splitIndex <= 0) {
      // Ultimo recurso: corta no limite
      splitIndex = maxLength;
    }

    chunks.push(remaining.substring(0, splitIndex));
    remaining = remaining.substring(splitIndex).trimStart();
  }

  return chunks;
}

/**
 * Implementacao do ChannelSender para Instagram
 */
export const instagramSender: ChannelSender = {
  sendText: sendInstagramMessage,
  sendTyping: (recipientId: string) => sendAction(recipientId, 'typing_on'),
  stopTyping: (recipientId: string) => sendAction(recipientId, 'typing_off'),
};
