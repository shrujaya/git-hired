// src/components/BrandMark.tsx
//
// The title block's mark cell. Lives in one place because it appears in both
// the welcome sheet and FlowHeader — the glyph drifting between them is
// exactly the kind of thing nobody notices until it ships.
//
// `to` makes it a way back to the cover sheet. The welcome page itself passes
// nothing, so the mark stays inert there rather than linking to itself.

import { Link } from "react-router-dom";

interface BrandMarkProps {
  /** Route to return to. Omit to render the mark as plain lettering. */
  to?: string;
}

const BrandMark = ({ to }: BrandMarkProps) => {
  const inner = (
    <>
      <div className="w-8 h-8 border-2 border-ink flex items-center justify-center flex-shrink-0 group-hover:border-signal transition-colors">
        {/* Terminal prompt, per the mock. Mono — it is a shell caret, and the
            display face has no business setting punctuation this small. */}
        <span className="font-mono font-bold text-[13px] leading-none text-ink group-hover:text-signal transition-colors">
          &gt;_
        </span>
      </div>
      <div className="min-w-0">
        <div className="font-display font-extrabold text-[17px] leading-none tracking-title text-ink truncate">
          Git Hired
        </div>
        <div className="font-mono text-[8.5px] tracking-[0.14em] uppercase text-inkfaint mt-1">
          Technical interview
        </div>
      </div>
    </>
  );

  const shell = "group flex items-center gap-3 pl-5 md:pl-8 pr-5 py-3.5 min-w-0";

  if (!to) {
    return <div className={shell}>{inner}</div>;
  }

  return (
    <Link
      to={to}
      // The cover sheet is reachable mid-flow, so say so explicitly rather
      // than forwarding to whichever stage the candidate had reached.
      state={{ home: true }}
      aria-label="Git Hired — back to the start"
      title="Back to the start"
      className={shell + " hover:bg-paper transition-colors"}
    >
      {inner}
    </Link>
  );
};

export default BrandMark;
