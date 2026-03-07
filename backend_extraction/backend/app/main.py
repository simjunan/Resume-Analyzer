from __future__ import annotations
import os, re, json, math, uuid, sqlite3
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import requests
import pdfplumber
from docx import Document as DocxDocument
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse
from pydantic import BaseModel

APP_DIR = Path(__file__).resolve().parent
BACKEND_DIR = APP_DIR.parent
DATA_DIR = APP_DIR / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)
DB_PATH = DATA_DIR / "app.db"
MODEL_PATH = DATA_DIR / "gating_model.json"

TEMPLATE_DIR = BACKEND_DIR / "templates"
TEMPLATES = {
    "classic": TEMPLATE_DIR / "ATS_Resume_Template_Classic.docx",
    "modern": TEMPLATE_DIR / "ATS_Resume_Template_Modern_Minimal.docx",
    "compact": TEMPLATE_DIR / "ATS_Resume_Template_Compact.docx",
}

PROFESSIONS = {
    "software_engineer": {"keywords": ["python","java","javascript","typescript","react","node","sql","api","microservices","aws","docker","kubernetes","testing","ci/cd","performance","scalability","distributed","git"]},
    "product_manager": {"keywords": ["roadmap","stakeholder","prioritization","metrics","kpi","experiment","a/b","discovery","strategy","go-to-market","gtm","requirements","prd","analytics","funnel","retention","activation","alignment"]},
    "product_designer": {"keywords": ["figma","prototype","wireframe","ux","ui","design system","user research","usability","journey","accessibility","interaction","visual","information architecture"]},
    "business_analyst": {"keywords": ["requirements","brd","user stories","process","stakeholders","uat","sql","data","mapping","workflows","gap analysis","documentation","confluence","jira"]},
    "solution_engineer": {"keywords": ["pre-sales","customer","demo","integration","api","solution","architecture","technical","requirements","stakeholder","enablement","workshop","poc","troubleshooting"]},
}

ACTION_VERBS = set("built created designed developed improved increased reduced led owned delivered launched optimized automated implemented migrated analyzed evaluated managed collaborated coordinated drove shipped executed negotiated architected scaled".split())

app = FastAPI(title="ATS Resume Reviewer")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

def db() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    with db() as conn:
        conn.executescript("""
        CREATE TABLE IF NOT EXISTS review_sessions(
          id TEXT PRIMARY KEY,
          created_at TEXT NOT NULL,
          profession TEXT,
          consent INTEGER NOT NULL,
          doc_features TEXT NOT NULL,
          scores TEXT NOT NULL,
          model_versions TEXT NOT NULL,
          parse_warning TEXT
        );
        CREATE TABLE IF NOT EXISTS bullet_decisions(
          id TEXT PRIMARY KEY,
          session_id TEXT NOT NULL,
          section_key TEXT NOT NULL,
          bullet_index INTEGER NOT NULL,
          bullet_features TEXT NOT NULL,
          decision TEXT NOT NULL,
          decision_conf REAL NOT NULL
        );
        CREATE TABLE IF NOT EXISTS feedback_events(
          id TEXT PRIMARY KEY,
          session_id TEXT NOT NULL,
          created_at TEXT NOT NULL,
          event_type TEXT NOT NULL,
          target_id TEXT,
          value TEXT NOT NULL
        );
        """)

def load_gating_model() -> Dict[str, Any]:
    if MODEL_PATH.exists():
        return json.loads(MODEL_PATH.read_text())
    model = {
        "version": 1,
        "weights": {
            "bias": 0.8,
            "has_metric": -0.9,
            "has_action_verb": -0.5,
            "len_words": 0.03,
            "buzzword_density": 0.8,
            "specificity": -0.6,
            "duplicate_sim": 0.7,
        },
        "lr": 0.05,
    }
    MODEL_PATH.write_text(json.dumps(model, indent=2))
    return model

def sigmoid(x: float) -> float:
    return 1 / (1 + math.exp(-x))

def gating_probability_rewrite(model: Dict[str, Any], feats: Dict[str, float]) -> float:
    w = model["weights"]
    z = w.get("bias", 0.0)
    for k, v in feats.items():
        z += w.get(k, 0.0) * float(v)
    return sigmoid(z)

