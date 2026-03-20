import { processMessage } from './ai/agent';
import { addMessage, getHistory, clearHistory } from './conversation/manager';
import { logger } from './utils/logger';

logger.level = 'silent';

const PHONE_CLIENTE = '5527999990000';
const PHONE_ADMIN = '559891752988';

interface TestScenario {
  name: string;
  role: 'admin' | 'professional' | 'client';
  channel: 'whatsapp' | 'instagram';
  phone: string;
  messages: string[];
  checks: ((responses: string[]) => { pass: boolean; reason: string })[];
}

const scenarios: TestScenario[] = [
  // === CLIENTE ===
  {
    name: 'Cliente: Saudação inicial',
    role: 'client',
    channel: 'whatsapp',
    phone: PHONE_CLIENTE,
    messages: ['oi'],
    checks: [
      (r) => ({
        pass: r[0].toLowerCase().includes('mari') || r[0].toLowerCase().includes('suav') || r[0].toLowerCase().includes('oi') || r[0].toLowerCase().includes('ajudar'),
        reason: 'Deve cumprimentar e oferecer ajuda',
      }),
      (r) => ({
        pass: !r[0].toLowerCase().includes('inteligência artificial') && !r[0].toLowerCase().includes('bot'),
        reason: 'NÃO deve dizer que é IA/bot',
      }),
    ],
  },
  {
    name: 'Cliente: Pergunta serviços',
    role: 'client',
    channel: 'whatsapp',
    phone: PHONE_CLIENTE,
    messages: ['quais serviços vocês tem?'],
    checks: [
      (r) => ({
        pass: r[0].toLowerCase().includes('esmalteria') || r[0].toLowerCase().includes('cabelo') || r[0].toLowerCase().includes('depila'),
        reason: 'Deve listar categorias de serviços',
      }),
    ],
  },
  {
    name: 'Cliente: Preço de serviço',
    role: 'client',
    channel: 'whatsapp',
    phone: PHONE_CLIENTE,
    messages: ['quanto custa manutenção unha gel?'],
    checks: [
      (r) => ({
        pass: r[0].includes('R$') || r[0].includes('149') || r[0].includes('189') || r[0].includes('140') || r[0].includes('95'),
        reason: 'Deve mostrar preço com R$',
      }),
    ],
  },
  {
    name: 'Cliente: Agendar sem profissional — deve mostrar nomes',
    role: 'client',
    channel: 'whatsapp',
    phone: PHONE_CLIENTE,
    messages: ['quero fazer unha gel sexta às 14h'],
    checks: [
      (r) => ({
        pass: r[0].toUpperCase().includes('LARISSA') || r[0].toUpperCase().includes('CLAU'),
        reason: 'Deve mostrar nomes das profissionais de gel (Larissa e Clau)',
      }),
    ],
  },
  {
    name: 'Cliente: Assunto fora do salão',
    role: 'client',
    channel: 'whatsapp',
    phone: PHONE_CLIENTE,
    messages: ['qual a previsão do tempo?'],
    checks: [
      (r) => ({
        pass: r[0].toLowerCase().includes('suav') || r[0].toLowerCase().includes('salão') || r[0].toLowerCase().includes('ajud'),
        reason: 'Deve redirecionar para assuntos do salão',
      }),
    ],
  },
  {
    name: 'Cliente: Horário de funcionamento',
    role: 'client',
    channel: 'whatsapp',
    phone: PHONE_CLIENTE,
    messages: ['que horas vocês abrem?'],
    checks: [
      (r) => ({
        pass: r[0].includes('9') || r[0].toLowerCase().includes('horário') || r[0].toLowerCase().includes('abr'),
        reason: 'Deve informar horário de funcionamento',
      }),
    ],
  },
  {
    name: 'Cliente: Formas de pagamento',
    role: 'client',
    channel: 'whatsapp',
    phone: PHONE_CLIENTE,
    messages: ['quais formas de pagamento?'],
    checks: [
      (r) => ({
        pass: r[0].toLowerCase().includes('pix') || r[0].toLowerCase().includes('cartão') || r[0].toLowerCase().includes('cartao'),
        reason: 'Deve mencionar PIX e/ou cartão',
      }),
    ],
  },
  {
    name: 'Cliente: Idioma português obrigatório',
    role: 'client',
    channel: 'whatsapp',
    phone: PHONE_CLIENTE,
    messages: ['hello, do you speak english?'],
    checks: [
      (r) => ({
        pass: !r[0].match(/^[A-Za-z\s,.'!?]+$/) || r[0].toLowerCase().includes('português'),
        reason: 'Deve responder em português brasileiro',
      }),
    ],
  },
  // === ADMIN ===
  {
    name: 'Admin: Agenda do dia',
    role: 'admin',
    channel: 'whatsapp',
    phone: PHONE_ADMIN,
    messages: ['agendamentos de hoje'],
    checks: [
      (r) => ({
        pass: r[0].includes('agenda') || r[0].includes('agendamento') || r[0].includes('hoje') || r[0].includes('nenhum'),
        reason: 'Deve mostrar agenda ou informar que não tem agendamentos',
      }),
    ],
  },
  {
    name: 'Admin: Faturamento',
    role: 'admin',
    channel: 'whatsapp',
    phone: PHONE_ADMIN,
    messages: ['qual o faturamento desse mês?'],
    checks: [
      (r) => ({
        pass: r[0].includes('R$') || r[0].toLowerCase().includes('faturamento') || r[0].includes('0'),
        reason: 'Deve mostrar faturamento com R$',
      }),
    ],
  },
  {
    name: 'Admin: Listar profissionais',
    role: 'admin',
    channel: 'whatsapp',
    phone: PHONE_ADMIN,
    messages: ['lista todas as profissionais'],
    checks: [
      (r) => ({
        pass: r[0].toUpperCase().includes('LUCIANA') || r[0].toUpperCase().includes('LARISSA'),
        reason: 'Deve listar profissionais pelo nome',
      }),
    ],
  },
  // === CLIENTE: MULTI-TURN ===
  {
    name: 'Cliente: Fluxo completo de agendamento (multi-turn)',
    role: 'client',
    channel: 'whatsapp',
    phone: PHONE_CLIENTE,
    messages: [
      'oi, quero agendar unha gel',
      'com a Larissa',
      'sexta às 14h',
    ],
    checks: [
      (r) => ({
        pass: r[0].toUpperCase().includes('LARISSA') || r[0].toUpperCase().includes('CLAU'),
        reason: 'Msg 1: Deve perguntar profissional COM nomes',
      }),
      (r) => ({
        pass: r[2].toLowerCase().includes('confirmo') || r[2].toLowerCase().includes('confirma') || r[2].toLowerCase().includes('r$') || r[2].toLowerCase().includes('agendar'),
        reason: 'Msg 3: Deve pedir confirmação com preço',
      }),
    ],
  },
  {
    name: 'Cliente: Domingo deve recusar',
    role: 'client',
    channel: 'whatsapp',
    phone: PHONE_CLIENTE,
    messages: ['quero agendar corte pra domingo'],
    checks: [
      (r) => ({
        pass: r[0].toLowerCase().includes('domingo') || r[0].toLowerCase().includes('fechado') || r[0].toLowerCase().includes('segunda') || r[0].toLowerCase().includes('não funciona') || r[0].toLowerCase().includes('abr'),
        reason: 'Deve informar que não abre no domingo',
      }),
    ],
  },
  {
    name: 'Cliente: Endereço do salão',
    role: 'client',
    channel: 'whatsapp',
    phone: PHONE_CLIENTE,
    messages: ['qual o endereço de vocês?'],
    checks: [
      (r) => ({
        pass: r[0].toLowerCase().includes('goiânia') || r[0].toLowerCase().includes('itapoã') || r[0].toLowerCase().includes('vila velha'),
        reason: 'Deve informar o endereço correto',
      }),
    ],
  },
  {
    name: 'Cliente: Estacionamento',
    role: 'client',
    channel: 'whatsapp',
    phone: PHONE_CLIENTE,
    messages: ['vocês tem estacionamento?'],
    checks: [
      (r) => ({
        pass: r[0].toLowerCase().includes('estacionamento') || r[0].toLowerCase().includes('sim') || r[0].toLowerCase().includes('tem'),
        reason: 'Deve confirmar que tem estacionamento',
      }),
    ],
  },
  {
    name: 'Cliente: Apelido genérico proibido',
    role: 'client',
    channel: 'whatsapp',
    phone: PHONE_CLIENTE,
    messages: ['oi, tudo bem?'],
    checks: [
      (r) => ({
        pass: !r[0].toLowerCase().includes('querida') && !r[0].toLowerCase().includes('linda') && !r[0].toLowerCase().includes(' flor') && !r[0].toLowerCase().includes('amor') && !r[0].toLowerCase().includes('mana'),
        reason: 'NÃO deve usar apelidos genéricos (querida, linda, flor, amor, mana)',
      }),
    ],
  },
  // === ADMIN: MAIS CENÁRIOS ===
  {
    name: 'Admin: Buscar cliente',
    role: 'admin',
    channel: 'whatsapp',
    phone: PHONE_ADMIN,
    messages: ['busca cliente 5527999990000'],
    checks: [
      (r) => ({
        pass: r[0].includes('999990000') || r[0].toLowerCase().includes('encontr') || r[0].toLowerCase().includes('cliente'),
        reason: 'Deve buscar e mostrar dados do cliente',
      }),
    ],
  },
  // === PROFISSIONAL ===
  {
    name: 'Profissional: Minha agenda',
    role: 'professional',
    channel: 'whatsapp',
    phone: '5527992589125',
    messages: ['minha agenda de hoje'],
    checks: [
      (r) => ({
        pass: r[0].toLowerCase().includes('agenda') || r[0].toLowerCase().includes('livre') || r[0].toLowerCase().includes('atendimento') || r[0].toLowerCase().includes('larissa'),
        reason: 'Deve mostrar agenda ou informar que está livre',
      }),
    ],
  },
  {
    name: 'Profissional: Pedir faturamento (deve negar)',
    role: 'professional',
    channel: 'whatsapp',
    phone: '5527992589125',
    messages: ['qual o faturamento do salão?'],
    checks: [
      (r) => ({
        pass: r[0].toLowerCase().includes('gerente') || r[0].toLowerCase().includes('acesso') || r[0].toLowerCase().includes('informação'),
        reason: 'Deve negar e direcionar para gerente',
      }),
    ],
  },
];

async function runScenario(scenario: TestScenario): Promise<{ passed: number; failed: number; details: string[] }> {
  const convId = `test_${scenario.name.replace(/\s+/g, '_')}`;
  await clearHistory(convId);

  const responses: string[] = [];
  const details: string[] = [];
  let passed = 0;
  let failed = 0;

  for (const msg of scenario.messages) {
    const history = await getHistory(convId);
    await addMessage(convId, 'user', msg);

    try {
      const response = await processMessage({
        userMessage: msg,
        conversationHistory: history,
        role: scenario.role,
        clientPhone: scenario.phone,
        channel: scenario.channel,
        adminName: scenario.role === 'admin' ? 'Dona' : undefined,
        professionalId: scenario.role === 'professional' ? 9 : undefined,
        professionalName: scenario.role === 'professional' ? 'LARISSA' : undefined,
      });

      responses.push(response);
      await addMessage(convId, 'assistant', response);
    } catch (error: any) {
      responses.push(`ERRO: ${error.message}`);
      details.push(`  ❌ ERRO ao processar: ${error.message}`);
      failed++;
    }
  }

  // Rodar checks
  for (const check of scenario.checks) {
    const result = check(responses);
    if (result.pass) {
      passed++;
      details.push(`  ✅ ${result.reason}`);
    } else {
      failed++;
      details.push(`  ❌ ${result.reason}`);
      details.push(`     Resposta: "${responses[0]?.substring(0, 150)}..."`);
    }
  }

  return { passed, failed, details };
}

async function main() {
  console.log('\n\x1b[32m╔══════════════════════════════════════════════════════╗');
  console.log('║       SUAV Bot — Teste Automatizado                  ║');
  console.log(`║       ${scenarios.length} cenários a testar                          ║`);
  console.log('╚══════════════════════════════════════════════════════╝\x1b[0m\n');

  let totalPassed = 0;
  let totalFailed = 0;
  let scenariosPassed = 0;
  let scenariosFailed = 0;

  for (let i = 0; i < scenarios.length; i++) {
    const scenario = scenarios[i];
    process.stdout.write(`\x1b[90m[${i + 1}/${scenarios.length}]\x1b[0m ${scenario.name}... `);

    try {
      const result = await runScenario(scenario);
      totalPassed += result.passed;
      totalFailed += result.failed;

      if (result.failed === 0) {
        console.log('\x1b[32m✅ PASSOU\x1b[0m');
        scenariosPassed++;
      } else {
        console.log('\x1b[31m❌ FALHOU\x1b[0m');
        scenariosFailed++;
        for (const d of result.details) {
          console.log(d);
        }
      }
    } catch (error: any) {
      console.log(`\x1b[31m💥 ERRO: ${error.message}\x1b[0m`);
      scenariosFailed++;
      totalFailed++;
    }

    // Delay entre cenarios (rate limit do Gemini)
    if (i < scenarios.length - 1) {
      await new Promise(r => setTimeout(r, 3000));
    }
  }

  console.log('\n\x1b[32m══════════════════════════════════════════════════════\x1b[0m');
  console.log(`\x1b[32m RESULTADO: ${scenariosPassed}/${scenarios.length} cenários passaram\x1b[0m`);
  console.log(`\x1b[32m Checks: ${totalPassed} ✅ | ${totalFailed} ❌\x1b[0m`);
  console.log('\x1b[32m══════════════════════════════════════════════════════\x1b[0m\n');

  process.exit(totalFailed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Erro fatal:', err);
  process.exit(1);
});
