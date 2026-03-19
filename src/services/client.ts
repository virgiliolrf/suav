import { PrismaClient } from '@prisma/client';
import { normalizePhone } from '../utils/phone';
import { logger } from '../utils/logger';

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
    logger.info({ msg: 'Cliente criado', phone: normalized, name: name || null });
  } else if (name && (!client.name || client.name !== name)) {
    // Atualizar nome se cliente existia sem nome ou com nome diferente
    client = await prisma.client.update({
      where: { id: client.id },
      data: { name },
    });
    logger.info({ msg: 'Nome do cliente atualizado', phone: normalized, name });
  }

  return {
    id: client.id,
    phone: client.phone,
    name: client.name,
  };
}

/**
 * Salva o nome de uma cliente pelo telefone (sem precisar de agendamento)
 * Chamado pela funcao save_client_name do Gemini
 */
export async function saveClientName(phone: string, name: string): Promise<{
  success: boolean;
  message: string;
}> {
  const normalized = normalizePhone(phone);

  try {
    await prisma.client.upsert({
      where: { phone: normalized },
      create: { phone: normalized, name },
      update: { name },
    });
    logger.info({ msg: 'Nome salvo', phone: normalized, name });
    return { success: true, message: `Nome "${name}" salvo com sucesso.` };
  } catch (error) {
    logger.error({ msg: 'Erro ao salvar nome', phone: normalized, name, error });
    return { success: false, message: 'Erro ao salvar nome.' };
  }
}
