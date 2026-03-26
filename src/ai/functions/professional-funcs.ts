import { PrismaClient } from '@prisma/client';
import { getProfessionalScheduleForDay, blockTimeSlot, unblockTimeSlot } from '../../services/professional';
import { format, addDays, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { logger } from '../../utils/logger';

const prisma = new PrismaClient();

/**
 * Funções exclusivas para profissionais (JSON Schema para OpenAI)
 */
export const professionalFunctionDeclarations = [
  {
    name: 'my_schedule',
    description: 'Mostra a agenda da profissional para um dia específico. Mostra todos os atendimentos com horário, serviço, cliente e valor.',
    parameters: {
      type: 'object' as const,
      properties: {
        date: {
          type: 'string' as const,
          description: 'Data no formato YYYY-MM-DD. Use a data de hoje se disser "hoje", amanhã se disser "amanhã".',
        },
      },
      required: ['date'],
    },
  },
  {
    name: 'my_week_schedule',
    description: 'Mostra a agenda da profissional para a semana inteira (próximos 7 dias).',
    parameters: {
      type: 'object' as const,
      properties: {
        start_date: {
          type: 'string' as const,
          description: 'Data de início no formato YYYY-MM-DD. Normalmente a data de hoje.',
        },
      },
      required: ['start_date'],
    },
  },
  {
    name: 'my_revenue',
    description: 'Mostra o faturamento da profissional em um período. Retorna total R$, quantidade de atendimentos e ticket médio. Só conta atendimentos COMPLETED.',
    parameters: {
      type: 'object' as const,
      properties: {
        period: {
          type: 'string' as const,
          description: 'Período: "hoje", "semana" (semana atual), "mes" (mês atual), ou datas customizadas via start_date/end_date.',
        },
        start_date: {
          type: 'string' as const,
          description: 'Data início YYYY-MM-DD (opcional, se period não for suficiente).',
        },
        end_date: {
          type: 'string' as const,
          description: 'Data fim YYYY-MM-DD (opcional).',
        },
      },
      required: ['period'],
    },
  },
  {
    name: 'my_next_client',
    description: 'Mostra o próximo atendimento agendado da profissional. Útil para olhada rápida sem ver agenda inteira.',
    parameters: {
      type: 'object' as const,
      properties: {},
    },
  },
  {
    name: 'block_my_time',
    description: 'Bloqueia um horário na agenda da própria profissional. Útil para almoço, consulta médica, saída mais cedo, intervalo, etc. Impede que clientes marquem nesse horário.',
    parameters: {
      type: 'object' as const,
      properties: {
        date: { type: 'string' as const, description: 'Data YYYY-MM-DD' },
        time: { type: 'string' as const, description: 'Horário HH:mm' },
        duration_minutes: { type: 'number' as const, description: 'Duração em minutos (padrão: 60)' },
        reason: { type: 'string' as const, description: 'Motivo do bloqueio (ex: "almoço", "médico")' },
      },
      required: ['date', 'time'],
    },
  },
  {
    name: 'unblock_my_time',
    description: 'Remove um bloqueio de horário da profissional. Primeiro use my_schedule para ver os bloqueios e pegar o ID.',
    parameters: {
      type: 'object' as const,
      properties: {
        block_id: { type: 'number' as const, description: 'ID do bloqueio (obtido via my_schedule)' },
      },
      required: ['block_id'],
    },
  },
  {
    name: 'mark_completed',
    description: 'Marca um atendimento como concluído (COMPLETED). Use após a profissional terminar o serviço. Importante para faturamento. Primeiro use my_schedule para pegar o ID.',
    parameters: {
      type: 'object' as const,
      properties: {
        appointment_id: { type: 'number' as const, description: 'ID do atendimento (obtido via my_schedule)' },
      },
      required: ['appointment_id'],
    },
  },
];

/**
 * Executa função de profissional
 */
export async function executeProfessionalFunction(
  name: string,
  args: Record<string, any>,
  professionalId: number
): Promise<any> {
  switch (name) {
    case 'my_schedule': {
      const appointments = await getProfessionalScheduleForDay(professionalId, args.date);
      if (appointments.length === 0) {
        return { found: false, message: 'Sem atendimentos nesse dia.', date: args.date };
      }
      const totalRevenue = appointments
        .filter(a => a.status !== 'BLOCKED')
        .reduce((sum: number, a: any) => sum + a.price, 0);
      return {
        found: true,
        date: args.date,
        count: appointments.length,
        appointments,
        totalRevenue,
      };
    }

    case 'my_week_schedule': {
      const startDate = new Date(args.start_date + 'T00:00:00');
      const weekSchedule: any[] = [];

      for (let i = 0; i < 7; i++) {
        const day = addDays(startDate, i);
        const dateStr = format(day, 'yyyy-MM-dd');
        const appointments = await getProfessionalScheduleForDay(professionalId, dateStr);
        if (appointments.length > 0) {
          weekSchedule.push({
            date: dateStr,
            dayName: format(day, 'EEEE', { locale: ptBR }),
            count: appointments.length,
            appointments,
          });
        }
      }

      if (weekSchedule.length === 0) {
        return { found: false, message: 'Sem atendimentos nos próximos 7 dias.' };
      }

      return { found: true, days: weekSchedule };
    }

    case 'my_revenue': {
      const now = new Date();
      let dateStart: Date;
      let dateEnd: Date;

      switch (args.period) {
        case 'hoje':
          dateStart = startOfDay(now);
          dateEnd = endOfDay(now);
          break;
        case 'semana':
          dateStart = startOfWeek(now, { weekStartsOn: 1 });
          dateEnd = endOfWeek(now, { weekStartsOn: 1 });
          break;
        case 'mes':
        default:
          dateStart = startOfMonth(now);
          dateEnd = endOfMonth(now);
          break;
      }

      // Override com datas customizadas se fornecidas
      if (args.start_date) dateStart = new Date(args.start_date + 'T00:00:00');
      if (args.end_date) dateEnd = new Date(args.end_date + 'T23:59:59');

      const appointments = await prisma.appointment.findMany({
        where: {
          professionalId,
          status: 'COMPLETED',
          dateTime: { gte: dateStart, lte: dateEnd },
        },
        include: { service: true },
      });

      const total = appointments.reduce((sum, a) => sum + Number(a.priceAtBooking ?? a.service.price), 0);
      const count = appointments.length;
      const ticketMedio = count > 0 ? total / count : 0;

      const periodLabel = args.period === 'hoje' ? 'hoje'
        : args.period === 'semana' ? 'essa semana'
        : 'esse mês';

      return {
        period: periodLabel,
        total: total.toFixed(2),
        count,
        ticketMedio: ticketMedio.toFixed(2),
        startDate: format(dateStart, 'dd/MM/yyyy'),
        endDate: format(dateEnd, 'dd/MM/yyyy'),
      };
    }

    case 'my_next_client': {
      const now = new Date();
      const nextAppointment = await prisma.appointment.findFirst({
        where: {
          professionalId,
          status: { in: ['CONFIRMED', 'PENDING'] },
          dateTime: { gte: now },
        },
        include: {
          service: true,
          client: true,
        },
        orderBy: { dateTime: 'asc' },
      });

      if (!nextAppointment) {
        return { found: false, message: 'Nenhum atendimento agendado a partir de agora.' };
      }

      return {
        found: true,
        id: nextAppointment.id,
        date: format(nextAppointment.dateTime, 'dd/MM/yyyy'),
        dayName: format(nextAppointment.dateTime, 'EEEE', { locale: ptBR }),
        time: format(nextAppointment.dateTime, 'HH:mm'),
        endTime: format(nextAppointment.endTime, 'HH:mm'),
        service: nextAppointment.service.name,
        client: nextAppointment.client.name || 'Cliente',
        price: Number(nextAppointment.priceAtBooking ?? nextAppointment.service.price).toFixed(2),
      };
    }

    case 'block_my_time': {
      return blockTimeSlot({
        professionalId,
        date: args.date,
        time: args.time,
        durationMinutes: args.duration_minutes || 60,
        reason: args.reason || 'Bloqueio pela profissional',
      });
    }

    case 'unblock_my_time': {
      // Verificar se o bloqueio pertence a esta profissional
      const block = await prisma.appointment.findUnique({
        where: { id: args.block_id },
      });

      if (!block) return { success: false, message: 'Bloqueio não encontrado.' };
      if (block.professionalId !== professionalId) {
        return { success: false, message: 'Esse bloqueio não é seu. Só pode desbloquear seus próprios horários.' };
      }

      return unblockTimeSlot(args.block_id);
    }

    case 'mark_completed': {
      const appointment = await prisma.appointment.findUnique({
        where: { id: args.appointment_id },
        include: { service: true, client: true },
      });

      if (!appointment) return { success: false, message: 'Atendimento não encontrado.' };
      if (appointment.professionalId !== professionalId) {
        return { success: false, message: 'Esse atendimento não é seu.' };
      }
      if (appointment.status === 'COMPLETED') {
        return { success: false, message: 'Esse atendimento já foi marcado como concluído.' };
      }
      if (appointment.status === 'CANCELLED') {
        return { success: false, message: 'Esse atendimento foi cancelado, não pode ser concluído.' };
      }

      // Encurtar endTime para AGORA se terminou antes do previsto
      // Isso libera o restante do horário para novos agendamentos
      const now = new Date();
      const endedEarly = now < appointment.endTime;
      const newEndTime = endedEarly ? now : appointment.endTime;

      await prisma.appointment.update({
        where: { id: args.appointment_id },
        data: {
          status: 'COMPLETED',
          endTime: newEndTime,
        },
      });

      const originalEnd = format(appointment.endTime, 'HH:mm');
      const actualEnd = format(newEndTime, 'HH:mm');

      logger.info({
        msg: 'Atendimento marcado como concluído',
        appointmentId: args.appointment_id,
        professionalId,
        endedEarly,
        originalEnd,
        actualEnd,
      });

      const earlyMsg = endedEarly
        ? ` Horário liberado até ${originalEnd} (terminou ${Math.round((appointment.endTime.getTime() - now.getTime()) / 60000)}min antes).`
        : '';

      return {
        success: true,
        message: `Atendimento concluído: ${appointment.service.name} — ${appointment.client.name || 'Cliente'}.${earlyMsg}`,
        freedSlot: endedEarly,
        freedUntil: endedEarly ? originalEnd : null,
      };
    }

    default:
      return { error: `Função desconhecida: ${name}` };
  }
}
