import { ServiceData, CategoryData, ProfessionalData } from '../types/service';

/**
 * Categorias da SUAV (atualizado planilha "suav salao.xlsx")
 */
export const CATEGORIES: CategoryData[] = [
  { name: 'Esmalteria', slug: 'esmalteria' },
  { name: 'Cabelos', slug: 'cabelos' },
];

/**
 * Profissionais da SUAV (4 profissionais)
 * Atualizado conforme planilha "suav salao.xlsx"
 */
export const PROFESSIONALS: ProfessionalData[] = [
  { name: 'LARISSA', normalizedName: 'larissa', phone: '5527992589125' },
  { name: 'CLAU', normalizedName: 'clau', phone: '5527988122934' },
  { name: 'RAI', normalizedName: 'rai', phone: '5527997535722' },
  { name: 'THAIS GOMES', normalizedName: 'thais gomes', phone: '5527998881926' },
];

// Grupos de profissionais
const ESMALTERIA = ['LARISSA', 'CLAU'];
const CABELOS = ['RAI', 'THAIS GOMES'];

/**
 * Catalogo: 18 servicos da SUAV (agendaveis pelo WhatsApp)
 * Extraido da planilha "suav salao.xlsx"
 * Servicos fora desta lista sao atendidos presencialmente (walk-in)
 */
export const SERVICES: ServiceData[] = [
  // ==================== ESMALTERIA (7 servicos) ====================
  { name: 'Aplicação Unha em Gel', price: 199, durationMinutes: 120, category: 'Esmalteria', professionals: ESMALTERIA },
  { name: 'Manutenção Unha Gel', price: 149, durationMinutes: 90, category: 'Esmalteria', professionals: ESMALTERIA },
  { name: 'Unha Individual (até 5 unhas)', price: 20, durationMinutes: 20, category: 'Esmalteria', professionals: ESMALTERIA },
  { name: 'Banho de Gel / BLINDAGEM', price: 140, durationMinutes: 80, category: 'Esmalteria', professionals: ESMALTERIA },
  { name: 'Esmaltação Gel', price: 95, durationMinutes: 60, category: 'Esmalteria', professionals: ESMALTERIA },
  { name: 'Lixar Unha - Gel ou Fibra', price: 27, durationMinutes: 10, category: 'Esmalteria', professionals: ESMALTERIA },
  { name: 'Remoção Unha Gel', price: 50, durationMinutes: 30, category: 'Esmalteria', professionals: ESMALTERIA },

  // ==================== CABELOS (11 servicos) ====================
  { name: 'Corte (a partir de)', price: 100, durationMinutes: 60, category: 'Cabelos', professionals: CABELOS },
  { name: 'Escova / Chapinha / Babyliss (a partir de)', price: 60, durationMinutes: 40, category: 'Cabelos', professionals: CABELOS },
  { name: 'Aplicação de Coloração (a partir de)', price: 150, durationMinutes: 120, category: 'Cabelos', professionals: CABELOS },
  { name: 'Progressiva (a partir de)', price: 250, durationMinutes: 180, category: 'Cabelos', professionals: CABELOS },
  { name: 'Selagem ou Botox Capilar (a partir de)', price: 250, durationMinutes: 150, category: 'Cabelos', professionals: CABELOS },
  { name: 'Mechas e Papelotes (a partir de)', price: 499, durationMinutes: 240, category: 'Cabelos', professionals: CABELOS },
  { name: 'Retoque de Raiz (a partir de)', price: 220, durationMinutes: 20, category: 'Cabelos', professionals: CABELOS },
  { name: 'Matização (a partir de)', price: 50, durationMinutes: 20, category: 'Cabelos', professionals: CABELOS },
  { name: 'Hidratação Wella / Truss / Braé (a partir de)', price: 180, durationMinutes: 60, category: 'Cabelos', professionals: CABELOS },
  { name: 'Hidratação Kerastase / Loreal / Joico / Teia / Keune (a partir de)', price: 220, durationMinutes: 60, category: 'Cabelos', professionals: CABELOS },
  { name: 'Hidratação CPR / Sencience / Davines (a partir de)', price: 250, durationMinutes: 60, category: 'Cabelos', professionals: CABELOS },
];

/**
 * Palavras-chave de servicos que sao atendidos presencialmente (sem agendamento pelo bot)
 * Se a cliente perguntar sobre estes, o bot explica que e so chegar no salao
 */
export const WALKIN_ONLY_KEYWORDS = [
  'depilacao', 'cera', 'luz pulsada', 'epilacao', 'laser',
  'estetica', 'limpeza de pele', 'drenagem', 'massagem',
  'maquiagem', 'cilios', 'extensao cilios', 'sobrancelha', 'design sobrancelha',
  'manicure', 'pedicure', 'unha tradicional', 'unha express',
  'unha infantil', 'francesinha', 'spa dos pes', 'plastica dos pes',
  'lixa pe', 'decoracao unha', 'esmalte efeito gel', 'henna',
  'lifting', 'ultrassom', 'manta termica', 'brow lamination', 'laminado',
];
