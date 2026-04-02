// Vercel serverless entry point
import { app, routesReady } from "../server/app";
import type { Request, Response } from "express";

// ── Prevent process crash from unhandled rejections / uncaught exceptions ──
// Node.js 15+ terminates the process on unhandledRejection by default.
// In Vercel this surfaces as FUNCTION_INVOCATION_FAILED with no useful message.
// These handlers convert any crash into a logged warning instead.
process.on("uncaughtException", (err) => {
  console.error("[vercel] uncaughtException:", err?.message, err?.stack);
});
process.on("unhandledRejection", (reason: any) => {
  console.error("[vercel] unhandledRejection:", reason?.message ?? reason, reason?.stack);
});

export default async function handler(req: Request, res: Response) {
  try {
    await routesReady;
    return app(req, res);
  } catch (err: any) {
    console.error("[vercel] handler error:", err?.message, err?.stack);
    if (!res.headersSent) {
      res.status(500).json({
        message: "Server error",
        detail: err?.message,
      });
    }
  }
}
