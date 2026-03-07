import { pgTable, text, serial, integer, real, timestamp, jsonb, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Review sessions - stores anonymized features only
export const reviewSessions = pgTable("review_sessions", {
  id: text("id").primaryKey(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  profession: text("profession"),
  consent: boolean("consent").notNull().default(true),
  docFeatures: jsonb("doc_features").notNull(),
  scores: jsonb("scores").notNull(),
  modelVersions: jsonb("model_versions").notNull(),
  parseWarning: text("parse_warning"),
});

// Bullet decisions - for learning model
export const bulletDecisions = pgTable("bullet_decisions", {
  id: text("id").primaryKey(),
  sessionId: text("session_id").notNull(),
  sectionKey: text("section_key").notNull(),
  bulletIndex: integer("bullet_index").notNull(),
  bulletFeatures: jsonb("bullet_features").notNull(),
  decision: text("decision").notNull(),
  decisionConf: real("decision_conf").notNull(),
});

// Feedback events - user votes on suggestions and rewrites
export const feedbackEvents = pgTable("feedback_events", {
  id: text("id").primaryKey(),
  sessionId: text("session_id").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  eventType: text("event_type").notNull(),
  targetId: text("target_id"),
  value: jsonb("value").notNull(),
});

// Gating model - stored separately, loaded from file system
export const insertReviewSessionSchema = createInsertSchema(reviewSessions).omit({ createdAt: true });
export const insertBulletDecisionSchema = createInsertSchema(bulletDecisions);
export const insertFeedbackEventSchema = createInsertSchema(feedbackEvents).omit({ createdAt: true });

export type ReviewSession = typeof reviewSessions.$inferSelect;
export type InsertReviewSession = z.infer<typeof insertReviewSessionSchema>;
export type BulletDecision = typeof bulletDecisions.$inferSelect;
export type InsertBulletDecision = z.infer<typeof insertBulletDecisionSchema>;
export type FeedbackEvent = typeof feedbackEvents.$inferSelect;
export type InsertFeedbackEvent = z.infer<typeof insertFeedbackEventSchema>;
