import OpenAI from "openai";
import fs from "fs/promises";
import path from "path";
import type { IStorage } from "./storage";

// pdf-parse v1 exports a plain async function: pdfParse(buffer) → {text,...}
// We import from the lib path directly to bypass index.js which runs test-file
// code (readFileSync on a non-existent path) when bundled with esbuild.
async function parsePDF(buffer: Buffer) {
  // CJS interop: dynamic import of a CJS module wraps module.exports as .default
  const mod = await import("pdf-parse/lib/pdf-parse.js");
  const pdfParse = (mod.default ?? mod) as (buf: Buffer) => Promise<{ text: string }>;
  return pdfParse(buffer);
}

// Lazy-initialise the OpenAI client so that a missing API key does NOT
// crash the module at import time (which would cause FUNCTION_INVOCATION_FAILED
// on Vercel before any request is even handled).
let _openai: OpenAI | null = null;
function getOpenAI(): OpenAI | null {
  if (_openai) return _openai;
  const apiKey =
    process.env.AI_INTEGRATIONS_OPENAI_API_KEY ||
    process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  try {
    _openai = new OpenAI({
      apiKey,
      baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
    });
    return _openai;
  } catch {
    return null;
  }
}

// Vercel serverless has a read-only filesystem except for /tmp.
// Use /tmp when running on Vercel so model writes don't crash.
const DATA_DIR = process.env.VERCEL
  ? "/tmp/resume-analyzer-data"
  : path.join(process.cwd(), "data");
const MODEL_PATH = path.join(DATA_DIR, "gating_model.json");

export interface GatingModel {
  version: number;
  weights: Record<string, number>;
  lr: number;
}

export interface DocFeatures {
  parseConfidence: number;
  twoColumnLikelihood: number;
  numLines: number;
  numBullets: number;
  avgBulletLenWords: number;
  metricRatio: number;
  keywordCoverageRatio?: number;
}

interface BulletFeatures {
  hasMetric: number;
  hasActionVerb: number;
  lenWords: number;
  buzzwordDensity: number;
  specificity: number;
  duplicateSim: number;
}

const PROFESSIONS: Record<string, { keywords: string[] }> = {
  software_engineer: { keywords: ["python", "java", "javascript", "typescript", "react", "node", "sql", "api", "microservices", "aws", "docker", "kubernetes", "testing", "ci/cd", "performance", "scalability", "distributed", "git"] },
  product_manager: { keywords: ["roadmap", "stakeholder", "prioritization", "metrics", "kpi", "experiment", "a/b", "discovery", "strategy", "go-to-market", "gtm", "requirements", "prd", "analytics", "funnel", "retention", "activation", "alignment"] },
  product_designer: { keywords: ["figma", "prototype", "wireframe", "ux", "ui", "design system", "user research", "usability", "journey", "accessibility", "interaction", "visual", "information architecture"] },
  business_analyst: { keywords: ["requirements", "brd", "user stories", "process", "stakeholders", "uat", "sql", "data", "mapping", "workflows", "gap analysis", "documentation", "confluence", "jira"] },
  solution_engineer: { keywords: ["pre-sales", "customer", "demo", "integration", "api", "solution", "architecture", "technical", "requirements", "stakeholder", "enablement", "workshop", "poc", "troubleshooting"] },
};

const ACTION_VERBS = new Set([
  "built", "created", "designed", "developed", "improved", "increased", "reduced", "led", "owned",
  "delivered", "launched", "optimized", "automated", "implemented", "migrated", "analyzed",
  "evaluated", "managed", "collaborated", "coordinated", "drove", "shipped", "executed",
  "negotiated", "architected", "scaled"
]);

const SECTION_PATTERNS = [
  { key: "summary", regex: /^(summary|professional summary|profile)$/i },
  { key: "experience", regex: /^(experience|work experience|employment|professional experience)$/i },
  { key: "projects", regex: /^(projects|project experience)$/i },
  { key: "education", regex: /^(education)$/i },
  { key: "skills", regex: /^(skills|technical skills|core competencies)$/i },
  { key: "certifications", regex: /^(certifications|certificates)$/i },
];

const BULLET_RE = /^(\u2022|\-|\*|\u00b7|\u25cf)\s+/;

// Ensure data directory exists
async function ensureDataDir() {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
  } catch (err) {
    // Directory might already exist
  }
}

