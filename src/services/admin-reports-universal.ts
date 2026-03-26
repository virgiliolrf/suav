import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function getDateRange(startDate?: string, endDate?: string) {
  const now = new Date();
  const start = startDate ? new Date(startDate + 'T00:00:00') : new Date(now.getFullYear(), now.getMonth(), 1);
  const end = endDate ? new Date(endDate + 'T23:59:59') : now;
  return { start, end };
}

export async function reportRevenueByService(params: { startDate?: string; endDate?: string }) {
  const { start, end } = getDateRange(params.startDate, params.endDate);
  const appointments = await prisma.appointment.findMany({
    where: { dateTime: { gte: start, lte: end }, status: { in: ['CONFIRMED', 'COMPLETED'] } },
    include: { service: { include: { category: true } } },
  });

  const map = new Map<number, { name: string; category: string; total: number; count: number }>();
  for (const a of appointments) {
    const s = a.service;
    const entry = map.get(s.id) || { name: s.name, category: s.category.name, total: 0, count: 0 };
    entry.total += a.priceAtBooking || s.price;
    entry.count++;
    map.set(s.id, entry);
  }

  const services = [...map.values()].sort((a, b) => b.total - a.total);
  return {
    period: { start: start.toISOString().split('T')[0], end: end.toISOString().split('T')[0] },
    services: services.map(s => ({ ...s, total: Math.round(s.total * 100) / 100, ticketMedio: Math.round((s.total / s.count) * 100) / 100 })),
    grandTotal: Math.round(services.reduce((sum, s) => sum + s.total, 0) * 100) / 100,
  };
}

export async function reportRevenueByProfessionalByService(params: { startDate?: string; endDate?: string; professionalName?: string }) {
  const { start, end } = getDateRange(params.startDate, params.endDate);
  const where: any = { dateTime: { gte: start, lte: end }, status: { in: ['CONFIRMED', 'COMPLETED'] } };
  if (params.professionalName) where.professional = { name: { contains: params.professionalName, mode: 'insensitive' } };

  const appointments = await prisma.appointment.findMany({ where, include: { service: true, professional: true } });
  const map = new Map<string, { professional: string; services: Map<string, { name: string; total: number; count: number }> }>();

  for (const a of appointments) {
    const key = a.professional.name;
    if (!map.has(key)) map.set(key, { professional: key, services: new Map() });
    const entry = map.get(key)!;
    const svc = entry.services.get(a.service.name) || { name: a.service.name, total: 0, count: 0 };
    svc.total += a.priceAtBooking || a.service.price;
    svc.count++;
    entry.services.set(a.service.name, svc);
  }

  return {
    period: { start: start.toISOString().split('T')[0], end: end.toISOString().split('T')[0] },
    professionals: [...map.values()].map(p => ({
      professional: p.professional,
      total: Math.round([...p.services.values()].reduce((s, v) => s + v.total, 0) * 100) / 100,
      services: [...p.services.values()].sort((a, b) => b.total - a.total),
    })).sort((a, b) => b.total - a.total),
  };
}

export async function reportClientFrequency(params: { startDate?: string; endDate?: string }) {
  const { start, end } = getDateRange(params.startDate, params.endDate);
  const appointments = await prisma.appointment.findMany({
    where: { dateTime: { gte: start, lte: end }, status: { in: ['CONFIRMED', 'COMPLETED'] } },
    include: { client: true },
  });

  const map = new Map<number, { name: string; phone: string; visits: number; totalSpent: number }>();
  for (const a of appointments) {
    const c = a.client;
    const entry = map.get(c.id) || { name: c.name || 'Sem nome', phone: c.phone, visits: 0, totalSpent: 0 };
    entry.visits++;
    entry.totalSpent += a.priceAtBooking || 0;
    map.set(c.id, entry);
  }

  return {
    period: { start: start.toISOString().split('T')[0], end: end.toISOString().split('T')[0] },
    totalClients: map.size,
    clients: [...map.values()].sort((a, b) => b.visits - a.visits).slice(0, 50).map(c => ({
      ...c, totalSpent: Math.round(c.totalSpent * 100) / 100,
    })),
  };
}

