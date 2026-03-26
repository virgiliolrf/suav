import { availabilityFunctionDeclarations, executeAvailabilityFunction } from './availability';
import { schedulingFunctionDeclarations, schedulingFunctionDeclarationsWhatsApp, executeSchedulingFunction } from './scheduling';
import { adminFunctionDeclarations, executeAdminFunction } from './admin';
import { professionalFunctionDeclarations, executeProfessionalFunction } from './professional-funcs';
import { escalationFunctionDeclaration, adminEscalationDeclarations, executeEscalationFunction } from './escalation';

/**
 * Todas as funcoes disponiveis para clientes (Instagram — precisa pedir telefone)
 */
export const clientFunctionDeclarations = [
  ...availabilityFunctionDeclarations,
  ...schedulingFunctionDeclarations,
  escalationFunctionDeclaration,
];

/**
 * Funcoes para clientes WhatsApp (client_phone NAO required — injetado automaticamente)
 */
export const clientFunctionDeclarationsWhatsApp = [
  ...availabilityFunctionDeclarations,
  ...schedulingFunctionDeclarationsWhatsApp,
  escalationFunctionDeclaration,
];

/**
 * Todas as funcoes disponiveis para admins (cliente + admin + bloqueio + escalação)
 */
export const adminAllFunctionDeclarations = [
  ...availabilityFunctionDeclarations,
  ...schedulingFunctionDeclarations,
  ...adminFunctionDeclarations,
  ...adminEscalationDeclarations,
];

/**
 * Funcoes disponiveis para profissionais (agenda pessoal + disponibilidade basica)
 */
export const professionalAllFunctionDeclarations = [
  ...professionalFunctionDeclarations,
  ...availabilityFunctionDeclarations,
];

/**
 * Executa qualquer funcao pelo nome
 */
export async function executeFunction(
  name: string,
  args: Record<string, any>,
  professionalId?: number
): Promise<any> {
  // Funcoes de profissional (precisam do professionalId)
  if (['my_schedule', 'my_week_schedule', 'my_revenue', 'my_next_client', 'block_my_time', 'unblock_my_time', 'mark_completed'].includes(name)) {
    if (!professionalId) return { error: 'Função disponível apenas para profissionais' };
    return executeProfessionalFunction(name, args, professionalId);
  }

  // Funcoes de disponibilidade
  if (['list_services', 'check_service_professionals', 'check_availability', 'list_available_slots'].includes(name)) {
    return executeAvailabilityFunction(name, args);
  }

  // Funcoes de agendamento
  if (['book_appointment', 'get_client_appointments', 'cancel_appointment', 'reschedule_appointment', 'save_client_name'].includes(name)) {
    return executeSchedulingFunction(name, args);
  }

  // Funcoes de escalação (reclamação)
  if (['report_complaint', 'list_escalations', 'resolve_escalation'].includes(name)) {
    return executeEscalationFunction(name, args);
  }

  // Funcoes admin
  if (['query_revenue', 'query_appointment_stats', 'query_top_performers', 'query_client_stats', 'query_client_history', 'query_day_appointments', 'block_time_slot', 'unblock_time_slot', 'update_service_price', 'toggle_professional_status', 'update_work_schedule', 'update_appointment_status', 'list_professionals', 'search_clients', 'update_client_info', 'query_no_shows', 'query_cancellations', 'query_peak_hours', 'query_client_retention', 'admin_query', 'admin_modify', 'admin_report'].includes(name)) {
    return executeAdminFunction(name, args);
  }

  return { error: `Funcao desconhecida: ${name}` };
}