export async function loadGatingModel(): Promise<GatingModel> {
  await ensureDataDir();
  
  try {
    const data = await fs.readFile(MODEL_PATH, "utf-8");
    return JSON.parse(data);
  } catch (err) {
    // Create default model
    const model: GatingModel = {
      version: 1,
      weights: {
        bias: 0.8,
        hasMetric: -0.9,
        hasActionVerb: -0.5,
        lenWords: 0.03,
        buzzwordDensity: 0.8,
        specificity: -0.6,
        duplicateSim: 0.7,
      },
      lr: 0.05,
    };
    await fs.writeFile(MODEL_PATH, JSON.stringify(model, null, 2));
    return model;
  }
}

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

function gatingProbabilityRewrite(model: GatingModel, feats: BulletFeatures): number {
  const w = model.weights;
  let z = w.bias || 0;
  z += (w.hasMetric || 0) * feats.hasMetric;
  z += (w.hasActionVerb || 0) * feats.hasActionVerb;
  z += (w.lenWords || 0) * feats.lenWords;
  z += (w.buzzwordDensity || 0) * feats.buzzwordDensity;
  z += (w.specificity || 0) * feats.specificity;
  z += (w.duplicateSim || 0) * feats.duplicateSim;
  return sigmoid(z);
}

export async function updateGatingModelFromFeedback(storage: IStorage): Promise<number> {
  const model = await loadGatingModel();
  const lr = model.lr;
  const w = model.weights;

  const rows = await storage.getAllBulletDecisionsWithFeedback();

  for (const row of rows) {
    const feats = row.bulletFeatures as BulletFeatures;
    const y = row.eventType === "REWRITE_ACCEPTED" ? 1.0 : 0.0;
    const p = gatingProbabilityRewrite(model, feats);
    const grad = p - y;

    w.bias = (w.bias || 0) - lr * grad;
    w.hasMetric = (w.hasMetric || 0) - lr * grad * feats.hasMetric;
    w.hasActionVerb = (w.hasActionVerb || 0) - lr * grad * feats.hasActionVerb;
    w.lenWords = (w.lenWords || 0) - lr * grad * feats.lenWords;
    w.buzzwordDensity = (w.buzzwordDensity || 0) - lr * grad * feats.buzzwordDensity;
    w.specificity = (w.specificity || 0) - lr * grad * feats.specificity;
    w.duplicateSim = (w.duplicateSim || 0) - lr * grad * feats.duplicateSim;
  }

  model.version += 1;
  await fs.writeFile(MODEL_PATH, JSON.stringify(model, null, 2));
  return model.version;
}

export async function extractTextFromPDF(buffer: Buffer): Promise<{ text: string; layout: { parseConfidence: number; twoColumnLikelihood: number } }> {
  const data = await parsePDF(buffer);
  const text = data.text.trim();
  const parseConfidence = Math.min(1.0, text.length / 2500);
  
  // Simple two-column detection (placeholder - full logic would analyze page layout)
  const twoColumnLikelihood = 0.0; // Simplified for now
  
  return {
    text,
    layout: { parseConfidence, twoColumnLikelihood },
  };
}

export async function extractTextFromDOCX(buffer: Buffer): Promise<string> {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(buffer);
  const docXml = await zip.file("word/document.xml")?.async("string");
  
  if (!docXml) {
    throw new Error("Invalid DOCX file");
  }
  
  // Extract text from XML
  const textMatches = docXml.match(/<w:t[^>]*>([^<]+)<\/w:t>/g) || [];
  const texts = textMatches.map(m => m.replace(/<[^>]+>/g, ""));
  return texts.join("\n");
}

function splitSections(text: string): Array<{ key: string; title: string; lines: string[] }> {
  const lines = text.split("\n").map(l => l.trim()).filter(l => l);
  
  if (!lines.length) {
    return [{ key: "full", title: "Resume", lines: [] }];
  }
  
  const heads: Array<{ pos: number; key: string; title: string }> = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.length > 60) continue;
    
    for (const pattern of SECTION_PATTERNS) {
      if (pattern.regex.test(line)) {
        heads.push({ pos: i, key: pattern.key, title: line });
        break;
      }
    }
  }
  
  if (!heads.length) {
    return [{ key: "full", title: "Resume", lines }];
  }
  
  const sections: Array<{ key: string; title: string; lines: string[] }> = [];
  
  for (let i = 0; i < heads.length; i++) {
    const start = heads[i].pos + 1;
    const end = i + 1 < heads.length ? heads[i + 1].pos : lines.length;
    sections.push({
      key: heads[i].key,
      title: heads[i].title,
      lines: lines.slice(start, end),
    });
  }
  
  return sections;
}

