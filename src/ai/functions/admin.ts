import { PrismaClient } from '@prisma/client';
import { queryRevenue, queryAppointmentStats, queryTopPerformers, queryClientStats, getClientHistory, queryDayAppointments } from '../../services/admin-query';
import { queryNoShows, queryCancellations, queryPeakHours, queryClientRetention } from '../../services/admin-analytics';
import { reportRevenueByService, reportRevenueByProfessionalByService, reportClientFrequency, reportServicePopularity, reportProfessionalUtilization, reportDailySummary, reportNewVsReturning, reportAverageTicket, reportCancellationAnalysis, reportInactiveProfessionals } from '../../services/admin-reports-universal';
import { blockTimeSlot, unblockTimeSlot } from '../../services/professional';
import { findProfessional } from '../../services/catalog';
import { normalizePhone } from '../../utils/phone';
import { normalize } from '../../utils/fuzzy';

const prisma = new PrismaClient();

// ==================== HELPERS UNIVERSAIS ====================

const MODEL_MAP: Record<string, any> = {
  Appointment: () => prisma.appointment,
  Client: () => prisma.client,
  Professional: () => prisma.professional,
  Service: () => prisma.service,
  Category: () => prisma.category,
  ProfessionalService: () => prisma.professionalService,
  WorkSchedule: () => prisma.workSchedule,
  ConversationLog: () => prisma.conversationLog,
  AdminUser: () => prisma.adminUser,
  InstagramClient: () => prisma.instagramClient,
};

function getModelDelegate(table: string) {
  const getter = MODEL_MAP[table];
  if (!getter) throw new Error(`Tabela "${table}" não existe`);
  return getter();
}

const DATE_FIELDS = ['dateTime', 'endTime', 'createdAt', 'updatedAt', 'cancelledAt'];
const OPERATORS = ['gt', 'gte', 'lt', 'lte', 'contains', 'startsWith', 'not', 'in', 'equals'];

function parseFilters(filters: Record<string, any>): Record<string, any> {
  if (!filters) return {};
  const where: Record<string, any> = {};

  for (const [key, value] of Object.entries(filters)) {
    const lastUnderscore = key.lastIndexOf('_');
    let field: string;
    let operator: string;

    if (lastUnderscore > 0) {
      const possibleOp = key.slice(lastUnderscore + 1);
      if (OPERATORS.includes(possibleOp)) {
        field = key.slice(0, lastUnderscore);
        operator = possibleOp;
      } else {
        field = key; operator = 'equals';
      }
    } else {
      field = key; operator = 'equals';
    }

    let processedValue = value;
    if (DATE_FIELDS.includes(field) && typeof value === 'string') {
      processedValue = new Date(value.includes('T') ? value : (operator === 'lte' ? value + 'T23:59:59' : value + 'T00:00:00'));
    }

    if (operator === 'equals') {
      where[field] = processedValue;
    } else if (operator === 'contains' || operator === 'startsWith') {
      where[field] = { [operator]: processedValue, mode: 'insensitive' };
    } else {
      where[field] = { ...where[field], [operator]: processedValue };
    }
  }
  return where;
}

function parseRelationFilters(filterRelations: Record<string, any>): Record<string, any> {
  if (!filterRelations) return {};
  const where: Record<string, any> = {};
  for (const [relation, filters] of Object.entries(filterRelations)) {
    where[relation] = parseFilters(filters as Record<string, any>);
  }
  return where;
}

function buildInclude(includeArr: string[] | undefined): Record<string, boolean> | undefined {
  if (!includeArr || includeArr.length === 0) return undefined;
  const include: Record<string, boolean> = {};
  for (const rel of includeArr) include[rel] = true;
  return include;
}

function buildOrderBy(orderByStr: string | undefined): Record<string, string> | undefined {
  if (!orderByStr) return undefined;
  const desc = orderByStr.startsWith('-');
  const field = desc ? orderByStr.slice(1) : orderByStr;
  return { [field]: desc ? 'desc' : 'asc' };
}

// ==================== QUERY UNIVERSAL ====================

