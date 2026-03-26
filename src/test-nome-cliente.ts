import { processMessage } from './ai/agent';
import { addMessage, getHistory, clearHistory } from './conversation/manager';
import { logger } from './utils/logger';

logger.level = 'silent';

async function test(label: string, msgs: string[]) {
  const convId = `test_nome_${label.replace(/\s/g, '_')}`;
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

    const clean = response.replace(/\[BREAK\]/gi, ' | ');
    console.log(`🤖 "${clean}"`);

    await addMessage(convId, 'assistant', response.replace(/\[BREAK\]/gi, '\n'));
    await new Promise(r => setTimeout(r, 2000));
  }
  console.log('');
}

async function main() {
  // Cenário real: bot pede nome, cliente responde, bot confirma
  await test('Fluxo com nome', [
    'quero marcar unha gel',
    'amanhã às 14h',
    'com a primeira',
    'Fernanda',       // <-- cliente diz o nome
  ]);

  // Cenário: nome no meio da frase
  await test('Nome no meio', [
    'oi quero agendar cabelo',
    'sexta às 10h',
    'Amanda, pode marcar com qualquer uma',
  ]);

  // Cenário: nome junto com confirmação
  await test('Nome + confirma', [
    'quero marcar depilação',
    'terça às 15h',
    'com a primeira opção',
    'Beatriz, pode confirmar',
  ]);

  process.exit(0);
}

main().catch(e => { console.error('ERRO:', e); process.exit(1); });
