import { Type } from '@google/genai';
import { PrismaClient } from '@prisma/client';
import { queryRevenue, queryAppointmentStats, queryTopPerformers, queryClientStats, getClientHistory, queryDayAppointments } from '../../services/admin-query';
import { blockTimeSlot, unblockTimeSlot } from '../../services/professional';
import { findProfessional } from '../../services/catalog';
import { normalizePhone } from '../../utils/phone';

const prisma = new PrismaClient();

/**
 * Declaracoes de funcoes admin para o Gemini
 */
export const adminFunctionDeclarations = [
  {
    name: 'query_revenue',
    description: 'Consulta o faturamento do salão em um período. Retorna total, detalhamento por profissional e por categoria.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        start_date: { type: Type.STRING, description: 'Data início YYYY-MM-DD' },
        end_date: { type: Type.STRING, description: 'Data fim YYYY-MM-DD' },
        professional_name: { type: Type.STRING, description: 'Filtrar por profissional (opcional)' },
      },
      required: ['start_date', 'end_date'],
    },
  },
  {
    name: 'query_appointment_stats',
    description: 'Estatísticas de agendamentos: total, confirmados, cancelados, no-show. Pode agrupar por profissional, serviço, dia ou status.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        start_date: { type: Type.STRING, description: 'Data início YYYY-MM-DD' },
        end_date: { type: Type.STRING, description: 'Data fim YYYY-MM-DD' },
        group_by: { type: Type.STRING, description: 'Agrupar por: "professional", "service", "day" ou "status"' },
      },
      required: ['start_date', 'end_date'],
    },
  },
  {
    name: 'query_top_performers',
    description: 'Ranking das profissionais por faturamento ou número de atendimentos em um período.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        metric: { type: Type.STRING, description: '"revenue" para faturamento ou "appointments" para número de atendimentos' },
        start_date: { type: Type.STRING, description: 'Data início YYYY-MM-DD' },
        end_date: { type: Type.STRING, description: 'Data fim YYYY-MM-DD' },
      },
      required: ['metric', 'start_date', 'end_date'],
    },
  },
  {
    name: 'query_client_stats',
    description: 'Estatísticas de clientes: total, novos, recorrentes e ranking de clientes mais frequentes.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        start_date: { type: Type.STRING, description: 'Data início YYYY-MM-DD' },
        end_date: { type: Type.STRING, description: 'Data fim YYYY-MM-DD' },
      },
      required: ['start_date', 'end_date'],
    },
  },
  {
    name: 'query_client_history',
    description: 'Busca histórico completo de visitas de uma cliente pelo telefone.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        client_phone: { type: Type.STRING, description: 'Telefone da cliente com DDD' },
      },
      required: ['client_phone'],
    },
  },
  {
    name: 'query_day_appointments',
    description: 'Lista TODOS os agendamentos de um dia com detalhes: horário, profissional, serviço, cliente, telefone, valor, status. Use quando perguntar "agenda de hoje", "agendamentos de amanhã", etc.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        date: { type: Type.STRING, description: 'Data YYYY-MM-DD' },
        status: { type: Type.STRING, description: 'Filtrar por status (opcional)' },
        professional_name: { type: Type.STRING, description: 'Filtrar por profissional (opcional)' },
      },
      required: ['date'],
    },
  },
  {
    name: 'block_time_slot',
    description: 'Bloqueia um horário de uma profissional (agendamento externo, reunião, intervalo). Impede que clientes agendem nesse horário.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        professional_name: { type: Type.STRING, description: 'Nome da profissional' },
        date: { type: Type.STRING, description: 'Data YYYY-MM-DD' },
        time: { type: Type.STRING, description: 'Horário HH:mm' },
        duration_minutes: { type: Type.NUMBER, description: 'Duração em minutos (padrão: 60)' },
        reason: { type: Type.STRING, description: 'Motivo do bloqueio (opcional)' },
      },
      required: ['professional_name', 'date', 'time'],
    },
  },
  {
    name: 'unblock_time_slot',
    description: 'Remove bloqueio de horário pelo ID.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        block_id: { type: Type.NUMBER, description: 'ID do bloqueio' },
      },
      required: ['block_id'],
    },
  },
  // === CRUD ADMIN ===
  {
    name: 'update_service_price',
    description: 'Altera o preço de um serviço. Use quando a dona/gerente pedir pra mudar preço.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        service_name: { type: Type.STRING, description: 'Nome do serviço (busca parcial)' },
        new_price: { type: Type.NUMBER, description: 'Novo preço em reais' },
      },
      required: ['service_name', 'new_price'],
    },
  },
  {
    name: 'toggle_professional_status',
    description: 'Ativa ou desativa uma profissional. Profissional desativada não aparece pra clientes.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        professional_name: { type: Type.STRING, description: 'Nome da profissional' },
        active: { type: Type.BOOLEAN, description: 'true = ativa, false = desativa' },
      },
      required: ['professional_name', 'active'],
    },
  },
  {
    name: 'update_work_schedule',
    description: 'Altera o horário de trabalho de uma profissional em um dia da semana. Pode definir se trabalha, horário de início e fim.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        professional_name: { type: Type.STRING, description: 'Nome da profissional' },
        day_of_week: { type: Type.NUMBER, description: 'Dia: 0=domingo, 1=segunda, 2=terça, 3=quarta, 4=quinta, 5=sexta, 6=sábado' },
        is_working: { type: Type.BOOLEAN, description: 'true = trabalha, false = folga' },
        start_time: { type: Type.STRING, description: 'Horário início HH:mm (ex: "09:00")' },
        end_time: { type: Type.STRING, description: 'Horário fim HH:mm (ex: "19:00")' },
      },
      required: ['professional_name', 'day_of_week'],
    },
  },
  {
    name: 'update_appointment_status',
    description: 'Altera o status de um agendamento. Use para marcar como COMPLETED, NO_SHOW, ou CANCELLED.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        appointment_id: { type: Type.NUMBER, description: 'ID do agendamento' },
        new_status: { type: Type.STRING, description: 'Novo status: CONFIRMED, COMPLETED, CANCELLED, NO_SHOW' },
        reason: { type: Type.STRING, description: 'Motivo (opcional)' },
      },
      required: ['appointment_id', 'new_status'],
    },
  },
  {
    name: 'list_professionals',
    description: 'Lista todas as profissionais com status (ativa/inativa), telefone e serviços que fazem.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        include_inactive: { type: Type.BOOLEAN, description: 'Incluir profissionais inativas (padrão: false)' },
      },
    },
  },
  {
    name: 'search_clients',
    description: 'Busca clientes por nome ou telefone. Mostra dados cadastrais e total de agendamentos.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        query: { type: Type.STRING, description: 'Nome ou telefone pra buscar' },
      },
      required: ['query'],
    },
  },
  {
    name: 'update_client_info',
    description: 'Atualiza dados de uma cliente (nome, profissional preferida).',
    parameters: {
      type: Type.OBJECT,
      properties: {
        client_phone: { type: Type.STRING, description: 'Telefone da cliente' },
        new_name: { type: Type.STRING, description: 'Novo nome (opcional)' },
        preferred_professional: { type: Type.STRING, description: 'Profissional preferida (opcional)' },
      },
      required: ['client_phone'],
    },
  },
];

