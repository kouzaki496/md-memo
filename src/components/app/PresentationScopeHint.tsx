import { Monitor } from "lucide-react";
import { Button } from "@/components/ui/button";
import { messages } from "@/lib/messages";
import type { PresentationStatus } from "@/types/presentation";

type PresentationScopeHintProps = {
  activePresentations: PresentationStatus[];
  onOpenPresentedNote: (path: string) => void;
};

function formatPresentingLabel(presentations: PresentationStatus[]): string {
  if (presentations.length === 1) return presentations[0].fileName;
  return `${presentations[0].fileName} など ${presentations.length} 件`;
}

export function PresentationScopeHint(props: PresentationScopeHintProps) {
  const { activePresentations, onOpenPresentedNote } = props;
  const firstSaved = activePresentations.find((p) => p.boundPath != null);

  return (
    <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-amber-500/30 bg-amber-500/8 px-4 py-2 text-xs text-amber-950 dark:text-amber-100">
      <div className="flex min-w-0 items-center gap-2">
        <Monitor className="h-3.5 w-3.5 shrink-0" aria-hidden />
        <span>{messages.presentation.viewingUnpresented(formatPresentingLabel(activePresentations))}</span>
      </div>
      {firstSaved?.boundPath && (
        <Button
          type="button"
          variant="outline"
          size="xs"
          className="border-amber-500/40 bg-background/80"
          onClick={() => onOpenPresentedNote(firstSaved.boundPath!)}
        >
          {messages.presentation.openPresentedMemo}
        </Button>
      )}
    </div>
  );
}
