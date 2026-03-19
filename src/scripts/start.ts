import { execSync } from 'child_process';
import { PrismaClient } from '@prisma/client';

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
    // Verificar se o banco ja tem dados (seed somente se vazio)
    const count = await prisma.category.count();
    if (count === 0) {
      console.log('[start] Banco vazio detectado, rodando seed...');
      execSync('npx tsx prisma/seed.ts', { stdio: 'inherit' });
    } else {
      console.log(`[start] Banco ja possui dados (${count} categorias). Seed pulado.`);
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
