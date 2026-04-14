import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    // Surface errors + warnings in the Vercel log drain. Omitting "query"
    // intentionally — it's firehose-noisy and already available via Prisma's
    // PG_STATEMENT_LOGGING knob when we need it.
    log: ["error", "warn"],
  });

globalForPrisma.prisma = prisma;