async function executeAdminQuery(args: Record<string, any>): Promise<any> {
  try {
    const model = getModelDelegate(args.table);
    const baseWhere = parseFilters(args.filters || {});
    const relationWhere = parseRelationFilters(args.filter_relations || {});
    const where = { ...baseWhere, ...relationWhere };
    const include = buildInclude(args.include);
    const orderBy = buildOrderBy(args.order_by);
    const limit = Math.min(args.limit || 50, 200);

    switch (args.action) {
      case 'findMany': {
        const results = await model.findMany({
          where, include, orderBy, take: limit, skip: args.offset || 0,
        });
        // Truncar ConversationLog content
        if (args.table === 'ConversationLog') {
          for (const r of results) {
            if (r.content && r.content.length > 200) r.content = r.content.slice(0, 200) + '...';
          }
        }
        return { _meta: { table: args.table, action: 'findMany', count: results.length, limit }, results };
      }
      case 'findFirst': {
        const result = await model.findFirst({ where, include, orderBy });
        return { _meta: { table: args.table, action: 'findFirst', found: !!result }, result };
      }
      case 'count': {
        const count = await model.count({ where });
        return { _meta: { table: args.table, action: 'count' }, count };
      }
      case 'aggregate': {
        if (args.group_by_field) {
          // groupBy com agregação
          const groupByResult = await model.groupBy({
            by: [args.group_by_field],
            where,
            _count: true,
            ...(args.aggregate_field && args.aggregate_fn === 'sum' ? { _sum: { [args.aggregate_field]: true } } : {}),
            ...(args.aggregate_field && args.aggregate_fn === 'avg' ? { _avg: { [args.aggregate_field]: true } } : {}),
            ...(args.aggregate_field && args.aggregate_fn === 'min' ? { _min: { [args.aggregate_field]: true } } : {}),
            ...(args.aggregate_field && args.aggregate_fn === 'max' ? { _max: { [args.aggregate_field]: true } } : {}),
          });
          return { _meta: { table: args.table, action: 'aggregate+groupBy' }, groups: groupByResult };
        }
        const aggObj: any = {};
        if (args.aggregate_fn && args.aggregate_field) {
          aggObj[`_${args.aggregate_fn}`] = { [args.aggregate_field]: true };
        }
        aggObj._count = true;
        const aggResult = await model.aggregate({ where, ...aggObj });
        return { _meta: { table: args.table, action: 'aggregate' }, ...aggResult };
      }
      case 'groupBy': {
        const field = args.group_by_field;
        if (!field) return { error: 'group_by_field é obrigatório para action=groupBy' };
        const groups = await model.groupBy({
          by: [field], where, _count: true,
          ...(args.aggregate_field ? { _sum: { [args.aggregate_field]: true } } : {}),
        });
        return { _meta: { table: args.table, action: 'groupBy', groups: groups.length }, groups };
      }
      default:
        return { error: `action "${args.action}" inválida. Use: findMany, findFirst, count, aggregate, groupBy` };
    }
  } catch (err: any) {
    return { error: `Erro na consulta: ${err.message}` };
  }
}

// ==================== MODIFY UNIVERSAL ====================

const READONLY_TABLES = ['ConversationLog', 'InstagramClient'];
const PROTECTED_FIELDS = ['id', 'createdAt', 'updatedAt'];

