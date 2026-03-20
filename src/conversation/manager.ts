import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';

const prisma = new PrismaClient();

interface ConversationEntry {
  role: string;
  content: string;
}

// Cache em memoria das conversas ativas
const conversations = new Map<string, {
  messages: ConversationEntry[];
  lastActivity: Date;
}>();

const MAX_HISTORY = 20;           // Max mensagens no historico
const TIMEOUT_MS = 4 * 60 * 60 * 1000; // 4 horas timeout

/**
 * Adiciona mensagem ao historico de uma conversa
 */
export async function addMessage(phone: string, role: 'user' | 'assistant', content: string): Promise<void> {
  // Salvar no banco
  await prisma.conversationLog.create({
    data: { phone, role, content },
  });

  // Atualizar cache
  let conv = conversations.get(phone);
  if (!conv) {
    conv = { messages: [], lastActivity: new Date() };
    conversations.set(phone, conv);
  }

  conv.messages.push({ role, content });
  conv.lastActivity = new Date();

  // Limitar tamanho
  if (conv.messages.length > MAX_HISTORY) {
    conv.messages = conv.messages.slice(-MAX_HISTORY);
  }
}

/**
 * Recupera historico de conversa (do cache ou do banco)
 */
export async function getHistory(phone: string): Promise<ConversationEntry[]> {
  let conv = conversations.get(phone);

  // Verificar timeout
  if (conv && Date.now() - conv.lastActivity.getTime() > TIMEOUT_MS) {
    logger.info({ msg: 'Conversa expirada, resetando', phone });
    conversations.delete(phone);
    conv = undefined;
  }

  if (conv) {
    return conv.messages;
  }

  // Carregar do banco
  const logs = await prisma.conversationLog.findMany({
    where: { phone },
    orderBy: { createdAt: 'desc' },
    take: MAX_HISTORY,
  });

  if (logs.length === 0) return [];

  const messages = logs.reverse().map((log) => ({
    role: log.role,
    content: log.content,
  }));

  // Verificar se a ultima mensagem e muito antiga
  const lastLog = logs[logs.length - 1];
  if (Date.now() - lastLog.createdAt.getTime() > TIMEOUT_MS) {
    return []; // Conversa muito antiga, comecar do zero
  }

  conversations.set(phone, {
    messages,
    lastActivity: lastLog.createdAt,
  });

  return messages;
}

/**
 * Limpa historico de conversa (cache e banco)
 */
export async function clearHistory(phone: string): Promise<void> {
  conversations.delete(phone);
  try {
    await prisma.conversationLog.deleteMany({ where: { phone } });
  } catch {
    // Ignora erro se nao existir
  }
}

/**
 * Limpeza periodica de conversas inativas do cache
 */
export function cleanupInactiveConversations(): void {
  const now = Date.now();
  for (const [phone, conv] of conversations) {
    if (now - conv.lastActivity.getTime() > TIMEOUT_MS) {
      conversations.delete(phone);
    }
  }
}
