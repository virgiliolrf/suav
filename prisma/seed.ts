import { PrismaClient } from '@prisma/client';
import { CATEGORIES, PROFESSIONALS, SERVICES } from '../src/config/services';

const prisma = new PrismaClient();

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .trim()
    .replace(/\s+/g, ' ');
}

async function main() {
  console.log('Limpando banco de dados...');
  await prisma.conversationLog.deleteMany();
  await prisma.appointment.deleteMany();
  await prisma.professionalService.deleteMany();
  await prisma.workSchedule.deleteMany();
  await prisma.service.deleteMany();
  await prisma.professional.deleteMany();
  await prisma.category.deleteMany();
  await prisma.client.deleteMany();
  await prisma.adminUser.deleteMany();

  // 1. Criar categorias
  console.log('Criando categorias...');
  const categoryMap = new Map<string, number>();
  for (const cat of CATEGORIES) {
    const created = await prisma.category.create({
      data: { name: cat.name, slug: cat.slug },
    });
    categoryMap.set(cat.name, created.id);
  }
  console.log(`  ${categoryMap.size} categorias criadas`);

  // 2. Criar profissionais
  console.log('Criando profissionais...');
  const professionalMap = new Map<string, number>();
  for (const prof of PROFESSIONALS) {
    const created = await prisma.professional.create({
      data: {
        name: prof.name,
        normalizedName: prof.normalizedName,
        phone: prof.phone || null,
        active: true,
      },
    });
    professionalMap.set(prof.name, created.id);
  }
  console.log(`  ${professionalMap.size} profissionais criadas`);

  // 3. Criar horarios de trabalho para todas as profissionais
  // Seg-Sex 09:00-19:00, Sab 09:00-17:00, Dom fechado
  console.log('Criando horarios de trabalho...');
  let scheduleCount = 0;
  for (const [name, profId] of professionalMap) {
    for (let day = 0; day <= 6; day++) {
      let isWorking = true;
      let startTime = '09:00';
      let endTime = '19:00';

      if (day === 0) {
        // Domingo
        isWorking = false;
        startTime = '00:00';
        endTime = '00:00';
      } else if (day === 6) {
        // Sabado
        endTime = '17:00';
      }

      await prisma.workSchedule.create({
        data: {
          professionalId: profId,
          dayOfWeek: day,
          startTime,
          endTime,
          isWorking,
        },
      });
      scheduleCount++;
    }
  }
  console.log(`  ${scheduleCount} registros de horario criados`);

  // 4. Criar servicos e vincular profissionais
  console.log('Criando servicos...');
  let serviceCount = 0;
  let linkCount = 0;

  for (const svc of SERVICES) {
    const categoryId = categoryMap.get(svc.category);
    if (!categoryId) {
      console.error(`  Categoria nao encontrada: ${svc.category}`);
      continue;
    }

    const created = await prisma.service.create({
      data: {
        name: svc.name,
        normalizedName: normalizeText(svc.name),
        price: svc.price,
        durationMinutes: svc.durationMinutes,
        categoryId,
        active: true,
      },
    });
    serviceCount++;

    // Vincular profissionais ao servico
    for (const profName of svc.professionals) {
      const profId = professionalMap.get(profName);
      if (!profId) {
        console.error(`  Profissional nao encontrada: ${profName} (servico: ${svc.name})`);
        continue;
      }

      await prisma.professionalService.create({
        data: {
          professionalId: profId,
          serviceId: created.id,
        },
      });
      linkCount++;
    }
  }
  console.log(`  ${serviceCount} servicos criados`);
  console.log(`  ${linkCount} vinculos profissional-servico criados`);

  // 5. Criar admin users (placeholders — preencher telefones depois)
  const ownerPhone = process.env.ADMIN_OWNER_PHONE;
  const ownerName = process.env.ADMIN_OWNER_NAME;
  const managerPhone = process.env.ADMIN_MANAGER_PHONE;
  const managerName = process.env.ADMIN_MANAGER_NAME;

  if (ownerPhone) {
    await prisma.adminUser.create({
      data: { phone: ownerPhone, role: 'owner', name: ownerName || 'Dona' },
    });
    console.log(`  Admin (dona) cadastrada: ${ownerPhone}`);
  }

  if (managerPhone) {
    await prisma.adminUser.create({
      data: { phone: managerPhone, role: 'manager', name: managerName || 'Gerente' },
    });
    console.log(`  Admin (gerente) cadastrada: ${managerPhone}`);
  }

  console.log('\nSeed completo!');
  console.log(`  Categorias: ${categoryMap.size}`);
  console.log(`  Profissionais: ${professionalMap.size}`);
  console.log(`  Servicos: ${serviceCount}`);
  console.log(`  Vinculos: ${linkCount}`);
}

main()
  .catch((e) => {
    console.error('Erro no seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
