/**
 * Simula uma conversa completa com a Mari e mostra cada resposta.
 * Uso: npx tsx src/test-conversa.ts
 *
 * Edite o array `messages` abaixo para testar diferentes fluxos.
 */
import { processMessage } from './ai/agent';
import { addMessage, getHistory, clearHistory } from './conversation/manager';
import { logger } from './utils/logger';

logger.level = 'silent';

const CONV_ID = 'test_conversa_livre';
const PHONE = '5527999990000';
const PHONE_ADMIN = '559891752988';

interface ConversaConfig {
  name: string;
  role: 'client' | 'admin' | 'professional';
  channel: 'whatsapp' | 'instagram';
  phone: string;
  messages: string[];
  adminName?: string;
  professionalId?: number;
  professionalName?: string;
}

// Edite aqui para testar diferentes conversas:
const conversa: ConversaConfig = {
  name: 'Conversa livre — cliente',
  role: 'client',
  channel: 'whatsapp',
  phone: PHONE,
  messages: [
    'oi',
    'quero fazer unha gel',
  ],
};

async function run() {
  await clearHistory(CONV_ID);

  console.log(`\n\x1b[36m══════════════════════════════════════════\x1b[0m`);
  console.log(`\x1b[36m  ${conversa.name}\x1b[0m`);
  console.log(`\x1b[36m  Role: ${conversa.role} | Channel: ${conversa.channel}\x1b[0m`);
  console.log(`\x1b[36m══════════════════════════════════════════\x1b[0m\n`);

  for (let i = 0; i < conversa.messages.length; i++) {
    const msg = conversa.messages[i];
    const history = await getHistory(CONV_ID);

    console.log(`\x1b[33m👤 Cliente:\x1b[0m ${msg}`);

    const start = Date.now();
    const response = await processMessage({
      userMessage: msg,
      conversationHistory: history,
      role: conversa.role,
      clientPhone: conversa.phone,
      channel: conversa.channel,
      adminName: conversa.adminName,
      professionalId: conversa.professionalId,
      professionalName: conversa.professionalName,
    });
    const elapsed = Date.now() - start;

    // Mostrar resposta separando por [BREAK]
    const parts = response.split(/\[BREAK\]/gi).map(p => p.trim()).filter(Boolean);
    for (const part of parts) {
      console.log(`\x1b[32m💬 Mari:\x1b[0m ${part}`);
    }
    console.log(`\x1b[90m   (${elapsed}ms | ${response.length} chars | ${parts.length} msgs)\x1b[0m\n`);

    await addMessage(CONV_ID, 'user', msg);
    await addMessage(CONV_ID, 'assistant', response);

    // Delay entre mensagens
    if (i < conversa.messages.length - 1) {
      await new Promise(r => setTimeout(r, 1500));
    }
  }
}

run().catch(err => {
  console.error('Erro:', err);
  process.exit(1);
});