function extractBullets(lines: string[]): string[] {
  const bullets: string[] = [];
  
  for (const line of lines) {
    if (BULLET_RE.test(line)) {
      bullets.push(line.replace(BULLET_RE, "").trim());
    } else if (bullets.length > 0) {
      bullets[bullets.length - 1] += " " + line;
    } else {
      bullets.push(line);
    }
  }
  
  return bullets.filter(b => b.trim());
}

function computeBulletFeatures(bullet: string, allBullets: string[]): BulletFeatures {
  const low = bullet.toLowerCase();
  const words = low.match(/[a-zA-Z]+/g) || [];
  const lenWords = words.length;
  
  const hasMetric = /(\d+%|\$\s*\d+|\d{2,})/.test(bullet) ? 1.0 : 0.0;
  // words[0] is guaranteed non-null when length > 0; the non-null assertion
  // is required because TypeScript infers string | undefined for array access.
  const hasActionVerb = words.length > 0 && ACTION_VERBS.has(words[0]!) ? 1.0 : 0.0;
  
  const buzzWords = ["synergy", "leverage", "innovative", "dynamic", "results-driven", "strategic", "passionate"];
  const buzzCount = buzzWords.filter(w => low.includes(w)).length;
  const buzzwordDensity = buzzCount / Math.max(1.0, lenWords / 12.0);
  
  let specificity = 0.0;
  if (/\b(api|sql|python|aws|kubernetes|figma|jira|confluence|react|docker)\b/.test(low)) {
    specificity += 0.5;
  }
  if (hasMetric > 0) {
    specificity += 0.5;
  }
  
  // Jaccard similarity for duplicates
  // Array.from() avoids the --downlevelIteration requirement for Set spread.
  const bulletWords = new Set(words);
  const bulletWordsArr = Array.from(bulletWords);
  const similarities = allBullets
    .filter(b => b !== bullet)
    .map(b => {
      const otherWords = new Set((b.toLowerCase().match(/[a-zA-Z]+/g) || []));
      const otherWordsArr = Array.from(otherWords);
      const intersection = new Set(bulletWordsArr.filter(w => otherWords.has(w)));
      const union = new Set(bulletWordsArr.concat(otherWordsArr));
      return union.size > 0 ? intersection.size / union.size : 0;
    });
  
  const duplicateSim = similarities.length > 0 ? Math.max(...similarities) : 0.0;
  
  return {
    hasMetric,
    hasActionVerb,
    lenWords: Math.min(80, lenWords),
    buzzwordDensity: Math.min(3.0, buzzwordDensity),
    specificity: Math.min(1.0, specificity),
    duplicateSim,
  };
}

export function computeDocFeatures(
  text: string,
  layout: { parseConfidence: number; twoColumnLikelihood: number },
  profession?: string
): DocFeatures {
  const lines = text.split("\n").filter(l => l.trim());
  const sections = splitSections(text);
  
  const allBullets: string[] = [];
  for (const section of sections) {
    allBullets.push(...extractBullets(section.lines));
  }
  
  const metricRatio = allBullets.length > 0
    ? allBullets.filter(b => /(\d+%|\$\s*\d+|\d{2,})/.test(b)).length / allBullets.length
    : 0;
  
  const avgBulletLenWords = allBullets.length > 0
    ? allBullets.reduce((sum, b) => sum + (b.match(/[a-zA-Z]+/g) || []).length, 0) / allBullets.length
    : 0;
  
  const features: DocFeatures = {
    parseConfidence: layout.parseConfidence,
    twoColumnLikelihood: layout.twoColumnLikelihood,
    numLines: lines.length,
    numBullets: allBullets.length,
    avgBulletLenWords,
    metricRatio,
  };
  
  if (profession && PROFESSIONS[profession]) {
    const keywords = PROFESSIONS[profession].keywords;
    const lowText = text.toLowerCase();
    const hits = keywords.filter(k => lowText.includes(k)).length;
    features.keywordCoverageRatio = hits / keywords.length;
  }
  
  return features;
}

