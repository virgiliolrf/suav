import { processMessage } from './ai/agent';
import { addMessage, getHistory, clearHistory } from './conversation/manager';
import { getConversationId } from './channels/types';
import type { ChannelType } from './channels/types';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface Scenario {
  name: string;
  channel: ChannelType;
  phone: string;
  messages: string[];
  validate: (response: string) => { ok: boolean; reason: string };
}

function baseChecks(response: string): { ok: boolean; reason: string } | null {
  const hasRussian = /[а-яА-Я]{3,}/.test(response);
  if (hasRussian) return { ok: false, reason: 'Respondeu em russo!' };
  if (response.length < 10) return { ok: false, reason: `Resposta muito curta (${response.length} chars)` };
  return null;
}

const SCENARIOS: Scenario[] = [
  {
    name: '1. Saudacao simples',
    channel: 'whatsapp',
    phone: '5500000000001',
    messages: ['Oi, tudo bem?'],
    validate: (r) => baseChecks(r) || { ok: true, reason: 'OK' },
  },
  {
    name: '2. Perguntar precos de unhas',
    channel: 'whatsapp',
    phone: '5500000000002',
    messages: ['Quanto custa fazer as unhas?'],
    validate: (r) => baseChecks(r) || { ok: true, reason: 'OK' },
  },
  {
    name: '3. Perguntar sobre depilacao',
    channel: 'whatsapp',
    phone: '5500000000003',
    messages: ['Quais servicos de depilacao voces tem?'],
    validate: (r) => baseChecks(r) || { ok: true, reason: 'OK' },
  },
  {
    name: '4. Verificar disponibilidade e agendar',
    channel: 'whatsapp',
    phone: '5500000000004',
    messages: ['Quero agendar unha tradicional mao com a Luciana pra amanha as 10h'],
    validate: (r) => {
      const base = baseChecks(r);
      if (base) return base;
      const lower = r.toLowerCase();
      if (lower.includes('posso verificar') || lower.includes('deixe-me verificar') || lower.includes('gostaria que eu verificasse')) {
        return { ok: false, reason: 'Pediu permissao para verificar em vez de agir direto' };
      }
      if (!lower.includes('35') && !lower.includes('luciana')) {
        return { ok: false, reason: 'Nao mencionou preco R$35 ou Luciana' };
      }
      return { ok: true, reason: 'OK' };
    },
  },
  {
    name: '5. Mensagem fora do contexto',
    channel: 'whatsapp',
    phone: '5500000000005',
    messages: ['Qual a capital da Franca?'],
    validate: (r) => {
      const base = baseChecks(r);
      if (base) return base;
      const lower = r.toLowerCase();
      if (lower.includes('paris') && !lower.includes('suav') && !lower.includes('salao') && !lower.includes('beleza')) {
        return { ok: false, reason: 'Respondeu a pergunta fora do contexto sem redirecionar' };
      }
      return { ok: true, reason: 'OK' };
    },
  },
  {
    name: '6. Perguntar horario de funcionamento',
    channel: 'whatsapp',
    phone: '5500000000006',
    messages: ['Que horas voces abrem e fecham?'],
    validate: (r) => {
      const base = baseChecks(r);
      if (base) return base;
      if (!r.includes('09') && !r.includes('9:00') && !r.includes('9h')) {
        return { ok: false, reason: 'Nao mencionou horario de abertura' };
      }
      return { ok: true, reason: 'OK' };
    },
  },
  {
    name: '7. Instagram - pede telefone ao agendar',
    channel: 'instagram',
    phone: 'ig_test_0007',
    messages: ['Oi quero agendar um corte de cabelo pra sabado as 14h'],
    validate: (r) => {
      const base = baseChecks(r);
      if (base) return base;
      const lower = r.toLowerCase();
      if (!lower.includes('telefone') && !lower.includes('whatsapp') && !lower.includes('ddd') && !lower.includes('numero')) {
        return { ok: false, reason: 'Nao pediu telefone (obrigatorio no Instagram)' };
      }
      return { ok: true, reason: 'OK' };
    },
  },
  {
    name: '8. Perguntar sobre servico especifico com preco',
    channel: 'whatsapp',
    phone: '5500000000008',
    messages: ['Quanto custa progressiva?'],
    validate: (r) => baseChecks(r) || { ok: true, reason: 'OK' },
  },
  {
    name: '9. Perguntar profissionais de um servico',
    channel: 'whatsapp',
    phone: '5500000000009',
    messages: ['Quem faz extensao de cilios?'],
    validate: (r) => {
      const base = baseChecks(r);
      if (base) return base;
      const lower = r.toLowerCase();
      if (!lower.includes('luana') && !lower.includes('lorena')) {
        return { ok: false, reason: 'Nao mencionou Luana ou Lorena Martins' };
      }
      return { ok: true, reason: 'OK' };
    },
  },
  {
    name: '10. Mensagem com audio/midia',
    channel: 'whatsapp',
    phone: '5500000000010',
    messages: ['__media__'],
    validate: (r) => {
      const base = baseChecks(r);
      if (base) return base;
      const lower = r.toLowerCase();
      if (lower.includes('cilios') || lower.includes('cílios') || lower.includes('alongamento')) {
        return { ok: false, reason: 'Respondeu sobre cilios em vez de tratar como midia' };
      }
      return { ok: true, reason: 'OK' };
    },
  },
];

