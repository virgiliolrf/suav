/**
 * Script de polimento: simula conversas reais e avalia qualidade
 * Roda em loop para iterar no tom da Mari
 */
import { processMessage } from './ai/agent';
import { addMessage, getHistory, clearHistory } from './conversation/manager';
import { logger } from './utils/logger';

logger.level = 'silent';

const PHONE = '5527999990000';

// Palavras/padrões que indicam tom robótico
const BOT_PATTERNS = [
  /como posso te ajudar/i,
  /em que posso ajudar/i,
  /posso ajudar em algo/i,
  /posso ajudar com algo mais/i,
  /estou à disposição/i,
  /à disposição/i,
  /infelizmente/i,
  /lamentamos/i,
  /informo que/i,
  /\bquerida\b/i,
  /\blinda\b/i,
  /\bflor\b/i,
  /\bamor\b/i,
  /\bmana\b/i,
  /\bbenzinho\b/i,
  /aqui é a mari/i,
  /sou a mari da suav/i,
  /posso verificar/i,
  /vou verificar/i,
  /permitam-me/i,
  /gostaria de informar/i,
  /no que posso te ajudar/i,
];

interface Conversation {
  name: string;
  messages: string[];
}

const conversations: Conversation[] = [
  {
    name: 'Agendamento completo de unha',
    messages: [
      'oi',
      'Camila',
      'quero fazer unha gel',
      'com a Larissa',
      'sexta às 14h',
      'confirma!',
      'obrigada!',
    ],
  },
  {
    name: 'Pergunta de preço + agendamento',
    messages: [
      'boa tarde',
      'quanto custa corte de cabelo?',
      'e escova?',
      'quero agendar escova pra amanhã de manhã',
    ],
  },
  {
    name: 'Cliente informal',
    messages: [
      'eae',
      'Jéssica',
      'quanto ta a manicure?',
      'quero marcar pra sábado',
    ],
  },
  {
    name: 'Cliente reclamando',
    messages: [
      'oi, tô bem irritada com vocês',
      'fiz unha gel e saiu tudo em 3 dias',
      'quero remarcar',
    ],
  },
  {
    name: 'Cliente faz várias perguntas',
    messages: [
      'oi! vocês fazem sobrancelha?',
      'quanto custa?',
      'e depilação?',
      'vocês tem estacionamento?',
      'qual o endereço?',
    ],
  },
  {
    name: 'Cliente tenta domingo',
    messages: [
      'oi quero agendar pra domingo',
    ],
  },
  {
    name: 'Cliente pergunta se é robô',
    messages: [
      'vc é um robô?',
      'sério mesmo?',
    ],
  },
  {
    name: 'Cliente quer cancelar',
    messages: [
      'oi preciso cancelar meu agendamento',
    ],
  },
  {
    name: 'Agendamento direto com tudo',
    messages: [
      'oi, quero agendar manutenção de unha gel com a Clau sexta às 10h',
    ],
  },
  {
    name: 'Cliente quer depilação',
    messages: [
      'bom dia',
      'Ana',
      'quero depilar virilha',
      'quanto custa?',
      'pode ser terça às 15h?',
    ],
  },
  {
    name: 'Cliente tímida - respostas curtas',
    messages: [
      'oi',
      'Maria',
      'corte',
      'tanto faz',
      'amanhã',
    ],
  },
  {
    name: 'Cliente envia mensagem longa',
    messages: [
      'oi boa tarde tudo bem? eu queria saber se vocês fazem unha em gel porque eu tenho uma festa no sábado e preciso fazer as unhas mas não sei se vocês tem horário ainda disponível pra mim e quanto custa',
    ],
  },
  {
    name: 'Cliente diz que não vai conseguir (NÃO deve cancelar direto)',
    messages: [
      'oi não vou conseguir ir mais no meu horário',
    ],
  },
  {
    name: 'Cliente quer desmarcar (deve pedir confirmação)',
    messages: [
      'oi quero desmarcar meu horário de sexta',
    ],
  },
];

