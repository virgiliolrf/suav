import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  WASocket,
  fetchLatestBaileysVersion,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import * as qrcodeTerminal from 'qrcode-terminal';
import QRCode from 'qrcode';
import http from 'http';
import { logger } from '../utils/logger';
import path from 'path';

let socket: WASocket | null = null;
let connectionReady = false;
let currentQR: string | null = null;
let qrServerStarted = false;

const DATA_DIR = process.env.DATA_DIR || process.cwd();
const AUTH_DIR = path.join(DATA_DIR, 'auth_state');
const QR_PORT = parseInt(process.env.QR_PORT || '4000', 10);

function startQRServer() {
  if (qrServerStarted) return;
  qrServerStarted = true;

  const server = http.createServer(async (req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');

    if (connectionReady) {
      res.writeHead(200);
      res.end('<html><body style="background:#111;color:#0f0;display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;font-size:2em">WhatsApp conectado! ✅</body></html>');
      return;
    }
    if (!currentQR) {
      res.writeHead(200);
      res.end('<html><head><meta http-equiv="refresh" content="3"></head><body style="background:#111;color:#fff;display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;font-size:1.5em">Aguardando QR code... ⏳<br>A pagina atualiza sozinha.</body></html>');
      return;
    }
    try {
      const qrDataUrl = await QRCode.toDataURL(currentQR, { width: 400, margin: 2 });
      res.writeHead(200);
      res.end(`<html><head><meta http-equiv="refresh" content="30"></head><body style="background:#111;color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;font-family:sans-serif"><h2>SUAV Bot - Escaneie o QR Code</h2><img src="${qrDataUrl}" style="border-radius:12px"/><p style="color:#888;margin-top:20px">Abra o WhatsApp > Aparelhos conectados > Conectar</p></body></html>`);
    } catch {
      res.writeHead(500);
      res.end('Erro ao gerar QR');
    }
  });

  server.listen(QR_PORT, '0.0.0.0', () => {
    logger.info({ msg: `Servidor QR code rodando na porta ${QR_PORT}` });
    logger.info({ msg: `Acesse o QR code no navegador: http://localhost:${QR_PORT}` });
  });

  server.on('error', (err) => {
    logger.error({ msg: 'Erro no servidor QR code', err });
  });
}

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
      currentQR = qr;
      console.log('\n========================================');
      console.log('  ESCANEIE O QR CODE COM O WHATSAPP');
      console.log('  Ou acesse no navegador: porta ' + QR_PORT);
      console.log('========================================\n');
      qrcodeTerminal.generate(qr, { small: true });
      startQRServer();
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
      currentQR = null;
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
