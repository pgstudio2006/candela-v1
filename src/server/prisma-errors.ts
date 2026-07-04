import { Prisma } from "@prisma/client";
import { ServerActionError } from "@/server/errors";

const SCHEMA_HINT =
  "Production database schema is out of date. Run `npx prisma db push` against the production DATABASE_URL, then redeploy.";

function isMissingColumn(message: string) {
  return /column .* does not exist|Unknown column/i.test(message);
}

function isMissingTable(message: string) {
  return /relation .* does not exist|table .* doesn't exist|no such table/i.test(message);
}

function isForeignKey(message: string) {
  return /foreign key constraint|Foreign key constraint/i.test(message);
}

/** Map Prisma / DB failures to operator-friendly server action errors. */
export function throwIfPrismaError(error: unknown): never {
  if (error instanceof ServerActionError) throw error;

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    switch (error.code) {
      case "P2021":
        throw new ServerActionError("INTERNAL_ERROR", `Database table missing. ${SCHEMA_HINT}`, {
          prismaCode: error.code,
          meta: error.meta,
        });
      case "P2022":
        throw new ServerActionError("INTERNAL_ERROR", `Database column missing. ${SCHEMA_HINT}`, {
          prismaCode: error.code,
          meta: error.meta,
        });
      case "P2003": {
        const meta = error.meta as { field_name?: string; model_name?: string } | undefined;
        const field = meta?.field_name ?? "unknown field";
        const model = meta?.model_name ?? "unknown table";
        throw new ServerActionError(
          "INTERNAL_ERROR",
          `Database reference error on ${model} → ${field}. Production database schema may be out of date. Sign out, pick your branch again, and retry. If it persists, run \`npx prisma db push\` against the production DATABASE_URL.`,
          { prismaCode: error.code, meta: error.meta },
        );
      }
      case "P2002":
        throw new ServerActionError("CONFLICT", "A record with this identifier already exists.");
      default:
        break;
    }
  }

  if (error instanceof Prisma.PrismaClientInitializationError) {
    throw new ServerActionError(
      "INTERNAL_ERROR",
      "Cannot connect to the database. Check DATABASE_URL on the server.",
      { cause: error.message },
    );
  }

  if (error instanceof Error) {
    const msg = error.message;
    if (isMissingColumn(msg) || isMissingTable(msg)) {
      throw new ServerActionError("INTERNAL_ERROR", SCHEMA_HINT, { cause: msg });
    }
    if (isForeignKey(msg)) {
      throw new ServerActionError(
        "INTERNAL_ERROR",
        "Database reference error — re-select branch at login and retry.",
        { cause: msg },
      );
    }
    throw new ServerActionError("INTERNAL_ERROR", msg);
  }

  throw new ServerActionError("INTERNAL_ERROR", "Unexpected server error.");
}

export async function withPrismaError<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    throwIfPrismaError(error);
  }
}
