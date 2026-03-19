import { PrismaClient } from '@prisma/client';
import { normalizePhone } from '../utils/phone';
import { logger } from '../utils/logger';

const prisma = new PrismaClient();

/**
 * Verifica se um telefone e de admin
 * Faz verificacao flexivel: com e sem 9o digito, com e sem 55
 */
export async function isAdminPhone(phone: string): Promise<boolean> {
  const normalized = normalizePhone(phone);

  // Buscar todos os admins (poucos registros, nao impacta performance)
  const admins = await prisma.adminUser.findMany();

  if (admins.length === 0) {
    logger.debug({ msg: 'Nenhum admin cadastrado no banco' });
    return false;
  }

  // Verificar match flexivel
  for (const admin of admins) {
    const adminNorm = normalizePhone(admin.phone);

    // Match exato
    if (normalized === adminNorm) {
      logger.info({ msg: 'Admin detectado (match exato)', phone: normalized, role: admin.role });
      return true;
    }

    // Extrair parte local (sem 55)
    const phoneLocal = normalized.startsWith('55') ? normalized.slice(2) : normalized;
    const adminLocal = adminNorm.startsWith('55') ? adminNorm.slice(2) : adminNorm;

    // Match sem country code
    if (phoneLocal === adminLocal) {
      logger.info({ msg: 'Admin detectado (sem country code)', phone: normalized, role: admin.role });
      return true;
    }

    // Match com/sem 9o digito (DDD + 8 digitos vs DDD + 9 digitos)
    // Ex: 27999722372 (11 dig) vs 2799722372 (10 dig)
    if (phoneLocal.length === 11 && adminLocal.length === 10) {
      // phoneLocal tem 9o digito, adminLocal nao
      const withoutNinth = phoneLocal.slice(0, 2) + phoneLocal.slice(3);
      if (withoutNinth === adminLocal) {
        logger.info({ msg: 'Admin detectado (9o digito)', phone: normalized, role: admin.role });
        return true;
      }
    } else if (phoneLocal.length === 10 && adminLocal.length === 11) {
      // adminLocal tem 9o digito, phoneLocal nao
      const withoutNinth = adminLocal.slice(0, 2) + adminLocal.slice(3);
      if (withoutNinth === phoneLocal) {
        logger.info({ msg: 'Admin detectado (9o digito inverso)', phone: normalized, role: admin.role });
        return true;
      }
    }
  }

  logger.debug({ msg: 'Nao e admin', phone: normalized, adminsNoDb: admins.map(a => a.phone) });
  return false;
}

/**
 * Busca dados do admin
 */
export async function getAdminInfo(phone: string): Promise<{
  name: string;
  role: string;
} | null> {
  const normalized = normalizePhone(phone);

  const admin = await prisma.adminUser.findUnique({
    where: { phone: normalized },
  });

  if (!admin) return null;

  return { name: admin.name, role: admin.role };
}

/**
 * Verifica se um telefone é de uma profissional
 */
export async function isProfessionalPhone(phone: string): Promise<{
  id: number;
  name: string;
} | null> {
  const normalized = normalizePhone(phone);

  const professionals = await prisma.professional.findMany({
    where: { active: true, phone: { not: null } },
  });

  for (const prof of professionals) {
    if (!prof.phone) continue;
    const profNorm = normalizePhone(prof.phone);

    if (normalized === profNorm) return { id: prof.id, name: prof.name };

    const phoneLocal = normalized.startsWith('55') ? normalized.slice(2) : normalized;
    const profLocal = profNorm.startsWith('55') ? profNorm.slice(2) : profNorm;
    if (phoneLocal === profLocal) return { id: prof.id, name: prof.name };

    if (phoneLocal.length === 11 && profLocal.length === 10) {
      if (phoneLocal.slice(0, 2) + phoneLocal.slice(3) === profLocal) return { id: prof.id, name: prof.name };
    } else if (phoneLocal.length === 10 && profLocal.length === 11) {
      if (profLocal.slice(0, 2) + profLocal.slice(3) === phoneLocal) return { id: prof.id, name: prof.name };
    }
  }

  return null;
}
