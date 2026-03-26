import { processMessage } from './ai/agent';
import { addMessage, getHistory, clearHistory } from './conversation/manager';
import { logger } from './utils/logger';

logger.level = 'silent';

async function convo(label: string, msgs: string[], opts: { role?: 'client'|'admin'|'professional', phone?: string, adminName?: string, profName?: string, profId?: number } = {}) {
  const convId = `loop_${label.replace(/\s/g, '_')}`;
  await clearHistory(convId);
  console.log(`\n━━━ ${label} ━━━`);
  for (const msg of msgs) {
    const history = await getHistory(convId);
    await addMessage(convId, 'user', msg);
    console.log(`👤 "${msg}"`);
    const response = await processMessage({
      userMessage: msg, conversationHistory: history,
      role: opts.role || 'client', clientPhone: opts.phone || '5527999990000', channel: 'whatsapp',
      adminName: opts.adminName, professionalName: opts.profName, professionalId: opts.profId,
    });
    response.split(/\[BREAK\]/gi).forEach(p => console.log(`🤖 "${p.trim()}"`));
    await addMessage(convId, 'assistant', response.replace(/\[BREAK\]/gi, '\n'));
    await new Promise(r => setTimeout(r, 1500));
  }
}

async function main() {
  // RODADA 1: Saudações
  await convo('Oi simples', ['oi']);
  await convo('Boa noite', ['boa noite']);
  await convo('Tudo bem?', ['tudo bem?']);

  // RODADA 2: Agendamento completo
  await convo('Agendamento unha gel', [
    'oi', 'quero marcar unha gel', 'sexta às 15h', 'com a primeira opção', 'Juliana, pode confirmar'
  ]);

  // RODADA 3: Reclamação + fora do escopo
  await convo('Reclamação', ['tô muito insatisfeita, minha unha quebrou no mesmo dia']);
  await convo('Fora do escopo', ['qual a previsão do tempo?']);
  await convo('Robô?', ['vc é um robô?']);

  // RODADA 4: Cancelamento
  await convo('Cancelamento', ['quero ver meus agendamentos', 'quero cancelar']);

  // RODADA 5: Agradecimento + despedida
  await convo('Obrigada', ['muito obrigada!']);
  await convo('Tchau', ['tchau, bom final de semana']);

  process.exit(0);
}

main().catch(e => { console.error('ERRO:', e); process.exit(1); });
