import { useEffect, useRef, useState } from "react";
import { MissingImagePlaceholder } from "@/components/app/MissingImagePlaceholder";
import { resolveAttachmentDisplayUrl } from "@/lib/noteImages";
import { cn } from "@/lib/utils";

type LoadState = "loading" | "ready" | "missing";

type MarkdownPreviewImageProps = React.ImgHTMLAttributes<HTMLImageElement>;

function isRemoteImageSrc(src: string): boolean {
  return /^https?:\/\//i.test(src) || src.startsWith("data:");
}

export function MarkdownPreviewImage(props: MarkdownPreviewImageProps) {
  const { src, alt, className, ...rest } = props;
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [resolvedSrc, setResolvedSrc] = useState<string | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  useEffect(() => {
    if (!src) {
      setLoadState("missing");
      setResolvedSrc(null);
      return;
    }

    let cancelled = false;
    objectUrlRef.current = null;

    if (isRemoteImageSrc(src)) {
      setLoadState("ready");
      setResolvedSrc(src);
      return () => {
        cancelled = true;
      };
    }

    setLoadState("loading");
    setResolvedSrc(null);
    void resolveAttachmentDisplayUrl(src).then((url) => {
      if (cancelled) {
        if (url?.startsWith("blob:")) URL.revokeObjectURL(url);
        return;
      }
      objectUrlRef.current = url?.startsWith("blob:") ? url : null;
      setResolvedSrc(url);
      setLoadState(url ? "ready" : "missing");
    });

    return () => {
      cancelled = true;
      const objectUrl = objectUrlRef.current;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      objectUrlRef.current = null;
    };
  }, [src]);

  if (!src) return null;

  if (loadState === "loading") {
    return <MissingImagePlaceholder src={src} alt={alt} loading className={className} />;
  }

  if (loadState === "missing" || !resolvedSrc) {
    return <MissingImagePlaceholder src={src} alt={alt} className={className} />;
  }

  return (
    <img
      {...rest}
      src={resolvedSrc}
      alt={alt ?? ""}
      className={cn("my-3 h-auto max-w-full rounded-md", className)}
      loading="lazy"
      onError={() => setLoadState("missing")}
    />
  );
}
