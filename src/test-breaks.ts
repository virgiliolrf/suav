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
    adminName: opts.adminName,
  });
  console.log('━━━ ' + label + ' ━━━');
  console.log('Eu: "' + msg + '"');
  console.log('');
  const parts = r.split(/\[BREAK\]/gi);
  parts.forEach((p, i) => {
    console.log('  💬 ' + (i+1) + ': "' + p.trim() + '"');
  });
  console.log('  📏 ' + parts.length + ' msg(s) | ' + r.length + ' chars total');
  console.log('');
}

(async () => {
  // Cliente
  await test('oi', 'SAUDAÇÃO CLIENTE');
  await test('quais serviços vocês tem?', 'SERVIÇOS');
  await test('quanto custa unha gel?', 'PREÇO');
  await test('quero agendar unha gel pra sexta às 14h', 'AGENDAMENTO');
  await test('tô muito insatisfeita, minha unha quebrou no mesmo dia', 'RECLAMAÇÃO');
  await test('muito obrigada!', 'AGRADECIMENTO');

  // Profissional
  await test('eae mari, minha agenda de hoje?', 'PROFISSIONAL: AGENDA', {
    role: 'professional', phone: '5527992589125',
    professionalId: 9, professionalName: 'LARISSA',
  });

  // Admin
  await test('agenda de hoje', 'ADMIN: AGENDA', {
    role: 'admin', phone: '559891752988', adminName: 'Dona',
  });
})();
