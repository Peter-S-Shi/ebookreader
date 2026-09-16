import { memo } from "react";
import { useEpubCover } from "./epubCover";

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
  const { coverUrl, markBroken } = useEpubCover(bookId, format);

  const hasCover = Boolean(coverUrl);

  return (
    <div
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
