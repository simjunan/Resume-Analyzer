import { useState, useRef } from "react";
import { UploadCloud, FileText, X, Briefcase, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface UploadSectionProps {
  onSubmit: (formData: FormData) => void;
  isPending: boolean;
}

const PROFESSIONS = [
  { id: "software_engineer", label: "Software Engineer" },
  { id: "product_manager", label: "Product Manager" },
  { id: "product_designer", label: "Product Designer" },
  { id: "business_analyst", label: "Business Analyst" },
  { id: "solution_engineer", label: "Solution Engineer (Customer-facing)" },
];

export function UploadSection({ onSubmit, isPending }: UploadSectionProps) {
  const [file, setFile] = useState<File | null>(null);
  const [profession, setProfession] = useState<string>("");
  const [consent, setConsent] = useState(true);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => setIsDragging(false);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const droppedFile = e.dataTransfer.files[0];
      if (droppedFile.name.endsWith(".pdf") || droppedFile.name.endsWith(".docx")) {
        setFile(droppedFile);
      }
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);
    formData.append("profession", profession);
    formData.append("consent", consent.toString());
    
    onSubmit(formData);
  };

  return (
    <div className="w-full max-w-3xl mx-auto glass-panel rounded-3xl p-6 sm:p-10 relative overflow-hidden">
      {/* Decorative background blur blobs */}
      <div className="absolute -top-24 -right-24 w-64 h-64 bg-primary/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-24 -left-24 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="relative z-10 text-center mb-8">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 text-primary mb-4">
          <UploadCloud className="w-8 h-8" />
        </div>
        <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-2">Analyze Your Resume</h2>
        <p className="text-slate-600 max-w-lg mx-auto">
          Upload your PDF or DOCX file to get instant ATS scoring, actionable feedback, and AI-powered bullet rewrites.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6 relative z-10">
        
        {/* File Dropzone */}
        <div 
          onClick={() => !file && fileInputRef.current?.click()}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={cn(
            "border-2 border-dashed rounded-2xl p-8 text-center transition-all duration-200",
            !file ? "cursor-pointer hover:bg-slate-50/50" : "",
            isDragging ? "border-primary bg-primary/5" : "border-slate-200",
            file ? "bg-white border-solid shadow-sm" : ""
          )}
        >
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            accept=".pdf,.docx" 
            className="hidden" 
          />
          
          {file ? (
            <div className="flex items-center justify-between bg-slate-50 rounded-xl p-4 border border-slate-100">
              <div className="flex items-center gap-3 overflow-hidden">
                <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  <FileText className="w-5 h-5" />
                </div>
                <div className="text-left truncate">
                  <p className="text-sm font-medium text-slate-900 truncate">{file.name}</p>
                  <p className="text-xs text-slate-500">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                </div>
              </div>
              <Button 
                type="button" 
                variant="ghost" 
                size="icon" 
                onClick={(e) => { e.stopPropagation(); setFile(null); }}
                className="text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-full"
              >
                <X className="w-5 h-5" />
              </Button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 text-slate-500 py-4">
              <p className="text-sm font-medium text-slate-700">Click to upload or drag and drop</p>
              <p className="text-xs">PDF or DOCX (max 5MB)</p>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {/* Profession Select */}
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
              <Briefcase className="w-4 h-4 text-primary" />
              Target Profession (Optional)
            </label>
            <select 
              value={profession} 
              onChange={(e) => setProfession(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
            >
              <option value="">General Review (No specific role)</option>
              {PROFESSIONS.map(p => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </select>
          </div>

          {/* Privacy Consent */}
          <div className="space-y-2 flex flex-col justify-end pb-1">
            <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
               <ShieldCheck className="w-4 h-4 text-primary" />
               Privacy & Learning
            </label>
            <label className="flex items-start gap-3 p-3 rounded-xl border border-slate-100 bg-slate-50 cursor-pointer hover:bg-slate-100 transition-colors">
              <input 
                type="checkbox" 
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary"
              />
              <span className="text-xs text-slate-600 leading-relaxed">
                Help improve the model by sharing anonymized signals. <strong className="text-slate-800 font-medium">No resume text is stored.</strong>
              </span>
            </label>
          </div>
        </div>

        <Button 
          type="submit" 
          disabled={!file || isPending}
          className="w-full py-6 rounded-xl text-base font-semibold shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/30 hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200"
        >
          {isPending ? "Analyzing resume..." : "Review My Resume"}
        </Button>
      </form>
    </div>
  );
}
