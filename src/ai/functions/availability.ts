import { searchServices, getServicesByCategory, getProfessionalsForService, findProfessional } from '../../services/catalog';
import { checkProfessionalAvailability, getAvailableSlots } from '../../services/professional';

/**
 * Declaracoes de funcoes de disponibilidade (JSON Schema para OpenAI)
 */
export const availabilityFunctionDeclarations = [
  {
    name: 'list_services',
    description: 'Lista servicos do salao. Use para buscar servicos por nome ou categoria. Retorna nome, preco, duracao e profissionais disponiveis.',
    parameters: {
      type: 'object' as const,
      properties: {
        search: {
          type: 'string' as const,
          description: 'Termo de busca para encontrar servicos (ex: "unha gel", "corte", "depilacao")',
        },
        category: {
          type: 'string' as const,
          description: 'Filtrar por categoria: "Esmalteria", "Cabelos", "Depilação Cera", "Luz Pulsada | Epilação", "Estética"',
        },
      },
    },
  },
  {
    name: 'check_service_professionals',
    description: 'Verifica quais profissionais podem realizar um servico especifico. Use quando a cliente perguntar quem faz determinado servico.',
    parameters: {
      type: 'object' as const,
      properties: {
        service_name: {
          type: 'string' as const,
          description: 'Nome do servico (pode ser aproximado, ex: "unha gel", "progressiva")',
        },
      },
      required: ['service_name'],
    },
  },
  {
    name: 'check_availability',
    description: 'Verifica se uma profissional esta disponivel em uma data e horario especificos para um servico. Use ANTES de agendar para confirmar disponibilidade.',
    parameters: {
      type: 'object' as const,
      properties: {
        service_name: {
          type: 'string' as const,
          description: 'Nome do servico',
        },
        professional_name: {
          type: 'string' as const,
          description: 'Nome da profissional',
        },
        date: {
          type: 'string' as const,
          description: 'Data no formato YYYY-MM-DD',
        },
        time: {
          type: 'string' as const,
          description: 'Horario no formato HH:mm (ex: "14:00", "09:30")',
        },
      },
      required: ['service_name', 'professional_name', 'date', 'time'],
    },
  },
  {
    name: 'list_available_slots',
    description: 'Lista todos os horarios disponiveis de uma profissional em uma data especifica. Use quando a cliente quer saber que horarios tem livres.',
    parameters: {
      type: 'object' as const,
      properties: {
        professional_name: {
          type: 'string' as const,
          description: 'Nome da profissional',
        },
        date: {
          type: 'string' as const,
          description: 'Data no formato YYYY-MM-DD',
        },
        service_name: {
          type: 'string' as const,
          description: 'Nome do servico (para calcular duracao do slot)',
        },
      },
      required: ['professional_name', 'date'],
    },
  },
];

/**
 * Executa uma funcao de disponibilidade e retorna o resultado
 */
export async function executeAvailabilityFunction(
  name: string,
  args: Record<string, any>
): Promise<any> {
  switch (name) {
    case 'list_services': {
      if (args.category) {
        const results = await getServicesByCategory(args.category);
        if (results.length === 0) {
          return { found: false, message: 'Nenhum servico encontrado nessa categoria' };
        }
        return { found: true, services: results };
      }
      if (args.search) {
        const results = await searchServices(args.search, 8);
        if (results.length === 0) {
          return { found: false, message: 'Nenhum servico encontrado com esse nome. Tente outros termos.' };
        }
        return { found: true, services: results };
      }
      // Sem filtro, retorna categorias disponiveis
      return {
        categories: ['Esmalteria', 'Cabelos', 'Depilação Cera', 'Luz Pulsada | Epilação', 'Estética'],
        message: 'Temos servicos nessas categorias. Qual te interessa?',
      };
    }

    case 'check_service_professionals': {
      const result = await getProfessionalsForService(args.service_name);
      if (!result.service) {
        // Tentar busca fuzzy
        const similar = await searchServices(args.service_name, 3);
        return {
          found: false,
          message: 'Servico nao encontrado',
          suggestions: similar.map((s) => s.name),
        };
      }
      return {
        found: true,
        service: result.service,
        professionals: result.professionals,
      };
    }

    case 'check_availability': {
      // Primeiro encontrar o servico e profissional
      const services = await searchServices(args.service_name, 1);
      if (services.length === 0) {
        return { available: false, reason: 'Servico nao encontrado' };
      }
      const service = services[0];

      const professional = await findProfessional(args.professional_name);
      if (!professional) {
        return { available: false, reason: 'Profissional nao encontrada' };
      }

      // Verificar se a profissional faz esse servico (comparação case-insensitive)
      const profNameUpper = professional.name.toUpperCase();
      if (!service.professionals.some(p => p.toUpperCase() === profNameUpper)) {
        return {
          available: false,
          reason: `${professional.name} nao realiza ${service.name}`,
          professionals_who_can: service.professionals,
        };
      }

      const result = await checkProfessionalAvailability(
        professional.id,
        args.date,
        args.time,
        service.durationMinutes
      );

      return {
        ...result,
        service_id: service.id,
        service_name: service.name,
        service_price: service.price,
        service_duration: service.durationMinutes,
        professional_id: professional.id,
        professional_name: professional.name,
      };
    }

    case 'list_available_slots': {
      const professional = await findProfessional(args.professional_name);
      if (!professional) {
        return { error: 'Profissional nao encontrada' };
      }

      let duration = 30;
      if (args.service_name) {
        const services = await searchServices(args.service_name, 1);
        if (services.length > 0) {
          duration = services[0].durationMinutes;
        }
      }

      const slots = await getAvailableSlots(professional.id, args.date, duration);
      return {
        professional: professional.name,
        date: args.date,
        available_slots: slots,
        total: slots.length,
      };
    }

    default:
      return { error: `Funcao desconhecida: ${name}` };
  }
}
