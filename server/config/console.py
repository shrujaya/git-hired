"""
Console setup for cross-platform output.

The server and agents print emoji in their status output. On Windows the
console defaults to a legacy codepage (cp1252/cp437), so `print("🚀")` raises
UnicodeEncodeError and takes the process down at startup. macOS and Linux
terminals are UTF-8 already and are unaffected.
"""

import sys


def enable_unicode_output() -> None:
    """Make stdout/stderr tolerate non-ASCII output on every platform.

    Call once, before anything prints. Falls back to replacement characters
    rather than raising if the terminal genuinely cannot render a glyph.
    """
    for stream in (sys.stdout, sys.stderr):
        # Streams are None under pythonw.exe, and plain objects when captured
        # by a test harness; both lack reconfigure().
        reconfigure = getattr(stream, "reconfigure", None)
        if reconfigure is None:
            continue
        try:
            reconfigure(encoding="utf-8", errors="replace")
        except (ValueError, OSError):
            # Already-detached or non-text stream - leave it as it is.
            pass
