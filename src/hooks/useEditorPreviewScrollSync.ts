import {
  type RefObject,
  type UIEvent,
  useCallback,
  useLayoutEffect,
  useRef,
} from "react";
import { applyProportionalScrollTop, scrollRatioFor } from "@/lib/editorScrollSync";

type UseEditorPreviewScrollSyncOptions = {
  editorRef: RefObject<HTMLTextAreaElement | null>;
  isEditMode: boolean;
  previewWidth: number;
  contentScale: number;
  input: string;
  onPresentationPreviewScroll?: (ratio: number) => void;
};

export function useEditorPreviewScrollSync(options: UseEditorPreviewScrollSyncOptions) {
  const {
    editorRef,
    isEditMode,
    previewWidth,
    contentScale,
    input,
    onPresentationPreviewScroll,
  } = options;

  const editorGutterInnerRef = useRef<HTMLDivElement>(null);
  const splitPreviewScrollHostRef = useRef<HTMLDivElement>(null);
  const previewOnlyScrollHostRef = useRef<HTMLDivElement>(null);
  const scrollSyncLockRef = useRef<"editor" | "preview" | null>(null);

  const syncEditorGutterScroll = useCallback((scrollTop: number) => {
    const inner = editorGutterInnerRef.current;
    if (inner) inner.style.transform = `translateY(-${scrollTop}px)`;
  }, []);

  const resolvePreviewViewport = useCallback((host: HTMLDivElement | null): HTMLDivElement | null => {
    if (!host) return null;
    if (host.dataset.slot === "preview-scroll-viewport") return host;
    return host.querySelector<HTMLDivElement>('[data-slot="scroll-area-viewport"]');
  }, []);

  const getSplitPreviewViewport = useCallback((): HTMLDivElement | null => {
    return resolvePreviewViewport(splitPreviewScrollHostRef.current);
  }, [resolvePreviewViewport]);

  const getPreviewScrollViewport = useCallback((): HTMLDivElement | null => {
    return resolvePreviewViewport(
      splitPreviewScrollHostRef.current ?? previewOnlyScrollHostRef.current
    );
  }, [resolvePreviewViewport]);

  useLayoutEffect(() => {
    if (!onPresentationPreviewScroll) return;

    let cancelled = false;
    let detach: (() => void) | undefined;
    let rafId = 0;

    const attach = () => {
      if (detach || cancelled) return;
      const vp = getPreviewScrollViewport();
      if (!vp) return;

      const report = () => {
        onPresentationPreviewScroll(scrollRatioFor(vp));
      };

      const onScroll = () => report();
      vp.addEventListener("scroll", onScroll, { passive: true });
      report();
      detach = () => vp.removeEventListener("scroll", onScroll);
    };

    attach();
    if (!detach) {
      rafId = requestAnimationFrame(() => {
        if (!cancelled) attach();
      });
    }

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
      detach?.();
    };
  }, [onPresentationPreviewScroll, isEditMode, previewWidth, contentScale, getPreviewScrollViewport]);

  const handleEditorScroll = useCallback(
    (e: UIEvent<HTMLTextAreaElement>) => {
      const ta = e.currentTarget;
      syncEditorGutterScroll(ta.scrollTop);
      if (scrollSyncLockRef.current === "preview") return;
      const vp = getSplitPreviewViewport();
      if (!vp) return;
      scrollSyncLockRef.current = "editor";
      applyProportionalScrollTop(ta, vp);
      queueMicrotask(() => {
        scrollSyncLockRef.current = null;
      });
    },
    [getSplitPreviewViewport, syncEditorGutterScroll]
  );

  useLayoutEffect(() => {
    const ta = editorRef.current;
    if (ta) syncEditorGutterScroll(ta.scrollTop);
  }, [input, contentScale, editorRef, syncEditorGutterScroll]);

  useLayoutEffect(() => {
    if (!isEditMode) return;
    let cancelled = false;
    let detach: (() => void) | undefined;
    let rafId = 0;
    const attach = () => {
      if (detach || cancelled) return;
      const vp = getSplitPreviewViewport();
      if (!vp) return;
      const onPreviewScroll = () => {
        if (scrollSyncLockRef.current === "editor") return;
        const ta = editorRef.current;
        if (!ta) return;
        scrollSyncLockRef.current = "preview";
        applyProportionalScrollTop(vp, ta);
        syncEditorGutterScroll(ta.scrollTop);
        queueMicrotask(() => {
          scrollSyncLockRef.current = null;
        });
      };
      vp.addEventListener("scroll", onPreviewScroll, { passive: true });
      detach = () => vp.removeEventListener("scroll", onPreviewScroll);
    };
    attach();
    if (!detach) {
      rafId = requestAnimationFrame(() => {
        if (!cancelled) attach();
      });
    }
    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
      detach?.();
    };
  }, [isEditMode, getSplitPreviewViewport, previewWidth, contentScale, editorRef, syncEditorGutterScroll]);

  return {
    editorGutterInnerRef,
    splitPreviewScrollHostRef,
    previewOnlyScrollHostRef,
    handleEditorScroll,
  };
}
