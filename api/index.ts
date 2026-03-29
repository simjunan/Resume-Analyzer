// Vercel serverless entry point
// This exports the Express app for Vercel's @vercel/node runtime.
// Vercel handles the HTTP server itself — we just export the app handler.
import { app, routesReady } from "../server/app";
import type { Request, Response } from "express";

export default async function handler(req: Request, res: Response) {
  try {
    await routesReady;
    return app(req, res);
  } catch (err: any) {
    console.error("Handler init error:", err);
    if (!res.headersSent) {
      res.status(500).json({ message: "Server initialisation error" });
    }
  }
}
