import { PrismaClient } from "@prisma/client";
import { config } from "./env";

export const prisma = new PrismaClient({
  log: config.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
});
