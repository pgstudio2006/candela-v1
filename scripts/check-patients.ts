import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const patients = await prisma.patient.findMany({
    orderBy: { createdAt: "desc" },
    take: 5,
    select: {
      id: true,
      uhid: true,
      name: true,
      age: true,
      dateOfBirth: true,
      phone: true,
      meta: true,
    }
  });

  console.log("LATEST PATIENTS:");
  console.log(JSON.stringify(patients, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
