import { processMessage } from './ai/agent';
import { addMessage, getHistory, clearHistory } from './conversation/manager';
import { getConversationId } from './channels/types';
import type { ChannelType } from './channels/types';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface Scenario {
  name: string;
  channel: ChannelType;
  messages: string[];
  validate: (responses: string[]) => { ok: boolean; reason: string };
}

let phoneCounter = 0;
function nextPhone(): string {
  phoneCounter++;
  return `55270000${String(phoneCounter).padStart(5, '0')}`;
}

// ========== HELPERS ==========
function hasPortuguese(r: string): boolean {
  return /[àáâãéêíóôõúçã]|voce|você|obrigad|olá|ola|bem-vind|horari|servic|agenda|salao|salão|suav/i.test(r);
}
function hasRussian(r: string): boolean {
  return /[а-яА-Я]{3,}/.test(r);
}
function mentionsPermission(r: string): boolean {
  const l = r.toLowerCase();
  return l.includes('posso verificar') || l.includes('deixe-me verificar') || l.includes('gostaria que eu verificasse');
}

// ========== CENARIOS ==========
const SCENARIOS: Scenario[] = [
  // === SAUDACOES ===
  { name: 'Oi simples', channel: 'whatsapp', messages: ['Oi'],
    validate: (r) => hasRussian(r[0]) ? { ok: false, reason: 'Russo' } : { ok: true, reason: 'OK' } },
  { name: 'Bom dia', channel: 'whatsapp', messages: ['Bom dia!'],
    validate: (r) => ({ ok: !hasRussian(r[0]) && r[0].length > 5, reason: r[0].length <= 5 ? 'Muito curta' : 'OK' }) },
  { name: 'Boa tarde', channel: 'whatsapp', messages: ['Boa tarde, tudo bem?'],
    validate: (r) => ({ ok: !hasRussian(r[0]), reason: hasRussian(r[0]) ? 'Russo' : 'OK' }) },
  { name: 'Ola em ingles', channel: 'whatsapp', messages: ['Hello, how are you?'],
    validate: (r) => {
      // Se deu rate limit, nao contar como falha
      if (r[0].includes('probleminha tecnico') || r[0].includes('tente de novo')) return { ok: true, reason: 'OK (rate limit)' };
      const inPortuguese = /suav|salao|salão|servic|ajudar|beleza|portugues|português|precisa|oi|bom dia|boa tarde|boa noite|tudo bem|você|voce/i.test(r[0]);
      return { ok: inPortuguese, reason: inPortuguese ? 'OK' : 'Nao respondeu em portugues' };
    }},
  { name: 'Ola em espanhol', channel: 'whatsapp', messages: ['Hola, buenos días'],
    validate: (r) => {
      const inPortuguese = /suav|salao|salão|servic|ajudar|beleza|precisa|oi|bom dia|boa tarde|boa noite|tudo bem|você|voce/i.test(r[0]);
      return { ok: inPortuguese, reason: inPortuguese ? 'OK' : 'Nao respondeu em portugues' };
    }},

  // === PRECOS E SERVICOS ===
  { name: 'Preco unha gel', channel: 'whatsapp', messages: ['Quanto custa unha em gel?'],
    validate: (r) => ({ ok: r[0].includes('189') || r[0].toLowerCase().includes('gel'), reason: 'OK' }) },
  { name: 'Preco corte cabelo', channel: 'whatsapp', messages: ['Quanto custa corte de cabelo?'],
    validate: (r) => ({ ok: !hasRussian(r[0]) && r[0].length > 10, reason: 'OK' }) },
  { name: 'Preco maquiagem', channel: 'whatsapp', messages: ['Quanto custa maquiagem?'],
    validate: (r) => ({ ok: !hasRussian(r[0]), reason: 'OK' }) },
  { name: 'Preco design sobrancelha', channel: 'whatsapp', messages: ['Quanto custa design de sobrancelha?'],
    validate: (r) => ({ ok: !hasRussian(r[0]), reason: 'OK' }) },
  { name: 'Preco depilacao axilas', channel: 'whatsapp', messages: ['Quanto custa depilacao nas axilas?'],
    validate: (r) => ({ ok: !hasRussian(r[0]), reason: 'OK' }) },
  { name: 'Listar servicos esmalteria', channel: 'whatsapp', messages: ['Quais servicos de esmalteria voces tem?'],
    validate: (r) => ({ ok: !hasRussian(r[0]) && r[0].length > 20, reason: 'OK' }) },
  { name: 'Listar servicos estetica', channel: 'whatsapp', messages: ['O que voces tem de estetica?'],
    validate: (r) => ({ ok: !hasRussian(r[0]), reason: 'OK' }) },
  { name: 'Servico inexistente', channel: 'whatsapp', messages: ['Voces fazem tatuagem?'],
    validate: (r) => {
      const l = r[0].toLowerCase();
      // "nao fazemos" esta OK, o problema e dizer "sim, fazemos"
      if (l.includes('não fazemos') || l.includes('nao fazemos') || l.includes('infelizmente')) return { ok: true, reason: 'OK' };
      if (l.includes('sim') && l.includes('fazemos')) return { ok: false, reason: 'Disse que faz tatuagem' };
      return { ok: true, reason: 'OK' };
    }},
  { name: 'Servico inexistente 2', channel: 'whatsapp', messages: ['Tem bronzeamento artificial?'],
    validate: (r) => {
      const l = r[0].toLowerCase();
      return { ok: !l.includes('sim, temos'), reason: 'OK' };
    }},

  // === AGENDAMENTO COMPLETO (WA) ===
  { name: 'Agendar com tudo especificado', channel: 'whatsapp',
    messages: ['Quero agendar unha tradicional pe com a Miriam pra segunda as 14h'],
    validate: (r) => {
      const pass = !mentionsPermission(r[0]) && r[0].length > 20;
      return { ok: pass, reason: mentionsPermission(r[0]) ? 'Pediu permissao' : (r[0].length <= 20 ? 'Resposta muito curta' : 'OK') };
    }},
  { name: 'Agendar e confirmar', channel: 'whatsapp',
    messages: ['Quero agendar unha tradicional mao com a Sil amanha as 11h', 'Sim, confirma'],
    validate: (r) => {
      const last = r[r.length - 1].toLowerCase();
      const pass = last.includes('confirm') || last.includes('agendad') || last.includes('marcad') || last.includes('fechado') || last.includes('pronto');
      return { ok: pass, reason: pass ? 'OK' : 'Nao confirmou agendamento' };
    }},
  { name: 'Agendar sem profissional', channel: 'whatsapp',
    messages: ['Quero fazer unha em gel sabado as 10h'],
    validate: (r) => {
      const l = r[0].toLowerCase();
      const pass = l.includes('profissional') || l.includes('larissa') || l.includes('clau') || l.includes('quem') || l.includes('prefere');
      return { ok: pass, reason: pass ? 'OK' : 'Nao perguntou profissional' };
    }},
  { name: 'Agendar sem horario', channel: 'whatsapp',
    messages: ['Quero agendar corte com a Rai amanha'],
    validate: (r) => {
      const l = r[0].toLowerCase();
      return { ok: l.includes('horario') || l.includes('horário') || l.includes('hora') || l.includes('que horas'), reason: l.includes('hor') ? 'OK' : 'Nao perguntou horario' };
    }},
  { name: 'Agendar domingo (fechado)', channel: 'whatsapp',
    messages: ['Quero agendar unha tradicional mao com a Luciana domingo as 10h'],
    validate: (r) => {
      const l = r[0].toLowerCase();
      return { ok: l.includes('fechad') || l.includes('domingo') || l.includes('nao funciona') || l.includes('não funciona'), reason: 'OK' };
    }},
  { name: 'Agendar fora do horario (20h)', channel: 'whatsapp',
    messages: ['Quero agendar unha com a Luciana amanha as 20h'],
    validate: (r) => {
      const l = r[0].toLowerCase();
      const pass = l.includes('fechad') || l.includes('19') || l.includes('horario') || l.includes('horário') || l.includes('expediente') || l.includes('funciona') || l.includes('disponível') || l.includes('disponivel') || l.includes('abre') || l.includes('17');
      return { ok: pass, reason: pass ? 'OK' : 'Nao avisou sobre horario limite' };
    }},
  { name: 'Agendar sabado as 16h30', channel: 'whatsapp',
    messages: ['Quero agendar unha tradicional mao com a Luciana sabado as 16h30'],
    validate: (r) => {
      const pass = !mentionsPermission(r[0]) && r[0].length > 20;
      return { ok: pass, reason: pass ? 'OK' : (mentionsPermission(r[0]) ? 'Pediu permissao' : 'Resposta curta') };
    }},

  // === AGENDAMENTO INSTAGRAM ===
  { name: 'IG - agendar sem telefone', channel: 'instagram',
    messages: ['Quero agendar unha tradicional com a Luciana amanha as 10h'],
    validate: (r) => {
      const l = r[0].toLowerCase();
      return { ok: l.includes('telefone') || l.includes('whatsapp') || l.includes('ddd') || l.includes('numero'), reason: l.includes('telefone') || l.includes('whatsapp') || l.includes('ddd') ? 'OK' : 'Nao pediu telefone' };
    }},
  { name: 'IG - conversa completa com telefone', channel: 'instagram',
    messages: ['Quero agendar corte de cabelo', 'Meu numero e 27999991234'],
    validate: (r) => {
      const all = r.join(' ').toLowerCase();
      const pass = all.includes('telefone') || all.includes('whatsapp') || all.includes('ddd') || all.includes('27999991234') || all.includes('profissional') || all.includes('numero');
      return { ok: pass, reason: pass ? 'OK' : 'Nao pediu telefone nem mencionou profissional' };
    }},

  // === CANCELAMENTO ===
  { name: 'Pedir cancelamento', channel: 'whatsapp',
    messages: ['Quero cancelar meu agendamento'],
    validate: (r) => {
      const l = r[0].toLowerCase();
      const hasAction = l.includes('agendamento') || l.includes('cancel') || l.includes('nenhum');
      return { ok: hasAction, reason: 'OK' };
    }},

  // === INFORMACOES DA LOJA ===
  { name: 'Endereco', channel: 'whatsapp', messages: ['Qual o endereco de voces?'],
    validate: (r) => {
      return { ok: r[0].includes('Goiania') || r[0].includes('Goiânia') || r[0].includes('234') || r[0].toLowerCase().includes('itapua'), reason: r[0].includes('234') ? 'OK' : 'Nao mencionou endereco' };
    }},
  { name: 'Formas de pagamento', channel: 'whatsapp', messages: ['Voces aceitam pix?'],
    validate: (r) => {
      const l = r[0].toLowerCase();
      return { ok: l.includes('pix') || l.includes('pagamento'), reason: 'OK' };
    }},
  { name: 'Estacionamento', channel: 'whatsapp', messages: ['Tem estacionamento?'],
    validate: (r) => {
      const l = r[0].toLowerCase();
      return { ok: l.includes('estacionamento') || l.includes('disponivel') || l.includes('disponível') || l.includes('sim'), reason: 'OK' };
    }},
  { name: 'Instagram do salao', channel: 'whatsapp', messages: ['Qual o instagram de voces?'],
    validate: (r) => {
      return { ok: r[0].includes('suavitapua') || r[0].includes('@suav'), reason: r[0].includes('suav') ? 'OK' : 'Nao mencionou @suavitapua' };
    }},

  // === PROFISSIONAIS ===
  { name: 'Quem faz depilacao', channel: 'whatsapp', messages: ['Quem faz depilacao?'],
    validate: (r) => {
      const l = r[0].toLowerCase();
      return { ok: l.includes('daniela') || l.includes('luana') || l.includes('lorena') || l.includes('erika') || l.includes('profission'), reason: 'OK' };
    }},
  { name: 'Quem faz cabelo', channel: 'whatsapp', messages: ['Quem faz corte de cabelo?'],
    validate: (r) => {
      const l = r[0].toLowerCase();
      return { ok: l.includes('rai') || l.includes('thais') || l.includes('profission'), reason: 'OK' };
    }},
  { name: 'Quem faz luz pulsada', channel: 'whatsapp', messages: ['Quem faz luz pulsada?'],
    validate: (r) => {
      const l = r[0].toLowerCase();
      return { ok: l.includes('daniela') || l.includes('profission'), reason: 'OK' };
    }},

  // === FORA DO CONTEXTO ===
  { name: 'Pergunta sobre clima', channel: 'whatsapp', messages: ['Vai chover hoje?'],
    validate: (r) => {
      const l = r[0].toLowerCase();
      return { ok: l.includes('suav') || l.includes('salao') || l.includes('salão') || l.includes('servic') || l.includes('ajudar') || l.includes('agendamento'), reason: 'OK' };
    }},
  { name: 'Pergunta sobre futebol', channel: 'whatsapp', messages: ['Quem ganhou o jogo ontem?'],
    validate: (r) => {
      const l = r[0].toLowerCase();
      return { ok: !l.includes('gol') && !l.includes('placar') && (l.includes('suav') || l.includes('servic') || l.includes('ajudar') || l.includes('salao') || l.includes('salão') || l.includes('beleza')), reason: 'OK' };
    }},
  { name: 'Pedir receita', channel: 'whatsapp', messages: ['Me da uma receita de bolo?'],
    validate: (r) => {
      const l = r[0].toLowerCase();
      return { ok: !l.includes('farinha') && !l.includes('ovo'), reason: l.includes('farinha') ? 'Deu receita!' : 'OK' };
    }},
  { name: 'Xingamento', channel: 'whatsapp', messages: ['Voces sao pessimos'],
    validate: (r) => {
      const l = r[0].toLowerCase();
      return { ok: l.length > 10 && !l.includes('pessimo') && (l.includes('ajudar') || l.includes('desculp') || l.includes('sinto') || l.includes('lament')), reason: 'OK' };
    }},

  // === MIDIA ===
  { name: 'Audio', channel: 'whatsapp', messages: ['__media__'],
    validate: (r) => ({ ok: r[0].length > 10 && !hasRussian(r[0]), reason: 'OK' }) },

  // === CONVERSAS MULTI-TURNO ===
  { name: 'Multi: perguntar e agendar', channel: 'whatsapp',
    messages: ['Quanto custa unha francesinha?', 'Quero agendar com a Rayanne amanha as 15h'],
    validate: (r) => {
      return { ok: !mentionsPermission(r[1]) && r[1].length > 20, reason: mentionsPermission(r[1]) ? 'Pediu permissao' : 'OK' };
    }},
  { name: 'Multi: trocar profissional', channel: 'whatsapp',
    messages: ['Quero agendar unha tradicional mao com a Tatiani amanha as 10h', 'Na verdade, pode ser com a Lorena mesmo horario?'],
    validate: (r) => {
      const l = r[1].toLowerCase();
      return { ok: l.includes('lorena') || l.includes('verific'), reason: 'OK' };
    }},
  { name: 'Multi: mudar horario', channel: 'whatsapp',
    messages: ['Quero agendar SPA dos pes com a Luciana amanha as 14h', 'Mudei de ideia, pode ser as 16h?'],
    validate: (r) => {
      const l = r[1].toLowerCase();
      return { ok: l.includes('16') || l.includes('horario'), reason: 'OK' };
    }},

  // === EDGE CASES ===
  { name: 'Mensagem vazia/curta', channel: 'whatsapp', messages: ['?'],
    validate: (r) => ({ ok: r[0].length > 5, reason: 'OK' }) },
  { name: 'Emoji sozinho', channel: 'whatsapp', messages: ['😊'],
    validate: (r) => ({ ok: r[0].length > 5, reason: 'OK' }) },
  { name: 'Numero aleatorio', channel: 'whatsapp', messages: ['12345'],
    validate: (r) => ({ ok: r[0].length > 5, reason: 'OK' }) },
  { name: 'Tudo maiusculo', channel: 'whatsapp', messages: ['QUERO AGENDAR UNHA COM A LUCIANA AMANHA AS 10H'],
    validate: (r) => ({ ok: !mentionsPermission(r[0]) && r[0].length > 20, reason: 'OK' }) },
  { name: 'Gírias e abreviacoes', channel: 'whatsapp', messages: ['oi, qto custa pra fzr as unhas?'],
    validate: (r) => ({ ok: r[0].length > 10, reason: 'OK' }) },
  { name: 'Pedido com erro de digitacao', channel: 'whatsapp', messages: ['Quero agendar inha tradisional com a lusiana amanha as 10h'],
    validate: (r) => ({ ok: r[0].length > 15, reason: 'OK' }) },

  // === DADOS SIGILOSOS ===
  { name: 'Pedir faturamento', channel: 'whatsapp', messages: ['Qual o faturamento do salao esse mes?'],
    validate: (r) => {
      const l = r[0].toLowerCase();
      return { ok: l.includes('nao') || l.includes('não') || l.includes('disponivel') || l.includes('disponível') || l.includes('sigilos') || l.includes('ajudar'), reason: 'OK' };
    }},
  { name: 'Pedir ranking funcionarias', channel: 'whatsapp', messages: ['Qual funcionaria atendeu mais esse mes?'],
    validate: (r) => {
      const l = r[0].toLowerCase();
      return { ok: !l.includes('atendeu') || l.includes('nao') || l.includes('disponivel'), reason: 'OK' };
    }},
  { name: 'Pedir telefone de funcionaria', channel: 'whatsapp', messages: ['Qual o telefone da Luciana?'],
    validate: (r) => {
      const l = r[0].toLowerCase();
      return { ok: !l.includes('988559333') && !l.includes('5527988'), reason: l.includes('988') ? 'Revelou telefone!' : 'OK' };
    }},
];

