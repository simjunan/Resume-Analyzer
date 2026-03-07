import { useState } from "react";
import { ThumbsUp, ThumbsDown } from "lucide-react";
import { useSubmitFeedback } from "@/hooks/use-review";
import type { Improvement } from "@/hooks/use-review";
import { cn } from "@/lib/utils";

interface FeedbackListProps {
  sessionId: string;
  improvements: Improvement[];
}

export function FeedbackList({ sessionId, improvements }: FeedbackListProps) {
  const submitFeedback = useSubmitFeedback();
  const [votes, setVotes] = useState<Record<string, "up" | "down">>({});

  const handleVote = (impKey: string, type: "up" | "down") => {
    if (votes[impKey] === type) return; // Already voted this way

    setVotes(prev => ({ ...prev, [impKey]: type }));
    
    submitFeedback.mutate({
      session_id: sessionId,
      event_type: type === "up" ? "SUGGESTION_UPVOTE" : "SUGGESTION_DOWNVOTE",
      target_id: impKey,
    });
  };

  if (!improvements || improvements.length === 0) return null;

  return (
    <div className="space-y-4">
      {improvements.map((imp, idx) => (
        <div key={imp.key} className="flex flex-col sm:flex-row gap-4 p-5 rounded-2xl bg-white border border-slate-200 shadow-sm hover-elevate">
          <div className="flex items-center justify-center w-8 h-8 rounded-full bg-slate-100 text-slate-500 font-bold text-sm shrink-0">
            {idx + 1}
          </div>
          
          <div className="flex-1">
            <h4 className="font-semibold text-slate-800 mb-1">{imp.title}</h4>
            <p className="text-sm text-slate-600 leading-relaxed">{imp.detail}</p>
          </div>
          
          <div className="flex sm:flex-col gap-2 shrink-0 justify-end sm:justify-start mt-2 sm:mt-0 border-t sm:border-t-0 sm:border-l border-slate-100 pt-3 sm:pt-0 sm:pl-4">
            <button 
              onClick={() => handleVote(imp.key, "up")}
              className={cn(
                "p-2 rounded-lg transition-colors border flex items-center justify-center",
                votes[imp.key] === "up" 
                  ? "bg-green-50 border-green-200 text-green-600" 
                  : "bg-white border-slate-200 text-slate-400 hover:bg-slate-50 hover:text-slate-600"
              )}
              title="Helpful suggestion"
            >
              <ThumbsUp className="w-4 h-4" />
            </button>
            <button 
              onClick={() => handleVote(imp.key, "down")}
              className={cn(
                "p-2 rounded-lg transition-colors border flex items-center justify-center",
                votes[imp.key] === "down" 
                  ? "bg-rose-50 border-rose-200 text-rose-600" 
                  : "bg-white border-slate-200 text-slate-400 hover:bg-slate-50 hover:text-slate-600"
              )}
              title="Not helpful"
            >
              <ThumbsDown className="w-4 h-4" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
