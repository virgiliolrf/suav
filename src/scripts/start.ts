import { execSync } from 'child_process';
import { existsSync, mkdirSync } from 'fs';
import path from 'path';

const DATA_DIR = process.env.DATA_DIR || '.';
const DB_PATH = path.join(DATA_DIR, 'suav.db');

// Garantir que o diretorio de dados existe
if (!existsSync(DATA_DIR)) {
  mkdirSync(DATA_DIR, { recursive: true });
}

// Apontar DATABASE_URL para o volume persistente
process.env.DATABASE_URL = `file:${DB_PATH}`;

const isFirstRun = !existsSync(DB_PATH);

console.log(`[start] DATA_DIR: ${DATA_DIR}`);
console.log(`[start] DATABASE_URL: ${process.env.DATABASE_URL}`);
console.log(`[start] Primeiro run: ${isFirstRun}`);

// Rodar migrations
console.log('[start] Aplicando migrations...');
try {
  execSync('npx prisma db push --accept-data-loss', {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: `file:${DB_PATH}` },
  });
} catch (err) {
  console.error('[start] Erro nas migrations:', err);
  process.exit(1);
}

// Seed somente no primeiro run (banco vazio)
if (isFirstRun) {
  console.log('[start] Banco novo detectado, rodando seed...');
  try {
    execSync('npx tsx prisma/seed.ts', {
      stdio: 'inherit',
      env: { ...process.env, DATABASE_URL: `file:${DB_PATH}` },
    });
  } catch (err) {
    console.error('[start] Erro no seed:', err);
    // Nao sair - o bot pode funcionar sem seed
  }
}

// Iniciar o bot
console.log('[start] Iniciando bot...');
import('../index');
