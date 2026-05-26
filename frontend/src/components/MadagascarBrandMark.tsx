/** Emblème drapeau Madagascar (bande blanche + rouge/vert) + repère cartographique. */
export function MadagascarBrandMark({ className = '' }: { className?: string }) {
  return (
    <span className={`qg-mark${className ? ` ${className}` : ''}`} aria-hidden="true">
      <span className="qg-mark-flag" />
      <span className="qg-mark-pin" />
    </span>
  );
}
