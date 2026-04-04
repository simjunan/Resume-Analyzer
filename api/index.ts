// Vercel serverless entry point
//
// IMPORTANT: crash-handlers MUST be the very first import.
// esbuild initialises leaf modules (no dependencies) before modules with
// many transitive deps, so crash-handlers.ts registers its process.on()
// listeners before server/app.ts — and its async routesReady IIFE — runs.
import "./crash-handlers";
import { app, routesReady } from "../server/app";
import type { Request, Response } from "express";

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
