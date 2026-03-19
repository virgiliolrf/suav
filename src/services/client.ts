import { PrismaClient } from '@prisma/client';
import { normalizePhone } from '../utils/phone';

const prisma = new PrismaClient();

/**
 * Busca ou cria um cliente pelo telefone
 */
export async function getOrCreateClient(phone: string, name?: string): Promise<{
  id: number;
  phone: string;
  name: string | null;
}> {
  const normalized = normalizePhone(phone);

  let client = await prisma.client.findUnique({
    where: { phone: normalized },
  });

  if (!client) {
    client = await prisma.client.create({
      data: {
        phone: normalized,
        name: name || null,
      },
    });
  } else if (name && !client.name) {
    // Atualizar nome se cliente existia sem nome
    client = await prisma.client.update({
      where: { id: client.id },
      data: { name },
    });
  }

  return {
    id: client.id,
    phone: client.phone,
    name: client.name,
  };
}
