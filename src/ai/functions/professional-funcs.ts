import { Type } from '@google/genai';
import { getProfessionalScheduleForDay } from '../../services/professional';
import { format, addDays } from 'date-fns';

/**
 * Funções exclusivas para profissionais
 */
export const professionalFunctionDeclarations = [
  {
    name: 'my_schedule',
    description: 'Mostra a agenda da profissional para um dia específico. Mostra todos os atendimentos com horário, serviço, cliente e valor.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        date: {
          type: Type.STRING,
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
      type: Type.OBJECT,
      properties: {
        start_date: {
          type: Type.STRING,
          description: 'Data de início no formato YYYY-MM-DD. Normalmente a data de hoje.',
        },
      },
      required: ['start_date'],
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
            dayName: format(day, 'EEEE'),
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

    default:
      return { error: `Função desconhecida: ${name}` };
  }
}
