import { PrismaClient } from "@prisma/client";
export * from "@prisma/client";
const globalForPrisma = globalThis;
export const prisma = globalForPrisma.prisma ??
    new PrismaClient({
        log: process.env.NODE_ENV === "development"
            ? ["query", "error", "warn"]
            : ["error"],
    });
if (process.env.NODE_ENV !== "production") {
    globalForPrisma.prisma = prisma;
}
export function createPrismaClient(url) {
    return new PrismaClient({
        datasources: url ? { db: { url } } : undefined,
    });
}
//# sourceMappingURL=index.js.map