def update_gating_model_from_feedback() -> int:
    model = load_gating_model()
    lr = float(model.get("lr", 0.05))
    w = model["weights"]
    with db() as conn:
        rows = conn.execute("""
          SELECT b.bullet_features AS feats, f.event_type AS y, b.section_key AS sk, b.bullet_index AS bi
          FROM bullet_decisions b
          JOIN feedback_events f
            ON f.session_id = b.session_id
           AND f.target_id = (b.section_key || ':' || b.bullet_index)
          WHERE f.event_type IN ('REWRITE_ACCEPTED','REWRITE_REJECTED')
        """).fetchall()
    for r in rows:
        feats = json.loads(r["feats"])
        y = 1.0 if r["y"] == "REWRITE_ACCEPTED" else 0.0
        p = gating_probability_rewrite(model, feats)
        grad = (p - y)
        w["bias"] = w.get("bias", 0.0) - lr * grad
        for k, v in feats.items():
            w[k] = w.get(k, 0.0) - lr * grad * float(v)
    model["version"] = int(model.get("version", 1)) + 1
    MODEL_PATH.write_text(json.dumps(model, indent=2))
    return model["version"]

def extract_text_docx(file_bytes: bytes) -> str:
    from io import BytesIO
    doc = DocxDocument(BytesIO(file_bytes))
    parts = []
    for p in doc.paragraphs:
        txt = (p.text or "").strip()
        if txt:
            parts.append(txt)
    return "\n".join(parts)

