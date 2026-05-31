import { Copy, Monitor, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { messages } from "@/lib/messages";
import { cn } from "@/lib/utils";
import type { PresentationStatus } from "@/types/presentation";

type PresentationBarProps = {
  status: PresentationStatus;
  onPushUpdate: () => void;
  onCopyUrl: () => void;
  onToggleRealtime: () => void;
  onEnd: () => void;
};

export function PresentationBar(props: PresentationBarProps) {
  const { status, onPushUpdate, onCopyUrl, onToggleRealtime, onEnd } = props;

  return (
    <div className="flex shrink-0 items-center justify-between gap-3 border-b border-primary/25 bg-primary/8 px-4 py-2 text-sm">
      <div className="flex min-w-0 items-center gap-2 text-foreground">
        <Monitor className="h-4 w-4 shrink-0 text-primary" aria-hidden />
        <span className="truncate">{messages.presentation.active(status.fileName)}</span>
        <span className="shrink-0 text-xs text-muted-foreground">
          {status.realtime
            ? messages.presentation.realtimeOnBadge
            : messages.presentation.realtimeOffBadge}
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button
          type="button"
          variant={status.realtime ? "default" : "outline"}
          size="xs"
          className={cn(!status.realtime && "border-dashed")}
          onClick={onToggleRealtime}
          title={
            status.realtime
              ? messages.presentation.realtimeDisable
              : messages.presentation.realtimeEnable
          }
        >
          {messages.presentation.realtimeToggle}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="xs"
          onClick={onPushUpdate}
          title={messages.presentation.pushUpdateHint}
        >
          <RefreshCw className="h-3.5 w-3.5" aria-hidden />
          {messages.presentation.pushUpdate}
        </Button>
        <Button type="button" variant="outline" size="xs" onClick={onCopyUrl}>
          <Copy className="h-3.5 w-3.5" aria-hidden />
          {messages.presentation.copyUrl}
        </Button>
        <Button type="button" variant="outline" size="xs" onClick={onEnd}>
          <X className="h-3.5 w-3.5" aria-hidden />
          {messages.presentation.end}
        </Button>
      </div>
    </div>
  );
}
