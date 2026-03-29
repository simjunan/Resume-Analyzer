import { useState } from "react";
import { Check, X, Copy, CopyCheck } from "lucide-react";
import { useSubmitFeedback } from "@/hooks/use-review";
import type { SectionRewrite } from "@/hooks/use-review";
import { getDiffNodes } from "@/lib/diff";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface RewriteSectionProps {
  sessionId: string;
  sections: SectionRewrite[];
}

export function RewriteSection({ sessionId, sections }: RewriteSectionProps) {
  const submitFeedback = useSubmitFeedback();
  const [copiedSection, setCopiedSection] = useState<string | null>(null);
  const [copiedBullet, setCopiedBullet] = useState<string | null>(null);
  const [decisions, setDecisions] = useState<Record<string, "accept" | "reject">>({});

  const handleCopy = (text: string, id: string, type: 'section' | 'bullet') => {
    navigator.clipboard.writeText(text);
    if (type === 'section') {
      setCopiedSection(id);
      setTimeout(() => setCopiedSection(null), 2000);
    } else {
      setCopiedBullet(id);
      setTimeout(() => setCopiedBullet(null), 2000);
    }
  };

  const handleDecision = (sectionKey: string, bulletIdx: number, decision: "accept" | "reject") => {
    const id = `${sectionKey}:${bulletIdx}`;
    setDecisions(prev => ({ ...prev, [id]: decision }));
    
    submitFeedback.mutate({
      sessionId,
      eventType: decision === "accept" ? "REWRITE_ACCEPTED" : "REWRITE_REJECTED",
      targetId: id,
    });
  };

  if (!sections || sections.length === 0) return null;

  return (
    <div className="space-y-8">
      {sections.map((sec) => {
        const afterAllText = sec.after.join("\n");
        const hasChanges = sec.before.join("\n") !== afterAllText;

        return (
          <div key={sec.key} className="bg-white rounded-3xl border shadow-sm overflow-hidden">
            {/* Section Header */}
            <div className="bg-slate-50 border-b px-5 py-4 flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-slate-800 flex items-center gap-2">
                  {sec.title}
                  {!hasChanges && <span className="text-xs font-normal px-2 py-0.5 rounded-full bg-slate-200 text-slate-600">No changes needed</span>}
                </h3>
              </div>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => handleCopy(afterAllText, sec.key, 'section')}
                className="h-8 text-xs font-medium"
              >
                {copiedSection === sec.key ? <CopyCheck className="w-3.5 h-3.5 mr-1.5 text-green-600" /> : <Copy className="w-3.5 h-3.5 mr-1.5" />}
                Copy Section
              </Button>
            </div>

            <div className="p-1 sm:p-5 space-y-4 sm:space-y-6">
              {sec.before.map((beforeText, idx) => {
                const afterText = sec.after[idx] || "";
                const isChanged = beforeText !== afterText;
                const bulletId = `${sec.key}:${idx}`;
                const decision = decisions[bulletId];

                return (
                  <div key={idx} className="flex flex-col md:grid md:grid-cols-2 gap-0 sm:gap-4 md:gap-6 border-b sm:border-b-0 pb-6 sm:pb-0 last:border-0 last:pb-0">
                    
                    {/* Before (Hidden on very small mobile if changed to save space, but keeping for clarity) */}
                    <div className="p-4 sm:rounded-2xl sm:bg-slate-50/50 sm:border border-slate-100">
                      <div className="text-xs font-bold tracking-wider text-slate-400 uppercase mb-2">Original</div>
                      <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap">{beforeText}</p>
                    </div>

                    {/* After */}
                    <div className={cn(
                      "p-4 sm:rounded-2xl border",
                      isChanged ? "bg-white border-primary/20 shadow-sm" : "bg-slate-50/50 border-slate-100",
                      decision === 'accept' && "border-green-300 bg-green-50/30",
                      decision === 'reject' && "border-rose-300 bg-rose-50/30 opacity-60"
                    )}>
                      <div className="flex items-center justify-between mb-2">
                        <div className="text-xs font-bold tracking-wider text-primary uppercase">
                          {isChanged ? "AI Rewrite" : "Kept Original"}
                        </div>
                        
                        {isChanged && (
                          <div className="flex gap-1.5">
                            <button 
                              onClick={() => handleDecision(sec.key, idx, "accept")}
                              className={cn(
                                "p-1.5 rounded-md transition-colors",
                                decision === 'accept' ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-400 hover:bg-green-50 hover:text-green-600"
                              )}
                              title="Accept rewrite"
                            >
                              <Check className="w-3.5 h-3.5" />
                            </button>
                            <button 
                              onClick={() => handleDecision(sec.key, idx, "reject")}
                              className={cn(
                                "p-1.5 rounded-md transition-colors",
                                decision === 'reject' ? "bg-rose-100 text-rose-700" : "bg-slate-100 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                              )}
                              title="Reject rewrite"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                            <button 
                              onClick={() => handleCopy(afterText, bulletId, 'bullet')}
                              className="p-1.5 rounded-md bg-slate-100 text-slate-400 hover:bg-slate-200 transition-colors ml-1"
                              title="Copy bullet"
                            >
                              {copiedBullet === bulletId ? <CopyCheck className="w-3.5 h-3.5 text-slate-700" /> : <Copy className="w-3.5 h-3.5" />}
                            </button>
                          </div>
                        )}
                      </div>
                      
                      <p className="text-sm text-slate-800 leading-relaxed whitespace-pre-wrap">
                        {isChanged ? getDiffNodes(beforeText, afterText) : afterText}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
