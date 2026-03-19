import { PrismaClient } from '@prisma/client';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { formatDateTimeBR, formatTime } from '../utils/date';
import { normalizePhone, formatPhone } from '../utils/phone';

const prisma = new PrismaClient();

/**
 * Historico de visitas de uma cliente pelo telefone
 */
export async function getClientHistory(clientPhone: string): Promise<{
  found: boolean;
  clientName: string | null;
  totalVisits: number;
  totalSpent: number;
  appointments: { service: string; professional: string; dateTime: string; price: number; status: string }[];
}> {
  const phone = normalizePhone(clientPhone);
  const client = await prisma.client.findUnique({ where: { phone } });

  if (!client) {
    return { found: false, clientName: null, totalVisits: 0, totalSpent: 0, appointments: [] };
  }

  const appointments = await prisma.appointment.findMany({
    where: { clientId: client.id },
    include: { service: true, professional: true },
    orderBy: { dateTime: 'desc' },
  });

  const mapped = appointments.map((apt) => ({
    service: apt.service.name,
    professional: apt.professional.name,
    dateTime: formatDateTimeBR(apt.dateTime),
    price: apt.priceAtBooking ?? apt.service.price,
    status: apt.status,
  }));

  const completed = appointments.filter((a) => a.status === 'COMPLETED' || a.status === 'CONFIRMED');
  const totalSpent = completed.reduce((sum, a) => sum + (a.priceAtBooking ?? a.service.price), 0);

  return {
    found: true,
    clientName: client.name,
    totalVisits: appointments.length,
    totalSpent,
    appointments: mapped,
  };
}

/**
 * Consulta faturamento por periodo
 */
export async function queryRevenue(params: {
  startDate: string;
  endDate: string;
  professionalName?: string;
  category?: string;
}): Promise<{
  total: number;
  count: number;
  byProfessional: { name: string; total: number; count: number }[];
  byCategory: { name: string; total: number; count: number }[];
}> {
  const start = new Date(params.startDate + 'T00:00:00');
  const end = new Date(params.endDate + 'T23:59:59');

  const where: any = {
    dateTime: { gte: start, lte: end },
    status: { in: ['CONFIRMED', 'COMPLETED'] },
  };

  const appointments = await prisma.appointment.findMany({
    where,
    include: {
      service: { include: { category: true } },
      professional: true,
    },
  });

  // Calcular totais
  let total = 0;
  const profMap = new Map<string, { total: number; count: number }>();
  const catMap = new Map<string, { total: number; count: number }>();

  for (const apt of appointments) {
    const price = apt.priceAtBooking ?? apt.service.price;
    total += price;

    // Por profissional
    const profName = apt.professional.name;
    const profData = profMap.get(profName) || { total: 0, count: 0 };
    profData.total += price;
    profData.count += 1;
    profMap.set(profName, profData);

    // Por categoria
    const catName = apt.service.category.name;
    const catData = catMap.get(catName) || { total: 0, count: 0 };
    catData.total += price;
    catData.count += 1;
    catMap.set(catName, catData);
  }

  return {
    total,
    count: appointments.length,
    byProfessional: Array.from(profMap.entries())
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.total - a.total),
    byCategory: Array.from(catMap.entries())
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.total - a.total),
  };
}

/**
 * Estatisticas de agendamentos por periodo
 */
export async function queryAppointmentStats(params: {
  startDate: string;
  endDate: string;
  groupBy?: 'professional' | 'service' | 'day' | 'status';
}): Promise<{
  total: number;
  confirmed: number;
  cancelled: number;
  completed: number;
  noShow: number;
  breakdown: { label: string; count: number }[];
}> {
  const start = new Date(params.startDate + 'T00:00:00');
  const end = new Date(params.endDate + 'T23:59:59');

  const appointments = await prisma.appointment.findMany({
    where: { dateTime: { gte: start, lte: end } },
    include: {
      service: true,
      professional: true,
    },
  });

  const stats = {
    total: appointments.length,
    confirmed: appointments.filter((a) => a.status === 'CONFIRMED').length,
    cancelled: appointments.filter((a) => a.status === 'CANCELLED').length,
    completed: appointments.filter((a) => a.status === 'COMPLETED').length,
    noShow: appointments.filter((a) => a.status === 'NO_SHOW').length,
  };

  const breakdownMap = new Map<string, number>();

  for (const apt of appointments) {
    let key: string;
    switch (params.groupBy) {
      case 'professional':
        key = apt.professional.name;
        break;
      case 'service':
        key = apt.service.name;
        break;
      case 'day':
        key = apt.dateTime.toISOString().split('T')[0];
        break;
      case 'status':
        key = apt.status;
        break;
      default:
        key = apt.professional.name;
    }
    breakdownMap.set(key, (breakdownMap.get(key) || 0) + 1);
  }

  return {
    ...stats,
    breakdown: Array.from(breakdownMap.entries())
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count),
  };
}

