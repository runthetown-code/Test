import "dotenv/config";
import { defineConfig } from "drizzle-kit";
import { dbUrls } from "./src/db/urls";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: dbUrls().ownerDirect! },
});