export function scoreATS(docFeats: DocFeatures): { score: number; drivers: string[] } {
  const drivers: string[] = [];
  let score = 8.5;
  
  if (docFeats.parseConfidence < 0.4) {
    score -= 2.2;
    drivers.push("Low text extraction confidence (PDF may be scanned or image-based).");
  }
  
  if (docFeats.twoColumnLikelihood > 0.45) {
    score -= 1.6;
    drivers.push("Layout appears multi-column, which may reduce ATS parse accuracy.");
  }
  
  if (docFeats.numLines < 40) {
    score -= 0.7;
    drivers.push("Resume content appears sparse or truncated after extraction.");
  }
  
  drivers.push("Standard headings and plain text improve ATS parsing.");
  
  return { score: Math.max(0, Math.min(10, score)), drivers };
}

export function scoreFormat(docFeats: DocFeatures): { score: number; drivers: string[] } {
  const drivers: string[] = [];
  let score = 8.2;
  
  if (docFeats.avgBulletLenWords > 28) {
    score -= 1.2;
    drivers.push("Bullets are long; shorten for readability and scanning.");
  } else if (docFeats.avgBulletLenWords > 0 && docFeats.avgBulletLenWords < 8) {
    score -= 0.8;
    drivers.push("Bullets are very short; add clarity (what/how/impact).");
  }
  
  if (docFeats.metricRatio < 0.25) {
    score -= 1.1;
    drivers.push("Few bullets include measurable impact; add metrics where truthful.");
  }
  
  drivers.push("Consistency and concise bullets improve presentation.");
  
  return { score: Math.max(0, Math.min(10, score)), drivers };
}

export function scoreRoleFit(docFeats: DocFeatures, profession: string): { score: number; drivers: string[] } {
  const drivers: string[] = [];
  let score = 7.5;
  
  const coverage = docFeats.keywordCoverageRatio || 0;
  
  if (coverage < 0.25) {
    score -= 1.8;
    drivers.push("Low coverage of common role keywords/tools for the selected profession.");
  } else if (coverage < 0.45) {
    score -= 0.9;
    drivers.push("Moderate coverage of role keywords; tighten alignment.");
  }
  
  drivers.push("Role fit is profession-only (generic expectations).");
  
  return { score: Math.max(0, Math.min(10, score)), drivers };
}

export function buildImprovements(
  scores: { ats: number; format: number; role_fit?: number },
  docFeats: DocFeatures,
  profession?: string
): Array<{ key: string; title: string; detail: string }> {
  const improvements: Array<{ key: string; title: string; detail: string }> = [];
  
  if (scores.ats < 6.5) {
    improvements.push({
      key: "ats_layout",
      title: "Switch to a single-column, ATS-safe layout",
      detail: "Avoid multi-column layouts, text boxes, icons, and tables for structure. Use standard section headings.",
    });
  }
  
  if (docFeats.parseConfidence < 0.4) {
    improvements.push({
      key: "ats_parse",
      title: "Ensure the resume is machine-readable text",
      detail: "If your PDF is scanned, export a text-based PDF or upload DOCX.",
    });
  }
  
  if (scores.format < 7.0) {
    improvements.push({
      key: "fmt_bullets",
      title: "Tighten bullet writing for scan-ability",
      detail: "Use: Action + What + How + Impact. Remove filler phrases.",
    });
  }
  
  if (docFeats.metricRatio < 0.25) {
    improvements.push({
      key: "fmt_metrics",
      title: "Add measurable outcomes where truthful",
      detail: "Add %/$/# metrics to show impact (only facts).",
    });
  }
  
  if (profession && scores.role_fit !== undefined && scores.role_fit < 7.0) {
    improvements.push({
      key: "role_keywords",
      title: "Align skills and keywords to the profession",
      detail: "Add relevant tools/keywords you truly used. Keep it specific and honest.",
    });
  }
  
  if (improvements.length === 0) {
    improvements.push({
      key: "general_polish",
      title: "Polish consistency and clarity",
      detail: "Standardize tense, dates, and section order. Keep summaries factual and impact-focused.",
    });
  }
  
  return improvements.slice(0, 8);
}

