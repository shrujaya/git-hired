// src/pages/WelcomePage.tsx
//
// The sheet's cover page: what this is, what it will ask of you, and the way
// in. Sits before the device check, so it deliberately does not use
// FlowHeader — none of the three stages has started yet, and marking one
// active here would misreport where the candidate is.
//
// Same drafting vocabulary as the flow pages: ruled title block, mono
// annotations, display hero over a redline, square rules, acid lime for the
// one action that moves you forward.

import React from "react";
import { useNavigate } from "react-router-dom";
import BrandMark from "../components/BrandMark";

// Every figure below is the system's real behaviour, not marketing copy:
// 2 warm-up + 5 core + 3 advanced questions, one of which is the coding
// exercise; five roles on the next page; MAX_INTERVIEW_DURATION is 45.
const FACTS = [
  { value: "10", label: "Questions", note: "Warm-up, core, then advanced. The difficulty follows your answers." },
  { value: "01", label: "Coding exercise", note: "Written in the editor beside the call, with hints if you stall." },
  { value: "05", label: "Roles", note: "Pick the one you are interviewing for; questions are built around it." },
  { value: "45", label: "Minutes, max", note: "One sitting. It ends itself once the last question is answered." },
];

const STAGES = [
  {
    n: "01",
    title: "Device check",
    body: "Camera and microphone, so the interviewer can see and hear you. Nothing here is recorded.",
  },
  {
    n: "02",
    title: "Role & resume",
    body: "Attach your resume and choose a role. Both are read before the first question is asked.",
  },
  {
    n: "03",
    title: "The interview",
    body: "A live AI interviewer speaks with you, adapts as you answer, and sets one coding exercise.",
  },
];

const STRIP = [
  "Adaptive questioning",
  "Live transcript",
  "Coding exercise",
  "No human panel",
  "Report to the hiring team",
];

