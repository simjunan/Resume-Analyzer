import { useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

// Types matching the backend response
export interface Improvement {
  key: string;
  title: string;
  detail: string;
}

export interface SectionRewrite {
  key: string;
  title: string;
  before: string[];
  after: string[];
}

export interface ReviewResponse {
  session_id: string;
  profession?: string;
  scores: {
    ats: number;
    format: number;
    role_fit?: number;
  };
  score_drivers: {
    ats: string[];
    format: string[];
    role_fit?: string[];
  };
  improvements: Improvement[];
  rewrite: {
    sections: SectionRewrite[];
  };
  show_templates: boolean;
  parse_warning?: string;
}

export function useSubmitReview() {
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (formData: FormData): Promise<ReviewResponse> => {
      const res = await fetch("/api/review", {
        method: "POST",
        body: formData,
        // Don't set Content-Type header; browser sets it automatically with boundary for FormData
      });

      if (!res.ok) {
        let errorMessage = "Failed to analyze resume";
        try {
          const errData = await res.json();
          errorMessage = errData.detail || errData.message || errorMessage;
        } catch {
          errorMessage = await res.text() || errorMessage;
        }
        throw new Error(errorMessage);
      }

      return await res.json();
    },
    onError: (error) => {
      toast({
        title: "Analysis Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

export function useSubmitFeedback() {
  return useMutation({
    mutationFn: async (data: {
      session_id: string;
      event_type: "SUGGESTION_UPVOTE" | "SUGGESTION_DOWNVOTE" | "REWRITE_ACCEPTED" | "REWRITE_REJECTED";
      target_id: string;
      value?: any;
    }) => {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      // Fire and forget mostly, but throw if explicitly failed
      if (!res.ok && res.status !== 404) {
         // Ignore 404s if running without fully wired backend locally
        console.warn("Feedback submission failed:", await res.text());
      }
      return true;
    },
  });
}