async function openaiRewriteBullets(bullets: string[], profession: string | undefined, sectionTitle: string): Promise<string[]> {
  try {
    const client = getOpenAI();
    if (!client) {
      console.warn("OpenAI API key not configured — skipping LLM rewrite.");
      return bullets;
    }
    // OpenAI SDK v6: pass request options as the second argument.
    // 15 s per-call timeout prevents a single slow response from
    // exhausting the Vercel function's execution budget.
    const response = await client.chat.completions.create(
      {
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              "You rewrite resume bullets conservatively.\n" +
              "Rules:\n" +
              "- Do NOT invent facts.\n" +
              "- Keep the same number of bullets.\n" +
              "- If a bullet is already strong, return it unchanged.\n" +
              "- Keep tense consistent.\n" +
              "- Prefer clear, ATS-friendly phrasing.\n" +
              "- Avoid emojis and fancy symbols.\n" +
              "Return ONLY a JSON array of strings.",
          },
          {
            role: "user",
            content:
              `Section: ${sectionTitle}\n` +
              `Profession (optional): ${profession || "None"}\n\n` +
              "Bullets:\n" +
              bullets.map(b => `- ${b}`).join("\n"),
          },
        ],
        response_format: { type: "json_object" },
        max_completion_tokens: 2048,
      },
      { timeout: 15_000 },
    );
    
    const content = response.choices[0]?.message?.content || "{}";
    const parsed = JSON.parse(content);
    
    // Handle various JSON formats
    if (Array.isArray(parsed)) {
      return parsed.length === bullets.length ? parsed : bullets;
    } else if (parsed.bullets && Array.isArray(parsed.bullets)) {
      return parsed.bullets.length === bullets.length ? parsed.bullets : bullets;
    } else if (parsed.rewritten && Array.isArray(parsed.rewritten)) {
      return parsed.rewritten.length === bullets.length ? parsed.rewritten : bullets;
    }
    
    return bullets;
  } catch (err) {
    console.error("LLM rewrite error:", err);
    return bullets;
  }
}

export async function rewriteResume(
  text: string,
  profession?: string
): Promise<{
  sections: Array<{ key: string; title: string; before: string[]; after: string[] }>;
  decisions: Array<{ sectionKey: string; bulletIndex: number; bulletFeatures: BulletFeatures; decision: string; decisionConf: number }>;
  modelVersion: number;
}> {
  const model = await loadGatingModel();
  const sections = splitSections(text);
  
  const allBullets: string[] = [];
  const secBullets: Array<{ key: string; title: string; bullets: string[] }> = [];
  
  for (const section of sections) {
    const bullets = extractBullets(section.lines);
    secBullets.push({ key: section.key, title: section.title, bullets });
    allBullets.push(...bullets);
  }
  
  // Process every section concurrently — sequential awaits multiplied the
  // OpenAI latency by the number of sections, causing Vercel timeouts.
  const results = await Promise.all(
    secBullets
      .filter(sec => sec.bullets.length > 0)
      .map(async sec => {
        const featsList = sec.bullets.map(b => computeBulletFeatures(b, allBullets));
        const rewriteFlags = featsList.map(f => gatingProbabilityRewrite(model, f) > 0.55);
        const rewritten = await openaiRewriteBullets(sec.bullets, profession, sec.title);

        const finalAfter: string[] = [];
        const secDecisions: Array<{ sectionKey: string; bulletIndex: number; bulletFeatures: BulletFeatures; decision: string; decisionConf: number }> = [];

        for (let i = 0; i < sec.bullets.length; i++) {
          const after = i < rewritten.length ? rewritten[i] : sec.bullets[i];
          finalAfter.push(rewriteFlags[i] ? after : sec.bullets[i]);
          secDecisions.push({
            sectionKey: sec.key,
            bulletIndex: i,
            bulletFeatures: featsList[i],
            decision: rewriteFlags[i] ? "REWRITE" : "KEEP",
            decisionConf: gatingProbabilityRewrite(model, featsList[i]),
          });
        }

        return {
          section: { key: sec.key, title: sec.title, before: sec.bullets, after: finalAfter },
          decisions: secDecisions,
        };
      }),
  );

  const outSections = results.map(r => r.section);
  const decisions = results.flatMap(r => r.decisions);

  return { sections: outSections, decisions, modelVersion: model.version };
}
