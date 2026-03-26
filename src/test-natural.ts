import { processMessage } from './ai/agent';
import { addMessage, getHistory, clearHistory } from './conversation/manager';
import { logger } from './utils/logger';

logger.level = 'silent';

async function test(label: string, msgs: string[]) {
  const convId = `test_nat_${label.replace(/\s/g, '_')}`;
  await clearHistory(convId);
  console.log(`━━━ ${label} ━━━`);
  for (const msg of msgs) {
    const history = await getHistory(convId);
    await addMessage(convId, 'user', msg);
    console.log(`👤 "${msg}"`);
    const response = await processMessage({
      userMessage: msg, conversationHistory: history,
      role: 'client', clientPhone: '5527999990000', channel: 'whatsapp',
    });
    response.split(/\[BREAK\]/gi).forEach(p => console.log(`🤖 "${p.trim()}"`));
    await addMessage(convId, 'assistant', response.replace(/\[BREAK\]/gi, '\n'));
    await new Promise(r => setTimeout(r, 2000));
  }
  console.log('');
}

async function main() {
  // Saudações (devem ser diferentes entre si)
  await test('Saudação 1', ['oi']);
  await test('Saudação 2', ['ola']);
  await test('Saudação 3', ['boa tarde']);
  await test('Saudação 4', ['eae']);

  // Fluxo de agendamento
  await test('Agendamento', ['oi', 'quero marcar unha', 'unha gel', 'sexta às 14h']);

  process.exit(0);
}

main().catch(e => { console.error('ERRO:', e); process.exit(1); });
