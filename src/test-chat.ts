import readline from 'readline';
import { processMessage } from './ai/agent';
import { addMessage, getHistory, clearHistory } from './conversation/manager';
import { logger } from './utils/logger';
import { env } from './config/env';
import type { ChannelType } from './channels/types';
import { getConversationId } from './channels/types';

// Desativar logs do pino pra nao poluir o chat
logger.level = 'silent';

const PHONE_CLIENTE = '5527999990000';
const PHONE_ADMIN = env.ADMIN_OWNER_PHONE || '559891752988';
const PHONE_PROFISSIONAL = '5527992589125'; // LARISSA
const IGSID_INSTAGRAM = '7654321098765';

let currentPhone = PHONE_CLIENTE;
let currentChannel: ChannelType = 'whatsapp';
let currentRole: 'admin' | 'professional' | 'client' = 'client';
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
  console.log('\x1b[32m  |\x1b[0m  /admin       modo dona/gerente                    \x1b[32m|\x1b[0m');
  console.log('\x1b[32m  |\x1b[0m  /profissional modo profissional (Larissa)          \x1b[32m|\x1b[0m');
  console.log('\x1b[32m  |\x1b[0m  /cliente     modo cliente                         \x1b[32m|\x1b[0m');
  console.log('\x1b[32m  |\x1b[0m  /instagram   canal Instagram                      \x1b[32m|\x1b[0m');
  console.log('\x1b[32m  |\x1b[0m  /whatsapp    canal WhatsApp                       \x1b[32m|\x1b[0m');
  console.log('\x1b[32m  |\x1b[0m  /limpar      limpar historico                     \x1b[32m|\x1b[0m');
  console.log('\x1b[32m  |\x1b[0m  /debug       toggle logs                          \x1b[32m|\x1b[0m');
  console.log('\x1b[32m  |\x1b[0m  /sair        encerrar                             \x1b[32m|\x1b[0m');
  console.log('\x1b[32m  +====================================================+\x1b[0m');
  console.log(`\n  Canal: \x1b[34mWhatsApp\x1b[0m | Modo: \x1b[36mCliente\x1b[0m | Tel: ${PHONE_CLIENTE}\n`);
}

function getPrompt(): string {
  const channelTag = currentChannel === 'instagram'
    ? '\x1b[35m[IG]\x1b[0m'
    : '\x1b[34m[WA]\x1b[0m';
  const roleTags: Record<string, string> = {
    admin: '\x1b[33m[ADMIN]\x1b[0m',
    professional: '\x1b[95m[PROF]\x1b[0m',
    client: '\x1b[36m[CLIENTE]\x1b[0m',
  };
  const roleTag = roleTags[currentRole];
  return `  ${channelTag}${roleTag} Voce > `;
}

function printBot(text: string, elapsed: string) {
  const lines = text.split('\n');
  console.log('');
  for (const line of lines) {
    console.log(`  \x1b[32m  Mari:\x1b[0m ${line}`);
  }
  console.log(`  \x1b[90m  (${elapsed}s)\x1b[0m`);
  console.log('');
}

async function handleCommand(text: string): Promise<boolean> {
  if (text === '/admin') {
    currentRole = 'admin';
    currentPhone = PHONE_ADMIN;
    clearHistory(getConvId());
    console.log(`\n  \x1b[33m>> Modo ADMIN ativado\x1b[0m — telefone: ${PHONE_ADMIN}`);
    console.log(`  \x1b[33m>> Pergunte: faturamento, agenda, ranking, bloquear horário...\x1b[0m\n`);
    return true;
  }
  if (text === '/profissional') {
    currentRole = 'professional';
    currentPhone = PHONE_PROFISSIONAL;
    clearHistory(getConvId());
    console.log(`\n  \x1b[95m>> Modo PROFISSIONAL ativado\x1b[0m — Larissa (${PHONE_PROFISSIONAL})`);
    console.log(`  \x1b[95m>> Pergunte: minha agenda, meus horários...\x1b[0m\n`);
    return true;
  }
  if (text === '/cliente') {
    currentRole = 'client';
    currentPhone = PHONE_CLIENTE;
    clearHistory(getConvId());
    console.log(`\n  \x1b[36m>> Modo CLIENTE ativado\x1b[0m — telefone: ${PHONE_CLIENTE}\n`);
    return true;
  }
  if (text === '/whatsapp') {
    currentChannel = 'whatsapp';
    console.log(`\n  \x1b[34m>> Canal WhatsApp ativado\x1b[0m\n`);
    return true;
  }
  if (text === '/instagram') {
    currentChannel = 'instagram';
    currentRole = 'client';
    console.log(`\n  \x1b[35m>> Canal Instagram ativado\x1b[0m — IGSID: ${IGSID_INSTAGRAM}\n`);
    return true;
  }
  if (text === '/limpar') {
    clearHistory(getConvId());
    console.log('\n  >> Histórico limpo!\n');
    return true;
  }
  if (text === '/debug') {
    if (logger.level === 'silent') {
      logger.level = 'info';
      console.log('\n  >> Debug ATIVADO\n');
    } else {
      logger.level = 'silent';
      console.log('\n  >> Debug DESATIVADO\n');
    }
    return true;
  }
  if (text === '/sair' || text === '/exit' || text === '/quit') {
    console.log('\n  Até mais!\n');
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

  const clientPhone = currentChannel === 'whatsapp' ? currentPhone : '';

  const response = await processMessage({
    userMessage: text,
    conversationHistory: history,
    role: currentRole,
    clientPhone,
    channel: currentChannel,
    adminName: currentRole === 'admin' ? 'Dona' : undefined,
    professionalId: currentRole === 'professional' ? 9 : undefined, // Larissa ID
    professionalName: currentRole === 'professional' ? 'LARISSA' : undefined,
  });

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  await addMessage(convId, 'assistant', response);

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
