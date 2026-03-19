import { initWhatsApp } from './whatsapp/client';
import { handleMessage } from './whatsapp/handler';
import { sendText } from './whatsapp/sender';
import { setSendMessageFunction, sendDailyReport, sendStartupNotification } from './services/notification';
import { sendAppointmentReminders } from './services/reminder';
import { cleanupInactiveConversations } from './conversation/manager';
import { initInstagram } from './instagram/client';
import { logger } from './utils/logger';
import { env } from './config/env';
import cron from 'node-cron';

async function main() {
  logger.info('===========================================');
  logger.info('   SUAV Bot — WhatsApp + Instagram');
  logger.info('===========================================');
  logger.info('Inicializando...');

  // Validar configuracoes essenciais
  if (!env.GEMINI_API_KEY) {
    logger.error('GEMINI_API_KEY nao configurada no .env');
    process.exit(1);
  }

  // Registrar funcao de envio de mensagem para notificacoes (via WhatsApp)
  setSendMessageFunction(async (jid: string, text: string) => {
    await sendText(jid, text);
  });

  // === INICIALIZAR WHATSAPP ===
  logger.info('Conectando ao WhatsApp...');
  let startupNotified = false;
  await initWhatsApp((jid: string, text: string) => {
    handleMessage(jid, text);
  }, () => {
    // Enviar notificacao de inicio apenas na primeira conexao
    if (!startupNotified) {
      startupNotified = true;
      sendStartupNotification().catch(err =>
        logger.error({ msg: 'Erro ao enviar notificacao de inicio', err })
      );
    }
  });

  // === INICIALIZAR INSTAGRAM ===
  if (env.INSTAGRAM_ACCESS_TOKEN) {
    logger.info('Iniciando servidor Instagram webhook...');
    await initInstagram();
    logger.info('Instagram conectado!');
  } else {
    logger.info('Instagram nao configurado (INSTAGRAM_ACCESS_TOKEN vazio). Somente WhatsApp ativo.');
  }

  // === RELATORIO DIARIO AUTOMATICO ===
  // Seg-Sex as 19:05 (5 min apos fechar)
  cron.schedule('5 19 * * 1-5', () => {
    logger.info('Enviando relatorio diario (seg-sex)...');
    sendDailyReport().catch(err => logger.error({ msg: 'Erro no relatorio diario', err }));
  }, { timezone: 'America/Sao_Paulo' });

  // Sabado as 17:05 (5 min apos fechar)
  cron.schedule('5 17 * * 6', () => {
    logger.info('Enviando relatorio diario (sabado)...');
    sendDailyReport().catch(err => logger.error({ msg: 'Erro no relatorio diario', err }));
  }, { timezone: 'America/Sao_Paulo' });

  logger.info('Relatorio diario agendado: Seg-Sex 19:05 | Sab 17:05');

  // === LEMBRETES AUTOMATICOS ===
  // Roda a cada 15 minutos para verificar agendamentos proximos (24h e 1h antes)
  cron.schedule('*/15 * * * *', () => {
    sendAppointmentReminders().catch(err => logger.error({ msg: 'Erro ao enviar lembretes', err }));
  }, { timezone: 'America/Sao_Paulo' });

  logger.info('Lembretes automaticos agendados: a cada 15 minutos');

  // Limpeza periodica de conversas inativas (a cada 30 min)
  setInterval(() => {
    cleanupInactiveConversations();
  }, 30 * 60 * 1000);

  // Graceful shutdown
  process.on('SIGINT', () => {
    logger.info('Desligando bot...');
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    logger.info('Desligando bot...');
    process.exit(0);
  });

  process.on('unhandledRejection', (reason) => {
    logger.error({ msg: 'Unhandled rejection', reason });
  });

  logger.info('Bot pronto! Canais ativos: WhatsApp' + (env.INSTAGRAM_ACCESS_TOKEN ? ' + Instagram' : ''));
}

main().catch((error) => {
  logger.error({ msg: 'Erro fatal', error });
  process.exit(1);
});
