import { CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface ScoreCardProps {
  title: string;
  score: number;
  drivers: string[];
  className?: string;
}

export function ScoreCard({ title, score, drivers, className }: ScoreCardProps) {
  const isGood = score >= 8.0;
  const isWarn = score >= 6.5 && score < 8.0;
  const isBad = score < 6.5;

  const Icon = isGood ? CheckCircle2 : isWarn ? AlertTriangle : XCircle;

  return (
    <div className={cn(
      "relative overflow-hidden rounded-2xl bg-card border shadow-sm p-5",
      "hover-elevate flex flex-col h-full",
      className
    )}>
      {/* Top accent line */}
      <div className={cn(
        "absolute top-0 left-0 right-0 h-1",
        isGood && "bg-[#16a34a]", // green-600
        isWarn && "bg-[#d97706]", // amber-600
        isBad && "bg-[#e11d48]" // rose-600
      )} />

      <div className="flex items-start justify-between mb-4">
        <h3 className="font-semibold text-slate-800">{title}</h3>
        <div className={cn(
          "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-bold border",
          isGood && "bg-[hsl(var(--score-good-bg))] text-[hsl(var(--score-good-fg))] border-[hsl(var(--score-good-border))]",
          isWarn && "bg-[hsl(var(--score-warn-bg))] text-[hsl(var(--score-warn-fg))] border-[hsl(var(--score-warn-border))]",
          isBad && "bg-[hsl(var(--score-bad-bg))] text-[hsl(var(--score-bad-fg))] border-[hsl(var(--score-bad-border))]"
        )}>
          <Icon className="w-4 h-4" />
          {score.toFixed(1)} <span className="opacity-60 text-xs font-medium">/ 10</span>
        </div>
      </div>

      <ul className="space-y-2.5 mt-auto">
        {drivers.slice(0, 3).map((driver, i) => (
          <li key={i} className="flex items-start gap-2 text-sm text-slate-600">
            <span className="mt-1 block w-1.5 h-1.5 rounded-full bg-primary/40 shrink-0" />
            <span className="leading-snug">{driver}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
