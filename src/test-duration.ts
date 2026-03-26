import { processMessage } from './ai/agent';
import { logger } from './utils/logger';
logger.level = 'silent';

async function test(msg: string, label: string, opts: any = {}) {
  const r = await processMessage({
    userMessage: msg,
    conversationHistory: opts.history || [],
    role: opts.role || 'client',
    clientPhone: opts.phone || '5527999990000',
    channel: 'whatsapp',
    professionalId: opts.professionalId,
    professionalName: opts.professionalName,
  });
  console.log(`━━━ ${label} ━━━`);
  console.log(`Eu: "${msg}"`);
  const clean = r.replace(/\[BREAK\]/gi, '\n  ');
  console.log(`Mari: "${clean}"`);
  console.log('');
}

(async () => {
  // Cliente pergunta preço — deve mostrar duração
  await test('quanto custa fazer unha gel?', 'PREÇO COM DURAÇÃO');

  // Profissional terminou atendimento
  await test('já terminei aqui, pode liberar meu horário', 'PROFISSIONAL LIBERA HORÁRIO', {
    role: 'professional', phone: '5527992589125',
    professionalId: 9, professionalName: 'LARISSA',
  });
})();
