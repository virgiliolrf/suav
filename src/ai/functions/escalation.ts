import { escalateConversation, resolveEscalation, getActiveEscalations } from '../../conversation/manager';
import { formatPhone } from '../../utils/phone';
import { logger } from '../../utils/logger';

/**
 * Função de escalação para clientes (encaminha reclamação para gerência)
 */
export const escalationFunctionDeclaration = {
  name: 'report_complaint',
  description: 'Encaminha uma reclamação para a gerência. Use SEMPRE que a cliente demonstrar insatisfação, reclamação, problema com serviço ou atendimento. Após chamar essa função, diga à cliente que encaminhou para a gerência e que vão entrar em contato.',
  parameters: {
    type: 'object' as const,
    properties: {
      complaint_summary: {
        type: 'string' as const,
        description: 'Resumo da reclamação da cliente em poucas palavras',
      },
      client_phone: {
        type: 'string' as const,
        description: 'Telefone da cliente (preenchido automaticamente no WhatsApp)',
      },
      client_name: {
        type: 'string' as const,
        description: 'Nome da cliente (se souber)',
      },
    },
    required: ['complaint_summary'],
  },
};

/**
 * Funções admin para gerenciar escalações
 */
export const adminEscalationDeclarations = [
  {
    name: 'list_escalations',
    description: 'Lista todas as reclamações/escalações ativas que ainda não foram resolvidas.',
    parameters: {
      type: 'object' as const,
      properties: {},
    },
  },
  {
    name: 'resolve_escalation',
    description: 'Resolve uma escalação/reclamação. Libera o bot para voltar a responder a essa cliente.',
    parameters: {
      type: 'object' as const,
      properties: {
        client_phone: {
          type: 'string' as const,
          description: 'Telefone da cliente cuja escalação deve ser resolvida',
        },
      },
      required: ['client_phone'],
    },
  },
];

/**
 * Executa funções de escalação
 */
export async function executeEscalationFunction(
  name: string,
  args: Record<string, any>
): Promise<any> {
  switch (name) {
    case 'report_complaint': {
      const phone = args.client_phone || 'desconhecido';
      const clientName = args.client_name;

      // Marcar conversa como escalada
      escalateConversation(phone, args.complaint_summary, clientName);

      const displayName = clientName || formatPhone(phone);

      logger.info({
        msg: 'Reclamação registrada',
        phone,
        clientName,
        complaint: args.complaint_summary,
      });

      return {
        success: true,
        escalated: true,
        message: `Reclamação encaminhada para a gerência. Cliente: ${displayName}. O bot vai parar de responder essa cliente até a gerência resolver.`,
        // Este campo será lido pelo agent.ts para notificar admins
        __notify_admins: true,
        __admin_message: [
          `⚠️ Reclamação de cliente!`,
          ``,
          `Cliente: ${displayName}${phone !== 'desconhecido' ? ` (${formatPhone(phone)})` : ''}`,
          `Reclamação: ${args.complaint_summary}`,
          ``,
          `O bot parou de responder essa cliente. Resolva diretamente e depois me diga "resolve escalação ${formatPhone(phone)}" para eu voltar a atender.`,
        ].join('\n'),
      };
    }

    case 'list_escalations': {
      const escalations = getActiveEscalations();
      if (escalations.length === 0) {
        return { found: false, message: 'Nenhuma reclamação pendente.' };
      }
      return {
        found: true,
        count: escalations.length,
        escalations: escalations.map(e => ({
          phone: formatPhone(e.phone),
          rawPhone: e.phone,
          clientName: e.clientName || 'Não informado',
          reason: e.reason,
          escalatedAt: e.escalatedAt.toLocaleString('pt-BR'),
        })),
      };
    }

    case 'resolve_escalation': {
      const resolved = resolveEscalation(args.client_phone);
      if (resolved) {
        return { success: true, message: `Escalação resolvida. O bot volta a atender o número ${formatPhone(args.client_phone)}.` };
      }
      return { success: false, message: `Não encontrei escalação ativa para ${formatPhone(args.client_phone)}.` };
    }

    default:
      return { error: `Função desconhecida: ${name}` };
  }
}
