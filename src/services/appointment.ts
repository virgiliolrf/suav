import { PrismaClient } from '@prisma/client';
import { addMinutes } from 'date-fns';
import { createDateTime, formatDateTimeBR, formatTime } from '../utils/date';
import { logger } from '../utils/logger';
import { getOrCreateClient } from './client';
import { checkProfessionalAvailability } from './professional';
import { searchServices, findProfessional } from './catalog';

const prisma = new PrismaClient();

export interface BookResult {
  success: boolean;
  appointmentId?: number;
  message: string;
  details?: {
    serviceName: string;
    professionalName: string;
    dateTime: string;
    endTime: string;
    price: number;
  };
}

/**
 * Cria um agendamento verificando conflitos
 */
export async function bookAppointment(params: {
  serviceId: number;
  professionalId: number;
  clientPhone: string;
  clientName?: string;
  date: string;  // YYYY-MM-DD
  time: string;  // HH:mm
}): Promise<BookResult> {
  const { serviceId, professionalId, clientPhone, clientName, date, time } = params;

  // Buscar servico
  const service = await prisma.service.findUnique({ where: { id: serviceId } });
  if (!service) {
    return { success: false, message: 'Servico nao encontrado' };
  }

  // Buscar profissional
  const professional = await prisma.professional.findUnique({ where: { id: professionalId } });
  if (!professional) {
    return { success: false, message: 'Profissional nao encontrada' };
  }

  // Verificar se profissional pode fazer o servico
  const canDo = await prisma.professionalService.findUnique({
    where: {
      professionalId_serviceId: { professionalId, serviceId },
    },
  });
  if (!canDo) {
    return {
      success: false,
      message: `${professional.name} nao realiza o servico ${service.name}`,
    };
  }

  // Verificar disponibilidade
  const availability = await checkProfessionalAvailability(
    professionalId,
    date,
    time,
    service.durationMinutes
  );

  if (!availability.available) {
    return {
      success: false,
      message: availability.reason || 'Horario indisponivel',
    };
  }

  // Criar cliente
  const client = await getOrCreateClient(clientPhone, clientName);

  // Criar agendamento
  const startDateTime = createDateTime(date, time);
  const endDateTime = addMinutes(startDateTime, service.durationMinutes);

  const appointment = await prisma.appointment.create({
    data: {
      clientId: client.id,
      serviceId,
      professionalId,
      dateTime: startDateTime,
      endTime: endDateTime,
      status: 'CONFIRMED',
      notifiedEmployee: false,
      priceAtBooking: service.price,
    },
  });

  // Salvar profissional preferida da cliente
  await prisma.client.update({
    where: { id: client.id },
    data: { preferredProfessional: professional.name },
  });

  logger.info({
    msg: 'Agendamento criado',
    appointmentId: appointment.id,
    service: service.name,
    professional: professional.name,
    dateTime: startDateTime.toISOString(),
  });

  return {
    success: true,
    appointmentId: appointment.id,
    message: 'Agendamento confirmado!',
    details: {
      serviceName: service.name,
      professionalName: professional.name,
      dateTime: formatDateTimeBR(startDateTime),
      endTime: formatTime(endDateTime),
      price: service.price,
    },
  };
}

/**
 * Cria agendamento usando NOMES (fuzzy matching) em vez de IDs
 * Resolve o problema do LLM inventar IDs entre turnos de conversa
 */
export async function bookAppointmentByName(params: {
  serviceName: string;
  professionalName: string;
  clientPhone: string;
  clientName?: string;
  date: string;
  time: string;
}): Promise<BookResult> {
  const { serviceName, professionalName, clientPhone, clientName, date, time } = params;

  // Buscar servico por nome (fuzzy)
  const services = await searchServices(serviceName, 1);
  if (services.length === 0) {
    return { success: false, message: `Servico "${serviceName}" nao encontrado` };
  }
  const service = services[0];

  // Buscar profissional por nome (fuzzy)
  const professional = await findProfessional(professionalName);
  if (!professional) {
    return { success: false, message: `Profissional "${professionalName}" nao encontrada` };
  }

  // Delegar para bookAppointment com IDs corretos
  return bookAppointment({
    serviceId: service.id,
    professionalId: professional.id,
    clientPhone,
    clientName,
    date,
    time,
  });
}

