// src/components/FlowHeader.tsx
//
// Shared chrome for the light "flow" pages (device check, role & resume),
// lifted from the Vantage mock: logo mark, three-step progress, session label.
// Purely presentational — which step is active is passed in, nothing here
// owns state or navigation.

interface FlowHeaderProps {
  /** 1 = device check, 2 = role & resume, 3 = interview */
  step: 1 | 2 | 3;
}

const STEPS = ["Device check", "Role & resume", "Interview"] as const;

const FlowHeader = ({ step }: FlowHeaderProps) => (
  <header className="flex items-center justify-between px-5 md:px-10 py-4 md:py-5 border-b border-line bg-white">
    <div className="flex items-center gap-3 min-w-0">
      <div className="w-[26px] h-[26px] rounded-[7px] bg-brand flex items-center justify-center text-white text-[13px] font-bold flex-shrink-0">
        G
      </div>
      <div className="text-[15px] font-semibold tracking-tight text-ink truncate">
        Git Hired
      </div>
    </div>

    {/* Stepper — collapses to "Step n of 3" on small screens */}
    <div className="hidden md:flex items-center gap-7">
      {STEPS.map((label, i) => {
        const n = (i + 1) as 1 | 2 | 3;
        const done = n < step;
        const active = n === step;
        return (
          <div key={label} className="flex items-center gap-7">
            {i > 0 && <div className="w-7 h-px bg-[#D6DCDC]" />}
            <div className="flex items-center gap-2.5">
              <div
                className={
                  "w-5 h-5 rounded-full text-[11px] font-semibold flex items-center justify-center " +
                  (done
                    ? "bg-[#D3E4E7] text-brand"
                    : active
                    ? "bg-brand text-white"
                    : "border border-[#C9D1D1] text-[#8B9695]")
                }
              >
                {done ? "✓" : n}
              </div>
              <div
                className={
                  "text-[13px] " +
                  (active ? "font-medium text-ink" : "text-faint")
                }
              >
                {label}
              </div>
            </div>
          </div>
        );
      })}
    </div>
    <div className="md:hidden font-mono text-[11px] text-faint">
      Step {step} of 3
    </div>

    <div className="hidden sm:block font-mono text-[13px] text-faint">
      AI Interview
    </div>
  </header>
);

export default FlowHeader;