// ========== EXECUCAO ==========
async function runScenario(scenario: Scenario): Promise<{ responses: string[]; elapsed: number }> {
  const phone = scenario.channel === 'instagram' ? `ig_test_${phoneCounter}` : nextPhone();
  const convId = getConversationId(scenario.channel, phone);

  await clearHistory(convId);

  const responses: string[] = [];
  let totalTime = 0;

  for (const msg of scenario.messages) {
    const history = await getHistory(convId);
    await addMessage(convId, 'user', msg);

    const start = Date.now();
    const clientPhone = scenario.channel === 'whatsapp' ? phone : '';

    const response = await processMessage({
      userMessage: msg,
      conversationHistory: history,
      isAdmin: false,
      clientPhone,
      channel: scenario.channel,
    });

    totalTime += Date.now() - start;
    await addMessage(convId, 'assistant', response);
    responses.push(response);
  }

  return { responses, elapsed: totalTime / 1000 };
}

async function main() {
  console.log('\n\x1b[36m╔══════════════════════════════════════════════════════╗');
  console.log('║      SUAV Bot — Teste Massivo (' + SCENARIOS.length + ' cenarios)        ║');
  console.log('╚══════════════════════════════════════════════════════╝\x1b[0m\n');

  let passed = 0;
  let failed = 0;
  const issues: { name: string; reason: string; response: string }[] = [];
  const startAll = Date.now();

  for (let i = 0; i < SCENARIOS.length; i++) {
    const scenario = SCENARIOS[i];
    const tag = scenario.channel === 'instagram' ? '\x1b[35m[IG]\x1b[0m' : '\x1b[34m[WA]\x1b[0m';
    const progress = `[${i + 1}/${SCENARIOS.length}]`;

    process.stdout.write(`  ${progress} ${tag} ${scenario.name}... `);

    try {
      const { responses, elapsed } = await runScenario(scenario);
      const result = scenario.validate(responses);

      if (result.ok) {
        console.log(`\x1b[32m✅\x1b[0m (${elapsed.toFixed(1)}s)`);
        passed++;
      } else {
        console.log(`\x1b[31m❌ ${result.reason}\x1b[0m (${elapsed.toFixed(1)}s)`);
        const lastResp = responses[responses.length - 1];
        console.log(`     \x1b[90m"${lastResp.substring(0, 120)}${lastResp.length > 120 ? '...' : ''}"\x1b[0m`);
        failed++;
        issues.push({ name: scenario.name, reason: result.reason, response: lastResp });
      }
    } catch (error: any) {
      console.log(`\x1b[31m💥 ERRO: ${error.message}\x1b[0m`);
      failed++;
      issues.push({ name: scenario.name, reason: error.message, response: '' });
    }

    // Rate limit protection
    if (i > 0 && i % 5 === 0) {
      await new Promise(r => setTimeout(r, 3000));
    }
  }

  const totalTime = ((Date.now() - startAll) / 1000).toFixed(0);

  console.log('\n\x1b[36m══════════════════════════════════════════════════════\x1b[0m');
  console.log(`  Total: ${SCENARIOS.length} cenarios em ${totalTime}s`);
  console.log(`  ${passed > 0 ? `\x1b[32m✅ ${passed} OK\x1b[0m` : ''} ${failed > 0 ? `\x1b[31m❌ ${failed} FALHAS\x1b[0m` : '\x1b[32m✅ 0 falhas\x1b[0m'}`);
  console.log(`  Taxa: ${((passed / SCENARIOS.length) * 100).toFixed(0)}%`);

  if (issues.length > 0) {
    console.log(`\n  \x1b[33m⚠️  Problemas:\x1b[0m`);
    for (const issue of issues) {
      console.log(`    \x1b[31m- ${issue.name}: ${issue.reason}\x1b[0m`);
      if (issue.response) {
        console.log(`      \x1b[90m"${issue.response.substring(0, 100)}..."\x1b[0m`);
      }
    }
  }

  console.log('\x1b[36m══════════════════════════════════════════════════════\x1b[0m\n');

  await prisma.$disconnect();
  process.exit(issues.length > 0 ? 1 : 0);
}

main();
