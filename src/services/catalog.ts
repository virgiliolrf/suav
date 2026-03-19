import { PrismaClient } from '@prisma/client';
import { fuzzySearch, normalize } from '../utils/fuzzy';
import { logger } from '../utils/logger';

const prisma = new PrismaClient();

interface ServiceResult {
  id: number;
  name: string;
  price: number;
  durationMinutes: number;
  category: string;
  professionals: string[];
}

/**
 * Busca servicos por nome (fuzzy matching)
 */
export async function searchServices(query: string, limit: number = 5): Promise<ServiceResult[]> {
  const services = await prisma.service.findMany({
    where: { active: true },
    include: {
      category: true,
      professionals: {
        include: { professional: true },
      },
    },
  });

  const matches = fuzzySearch(
    query,
    services,
    (s) => s.name,
    0.25
  );

  return matches.slice(0, limit).map((m) => ({
    id: m.item.id,
    name: m.item.name,
    price: m.item.price,
    durationMinutes: m.item.durationMinutes,
    category: m.item.category.name,
    professionals: m.item.professionals.map((ps) => ps.professional.name),
  }));
}

/**
 * Busca servicos por categoria
 */
export async function getServicesByCategory(categoryName: string): Promise<ServiceResult[]> {
  const normalizedCategory = normalize(categoryName);

  // SQLite: contains ja e case-insensitive por padrao
  const category = await prisma.category.findFirst({
    where: {
      OR: [
        { slug: { contains: normalizedCategory } },
        { name: { contains: categoryName } },
      ],
    },
  });

  if (!category) return [];

  const services = await prisma.service.findMany({
    where: { categoryId: category.id, active: true },
    include: {
      category: true,
      professionals: {
        include: { professional: true },
      },
    },
  });

  return services.map((s) => ({
    id: s.id,
    name: s.name,
    price: s.price,
    durationMinutes: s.durationMinutes,
    category: s.category.name,
    professionals: s.professionals.map((ps) => ps.professional.name),
  }));
}

/**
 * Busca servico por ID
 */
export async function getServiceById(id: number): Promise<ServiceResult | null> {
  const service = await prisma.service.findUnique({
    where: { id },
    include: {
      category: true,
      professionals: {
        include: { professional: true },
      },
    },
  });

  if (!service) return null;

  return {
    id: service.id,
    name: service.name,
    price: service.price,
    durationMinutes: service.durationMinutes,
    category: service.category.name,
    professionals: service.professionals.map((ps) => ps.professional.name),
  };
}

/**
 * Busca profissionais que podem fazer um servico (pelo nome do servico, fuzzy)
 */
export async function getProfessionalsForService(serviceName: string): Promise<{
  service: { id: number; name: string; price: number; duration: number } | null;
  professionals: { id: number; name: string }[];
}> {
  const results = await searchServices(serviceName, 1);

  if (results.length === 0) {
    return { service: null, professionals: [] };
  }

  const service = results[0];
  const profLinks = await prisma.professionalService.findMany({
    where: { serviceId: service.id },
    include: { professional: true },
  });

  return {
    service: {
      id: service.id,
      name: service.name,
      price: service.price,
      duration: service.durationMinutes,
    },
    professionals: profLinks.map((pl) => ({
      id: pl.professional.id,
      name: pl.professional.name,
    })),
  };
}

/**
 * Busca profissional por nome (fuzzy)
 */
export async function findProfessional(name: string): Promise<{ id: number; name: string } | null> {
  const professionals = await prisma.professional.findMany({
    where: { active: true },
  });

  const matches = fuzzySearch(name, professionals, (p) => p.name, 0.4);

  // Tambem checar pelo normalizedName
  const normalizedQuery = normalize(name);
  const exactMatch = professionals.find(
    (p) => p.normalizedName === normalizedQuery || p.normalizedName.includes(normalizedQuery)
  );

  if (exactMatch) {
    return { id: exactMatch.id, name: exactMatch.name };
  }

  if (matches.length > 0) {
    return { id: matches[0].item.id, name: matches[0].item.name };
  }

  return null;
}

/**
 * Verifica se uma profissional pode fazer um servico
 */
export async function canProfessionalDoService(
  professionalId: number,
  serviceId: number
): Promise<boolean> {
  const link = await prisma.professionalService.findUnique({
    where: {
      professionalId_serviceId: {
        professionalId,
        serviceId,
      },
    },
  });

  return link !== null;
}
