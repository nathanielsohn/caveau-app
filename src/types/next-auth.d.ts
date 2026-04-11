import { DefaultSession } from "next-auth";
import { Role, Tier } from "@prisma/client";

declare module "next-auth" {
  interface User {
    role: Role | string;
    tier: Tier | string;
  }
  interface Session {
    user: {
      id: string;
      role: Role | string;
      tier: Tier | string;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: Role | string;
    tier: Tier | string;
  }
}
