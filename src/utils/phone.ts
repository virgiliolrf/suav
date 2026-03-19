/**
 * Normaliza numero de telefone para formato padrao: 5511999998888
 */
export function normalizePhone(phone: string): string {
  let cleaned = phone.replace(/\D/g, '');

  // Remove @s.whatsapp.net ou @c.us
  cleaned = cleaned.split('@')[0];

  // Se comecar com 55 e tiver 12-13 digitos, ta ok
  if (cleaned.startsWith('55') && cleaned.length >= 12) {
    return cleaned;
  }

  // Se tiver 10-11 digitos, adiciona 55
  if (cleaned.length >= 10 && cleaned.length <= 11) {
    return '55' + cleaned;
  }

  return cleaned;
}

/**
 * Converte telefone normalizado para JID do WhatsApp
 */
export function phoneToJid(phone: string): string {
  const normalized = normalizePhone(phone);
  return `${normalized}@s.whatsapp.net`;
}

/**
 * Extrai telefone de um JID do WhatsApp
 */
export function jidToPhone(jid: string): string {
  return jid.replace(/@s\.whatsapp\.net$/, '').replace(/@c\.us$/, '');
}

/**
 * Formata telefone para exibicao: (11) 99999-8888
 */
export function formatPhone(phone: string): string {
  const normalized = normalizePhone(phone);
  const local = normalized.startsWith('55') ? normalized.slice(2) : normalized;

  if (local.length === 11) {
    return `(${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`;
  }
  if (local.length === 10) {
    return `(${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`;
  }
  return phone;
}
