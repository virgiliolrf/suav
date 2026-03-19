import { PrismaClient } from '@prisma/client';
import { addMinutes, addHours } from 'date-fns';
import { formatDateBR, formatTime } from '../utils/date';
import { phoneToJid } from '../utils/phone';
import { logger } from '../utils/logger';
import { getSendMessageFunction } from './notification';

const prisma = new PrismaClient();

/**
 * Envia lembretes automaticos de agendamento:
 * - 24h antes: lembrete do dia seguinte
 * - 1h antes: lembrete de ultima hora
 *
 * Chamado a cada 15 minutos pelo cron job.
 */
export async function sendAppointmentReminders(): Promise<void> {
  const sendFn = getSendMessageFunction();
  if (!sendFn) {
    logger.warn('WhatsApp nao conectado, lembretes nao enviados');
    return;
  }

  const now = new Date();

  try {
    // === LEMBRETE 24H ===
    // Janela de 16 minutos (cron roda a cada 15 min, margem de 1 min)
    const window24hStart = addMinutes(addHours(now, 23), 52);
    const window24hEnd = addMinutes(addHours(now, 24), 8);

    const appointments24h = await prisma.appointment.findMany({
      where: {
        status: 'CONFIRMED',
        reminded24h: false,
        dateTime: {
          gte: window24hStart,
          lte: window24hEnd,
        },
      },
      include: {
        client: true,
        service: true,
        professional: true,
      },
    });

    for (const apt of appointments24h) {
      const clientName = apt.client.name;
      const greeting = clientName ? `Oi, ${clientName}!` : 'Oi!';

      const message = [
        `${greeting} Só passando pra lembrar do seu agendamento amanhã 😊`,
        ``,
        `✨ ${apt.service.name} com ${apt.professional.name}`,
        `📅 ${formatDateBR(apt.dateTime)}, às ${formatTime(apt.dateTime)}`,
        `📍 R. Goiânia, 234 - loja 08 - Itapoã, Vila Velha - ES`,
        ``,
        `Qualquer dúvida é só chamar!`,
      ].join('\n');

      try {
        const jid = phoneToJid(apt.client.phone);
        await sendFn(jid, message);
        await prisma.appointment.update({
          where: { id: apt.id },
          data: { reminded24h: true },
        });
        logger.info({
          msg: 'Lembrete 24h enviado',
          appointmentId: apt.id,
          client: apt.client.phone,
        });
      } catch (error) {
        logger.error({ msg: 'Erro ao enviar lembrete 24h', appointmentId: apt.id, error });
      }
    }

    // === LEMBRETE 1H ===
    // Janela de 16 minutos (cron roda a cada 15 min, margem de 1 min)
    const window1hStart = addMinutes(now, 52);
    const window1hEnd = addMinutes(now, 68);

    const appointments1h = await prisma.appointment.findMany({
      where: {
        status: 'CONFIRMED',
        reminded1h: false,
        dateTime: {
          gte: window1hStart,
          lte: window1hEnd,
        },
      },
      include: {
        client: true,
        service: true,
        professional: true,
      },
    });

    for (const apt of appointments1h) {
      const clientName = apt.client.name;
      const greeting = clientName ? `Oi, ${clientName}!` : 'Oi!';

      const message = [
        `${greeting} Seu horário é daqui a pouco ⏰`,
        ``,
        `✨ ${apt.service.name} com ${apt.professional.name} às ${formatTime(apt.dateTime)}`,
        `📍 R. Goiânia, 234 - loja 08 - Itapoã, Vila Velha`,
        ``,
        `Te esperamos! 💅`,
      ].join('\n');

      try {
        const jid = phoneToJid(apt.client.phone);
        await sendFn(jid, message);
        await prisma.appointment.update({
          where: { id: apt.id },
          data: { reminded1h: true },
        });
        logger.info({
          msg: 'Lembrete 1h enviado',
          appointmentId: apt.id,
          client: apt.client.phone,
        });
      } catch (error) {
        logger.error({ msg: 'Erro ao enviar lembrete 1h', appointmentId: apt.id, error });
      }
    }

    if (appointments24h.length > 0 || appointments1h.length > 0) {
      logger.info({
        msg: 'Lembretes enviados',
        count24h: appointments24h.length,
        count1h: appointments1h.length,
      });
    }

  } catch (error) {
    logger.error({ msg: 'Erro ao processar lembretes', error });
  }
}
