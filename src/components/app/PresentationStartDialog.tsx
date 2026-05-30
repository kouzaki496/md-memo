import { Button } from "@/components/ui/button";
import { messages } from "@/lib/messages";

type PresentationStartDialogProps = {
  fileName: string;
  realtime: boolean;
  onChangeRealtime: (value: boolean) => void;
  onConfirm: () => void;
  onCancel: () => void;
};

export function PresentationStartDialog(props: PresentationStartDialogProps) {
  const { fileName, realtime, onChangeRealtime, onConfirm, onCancel } = props;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="presentation-start-title"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-md rounded-lg border bg-background p-5 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="presentation-start-title" className="text-base font-semibold">
          {messages.presentation.startDialogTitle}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {messages.presentation.startDialogBody(fileName)}
        </p>
        <label className="mt-4 flex cursor-pointer items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={realtime}
            onChange={(e) => onChangeRealtime(e.target.checked)}
          />
          <span>
            <span className="font-medium">{messages.presentation.realtimeLabel}</span>
            <span className="mt-0.5 block text-muted-foreground">
              {messages.presentation.realtimeHint}
            </span>
          </span>
        </label>
        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onCancel}>
            {messages.presentation.startCancel}
          </Button>
          <Button type="button" onClick={onConfirm}>
            {messages.presentation.startConfirmButton}
          </Button>
        </div>
      </div>
    </div>
  );
}
