import { processMessage } from './ai/agent';
import { addMessage, getHistory, clearHistory } from './conversation/manager';
import { logger } from './utils/logger';

logger.level = 'silent';

async function testFluxo() {
  const convId = 'test_fluxo_agendamento';
  await clearHistory(convId);

  const msgs = [
    'quero marcar unha gel',
    'amanhã às 14h',
    'com a Larissa',
    'Juliana, pode confirmar',
  ];

  console.log('━━━ FLUXO DE AGENDAMENTO ━━━\n');

  for (const msg of msgs) {
    const history = await getHistory(convId);
    await addMessage(convId, 'user', msg);

    console.log(`👤 Cliente: "${msg}"`);

    const response = await processMessage({
      userMessage: msg,
      conversationHistory: history,
      role: 'client',
      clientPhone: '5527999990000',
      channel: 'whatsapp',
    });

    const parts = response.split(/\[BREAK\]/gi);
    parts.forEach(p => {
      console.log(`🤖 Mari: "${p.trim()}"`);
    });
    console.log('');

    await addMessage(convId, 'assistant', response.replace(/\[BREAK\]/gi, '\n'));

    // delay
    await new Promise(r => setTimeout(r, 2000));
  }

  process.exit(0);
}

testFluxo().catch(e => { console.error('ERRO:', e); process.exit(1); });
