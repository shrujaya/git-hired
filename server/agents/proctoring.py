"""
Integrity signals for one interview.

Three kinds of evidence were already being produced and none of it reached the
report:

- **Face/eye tracking** was computed in `/ws/video` and written to a single
  global `eye_tracking.jsonl` with no session id, so it could not be attributed
  to an interview even in principle.
- **Tab switches and fullscreen exits** were counted in React state, shown once
  in the exit dialog, and discarded when the page unmounted.
- **Keystrokes** existed only as `server/src/input_tracker.py`, a `pynput`
  script that listens to the *operating system it runs on*. The backend is not
  the candidate's machine, so wiring it in would have logged whoever was
  sitting at the server. The browser-side equivalents - paste, copy, and how
  much was actually typed - are the signals that mean something here, and they
  come from the page the candidate is really using.

This module is the one place all of it lands, per session, so the report can
see it. It records facts and counts; it deliberately does not decide whether
anyone cheated.
"""

import json
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

from config.settings import config


# What the UI is allowed to report. An unknown type is kept rather than
# dropped - a future event should show up in the log as itself instead of
# vanishing - but only these are summarised and scored.
FOCUS_EVENTS = {"tab_switch", "fullscreen_exit", "window_blur"}
CLIPBOARD_EVENTS = {"paste", "copy"}
FACE_EVENTS = {"face_out_of_view"}


def summary_to_report_section(summary: Optional[Dict[str, Any]]) -> str:
    """
    Render a summary as the plain-text block the report prompt reads.

    Takes the summary dict rather than a live object so the wording is
    identical whether it comes from the session in memory or from
    proctoring.json - the report runs in a background task and reads the file.

    Written as observations, not conclusions: a count of tab switches is
    evidence a human should weigh, not a verdict this system should reach.
    """
    if not summary:
        return (
            "No integrity monitoring data was captured for this session. This "
            "usually means the candidate's browser did not report it (an older "
            "client, or the interview ended abnormally). Treat it as absence "
            "of data, NOT as evidence of good conduct."
        )

    s = summary
    if not s.get("total_events") and not s.get("keystrokes"):
        return (
            "Integrity monitoring was active and recorded no events: no tab "
            "switches, no fullscreen exits, no time with the face out of "
            "frame, and no clipboard use in the code editor."
        )

    longest = s.get("face_out_of_view_longest_seconds", 0)
    lines = [
        f"- Left the interview tab: {s.get('tab_switches', 0)} time(s)",
        f"- Exited fullscreen: {s.get('fullscreen_exits', 0)} time(s)",
        f"- Face not visible in camera: {s.get('face_out_of_view_count', 0)} "
        f"time(s), {s.get('face_out_of_view_seconds', 0)}s total"
        + (f" (longest {longest}s)" if longest else ""),
        f"- Pasted into the code editor: {s.get('pastes', 0)} time(s), "
        f"{s.get('pasted_chars', 0)} characters total",
        f"- Copied from the code editor: {s.get('copies', 0)} time(s)",
        f"- Keystrokes typed in the code editor: {s.get('keystrokes', 0)}",
    ]

    # The one derived signal worth stating outright: it is easy to miss in the
    # raw numbers, and it is the difference between a candidate who wrote the
    # solution and one who brought it.
    pasted = s.get("pasted_chars", 0)
    typed = s.get("keystrokes", 0)
    if pasted > 0 and typed < pasted * 0.2:
        lines.append(
            f"- NOTE: most of the submitted code arrived by paste "
            f"({pasted} characters pasted vs {typed} typed)."
        )

    return "\n".join(lines)


class ProctoringLog:
    """Accumulates integrity events for a single interview session."""

    def __init__(self, session_id: Optional[str] = None):
        self.session_id = session_id
        self.started_at = datetime.now()
        self.events: List[Dict[str, Any]] = []
        # Typing is a running total rather than an event per keystroke: a
        # 45-minute interview would otherwise produce thousands of entries
        # that say nothing individually.
        self.keystrokes = 0
        self.pasted_chars = 0

    # ---- recording ------------------------------------------------------

    def record(self, event_type: str, **detail: Any) -> Dict[str, Any]:
        """
        Record one event. Returns the stored entry.

        Args:
            event_type: e.g. "tab_switch", "paste", "face_out_of_view"
            detail: event-specific fields (duration, chars, source…)
        """
        entry = {
            "timestamp": datetime.now().isoformat(timespec="seconds"),
            "type": event_type,
            **{k: v for k, v in detail.items() if v is not None},
        }
        self.events.append(entry)

        if event_type == "paste":
            self.pasted_chars += int(detail.get("chars") or 0)

        return entry

    def record_keystrokes(self, count: int) -> None:
        """Add to the running keystroke total (the UI batches these)."""
        if count > 0:
            self.keystrokes += int(count)

    # ---- reading --------------------------------------------------------

    def _count(self, event_type: str) -> int:
        return sum(1 for e in self.events if e["type"] == event_type)

    def summary(self) -> Dict[str, Any]:
        """Counts and totals, for the report and the JSON file."""
        out_of_view = [e for e in self.events if e["type"] == "face_out_of_view"]
        durations = [float(e.get("duration") or 0) for e in out_of_view]

        return {
            "session_id": self.session_id,
            "started_at": self.started_at.isoformat(timespec="seconds"),
            "tab_switches": self._count("tab_switch"),
            "fullscreen_exits": self._count("fullscreen_exit"),
            "window_blurs": self._count("window_blur"),
            "face_out_of_view_count": len(out_of_view),
            "face_out_of_view_seconds": round(sum(durations), 1),
            "face_out_of_view_longest_seconds": round(max(durations), 1) if durations else 0.0,
            "pastes": self._count("paste"),
            "pasted_chars": self.pasted_chars,
            "copies": self._count("copy"),
            "keystrokes": self.keystrokes,
            "total_events": len(self.events),
        }

    def report_section(self) -> str:
        """A plain-text block for the report prompt."""
        return summary_to_report_section(self.summary())

    # ---- persistence ----------------------------------------------------

    def save(self, session_id: Optional[str] = None) -> Optional[Path]:
        """Write to logs/<session_id>/proctoring.json alongside the transcript."""
        session_id = session_id or self.session_id
        if not session_id:
            return None

        session_dir = config.logs_dir / session_id
        session_dir.mkdir(parents=True, exist_ok=True)
        path = session_dir / "proctoring.json"

        with open(path, "w", encoding="utf-8") as f:
            json.dump(
                {"summary": self.summary(), "events": self.events},
                f,
                indent=2,
            )
        return path

    @staticmethod
    def load_summary(session_id: str) -> Optional[Dict[str, Any]]:
        """Read back a saved summary, for the report generator."""
        path = config.logs_dir / session_id / "proctoring.json"
        if not path.exists():
            return None
        try:
            with open(path, "r", encoding="utf-8") as f:
                return json.load(f).get("summary")
        except Exception as e:
            print(f"Could not read proctoring log for {session_id}: {e}")
            return None
