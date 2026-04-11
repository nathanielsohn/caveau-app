import { NextAuthOptions, getServerSession as nextAuthGetServerSession } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "./prisma";

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
  session: { strategy: "jwt" },
  pages: {
    signIn: "/auth/login",
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = (user as { role: string }).role;
        token.tier = (user as { tier: string }).tier;
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
  secret: process.env.NEXTAUTH_SECRET,
};

export function getServerAuth() {
  return nextAuthGetServerSession(authOptions);
}