/**
 * Cancela um agendamento
 */
export async function cancelAppointment(
  appointmentId: number,
  reason?: string
): Promise<{ success: boolean; message: string }> {
  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: { service: true, professional: true },
  });

  if (!appointment) {
    return { success: false, message: 'Agendamento nao encontrado' };
  }

  if (appointment.status === 'CANCELLED') {
    return { success: false, message: 'Este agendamento já foi cancelado' };
  }

  if (appointment.dateTime < new Date()) {
    return { success: false, message: 'Não é possível cancelar um agendamento que já passou' };
  }

  await prisma.appointment.update({
    where: { id: appointmentId },
    data: {
      status: 'CANCELLED',
      cancelledAt: new Date(),
      cancelReason: reason || 'Cancelado pela cliente',
    },
  });

  logger.info({ msg: 'Agendamento cancelado', appointmentId });

  return {
    success: true,
    message: `Agendamento de ${appointment.service.name} com ${appointment.professional.name} foi cancelado`,
  };
}

/**
 * Reagenda um agendamento para nova data/hora
 */
export async function rescheduleAppointment(
  appointmentId: number,
  newDate: string,
  newTime: string
): Promise<BookResult> {
  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: { service: true, professional: true, client: true },
  });

  if (!appointment) {
    return { success: false, message: 'Agendamento nao encontrado' };
  }

  if (appointment.status === 'CANCELLED') {
    return { success: false, message: 'Nao e possivel reagendar um agendamento cancelado' };
  }

  // Verificar disponibilidade no novo horario
  const availability = await checkProfessionalAvailability(
    appointment.professionalId,
    newDate,
    newTime,
    appointment.service.durationMinutes
  );

  if (!availability.available) {
    return {
      success: false,
      message: availability.reason || 'Novo horario indisponivel',
    };
  }

  const newStart = createDateTime(newDate, newTime);
  const newEnd = addMinutes(newStart, appointment.service.durationMinutes);

  // Cancelar o antigo e criar novo
  await prisma.appointment.update({
    where: { id: appointmentId },
    data: {
      status: 'CANCELLED',
      cancelledAt: new Date(),
      cancelReason: 'Reagendado',
    },
  });

  const newAppointment = await prisma.appointment.create({
    data: {
      clientId: appointment.clientId,
      serviceId: appointment.serviceId,
      professionalId: appointment.professionalId,
      dateTime: newStart,
      endTime: newEnd,
      status: 'CONFIRMED',
      notifiedEmployee: false,
      priceAtBooking: appointment.priceAtBooking ?? appointment.service.price,
    },
  });

  logger.info({
    msg: 'Agendamento reagendado',
    oldId: appointmentId,
    newId: newAppointment.id,
  });

  return {
    success: true,
    appointmentId: newAppointment.id,
    message: 'Agendamento reagendado com sucesso!',
    details: {
      serviceName: appointment.service.name,
      professionalName: appointment.professional.name,
      dateTime: formatDateTimeBR(newStart),
      endTime: formatTime(newEnd),
      price: Number(appointment.service.price),
    },
  };
}

/**
 * Lista agendamentos de um cliente
 */
export async function getClientAppointments(
  clientPhone: string,
  status?: string
): Promise<any[]> {
  const client = await prisma.client.findUnique({
    where: { phone: clientPhone },
  });

  if (!client) return [];

  const where: any = { clientId: client.id };
  if (status) {
    where.status = status;
  } else {
    where.status = { in: ['CONFIRMED', 'PENDING'] };
    // Só mostrar agendamentos futuros (não passados)
    where.dateTime = { gte: new Date() };
  }

  const appointments = await prisma.appointment.findMany({
    where,
    include: {
      service: true,
      professional: true,
    },
    orderBy: { dateTime: 'asc' },
  });

  return appointments.map((apt) => ({
    id: apt.id,
    serviceName: apt.service.name,
    servicePrice: Number(apt.service.price),
    professionalName: apt.professional.name,
    dateTime: formatDateTimeBR(apt.dateTime),
    endTime: formatTime(apt.endTime),
    status: apt.status,
    rawDateTime: apt.dateTime,
  }));
}
