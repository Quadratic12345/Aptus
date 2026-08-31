
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "@/lib/db";
import * as authSchema from "@/lib/db/auth-schema";

export const auth = betterAuth({
  baseURL: "https://aptusoss.vercel.app",

  database: drizzleAdapter(db, {
    provider: "pg",
    schema: authSchema,
  }),

  socialProviders: {
    github: {
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
    },
  },

  user: {
    additionalFields: {
      githubUsername: {
        type: "string",
        required: false,
      },
    },
  },
});
