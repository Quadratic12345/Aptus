

import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  baseURL: "https://aptusoss.vercel.app",
});

export const { useSession, signIn, signOut } = authClient;
