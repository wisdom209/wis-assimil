
import type { Extra } from "../types";

interface ExtrasProps {
  extras: Extra[];
}

export function Extras({ extras }: ExtrasProps) {
  if (extras.length === 0) {
    return <p className="text-slate-500">No additional content for this lesson.</p>;
  }

  const styles: Record<Extra["type"], string> = {
    culture: "border-sky-200 bg-sky-50 text-sky-900",
    smile: "border-amber-200 bg-amber-50 text-amber-900",
    numbers: "border-emerald-200 bg-emerald-50 text-emerald-900",
    proverb: "border-violet-200 bg-violet-50 text-violet-900",
    pronunciation_tip: "border-rose-200 bg-rose-50 text-rose-900",
    review_dialogue: "border-stone-200 bg-stone-50 text-slate-800",
  };

  return (
    <div className="space-y-4">
      {extras.map((extra, idx) => (
        <article key={`${extra.type}-${idx}`} className={`rounded-lg border p-4 ${styles[extra.type]}`}>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide opacity-70">
            {extra.type.replace("_", " ")}
          </p>
          <h3 className="font-bold">{extra.title}</h3>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-6">{extra.content}</p>
        </article>
      ))}
    </div>
  );
}