const WelcomePage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen sheet text-ink flex flex-col">
      {/* ---- Title block ---- */}
      <header className="border-b-2 border-ink bg-card">
        <div className="flex items-stretch divide-x divide-rule border-rule">
          {/* Already home, so the mark does not link to itself here. */}
          <BrandMark />

          <div className="flex-1 hidden md:flex items-center px-5">
            <span className="font-mono text-[10px] tracking-[0.14em] uppercase text-inkfaint">
              Sheet 00 — Before you begin
            </span>
          </div>

          <div className="flex items-center gap-2.5 px-5 md:px-8">
            <span className="w-2 h-2 bg-signal animate-recblink" />
            <span className="font-mono text-[10px] tracking-[0.14em] uppercase text-inksub whitespace-nowrap">
              Ready when you are
            </span>
          </div>
        </div>
      </header>

      <div className="flex-1 w-full max-w-[1240px] mx-auto px-5 md:px-10 py-12 md:py-16">

        {/* Same two-column sheet as the flow pages: statement on the left,
            the figures ruled up beside it rather than left as dead space. */}
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] gap-10 lg:gap-14 items-start">

        {/* ---- Hero ---- */}
        <div
          className="reveal"
          style={{ "--d": "0s" } as React.CSSProperties}
        >
          <div className="inline-flex items-center gap-2.5 border border-rule bg-card px-3.5 py-2 mb-7">
            <span className="w-1.5 h-1.5 bg-trace" />
            <span className="font-mono text-[10px] tracking-[0.16em] uppercase text-inksub">
              AI technical interview · 10 questions · 45 min
            </span>
          </div>

          <h1 className="font-display font-extrabold text-[44px] md:text-[62px] leading-[0.98] tracking-hero">
            <span className="text-signal">Commit</span> to your career.
          </h1>
          <span className="redline w-28 mt-6" />

          <p className="text-[15.5px] leading-relaxed text-inksub max-w-[56ch] mt-5">
            A technical interview you take the moment you feel ready. Check your
            camera, attach your resume, and pick a role — then a live AI
            interviewer takes you through ten questions and one coding exercise,
            adapting as you answer. Your transcript and a written report go to
            the hiring team afterwards.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 mt-9">
            <button
              onClick={() => navigate("/device-check")}
              className="px-7 py-4 bg-signal hover:bg-signal-dark text-black border-2 border-signal text-[14.5px] font-semibold tracking-[-0.005em] transition-colors"
            >
              Begin device check →
            </button>
            <a
              href="#how-it-works"
              className="px-7 py-4 border-2 border-ink bg-transparent hover:bg-card text-ink text-[14.5px] font-semibold tracking-[-0.005em] text-center transition-colors"
            >
              What to expect
            </a>
          </div>

          <p className="font-mono text-[10px] tracking-[0.12em] uppercase text-inkfaint mt-5">
            About 2 min to set up · nothing is recorded until the interview starts
          </p>
        </div>

        {/* ---- Figures ---- */}
        <div
          className="reveal border-2 border-ink bg-card divide-y divide-rule"
          style={{ "--d": "0.08s" } as React.CSSProperties}
        >
          <div className="flex items-center gap-2.5 px-5 py-3 border-b border-rule">
            <span className="w-2 h-2 bg-trace" />
            <span className="font-mono text-[9.5px] tracking-[0.14em] uppercase text-inksub">
              Fig. 0a — The interview, in numbers
            </span>
          </div>
          {FACTS.map(({ value, label, note }) => (
            <div key={label} className="flex gap-4 px-5 py-4">
              <div className="font-display font-extrabold text-[30px] leading-none tracking-title text-trace w-[54px] flex-shrink-0">
                {value}
              </div>
              <div className="min-w-0">
                <div className="font-mono text-[9.5px] tracking-[0.14em] uppercase text-signal">
                  {label}
                </div>
                <p className="text-[13px] leading-relaxed text-inksub mt-1.5">{note}</p>
              </div>
            </div>
          ))}
        </div>
        </div>

        {/* ---- How it works ---- */}
        <div
          id="how-it-works"
          className="reveal mt-16 scroll-mt-8"
          style={{ "--d": "0.16s" } as React.CSSProperties}
        >
          <div className="flex items-center gap-2.5 mb-4">
            <span className="w-2 h-2 bg-signal" />
            <span className="font-mono text-[10px] tracking-[0.16em] uppercase text-inksub">
              Fig. 0 — Order of work
            </span>
          </div>
          <h2 className="font-display font-extrabold text-[28px] md:text-[34px] leading-[1.04] tracking-title">
            Three steps, then the interview
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 border-2 border-ink bg-card divide-y md:divide-y-0 divide-rule md:divide-x mt-6">
            {STAGES.map(({ n, title, body }) => (
              <div key={n} className="p-5 lg:p-6">
                <div className="flex items-baseline gap-2.5">
                  <span className="font-mono text-[10px] text-signal font-medium">{n}</span>
                  <span className="font-display font-bold text-[18px] tracking-sub text-ink">
                    {title}
                  </span>
                </div>
                <p className="text-[13.5px] leading-relaxed text-inksub mt-2.5">{body}</p>
              </div>
            ))}
          </div>

          <div className="px-5 py-[18px] bg-wash border border-washline mt-4">
            <div className="font-mono text-[9px] tracking-[0.14em] uppercase text-inksub mb-2">
              Afterwards
            </div>
            <p className="text-[13.5px] leading-relaxed text-inksub">
              The interview closes itself once the final question is answered.
              Your full transcript, your code, and a written report are sent to
              the hiring team — you do not need to submit anything yourself.
            </p>
          </div>
        </div>
      </div>

      {/* ---- Bottom strip ---- */}
      <footer className="border-t-2 border-ink bg-card">
        <div className="max-w-[1240px] mx-auto px-5 md:px-10 py-3.5 flex flex-wrap items-center gap-x-6 gap-y-2">
          {STRIP.map((item) => (
            <span key={item} className="flex items-center gap-2.5">
              <span className="w-1 h-1 bg-inkfaint" />
              <span className="font-mono text-[9.5px] tracking-[0.14em] uppercase text-inkfaint">
                {item}
              </span>
            </span>
          ))}
        </div>
      </footer>
    </div>
  );
};

export default WelcomePage;
