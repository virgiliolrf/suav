/**
 * Tipos e interfaces para o sistema multi-canal (WhatsApp + Instagram)
 */

export type ChannelType = 'whatsapp' | 'instagram';

/**
 * Interface de envio de mensagens — cada canal implementa a sua
 */
export interface ChannelSender {
  sendText(recipientId: string, text: string): Promise<void>;
  sendTyping(recipientId: string): Promise<void>;
  stopTyping(recipientId: string): Promise<void>;
}

/**
 * Mensagem recebida de qualquer canal
 */
export interface IncomingMessage {
  channel: ChannelType;
  senderId: string;       // JID (WhatsApp) ou IGSID (Instagram)
  senderPhone?: string;   // Telefone (WhatsApp) ou undefined (Instagram)
  igsid?: string;         // IGSID bruto do Instagram (para persistir mapeamento phone)
  text: string;
}

/**
 * Gera um ID unico de conversa baseado no canal + sender
 * WhatsApp: telefone normalizado (ex: "5527999991111")
 * Instagram: "ig_123456789" (prefixo ig_)
 */
export function getConversationId(channel: ChannelType, senderId: string): string {
  if (channel === 'instagram') {
    return `ig_${senderId}`;
  }
  return senderId; // WhatsApp usa o telefone direto
}