async function executeAdminModify(args: Record<string, any>): Promise<any> {
  try {
    if (READONLY_TABLES.includes(args.table)) {
      return { success: false, message: `Tabela ${args.table} é somente leitura` };
    }

    const model = getModelDelegate(args.table);
    const data = { ...(args.data || {}) };

    // Remover campos protegidos
    for (const f of PROTECTED_FIELDS) delete data[f];

    // Auto-normalizar names
    if ((args.table === 'Service' || args.table === 'Professional') && data.name && !data.normalizedName) {
      data.normalizedName = normalize(data.name);
    }

    // Converter datas
    for (const field of DATE_FIELDS) {
      if (data[field] && typeof data[field] === 'string') {
        data[field] = new Date(data[field]);
      }
    }

    switch (args.action) {
      case 'create': {
        const created = await model.create({ data });
        return { success: true, action: 'created', record: created };
      }
      case 'update': {
        if (!args.record_id && !args.composite_id) {
          return { success: false, message: 'record_id ou composite_id é obrigatório para update' };
        }
        const whereUpdate = args.table === 'ProfessionalService'
          ? { professionalId_serviceId: args.composite_id }
          : { id: args.record_id };
        const updated = await model.update({ where: whereUpdate, data });
        return { success: true, action: 'updated', record: updated };
      }
      case 'delete': {
        if (!args.record_id && !args.composite_id) {
          return { success: false, message: 'record_id ou composite_id é obrigatório para delete' };
        }
        // Checar dependências
        if (args.table === 'Professional' || args.table === 'Service') {
          const depCount = await prisma.appointment.count({
            where: args.table === 'Professional'
              ? { professionalId: args.record_id }
              : { serviceId: args.record_id },
          });
          if (depCount > 0) {
            return { success: false, message: `Não posso deletar: existem ${depCount} agendamentos vinculados. Sugiro desativar (active=false).` };
          }
        }
        const whereDelete = args.table === 'ProfessionalService'
          ? { professionalId_serviceId: args.composite_id }
          : { id: args.record_id };
        await model.delete({ where: whereDelete });
        return { success: true, action: 'deleted', record_id: args.record_id || args.composite_id };
      }
      default:
        return { error: `action "${args.action}" inválida. Use: create, update, delete` };
    }
  } catch (err: any) {
    if (err.code === 'P2002') return { success: false, message: 'Registro com esse valor já existe (duplicado)' };
    if (err.code === 'P2025') return { success: false, message: 'Registro não encontrado' };
    if (err.code === 'P2003') return { success: false, message: 'Referência inválida — verifique os IDs' };
    return { success: false, message: `Erro: ${err.message}` };
  }
}

// ==================== REPORT UNIVERSAL ====================

async function executeAdminReport(args: Record<string, any>): Promise<any> {
  try {
    const params = { startDate: args.start_date, endDate: args.end_date, professionalName: args.professional_name, serviceName: args.service_name };
    switch (args.report_type) {
      case 'revenue_by_service': return reportRevenueByService(params);
      case 'revenue_by_professional_by_service': return reportRevenueByProfessionalByService(params);
      case 'client_frequency': return reportClientFrequency(params);
      case 'service_popularity': return reportServicePopularity(params);
      case 'professional_utilization': return reportProfessionalUtilization(params);
      case 'daily_summary': return reportDailySummary(params);
      case 'new_vs_returning': return reportNewVsReturning(params);
      case 'average_ticket': return reportAverageTicket(params);
      case 'cancellation_analysis': return reportCancellationAnalysis(params);
      case 'inactive_professionals': return reportInactiveProfessionals(params);
      default: return { error: `Relatório "${args.report_type}" não existe` };
    }
  } catch (err: any) {
    return { error: `Erro no relatório: ${err.message}` };
  }
}

/**
 * Declaracoes de funcoes admin (JSON Schema para OpenAI)
 */
