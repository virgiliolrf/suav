import { getSocket } from './client';
import { logger } from '../utils/logger';

/**
 * Envia mensagem de texto para um JID
 */
export async function sendText(jid: string, text: string): Promise<void> {
  const socket = getSocket();
  if (!socket) {
    logger.error('Socket WhatsApp nao disponivel');
    return;
  }

  try {
    await socket.sendMessage(jid, { text });
    logger.info({ msg: 'Mensagem enviada', jid: jid.split('@')[0], textLength: text.length });
  } catch (error) {
    logger.error({ msg: 'Erro ao enviar mensagem', jid, error });
    throw error;
  }
}

/**
 * Envia indicador de "digitando..." antes de responder
 */
export async function sendTyping(jid: string): Promise<void> {
  const socket = getSocket();
  if (!socket) return;

  try {
    await socket.sendPresenceUpdate('composing', jid);
  } catch {
    // Ignora erro de presenca
  }
}

/**
 * Para indicador de "digitando..."
 */
export async function stopTyping(jid: string): Promise<void> {
  const socket = getSocket();
  if (!socket) return;

  try {
    await socket.sendPresenceUpdate('paused', jid);
  } catch {
    // Ignora erro de presenca
  }
}
