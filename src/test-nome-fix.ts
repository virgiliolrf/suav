import { processMessage } from './ai/agent';
import { addMessage, getHistory, clearHistory } from './conversation/manager';
import { logger } from './utils/logger';

logger.level = 'silent';

async function main() {
  const convId = 'test_nome_fix';
  await clearHistory(convId);

  const msgs = [
    'quero marcar unha gel',
    'amanhã às 14h',
    'pode ser com a Clau',
    'Fernanda',  // <-- NOME DA CLIENTE, não profissional!
  ];

  console.log('━━━ TESTE: Nome da cliente após bot perguntar ━━━\n');

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

    // Verificar se "Fernanda" foi tratado como cliente ou profissional
    if (msg === 'Fernanda') {
      const lower = response.toLowerCase();
      if (lower.includes('não faz') || lower.includes('profissional') || lower.includes('disponível')) {
        console.log('  ❌ ERRO: Bot interpretou "Fernanda" como PROFISSIONAL!');
      } else if (lower.includes('fernanda')) {
        console.log('  ✅ Bot usou "Fernanda" como NOME DA CLIENTE');
      }
    }

    await addMessage(convId, 'assistant', response.replace(/\[BREAK\]/gi, '\n'));
    await new Promise(r => setTimeout(r, 2000));
  }

  process.exit(0);
}

main().catch(e => { console.error('ERRO:', e); process.exit(1); });