def pdf_layout_features(pdf: pdfplumber.PDF) -> Dict[str, Any]:
    xs = []
    two_col = 0.0
    first_page = None
    try:
        first_page = pdf.pages[0]
        words = first_page.extract_words() or []
        for w in words[:300]:
            xs.append(float(w.get("x0", 0.0)))
    except Exception:
        return {"two_column_likelihood": 0.0}
    if len(xs) >= 30 and first_page is not None:
        xs_sorted = sorted(xs)
        mid = xs_sorted[len(xs_sorted)//2]
        left = [x for x in xs if x < mid]
        right = [x for x in xs if x >= mid]
        if left and right:
            gap = (min(right) - max(left))
            width = float(first_page.width) if first_page.width else 600.0
            two_col = max(0.0, min(1.0, gap / max(width, 1.0) * 4))
    return {"two_column_likelihood": two_col}

def extract_text_pdf(file_bytes: bytes) -> Tuple[str, Dict[str, Any]]:
    from io import BytesIO
    with pdfplumber.open(BytesIO(file_bytes)) as pdf:
        layout = pdf_layout_features(pdf)
        text_parts = []
        for p in pdf.pages[:5]:
            txt = (p.extract_text() or "").strip()
            if txt:
                text_parts.append(txt)
        text = "\n".join(text_parts).strip()
        conf = min(1.0, len(text) / 2500.0) if text else 0.0
        layout["parse_confidence"] = conf
        return text, layout

SECTION_PATTERNS = [
    ("summary", re.compile(r"^(summary|professional summary|profile)$", re.I)),
    ("experience", re.compile(r"^(experience|work experience|employment|professional experience)$", re.I)),
    ("projects", re.compile(r"^(projects|project experience)$", re.I)),
    ("education", re.compile(r"^(education)$", re.I)),
    ("skills", re.compile(r"^(skills|technical skills|core competencies)$", re.I)),
    ("certifications", re.compile(r"^(certifications|certificates)$", re.I)),
]

def split_sections(text: str) -> List[Tuple[str, str, List[str]]]:
    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
    if not lines:
        return [("full", "Resume", [])]
    heads = []
    for i, ln in enumerate(lines):
        if len(ln) > 60:
            continue
        for key, pat in SECTION_PATTERNS:
            if pat.match(ln):
                heads.append((i, key, ln.title()))
                break
    if not heads:
        return [("full", "Resume", lines)]
    heads = sorted({h for h in heads}, key=lambda x: x[0])
    sections = []
    for idx, (pos, key, title) in enumerate(heads):
        start = pos + 1
        end = heads[idx+1][0] if idx+1 < len(heads) else len(lines)
        sections.append((key, title, lines[start:end]))
    return sections

BULLET_RE = re.compile(r"^(\u2022|\-|\*|\u00b7|\u25cf)\s+")

def extract_bullets(lines: List[str]) -> List[str]:
    bullets: List[str] = []
    for ln in lines:
        if BULLET_RE.match(ln):
            bullets.append(BULLET_RE.sub("", ln).strip())
        else:
            if bullets:
                bullets[-1] = (bullets[-1] + " " + ln).strip()
            else:
                bullets.append(ln.strip())
    return [b for b in bullets if b]

def compute_bullet_features(b: str, all_bullets: List[str]) -> Dict[str, float]:
    low = b.lower()
    words = re.findall(r"[a-zA-Z]+", low)
    len_words = float(len(words))
    has_metric = 1.0 if re.search(r"(\d+%|\$\s*\d+|\d{2,})", b) else 0.0
    has_action = 1.0 if words and words[0] in ACTION_VERBS else 0.0

    buzz = ["synergy","leverage","innovative","dynamic","results-driven","strategic","passionate"]
    buzz_count = sum(1 for w in buzz if w in low)
    buzzword_density = (buzz_count / max(1.0, len_words/12.0))

    specificity = 0.0
    specificity += 0.5 if re.search(r"\b(api|sql|python|aws|kubernetes|figma|jira|confluence|react|docker)\b", low) else 0.0
    specificity += 0.5 if has_metric else 0.0

    def jacc(a:set, c:set)->float:
        if not a or not c: return 0.0
        return len(a & c) / len(a | c)
    s = set(words)
    sims = [jacc(s, set(re.findall(r"[a-zA-Z]+", x.lower()))) for x in all_bullets if x != b]
    dup = max(sims) if sims else 0.0

    return {
        "has_metric": has_metric,
        "has_action_verb": has_action,
        "len_words": min(80.0, len_words),
        "buzzword_density": min(3.0, float(buzzword_density)),
        "specificity": min(1.0, float(specificity)),
        "duplicate_sim": float(dup),
    }

def compute_doc_features(text: str, layout: Dict[str, Any], profession: Optional[str]) -> Dict[str, Any]:
    lines = [ln for ln in text.splitlines() if ln.strip()]
    bullets: List[str] = []
    for _,_,sec_lines in split_sections(text):
        bullets.extend(extract_bullets(sec_lines))
    metric_ratio = sum(1 for b in bullets if re.search(r"(\d+%|\$\s*\d+|\d{2,})", b)) / max(1, len(bullets))

    doc_feats: Dict[str, Any] = {
        "parse_confidence": float(layout.get("parse_confidence", 0.0)),
        "two_column_likelihood": float(layout.get("two_column_likelihood", 0.0)),
        "num_lines": len(lines),
        "num_bullets": len(bullets),
        "avg_bullet_len_words": float(sum(len(re.findall(r"[a-zA-Z]+", b)) for b in bullets) / max(1, len(bullets))) if bullets else 0.0,
        "metric_ratio": float(metric_ratio),
    }

    if profession and profession in PROFESSIONS:
        kws = PROFESSIONS[profession]["keywords"]
        low = text.lower()
        hits = sum(1 for k in kws if k in low)
        doc_feats["keyword_coverage_ratio"] = hits / max(1, len(kws))

    return doc_feats

def score_ats(doc_feats: Dict[str, Any]) -> Tuple[float, List[str]]:
    drivers: List[str] = []
    score = 8.5
    pc = doc_feats.get("parse_confidence", 0.0)
    if pc < 0.4:
        score -= 2.2; drivers.append("Low text extraction confidence (PDF may be scanned or image-based).")
    if doc_feats.get("two_column_likelihood", 0.0) > 0.45:
        score -= 1.6; drivers.append("Layout appears multi-column, which may reduce ATS parse accuracy.")
    if doc_feats.get("num_lines", 0) < 40:
        score -= 0.7; drivers.append("Resume content appears sparse or truncated after extraction.")
    drivers.append("Standard headings and plain text improve ATS parsing.")
    return max(0.0, min(10.0, score)), drivers

def score_format(doc_feats: Dict[str, Any]) -> Tuple[float, List[str]]:
    drivers: List[str] = []
    score = 8.2
    avg_len = doc_feats.get("avg_bullet_len_words", 0.0)
    if avg_len > 28:
        score -= 1.2; drivers.append("Bullets are long; shorten for readability and scanning.")
    elif avg_len and avg_len < 8:
        score -= 0.8; drivers.append("Bullets are very short; add clarity (what/how/impact).")
    mr = doc_feats.get("metric_ratio", 0.0)
    if mr < 0.25:
        score -= 1.1; drivers.append("Few bullets include measurable impact; add metrics where truthful.")
    drivers.append("Consistency and concise bullets improve presentation.")
    return max(0.0, min(10.0, score)), drivers

def score_role_fit(doc_feats: Dict[str, Any], profession: str) -> Tuple[float, List[str]]:
    drivers: List[str] = []
    score = 7.5
    cov = doc_feats.get("keyword_coverage_ratio", 0.0)
    if cov < 0.25:
        score -= 1.8; drivers.append("Low coverage of common role keywords/tools for the selected profession.")
    elif cov < 0.45:
        score -= 0.9; drivers.append("Moderate coverage of role keywords; tighten alignment.")
    drivers.append("Role fit is profession-only (generic expectations).")
    return max(0.0, min(10.0, score)), drivers

def build_improvements(scores: Dict[str, Any], doc_feats: Dict[str, Any], profession: Optional[str]) -> List[Dict[str, str]]:
    improvements: List[Dict[str, str]] = []
    if scores["ats"] < 6.5:
        improvements.append({"key":"ats_layout", "title":"Switch to a single-column, ATS-safe layout", "detail":"Avoid multi-column layouts, text boxes, icons, and tables for structure. Use standard section headings."})
    if doc_feats.get("parse_confidence", 1.0) < 0.4:
        improvements.append({"key":"ats_parse", "title":"Ensure the resume is machine-readable text", "detail":"If your PDF is scanned, export a text-based PDF or upload DOCX."})
    if scores["format"] < 7.0:
        improvements.append({"key":"fmt_bullets", "title":"Tighten bullet writing for scan-ability", "detail":"Use: Action + What + How + Impact. Remove filler phrases."})
    if doc_feats.get("metric_ratio", 0.0) < 0.25:
        improvements.append({"key":"fmt_metrics", "title":"Add measurable outcomes where truthful", "detail":"Add %/$/# metrics to show impact (only facts)."})
    if profession and scores.get("role_fit") is not None and scores["role_fit"] < 7.0:
        improvements.append({"key":"role_keywords", "title":"Align skills and keywords to the profession", "detail":"Add relevant tools/keywords you truly used. Keep it specific and honest."})
    if not improvements:
        improvements.append({"key":"general_polish", "title":"Polish consistency and clarity", "detail":"Standardize tense, dates, and section order. Keep summaries factual and impact-focused."})
    return improvements[:8]

def openai_rewrite_bullets(bullets: List[str], profession: Optional[str], section_title: str) -> List[str]:
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        return bullets

    body = {
        "model": "gpt-5.2",
        "input": [
            {"role":"system","content":(
                "You rewrite resume bullets conservatively.\n"
                "Rules:\n"
                "- Do NOT invent facts.\n"
                "- Keep the same number of bullets.\n"
                "- If a bullet is already strong, return it unchanged.\n"
                "- Keep tense consistent.\n"
                "- Prefer clear, ATS-friendly phrasing.\n"
                "- Avoid emojis and fancy symbols.\n"
                "Return ONLY a JSON array of strings.\n"
            )},
            {"role":"user","content":(
                f"Section: {section_title}\n"
                f"Profession (optional): {profession or 'None'}\n\n"
                "Bullets:\n" + "\n".join([f"- {b}" for b in bullets])
            )},
        ],
        "text": {"verbosity":"low"},
    }

    resp = requests.post(
        "https://api.openai.com/v1/responses",
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        json=body,
        timeout=60,
    )
    if resp.status_code >= 400:
        return bullets

    data = resp.json()
    out_text = data.get("output_text") or ""
    try:
        arr = json.loads(out_text)
        if isinstance(arr, list) and all(isinstance(x, str) for x in arr) and len(arr) == len(bullets):
            return arr
    except Exception:
        pass
    return bullets

def rewrite_resume(text: str, profession: Optional[str]) -> Dict[str, Any]:
    model = load_gating_model()
    sections = split_sections(text)

    all_bullets: List[str] = []
    sec_bullets: List[Tuple[str,str,List[str]]] = []
    for key, title, lines in sections:
        buls = extract_bullets(lines)
        sec_bullets.append((key, title, buls))
        all_bullets.extend(buls)

    out_sections = []
    decisions_to_store = []

    for key, title, buls in sec_bullets:
        if not buls:
            continue
        feats_list = [compute_bullet_features(b, all_bullets) for b in buls]
        rewrite_flags = [gating_probability_rewrite(model, f) > 0.55 for f in feats_list]

        rewritten = openai_rewrite_bullets(buls, profession, title)

        final_after: List[str] = []
        for i, b in enumerate(buls):
            after = rewritten[i] if i < len(rewritten) else b
            if not rewrite_flags[i]:
                after = b
            final_after.append(after)
            decisions_to_store.append((key, i, feats_list[i], "REWRITE" if rewrite_flags[i] else "KEEP", float(gating_probability_rewrite(model, feats_list[i]))))

        out_sections.append({"key": key, "title": title, "before": buls, "after": final_after})

    return {"sections": out_sections, "decisions": decisions_to_store, "model_version": int(model.get("version", 1))}

class FeedbackIn(BaseModel):
    session_id: str
    event_type: str
    target_id: Optional[str] = None
    value: Dict[str, Any] = {}

@app.get("/", response_class=HTMLResponse)
def home():
    return HTMLResponse((BACKEND_DIR / "static" / "index.html").read_text(encoding="utf-8"))

@app.post("/api/review")
async def review_resume(file: UploadFile = File(...), profession: str = Form(""), consent: str = Form("true")):
    init_db()

    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=400, detail="Empty file.")
    fn = (file.filename or "").lower()
    if not (fn.endswith(".pdf") or fn.endswith(".docx")):
        raise HTTPException(status_code=400, detail="Only PDF or DOCX supported.")

    profession = profession.strip() or None
    if profession and profession not in PROFESSIONS:
        raise HTTPException(status_code=400, detail="Invalid profession.")

    consent_bool = 1 if consent.lower() == "true" else 0

    try:
        if fn.endswith(".docx"):
            text = extract_text_docx(raw)
            layout = {"parse_confidence": min(1.0, len(text)/2500.0), "two_column_likelihood": 0.0}
        else:
            text, layout = extract_text_pdf(raw)
    except Exception:
        raise HTTPException(status_code=400, detail="Failed to parse file. Try a different PDF/DOCX.")

    parse_warning = None
    if not text or len(text) < 200:
        parse_warning = "We extracted very little text. If this is a scanned PDF, export a text-based PDF or upload DOCX."

    doc_feats = compute_doc_features(text, layout, profession)

    ats_score, ats_dr = score_ats(doc_feats)
    fmt_score, fmt_dr = score_format(doc_feats)

    role_score = None
    role_dr = None
    if profession:
        role_score, role_dr = score_role_fit(doc_feats, profession)

    scores = {"ats": ats_score, "format": fmt_score, "role_fit": role_score}
    score_drivers = {"ats": ats_dr, "format": fmt_dr, "role_fit": role_dr}

    improvements = build_improvements(scores, doc_feats, profession)
    rewrite = rewrite_resume(text, profession)

    session_id = str(uuid.uuid4())
    model_versions = {"gating_model_version": rewrite["model_version"], "llm_prompt_version": 1}

    if consent_bool == 1:
        with db() as conn:
            conn.execute(
                "INSERT INTO review_sessions(id, created_at, profession, consent, doc_features, scores, model_versions, parse_warning) VALUES (?,?,?,?,?,?,?,?)",
                (session_id, __import__("datetime").datetime.utcnow().isoformat(), profession, consent_bool,
                 json.dumps(doc_feats), json.dumps(scores), json.dumps(model_versions), parse_warning),
            )
            for (sec_key, idx, bfeats, decision, conf) in rewrite["decisions"]:
                conn.execute(
                    "INSERT INTO bullet_decisions(id, session_id, section_key, bullet_index, bullet_features, decision, decision_conf) VALUES (?,?,?,?,?,?,?)",
                    (str(uuid.uuid4()), session_id, sec_key, int(idx), json.dumps(bfeats), decision, float(conf)),
                )

    return {
        "session_id": session_id,
        "profession": profession,
        "scores": scores,
        "score_drivers": score_drivers,
        "improvements": improvements,
        "rewrite": {"sections": rewrite["sections"]},
        "show_templates": (ats_score < 6.5),
        "parse_warning": parse_warning,
    }

@app.post("/api/feedback")
def feedback(inp: FeedbackIn):
    init_db()
    with db() as conn:
        conn.execute(
            "INSERT INTO feedback_events(id, session_id, created_at, event_type, target_id, value) VALUES (?,?,?,?,?,?)",
            (str(uuid.uuid4()), inp.session_id, __import__("datetime").datetime.utcnow().isoformat(),
             inp.event_type, inp.target_id, json.dumps(inp.value or {})),
        )
    return {"ok": True}

@app.post("/api/admin/retrain")
def retrain():
    init_db()
    new_ver = update_gating_model_from_feedback()
    return {"ok": True, "gating_model_version": new_ver}

@app.get("/api/templates/{template_key}")
def download_template(template_key: str):
    path = TEMPLATES.get(template_key)
    if not path or not path.exists():
        raise HTTPException(status_code=404, detail="Template not found")
    return FileResponse(
        path=path,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        filename=path.name,
    )
