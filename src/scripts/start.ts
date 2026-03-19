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
  // Verificar se o banco ja tem dados (seed somente se vazio)
  const prisma = new PrismaClient();
  try {
    const count = await prisma.category.count();
    if (count === 0) {
      console.log('[start] Banco vazio detectado, rodando seed...');
      execSync('npx tsx prisma/seed.ts', { stdio: 'inherit' });
    } else {
      console.log(`[start] Banco ja possui dados (${count} categorias). Seed pulado.`);
    }
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
