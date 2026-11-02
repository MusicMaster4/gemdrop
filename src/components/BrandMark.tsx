/** Gemdrop's two-plane diamond. The native icons use this exact silhouette. */
export function GemdropMark({ size = 27 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M10 5H22L29 13H3L10 5Z" fill="currentColor" />
      <path d="M3 15H29L16 29L3 15Z" fill="currentColor" />
    </svg>
  );
}
