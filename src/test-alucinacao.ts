import { processMessage } from './ai/agent';
import { addMessage, getHistory, clearHistory } from './conversation/manager';
import { logger } from './utils/logger';

logger.level = 'silent';

async function test(label: string, msgs: string[]) {
  const convId = `test_aluc_${label.replace(/\s/g, '_')}`;
  await clearHistory(convId);

  console.log(`━━━ ${label} ━━━`);

  for (const msg of msgs) {
    const history = await getHistory(convId);
    await addMessage(convId, 'user', msg);
    console.log(`👤 "${msg}"`);

    const response = await processMessage({
      userMessage: msg,
      conversationHistory: history,
      role: 'client',
      clientPhone: '5527999990000',
      channel: 'whatsapp',
    });

    const parts = response.split(/\[BREAK\]/gi);
    parts.forEach(p => console.log(`🤖 "${p.trim()}"`));

    await addMessage(convId, 'assistant', response.replace(/\[BREAK\]/gi, '\n'));
    await new Promise(r => setTimeout(r, 2000));
  }
  console.log('');
}

async function main() {
  // Cenário 1: pedir profissional sem ter chamado função
  await test('Serviço sem especificar', ['quero fazer unha']);

  // Cenário 2: fluxo completo
  await test('Fluxo completo', ['quero marcar cabelo', 'sexta às 10h']);

  // Cenário 3: perguntar quem faz
  await test('Quem faz depilação?', ['quem faz depilação?']);

  process.exit(0);
}

main().catch(e => { console.error('ERRO:', e); process.exit(1); });
