import { PrismaClient } from '@prisma/client';
import { addMinutes } from 'date-fns';
import { generateTimeSlots, createDateTime } from '../utils/date';

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
      status: { in: ['CONFIRMED', 'PENDING'] },
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
      status: { in: ['CONFIRMED', 'PENDING'] },
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
