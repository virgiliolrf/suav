import { PrismaClient } from '@prisma/client';
import { formatDateTimeBR, formatTime } from '../utils/date';
import { formatPhone, phoneToJid } from '../utils/phone';
import { logger } from '../utils/logger';
import { generateBookingReport, generateDailyReport } from './reports';

const prisma = new PrismaClient();

// Referencia para o socket do WhatsApp (setado no index.ts)
let sendMessageFn: ((jid: string, text: string) => Promise<void>) | null = null;

/**
 * Registra a funcao de envio de mensagem do WhatsApp
 */
export function setSendMessageFunction(fn: (jid: string, text: string) => Promise<void>) {
  sendMessageFn = fn;
}

/**
 * Retorna a funcao de envio (para uso em outros servicos, ex: reminder.ts)
 */
export function getSendMessageFunction(): ((jid: string, text: string) => Promise<void>) | null {
  return sendMessageFn;
}

/**
 * Busca telefones dos admins (gerente e dona)
 */
async function getAdminPhones(): Promise<string[]> {
  const admins = await prisma.adminUser.findMany();
  return admins.map(a => a.phone).filter(p => p && p.length > 0);
}

/**
 * Envia mensagem para todos os admins (gerente + dona)
 */
async function notifyAdmins(message: string): Promise<void> {
  if (!sendMessageFn) return;

  const phones = await getAdminPhones();
  for (const phone of phones) {
    try {
      const jid = phoneToJid(phone);
      await sendMessageFn(jid, message);
    } catch (error) {
      logger.error({ msg: 'Erro ao notificar admin', phone, error });
    }
  }
}

/**
 * Notifica a funcionaria e a gerente sobre um novo agendamento
 */
export async function notifyProfessional(appointmentId: number): Promise<boolean> {
  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: {
      service: true,
      professional: true,
      client: true,
    },
  });

  if (!appointment) {
    logger.error({ msg: 'Agendamento nao encontrado para notificacao', appointmentId });
    return false;
  }

  const clientName = appointment.client.name || formatPhone(appointment.client.phone);

  const messageForEmployee = [
    `Nova cliente agendada! ✨`,
    ``,
    `Servico: ${appointment.service.name}`,
    `Cliente: ${clientName} (${formatPhone(appointment.client.phone)})`,
    `Data: ${formatDateTimeBR(appointment.dateTime)}`,
    `Horario: ${formatTime(appointment.dateTime)} as ${formatTime(appointment.endTime)}`,
    `Valor: R$ ${appointment.service.price.toFixed(2).replace('.', ',')}`,
  ].join('\n');

  // 1. Notificar funcionaria
  if (sendMessageFn && appointment.professional.phone) {
    try {
      const jid = phoneToJid(appointment.professional.phone);
      await sendMessageFn(jid, messageForEmployee);

      await prisma.appointment.update({
        where: { id: appointmentId },
        data: { notifiedEmployee: true },
      });

      logger.info({
        msg: 'Funcionaria notificada',
        professional: appointment.professional.name,
        appointmentId,
      });
    } catch (error) {
      logger.error({
        msg: 'Erro ao notificar funcionaria',
        error,
        professional: appointment.professional.name,
      });
    }
  }

  // 2. Enviar relatorio para a gerente
  try {
    const report = await generateBookingReport(appointmentId, 'novo');
    if (report) {
      await notifyAdmins(report);
      logger.info({ msg: 'Relatorio de agendamento enviado para gerencia', appointmentId });
    }
  } catch (error) {
    logger.error({ msg: 'Erro ao enviar relatorio para gerencia', error });
  }

  return true;
}

/**
 * Notifica sobre cancelamento (funcionaria + gerente)
 */
export async function notifyCancellation(appointmentId: number): Promise<boolean> {
  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: {
      service: true,
      professional: true,
      client: true,
    },
  });

  if (!appointment) return false;

  const clientName = appointment.client.name || formatPhone(appointment.client.phone);

  const message = [
    `Agendamento cancelado ❌`,
    ``,
    `Servico: ${appointment.service.name}`,
    `Cliente: ${clientName}`,
    `Data: ${formatDateTimeBR(appointment.dateTime)}`,
  ].join('\n');

  // Notificar funcionaria
  if (sendMessageFn && appointment.professional.phone) {
    try {
      const jid = phoneToJid(appointment.professional.phone);
      await sendMessageFn(jid, message);
    } catch { /* ignora */ }
  }

  // Relatorio para gerente
  try {
    const report = await generateBookingReport(appointmentId, 'cancelado');
    if (report) await notifyAdmins(report);
  } catch { /* ignora */ }

  return true;
}

