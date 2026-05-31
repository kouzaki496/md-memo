import { PanelLeftOpen, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

type CollapsedSidebarRailProps = {
  widthPx: number;
  onOpenSidebar: () => void;
  onCreateNew: () => void;
};

export function CollapsedSidebarRail(props: CollapsedSidebarRailProps) {
  const { widthPx, onOpenSidebar, onCreateNew } = props;

  return (
    <aside
      className="h-full min-h-0 shrink-0 border-r bg-muted/25 px-2 py-3"
      style={{ width: `${widthPx}px` }}
    >
      <div className="flex h-full flex-col items-center gap-2">
        <Button
          variant="toolbar"
          size="icon-sm"
          className="bg-background/95"
          onClick={onOpenSidebar}
          title="サイドバーを開く"
          aria-label="サイドバーを開く"
        >
          <PanelLeftOpen className="h-4 w-4" />
        </Button>
        <Button
          variant="default"
          size="icon-sm"
          className="rounded-md shadow-sm ring-1 ring-primary/25 hover:ring-primary/40"
          onClick={onCreateNew}
          title="新規メモを作成"
          aria-label="新規メモを作成"
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>
    </aside>
  );
}
