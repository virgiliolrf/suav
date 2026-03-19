import { ServiceData, CategoryData, ProfessionalData } from '../types/service';

/**
 * Categorias da SUAV
 */
export const CATEGORIES: CategoryData[] = [
  { name: 'Esmalteria', slug: 'esmalteria' },
  { name: 'Cabelos', slug: 'cabelos' },
  { name: 'Depilação Cera', slug: 'depilacao-cera' },
  { name: 'Luz Pulsada | Epilação', slug: 'luz-pulsada-epilacao' },
  { name: 'Estética', slug: 'estetica' },
];

/**
 * Profissionais da SUAV (16 profissionais)
 * Atualizado conforme planilha "serviços suav2.xlsx"
 */
export const PROFESSIONALS: ProfessionalData[] = [
  { name: 'LUCIANA', normalizedName: 'luciana', phone: '5527988559333' },
  { name: 'TATIANI', normalizedName: 'tatiani', phone: '5527988055028' },
  { name: 'LORENA', normalizedName: 'lorena', phone: '5527997011813' },
  { name: 'SIL', normalizedName: 'sil', phone: '5527988710015' },
  { name: 'MIRIAM', normalizedName: 'miriam', phone: '5527999584275' },
  { name: 'RAYANNE', normalizedName: 'rayanne', phone: '5527995183731' },
  { name: 'THAIS', normalizedName: 'thais', phone: '5527997722617' },
  { name: 'THAIS GOMES', normalizedName: 'thais gomes', phone: '5527998881926' },
  { name: 'LARISSA', normalizedName: 'larissa', phone: '5527992589125' },
  { name: 'CLAU', normalizedName: 'clau', phone: '5527988122934' },
  { name: 'RAI', normalizedName: 'rai', phone: '5527997535722' },
  { name: 'DANIELA', normalizedName: 'daniela', phone: '5527996905233' },
  { name: 'LUANA', normalizedName: 'luana', phone: '559684284828' },
  { name: 'ERIKA', normalizedName: 'erika', phone: '5527997479025' },
  { name: 'LORENA MARTINS', normalizedName: 'lorena martins', phone: '559681292286' },
];

// Grupos de profissionais reutilizaveis
const ESMALTERIA_GERAL = ['LUCIANA', 'TATIANI', 'LORENA', 'SIL', 'MIRIAM', 'RAYANNE'];
const ESMALTERIA_GEL = ['LARISSA', 'CLAU'];
const DEPILACAO = ['DANIELA', 'LUANA', 'LORENA MARTINS', 'ERIKA'];
const CABELOS = ['RAI', 'THAIS GOMES'];

/**
 * Catalogo completo: 101 servicos da SUAV
 * Extraido da planilha "servicos suav.xls"
 */
