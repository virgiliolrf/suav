import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  WASocket,
  fetchLatestBaileysVersion,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import * as qrcode from 'qrcode-terminal';
import { logger } from '../utils/logger';
import path from 'path';

let socket: WASocket | null = null;
let connectionReady = false;

const DATA_DIR = process.env.DATA_DIR || process.cwd();
const AUTH_DIR = path.join(DATA_DIR, 'auth_state');

/**
 * Inicializa conexao com WhatsApp via Baileys
 */
export async function initWhatsApp(
  onMessage: (jid: string, text: string) => void,
  onConnected?: () => void
): Promise<WASocket> {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();

  socket = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false,
    logger: logger.child({ module: 'baileys' }) as any,
    browser: ['SUAV Bot', 'Chrome', '1.0.0'],
    connectTimeoutMs: 60000,
    defaultQueryTimeoutMs: 60000,
    markOnlineOnConnect: true,
  });

  // Evento de atualizacao de conexao
  socket.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log('\n========================================');
      console.log('  ESCANEIE O QR CODE COM O WHATSAPP');
      console.log('========================================\n');
      qrcode.generate(qr, { small: true });
    }

    if (connection === 'close') {
      connectionReady = false;
      const error = (lastDisconnect?.error as Boom)?.output;
      const statusCode = error?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

      logger.warn({
        msg: 'Conexao WhatsApp fechada',
        statusCode,
        shouldReconnect,
      });

      if (shouldReconnect) {
        logger.info('Reconectando em 3 segundos...');
        setTimeout(() => {
          initWhatsApp(onMessage);
        }, 3000);
      } else {
        logger.error('Deslogado do WhatsApp. Remova a pasta auth_state e escaneie o QR novamente.');
      }
    }

    if (connection === 'open') {
      connectionReady = true;
      logger.info('WhatsApp conectado com sucesso!');
      if (onConnected) onConnected();
    }
  });

  // Salvar credenciais quando atualizadas
  socket.ev.on('creds.update', saveCreds);

  // Evento de mensagens recebidas
  socket.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;

    for (const msg of messages) {
      // Ignorar mensagens proprias
      if (msg.key.fromMe) continue;

      // Ignorar mensagens de grupo
      if (msg.key.remoteJid?.endsWith('@g.us')) continue;

      // Ignorar status/stories
      if (msg.key.remoteJid === 'status@broadcast') continue;

      // Extrair texto da mensagem
      const text =
        msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text ||
        msg.message?.imageMessage?.caption ||
        msg.message?.videoMessage?.caption ||
        '';

      if (!msg.key.remoteJid) continue;

      // Detectar midia sem texto (audio, sticker, documento, etc.)
      if (!text) {
        const msgType = Object.keys(msg.message || {})[0] || '';
        const MEDIA_TYPES = ['audioMessage', 'pttMessage', 'stickerMessage', 'documentMessage', 'documentWithCaptionMessage'];
        if (MEDIA_TYPES.includes(msgType)) {
          onMessage(msg.key.remoteJid, '__media__');
        }
        continue;
      }

      // Despachar para handler
      onMessage(msg.key.remoteJid, text.trim());
    }
  });

  return socket;
}

/**
 * Retorna o socket do WhatsApp
 */
export function getSocket(): WASocket | null {
  return socket;
}

/**
 * Verifica se a conexao esta pronta
 */
export function isConnected(): boolean {
  return connectionReady;
}
