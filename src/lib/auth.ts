import { NextAuthOptions, getServerSession as nextAuthGetServerSession } from "next-auth";
import { NextResponse } from "next/server";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { Role } from "@prisma/client";
import { prisma } from "./prisma";
import { env } from "./env";

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const member = await prisma.member.findUnique({
          where: { email: credentials.email.toLowerCase().trim() },
        });

        if (!member || !member.passwordHash) return null;

        const isValid = await bcrypt.compare(credentials.password, member.passwordHash);
        if (!isValid) return null;

        return {
          id: member.id,
          name: member.name,
          email: member.email,
          role: member.role,
          tier: member.tier,
          onboarded: member.onboardedAt != null,
        };
      },
    }),
  ],
  // 1 hour absolute, with a 15-minute sliding refresh so an active user
  // isn't kicked mid-session but an idle tab goes cold quickly. Shortens
  // the window a stolen device has against a logged-in collector.
  session: { strategy: "jwt", maxAge: 3600, updateAge: 900 },
  pages: {
    signIn: "/auth/login",
  },
  callbacks: {
    async jwt({ token, user, trigger }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.tier = user.tier;
        token.onboarded = user.onboarded;
      }
      // After the onboarding wizard completes, the client calls
      // `useSession().update()` to force a JWT refresh. Re-read the latest
      // tier + onboarded flag from the DB so middleware sees the new state.
      if (trigger === "update" && token.id) {
        const member = await prisma.member.findUnique({
          where: { id: token.id },
          select: { tier: true, onboardedAt: true },
        });
        if (member) {
          token.tier = member.tier;
          token.onboarded = member.onboardedAt != null;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id;
        session.user.role = token.role;
        session.user.tier = token.tier;
        session.user.onboarded = token.onboarded;
      }
      return session;
    },
  },
  // Sourced from `env`, which throws at module load if the secret is missing.
  // Never read process.env.NEXTAUTH_SECRET directly.
  secret: env.NEXTAUTH_SECRET,
};

export function getServerAuth() {
  return nextAuthGetServerSession(authOptions);
}

/** Role hierarchy: admin > staff > member */
const ROLE_LEVEL: Record<Role, number> = {
  [Role.admin]: 3,
  [Role.staff]: 2,
  [Role.member]: 1,
};

/**
 * Check if a session's role meets the minimum required level.
 * Returns null if authorized, or a 403 NextResponse if not.
 */
export function requireRole(
  sessionRole: Role | undefined,
  minimumRole: Role
): NextResponse | null {
  const level = sessionRole ? (ROLE_LEVEL[sessionRole] ?? 0) : 0;
  const required = ROLE_LEVEL[minimumRole];
  if (level < required) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}
