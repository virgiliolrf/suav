import { execSync } from 'child_process';
import { PrismaClient } from '@prisma/client';

function normalizeText(text: string): string {
  return text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9\s]/g, '').trim().replace(/\s+/g, ' ');
}

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('[start] DATABASE_URL nao configurada!');
  process.exit(1);
}

console.log('[start] Conectando ao PostgreSQL...');

// Criar tabelas no banco (se nao existirem)
console.log('[start] Aplicando schema...');
try {
  execSync('npx prisma db push --accept-data-loss', {
    stdio: 'inherit',
  });
} catch (err) {
  console.error('[start] Erro ao aplicar schema:', err);
  process.exit(1);
}

async function main() {
  const prisma = new PrismaClient();
  try {
    // Verificar se o banco precisa de seed (vazio ou catálogo desatualizado)
    const categoryCount = await prisma.category.count();
    const serviceCount = await prisma.service.count({ where: { active: true } });
    const EXPECTED_CATEGORIES = 2; // Esmalteria + Cabelos
    const EXPECTED_SERVICES = 18;

    if (categoryCount === 0) {
      console.log('[start] Banco vazio detectado, rodando seed...');
      execSync('npx tsx prisma/seed.ts', { stdio: 'inherit' });
    } else if (categoryCount > EXPECTED_CATEGORIES || serviceCount > EXPECTED_SERVICES + 5) {
      console.log(`[start] Catálogo desatualizado (${categoryCount} categorias, ${serviceCount} serviços ativos). Desativando serviços/profissionais antigos...`);
      // Desativar profissionais que não estão mais na lista
      const { PROFESSIONALS: expectedProfs } = require('../config/services');
      const expectedNames = expectedProfs.map((p: any) => p.normalizedName);
      await prisma.professional.updateMany({
        where: { normalizedName: { notIn: expectedNames } },
        data: { active: false },
      });
      console.log('[start] Profissionais antigos desativados.');
      // Desativar serviços das categorias removidas
      const { CATEGORIES: expectedCats } = require('../config/services');
      const expectedSlugs = expectedCats.map((c: any) => c.slug);
      const removedCategories = await prisma.category.findMany({
        where: { slug: { notIn: expectedSlugs } },
      });
      for (const cat of removedCategories) {
        await prisma.service.updateMany({
          where: { categoryId: cat.id },
          data: { active: false },
        });
        console.log(`[start] Serviços da categoria "${cat.name}" desativados.`);
      }
      // Desativar serviços de esmalteria que não estão mais na lista
      const { SERVICES: expectedServices } = require('../config/services');
      const expectedServiceNames = expectedServices.map((s: any) => normalizeText(s.name));
      const allActiveServices = await prisma.service.findMany({ where: { active: true } });
      for (const svc of allActiveServices) {
        if (!expectedServiceNames.includes(normalizeText(svc.name))) {
          await prisma.service.update({ where: { id: svc.id }, data: { active: false } });
          console.log(`[start] Serviço desativado: "${svc.name}"`);
        }
      }
      // Atualizar preço da Aplicação Unha em Gel (189→199)
      await prisma.service.updateMany({
        where: { normalizedName: 'aplicacao unha em gel' },
        data: { price: 199 },
      });
      console.log('[start] Catálogo atualizado (sem perder histórico).');
    } else {
      console.log(`[start] Banco OK (${categoryCount} categorias, ${serviceCount} serviços). Seed pulado.`);
    }

    // === GARANTIR ADMINS NO BANCO (sempre, nao apenas no seed) ===
    const ownerPhone = process.env.ADMIN_OWNER_PHONE;
    const ownerName = process.env.ADMIN_OWNER_NAME || 'Dona';
    const managerPhone = process.env.ADMIN_MANAGER_PHONE;
    const managerName = process.env.ADMIN_MANAGER_NAME || 'Gerente';

    console.log(`[start] Env ADMIN_OWNER_PHONE: "${ownerPhone || '(vazio)'}"`);
    console.log(`[start] Env ADMIN_MANAGER_PHONE: "${managerPhone || '(vazio)'}"`);

    if (ownerPhone) {
      await prisma.adminUser.upsert({
        where: { phone: ownerPhone },
        create: { phone: ownerPhone, role: 'owner', name: ownerName },
        update: { name: ownerName, role: 'owner' },
      });
      console.log(`[start] Admin (dona) garantida no banco: ${ownerPhone}`);
    } else {
      console.log('[start] AVISO: ADMIN_OWNER_PHONE nao configurada!');
    }

    if (managerPhone) {
      await prisma.adminUser.upsert({
        where: { phone: managerPhone },
        create: { phone: managerPhone, role: 'manager', name: managerName },
        update: { name: managerName, role: 'manager' },
      });
      console.log(`[start] Admin (gerente) garantida no banco: ${managerPhone}`);
    } else {
      console.log('[start] AVISO: ADMIN_MANAGER_PHONE nao configurada!');
    }

    // Listar admins no banco pra confirmar
    const allAdmins = await prisma.adminUser.findMany();
    console.log(`[start] Total de admins no banco: ${allAdmins.length}`);
    for (const adm of allAdmins) {
      console.log(`[start]   - ${adm.role}: ${adm.phone} (${adm.name})`);
    }

    // === GARANTIR TELEFONES DAS PROFISSIONAIS NO BANCO ===
    const { PROFESSIONALS } = require('../config/services');
    for (const prof of PROFESSIONALS) {
      if (prof.phone) {
        await prisma.professional.updateMany({
          where: { normalizedName: prof.normalizedName },
          data: { phone: prof.phone },
        });
      }
    }
    console.log('[start] Telefones das profissionais atualizados.');

  } catch (err) {
    console.error('[start] Erro ao verificar/seed:', err);
  } finally {
    await prisma.$disconnect();
  }

  // Iniciar o bot
  console.log('[start] Iniciando bot...');
  require('../index');
}

main().catch((err) => {
  console.error('[start] Erro fatal:', err);
  process.exit(1);
});
