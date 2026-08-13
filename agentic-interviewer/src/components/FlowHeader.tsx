// src/components/FlowHeader.tsx
//
// The flow pages are styled as a drawing sheet, so the header is the sheet's
// title block: ruled cells, mono lettering, the current stage marked in
// redline. Purely presentational - which step is active is passed in, nothing
// here owns state or navigation.

interface FlowHeaderProps {
  /** 1 = device check, 2 = role & resume, 3 = interview */
  step: 1 | 2 | 3;
}

const STEPS = ["Device check", "Role & resume", "Interview"] as const;

const FlowHeader = ({ step }: FlowHeaderProps) => (
  <header className="border-b-2 border-ink bg-card">
    <div className="flex items-stretch divide-x divide-rule border-rule">
      {/* Mark */}
      <div className="flex items-center gap-3 pl-5 md:pl-8 pr-5 py-3.5 min-w-0">
        <div className="w-8 h-8 border-2 border-ink flex items-center justify-center flex-shrink-0">
          <span className="font-display font-extrabold text-[17px] leading-none text-ink">G</span>
        </div>
        <div className="min-w-0">
          <div className="font-display font-extrabold text-[17px] leading-none tracking-title text-ink truncate">
            Git Hired
          </div>
          <div className="font-mono text-[8.5px] tracking-[0.14em] uppercase text-inkfaint mt-1">
            Technical interview
          </div>
        </div>
      </div>

      {/* Stage cells — collapses to a fraction on small screens */}
      <div className="hidden md:flex flex-1 items-stretch divide-x divide-rule">
        {STEPS.map((label, i) => {
          const n = (i + 1) as 1 | 2 | 3;
          const done = n < step;
          const active = n === step;
          return (
            <div
              key={label}
              className={
                "relative flex-1 flex flex-col justify-center px-5 " +
                (active ? "bg-paper" : "")
              }
            >
              <div className="flex items-baseline gap-2.5">
                <span
                  className={
                    "font-mono text-[10px] " +
                    (active
                      ? "text-signal font-medium"
                      : done
                      ? "text-inksub"
                      : "text-inkfaint")
                  }
                >
                  {done ? "✓" : `0${n}`}
                </span>
                <span
                  className={
                    "text-[13px] " +
                    (active
                      ? "font-medium text-ink"
                      : done
                      ? "text-inksub"
                      : "text-inkfaint")
                  }
                >
                  {label}
                </span>
              </div>
              {active && (
                <span className="redline absolute left-0 right-0 bottom-0" />
              )}
            </div>
          );
        })}
      </div>
      <div className="md:hidden flex-1 flex items-center justify-end px-5">
        <span className="font-mono text-[10px] tracking-[0.1em] uppercase text-inksub">
          <span className="text-signal font-medium">0{step}</span> / 03 ·{" "}
          {STEPS[step - 1]}
        </span>
      </div>

      {/* Sheet number */}
      <div className="hidden lg:flex flex-col justify-center pl-5 pr-8 text-right">
        <span className="font-mono text-[8.5px] tracking-[0.14em] uppercase text-inkfaint">
          Sheet
        </span>
        <span className="font-mono text-[12px] text-ink mt-0.5">{step} of 3</span>
      </div>
    </div>
  </header>
);

export default FlowHeader;
