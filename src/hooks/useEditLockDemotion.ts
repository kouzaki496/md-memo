import { useEffect, useRef } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { listenEditLockChanged } from "@/lib/editLock";

type DemotionState = {
  isEditMode: boolean;
};

type UseEditLockDemotionOptions = {
  /** 編集モードを終了する前に未保存分を保存（自動保存待ちをフラッシュ） */
  flushSave: () => Promise<void>;
  /** 閲覧モードへ戻したあとディスクから再読み込み */
  reloadFromDisk: () => Promise<void>;
  exitEditMode: () => void;
  getState: () => DemotionState;
};

/** 他ウィンドウが編集ロックを取ったら、このウィンドウの編集を終了する */
export function useEditLockDemotion(options: UseEditLockDemotionOptions) {
  const windowLabelRef = useRef(getCurrentWindow().label);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    let unlisten: (() => void) | undefined;

    void listenEditLockChanged(async (state) => {
      if (state.holderLabel === windowLabelRef.current) return;

      const { getState, flushSave, reloadFromDisk, exitEditMode } = optionsRef.current;
      if (!getState().isEditMode) return;

      await flushSave();
      exitEditMode();
      await reloadFromDisk();
    }).then((fn) => {
      unlisten = fn;
    });

    return () => {
      unlisten?.();
    };
  }, []);
}
