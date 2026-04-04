// This module MUST be the first import in api/index.ts.
// It registers process-level crash handlers so they are active
// before any other module initialises — including server/app.ts
// whose routesReady IIFE starts running at module load time.
process.on("uncaughtException", (err: Error) => {
  console.error("[vercel] uncaughtException:", err?.message, err?.stack);
});
process.on("unhandledRejection", (reason: unknown) => {
  const r = reason as any;
  console.error(
    "[vercel] unhandledRejection:",
    r?.message ?? String(reason),
    r?.stack,
  );
});
