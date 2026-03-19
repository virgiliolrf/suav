import { Type } from '@google/genai';
import { queryRevenue, queryAppointmentStats, queryTopPerformers, queryClientStats, getClientHistory } from '../../services/admin-query';
import { format, startOfMonth, startOfWeek, endOfDay } from 'date-fns';

/**
 * Declaracoes de funcoes admin para o Gemini
 */
export const adminFunctionDeclarations = [
  {
    name: 'query_revenue',
    description: 'Consulta o faturamento do salao em um periodo. Retorna total, detalhamento por profissional e por categoria.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        start_date: {
          type: Type.STRING,
          description: 'Data inicio no formato YYYY-MM-DD',
        },
        end_date: {
          type: Type.STRING,
          description: 'Data fim no formato YYYY-MM-DD',
        },
        professional_name: {
          type: Type.STRING,
          description: 'Filtrar por profissional (opcional)',
        },
      },
      required: ['start_date', 'end_date'],
    },
  },
  {
    name: 'query_appointment_stats',
    description: 'Estatisticas de agendamentos: total, confirmados, cancelados, no-show. Pode agrupar por profissional, servico, dia ou status.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        start_date: {
          type: Type.STRING,
          description: 'Data inicio YYYY-MM-DD',
        },
        end_date: {
          type: Type.STRING,
          description: 'Data fim YYYY-MM-DD',
        },
        group_by: {
          type: Type.STRING,
          description: 'Agrupar por: "professional", "service", "day" ou "status"',
        },
      },
      required: ['start_date', 'end_date'],
    },
  },
  {
    name: 'query_top_performers',
    description: 'Ranking das profissionais por faturamento ou numero de atendimentos em um periodo.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        metric: {
          type: Type.STRING,
          description: '"revenue" para faturamento ou "appointments" para numero de atendimentos',
        },
        start_date: {
          type: Type.STRING,
          description: 'Data inicio YYYY-MM-DD',
        },
        end_date: {
          type: Type.STRING,
          description: 'Data fim YYYY-MM-DD',
        },
      },
      required: ['metric', 'start_date', 'end_date'],
    },
  },
  {
    name: 'query_client_stats',
    description: 'Estatisticas de clientes: total, novos, recorrentes e ranking de clientes mais frequentes.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        start_date: {
          type: Type.STRING,
          description: 'Data inicio YYYY-MM-DD',
        },
        end_date: {
          type: Type.STRING,
          description: 'Data fim YYYY-MM-DD',
        },
      },
      required: ['start_date', 'end_date'],
    },
  },
  {
    name: 'query_client_history',
    description: 'Busca historico completo de visitas de uma cliente especifica pelo telefone. Mostra todos os atendimentos, servicos e valores.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        client_phone: {
          type: Type.STRING,
          description: 'Telefone da cliente com DDD (ex: 5527999998888)',
        },
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

    default:
      return { error: `Funcao admin desconhecida: ${name}` };
  }
}
