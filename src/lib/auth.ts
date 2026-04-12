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
        };
      },
    }),
  ],
  session: { strategy: "jwt", maxAge: 14400 /* 4 hours */ },
  pages: {
    signIn: "/auth/login",
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.tier = user.tier;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id;
        session.user.role = token.role;
        session.user.tier = token.tier;
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