function analyzeResponse(raw: string): {
  segments: string[];
  totalLength: number;
  maxSegmentLength: number;
  hasBreak: boolean;
  botPatterns: string[];
  hasBullets: boolean;
  hasEmoji: boolean;
  emojiCount: number;
} {
  const segments = raw.split('[BREAK]').map(s => s.trim()).filter(s => s.length > 0);
  const clean = raw.replace(/\[BREAK\]/g, '\n');
  const botPatterns: string[] = [];
  for (const p of BOT_PATTERNS) {
    if (p.test(clean)) {
      botPatterns.push(p.source);
    }
  }
  const emojiRegex = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2702}-\u{27B0}\u{24C2}-\u{1F251}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{2600}-\u{26FF}\u{2700}-\u{27BF}✅❌⏰💰📋✨💅🤗😊😅😕😉💇🏻‍♀️]/gu;
  const emojis = clean.match(emojiRegex) || [];

  return {
    segments,
    totalLength: clean.length,
    maxSegmentLength: Math.max(...segments.map(s => s.length)),
    hasBreak: raw.includes('[BREAK]'),
    botPatterns,
    hasBullets: /^[\s]*[-•*]\s/m.test(clean),
    hasEmoji: emojis.length > 0,
    emojiCount: emojis.length,
  };
}

async function runConversation(conv: Conversation): Promise<{
  issues: string[];
  responses: { msg: string; response: string; analysis: ReturnType<typeof analyzeResponse> }[];
}> {
  const convId = `polish_${conv.name.replace(/\s+/g, '_')}`;
  await clearHistory(convId);

  const issues: string[] = [];
  const responses: { msg: string; response: string; analysis: ReturnType<typeof analyzeResponse> }[] = [];

  for (const msg of conv.messages) {
    const history = await getHistory(convId);
    await addMessage(convId, 'user', msg);

    const raw = await processMessage({
      userMessage: msg,
      conversationHistory: history,
      role: 'client',
      clientPhone: PHONE,
      channel: 'whatsapp',
    });

    const clean = raw.replace(/\[BREAK\]/g, '\n');
    await addMessage(convId, 'assistant', clean);

    const analysis = analyzeResponse(raw);
    responses.push({ msg, response: clean, analysis });

    // Check issues
    if (analysis.botPatterns.length > 0) {
      issues.push(`"${msg}" → Padrão de bot detectado: ${analysis.botPatterns.join(', ')}`);
    }
    if (analysis.totalLength > 300) {
      issues.push(`"${msg}" → Resposta longa demais (${analysis.totalLength} chars)`);
    }
    if (analysis.maxSegmentLength > 200) {
      issues.push(`"${msg}" → Segmento muito longo (${analysis.maxSegmentLength} chars)`);
    }
    if (analysis.hasBullets) {
      issues.push(`"${msg}" → Tem bullets/listas (não natural no WhatsApp)`);
    }
    if (analysis.emojiCount > 3) {
      issues.push(`"${msg}" → Muitos emojis (${analysis.emojiCount})`);
    }
    if (analysis.segments.length > 4) {
      issues.push(`"${msg}" → Muitos segmentos (${analysis.segments.length})`);
    }
    // Detectar cancelamento sem confirmação
    if (msg.toLowerCase().match(/não vou conseguir|acho que não vou|pensando em desmarcar/)) {
      if (clean.toLowerCase().includes('cancelado') || clean.toLowerCase().includes('cancelei') || clean.toLowerCase().includes('desmarcado')) {
        issues.push(`"${msg}" → Bot CANCELOU sem pedir confirmação explícita!`);
      }
    }
    // Detectar nome duplicado (ex: "CamilaCamila" — nome próprio com maiúscula repetido)
    const nameDupeMatch = clean.match(/([A-ZÁÀÂÃÉÈÊÍÏÓÔÕÖÚÇ][a-záàâãéèêíïóôõöúç]{2,})\1/);
    if (nameDupeMatch && /^[A-ZÁÀÂÃÉÈÊÍÏÓÔÕÖÚÇ]/.test(nameDupeMatch[1])) {
      issues.push(`"${msg}" → Nome duplicado: "${nameDupeMatch[0]}"`);
    }
    // Detectar nomes em MAIÚSCULAS (não natural)
    const upperNameMatch = clean.match(/\b[A-ZÁÀÂÃÉÈÊ]{3,}\b/);
    if (upperNameMatch && !['PIX', 'DDD', 'SUAV', 'SPA'].includes(upperNameMatch[0])) {
      issues.push(`"${msg}" → Nome em MAIÚSCULAS: "${upperNameMatch[0]}" (deveria ser capitalização normal)`);
    }
  }

  return { issues, responses };
}