/**
 * Ranking de profissionais por faturamento ou atendimentos
 */
export async function queryTopPerformers(params: {
  metric: 'revenue' | 'appointments';
  startDate: string;
  endDate: string;
}): Promise<{ name: string; value: number; count: number }[]> {
  const start = new Date(params.startDate + 'T00:00:00');
  const end = new Date(params.endDate + 'T23:59:59');

  const appointments = await prisma.appointment.findMany({
    where: {
      dateTime: { gte: start, lte: end },
      status: { in: ['CONFIRMED', 'COMPLETED'] },
    },
    include: {
      service: true,
      professional: true,
    },
  });

  const profMap = new Map<string, { revenue: number; count: number }>();

  for (const apt of appointments) {
    const name = apt.professional.name;
    const data = profMap.get(name) || { revenue: 0, count: 0 };
    data.revenue += apt.priceAtBooking ?? apt.service.price;
    data.count += 1;
    profMap.set(name, data);
  }

  return Array.from(profMap.entries())
    .map(([name, data]) => ({
      name,
      value: params.metric === 'revenue' ? data.revenue : data.count,
      count: data.count,
    }))
    .sort((a, b) => b.value - a.value);
}

/**
 * Estatisticas de clientes
 */
export async function queryClientStats(params: {
  startDate: string;
  endDate: string;
}): Promise<{
  totalClients: number;
  newClients: number;
  returningClients: number;
  topClients: { phone: string; name: string | null; count: number }[];
}> {
  const start = new Date(params.startDate + 'T00:00:00');
  const end = new Date(params.endDate + 'T23:59:59');

  // Clientes com agendamento no periodo
  const appointments = await prisma.appointment.findMany({
    where: {
      dateTime: { gte: start, lte: end },
      status: { in: ['CONFIRMED', 'COMPLETED'] },
    },
    include: { client: true },
  });

  const clientIds = new Set(appointments.map((a) => a.clientId));

  // Clientes novos (criados no periodo)
  const newClients = await prisma.client.count({
    where: {
      createdAt: { gte: start, lte: end },
    },
  });

  // Top clientes por numero de agendamentos
  const clientCounts = new Map<number, { phone: string; name: string | null; count: number }>();
  for (const apt of appointments) {
    const data = clientCounts.get(apt.clientId) || {
      phone: apt.client.phone,
      name: apt.client.name,
      count: 0,
    };
    data.count += 1;
    clientCounts.set(apt.clientId, data);
  }

  return {
    totalClients: clientIds.size,
    newClients,
    returningClients: clientIds.size - newClients,
    topClients: Array.from(clientCounts.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 10),
  };
}

/**
 * Lista todos os agendamentos de um dia com detalhes completos
 * Formato tabela para a gerente/dona
 */
export async function queryDayAppointments(params: {
  date: string; // YYYY-MM-DD
  status?: string;
  professionalName?: string;
}): Promise<{
  date: string;
  dateFormatted: string;
  total: number;
  totalRevenue: number;
  appointments: {
    horario: string;
    profissional: string;
    servico: string;
    cliente: string;
    telefone: string;
    valor: string;
    status: string;
  }[];
}> {
  const start = new Date(params.date + 'T00:00:00');
  const end = new Date(params.date + 'T23:59:59');
  const dateFormatted = format(start, "EEEE, d 'de' MMMM", { locale: ptBR });

  const where: any = {
    dateTime: { gte: start, lte: end },
  };

  if (params.status) {
    where.status = params.status;
  }

  const appointments = await prisma.appointment.findMany({
    where,
    include: {
      service: true,
      professional: true,
      client: true,
    },
    orderBy: { dateTime: 'asc' },
  });

  let filtered = appointments;
  if (params.professionalName) {
    const name = params.professionalName.toLowerCase();
    filtered = appointments.filter(a => a.professional.name.toLowerCase().includes(name));
  }

  const confirmed = filtered.filter(a => a.status === 'CONFIRMED' || a.status === 'COMPLETED');
  const totalRevenue = confirmed.reduce((sum, a) => sum + (a.priceAtBooking ?? a.service.price), 0);

  return {
    date: params.date,
    dateFormatted,
    total: filtered.length,
    totalRevenue,
    appointments: filtered.map(apt => ({
      horario: formatTime(apt.dateTime) + ' - ' + formatTime(apt.endTime),
      profissional: apt.professional.name,
      servico: apt.service.name,
      cliente: apt.client.name || 'Sem nome',
      telefone: formatPhone(apt.client.phone),
      valor: 'R$ ' + (apt.priceAtBooking ?? apt.service.price).toFixed(2).replace('.', ','),
      status: apt.status === 'CONFIRMED' ? '✅' : apt.status === 'CANCELLED' ? '❌' : apt.status === 'COMPLETED' ? '✔️' : apt.status,
    })),
  };
}
