import { processMessage } from './ai/agent';
import { clearHistory } from './conversation/manager';
import { logger } from './utils/logger';

logger.level = 'info';

async function main() {
  console.log('=== TESTE: Admin muda preço ===\n');

  await clearHistory('test_admin_price');

  console.log('Enviando: "Mudar preço aplicação unha de gel de 189 para 199"');
  console.log('Role: admin | AdminName: Dona\n');

  const response = await processMessage({
    userMessage: 'Mudar preço aplicação unha de gel de 189 para 199',
    conversationHistory: [],
    role: 'admin',
    clientPhone: '559891752988',
    channel: 'whatsapp',
    adminName: 'Dona',
  });

  console.log('RESPOSTA DO BOT:');
  console.log(response);
  console.log('');

  process.exit(0);
}

main().catch(err => {
  console.error('ERRO FATAL:', err);
  process.exit(1);
});