/**
 * Notifica sobre reagendamento (funcionaria + gerente)
 */
export async function notifyReschedule(appointmentId: number): Promise<boolean> {
  // Relatorio para gerente
  try {
    const report = await generateBookingReport(appointmentId, 'reagendado');
    if (report) await notifyAdmins(report);
  } catch { /* ignora */ }

  // Notifica funcionaria com detalhes do novo horario (reusa notifyProfessional)
  return notifyProfessional(appointmentId);
}

/**
 * Envia mensagem de inicializacao para gerente e todas as profissionais
 * Informa que o bot esta ativo e o que ele faz
 */
export async function sendStartupNotification(): Promise<void> {
  if (!sendMessageFn) {
    logger.warn('WhatsApp nao conectado, notificacao de inicio nao enviada');
    return;
  }

  const messageForProfessionals = [
    `Oi! Aqui é o assistente virtual da SUAV 💅`,
    ``,
    `A partir de agora, vou te avisar pelo WhatsApp sobre:`,
    ``,
    `✅ *Novos agendamentos* — com horário, serviço e valor`,
    `🔄 *Remarcações* — quando a cliente mudar o horário`,
    `❌ *Cancelamentos* — quando a cliente cancelar`,
    `⏰ *Lembretes* — 24h e 1h antes de cada atendimento`,
    ``,
    `Você não precisa fazer nada, as notificações chegam automaticamente!`,
    `Qualquer dúvida, fale com a gerente. Bom trabalho! 😊`,
  ].join('\n');

  // Buscar todas as profissionais com telefone
  const professionals = await prisma.professional.findMany({
    where: { active: true, phone: { not: null } },
  });

  // Enviar para cada profissional
  let sentCount = 0;
  for (const prof of professionals) {
    if (!prof.phone) continue;
    try {
      const jid = phoneToJid(prof.phone);
      await sendMessageFn(jid, messageForProfessionals);
      sentCount++;
      // Pequeno delay entre mensagens para não ser bloqueado
      await new Promise(r => setTimeout(r, 1500));
    } catch (error) {
      logger.error({ msg: 'Erro ao notificar profissional na inicializacao', professional: prof.name, error });
    }
  }

  logger.info({ msg: `Notificacao de inicio enviada para ${sentCount} profissionais` });

  // Atualizar mensagem admin com contagem real
  const adminMessage = [
    `Bot SUAV ativo e funcionando! 🤖✨`,
    ``,
    `O assistente virtual está online e pronto para:`,
    ``,
    `📱 *Atender clientes* — via WhatsApp (e Instagram se configurado)`,
    `📋 *Agendar horários* — automaticamente, verificando disponibilidade`,
    `💰 *Informar valores* — dos 101 serviços cadastrados`,
    `🔔 *Notificar profissionais* — sobre agendamentos, remarcações e cancelamentos`,
    `⏰ *Enviar lembretes* — 24h e 1h antes dos atendimentos`,
    `📊 *Relatório diário* — enviado automaticamente no fim do expediente`,
    ``,
    `✅ ${sentCount} profissionais notificadas com sucesso.`,
  ].join('\n');

  // Enviar para admins (gerente + dona)
  await notifyAdmins(adminMessage);
  logger.info({ msg: 'Notificacao de inicio enviada para admins' });
}

/**
 * Envia relatorio diario de vendas para gerente e dona
 * Chamado automaticamente no fim do expediente
 */
export async function sendDailyReport(date?: Date): Promise<void> {
  if (!sendMessageFn) {
    logger.warn('WhatsApp nao conectado, relatorio diario nao enviado');
    return;
  }

  try {
    const report = await generateDailyReport(date);
    await notifyAdmins(report);
    logger.info({ msg: 'Relatorio diario enviado para gerencia' });
  } catch (error) {
    logger.error({ msg: 'Erro ao enviar relatorio diario', error });
  }
}
