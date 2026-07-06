/**
 * One-time import of the Navayu CSV backup into patients + appointments.
 *
 * Usage (from project root):
 *   export DATABASE_URL="postgresql://..."
 *   npx tsx scripts/import-navayu-csv.ts [branchId]
 *
 * If branchId is not provided, the script uses the first branch in the database.
 */
import fs from "fs";
import { prisma } from "@/lib/prisma";
import { importNavayuCsv } from "@/server/import/navayu-csv";

if (!process.env.DATABASE_URL && fs.existsSync(".env.local")) {
  const env = fs.readFileSync(".env.local", "utf-8");
  const match = env.match(/DATABASE_URL=([^\r\n]+)/);
  if (match) {
    process.env.DATABASE_URL = match[1].trim().replace(/^["']|["']$/g, "");
  }
}

async function run() {
  const branchId = process.argv[2];

  const branch = branchId
    ? await prisma.branch.findUnique({ where: { id: branchId } })
    : await prisma.branch.findFirst({ orderBy: { createdAt: "asc" } });

  if (!branch) {
    console.error("Branch not found. Pass a valid branchId or ensure at least one branch exists.");
    process.exit(1);
  }

  const tenant = await prisma.tenant.findUnique({ where: { id: branch.tenantId } });
  if (!tenant) {
    console.error("Tenant not found for branch.");
    process.exit(1);
  }

  const ctx = {
    tenantId: tenant.id,
    branchId: branch.id,
    branchName: branch.name,
    userId: "import-script",
    role: "admin",
    sessionToken: "",
  };

  const result = await importNavayuCsv(ctx);
  console.log(JSON.stringify(result, null, 2));
  await prisma.$disconnect();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
