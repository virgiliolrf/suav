import { availabilityFunctionDeclarations, executeAvailabilityFunction } from './availability';
import { schedulingFunctionDeclarations, executeSchedulingFunction } from './scheduling';
import { adminFunctionDeclarations, executeAdminFunction } from './admin';

/**
 * Todas as funcoes disponiveis para clientes
 */
export const clientFunctionDeclarations = [
  ...availabilityFunctionDeclarations,
  ...schedulingFunctionDeclarations,
];

/**
 * Todas as funcoes disponiveis para admins (cliente + admin)
 */
export const adminAllFunctionDeclarations = [
  ...availabilityFunctionDeclarations,
  ...schedulingFunctionDeclarations,
  ...adminFunctionDeclarations,
];

/**
 * Executa qualquer funcao pelo nome
 */
export async function executeFunction(name: string, args: Record<string, any>): Promise<any> {
  // Funcoes de disponibilidade
  if (['list_services', 'check_service_professionals', 'check_availability', 'list_available_slots'].includes(name)) {
    return executeAvailabilityFunction(name, args);
  }

  // Funcoes de agendamento
  if (['book_appointment', 'get_client_appointments', 'cancel_appointment', 'reschedule_appointment', 'save_client_name'].includes(name)) {
    return executeSchedulingFunction(name, args);
  }

  // Funcoes admin
  if (['query_revenue', 'query_appointment_stats', 'query_top_performers', 'query_client_stats', 'query_client_history', 'query_day_appointments'].includes(name)) {
    return executeAdminFunction(name, args);
  }

  return { error: `Funcao desconhecida: ${name}` };
}
