import { ImageOff } from "lucide-react";
import { messages } from "@/lib/messages";
import { cn } from "@/lib/utils";

type MissingImagePlaceholderProps = {
  src?: string;
  alt?: string;
  loading?: boolean;
  className?: string;
};

function meaningfulAlt(alt?: string): string | null {
  const trimmed = alt?.trim();
  if (!trimmed || trimmed.toLowerCase() === "image") return null;
  return trimmed;
}

export function MissingImagePlaceholder(props: MissingImagePlaceholderProps) {
  const { src, alt, loading, className } = props;
  const displayAlt = meaningfulAlt(alt);

  if (loading) {
    return (
      <div
        className={cn("md-image-missing md-image-missing--loading", className)}
        aria-busy="true"
        aria-label={messages.editor.imageLoading}
      >
        <div className="md-image-missing__inner">
          <div className="md-image-missing__skeleton" />
        </div>
      </div>
    );
  }

  return (
    <figure
      className={cn("md-image-missing", className)}
      role="img"
      aria-label={messages.editor.imageMissing}
    >
      <div className="md-image-missing__inner">
        <ImageOff className="md-image-missing__icon" aria-hidden />
        <p className="md-image-missing__label">{messages.editor.imageMissing}</p>
        {displayAlt ? <p className="md-image-missing__alt">{displayAlt}</p> : null}
        {src ? (
          <p className="md-image-missing__path" title={src}>
            {src}
          </p>
        ) : null}
      </div>
    </figure>
  );
}