export async function reportServicePopularity(params: { startDate?: string; endDate?: string }) {
  const { start, end } = getDateRange(params.startDate, params.endDate);
  const appointments = await prisma.appointment.findMany({
    where: { dateTime: { gte: start, lte: end } },
    include: { service: true },
  });

  const map = new Map<number, { name: string; total: number; confirmed: number; cancelled: number; noShow: number }>();
  for (const a of appointments) {
    const entry = map.get(a.service.id) || { name: a.service.name, total: 0, confirmed: 0, cancelled: 0, noShow: 0 };
    entry.total++;
    if (a.status === 'CONFIRMED' || a.status === 'COMPLETED') entry.confirmed++;
    else if (a.status === 'CANCELLED') entry.cancelled++;
    else if (a.status === 'NO_SHOW') entry.noShow++;
    map.set(a.service.id, entry);
  }

  return {
    period: { start: start.toISOString().split('T')[0], end: end.toISOString().split('T')[0] },
    services: [...map.values()].sort((a, b) => b.total - a.total).map(s => ({
      ...s, cancelRate: s.total > 0 ? Math.round((s.cancelled / s.total) * 100) : 0,
    })),
  };
}

export async function reportProfessionalUtilization(params: { startDate?: string; endDate?: string }) {
  const { start, end } = getDateRange(params.startDate, params.endDate);
  const professionals = await prisma.professional.findMany({
    where: { active: true },
    include: { workSchedule: { where: { isWorking: true } } },
  });

  const appointments = await prisma.appointment.findMany({
    where: { dateTime: { gte: start, lte: end }, status: { in: ['CONFIRMED', 'COMPLETED'] } },
    include: { professional: true },
  });

  const apptMap = new Map<number, number>();
  for (const a of appointments) {
    apptMap.set(a.professionalId, (apptMap.get(a.professionalId) || 0) + 1);
  }

  const daysDiff = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));

  return {
    period: { start: start.toISOString().split('T')[0], end: end.toISOString().split('T')[0], days: daysDiff },
    professionals: professionals.map(p => {
      const workDays = p.workSchedule.length;
      const workDaysInPeriod = Math.round((daysDiff / 7) * workDays);
      const avgSlotsPerDay = 8; // estimativa conservadora
      const totalSlots = workDaysInPeriod * avgSlotsPerDay;
      const booked = apptMap.get(p.id) || 0;
      return {
        name: p.name,
        booked,
        workDaysInPeriod,
        utilization: totalSlots > 0 ? Math.round((booked / totalSlots) * 100) : 0,
      };
    }).sort((a, b) => b.utilization - a.utilization),
  };
}

export async function reportDailySummary(params: { startDate?: string; endDate?: string }) {
  const { start, end } = getDateRange(params.startDate, params.endDate);
  const appointments = await prisma.appointment.findMany({
    where: { dateTime: { gte: start, lte: end } },
  });

  const map = new Map<string, { date: string; total: number; confirmed: number; cancelled: number; revenue: number }>();
  for (const a of appointments) {
    const date = a.dateTime.toISOString().split('T')[0];
    const entry = map.get(date) || { date, total: 0, confirmed: 0, cancelled: 0, revenue: 0 };
    entry.total++;
    if (a.status === 'CONFIRMED' || a.status === 'COMPLETED') {
      entry.confirmed++;
      entry.revenue += a.priceAtBooking || 0;
    } else if (a.status === 'CANCELLED') entry.cancelled++;
    map.set(date, entry);
  }

  return {
    period: { start: start.toISOString().split('T')[0], end: end.toISOString().split('T')[0] },
    days: [...map.values()].sort((a, b) => a.date.localeCompare(b.date)).map(d => ({
      ...d, revenue: Math.round(d.revenue * 100) / 100,
    })),
  };
}

export async function reportNewVsReturning(params: { startDate?: string; endDate?: string }) {
  const { start, end } = getDateRange(params.startDate, params.endDate);
  const clients = await prisma.client.findMany({ include: { appointments: { orderBy: { dateTime: 'asc' } } } });

  let newClients = 0;
  let returningClients = 0;
  let newRevenue = 0;
  let returningRevenue = 0;

  for (const c of clients) {
    const inPeriod = c.appointments.filter(a => a.dateTime >= start && a.dateTime <= end && ['CONFIRMED', 'COMPLETED'].includes(a.status));
    if (inPeriod.length === 0) continue;

    const firstEver = c.appointments[0]?.dateTime;
    if (firstEver && firstEver >= start && firstEver <= end) {
      newClients++;
      newRevenue += inPeriod.reduce((s, a) => s + (a.priceAtBooking || 0), 0);
    } else {
      returningClients++;
      returningRevenue += inPeriod.reduce((s, a) => s + (a.priceAtBooking || 0), 0);
    }
  }

  return {
    period: { start: start.toISOString().split('T')[0], end: end.toISOString().split('T')[0] },
    newClients, returningClients,
    newRevenue: Math.round(newRevenue * 100) / 100,
    returningRevenue: Math.round(returningRevenue * 100) / 100,
  };
}

