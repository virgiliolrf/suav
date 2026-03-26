import { processMessage } from './ai/agent';
import { clearHistory } from './conversation/manager';
import { logger } from './utils/logger';

logger.level = 'silent';

interface Test {
  label: string;
  msg: string;
  role: 'client' | 'admin' | 'professional';
  phone: string;
  adminName?: string;
  professionalName?: string;
  professionalId?: number;
}

const tests: Test[] = [
  { label: 'Cliente: serviços', msg: 'quais serviços vocês tem?', role: 'client', phone: '5527999990000' },
  { label: 'Cliente: preço unha gel', msg: 'quanto custa unha gel?', role: 'client', phone: '5527999990000' },
  { label: 'Cliente: agendamento', msg: 'quero agendar unha gel pra sexta às 14h', role: 'client', phone: '5527999990000' },
  { label: 'Admin: agenda do dia', msg: 'agenda de hoje', role: 'admin', phone: '559891752988', adminName: 'Dona' },
  { label: 'Admin: mudar preço', msg: 'Mudar preço aplicação unha de gel para 199', role: 'admin', phone: '559891752988', adminName: 'Dona' },
  { label: 'Prof: minha agenda', msg: 'minha agenda de hoje', role: 'professional', phone: '5527992589125', professionalName: 'LARISSA', professionalId: 9 },
];

async function main() {
  for (const t of tests) {
    await clearHistory(`test_break_${t.label}`);

    const response = await processMessage({
      userMessage: t.msg,
      conversationHistory: [],
      role: t.role,
      clientPhone: t.phone,
      channel: 'whatsapp',
      adminName: t.adminName,
      professionalName: t.professionalName,
      professionalId: t.professionalId,
    });

    console.log(`━━━ ${t.label} ━━━`);
    console.log(`Input: "${t.msg}" (role: ${t.role})`);

    const parts = response.split(/\[BREAK\]/gi);
    if (parts.length === 1) {
      console.log(`  📱 (msg única): "${response}"`);
    } else {
      parts.forEach((p, i) => {
        console.log(`  📱 msg ${i + 1}: "${p.trim()}"`);
      });
    }
    console.log(`  📏 ${parts.length} mensagem(ns) | ${response.length} chars total\n`);

    // delay entre testes
    await new Promise(r => setTimeout(r, 2000));
  }

  process.exit(0);
}

main().catch(err => {
  console.error('ERRO:', err);
  process.exit(1);
});
