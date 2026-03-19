import { Type } from '@google/genai';
import { PrismaClient } from '@prisma/client';
import { bookAppointment, bookAppointmentByName, cancelAppointment, rescheduleAppointment, getClientAppointments } from '../../services/appointment';
import { notifyProfessional, notifyCancellation, notifyReschedule } from '../../services/notification';
import { saveClientName } from '../../services/client';
import { normalizePhone } from '../../utils/phone';
import { logger } from '../../utils/logger';

const prisma = new PrismaClient();

/**
 * Declaracoes de funcoes de agendamento para o Gemini
 */
export const schedulingFunctionDeclarations = [
  {
    name: 'book_appointment',
    description: 'Finaliza e confirma um agendamento. Use SOMENTE apos a cliente ter confirmado todos os detalhes. Aceita nomes do servico e profissional (preferivel) OU IDs numericos.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        service_name: {
          type: Type.STRING,
          description: 'Nome do servico (ex: "Manutencao Unha Gel", "Corte (a partir de)")',
        },
        professional_name: {
          type: Type.STRING,
          description: 'Nome da profissional (ex: "LARISSA", "RAI")',
        },
        service_id: {
          type: Type.NUMBER,
          description: 'ID do servico (opcional, se tiver do check_availability)',
        },
        professional_id: {
          type: Type.NUMBER,
          description: 'ID da profissional (opcional, se tiver do check_availability)',
        },
        client_phone: {
          type: Type.STRING,
          description: 'Telefone da cliente com DDD',
        },
        date: {
          type: Type.STRING,
          description: 'Data no formato YYYY-MM-DD',
        },
        time: {
          type: Type.STRING,
          description: 'Horario no formato HH:mm',
        },
        client_name: {
          type: Type.STRING,
          description: 'Nome da cliente (se souber)',
        },
      },
      required: ['client_phone', 'date', 'time'],
    },
  },
  {
    name: 'get_client_appointments',
    description: 'Lista os agendamentos futuros de uma cliente. Use quando a cliente quiser ver, cancelar ou reagendar seus horarios.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        client_phone: {
          type: Type.STRING,
          description: 'Telefone da cliente',
        },
        status: {
          type: Type.STRING,
          description: 'Filtrar por status: "CONFIRMED", "CANCELLED", "COMPLETED". Se nao informar, mostra apenas confirmados.',
        },
      },
      required: ['client_phone'],
    },
  },
  {
    name: 'cancel_appointment',
    description: 'Cancela um agendamento existente pelo ID. Primeiro use get_client_appointments para encontrar o ID.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        appointment_id: {
          type: Type.NUMBER,
          description: 'ID do agendamento a cancelar',
        },
        reason: {
          type: Type.STRING,
          description: 'Motivo do cancelamento (opcional)',
        },
      },
      required: ['appointment_id'],
    },
  },
  {
    name: 'reschedule_appointment',
    description: 'Reagenda um agendamento existente para nova data e horario. Primeiro use get_client_appointments para encontrar o ID.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        appointment_id: {
          type: Type.NUMBER,
          description: 'ID do agendamento a reagendar',
        },
        new_date: {
          type: Type.STRING,
          description: 'Nova data no formato YYYY-MM-DD',
        },
        new_time: {
          type: Type.STRING,
          description: 'Novo horario no formato HH:mm',
        },
      },
      required: ['appointment_id', 'new_date', 'new_time'],
    },
  },
  {
    name: 'save_client_name',
    description: 'Salva o nome da cliente no cadastro, vinculado ao telefone. Chame SEMPRE que a cliente disser o nome dela pela primeira vez na conversa. Isso faz com que nas proximas conversas voce ja saiba o nome dela.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        client_phone: {
          type: Type.STRING,
          description: 'Telefone da cliente',
        },
        client_name: {
          type: Type.STRING,
          description: 'Nome da cliente como ela disse',
        },
      },
      required: ['client_phone', 'client_name'],
    },
  },
];

/**
 * Executa uma funcao de agendamento
 */
export async function executeSchedulingFunction(
  name: string,
  args: Record<string, any>
): Promise<any> {
  switch (name) {
    case 'book_appointment': {
      let result;

      // Se tem nomes, usar lookup por nome (mais robusto)
      if (args.service_name && args.professional_name) {
        result = await bookAppointmentByName({
          serviceName: args.service_name,
          professionalName: args.professional_name,
          clientPhone: args.client_phone,
          clientName: args.client_name,
          date: args.date,
          time: args.time,
        });
      } else if (args.service_id && args.professional_id) {
        // Fallback: IDs numericos
        result = await bookAppointment({
          serviceId: args.service_id,
          professionalId: args.professional_id,
          clientPhone: args.client_phone,
          clientName: args.client_name,
          date: args.date,
          time: args.time,
        });
      } else {
        return { success: false, message: 'Informe o nome do servico e da profissional, ou os IDs.' };
      }

      // Se agendou com sucesso, notificar funcionaria
      if (result.success && result.appointmentId) {
        notifyProfessional(result.appointmentId).catch(() => {});

        // Persistir mapeamento Instagram IGSID → phone
        if (args.__igsid && args.client_phone) {
          const phone = normalizePhone(args.client_phone);
          prisma.instagramClient.upsert({
            where: { igsid: args.__igsid },
            create: { igsid: args.__igsid, phone },
            update: { phone },
          }).catch((err: any) => logger.error({ msg: 'Erro ao salvar Instagram IGSID', err }));
        }
      }

      return result;
    }

    case 'get_client_appointments': {
      const phone = normalizePhone(args.client_phone);
      const appointments = await getClientAppointments(phone, args.status);

      if (appointments.length === 0) {
        return { found: false, message: 'Nenhum agendamento encontrado' };
      }

      return {
        found: true,
        count: appointments.length,
        appointments,
      };
    }

    case 'cancel_appointment': {
      const result = await cancelAppointment(args.appointment_id, args.reason);

      if (result.success) {
        notifyCancellation(args.appointment_id).catch(() => {});
      }

      return result;
    }

    case 'reschedule_appointment': {
      const result = await rescheduleAppointment(
        args.appointment_id,
        args.new_date,
        args.new_time
      );

      if (result.success && result.appointmentId) {
        notifyReschedule(result.appointmentId).catch(() => {});
      }

      return result;
    }

    case 'save_client_name': {
      const phone = normalizePhone(args.client_phone);
      return saveClientName(phone, args.client_name);
    }

    default:
      return { error: `Funcao desconhecida: ${name}` };
  }
}
