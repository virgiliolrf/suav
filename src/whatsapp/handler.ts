import { handleIncomingMessage } from '../channels/handler';
import { jidToPhone, normalizePhone } from '../utils/phone';
import type { ChannelSender } from '../channels/types';
import { sendText, sendTyping, stopTyping } from './sender';

/**
 * Sender do WhatsApp (implementa a interface ChannelSender)
 */
const whatsappSender: ChannelSender = {
  sendText,
  sendTyping,
  stopTyping,
};

/**
 * Handler de mensagens do WhatsApp — delega para o handler unificado
 */
export async function handleMessage(jid: string, text: string): Promise<void> {
  const phone = jidToPhone(jid);
  const normalized = normalizePhone(phone);

  await handleIncomingMessage({
    channel: 'whatsapp',
    senderId: jid,
    senderPhone: normalized,
    text,
  }, whatsappSender);
}
