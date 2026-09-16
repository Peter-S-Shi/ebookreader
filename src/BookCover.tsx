import { memo, useEffect, useRef, useState } from "react";
import { useEpubCover } from "./epubCover";
import { usePdfCover } from "./pdfCover";

export interface BookCoverProps {
  bookId: string;
  format: string;
  title?: string;
  className?: string;
  onClick?: () => void;
}

export const BookCover = memo(function BookCover({
  bookId,
  format,
  title,
  className = "",
  onClick,
}: BookCoverProps) {
  const coverRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(() => {
    return typeof IntersectionObserver === "undefined";
  });

  useEffect(() => {
    if (isVisible || typeof IntersectionObserver === "undefined") return;
    const el = coverRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setIsVisible(true);
            observer.disconnect();
            break;
          }
        }
      },
      { rootMargin: "200px" },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [isVisible]);

  const fmt = format.toLowerCase();
  const epub = useEpubCover(bookId, format);
  const pdf = usePdfCover(bookId, format, isVisible);

  const { coverUrl, markBroken } =
    fmt === "epub" ? epub : fmt === "pdf" ? pdf : { coverUrl: null, markBroken: () => {} };

  const hasCover = Boolean(coverUrl);

  return (
    <div
      ref={coverRef}
      className={`cover ${hasCover ? "has-cover" : ""} ${className}`}
      aria-hidden="true"
      onClick={onClick}
    >
      {hasCover ? (
        <img
          src={coverUrl!}
          alt={title ? `Cover of ${title}` : ""}
          className="cover-img"
          onError={markBroken}
        />
      ) : (
        <span className="cover-format">{format.toUpperCase()}</span>
      )}
    </div>
  );
});
