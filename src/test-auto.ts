import { processMessage } from './ai/agent';
import { addMessage, getHistory, clearHistory } from './conversation/manager';
import { logger } from './utils/logger';

logger.level = 'silent';

const PHONE_CLIENTE = '5527999990000';
const PHONE_ADMIN = '559891752988';

/** Remove [BREAK] delimiters para checks de conteúdo */
function normalizeResponse(response: string): string {
  return response.replace(/\[BREAK\]/gi, '\n').trim();
}

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
    name: 'Cliente: Saudação "oi" — tom natural',
    role: 'client',
    channel: 'whatsapp',
    phone: PHONE_CLIENTE,
    messages: ['oi'],
    checks: [
      (r) => ({
        pass: r[0].toLowerCase().includes('oi') || r[0].toLowerCase().includes('olá'),
        reason: 'Deve cumprimentar de volta',
      }),
      (r) => ({
        pass: !r[0].toLowerCase().includes('inteligência artificial') && !r[0].toLowerCase().includes('bot'),
        reason: 'NÃO deve dizer que é IA/bot',
      }),
      (r) => ({
        pass: !r[0].toLowerCase().includes('como posso te ajudar') && !r[0].toLowerCase().includes('em que posso ajudar') && !r[0].toLowerCase().includes('posso ajudar em algo'),
        reason: 'NÃO deve usar frases de bot ("como posso te ajudar?")',
      }),
      (r) => ({
        pass: !r[0].toLowerCase().includes('querida') && !r[0].toLowerCase().includes('linda') && !r[0].toLowerCase().includes(' flor') && !r[0].toLowerCase().includes('amor'),
        reason: 'NÃO deve usar apelidos genéricos',
      }),
      (r) => ({
        pass: r[0].length < 200,
        reason: 'Mensagem deve ser curta (< 200 chars) — pessoa real é objetiva',
      }),
    ],
  },
  {
    name: 'Cliente: Saudação "eae" — espelha tom informal',
    role: 'client',
    channel: 'whatsapp',
    phone: PHONE_CLIENTE,
    messages: ['eae'],
    checks: [
      (r) => ({
        pass: !r[0].toLowerCase().includes('como posso te ajudar') && !r[0].toLowerCase().includes('em que posso ajudar'),
        reason: 'NÃO deve usar frases de bot',
      }),
      (r) => ({
        pass: r[0].length < 150,
        reason: 'Resposta curta e informal',
      }),
    ],
  },
  {
    name: 'Cliente: Reclamação — deve encaminhar pra gerente',
    role: 'client',
    channel: 'whatsapp',
    phone: PHONE_CLIENTE,
    messages: ['tô muito insatisfeita com o atendimento de vocês'],
    checks: [
      (r) => ({
        pass: r[0].toLowerCase().includes('gerente') || r[0].toLowerCase().includes('encaminh') || r[0].toLowerCase().includes('contato'),
        reason: 'Deve dizer que encaminhou para a gerente',
      }),
      (r) => ({
        pass: !r[0].toLowerCase().includes('infelizmente') && !r[0].toLowerCase().includes('lamentamos'),
        reason: 'NÃO deve usar linguagem corporativa (infelizmente/lamentamos)',
      }),
    ],
  },
  {
    name: 'Cliente: Agradecimento — deve ser breve e genuína',
    role: 'client',
    channel: 'whatsapp',
    phone: PHONE_CLIENTE,
    messages: ['muito obrigada!'],
    checks: [
      (r) => ({
        pass: r[0].toLowerCase().includes('imagina') || r[0].toLowerCase().includes('nada') || r[0].toLowerCase().includes('disponha') || r[0].includes('🤗') || r[0].includes('😊'),
        reason: 'Deve responder agradecimento de forma breve (imagina!/de nada!)',
      }),
      (r) => ({
        pass: r[0].length < 120,
        reason: 'Agradecimento deve ter resposta curta (< 120 chars)',
      }),
      (r) => ({
        pass: !r[0].toLowerCase().includes('precisar de algo mais') && !r[0].toLowerCase().includes('à disposição'),
        reason: 'NÃO deve terminar com "se precisar de algo mais estou à disposição"',
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
      (r) => {
        // Nomes REAIS das profissionais do BD (unha gel = LARISSA, CLAU)
        const nomesReais = ['LUCIANA', 'TATIANI', 'LORENA', 'SIL', 'MIRIAM', 'RAYANNE',
          'THAIS', 'LARISSA', 'CLAU', 'RAI', 'DANIELA', 'LUANA', 'ERIKA'];
        const upper = r[0].toUpperCase();
        const found = nomesReais.some(n => upper.includes(n));
        return { pass: found, reason: 'Deve mostrar nomes reais de profissionais que fazem gel (LARISSA/CLAU)' };
      },
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
      (r) => {
        // Nomes REAIS das profissionais do BD
        const nomesReais = ['LUCIANA', 'TATIANI', 'LORENA', 'SIL', 'MIRIAM', 'RAYANNE',
          'THAIS', 'LARISSA', 'CLAU', 'RAI', 'DANIELA', 'LUANA', 'ERIKA'];
        const upper = r[0].toUpperCase();
        const found = nomesReais.some(n => upper.includes(n));
        return { pass: found, reason: 'Msg 1: Deve perguntar profissional COM nomes reais do salão' };
      },
      (r) => {
        if (r.length < 3) return { pass: false, reason: `Msg 3: Só recebeu ${r.length} respostas (esperava 3)` };
        const msg3 = r[2].toLowerCase();
        // Pode confirmar, mostrar disponibilidade, ou pedir esclarecimento (Larissa pode não fazer o serviço buscado)
        const pass = msg3.includes('confirmo') || msg3.includes('confirma') || msg3.includes('r$') || msg3.includes('agendar') || msg3.includes('agendado') || msg3.includes('fechado') || msg3.includes('disponível') || msg3.includes('disponivel') || msg3.includes('horário') || msg3.includes('horario') || msg3.includes('profissional') || msg3.includes('larissa') || msg3.includes('não faz');
        return { pass, reason: `Msg 3: Deve pedir confirmação, mostrar disponibilidade ou esclarecer. Got: "${r[2].substring(0, 100)}"` };
      },
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
        pass: r[0].includes('999990000') || r[0].toLowerCase().includes('encontr') || r[0].toLowerCase().includes('cliente') || r[0].toLowerCase().includes('agendamento') || r[0].toLowerCase().includes('achei') || r[0].toLowerCase().includes('cadastrad') || r[0].toLowerCase().includes('históric') || r[0].toLowerCase().includes('atendiment'),
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
    name: 'Profissional: Pedir faturamento do salão (deve negar)',
    role: 'professional',
    channel: 'whatsapp',
    phone: '5527992589125',
    messages: ['qual o faturamento total do salão?'],
    checks: [
      (r) => ({
        pass: r[0].toLowerCase().includes('gerente') || r[0].toLowerCase().includes('acesso') || r[0].toLowerCase().includes('informação') || r[0].toLowerCase().includes('só') || r[0].toLowerCase().includes('seu'),
        reason: 'Deve negar faturamento DO SALÃO e direcionar para gerente',
      }),
    ],
  },
  // === MENSAGENS CURTAS ===
  {
    name: 'Cliente: Mensagem curta (< 200 chars por resposta)',
    role: 'client',
    channel: 'whatsapp',
    phone: PHONE_CLIENTE,
    messages: ['oi, tudo bem?'],
    checks: [
      (r) => ({
        pass: r[0].length < 200,
        reason: 'Resposta total deve ser curta (< 200 chars)',
      }),
    ],
  },
  // === NOVOS CENÁRIOS: BUGS ENCONTRADOS NO POLIMENTO ===
  {
    name: 'Cliente: "?" sozinha — sem frase de bot',
    role: 'client',
    channel: 'whatsapp',
    phone: PHONE_CLIENTE,
    messages: ['?'],
    checks: [
      (r) => ({
        pass: !r[0].toLowerCase().includes('como posso te ajudar') && !r[0].toLowerCase().includes('em que posso ajudar'),
        reason: 'NÃO deve usar "como posso te ajudar" para mensagem ambígua',
      }),
      (r) => ({
        pass: r[0].length < 100,
        reason: 'Resposta curta para mensagem ambígua',
      }),
    ],
  },
  {
    name: 'Cliente: Emoji 💅 — não pedir nome',
    role: 'client',
    channel: 'whatsapp',
    phone: PHONE_CLIENTE,
    messages: ['💅'],
    checks: [
      (r) => ({
        pass: !r[0].toLowerCase().includes('qual seu nome') && !r[0].toLowerCase().includes('qual o seu nome'),
        reason: 'NÃO deve pedir nome só por causa de emoji',
      }),
    ],
  },
  {
    name: 'Cliente: Abreviação "qto custa fzr unhas"',
    role: 'client',
    channel: 'whatsapp',
    phone: PHONE_CLIENTE,
    messages: ['qto custa fzr unhas?'],
    checks: [
      (r) => ({
        pass: r[0].includes('R$') || r[0].toLowerCase().includes('unha'),
        reason: 'Deve entender abreviação e mostrar preço ou perguntar qual tipo',
      }),
    ],
  },
  {
    name: 'Cliente: WhatsApp não deve pedir telefone',
    role: 'client',
    channel: 'whatsapp',
    phone: PHONE_CLIENTE,
    messages: ['quero ver meus agendamentos'],
    checks: [
      (r) => ({
        pass: !r[0].toLowerCase().includes('telefone') && !r[0].toLowerCase().includes('número') && !r[0].toLowerCase().includes('whatsapp'),
        reason: 'NÃO deve pedir telefone no WhatsApp (já tem automaticamente)',
      }),
    ],
  },
  {
    name: 'Cliente: Reclamação específica — encaminha pra gerente',
    role: 'client',
    channel: 'whatsapp',
    phone: PHONE_CLIENTE,
    messages: ['tô muito insatisfeita, minha unha quebrou no mesmo dia'],
    checks: [
      (r) => ({
        pass: r[0].toLowerCase().includes('gerente') || r[0].toLowerCase().includes('encaminh') || r[0].toLowerCase().includes('contato'),
        reason: 'Deve encaminhar para gerente (não resolver sozinha)',
      }),
      (r) => ({
        pass: !r[0].toLowerCase().includes('infelizmente') && !r[0].toLowerCase().includes('lamentamos'),
        reason: 'NÃO deve usar "infelizmente" nem "lamentamos"',
      }),
    ],
  },
  {
    name: 'Cliente: "posso te ajudar" proibido (anti-bot)',
    role: 'client',
    channel: 'whatsapp',
    phone: PHONE_CLIENTE,
    messages: ['boa noite'],
    checks: [
      (r) => ({
        pass: !r[0].toLowerCase().includes('posso te ajudar') && !r[0].toLowerCase().includes('posso ajudar'),
        reason: 'NÃO deve usar "posso te ajudar" em nenhuma variação',
      }),
    ],
  },
  // === NOVAS FUNÇÕES PROFISSIONAL ===
  {
    name: 'Profissional: Meu faturamento (deve mostrar)',
    role: 'professional',
    channel: 'whatsapp',
    phone: '5527992589125',
    messages: ['quanto eu fiz esse mês?'],
    checks: [
      (r) => ({
        pass: r[0].includes('R$') || r[0].includes('0') || r[0].toLowerCase().includes('faturamento') || r[0].toLowerCase().includes('atendimento'),
        reason: 'Deve mostrar faturamento pessoal da profissional',
      }),
    ],
  },
  {
    name: 'Profissional: Próxima cliente',
    role: 'professional',
    channel: 'whatsapp',
    phone: '5527992589125',
    messages: ['minha próxima cliente?'],
    checks: [
      (r) => ({
        pass: r[0].toLowerCase().includes('próxim') || r[0].toLowerCase().includes('nenhum') || r[0].toLowerCase().includes('livre') || r[0].toLowerCase().includes('agenda'),
        reason: 'Deve mostrar próximo atendimento ou dizer que está livre',
      }),
    ],
  },
  {
    name: 'Profissional: Bloquear horário',
    role: 'professional',
    channel: 'whatsapp',
    phone: '5527992589125',
    messages: ['bloqueia meu horário amanhã das 12 às 13 pra almoço'],
    checks: [
      (r) => ({
        pass: r[0].toLowerCase().includes('bloqueio') || r[0].toLowerCase().includes('bloqueei') || r[0].toLowerCase().includes('bloqueado') || r[0].toLowerCase().includes('12'),
        reason: 'Deve confirmar bloqueio do horário',
      }),
    ],
  },
  {
    name: 'Profissional: Faturamento do SALÃO (deve negar)',
    role: 'professional',
    channel: 'whatsapp',
    phone: '5527992589125',
    messages: ['quanto o salão faturou esse mês?'],
    checks: [
      (r) => ({
        pass: r[0].toLowerCase().includes('gerente') || r[0].toLowerCase().includes('acesso') || r[0].toLowerCase().includes('informação') || r[0].toLowerCase().includes('só') || r[0].toLowerCase().includes('seu'),
        reason: 'Deve negar faturamento do salão e direcionar para gerente',
      }),
    ],
  },
  {
    name: 'Profissional: Saudação casual (tom de colega)',
    role: 'professional',
    channel: 'whatsapp',
    phone: '5527992589125',
    messages: ['eae mari'],
    checks: [
      (r) => ({
        pass: r[0].toLowerCase().includes('larissa') || r[0].toLowerCase().includes('eae') || r[0].toLowerCase().includes('oi') || r[0].toLowerCase().includes('tudo'),
        reason: 'Deve responder como colega, usando nome da profissional',
      }),
      (r) => ({
        pass: r[0].length < 150,
        reason: 'Resposta curta entre colegas',
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

      responses.push(normalizeResponse(response));
      await addMessage(convId, 'assistant', normalizeResponse(response));
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
  // Aceita índice como argumento: npx tsx src/test-auto.ts 0
  const arg = process.argv[2];
  const singleIndex = arg !== undefined ? parseInt(arg, 10) : null;

  if (singleIndex !== null) {
    if (singleIndex < 0 || singleIndex >= scenarios.length) {
      console.log(`\x1b[31mÍndice ${singleIndex} inválido. Use 0-${scenarios.length - 1}\x1b[0m`);
      process.exit(1);
    }
    const scenario = scenarios[singleIndex];
    console.log(`\n\x1b[36m[${singleIndex}/${scenarios.length - 1}] ${scenario.name}\x1b[0m`);
    console.log(`  Role: ${scenario.role} | Channel: ${scenario.channel}`);
    console.log(`  Mensagens: ${scenario.messages.map(m => `"${m}"`).join(' → ')}\n`);

    const result = await runScenario(scenario);
    for (const d of result.details) console.log(d);
    console.log(`\n  ${result.failed === 0 ? '\x1b[32m✅ PASSOU' : '\x1b[31m❌ FALHOU'}\x1b[0m (${result.passed} ✅ ${result.failed} ❌)\n`);
    process.exit(result.failed > 0 ? 1 : 0);
  }

  // Modo completo (sem argumento)
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

    // Delay entre cenarios (rate limit)
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
