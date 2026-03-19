import { PrismaClient } from '@prisma/client';
import { addMinutes } from 'date-fns';
import { generateTimeSlots, createDateTime, formatDateTimeBR, formatTime } from '../utils/date';
import { normalizePhone } from '../utils/phone';
import { logger } from '../utils/logger';

const prisma = new PrismaClient();

/**
 * Verifica se profissional esta disponivel num horario especifico
 */
export async function checkProfessionalAvailability(
  professionalId: number,
  date: string,  // YYYY-MM-DD
  time: string,  // HH:mm
  durationMinutes: number
): Promise<{
  available: boolean;
  reason?: string;
  conflictWith?: string;
}> {
  const startDateTime = createDateTime(date, time);
  const endDateTime = addMinutes(startDateTime, durationMinutes);
  const dayOfWeek = startDateTime.getDay();

  // 1. Verificar se a profissional trabalha nesse dia
  const schedule = await prisma.workSchedule.findUnique({
    where: {
      professionalId_dayOfWeek: {
        professionalId,
        dayOfWeek,
      },
    },
  });

  if (!schedule || !schedule.isWorking) {
    return { available: false, reason: 'A profissional nao trabalha nesse dia' };
  }

  // 2. Verificar se horario esta dentro do expediente
  if (time < schedule.startTime) {
    return {
      available: false,
      reason: `O expediente comeca as ${schedule.startTime}`,
    };
  }

  const endTime = `${endDateTime.getHours().toString().padStart(2, '0')}:${endDateTime.getMinutes().toString().padStart(2, '0')}`;
  if (endTime > schedule.endTime) {
    return {
      available: false,
      reason: `O servico terminaria as ${endTime}, mas o expediente vai ate ${schedule.endTime}`,
    };
  }

  // 3. Verificar conflitos com outros agendamentos
  const conflicts = await prisma.appointment.findMany({
    where: {
      professionalId,
      status: { in: ['CONFIRMED', 'PENDING', 'BLOCKED'] },
      dateTime: { lt: endDateTime },
      endTime: { gt: startDateTime },
    },
    include: {
      service: true,
      client: true,
    },
  });

  if (conflicts.length > 0) {
    const conflict = conflicts[0];
    const conflictTime = `${conflict.dateTime.getHours().toString().padStart(2, '0')}:${conflict.dateTime.getMinutes().toString().padStart(2, '0')}`;
    return {
      available: false,
      reason: `Ja tem um agendamento nesse horario (${conflict.service.name} as ${conflictTime})`,
      conflictWith: conflict.service.name,
    };
  }

  return { available: true };
}

/**
 * Lista horarios disponiveis de uma profissional num dia
 */
export async function getAvailableSlots(
  professionalId: number,
  date: string, // YYYY-MM-DD
  durationMinutes: number = 30
): Promise<string[]> {
  const dateObj = new Date(date + 'T00:00:00');
  const dayOfWeek = dateObj.getDay();

  // Buscar horario de trabalho
  const schedule = await prisma.workSchedule.findUnique({
    where: {
      professionalId_dayOfWeek: {
        professionalId,
        dayOfWeek,
      },
    },
  });

  if (!schedule || !schedule.isWorking) return [];

  // Gerar todos os slots possiveis
  const allSlots = generateTimeSlots(dayOfWeek, 30);

  // Buscar agendamentos existentes no dia
  const dayStart = createDateTime(date, '00:00');
  const dayEnd = createDateTime(date, '23:59');

  const appointments = await prisma.appointment.findMany({
    where: {
      professionalId,
      status: { in: ['CONFIRMED', 'PENDING', 'BLOCKED'] },
      dateTime: { gte: dayStart, lte: dayEnd },
    },
  });

  // Filtrar slots que nao conflitam
  const availableSlots: string[] = [];

  for (const slot of allSlots) {
    const slotStart = createDateTime(date, slot);
    const slotEnd = addMinutes(slotStart, durationMinutes);

    // Verificar se o slot + duracao cabe no expediente
    const slotEndTime = `${slotEnd.getHours().toString().padStart(2, '0')}:${slotEnd.getMinutes().toString().padStart(2, '0')}`;
    if (slotEndTime > schedule.endTime) continue;

    // Verificar conflito com agendamentos
    const hasConflict = appointments.some((apt) => {
      return slotStart < apt.endTime && slotEnd > apt.dateTime;
    });

    if (!hasConflict) {
      // Se a data e hoje, so mostrar horarios futuros
      const now = new Date();
      if (dateObj.toDateString() === now.toDateString() && slotStart <= now) continue;

      availableSlots.push(slot);
    }
  }

  return availableSlots;
}

/**
 * Busca profissional pelo telefone
 */