async function main() {
  console.log('\n\x1b[32m╔══════════════════════════════════════════════════════╗');
  console.log('║       SUAV Bot — Teste de Polimento                  ║');
  console.log(`║       ${conversations.length} conversas simuladas                       ║`);
  console.log('╚══════════════════════════════════════════════════════╝\x1b[0m\n');

  let totalIssues = 0;

  for (let i = 0; i < conversations.length; i++) {
    const conv = conversations[i];
    console.log(`\x1b[34m━━━ ${i + 1}/${conversations.length}: ${conv.name} ━━━\x1b[0m`);

    try {
      const result = await runConversation(conv);

      // Print conversation
      for (const r of result.responses) {
        console.log(`  \x1b[90mCliente:\x1b[0m ${r.msg}`);
        const segments = r.analysis.segments;
        for (const seg of segments) {
          console.log(`  \x1b[32mMari:\x1b[0m ${seg}`);
        }
        const tags: string[] = [];
        if (r.analysis.hasBreak) tags.push(`${segments.length} msgs`);
        tags.push(`${r.analysis.totalLength}c`);
        if (r.analysis.hasEmoji) tags.push(`${r.analysis.emojiCount}emoji`);
        console.log(`  \x1b[90m  [${tags.join(' | ')}]\x1b[0m`);
        console.log('');
      }

      // Check emoji repetition across responses
      const emojiRegexGlobal = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2702}-\u{27B0}\u{24C2}-\u{1F251}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{2600}-\u{26FF}\u{2700}-\u{27BF}✅❌⏰💰📋✨💅🤗😊😅😕😉💇🏻‍♀️]/gu;
      let lastEmoji = '';
      let sameEmojiStreak = 0;
      for (const r of result.responses) {
        const emojis = r.response.match(emojiRegexGlobal) || [];
        if (emojis.length > 0 && emojis[0] === lastEmoji) {
          sameEmojiStreak++;
          if (sameEmojiStreak >= 2) {
            result.issues.push(`Emoji "${lastEmoji}" repetido ${sameEmojiStreak + 1}x seguidas`);
          }
        } else {
          sameEmojiStreak = emojis.length > 0 && emojis[0] === lastEmoji ? sameEmojiStreak + 1 : 0;
        }
        if (emojis.length > 0) lastEmoji = emojis[0] ?? '';
      }

      // Check formality rules
      for (const r of result.responses) {
        if (r.response.toLowerCase().includes('oiii') || r.response.toLowerCase().includes('oii')) {
          result.issues.push(`"${r.msg}" → Mari disse "oiii/oii" (proibido — deve ser "Oi!")`);
        }
        if (r.response.toLowerCase().includes('eae')) {
          result.issues.push(`"${r.msg}" → Mari disse "eae" (proibido — deve ser "Oi!")`);
        }
        if (r.msg.toLowerCase().startsWith('boa tarde') && !r.response.toLowerCase().includes('boa tarde')) {
          result.issues.push(`"${r.msg}" → Mari não espelhou "boa tarde"`);
        }
        if (r.msg.toLowerCase().startsWith('bom dia') && !r.response.toLowerCase().includes('bom dia')) {
          result.issues.push(`"${r.msg}" → Mari não espelhou "bom dia"`);
        }
        // Verificar que começa com maiúscula
        const firstSegment = r.analysis.segments[0];
        if (firstSegment && /^[a-záàâãéèêíïóôõöúç]/.test(firstSegment)) {
          result.issues.push(`"${r.msg}" → Resposta começa com minúscula: "${firstSegment.substring(0, 20)}..."`);
        }
      }

      totalIssues += result.issues.length;

      // Print issues
      if (result.issues.length > 0) {
        console.log(`  \x1b[31m⚠ ${result.issues.length} problema(s):\x1b[0m`);
        for (const issue of result.issues) {
          console.log(`    \x1b[31m• ${issue}\x1b[0m`);
        }
      } else {
        console.log(`  \x1b[32m✅ Sem problemas detectados\x1b[0m`);
      }
      console.log('');

    } catch (error: any) {
      console.log(`  \x1b[31m💥 ERRO: ${error.message}\x1b[0m\n`);
      totalIssues++;
    }

    // Delay entre conversas (rate limit)
    if (i < conversations.length - 1) {
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  console.log('\x1b[32m══════════════════════════════════════════════════════\x1b[0m');
  if (totalIssues === 0) {
    console.log('\x1b[32m RESULTADO: Todas as conversas OK! 🎉\x1b[0m');
  } else {
    console.log(`\x1b[33m RESULTADO: ${totalIssues} problema(s) encontrado(s)\x1b[0m`);
  }
  console.log('\x1b[32m══════════════════════════════════════════════════════\x1b[0m\n');

  process.exit(totalIssues > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Erro fatal:', err);
  process.exit(1);
});
