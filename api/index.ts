// Vercel serverless entry point
// This exports the Express app for Vercel's @vercel/node runtime.
// Vercel handles the HTTP server itself — we just export the app handler.
import { app, routesReady } from "../server/app";
import type { Request, Response } from "express";

export default async function handler(req: Request, res: Response) {
  await routesReady;
  return app(req, res);
}