function pass(text: string): string { return `\x1b[32m✅ ${text}\x1b[0m`; }
function fail(text: string): string { return `\x1b[31m❌ ${text}\x1b[0m`; }
function warn(text: string): string { return `\x1b[33m⚠️  ${text}\x1b[0m`; }

async function runScenario(scenario: Scenario): Promise<{ response: string; elapsed: number }> {
  const convId = getConversationId(scenario.channel, scenario.phone);

  // Limpar cache E banco
  clearHistory(convId);
  await prisma.conversationLog.deleteMany({ where: { phone: convId } });

  let lastResponse = '';
  let totalTime = 0;

  for (const msg of scenario.messages) {
    const history = await getHistory(convId);
    await addMessage(convId, 'user', msg);

    const start = Date.now();
    const clientPhone = scenario.channel === 'whatsapp' ? scenario.phone : '';

    lastResponse = await processMessage({
      userMessage: msg,
      conversationHistory: history,
      isAdmin: false,
      clientPhone,
      channel: scenario.channel,
    });

    totalTime += Date.now() - start;
    await addMessage(convId, 'assistant', lastResponse);
  }

  return { response: lastResponse, elapsed: totalTime / 1000 };
}

async function main() {
  console.log('\n\x1b[36m╔══════════════════════════════════════════════════╗');
  console.log('║        SUAV Bot — Teste Automatizado             ║');
  console.log('╚══════════════════════════════════════════════════╝\x1b[0m\n');

  let passed = 0;
  let failed = 0;
  const issues: string[] = [];

  for (const scenario of SCENARIOS) {
    const tag = scenario.channel === 'instagram' ? '\x1b[35m[IG]\x1b[0m' : '\x1b[34m[WA]\x1b[0m';
    console.log(`${tag} \x1b[1m${scenario.name}\x1b[0m`);
    console.log(`   Mensagem: "${scenario.messages[scenario.messages.length - 1]}"`);

    try {
      const { response, elapsed } = await runScenario(scenario);

      console.log(`   Resposta (${elapsed.toFixed(1)}s):`);
      for (const line of response.split('\n')) {
        console.log(`     \x1b[90m${line}\x1b[0m`);
      }

      const result = scenario.validate(response);
      if (result.ok) {
        console.log(`   ${pass(result.reason)}`);
        passed++;
      } else {
        console.log(`   ${fail(result.reason)}`);
        failed++;
        issues.push(`${scenario.name}: ${result.reason}`);
      }
    } catch (error: any) {
      console.log(`   ${fail(`ERRO: ${error.message}`)}`);
      failed++;
      issues.push(`${scenario.name}: ${error.message}`);
    }

    console.log('');
  }

  console.log('\x1b[36m══════════════════════════════════════════════════\x1b[0m');
  console.log(`  Resultados: ${pass(`${passed} OK`)} | ${failed > 0 ? fail(`${failed} FALHAS`) : pass('0 falhas')}`);

  if (issues.length > 0) {
    console.log(`\n  ${warn('Problemas encontrados:')}`);
    for (const issue of issues) {
      console.log(`    - ${issue}`);
    }
  }

  console.log('\x1b[36m══════════════════════════════════════════════════\x1b[0m\n');

  await prisma.$disconnect();
  process.exit(issues.length > 0 ? 1 : 0);
}

main();
