import { PrismaClient } from '@prisma/client';
import { startOfDay, endOfDay, startOfMonth, endOfMonth, subDays, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { formatPhone } from '../utils/phone';

const prisma = new PrismaClient();

/**
 * Análise de no-shows: quem faltou, frequência, prejuízo
 */
export async function queryNoShows(params: {
  startDate?: string;
  endDate?: string;
}): Promise<any> {
  const now = new Date();
  const start = params.startDate ? new Date(params.startDate + 'T00:00:00') : startOfMonth(now);
  const end = params.endDate ? new Date(params.endDate + 'T23:59:59') : endOfDay(now);

  const noShows = await prisma.appointment.findMany({
    where: {
      status: 'NO_SHOW',
      dateTime: { gte: start, lte: end },
    },
    include: { client: true, service: true, professional: true },
    orderBy: { dateTime: 'desc' },
  });

  if (noShows.length === 0) {
    return { found: false, message: 'Nenhum no-show no período.' };
  }

  const totalLost = noShows.reduce((sum, a) => sum + Number(a.priceAtBooking ?? a.service.price), 0);

  // Clientes reincidentes
  const clientCounts = new Map<string, { name: string; phone: string; count: number }>();
  for (const ns of noShows) {
    const key = ns.client.phone;
    const existing = clientCounts.get(key);
    if (existing) {
      existing.count++;
    } else {
      clientCounts.set(key, {
        name: ns.client.name || 'Sem nome',
        phone: formatPhone(ns.client.phone),
        count: 1,
      });
    }
  }

  const reincidentes = Array.from(clientCounts.values())
    .filter(c => c.count > 1)
    .sort((a, b) => b.count - a.count);

  return {
    found: true,
    total: noShows.length,
    totalLost: totalLost.toFixed(2),
    period: `${format(start, 'dd/MM')} a ${format(end, 'dd/MM')}`,
    reincidentes,
    list: noShows.slice(0, 10).map(ns => ({
      client: ns.client.name || formatPhone(ns.client.phone),
      service: ns.service.name,
      professional: ns.professional.name,
      date: format(ns.dateTime, 'dd/MM HH:mm'),
      value: Number(ns.priceAtBooking ?? ns.service.price).toFixed(2),
    })),
  };
}

/**
 * Relatório de cancelamentos: motivos, frequência, horários
 */
export async function queryCancellations(params: {
  startDate?: string;
  endDate?: string;
}): Promise<any> {
  const now = new Date();
  const start = params.startDate ? new Date(params.startDate + 'T00:00:00') : startOfMonth(now);
  const end = params.endDate ? new Date(params.endDate + 'T23:59:59') : endOfDay(now);

  const cancellations = await prisma.appointment.findMany({
    where: {
      status: 'CANCELLED',
      dateTime: { gte: start, lte: end },
    },
    include: { client: true, service: true, professional: true },
    orderBy: { dateTime: 'desc' },
  });

  if (cancellations.length === 0) {
    return { found: false, message: 'Nenhum cancelamento no período.' };
  }

  const totalLost = cancellations.reduce((sum, a) => sum + Number(a.priceAtBooking ?? a.service.price), 0);

  // Motivos mais comuns
  const reasons = new Map<string, number>();
  for (const c of cancellations) {
    const reason = c.cancelReason || 'Sem motivo informado';
    reasons.set(reason, (reasons.get(reason) || 0) + 1);
  }

  const topReasons = Array.from(reasons.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([reason, count]) => ({ reason, count }));

  return {
    found: true,
    total: cancellations.length,
    totalLost: totalLost.toFixed(2),
    period: `${format(start, 'dd/MM')} a ${format(end, 'dd/MM')}`,
    topReasons,
    list: cancellations.slice(0, 10).map(c => ({
      client: c.client.name || formatPhone(c.client.phone),
      service: c.service.name,
      professional: c.professional.name,
      date: format(c.dateTime, 'dd/MM HH:mm'),
      reason: c.cancelReason || '-',
    })),
  };
}

/**
 * Horários de pico: quais dias/horários têm mais agendamentos
 */
export async function queryPeakHours(params: {
  startDate?: string;
  endDate?: string;
}): Promise<any> {
  const now = new Date();
  const start = params.startDate ? new Date(params.startDate + 'T00:00:00') : subDays(now, 30);
  const end = params.endDate ? new Date(params.endDate + 'T23:59:59') : endOfDay(now);

  const appointments = await prisma.appointment.findMany({
    where: {
      status: { in: ['CONFIRMED', 'COMPLETED'] },
      dateTime: { gte: start, lte: end },
    },
    select: { dateTime: true },
  });

  if (appointments.length === 0) {
    return { found: false, message: 'Sem dados suficientes no período.' };
  }

  // Por hora do dia
  const byHour = new Map<number, number>();
  // Por dia da semana
  const byDay = new Map<number, number>();
  const dayNames = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

  for (const apt of appointments) {
    const hour = apt.dateTime.getHours();
    const day = apt.dateTime.getDay();
    byHour.set(hour, (byHour.get(hour) || 0) + 1);
    byDay.set(day, (byDay.get(day) || 0) + 1);
  }

  const peakHours = Array.from(byHour.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([hour, count]) => ({ hour: `${hour}:00`, count }));

  const peakDays = Array.from(byDay.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([day, count]) => ({ day: dayNames[day], count }));

  return {
    found: true,
    totalAppointments: appointments.length,
    period: `${format(start, 'dd/MM')} a ${format(end, 'dd/MM')}`,
    peakHours,
    peakDays,
  };
}

/**
 * Retenção de clientes: quem não volta há X dias
 */
export async function queryClientRetention(params: {
  daysInactive?: number;
}): Promise<any> {
  const daysThreshold = params.daysInactive || 60;
  const cutoffDate = subDays(new Date(), daysThreshold);

  // Clientes que tiveram pelo menos 1 atendimento mas o último foi antes do cutoff
  const clients = await prisma.client.findMany({
    where: {
      appointments: {
        some: {
          status: { in: ['CONFIRMED', 'COMPLETED'] },
        },
      },
    },
    include: {
      appointments: {
        where: { status: { in: ['CONFIRMED', 'COMPLETED'] } },
        orderBy: { dateTime: 'desc' },
        take: 1,
        include: { service: true },
      },
      _count: {
        select: { appointments: { where: { status: { in: ['CONFIRMED', 'COMPLETED'] } } } },
      },
    },
  });

  const inactive = clients
    .filter(c => {
      const lastVisit = c.appointments[0]?.dateTime;
      return lastVisit && lastVisit < cutoffDate;
    })
    .map(c => ({
      name: c.name || 'Sem nome',
      phone: formatPhone(c.phone),
      lastVisit: format(c.appointments[0].dateTime, 'dd/MM/yyyy'),
      lastService: c.appointments[0].service?.name || '-',
      totalVisits: c._count.appointments,
      daysSinceLastVisit: Math.floor((Date.now() - c.appointments[0].dateTime.getTime()) / (1000 * 60 * 60 * 24)),
    }))
    .sort((a, b) => b.daysSinceLastVisit - a.daysSinceLastVisit);

  if (inactive.length === 0) {
    return { found: false, message: `Nenhuma cliente inativa há mais de ${daysThreshold} dias.` };
  }

  return {
    found: true,
    total: inactive.length,
    daysThreshold,
    clients: inactive.slice(0, 15),
  };
}
