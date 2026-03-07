import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api, type ReviewRequest, type FeedbackRequest } from "@shared/routes";
import multer from "multer";
import { randomUUID } from "crypto";
import { z } from "zod";
import {
  extractTextFromPDF,
  extractTextFromDOCX,
  computeDocFeatures,
  scoreATS,
  scoreFormat,
  scoreRoleFit,
  buildImprovements,
  rewriteResume,
  loadGatingModel,
  updateGatingModelFromFeedback,
  type GatingModel,
  type DocFeatures,
} from "./resume-processor";
import path from "path";
import fs from "fs";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // POST /api/review - Upload resume and get analysis
  app.post(api.review.submit.path, upload.single("file"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      const profession = req.body.profession || undefined;
      const consent = req.body.consent === "true";

      const filename = req.file.originalname.toLowerCase();
      if (!filename.endsWith(".pdf") && !filename.endsWith(".docx")) {
        return res.status(400).json({ message: "Only PDF and DOCX files are supported" });
      }

      // Extract text from file
      let text: string;
      let layout: { parseConfidence: number; twoColumnLikelihood: number };

      try {
        if (filename.endsWith(".docx")) {
          text = await extractTextFromDOCX(req.file.buffer);
          layout = {
            parseConfidence: Math.min(1.0, text.length / 2500),
            twoColumnLikelihood: 0.0,
          };
        } else {
          const result = await extractTextFromPDF(req.file.buffer);
          text = result.text;
          layout = result.layout;
        }
      } catch (error) {
        console.error("Parse error:", error);
        return res.status(400).json({ message: "Failed to parse file. Try a different PDF or DOCX." });
      }

      let parseWarning: string | undefined;
      if (!text || text.length < 200) {
        parseWarning = "We extracted very little text. If this is a scanned PDF, export a text-based PDF or upload DOCX.";
      }

      // Compute features and scores
      const docFeats = computeDocFeatures(text, layout, profession);
      const atsScore = scoreATS(docFeats);
      const fmtScore = scoreFormat(docFeats);
      const roleScore = profession ? scoreRoleFit(docFeats, profession) : undefined;

      const scores = {
        ats: atsScore.score,
        format: fmtScore.score,
        role_fit: roleScore?.score,
      };

      const scoreDrivers = {
        ats: atsScore.drivers,
        format: fmtScore.drivers,
        role_fit: roleScore?.drivers,
      };

      const improvements = buildImprovements(scores, docFeats, profession);

      // Rewrite resume bullets using LLM
      const rewrite = await rewriteResume(text, profession);

      const sessionId = randomUUID();
      const modelVersions = { gating_model_version: rewrite.modelVersion, llm_prompt_version: 1 };

      // Send the analysis response immediately — don't let DB writes
      // block or fail the request. Storage is best-effort analytics only.
      res.json({
        sessionId,
        profession,
        scores,
        scoreDrivers,
        improvements,
        rewrite: { sections: rewrite.sections },
        showTemplates: atsScore.score < 6.5,
        parseWarning,
      });

      // Fire-and-forget: persist anonymised analytics after the response
      // is already on its way to the client. A DB failure here must not
      // surface as an error to the user.
      if (consent) {
        Promise.resolve()
          .then(() => storage.createReviewSession({
            id: sessionId,
            profession,
            consent,
            docFeatures: docFeats,
            scores,
            modelVersions,
            parseWarning,
          }))
          .then(() =>
            Promise.all(
              rewrite.decisions.map((decision) =>
                storage.createBulletDecision({
                  id: randomUUID(),
                  sessionId,
                  sectionKey: decision.sectionKey,
                  bulletIndex: decision.bulletIndex,
                  bulletFeatures: decision.bulletFeatures,
                  decision: decision.decision,
                  decisionConf: decision.decisionConf,
                }),
              ),
            ),
          )
          .catch((err) => console.error("Storage error (non-fatal):", err));
      }
    } catch (error) {
      console.error("Review error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // POST /api/feedback - Submit user feedback
  app.post(api.feedback.submit.path, async (req, res) => {
    try {
      const body = api.feedback.submit.input.parse(req.body);
      
      await storage.createFeedbackEvent({
        id: randomUUID(),
        sessionId: body.sessionId,
        eventType: body.eventType,
        targetId: body.targetId,
        value: body.value,
      });

      res.json({ success: true });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          message: error.errors[0].message,
          field: error.errors[0].path.join("."),
        });
      }
      console.error("Feedback error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // POST /api/admin/retrain - Retrain gating model
  app.post(api.admin.retrain.path, async (req, res) => {
    try {
      const version = await updateGatingModelFromFeedback(storage);
      res.json({ version });
    } catch (error) {
      console.error("Retrain error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // GET /api/templates/:name - Download ATS template
  app.get("/api/templates/:name", (req, res) => {
    const { name } = req.params;
    const templateMap: Record<string, string> = {
      classic: "ATS_Resume_Template_Classic.docx",
      modern: "ATS_Resume_Template_Modern_Minimal.docx",
      compact: "ATS_Resume_Template_Compact.docx",
    };

    const filename = templateMap[name];
    if (!filename) {
      return res.status(404).json({ message: "Template not found" });
    }

    // Resolve templates directory from project root — works in local dev,
    // esbuild-bundled (Replit) and Vercel serverless environments.
    const templatesDir =
      path.join(__dirname, "../templates");

    const filepath = path.join(templatesDir, filename);
    if (!fs.existsSync(filepath)) {
      return res.status(404).json({ message: "Template file not found" });
    }

    // Read into memory and send as a buffer so the response is fully
    // serialised before being returned. This is required for Vercel
    // serverless functions which do not support streaming file responses
    // (res.download / res.sendFile) reliably.
    try {
      const fileBuffer = fs.readFileSync(filepath);
      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      );
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${filename}"`,
      );
      res.setHeader("Content-Length", fileBuffer.length);
      res.send(fileBuffer);
    } catch (err) {
      console.error("Template read error:", err);
      res.status(500).json({ message: "Failed to read template file" });
    }
  });

  return httpServer;
}
