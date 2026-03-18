import { db } from "./db";
import {
  reviewSessions,
  bulletDecisions,
  feedbackEvents,
  type InsertReviewSession,
  type InsertBulletDecision,
  type InsertFeedbackEvent,
  type ReviewSession,
  type BulletDecision,
  type FeedbackEvent,
} from "@shared/schema";
import { eq } from "drizzle-orm";

export interface IStorage {
  createReviewSession(session: InsertReviewSession): Promise<ReviewSession>;
  getReviewSession(id: string): Promise<ReviewSession | undefined>;
  createBulletDecision(decision: InsertBulletDecision): Promise<BulletDecision>;
  createFeedbackEvent(event: InsertFeedbackEvent): Promise<FeedbackEvent>;
  getAllBulletDecisionsWithFeedback(): Promise<Array<{ bulletFeatures: any; eventType: string; sectionKey: string; bulletIndex: number }>>;
}

export class DatabaseStorage implements IStorage {
  async createReviewSession(session: InsertReviewSession): Promise<ReviewSession> {
    const [created] = await db!.insert(reviewSessions).values(session).returning();
    return created;
  }

  async getReviewSession(id: string): Promise<ReviewSession | undefined> {
    const [session] = await db!.select().from(reviewSessions).where(eq(reviewSessions.id, id));
    return session;
  }

  async createBulletDecision(decision: InsertBulletDecision): Promise<BulletDecision> {
    const [created] = await db!.insert(bulletDecisions).values(decision).returning();
    return created;
  }

  async createFeedbackEvent(event: InsertFeedbackEvent): Promise<FeedbackEvent> {
    const [created] = await db!.insert(feedbackEvents).values(event).returning();
    return created;
  }

  async getAllBulletDecisionsWithFeedback(): Promise<Array<{ bulletFeatures: any; eventType: string; sectionKey: string; bulletIndex: number }>> {
    // Raw SQL join to get bullet decisions with feedback
    const result = await db!.execute(`
      SELECT b.bullet_features AS "bulletFeatures", f.event_type AS "eventType", b.section_key AS "sectionKey", b.bullet_index AS "bulletIndex"
      FROM bullet_decisions b
      JOIN feedback_events f
        ON f.session_id = b.session_id
       AND f.target_id = (b.section_key || ':' || b.bullet_index)
      WHERE f.event_type IN ('REWRITE_ACCEPTED', 'REWRITE_REJECTED')
    `);
    return result.rows as any[];
  }
}

// No-op implementation used when DATABASE_URL is not configured.
// All writes are silently dropped; reads return empty/undefined.
class NoopStorage implements IStorage {
  async createReviewSession(_session: InsertReviewSession): Promise<ReviewSession> {
    return {} as ReviewSession;
  }
  async getReviewSession(_id: string): Promise<ReviewSession | undefined> {
    return undefined;
  }
  async createBulletDecision(_decision: InsertBulletDecision): Promise<BulletDecision> {
    return {} as BulletDecision;
  }
  async createFeedbackEvent(_event: InsertFeedbackEvent): Promise<FeedbackEvent> {
    return {} as FeedbackEvent;
  }
  async getAllBulletDecisionsWithFeedback(): Promise<Array<{ bulletFeatures: any; eventType: string; sectionKey: string; bulletIndex: number }>> {
    return [];
  }
}

export const storage: IStorage = db ? new DatabaseStorage() : new NoopStorage();
