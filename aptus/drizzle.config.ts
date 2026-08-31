
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './lib/db/*.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
