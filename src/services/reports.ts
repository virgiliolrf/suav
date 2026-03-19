import { PrismaClient } from '@prisma/client';
import { format, startOfDay, endOfDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { formatPhone } from '../utils/phone';
import { logger } from '../utils/logger';

const prisma = new PrismaClient();

/**
 * Gera relatorio de um agendamento individual para a gerente
 * Enviado toda vez que um agendamento e criado, cancelado ou reagendado
 */
export async function generateBookingReport(
  appointmentId: number,
  action: 'novo' | 'cancelado' | 'reagendado'
): Promise<string> {
  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: {
      service: { include: { category: true } },
      professional: true,
      client: true,
    },
  });

  if (!appointment) return '';

  const clientName = appointment.client.name || 'Sem nome';
  const clientPhone = formatPhone(appointment.client.phone);
  const dateStr = format(appointment.dateTime, "EEEE, d 'de' MMMM", { locale: ptBR });
  const startTime = format(appointment.dateTime, 'HH:mm');
  const endTime = format(appointment.endTime, 'HH:mm');
  const price = appointment.service.price.toFixed(2).replace('.', ',');

  const icons: Record<string, string> = {
    novo: '📋 NOVO AGENDAMENTO',
    cancelado: '❌ AGENDAMENTO CANCELADO',
    reagendado: '🔄 AGENDAMENTO REAGENDADO',
  };

  const header = icons[action];

  const lines = [
    header,
    '',
    `Cliente: ${clientName} (${clientPhone})`,
    `Servico: ${appointment.service.name}`,
    `Categoria: ${appointment.service.category.name}`,
    `Profissional: ${appointment.professional.name}`,
    `Data: ${dateStr}`,
    `Horario: ${startTime} as ${endTime}`,
    `Valor: R$ ${price}`,
  ];

  if (action === 'cancelado' && appointment.cancelReason) {
    lines.push(`Motivo: ${appointment.cancelReason}`);
  }

  // Contar agendamentos do dia
  const dayStart = startOfDay(appointment.dateTime);
  const dayEnd = endOfDay(appointment.dateTime);
  const dayCount = await prisma.appointment.count({
    where: {
      dateTime: { gte: dayStart, lte: dayEnd },
      status: { in: ['CONFIRMED', 'PENDING'] },
    },
  });

  lines.push('');
  lines.push(`Total de agendamentos no dia: ${dayCount}`);

  return lines.join('\n');
}

/**
 * Gera relatorio diario de vendas completo
 * Enviado no fim do expediente automaticamente
 */
export async function generateDailyReport(date?: Date): Promise<string> {
  const targetDate = date || new Date();
  const dayStart = startOfDay(targetDate);
  const dayEnd = endOfDay(targetDate);
  const dateStr = format(targetDate, "EEEE, d 'de' MMMM 'de' yyyy", { locale: ptBR });

  const appointments = await prisma.appointment.findMany({
    where: {
      dateTime: { gte: dayStart, lte: dayEnd },
    },
    include: {
      service: { include: { category: true } },
      professional: true,
      client: true,
    },
    orderBy: { dateTime: 'asc' },
  });

  const confirmed = appointments.filter(a => a.status === 'CONFIRMED' || a.status === 'COMPLETED');
  const cancelled = appointments.filter(a => a.status === 'CANCELLED');
  const noShow = appointments.filter(a => a.status === 'NO_SHOW');

  // Faturamento total
  const totalRevenue = confirmed.reduce((sum, a) => sum + a.service.price, 0);

  // Por profissional
  const profMap = new Map<string, { count: number; revenue: number; services: string[] }>();
  for (const apt of confirmed) {
    const name = apt.professional.name;
    const data = profMap.get(name) || { count: 0, revenue: 0, services: [] };
    data.count += 1;
    data.revenue += apt.service.price;
    data.services.push(apt.service.name);
    profMap.set(name, data);
  }

  // Por categoria
  const catMap = new Map<string, { count: number; revenue: number }>();
  for (const apt of confirmed) {
    const name = apt.service.category.name;
    const data = catMap.get(name) || { count: 0, revenue: 0 };
    data.count += 1;
    data.revenue += apt.service.price;
    catMap.set(name, data);
  }

  // Montar relatorio
  const lines: string[] = [];

  lines.push('📊 RELATORIO DIARIO DE VENDAS');
  lines.push(`📅 ${dateStr}`);
  lines.push('');

  // Resumo geral
  lines.push('RESUMO');
  lines.push(`Agendamentos confirmados: ${confirmed.length}`);
  lines.push(`Cancelamentos: ${cancelled.length}`);
  if (noShow.length > 0) lines.push(`Nao compareceram: ${noShow.length}`);
  lines.push(`Faturamento do dia: R$ ${totalRevenue.toFixed(2).replace('.', ',')}`);
  lines.push('');

  // Detalhamento por profissional
  if (profMap.size > 0) {
    lines.push('POR PROFISSIONAL');
    const sortedProfs = Array.from(profMap.entries()).sort((a, b) => b[1].revenue - a[1].revenue);
    for (const [name, data] of sortedProfs) {
      lines.push(`${name}: ${data.count} atendimento${data.count > 1 ? 's' : ''} | R$ ${data.revenue.toFixed(2).replace('.', ',')}`);
    }
    lines.push('');
  }

  // Detalhamento por categoria
  if (catMap.size > 0) {
    lines.push('POR CATEGORIA');
    const sortedCats = Array.from(catMap.entries()).sort((a, b) => b[1].revenue - a[1].revenue);
    for (const [name, data] of sortedCats) {
      lines.push(`${name}: ${data.count} | R$ ${data.revenue.toFixed(2).replace('.', ',')}`);
    }
    lines.push('');
  }

  // Lista completa de agendamentos
  if (confirmed.length > 0) {
    lines.push('AGENDAMENTOS DO DIA');
    for (const apt of confirmed) {
      const time = format(apt.dateTime, 'HH:mm');
      const clientName = apt.client.name || formatPhone(apt.client.phone);
      const price = apt.service.price.toFixed(2).replace('.', ',');
      lines.push(`${time} | ${apt.professional.name} | ${apt.service.name} | ${clientName} | R$ ${price}`);
    }
    lines.push('');
  }

  // Cancelamentos
  if (cancelled.length > 0) {
    lines.push('CANCELAMENTOS');
    for (const apt of cancelled) {
      const time = format(apt.dateTime, 'HH:mm');
      const clientName = apt.client.name || formatPhone(apt.client.phone);
      lines.push(`${time} | ${apt.professional.name} | ${apt.service.name} | ${clientName}`);
    }
    lines.push('');
  }

  // Se nao teve nenhum agendamento
  if (appointments.length === 0) {
    lines.push('Nenhum agendamento registrado hoje.');
  }

  return lines.join('\n');
}
