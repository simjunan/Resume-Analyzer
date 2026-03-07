import { z } from "zod";

export const errorSchemas = {
  validation: z.object({
    message: z.string(),
    field: z.string().optional(),
  }),
  badRequest: z.object({
    message: z.string(),
  }),
  internal: z.object({
    message: z.string(),
  }),
};

// Resume review request and response types
export const reviewRequestSchema = z.object({
  profession: z.enum(["software_engineer", "product_manager", "product_designer", "business_analyst", "solution_engineer"]).optional(),
  consent: z.boolean().default(true),
});

export const sectionRewriteSchema = z.object({
  key: z.string(),
  title: z.string(),
  before: z.array(z.string()),
  after: z.array(z.string()),
});

export const improvementSchema = z.object({
  key: z.string(),
  title: z.string(),
  detail: z.string(),
});

export const reviewResponseSchema = z.object({
  sessionId: z.string(),
  profession: z.string().optional(),
  scores: z.object({
    ats: z.number(),
    format: z.number(),
    role_fit: z.number().optional(),
  }),
  scoreDrivers: z.object({
    ats: z.array(z.string()),
    format: z.array(z.string()),
    role_fit: z.array(z.string()).optional(),
  }),
  improvements: z.array(improvementSchema),
  rewrite: z.object({
    sections: z.array(sectionRewriteSchema),
  }),
  showTemplates: z.boolean(),
  parseWarning: z.string().optional(),
});

// Feedback submission
export const feedbackSchema = z.object({
  sessionId: z.string(),
  eventType: z.enum(["SUGGESTION_UPVOTE", "SUGGESTION_DOWNVOTE", "REWRITE_ACCEPTED", "REWRITE_REJECTED"]),
  targetId: z.string().optional(),
  value: z.record(z.any()).default({}),
});

export const api = {
  review: {
    submit: {
      method: "POST" as const,
      path: "/api/review" as const,
      input: reviewRequestSchema,
      responses: {
        200: reviewResponseSchema,
        400: errorSchemas.badRequest,
        500: errorSchemas.internal,
      },
    },
  },
  feedback: {
    submit: {
      method: "POST" as const,
      path: "/api/feedback" as const,
      input: feedbackSchema,
      responses: {
        200: z.object({ success: z.boolean() }),
        400: errorSchemas.validation,
      },
    },
  },
  admin: {
    retrain: {
      method: "POST" as const,
      path: "/api/admin/retrain" as const,
      responses: {
        200: z.object({ version: z.number() }),
      },
    },
  },
  templates: {
    get: {
      method: "GET" as const,
      path: "/api/templates/:name" as const,
      responses: {
        200: z.instanceof(Blob),
        404: errorSchemas.badRequest,
      },
    },
  },
};

export function buildUrl(path: string, params?: Record<string, string | number>): string {
  let url = path;
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (url.includes(`:${key}`)) {
        url = url.replace(`:${key}`, String(value));
      }
    });
  }
  return url;
}

export type ReviewRequest = z.infer<typeof reviewRequestSchema>;
export type ReviewResponse = z.infer<typeof reviewResponseSchema>;
export type FeedbackRequest = z.infer<typeof feedbackSchema>;
export type Improvement = z.infer<typeof improvementSchema>;
export type SectionRewrite = z.infer<typeof sectionRewriteSchema>;
