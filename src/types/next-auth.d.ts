import { DefaultSession } from "next-auth";
import { Role, Tier } from "@prisma/client";

declare module "next-auth" {
  interface User {
    role: Role;
    tier: Tier;
    onboarded: boolean;
  }
  interface Session {
    user: {
      id: string;
      role: Role;
      tier: Tier;
      onboarded: boolean;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: Role;
    tier: Tier;
    onboarded: boolean;
  }
}
