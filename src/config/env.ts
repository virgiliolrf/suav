import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  OPENAI_API_KEY: z.string().min(1),

  // Admin
  ADMIN_OWNER_PHONE: z.string().optional().default(''),
  ADMIN_OWNER_NAME: z.string().optional().default(''),
  ADMIN_MANAGER_PHONE: z.string().optional().default(''),
  ADMIN_MANAGER_NAME: z.string().optional().default(''),

  // Instagram
  INSTAGRAM_ACCESS_TOKEN: z.string().optional().default(''),
  INSTAGRAM_APP_SECRET: z.string().optional().default(''),
  INSTAGRAM_VERIFY_TOKEN: z.string().optional().default('suav-bot-verify-2025'),
  INSTAGRAM_WEBHOOK_PORT: z.string().optional().default('3000'),

  // Geral
  TZ: z.string().optional().default('America/Sao_Paulo'),
  DATA_DIR: z.string().optional().default('.'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Variaveis de ambiente invalidas:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
