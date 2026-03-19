import express from 'express';
import crypto from 'crypto';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import { handleIncomingMessage } from '../channels/handler';
import { instagramSender } from './sender';

const app = express();

// Parse JSON body (com raw body para verificacao de assinatura)
app.use(express.json({
  verify: (req: any, _res, buf) => {
    req.rawBody = buf;
  },
}));

/**
 * GET /webhook/instagram — Verificacao do webhook pelo Facebook
 */
app.get('/webhook/instagram', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === env.INSTAGRAM_VERIFY_TOKEN) {
    logger.info('Instagram webhook verificado com sucesso');
    res.status(200).send(challenge);
  } else {
    logger.warn({ msg: 'Instagram webhook verificacao falhou', mode, token });
    res.sendStatus(403);
  }
});

/**
 * POST /webhook/instagram — Recebe mensagens e eventos do Instagram
 */
app.post('/webhook/instagram', async (req: any, res) => {
  // Responder 200 imediatamente (Instagram espera resposta rapida)
  res.sendStatus(200);

  // Verificar assinatura (se APP_SECRET configurado)
  if (env.INSTAGRAM_APP_SECRET && req.rawBody) {
    const signature = req.headers['x-hub-signature-256'];
    if (signature) {
      const expectedSig = 'sha256=' + crypto
        .createHmac('sha256', env.INSTAGRAM_APP_SECRET)
        .update(req.rawBody)
        .digest('hex');

      if (signature !== expectedSig) {
        logger.warn('Instagram webhook assinatura invalida');
        return;
      }
    }
  }

  try {
    const body = req.body;

    // Verificar se e evento do Instagram Messaging
    if (body.object !== 'instagram') return;

    for (const entry of body.entry || []) {
      for (const event of entry.messaging || []) {
        // Ignorar echo (mensagens que nos mesmos enviamos)
        if (event.message?.is_echo) continue;

        const senderId = event.sender?.id;
        if (!senderId) continue;

        // Responder a midia/anexos com mensagem amigavel
        if (!event.message?.text) {
          if (event.message?.attachments?.length > 0) {
            instagramSender.sendText(senderId, 'Oi! Recebi sua mídia, mas por enquanto só consigo responder texto por aqui 😊\nPode me contar o que precisa em texto?').catch(() => {});
          }
          continue;
        }

        const text = event.message.text;
        if (!text) continue;

        logger.info({
          msg: 'Mensagem Instagram recebida',
          senderId,
          text: text.substring(0, 100),
        });

        // Processar mensagem no handler unificado
        handleIncomingMessage({
          channel: 'instagram',
          senderId,
          igsid: senderId,
          text: text.trim(),
        }, instagramSender).catch(err => {
          logger.error({ msg: 'Erro ao processar mensagem Instagram', err });
        });
      }
    }
  } catch (error) {
    logger.error({ msg: 'Erro ao processar webhook Instagram', error });
  }
});

/**
 * Health check
 */
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', channels: ['whatsapp', 'instagram'] });
});

/**
 * Inicializa o servidor HTTP para webhooks do Instagram
 */
export function initInstagram(): Promise<void> {
  return new Promise((resolve) => {
    const port = parseInt(env.INSTAGRAM_WEBHOOK_PORT || '3000');

    app.listen(port, () => {
      logger.info(`Instagram webhook server rodando na porta ${port}`);
      logger.info(`Webhook URL: http://localhost:${port}/webhook/instagram`);
      logger.info(`Health check: http://localhost:${port}/health`);
      resolve();
    });
  });
}

export { app };