export const SERVICES: ServiceData[] = [
  // ==================== ESMALTERIA (26 servicos) ====================
  { name: 'Unha Infantil', price: 19, durationMinutes: 20, category: 'Esmalteria', professionals: ESMALTERIA_GERAL },
  { name: 'Unha Infantil - Mão + Pé', price: 37, durationMinutes: 40, category: 'Esmalteria', professionals: ESMALTERIA_GERAL },
  { name: 'Unha Express (Esmaltar)', price: 25, durationMinutes: 20, category: 'Esmalteria', professionals: ESMALTERIA_GERAL },
  { name: 'Unha Express - Mão + Pé', price: 50, durationMinutes: 40, category: 'Esmalteria', professionals: ESMALTERIA_GERAL },
  { name: 'Unha Tradicional - Mão', price: 35, durationMinutes: 30, category: 'Esmalteria', professionals: ESMALTERIA_GERAL },
  { name: 'Unha Tradicional - Pé', price: 35, durationMinutes: 30, category: 'Esmalteria', professionals: ESMALTERIA_GERAL },
  { name: 'Unha Tradicional - Mão + Pé', price: 70, durationMinutes: 60, category: 'Esmalteria', professionals: ESMALTERIA_GERAL },
  { name: 'Unha Francesinha - Mão', price: 38, durationMinutes: 40, category: 'Esmalteria', professionals: ESMALTERIA_GERAL },
  { name: 'Unha Francesinha - Pé', price: 38, durationMinutes: 40, category: 'Esmalteria', professionals: ESMALTERIA_GERAL },
  { name: 'Esmalte Efeito Gel - Pé ou Mão', price: 3, durationMinutes: 20, category: 'Esmalteria', professionals: ESMALTERIA_GERAL },
  { name: 'Aplicação Unha em Gel', price: 189, durationMinutes: 120, category: 'Esmalteria', professionals: ESMALTERIA_GEL },
  { name: 'Manutenção Unha Gel', price: 149, durationMinutes: 90, category: 'Esmalteria', professionals: ESMALTERIA_GEL },
  { name: 'Unha Individual (até 5 unhas)', price: 20, durationMinutes: 20, category: 'Esmalteria', professionals: ESMALTERIA_GEL },
  { name: 'Banho de Gel / Blindagem', price: 140, durationMinutes: 80, category: 'Esmalteria', professionals: ESMALTERIA_GEL },
  { name: 'Esmaltação Gel', price: 95, durationMinutes: 60, category: 'Esmalteria', professionals: ESMALTERIA_GEL },
  { name: 'Lixar Unha - Gel ou Fibra', price: 27, durationMinutes: 10, category: 'Esmalteria', professionals: ESMALTERIA_GEL },
  { name: 'Lixa Pé', price: 6, durationMinutes: 10, category: 'Esmalteria', professionals: ['LUCIANA', 'TATIANI', 'LORENA', 'SIL', 'MIRIAM', 'RAYANNE'] },
  { name: 'Remoção Unha Gel', price: 50, durationMinutes: 30, category: 'Esmalteria', professionals: ESMALTERIA_GEL },
  { name: 'Decoração Unha Individual (até 5 unhas)', price: 5, durationMinutes: 10, category: 'Esmalteria', professionals: ESMALTERIA_GERAL },
  { name: 'SPA dos Pés Tradicional', price: 90, durationMinutes: 60, category: 'Esmalteria', professionals: ESMALTERIA_GERAL },
  { name: 'SPA dos Pés Tradicional + Pé Tradicional', price: 110, durationMinutes: 60, category: 'Esmalteria', professionals: ESMALTERIA_GERAL },
  { name: 'Spa dos Pés com Remoção de Calosidade', price: 120, durationMinutes: 60, category: 'Esmalteria', professionals: ESMALTERIA_GERAL },
  { name: 'Spa dos Pés com Remoção de Calosidade + Pé Tradicional', price: 120, durationMinutes: 60, category: 'Esmalteria', professionals: ESMALTERIA_GERAL },
  { name: 'Spa dos Pés Molhado Granado + Pé Tradicional', price: 120, durationMinutes: 60, category: 'Esmalteria', professionals: ESMALTERIA_GERAL },
  { name: 'Plástica dos Pés Tradicional', price: 120, durationMinutes: 60, category: 'Esmalteria', professionals: ESMALTERIA_GERAL },

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

  // ==================== DEPILAÇÃO CERA (34 servicos) ====================
  { name: 'Depilação Abdômen', price: 38, durationMinutes: 30, category: 'Depilação Cera', professionals: DEPILACAO },
  { name: 'Depilação Axilas', price: 32, durationMinutes: 10, category: 'Depilação Cera', professionals: DEPILACAO },
  { name: 'Depilação Barba Completa', price: 64, durationMinutes: 20, category: 'Depilação Cera', professionals: DEPILACAO },
  { name: 'Depilação Barba Modelada', price: 69, durationMinutes: 20, category: 'Depilação Cera', professionals: DEPILACAO },
  { name: 'Depilação Bigode', price: 32, durationMinutes: 15, category: 'Depilação Cera', professionals: DEPILACAO },
  { name: 'Depilação Bochechas', price: 27, durationMinutes: 15, category: 'Depilação Cera', professionals: DEPILACAO },
  { name: 'Depilação Braços', price: 45, durationMinutes: 30, category: 'Depilação Cera', professionals: DEPILACAO },
  { name: 'Depilação Buço', price: 24, durationMinutes: 10, category: 'Depilação Cera', professionals: DEPILACAO },
  { name: 'Depilação Cavanhaque', price: 32, durationMinutes: 15, category: 'Depilação Cera', professionals: DEPILACAO },
  { name: 'Depilação Coxas', price: 55, durationMinutes: 30, category: 'Depilação Cera', professionals: DEPILACAO },
  { name: 'Depilação Entre Seios', price: 18, durationMinutes: 20, category: 'Depilação Cera', professionals: DEPILACAO },
  { name: 'Depilação Faixa', price: 22, durationMinutes: 20, category: 'Depilação Cera', professionals: DEPILACAO },
  { name: 'Depilação Lateral Anal', price: 32, durationMinutes: 20, category: 'Depilação Cera', professionals: DEPILACAO },
  { name: 'Depilação Linha Abdominal', price: 21, durationMinutes: 30, category: 'Depilação Cera', professionals: DEPILACAO },
  { name: 'Depilação Linha do Diafragma', price: 21, durationMinutes: 20, category: 'Depilação Cera', professionals: DEPILACAO },
  { name: 'Depilação Mãos', price: 16, durationMinutes: 10, category: 'Depilação Cera', professionals: DEPILACAO },
  { name: 'Depilação Nádegas', price: 39, durationMinutes: 20, category: 'Depilação Cera', professionals: DEPILACAO },
  { name: 'Depilação Nariz', price: 25, durationMinutes: 10, category: 'Depilação Cera', professionals: DEPILACAO },
  { name: 'Depilação Nuca', price: 22, durationMinutes: 20, category: 'Depilação Cera', professionals: DEPILACAO },
  { name: 'Depilação Orelhas', price: 28, durationMinutes: 10, category: 'Depilação Cera', professionals: DEPILACAO },
  { name: 'Depilação Pernas 1/2', price: 49, durationMinutes: 30, category: 'Depilação Cera', professionals: DEPILACAO },
  { name: 'Depilação Pernas Completas', price: 85, durationMinutes: 30, category: 'Depilação Cera', professionals: DEPILACAO },
  { name: 'Depilação Pés', price: 22, durationMinutes: 10, category: 'Depilação Cera', professionals: DEPILACAO },
  { name: 'Depilação Pescoço', price: 24, durationMinutes: 20, category: 'Depilação Cera', professionals: DEPILACAO },
  { name: 'Depilação Quadril', price: 21, durationMinutes: 20, category: 'Depilação Cera', professionals: DEPILACAO },
  { name: 'Depilação Queixo', price: 21, durationMinutes: 10, category: 'Depilação Cera', professionals: DEPILACAO },
  { name: 'Depilação Região Dorsal', price: 41, durationMinutes: 30, category: 'Depilação Cera', professionals: DEPILACAO },
  { name: 'Depilação Região Lombar', price: 41, durationMinutes: 30, category: 'Depilação Cera', professionals: DEPILACAO },
  { name: 'Depilação Seios', price: 24, durationMinutes: 20, category: 'Depilação Cera', professionals: DEPILACAO },
  { name: 'Depilação Testa', price: 22, durationMinutes: 10, category: 'Depilação Cera', professionals: DEPILACAO },
  { name: 'Depilação Tórax', price: 45, durationMinutes: 20, category: 'Depilação Cera', professionals: DEPILACAO },
  { name: 'Depilação Virilha', price: 38, durationMinutes: 15, category: 'Depilação Cera', professionals: DEPILACAO },
  { name: 'Depilação Virilha Cavada', price: 48, durationMinutes: 15, category: 'Depilação Cera', professionals: DEPILACAO },
  { name: 'Depilação Virilha Frontal', price: 52, durationMinutes: 15, category: 'Depilação Cera', professionals: DEPILACAO },

  // ==================== LUZ PULSADA / EPILAÇÃO (19 servicos) ====================
  { name: 'Luz Pulsada ½ Pernas', price: 145, durationMinutes: 30, category: 'Luz Pulsada | Epilação', professionals: ['DANIELA'] },
  { name: 'Luz Pulsada Abdômen', price: 88, durationMinutes: 30, category: 'Luz Pulsada | Epilação', professionals: ['DANIELA'] },
  { name: 'Luz Pulsada Antebraços', price: 90, durationMinutes: 30, category: 'Luz Pulsada | Epilação', professionals: ['DANIELA'] },
  { name: 'Luz Pulsada Axilas', price: 80, durationMinutes: 30, category: 'Luz Pulsada | Epilação', professionals: ['DANIELA'] },
  { name: 'Luz Pulsada Braços', price: 90, durationMinutes: 30, category: 'Luz Pulsada | Epilação', professionals: ['DANIELA'] },
  { name: 'Luz Pulsada Braços Completos', price: 150, durationMinutes: 60, category: 'Luz Pulsada | Epilação', professionals: ['DANIELA'] },
  { name: 'Luz Pulsada Buço / Bigode', price: 75, durationMinutes: 20, category: 'Luz Pulsada | Epilação', professionals: ['DANIELA'] },
  { name: 'Luz Pulsada Coxas', price: 146, durationMinutes: 60, category: 'Luz Pulsada | Epilação', professionals: ['DANIELA'] },
  { name: 'Luz Pulsada Glúteos', price: 121, durationMinutes: 40, category: 'Luz Pulsada | Epilação', professionals: ['DANIELA'] },
  { name: 'Luz Pulsada Lateral Anal', price: 76, durationMinutes: 40, category: 'Luz Pulsada | Epilação', professionals: ['DANIELA'] },
  { name: 'Luz Pulsada Nuca', price: 75, durationMinutes: 30, category: 'Luz Pulsada | Epilação', professionals: ['DANIELA'] },
  { name: 'Luz Pulsada Orelhas', price: 65, durationMinutes: 30, category: 'Luz Pulsada | Epilação', professionals: ['DANIELA'] },
  { name: 'Luz Pulsada Pernas Completas', price: 247, durationMinutes: 90, category: 'Luz Pulsada | Epilação', professionals: ['DANIELA'] },
  { name: 'Luz Pulsada Pescoço', price: 81, durationMinutes: 30, category: 'Luz Pulsada | Epilação', professionals: ['DANIELA'] },
  { name: 'Luz Pulsada Região Dorsal', price: 88, durationMinutes: 40, category: 'Luz Pulsada | Epilação', professionals: ['DANIELA'] },
  { name: 'Luz Pulsada Região Lombar', price: 88, durationMinutes: 40, category: 'Luz Pulsada | Epilação', professionals: ['DANIELA'] },
  { name: 'Luz Pulsada Região Pubiana', price: 88, durationMinutes: 40, category: 'Luz Pulsada | Epilação', professionals: ['DANIELA'] },
  { name: 'Luz Pulsada Rosto', price: 88, durationMinutes: 60, category: 'Luz Pulsada | Epilação', professionals: ['DANIELA'] },
  { name: 'Luz Pulsada Tórax', price: 88, durationMinutes: 40, category: 'Luz Pulsada | Epilação', professionals: ['DANIELA'] },

  // ==================== ESTÉTICA (11 servicos) ====================
  { name: 'Drenagem Linfática (sessão individual)', price: 199, durationMinutes: 60, category: 'Estética', professionals: ['DANIELA'] },
  { name: 'Massagem Relaxante / Drenagem / Modeladora', price: 150, durationMinutes: 60, category: 'Estética', professionals: ['DANIELA'] },
  { name: 'Drenagem + Manta Térmica', price: 200, durationMinutes: 60, category: 'Estética', professionals: ['DANIELA'] },
  { name: 'Ultrassom', price: 150, durationMinutes: 20, category: 'Estética', professionals: ['DANIELA'] },
  { name: 'Limpeza de Pele + Hidratação', price: 180, durationMinutes: 60, category: 'Estética', professionals: ['DANIELA'] },
  { name: 'Maquiagem', price: 180, durationMinutes: 60, category: 'Estética', professionals: ['LUANA', 'ERIKA'] },
  { name: 'Lifting', price: 160, durationMinutes: 60, category: 'Estética', professionals: ['DANIELA', 'LUANA', 'LORENA'] },
  { name: 'Extensão de Cílios (a partir de)', price: 180, durationMinutes: 120, category: 'Estética', professionals: ['LUANA', 'LORENA MARTINS'] },
  { name: 'Remoção de Cílios', price: 53, durationMinutes: 30, category: 'Estética', professionals: ['LUANA', 'LORENA MARTINS'] },
  { name: 'Coloração Sobrancelha (Henna ou Tintura)', price: 30, durationMinutes: 120, category: 'Estética', professionals: ['LUANA', 'LORENA MARTINS', 'ERIKA'] },
  { name: 'Design de Sobrancelhas', price: 55, durationMinutes: 30, category: 'Estética', professionals: ['LUANA', 'LORENA MARTINS', 'ERIKA'] },
  { name: 'Efeito Laminado (brow lamination)', price: 165, durationMinutes: 20, category: 'Estética', professionals: ['LUANA', 'LORENA MARTINS'] },
];
