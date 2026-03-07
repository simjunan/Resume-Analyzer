import { useState, useRef, useEffect } from "react";
import { useSubmitReview, type ReviewResponse } from "@/hooks/use-review";
import { UploadSection } from "@/components/UploadSection";
import { ScoreCard } from "@/components/ScoreCard";
import { FeedbackList } from "@/components/FeedbackList";
import { RewriteSection } from "@/components/RewriteSection";
import { AlertTriangle, Download, FileText, Sparkles, Target, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Home() {
  const reviewMutation = useSubmitReview();
  const [report, setReport] = useState<ReviewResponse | null>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  const handleUpload = (formData: FormData) => {
    reviewMutation.mutate(formData, {
      onSuccess: (data) => {
        setReport(data);
        // Small delay to allow render before scrolling
        setTimeout(() => {
          resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 100);
      }
    });
  };

  return (
    <div className="min-h-screen bg-slate-50/50 pb-24">
      {/* Premium Header */}
      <header className="bg-white border-b sticky top-0 z-50 shadow-sm shadow-slate-200/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5 text-primary">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Sparkles className="w-5 h-5" />
            </div>
            <span className="font-display font-bold text-lg text-slate-900 tracking-tight">
              Resume<span className="text-primary">Revise</span>
            </span>
          </div>
          <div className="text-xs font-medium text-slate-500 bg-slate-100 px-3 py-1.5 rounded-full flex items-center gap-1.5">
            <ShieldIcon />
            Privacy First
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-12">
        
        {/* Upload State */}
        <div className={`transition-all duration-700 ${report ? 'hidden' : 'block animate-slide-up'}`}>
          <UploadSection onSubmit={handleUpload} isPending={reviewMutation.isPending} />
          
          <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-8 max-w-4xl mx-auto text-center">
            <Feature icon={<Target className="w-5 h-5 text-blue-500" />} title="ATS Optimization" desc="Ensures your formatting passes through recruiting software filters." />
            <Feature icon={<FileText className="w-5 h-5 text-teal-500" />} title="Smart Rewrites" desc="AI transforms weak bullets into powerful, metrics-driven achievements." />
            <Feature icon={<Settings2 className="w-5 h-5 text-indigo-500" />} title="Role Alignment" desc="Checks your keywords against industry standards for your target role." />
          </div>
        </div>

        {/* Results State */}
        {report && (
          <div ref={resultsRef} className="animate-slide-up space-y-12 pb-12 pt-4">
            
            {/* Action Bar */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-white p-4 rounded-2xl border shadow-sm">
              <div className="text-sm font-medium text-slate-600">
                Analysis complete for <span className="font-bold text-slate-900">{report.profession ? report.profession.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase()) : 'General Resume'}</span>
              </div>
              <Button onClick={() => setReport(null)} variant="outline" className="w-full sm:w-auto">
                Review Another Resume
              </Button>
            </div>

            {/* Parse Warning */}
            {report.parse_warning && (
              <div className="flex gap-3 bg-amber-50 border border-amber-200 text-amber-900 p-4 rounded-2xl animate-slide-up stagger-1">
                <AlertTriangle className="w-5 h-5 shrink-0 text-amber-600 mt-0.5" />
                <div>
                  <h4 className="font-semibold text-amber-800">Parsing Warning</h4>
                  <p className="text-sm mt-1 leading-relaxed opacity-90">{report.parse_warning}</p>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              
              {/* Main Content Area */}
              <div className="lg:col-span-8 xl:col-span-9 space-y-12">
                
                {/* Scoring Grid */}
                <section id="scoring" className="scroll-mt-24 animate-slide-up stagger-1">
                  <div className="flex items-center gap-2 mb-6">
                    <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center">
                      <Target className="w-4 h-4" />
                    </div>
                    <h2 className="text-2xl font-bold text-slate-900">Scoring Analysis</h2>
                  </div>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-5">
                    <ScoreCard 
                      title="ATS Compatibility" 
                      score={report.scores.ats} 
                      drivers={report.score_drivers.ats} 
                    />
                    <ScoreCard 
                      title="Format & Presentation" 
                      score={report.scores.format} 
                      drivers={report.score_drivers.format} 
                    />
                    {report.scores.role_fit !== undefined && report.score_drivers.role_fit && (
                      <ScoreCard 
                        title="Skillset / Role Fit" 
                        score={report.scores.role_fit} 
                        drivers={report.score_drivers.role_fit} 
                        className="sm:col-span-2 lg:col-span-2 xl:col-span-1"
                      />
                    )}
                  </div>
                </section>

                {/* Templates (Conditional) */}
                {report.show_templates && (
                  <section id="templates" className="scroll-mt-24 animate-slide-up stagger-2 bg-gradient-to-br from-slate-900 to-slate-800 rounded-3xl p-8 text-white shadow-xl">
                    <div className="max-w-2xl">
                      <h2 className="text-xl font-bold mb-2 flex items-center gap-2">
                        <Download className="w-5 h-5 text-teal-400" />
                        ATS-Optimized Templates
                      </h2>
                      <p className="text-slate-300 text-sm mb-6 leading-relaxed">
                        Your ATS score was below 6.5. This usually means complex formatting (tables, columns, graphics) is preventing software from reading your resume. Download a clean, guaranteed-to-parse template below.
                      </p>
                      <div className="flex flex-wrap gap-3">
                        <TemplateBtn name="classic" label="Classic Format" />
                        <TemplateBtn name="modern" label="Modern Minimal" />
                        <TemplateBtn name="compact" label="Compact Design" />
                      </div>
                    </div>
                  </section>
                )}

                {/* Feedback */}
                <section id="feedback" className="scroll-mt-24 animate-slide-up stagger-3">
                  <div className="flex items-center gap-2 mb-6">
                    <div className="w-8 h-8 rounded-lg bg-teal-100 text-teal-600 flex items-center justify-center">
                      <FileText className="w-4 h-4" />
                    </div>
                    <h2 className="text-2xl font-bold text-slate-900">Key Improvements</h2>
                  </div>
                  <FeedbackList sessionId={report.session_id} improvements={report.improvements} />
                </section>

                {/* Rewrites */}
                <section id="rewrites" className="scroll-mt-24 animate-slide-up stagger-4">
                  <div className="flex items-center gap-2 mb-6">
                    <div className="w-8 h-8 rounded-lg bg-purple-100 text-purple-600 flex items-center justify-center">
                      <Sparkles className="w-4 h-4" />
                    </div>
                    <h2 className="text-2xl font-bold text-slate-900">AI Rewrites</h2>
                    <span className="ml-2 text-xs font-medium bg-slate-200 text-slate-600 px-2 py-1 rounded-md">Changes highlighted</span>
                  </div>
                  <RewriteSection sessionId={report.session_id} sections={report.rewrite.sections} />
                </section>

              </div>

              {/* Sticky Sidebar Navigation */}
              <div className="hidden lg:block lg:col-span-4 xl:col-span-3">
                <div className="sticky top-24 bg-white rounded-2xl border shadow-sm p-5">
                  <h4 className="font-semibold text-slate-900 mb-4">On this page</h4>
                  <nav className="flex flex-col space-y-1">
                    <NavAnchor href="#scoring" label="Scoring Analysis" />
                    {report.show_templates && <NavAnchor href="#templates" label="ATS Templates" />}
                    <NavAnchor href="#feedback" label="Key Improvements" />
                    <NavAnchor href="#rewrites" label="AI Rewrites" />
                  </nav>
                  
                  <div className="mt-8 pt-6 border-t">
                    <div className="text-xs text-slate-500 bg-slate-50 rounded-xl p-4">
                      <p className="font-medium text-slate-700 mb-1 flex items-center gap-1.5"><ShieldIcon /> Data Privacy</p>
                      Your resume text and files are never stored. We only keep anonymized metrics to improve the model.
                    </div>
                  </div>
                </div>
              </div>

            </div>
          </div>
        )}
      </main>
    </div>
  );
}

// Helpers
function NavAnchor({ href, label }: { href: string, label: string }) {
  return (
    <a 
      href={href} 
      className="text-sm text-slate-600 hover:text-primary hover:bg-primary/5 px-3 py-2 rounded-lg transition-colors"
      onClick={(e) => {
        e.preventDefault();
        document.querySelector(href)?.scrollIntoView({ behavior: 'smooth' });
      }}
    >
      {label}
    </a>
  );
}

function TemplateBtn({ name, label }: { name: string, label: string }) {
  return (
    <a 
      href={`/api/templates/${name}`} 
      className="inline-flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white border border-white/20 px-4 py-2.5 rounded-xl text-sm font-medium transition-all"
    >
      <FileText className="w-4 h-4 opacity-70" />
      {label}
    </a>
  );
}

function Feature({ icon, title, desc }: { icon: React.ReactNode, title: string, desc: string }) {
  return (
    <div className="flex flex-col items-center p-6">
      <div className="w-12 h-12 rounded-2xl bg-white shadow-sm border flex items-center justify-center mb-4">
        {icon}
      </div>
      <h3 className="font-bold text-slate-900 mb-2">{title}</h3>
      <p className="text-sm text-slate-500 leading-relaxed">{desc}</p>
    </div>
  );
}

function ShieldIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/></svg>
  );
}