export async function reportAverageTicket(params: { startDate?: string; endDate?: string }) {
  const { start, end } = getDateRange(params.startDate, params.endDate);
  const appointments = await prisma.appointment.findMany({
    where: { dateTime: { gte: start, lte: end }, status: { in: ['CONFIRMED', 'COMPLETED'] } },
    include: { professional: true, service: true },
  });

  const total = appointments.reduce((s, a) => s + (a.priceAtBooking || a.service.price), 0);
  const generalTicket = appointments.length > 0 ? total / appointments.length : 0;

  const byProf = new Map<string, { total: number; count: number }>();
  const bySvc = new Map<string, { total: number; count: number }>();
  for (const a of appointments) {
    const price = a.priceAtBooking || a.service.price;
    const p = byProf.get(a.professional.name) || { total: 0, count: 0 };
    p.total += price; p.count++;
    byProf.set(a.professional.name, p);
    const s = bySvc.get(a.service.name) || { total: 0, count: 0 };
    s.total += price; s.count++;
    bySvc.set(a.service.name, s);
  }

  return {
    period: { start: start.toISOString().split('T')[0], end: end.toISOString().split('T')[0] },
    generalTicket: Math.round(generalTicket * 100) / 100,
    totalAppointments: appointments.length,
    byProfessional: [...byProf.entries()].map(([name, v]) => ({
      name, ticket: Math.round((v.total / v.count) * 100) / 100, count: v.count,
    })).sort((a, b) => b.ticket - a.ticket),
    byService: [...bySvc.entries()].map(([name, v]) => ({
      name, ticket: Math.round((v.total / v.count) * 100) / 100, count: v.count,
    })).sort((a, b) => b.ticket - a.ticket),
  };
}

export async function reportCancellationAnalysis(params: { startDate?: string; endDate?: string }) {
  const { start, end } = getDateRange(params.startDate, params.endDate);
  const cancelled = await prisma.appointment.findMany({
    where: { dateTime: { gte: start, lte: end }, status: 'CANCELLED' },
    include: { service: true, professional: true, client: true },
  });

  const byService = new Map<string, number>();
  const byProfessional = new Map<string, number>();
  const byReason = new Map<string, number>();
  const byDayOfWeek = new Map<number, number>();
  let totalLoss = 0;

  for (const a of cancelled) {
    byService.set(a.service.name, (byService.get(a.service.name) || 0) + 1);
    byProfessional.set(a.professional.name, (byProfessional.get(a.professional.name) || 0) + 1);
    const reason = a.cancelReason || 'Sem motivo informado';
    byReason.set(reason, (byReason.get(reason) || 0) + 1);
    byDayOfWeek.set(a.dateTime.getDay(), (byDayOfWeek.get(a.dateTime.getDay()) || 0) + 1);
    totalLoss += a.priceAtBooking || a.service.price;
  }

  const dayNames = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

  return {
    period: { start: start.toISOString().split('T')[0], end: end.toISOString().split('T')[0] },
    totalCancelled: cancelled.length,
    totalLoss: Math.round(totalLoss * 100) / 100,
    byService: [...byService.entries()].sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count })),
    byProfessional: [...byProfessional.entries()].sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count })),
    byReason: [...byReason.entries()].sort((a, b) => b[1] - a[1]).map(([reason, count]) => ({ reason, count })),
    byDayOfWeek: [...byDayOfWeek.entries()].sort((a, b) => b[1] - a[1]).map(([day, count]) => ({ day: dayNames[day], count })),
  };
}

export async function reportInactiveProfessionals(params: { startDate?: string; endDate?: string }) {
  const { start, end } = getDateRange(params.startDate, params.endDate);
  const professionals = await prisma.professional.findMany({ where: { active: true } });

  const result = [];
  for (const p of professionals) {
    const count = await prisma.appointment.count({
      where: { professionalId: p.id, dateTime: { gte: start, lte: end }, status: { in: ['CONFIRMED', 'COMPLETED'] } },
    });
    if (count === 0) {
      const lastAppt = await prisma.appointment.findFirst({
        where: { professionalId: p.id, status: { in: ['CONFIRMED', 'COMPLETED'] } },
        orderBy: { dateTime: 'desc' },
      });
      result.push({ name: p.name, lastAppointment: lastAppt?.dateTime?.toISOString().split('T')[0] || 'Nunca' });
    }
  }

  return {
    period: { start: start.toISOString().split('T')[0], end: end.toISOString().split('T')[0] },
    inactiveProfessionals: result,
  };
}
