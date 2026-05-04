import { useMemo } from "react";

export function useSearchHighlight(query: string, isEditMode: boolean) {
  const searchTerms = useMemo(() => {
    const terms = query
      .split(/\s+/)
      .map((s) => s.trim())
      .filter(Boolean);
    return Array.from(new Set(terms));
  }, [query]);

  const highlightMatches = (line: string) => {
    if (isEditMode) return line || " ";
    if (searchTerms.length === 0) return line || " ";
    const escaped = searchTerms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    const re = new RegExp(`(${escaped.join("|")})`, "gi");
    const parts = line.split(re);
    return parts.map((part, i) => {
      const hit = searchTerms.some((t) => part.toLowerCase() === t.toLowerCase());
      if (!hit) return <span key={`txt-${i}`}>{part || (i === 0 && line === "" ? " " : "")}</span>;
      return (
        <mark key={`hit-${i}`} className="rounded bg-amber-200/80 px-0.5 text-foreground dark:bg-amber-500/40">
          {part}
        </mark>
      );
    });
  };

  return { searchTerms, highlightMatches };
}
