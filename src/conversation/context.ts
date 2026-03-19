import { PrismaClient } from '@prisma/client';
import { normalizePhone } from '../utils/phone';

const prisma = new PrismaClient();

/**
 * Verifica se um telefone e de admin
 */
export async function isAdminPhone(phone: string): Promise<boolean> {
  const normalized = normalizePhone(phone);

  const admin = await prisma.adminUser.findUnique({
    where: { phone: normalized },
  });

  return admin !== null;
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
