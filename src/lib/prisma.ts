import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  prismaPoolWarned: boolean | undefined;
};

// Production must cap the per-Lambda Prisma pool or a traffic spike exhausts the
// RDS connection budget (see .env.example for the math). We can't enforce it at
// build time — the URL is runtime config — so we warn loudly on the first boot
// of a process that looks like production but is missing the knob. One warn per
// process is enough to show up in Vercel logs without drowning them.
function warnIfPoolUnbounded(): void {
  if (globalForPrisma.prismaPoolWarned) return;
  if (process.env.NODE_ENV !== "production") return;
  const url = process.env.DATABASE_URL ?? "";
  if (!url) return;
  if (/[?&]connection_limit=/.test(url)) return;
  globalForPrisma.prismaPoolWarned = true;
  // Flat console.warn rather than the structured logger — this module is
  // imported from the edge runtime via middleware indirections, and the
  // logger's dynamic Sentry import is forbidden there.
  console.warn(
    JSON.stringify({
      level: "warn",
      msg: "DATABASE_URL has no connection_limit — Prisma pool is uncapped. Append `?connection_limit=5&pool_timeout=10` before the next traffic spike.",
    }),
  );
}

warnIfPoolUnbounded();

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    // Surface errors + warnings in the Vercel log drain. Omitting "query"
    // intentionally — it's firehose-noisy and already available via Prisma's
    // PG_STATEMENT_LOGGING knob when we need it.
    log: ["error", "warn"],
  });

globalForPrisma.prisma = prisma;
