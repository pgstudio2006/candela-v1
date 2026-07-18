import { prisma } from "../src/lib/prisma";

async function main() {
  const schemas = await prisma.formSchema.findMany();
  console.log("Total schemas found in DB:", schemas.length);
  for (const s of schemas) {
    console.log(`Schema ID: ${s.id}, Title: ${s.title}`);
    if (s.id === "registration") {
      console.log("Sections & Fields:", JSON.stringify((s.schema as any)?.sections, null, 2));
    }
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