export const adminFunctionDeclarations = [
  {
    name: 'query_revenue',
    description: 'Consulta o faturamento do salão em um período. Retorna total, detalhamento por profissional e por categoria.',
    parameters: {
      type: 'object' as const,
      properties: {
        start_date: { type: 'string' as const, description: 'Data início YYYY-MM-DD' },
        end_date: { type: 'string' as const, description: 'Data fim YYYY-MM-DD' },
        professional_name: { type: 'string' as const, description: 'Filtrar por profissional (opcional)' },
      },
      required: ['start_date', 'end_date'],
    },
  },
  {
    name: 'query_appointment_stats',
    description: 'Estatísticas de agendamentos: total, confirmados, cancelados, no-show. Pode agrupar por profissional, serviço, dia ou status.',
    parameters: {
      type: 'object' as const,
      properties: {
        start_date: { type: 'string' as const, description: 'Data início YYYY-MM-DD' },
        end_date: { type: 'string' as const, description: 'Data fim YYYY-MM-DD' },
        group_by: { type: 'string' as const, description: 'Agrupar por: "professional", "service", "day" ou "status"' },
      },
      required: ['start_date', 'end_date'],
    },
  },
  {
    name: 'query_top_performers',
    description: 'Ranking das profissionais por faturamento ou número de atendimentos em um período.',
    parameters: {
      type: 'object' as const,
      properties: {
        metric: { type: 'string' as const, description: '"revenue" para faturamento ou "appointments" para número de atendimentos' },
        start_date: { type: 'string' as const, description: 'Data início YYYY-MM-DD' },
        end_date: { type: 'string' as const, description: 'Data fim YYYY-MM-DD' },
      },
      required: ['metric', 'start_date', 'end_date'],
    },
  },
  {
    name: 'query_client_stats',
    description: 'Estatísticas de clientes: total, novos, recorrentes e ranking de clientes mais frequentes.',
    parameters: {
      type: 'object' as const,
      properties: {
        start_date: { type: 'string' as const, description: 'Data início YYYY-MM-DD' },
        end_date: { type: 'string' as const, description: 'Data fim YYYY-MM-DD' },
      },
      required: ['start_date', 'end_date'],
    },
  },
  {
    name: 'query_client_history',
    description: 'Busca histórico completo de visitas de uma cliente pelo telefone.',
    parameters: {
      type: 'object' as const,
      properties: {
        client_phone: { type: 'string' as const, description: 'Telefone da cliente com DDD' },
      },
      required: ['client_phone'],
    },
  },
  {
    name: 'query_day_appointments',
    description: 'Lista TODOS os agendamentos de um dia com detalhes: horário, profissional, serviço, cliente, telefone, valor, status. Use quando perguntar "agenda de hoje", "agendamentos de amanhã", etc.',
    parameters: {
      type: 'object' as const,
      properties: {
        date: { type: 'string' as const, description: 'Data YYYY-MM-DD' },
        status: { type: 'string' as const, description: 'Filtrar por status (opcional)' },
        professional_name: { type: 'string' as const, description: 'Filtrar por profissional (opcional)' },
      },
      required: ['date'],
    },
  },
  {
    name: 'block_time_slot',
    description: 'Bloqueia um horário de uma profissional (agendamento externo, reunião, intervalo). Impede que clientes agendem nesse horário.',
    parameters: {
      type: 'object' as const,
      properties: {
        professional_name: { type: 'string' as const, description: 'Nome da profissional' },
        date: { type: 'string' as const, description: 'Data YYYY-MM-DD' },
        time: { type: 'string' as const, description: 'Horário HH:mm' },
        duration_minutes: { type: 'number' as const, description: 'Duração em minutos (padrão: 60)' },
        reason: { type: 'string' as const, description: 'Motivo do bloqueio (opcional)' },
      },
      required: ['professional_name', 'date', 'time'],
    },
  },
  {
    name: 'unblock_time_slot',
    description: 'Remove bloqueio de horário pelo ID.',
    parameters: {
      type: 'object' as const,
      properties: {
        block_id: { type: 'number' as const, description: 'ID do bloqueio' },
      },
      required: ['block_id'],
    },
  },
  // === CRUD ADMIN ===
  {
    name: 'update_service_price',
    description: 'Altera o preço de um serviço. Use quando a dona/gerente pedir pra mudar preço.',
    parameters: {
      type: 'object' as const,
      properties: {
        service_name: { type: 'string' as const, description: 'Nome do serviço (busca parcial)' },
        new_price: { type: 'number' as const, description: 'Novo preço em reais' },
      },
      required: ['service_name', 'new_price'],
    },
  },
  {
    name: 'toggle_professional_status',
    description: 'Ativa ou desativa uma profissional. Profissional desativada não aparece pra clientes.',
    parameters: {
      type: 'object' as const,
      properties: {
        professional_name: { type: 'string' as const, description: 'Nome da profissional' },
        active: { type: 'boolean' as const, description: 'true = ativa, false = desativa' },
      },
      required: ['professional_name', 'active'],
    },
  },
  {
    name: 'update_work_schedule',
    description: 'Altera o horário de trabalho de uma profissional em um dia da semana. Pode definir se trabalha, horário de início e fim.',
    parameters: {
      type: 'object' as const,
      properties: {
        professional_name: { type: 'string' as const, description: 'Nome da profissional' },
        day_of_week: { type: 'number' as const, description: 'Dia: 0=domingo, 1=segunda, 2=terça, 3=quarta, 4=quinta, 5=sexta, 6=sábado' },
        is_working: { type: 'boolean' as const, description: 'true = trabalha, false = folga' },
        start_time: { type: 'string' as const, description: 'Horário início HH:mm (ex: "09:00")' },
        end_time: { type: 'string' as const, description: 'Horário fim HH:mm (ex: "19:00")' },
      },
      required: ['professional_name', 'day_of_week'],
    },
  },
  {
    name: 'update_appointment_status',
    description: 'Altera o status de um agendamento. Use para marcar como COMPLETED, NO_SHOW, ou CANCELLED.',
    parameters: {
      type: 'object' as const,
      properties: {
        appointment_id: { type: 'number' as const, description: 'ID do agendamento' },
        new_status: { type: 'string' as const, description: 'Novo status: CONFIRMED, COMPLETED, CANCELLED, NO_SHOW' },
        reason: { type: 'string' as const, description: 'Motivo (opcional)' },
      },
      required: ['appointment_id', 'new_status'],
    },
  },
  {
    name: 'list_professionals',
    description: 'Lista todas as profissionais com status (ativa/inativa), telefone e serviços que fazem.',
    parameters: {
      type: 'object' as const,
      properties: {
        include_inactive: { type: 'boolean' as const, description: 'Incluir profissionais inativas (padrão: false)' },
      },
    },
  },
  {
    name: 'search_clients',
    description: 'Busca clientes por nome ou telefone. Mostra dados cadastrais e total de agendamentos.',
    parameters: {
      type: 'object' as const,
      properties: {
        query: { type: 'string' as const, description: 'Nome ou telefone pra buscar' },
      },
      required: ['query'],
    },
  },
  {
    name: 'update_client_info',
    description: 'Atualiza dados de uma cliente (nome, profissional preferida).',
    parameters: {
      type: 'object' as const,
      properties: {
        client_phone: { type: 'string' as const, description: 'Telefone da cliente' },
        new_name: { type: 'string' as const, description: 'Novo nome (opcional)' },
        preferred_professional: { type: 'string' as const, description: 'Profissional preferida (opcional)' },
      },
      required: ['client_phone'],
    },
  },
  // === ANALYTICS / INTELIGÊNCIA DO NEGÓCIO ===
  {
    name: 'query_no_shows',
    description: 'Analisa faltas (no-shows): quantas, prejuízo total, clientes reincidentes. Útil para identificar clientes problemáticas.',
    parameters: {
      type: 'object' as const,
      properties: {
        start_date: { type: 'string' as const, description: 'Data início YYYY-MM-DD (padrão: início do mês)' },
        end_date: { type: 'string' as const, description: 'Data fim YYYY-MM-DD (padrão: hoje)' },
      },
    },
  },
  {
    name: 'query_cancellations',
    description: 'Relatório de cancelamentos: total, prejuízo, motivos mais comuns. Útil para entender por que clientes cancelam.',
    parameters: {
      type: 'object' as const,
      properties: {
        start_date: { type: 'string' as const, description: 'Data início YYYY-MM-DD (padrão: início do mês)' },
        end_date: { type: 'string' as const, description: 'Data fim YYYY-MM-DD (padrão: hoje)' },
      },
    },
  },
  {
    name: 'query_peak_hours',
    description: 'Mostra horários e dias de pico (mais agendamentos). Útil para otimizar escala de profissionais.',
    parameters: {
      type: 'object' as const,
      properties: {
        start_date: { type: 'string' as const, description: 'Data início YYYY-MM-DD (padrão: últimos 30 dias)' },
        end_date: { type: 'string' as const, description: 'Data fim YYYY-MM-DD (padrão: hoje)' },
      },
    },
  },
  {
    name: 'query_client_retention',
    description: 'Lista clientes que não voltam há X dias (risco de perder). Útil para campanhas de reativação.',
    parameters: {
      type: 'object' as const,
      properties: {
        days_inactive: { type: 'number' as const, description: 'Dias sem visita para considerar inativa (padrão: 60)' },
      },
    },
  },
  // ==================== FUNÇÕES UNIVERSAIS (AGI) ====================
  {
    name: 'admin_query',
    description: `Consulta universal — busca QUALQUER dado do sistema com filtros, relações, agregação.
Use quando nenhuma função específica atende.

TABELAS: Appointment, Client, Professional, Service, Category, ProfessionalService, WorkSchedule, ConversationLog, AdminUser, InstagramClient

FILTROS: {campo_operador: valor}. Operadores: gt, gte, lt, lte, contains, startsWith, not, in. Sem operador = equals.
Datas: "2026-03-01" (auto-converte). Ex: {price_gt:100, status_in:["CONFIRMED","COMPLETED"], dateTime_gte:"2026-03-01"}

RELAÇÕES (include): Appointment→client,service,professional. Service→category. Professional→services,workSchedule. Client→appointments.
filter_relations: {professional:{name_contains:"Larissa"}}`,
    parameters: {
      type: 'object' as const,
      properties: {
        table: { type: 'string' as const, enum: ['Appointment', 'Client', 'Professional', 'Service', 'Category', 'ProfessionalService', 'WorkSchedule', 'ConversationLog', 'AdminUser', 'InstagramClient'], description: 'Tabela' },
        action: { type: 'string' as const, enum: ['findMany', 'findFirst', 'count', 'aggregate', 'groupBy'], description: 'Tipo de consulta' },
        filters: { type: 'object' as const, description: 'Filtros: {campo_operador: valor}. Ex: {price_gt:100, active:true, dateTime_gte:"2026-03-01"}' },
        filter_relations: { type: 'object' as const, description: 'Filtros em relações: {professional:{name_contains:"Larissa"}}' },
        include: { type: 'array' as const, items: { type: 'string' as const }, description: 'Relações: ["client","service","professional"]' },
        order_by: { type: 'string' as const, description: 'Ordenar: "price", "-dateTime" (- = decrescente)' },
        limit: { type: 'number' as const, description: 'Máx registros (padrão 50, máx 200)' },
        offset: { type: 'number' as const, description: 'Pular N registros' },
        aggregate_fn: { type: 'string' as const, enum: ['count', 'sum', 'avg', 'min', 'max'], description: 'Função de agregação' },
        aggregate_field: { type: 'string' as const, description: 'Campo para agregar: "price", "priceAtBooking"' },
        group_by_field: { type: 'string' as const, description: 'Agrupar por: "status", "professionalId", "categoryId"' },
      },
      required: ['table', 'action'],
    },
  },
  {
    name: 'admin_modify',
    description: `Modifica dados — CRIA, ATUALIZA ou DELETA registros em qualquer tabela.
⚠️ DELETE só com ID específico. ConversationLog e InstagramClient são read-only.

Exemplos:
- Criar serviço: table=Service, action=create, data={name:"Design Sobrancelha", price:45, durationMinutes:30, categoryId:5, active:true}
- Atualizar: table=Service, action=update, record_id=15, data={durationMinutes:45}
- Vincular prof→serviço: table=ProfessionalService, action=create, data={professionalId:1, serviceId:15}
- Deletar: table=Service, action=delete, record_id=15`,
    parameters: {
      type: 'object' as const,
      properties: {
        table: { type: 'string' as const, enum: ['Appointment', 'Client', 'Professional', 'Service', 'Category', 'ProfessionalService', 'WorkSchedule', 'AdminUser'], description: 'Tabela' },
        action: { type: 'string' as const, enum: ['create', 'update', 'delete'], description: 'Ação' },
        record_id: { type: 'number' as const, description: 'ID do registro (para update/delete)' },
        composite_id: { type: 'object' as const, description: 'ID composto ProfessionalService: {professionalId:N, serviceId:N}' },
        data: { type: 'object' as const, description: 'Dados: {name:"X", price:50, active:true}' },
      },
      required: ['table', 'action'],
    },
  },
  {
    name: 'admin_report',
    description: `Relatório analítico cruzando múltiplas tabelas. Use para perguntas complexas de negócio.

Tipos: revenue_by_service, revenue_by_professional_by_service, client_frequency, service_popularity, professional_utilization, daily_summary, new_vs_returning, average_ticket, cancellation_analysis, inactive_professionals`,
    parameters: {
      type: 'object' as const,
      properties: {
        report_type: { type: 'string' as const, enum: ['revenue_by_service', 'revenue_by_professional_by_service', 'client_frequency', 'service_popularity', 'professional_utilization', 'daily_summary', 'new_vs_returning', 'average_ticket', 'cancellation_analysis', 'inactive_professionals'], description: 'Tipo de relatório' },
        start_date: { type: 'string' as const, description: 'Data início YYYY-MM-DD (padrão: início do mês)' },
        end_date: { type: 'string' as const, description: 'Data fim YYYY-MM-DD (padrão: hoje)' },
        professional_name: { type: 'string' as const, description: 'Filtrar por profissional (opcional)' },
        service_name: { type: 'string' as const, description: 'Filtrar por serviço (opcional)' },
      },
      required: ['report_type'],
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
      const searchTerm = args.service_name.toLowerCase();
      const allServices = await prisma.service.findMany({ where: { active: true } });
      const services = allServices.filter(s =>
        s.name.toLowerCase().includes(searchTerm) || s.normalizedName.includes(searchTerm)
      );

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
          workSchedule: true,
        },
        orderBy: { name: 'asc' },
      });

      return {
        total: professionals.length,
        professionals: professionals.map(p => ({
          name: p.name,
          phone: p.phone || 'sem telefone',
          active: p.active,
          qtdServicos: p.services.length,
          dias: p.workSchedule
            .filter(ws => ws.isWorking)
            .sort((a, b) => a.dayOfWeek - b.dayOfWeek)
            .map(ws => ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'][ws.dayOfWeek])
            .join(', '),
        })),
      };
    }

    case 'search_clients': {
      const query = args.query;
      const isPhone = /^\d+$/.test(query.replace(/\D/g, ''));

      let clients;
      if (isPhone) {
        const normalized = normalizePhone(query);
        const allClients = await prisma.client.findMany({
          include: { _count: { select: { appointments: true } } },
        });
        clients = allClients.filter(c => c.phone.includes(normalized.slice(-8))).slice(0, 10);
      } else {
        const searchLower = query.toLowerCase();
        const allClients = await prisma.client.findMany({
          include: { _count: { select: { appointments: true } } },
        });
        clients = allClients.filter(c => c.name?.toLowerCase().includes(searchLower)).slice(0, 10);
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

    // === ANALYTICS ===
    case 'query_no_shows':
      return queryNoShows({
        startDate: args.start_date,
        endDate: args.end_date,
      });

    case 'query_cancellations':
      return queryCancellations({
        startDate: args.start_date,
        endDate: args.end_date,
      });

    case 'query_peak_hours':
      return queryPeakHours({
        startDate: args.start_date,
        endDate: args.end_date,
      });

    case 'query_client_retention':
      return queryClientRetention({
        daysInactive: args.days_inactive,
      });

    // === FUNÇÕES UNIVERSAIS (AGI) ===
    case 'admin_query':
      return executeAdminQuery(args);

    case 'admin_modify':
      return executeAdminModify(args);

    case 'admin_report':
      return executeAdminReport(args);

    default:
      return { error: `Função admin desconhecida: ${name}` };
  }
}