/**
 * Executa uma funcao admin
 */
export async function executeAdminFunction(
  name: string,
  args: Record<string, any>
): Promise<any> {
  switch (name) {
    case 'query_revenue':
      return queryRevenue({
        startDate: args.start_date,
        endDate: args.end_date,
        professionalName: args.professional_name,
      });

    case 'query_appointment_stats':
      return queryAppointmentStats({
        startDate: args.start_date,
        endDate: args.end_date,
        groupBy: args.group_by,
      });

    case 'query_top_performers':
      return queryTopPerformers({
        metric: args.metric,
        startDate: args.start_date,
        endDate: args.end_date,
      });

    case 'query_client_stats':
      return queryClientStats({
        startDate: args.start_date,
        endDate: args.end_date,
      });

    case 'query_client_history':
      return getClientHistory(args.client_phone);

    case 'query_day_appointments':
      return queryDayAppointments({
        date: args.date,
        status: args.status,
        professionalName: args.professional_name,
      });

    case 'block_time_slot': {
      const professional = await findProfessional(args.professional_name);
      if (!professional) {
        return { success: false, message: `Profissional "${args.professional_name}" não encontrada` };
      }
      return blockTimeSlot({
        professionalId: professional.id,
        date: args.date,
        time: args.time,
        durationMinutes: args.duration_minutes || 60,
        reason: args.reason,
      });
    }

    case 'unblock_time_slot':
      return unblockTimeSlot(args.block_id);

    // === CRUD FUNCTIONS ===

    case 'update_service_price': {
      const services = await prisma.service.findMany({
        where: {
          name: { contains: args.service_name, mode: 'insensitive' },
          active: true,
        },
      });

      if (services.length === 0) {
        return { success: false, message: `Serviço "${args.service_name}" não encontrado` };
      }
      if (services.length > 1) {
        return {
          success: false,
          message: `Encontrei ${services.length} serviços com esse nome. Seja mais específica:`,
          services: services.map(s => ({ id: s.id, name: s.name, currentPrice: s.price })),
        };
      }

      const service = services[0];
      const oldPrice = service.price;
      await prisma.service.update({
        where: { id: service.id },
        data: { price: args.new_price },
      });

      return {
        success: true,
        message: `Preço atualizado: ${service.name} de R$ ${oldPrice.toFixed(2)} → R$ ${args.new_price.toFixed(2)}`,
      };
    }

    case 'toggle_professional_status': {
      const prof = await findProfessional(args.professional_name);
      if (!prof) {
        return { success: false, message: `Profissional "${args.professional_name}" não encontrada` };
      }

      await prisma.professional.update({
        where: { id: prof.id },
        data: { active: args.active },
      });

      return {
        success: true,
        message: `${prof.name} agora está ${args.active ? 'ATIVA' : 'INATIVA'}`,
      };
    }

    case 'update_work_schedule': {
      const prof = await findProfessional(args.professional_name);
      if (!prof) {
        return { success: false, message: `Profissional "${args.professional_name}" não encontrada` };
      }

      const dayNames = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
      const dayName = dayNames[args.day_of_week] || `dia ${args.day_of_week}`;

      const data: any = {};
      if (args.is_working !== undefined) data.isWorking = args.is_working;
      if (args.start_time) data.startTime = args.start_time;
      if (args.end_time) data.endTime = args.end_time;

      await prisma.workSchedule.upsert({
        where: {
          professionalId_dayOfWeek: {
            professionalId: prof.id,
            dayOfWeek: args.day_of_week,
          },
        },
        create: {
          professionalId: prof.id,
          dayOfWeek: args.day_of_week,
          isWorking: args.is_working ?? true,
          startTime: args.start_time || '09:00',
          endTime: args.end_time || '19:00',
        },
        update: data,
      });

      if (args.is_working === false) {
        return { success: true, message: `${prof.name} agora tem FOLGA na ${dayName}` };
      }

      return {
        success: true,
        message: `Horário de ${prof.name} na ${dayName}: ${args.start_time || '(sem mudança)'} às ${args.end_time || '(sem mudança)'}`,
      };
    }

    case 'update_appointment_status': {
      const appointment = await prisma.appointment.findUnique({
        where: { id: args.appointment_id },
        include: { professional: true, service: true, client: true },
      });

      if (!appointment) {
        return { success: false, message: `Agendamento #${args.appointment_id} não encontrado` };
      }

      const validStatuses = ['CONFIRMED', 'COMPLETED', 'CANCELLED', 'NO_SHOW'];
      if (!validStatuses.includes(args.new_status)) {
        return { success: false, message: `Status inválido. Use: ${validStatuses.join(', ')}` };
      }

      const updateData: any = { status: args.new_status };
      if (args.new_status === 'CANCELLED') {
        updateData.cancelledAt = new Date();
        updateData.cancelReason = args.reason || 'Cancelado pela gerência';
      }

      await prisma.appointment.update({
        where: { id: args.appointment_id },
        data: updateData,
      });

      return {
        success: true,
        message: `Agendamento #${args.appointment_id} alterado para ${args.new_status} (${appointment.client.name || 'Cliente'} - ${appointment.service.name} com ${appointment.professional.name})`,
      };
    }

    case 'list_professionals': {
      const where: any = {};
      if (!args.include_inactive) where.active = true;

      const professionals = await prisma.professional.findMany({
        where,
        include: {
          services: { include: { service: true } },
          workSchedule: { orderBy: { dayOfWeek: 'asc' } },
          _count: { select: { appointments: true } },
        },
        orderBy: { name: 'asc' },
      });

      return professionals.map(p => ({
        id: p.id,
        name: p.name,
        phone: p.phone || 'sem telefone',
        active: p.active,
        totalAppointments: p._count.appointments,
        services: p.services.map(ps => ps.service.name).slice(0, 5),
        workDays: p.workSchedule
          .filter(ws => ws.isWorking)
          .map(ws => {
            const days = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
            return `${days[ws.dayOfWeek]} ${ws.startTime}-${ws.endTime}`;
          }),
      }));
    }

    case 'search_clients': {
      const query = args.query;
      const isPhone = /^\d+$/.test(query.replace(/\D/g, ''));

      let clients;
      if (isPhone) {
        const normalized = normalizePhone(query);
        clients = await prisma.client.findMany({
          where: { phone: { contains: normalized.slice(-8) } },
          include: { _count: { select: { appointments: true } } },
          take: 10,
        });
      } else {
        clients = await prisma.client.findMany({
          where: { name: { contains: query, mode: 'insensitive' } },
          include: { _count: { select: { appointments: true } } },
          take: 10,
        });
      }

      if (clients.length === 0) {
        return { found: false, message: `Nenhuma cliente encontrada com "${query}"` };
      }

      return {
        found: true,
        count: clients.length,
        clients: clients.map(c => ({
          phone: c.phone,
          name: c.name || 'Sem nome',
          preferredProfessional: c.preferredProfessional || 'nenhuma',
          totalAppointments: c._count.appointments,
          createdAt: c.createdAt.toISOString().split('T')[0],
        })),
      };
    }

    case 'update_client_info': {
      const phone = normalizePhone(args.client_phone);
      const client = await prisma.client.findUnique({ where: { phone } });

      if (!client) {
        return { success: false, message: `Cliente com telefone ${args.client_phone} não encontrada` };
      }

      const data: any = {};
      if (args.new_name) data.name = args.new_name;
      if (args.preferred_professional) data.preferredProfessional = args.preferred_professional;

      await prisma.client.update({ where: { phone }, data });

      return {
        success: true,
        message: `Dados atualizados: ${args.new_name || client.name} (${phone})`,
      };
    }

    default:
      return { error: `Função admin desconhecida: ${name}` };
  }
}
