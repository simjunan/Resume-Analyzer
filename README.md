# ATS Resume Reviewer (Learning, not just a wrapper)

A web-based resume reviewer that:
- Scores resumes (0–10) on **ATS Compatibility**, **Format & Presentation**, and **Role Fit** (optional profession)
- Provides **feedback and improvements**
- Produces **Before/After rewrites** (desktop side-by-side, mobile shows rewrite by default) with **yellow highlights**
- Offers **ATS DOCX templates** (3 variants) **only when ATS < 6.5/10**
- Learns over time **without storing resumes**: stores only anonymized feature vectors + user feedback to improve rewrite gating and suggestion ranking.

## Quickstart (Replit)
1. Upload this project ZIP to Replit.
2. In Replit Secrets, add:
   - `OPENAI_API_KEY`
3. Run:
   - `cd backend && pip install -r requirements.txt`
   - `uvicorn app.main:app --host 0.0.0.0 --port 8000`
4. Open the web view.

## Privacy
- The server **does not store resume files or extracted resume text**.
- It stores only numeric/boolean features and user feedback (if consented), in `backend/app/data/app.db`.

## Template files
Located in `backend/templates/`:
- ATS_Resume_Template_Classic.docx
- ATS_Resume_Template_Modern_Minimal.docx
- ATS_Resume_Template_Compact.docx
