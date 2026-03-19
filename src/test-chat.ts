import readline from 'readline';
import { processMessage } from './ai/agent';
import { addMessage, getHistory, clearHistory } from './conversation/manager';
import { logger } from './utils/logger';
import { env } from './config/env';
import type { ChannelType } from './channels/types';
import { getConversationId } from './channels/types';

// Desativar logs do pino pra nao poluir o chat
logger.level = 'silent';

const PHONE_CLIENTE = '5511999990000';
const PHONE_ADMIN = env.ADMIN_OWNER_PHONE || '5511999990001';
const IGSID_INSTAGRAM = '7654321098765'; // ID simulado do Instagram

let currentPhone = PHONE_CLIENTE;
let currentChannel: ChannelType = 'whatsapp';
let isAdmin = false;
let processing = false;

function getConvId(): string {
  return getConversationId(currentChannel, currentChannel === 'instagram' ? IGSID_INSTAGRAM : currentPhone);
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function printHeader() {
  console.log('');
  console.log('\x1b[32m  +====================================================+\x1b[0m');
  console.log('\x1b[32m  |         SUAV Bot — Modo Teste no Terminal           |\x1b[0m');
  console.log('\x1b[32m  +====================================================+\x1b[0m');
  console.log('\x1b[32m  |\x1b[0m  Converse como se fosse uma cliente               \x1b[32m|\x1b[0m');
  console.log('\x1b[32m  |\x1b[0m  Gemini + banco de dados real estao ativos        \x1b[32m|\x1b[0m');
  console.log('\x1b[32m  +----------------------------------------------------+\x1b[0m');
  console.log('\x1b[32m  |\x1b[0m  /whatsapp  canal WhatsApp (padrao)               \x1b[32m|\x1b[0m');
  console.log('\x1b[32m  |\x1b[0m  /instagram canal Instagram Direct                \x1b[32m|\x1b[0m');
  console.log('\x1b[32m  |\x1b[0m  /admin     trocar para modo gerente/dona          \x1b[32m|\x1b[0m');
  console.log('\x1b[32m  |\x1b[0m  /cliente   voltar para modo cliente               \x1b[32m|\x1b[0m');
  console.log('\x1b[32m  |\x1b[0m  /limpar    limpar historico da conversa           \x1b[32m|\x1b[0m');
  console.log('\x1b[32m  |\x1b[0m  /debug     ativar logs do Gemini                  \x1b[32m|\x1b[0m');
  console.log('\x1b[32m  |\x1b[0m  /sair      encerrar                              \x1b[32m|\x1b[0m');
  console.log('\x1b[32m  +====================================================+\x1b[0m');
  console.log(`\n  Canal: \x1b[35mWhatsApp\x1b[0m | Modo: \x1b[36mCliente\x1b[0m | Tel: ${PHONE_CLIENTE}\n`);
}

function getPrompt(): string {
  const channelTag = currentChannel === 'instagram'
    ? '\x1b[35m[IG]\x1b[0m'
    : '\x1b[34m[WA]\x1b[0m';
  const modeTag = isAdmin ? '\x1b[33m[ADMIN]\x1b[0m' : '\x1b[36m[CLIENTE]\x1b[0m';
  return `  ${channelTag}${modeTag} Voce > `;
}

function printBot(text: string, elapsed: string) {
  const lines = text.split('\n');
  console.log('');
  for (const line of lines) {
    console.log(`  \x1b[32m  SUAV:\x1b[0m ${line}`);
  }
  console.log(`  \x1b[90m  (${elapsed}s)\x1b[0m`);
  console.log('');
}

async function handleCommand(text: string): Promise<boolean> {
  if (text === '/admin') {
    isAdmin = true;
    currentPhone = PHONE_ADMIN;
    console.log(`\n  \x1b[33m>> Modo ADMIN ativado\x1b[0m — agora voce e a dona/gerente`);
    console.log(`  \x1b[33m>> Pergunte sobre faturamento, agendamentos, ranking...\x1b[0m\n`);
    return true;
  }
  if (text === '/cliente') {
    isAdmin = false;
    currentPhone = PHONE_CLIENTE;
    console.log(`\n  \x1b[36m>> Modo CLIENTE ativado\x1b[0m — agora voce e uma cliente\n`);
    return true;
  }
  if (text === '/whatsapp') {
    currentChannel = 'whatsapp';
    currentPhone = isAdmin ? PHONE_ADMIN : PHONE_CLIENTE;
    console.log(`\n  \x1b[34m>> Canal WhatsApp ativado\x1b[0m — simulando conversa pelo WhatsApp\n`);
    return true;
  }
  if (text === '/instagram') {
    currentChannel = 'instagram';
    isAdmin = false; // Instagram nao tem modo admin
    console.log(`\n  \x1b[35m>> Canal Instagram ativado\x1b[0m — simulando conversa pelo Instagram Direct`);
    console.log(`  \x1b[35m>> IGSID: ${IGSID_INSTAGRAM}\x1b[0m — o bot vai pedir telefone ao agendar\n`);
    return true;
  }
  if (text === '/limpar') {
    clearHistory(getConvId());
    console.log('\n  >> Historico limpo! Conversa recomeca do zero.\n');
    return true;
  }
  if (text === '/debug') {
    if (logger.level === 'silent') {
      logger.level = 'info';
      console.log('\n  >> Debug ATIVADO — voce vai ver as function calls do Gemini\n');
    } else {
      logger.level = 'silent';
      console.log('\n  >> Debug DESATIVADO\n');
    }
    return true;
  }
  if (text === '/sair' || text === '/exit' || text === '/quit') {
    console.log('\n  Ate mais!\n');
    rl.close();
    process.exit(0);
  }
  return false;
}

async function chat(text: string) {
  processing = true;
  process.stdout.write('\n  \x1b[90m  Digitando...\x1b[0m');

  const convId = getConvId();
  const history = await getHistory(convId);
  await addMessage(convId, 'user', text);

  const startTime = Date.now();

  // Telefone so disponivel se for WhatsApp
  const clientPhone = currentChannel === 'whatsapp' ? currentPhone : '';

  const response = await processMessage({
    userMessage: text,
    conversationHistory: history,
    isAdmin,
    clientPhone,
    channel: currentChannel,
  });

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  await addMessage(convId, 'assistant', response);

  // Limpar "Digitando..." e imprimir resposta
  process.stdout.write('\r\x1b[K');
  printBot(response, elapsed);
  processing = false;
}

async function main() {
  printHeader();

  let closed = false;

  rl.on('close', () => {
    closed = true;
  });

  const ask = () => {
    if (closed) {
      const waitAndExit = () => {
        if (!processing) {
          process.exit(0);
        } else {
          setTimeout(waitAndExit, 100);
        }
      };
      waitAndExit();
      return;
    }

    rl.question(getPrompt(), async (input) => {
      const text = input.trim();

      if (!text) {
        ask();
        return;
      }

      try {
        const wasCommand = await handleCommand(text);
        if (!wasCommand) {
          await chat(text);
        }
      } catch (error: any) {
        console.error(`\n  \x1b[31mErro: ${error.message}\x1b[0m\n`);
      }

      ask();
    });
  };

  ask();
}

main();
