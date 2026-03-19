import { availabilityFunctionDeclarations, executeAvailabilityFunction } from './availability';
import { schedulingFunctionDeclarations, executeSchedulingFunction } from './scheduling';
import { adminFunctionDeclarations, executeAdminFunction } from './admin';
import { professionalFunctionDeclarations, executeProfessionalFunction } from './professional-funcs';

/**
 * Todas as funcoes disponiveis para clientes
 */
export const clientFunctionDeclarations = [
  ...availabilityFunctionDeclarations,
  ...schedulingFunctionDeclarations,
];

/**
 * Todas as funcoes disponiveis para admins (cliente + admin + bloqueio)
 */
export const adminAllFunctionDeclarations = [
  ...availabilityFunctionDeclarations,
  ...schedulingFunctionDeclarations,
  ...adminFunctionDeclarations,
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
  if (['my_schedule', 'my_week_schedule'].includes(name)) {
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

  // Funcoes admin
  if (['query_revenue', 'query_appointment_stats', 'query_top_performers', 'query_client_stats', 'query_client_history', 'query_day_appointments', 'block_time_slot', 'unblock_time_slot', 'update_service_price', 'toggle_professional_status', 'update_work_schedule', 'update_appointment_status', 'list_professionals', 'search_clients', 'update_client_info'].includes(name)) {
    return executeAdminFunction(name, args);
  }

  return { error: `Funcao desconhecida: ${name}` };
}
