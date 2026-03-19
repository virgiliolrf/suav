import { format, parse, isAfter, isBefore, addMinutes, startOfDay, endOfDay, setHours, setMinutes } from 'date-fns';
import { ptBR } from 'date-fns/locale';

// Horarios de funcionamento da SUAV
const BUSINESS_HOURS: Record<number, { start: string; end: string } | null> = {
  0: null,               // Domingo - fechado
  1: { start: '09:00', end: '19:00' }, // Segunda
  2: { start: '09:00', end: '19:00' }, // Terca
  3: { start: '09:00', end: '19:00' }, // Quarta
  4: { start: '09:00', end: '19:00' }, // Quinta
  5: { start: '09:00', end: '19:00' }, // Sexta
  6: { start: '09:00', end: '17:00' }, // Sabado
};

/**
 * Verifica se um horario esta dentro do expediente
 */
export function isWithinBusinessHours(date: Date): boolean {
  const dayOfWeek = date.getDay();
  const hours = BUSINESS_HOURS[dayOfWeek];

  if (!hours) return false;

  const timeStr = format(date, 'HH:mm');
  return timeStr >= hours.start && timeStr < hours.end;
}

/**
 * Verifica se o salao esta aberto em um dia da semana
 */
export function isWorkingDay(dayOfWeek: number): boolean {
  return BUSINESS_HOURS[dayOfWeek] !== null;
}

/**
 * Retorna horario de funcionamento de um dia
 */
export function getBusinessHours(dayOfWeek: number): { start: string; end: string } | null {
  return BUSINESS_HOURS[dayOfWeek] || null;
}

/**
 * Verifica se uma data/hora e no passado
 */
export function isPastDate(date: Date): boolean {
  return isBefore(date, new Date());
}

/**
 * Verifica se um agendamento cabe no horario comercial
 * (inicio e fim do servico devem estar dentro do expediente)
 */
export function fitsInBusinessHours(startDate: Date, durationMinutes: number): boolean {
  const endDate = addMinutes(startDate, durationMinutes);
  const dayOfWeek = startDate.getDay();
  const hours = BUSINESS_HOURS[dayOfWeek];

  if (!hours) return false;

  const startTime = format(startDate, 'HH:mm');
  const endTime = format(endDate, 'HH:mm');

  return startTime >= hours.start && endTime <= hours.end;
}

/**
 * Formata data para exibicao amigavel em portugues
 * Ex: "quinta-feira, 20 de marco de 2026"
 */
export function formatDateBR(date: Date): string {
  return format(date, "EEEE, d 'de' MMMM 'de' yyyy", { locale: ptBR });
}

/**
 * Formata horario: "14:00"
 */
export function formatTime(date: Date): string {
  return format(date, 'HH:mm');
}

/**
 * Formata data e hora completa
 * Ex: "quinta-feira, 20 de marco as 14:00"
 */
export function formatDateTimeBR(date: Date): string {
  return format(date, "EEEE, d 'de' MMMM 'as' HH:mm", { locale: ptBR });
}

/**
 * Cria um Date a partir de data (YYYY-MM-DD) e hora (HH:mm)
 */
export function createDateTime(dateStr: string, timeStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  const [hours, minutes] = timeStr.split(':').map(Number);

  const date = new Date(year, month - 1, day, hours, minutes, 0, 0);
  return date;
}

/**
 * Retorna texto descritivo do horario de funcionamento
 */
export function getBusinessHoursText(): string {
  return 'Segunda a sexta das 09:00 as 19:00, sabado das 09:00 as 17:00. Domingo estamos fechados.';
}

/**
 * Gera slots de horario disponiveis para um dia, dado um intervalo
 */
export function generateTimeSlots(dayOfWeek: number, intervalMinutes: number = 30): string[] {
  const hours = BUSINESS_HOURS[dayOfWeek];
  if (!hours) return [];

  const slots: string[] = [];
  const [startH, startM] = hours.start.split(':').map(Number);
  const [endH, endM] = hours.end.split(':').map(Number);

  let currentMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;

  while (currentMinutes < endMinutes) {
    const h = Math.floor(currentMinutes / 60);
    const m = currentMinutes % 60;
    slots.push(`${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`);
    currentMinutes += intervalMinutes;
  }

  return slots;
}
