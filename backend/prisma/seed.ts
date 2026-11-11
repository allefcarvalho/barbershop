// Dados de desenvolvimento: barbearia Vikings (tenant 1). Senhas são só para ambiente local.
import { PrismaClient, MemberRole } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function member(tenantId: string, name: string, email: string, password: string, role: MemberRole) {
  const user = await prisma.user.upsert({
    where: { email },
    update: {},
    create: { name, email, passwordHash: await bcrypt.hash(password, 12) },
  });
  return prisma.membership.upsert({
    where: { tenantId_userId: { tenantId, userId: user.id } },
    update: {},
    create: { tenantId, userId: user.id, role },
  });
}

async function main() {
  const tenant = await prisma.tenant.upsert({
    where: { slug: 'vikings' },
    update: {},
    create: { slug: 'vikings', name: 'Barbearia Vikings' },
  });

  await member(tenant.id, 'Administrador', 'admin@vikinges.com', 'admin123', 'OWNER');
  const barbers = [
    await member(tenant.id, 'Ragnar Lothbrok', 'ragnar@vikinges.com', 'barber123', 'BARBER'),
    await member(tenant.id, 'Bjorn Ironside', 'bjorn@vikinges.com', 'barber123', 'BARBER'),
    await member(tenant.id, 'Ivar, o Desossado', 'ivar@vikinges.com', 'barber123', 'BARBER'),
  ];

  if ((await prisma.service.count({ where: { tenantId: tenant.id } })) === 0) {
    await prisma.service.createMany({
      data: [
        { name: 'Corte de Cabelo', description: 'Corte masculino profissional com acabamento perfeito', priceCents: 4500, durationMinutes: 35, sortOrder: 1 },
        { name: 'Barba', description: 'Aparar e modelar barba com navalha e toalha quente', priceCents: 3500, durationMinutes: 35, sortOrder: 2 },
        { name: 'Corte + Barba', description: 'Combo completo de corte de cabelo e barba', priceCents: 7000, durationMinutes: 60, sortOrder: 3 },
        { name: 'Design de Sobrancelha', description: 'Alinhamento e design personalizado da sobrancelha', priceCents: 2000, durationMinutes: 35, sortOrder: 4 },
        { name: 'Pigmentação Capilar', description: 'Pigmentação para cobertura de falhas e calvície', priceCents: 12000, durationMinutes: 35, sortOrder: 5 },
      ].map((s) => ({ ...s, tenantId: tenant.id })),
    });
  }
  const services = await prisma.service.findMany({ where: { tenantId: tenant.id } });

  for (const b of barbers) {
    await prisma.barberService.createMany({
      data: services.map((s) => ({ membershipId: b.id, serviceId: s.id })),
      skipDuplicates: true,
    });
    await prisma.availability.createMany({
      data: [1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({ membershipId: b.id, dayOfWeek, startTime: '09:00', endTime: '18:00' })),
      skipDuplicates: true,
    });
  }

  await prisma.client.createMany({
    data: [
      { tenantId: tenant.id, name: 'João Silva', phone: '+5511988880001', email: 'joao@email.com', totalBookings: 5, isRecurring: true },
      { tenantId: tenant.id, name: 'Pedro Santos', phone: '+5511988880002', email: 'pedro@email.com', totalBookings: 1 },
    ],
    skipDuplicates: true,
  });

  if ((await prisma.product.count({ where: { tenantId: tenant.id } })) === 0) {
    await prisma.product.createMany({
      data: [
        { name: 'Pomada Modeladora Viking', description: 'Pomada efeito matte com fixação forte', priceCents: 4500, stockQuantity: 20, stockMin: 5 },
        { name: 'Óleo para Barba', description: 'Óleo hidratante com aroma amadeirado', priceCents: 5500, stockQuantity: 15, stockMin: 3 },
        { name: 'Shampoo 3 em 1', description: 'Cabelo, barba e corpo em um só produto', priceCents: 3500, stockQuantity: 30, stockMin: 10 },
      ].map((p) => ({ ...p, tenantId: tenant.id })),
    });
  }

  console.log('🌱 Seed concluído: tenant "vikings", login admin@vikinges.com / admin123');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