export async function getProfessionalByPhone(phone: string): Promise<{
  id: number;
  name: string;
} | null> {
  const normalized = normalizePhone(phone);

  // Buscar todas as profissionais ativas com telefone
  const professionals = await prisma.professional.findMany({
    where: { active: true, phone: { not: null } },
  });

  for (const prof of professionals) {
    if (!prof.phone) continue;
    const profNorm = normalizePhone(prof.phone);

    // Match exato
    if (normalized === profNorm) return { id: prof.id, name: prof.name };

    // Match sem country code
    const phoneLocal = normalized.startsWith('55') ? normalized.slice(2) : normalized;
    const profLocal = profNorm.startsWith('55') ? profNorm.slice(2) : profNorm;
    if (phoneLocal === profLocal) return { id: prof.id, name: prof.name };

    // Match com/sem 9o digito
    if (phoneLocal.length === 11 && profLocal.length === 10) {
      if (phoneLocal.slice(0, 2) + phoneLocal.slice(3) === profLocal) return { id: prof.id, name: prof.name };
    } else if (phoneLocal.length === 10 && profLocal.length === 11) {
      if (profLocal.slice(0, 2) + profLocal.slice(3) === phoneLocal) return { id: prof.id, name: prof.name };
    }
  }

  return null;
}

/**
 * Agenda do profissional para um dia específico
 */
export async function getProfessionalScheduleForDay(
  professionalId: number,
  date: string
): Promise<any[]> {
  const dayStart = createDateTime(date, '00:00');
  const dayEnd = createDateTime(date, '23:59');

  const appointments = await prisma.appointment.findMany({
    where: {
      professionalId,
      status: { in: ['CONFIRMED', 'PENDING', 'BLOCKED'] },
      dateTime: { gte: dayStart, lte: dayEnd },
    },
    include: {
      service: true,
      client: true,
    },
    orderBy: { dateTime: 'asc' },
  });

  return appointments.map(apt => ({
    id: apt.id,
    time: formatTime(apt.dateTime),
    endTime: formatTime(apt.endTime),
    service: apt.service.name,
    client: apt.client.name || 'Cliente',
    clientPhone: apt.client.phone,
    price: Number(apt.service.price),
    status: apt.status,
  }));
}

/**
 * Bloqueia um horário de uma profissional (agendamento externo, intervalo, etc)
 */
export async function blockTimeSlot(params: {
  professionalId: number;
  date: string;
  time: string;
  durationMinutes: number;
  reason?: string;
}): Promise<{ success: boolean; message: string; blockId?: number }> {
  const { professionalId, date, time, durationMinutes, reason } = params;

  const professional = await prisma.professional.findUnique({ where: { id: professionalId } });
  if (!professional) return { success: false, message: 'Profissional não encontrada' };

  // Verificar disponibilidade
  const availability = await checkProfessionalAvailability(professionalId, date, time, durationMinutes);
  if (!availability.available) {
    return { success: false, message: `Horário indisponível: ${availability.reason}` };
  }

  const startDateTime = createDateTime(date, time);
  const endDateTime = addMinutes(startDateTime, durationMinutes);

  // Criar cliente fictício para bloqueio ou usar existente
  let blockClient = await prisma.client.findUnique({ where: { phone: '0000000000' } });
  if (!blockClient) {
    blockClient = await prisma.client.create({
      data: { phone: '0000000000', name: 'BLOQUEIO' },
    });
  }

  // Buscar primeiro serviço disponível (para satisfazer FK)
  const anyService = await prisma.service.findFirst();
  if (!anyService) return { success: false, message: 'Nenhum serviço cadastrado' };

  const appointment = await prisma.appointment.create({
    data: {
      clientId: blockClient.id,
      serviceId: anyService.id,
      professionalId,
      dateTime: startDateTime,
      endTime: endDateTime,
      status: 'BLOCKED',
      notes: reason || 'Horário bloqueado pela gerência',
      notifiedEmployee: true,
      priceAtBooking: 0,
    },
  });

  logger.info({ msg: 'Horário bloqueado', professionalId, date, time, reason });

  return {
    success: true,
    message: `Horário bloqueado: ${professional.name} ${date} às ${time} (${durationMinutes}min)`,
    blockId: appointment.id,
  };
}

/**
 * Desbloqueia um horário
 */
export async function unblockTimeSlot(blockId: number): Promise<{ success: boolean; message: string }> {
  const appointment = await prisma.appointment.findUnique({
    where: { id: blockId },
    include: { professional: true },
  });

  if (!appointment) return { success: false, message: 'Bloqueio não encontrado' };
  if (appointment.status !== 'BLOCKED') return { success: false, message: 'Esse agendamento não é um bloqueio' };

  await prisma.appointment.update({
    where: { id: blockId },
    data: { status: 'CANCELLED', cancelledAt: new Date(), cancelReason: 'Desbloqueado' },
  });

  return { success: true, message: `Horário desbloqueado: ${appointment.professional.name} ${formatDateTimeBR(appointment.dateTime)}` };
}
