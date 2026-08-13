"""
Interview report PDF

Renders the Markdown report the model writes into the PDF that gets emailed to
the hiring manager. Deliberately a small Markdown subset - headings, bold,
bullets, numbered lists, rules and tables - because that is all the report
generator produces. Anything unrecognised falls through as body text rather
than being dropped.
"""

import re
from pathlib import Path
from typing import Any, Dict, List

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import LETTER
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import (
    HRFlowable,
    ListFlowable,
    ListItem,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

INK = colors.HexColor("#111827")
MUTED = colors.HexColor("#6B7280")
ACCENT = colors.HexColor("#4F46E5")
RULE = colors.HexColor("#E5E7EB")
BAND = colors.HexColor("#F3F4F6")

# The core PDF fonts cover WinAnsi, not emoji, and the model reaches for
# ✅/❌ in recommendations. A missing glyph renders as a black box, so map the
# ones that carry meaning to text and drop the rest.
_EMOJI = {
    "✅": "[YES]", "❌": "[NO]", "⚠️": "[!]", "⚠": "[!]",
    "🟢": "[+]", "🔴": "[-]", "🟡": "[~]",
    "⭐": "*", "•": "-", "→": "->", "—": "-", "–": "-",
    "“": '"', "”": '"', "‘": "'", "’": "'", "…": "...",
}


def _plain(text: str) -> str:
    """Strip characters the built-in fonts cannot draw."""
    for symbol, replacement in _EMOJI.items():
        text = text.replace(symbol, replacement)
    # Anything still outside Latin-1 would render as a black box.
    return text.encode("latin-1", "ignore").decode("latin-1")


def _inline(text: str) -> str:
    """Markdown inline emphasis -> the mini-HTML Paragraph understands."""
    text = _plain(text)
    text = text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    text = re.sub(r"\*\*\*(.+?)\*\*\*", r"<b><i>\1</i></b>", text)
    text = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", text)
    text = re.sub(r"(?<!\*)\*(?!\s)(.+?)(?<!\s)\*(?!\*)", r"<i>\1</i>", text)
    text = re.sub(r"`(.+?)`", r"<font face='Courier'>\1</font>", text)
    return text


def _styles() -> Dict[str, ParagraphStyle]:
    base = getSampleStyleSheet()["BodyText"]
    return {
        "body": ParagraphStyle(
            "body", parent=base, fontName="Helvetica", fontSize=9.5,
            leading=14, textColor=INK, alignment=TA_LEFT, spaceAfter=6,
        ),
        "h1": ParagraphStyle(
            "h1", parent=base, fontName="Helvetica-Bold", fontSize=16,
            leading=20, textColor=INK, spaceBefore=14, spaceAfter=8,
        ),
        "h2": ParagraphStyle(
            "h2", parent=base, fontName="Helvetica-Bold", fontSize=12.5,
            leading=16, textColor=ACCENT, spaceBefore=14, spaceAfter=6,
        ),
        "h3": ParagraphStyle(
            "h3", parent=base, fontName="Helvetica-Bold", fontSize=10.5,
            leading=14, textColor=INK, spaceBefore=10, spaceAfter=4,
        ),
        "cell": ParagraphStyle(
            "cell", parent=base, fontName="Helvetica", fontSize=8.5,
            leading=11, textColor=INK, spaceAfter=0,
        ),
        "cellhead": ParagraphStyle(
            "cellhead", parent=base, fontName="Helvetica-Bold", fontSize=8.5,
            leading=11, textColor=INK, spaceAfter=0,
        ),
        "meta": ParagraphStyle(
            "meta", parent=base, fontName="Helvetica", fontSize=9,
            leading=13, textColor=MUTED, spaceAfter=2,
        ),
        "title": ParagraphStyle(
            "title", parent=base, fontName="Helvetica-Bold", fontSize=20,
            leading=24, textColor=INK, spaceAfter=2,
        ),
    }


def _is_table_row(line: str, in_table: bool) -> bool:
    """
    A table row starts and ends with a pipe.

    Two pipes is enough *inside* a table - a row with a single cell is ragged
    but still part of it. Outside one, require three so a sentence that happens
    to contain a pipe does not start a table.
    """
    if not (line.startswith("|") and line.endswith("|")):
        return False
    return line.count("|") >= (2 if in_table else 3)


def _split_row(line: str) -> List[str]:
    return [c.strip() for c in line.strip().strip("|").split("|")]


def _table(rows: List[List[str]], style: Dict[str, ParagraphStyle], width: float) -> Table:
    """Build a table, wrapping every cell so long text cannot overflow."""
    body = [
        [Paragraph(_inline(c), style["cellhead" if i == 0 else "cell"]) for c in row]
        for i, row in enumerate(rows)
    ]
    columns = max(len(r) for r in body)
    # Pad ragged rows; a short row would otherwise shift the grid.
    for row in body:
        row.extend(Paragraph("", style["cell"]) for _ in range(columns - len(row)))

    table = Table(body, colWidths=[width / columns] * columns, repeatRows=1)
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), BAND),
        ("GRID", (0, 0), (-1, -1), 0.4, RULE),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    return table


def _markdown_flowables(markdown: str, style: Dict[str, ParagraphStyle], width: float) -> List:
    flowables: List = []
    bullets: List[str] = []
    table_rows: List[List[str]] = []

    def flush_bullets():
        if not bullets:
            return
        flowables.append(ListFlowable(
            [ListItem(Paragraph(_inline(b), style["body"]), leftIndent=12) for b in bullets],
            bulletType="bullet", bulletFontSize=9, bulletOffsetY=-1,
            leftIndent=16, spaceAfter=6,
        ))
        bullets.clear()

    def flush_table():
        if not table_rows:
            return
        flowables.append(Spacer(1, 4))
        flowables.append(_table(list(table_rows), style, width))
        flowables.append(Spacer(1, 8))
        table_rows.clear()

    for raw in markdown.splitlines():
        line = raw.rstrip()
        stripped = line.strip()

        if _is_table_row(stripped, bool(table_rows)):
            cells = _split_row(stripped)
            # The |---|---| separator carries no content.
            if not all(set(c) <= set("-: ") and c for c in cells):
                table_rows.append(cells)
            continue
        flush_table()

        if not stripped:
            flush_bullets()
            continue

        if re.fullmatch(r"(-{3,}|\*{3,}|_{3,})", stripped):
            flush_bullets()
            flowables.append(Spacer(1, 4))
            flowables.append(HRFlowable(width="100%", thickness=0.5, color=RULE))
            flowables.append(Spacer(1, 6))
            continue

        heading = re.match(r"^(#{1,6})\s+(.*)", stripped)
        if heading:
            flush_bullets()
            level = len(heading.group(1))
            key = "h1" if level == 1 else "h2" if level == 2 else "h3"
            flowables.append(Paragraph(_inline(heading.group(2)), style[key]))
            continue

        bullet = re.match(r"^[-*+]\s+(.*)", stripped)
        if bullet:
            bullets.append(bullet.group(1))
            continue

        numbered = re.match(r"^(\d+)[.)]\s+(.*)", stripped)
        if numbered:
            flush_bullets()
            flowables.append(Paragraph(
                f"<b>{numbered.group(1)}.</b> {_inline(numbered.group(2))}", style["body"]
            ))
            continue

        flush_bullets()
        flowables.append(Paragraph(_inline(stripped), style["body"]))

    flush_bullets()
    flush_table()
    return flowables


def render_report_pdf(report_data: Dict[str, Any], output_path: Path) -> Path:
    """
    Render the interview report to a PDF.

    Args:
        report_data: The dict save_report() writes, with at least 'report',
            'candidate_name', 'job_role', 'interview_date',
            'interview_duration' and 'coding_score'
        output_path: Where to write the .pdf

    Returns:
        output_path
    """
    output_path.parent.mkdir(parents=True, exist_ok=True)
    style = _styles()

    candidate = report_data.get("candidate_name", "Candidate")
    role = report_data.get("job_role", "")
    doc = SimpleDocTemplate(
        str(output_path),
        pagesize=LETTER,
        leftMargin=0.75 * inch, rightMargin=0.75 * inch,
        topMargin=0.7 * inch, bottomMargin=0.7 * inch,
        title=f"Interview Report - {candidate}",
        author="Git-Hired AI Interview System",
        subject=f"Interview report for {candidate} ({role})",
    )
    width = doc.width

    story: List = [
        Paragraph(_inline("Interview Report"), style["title"]),
        Paragraph(_inline(candidate), style["h1"]),
    ]
    for label, value in [
        ("Position", role),
        ("Date", report_data.get("interview_date", "")),
        ("Duration", f"{report_data.get('interview_duration', '?')} minutes"),
        ("Coding score", f"{report_data.get('coding_score', '?')}/10"),
    ]:
        if value:
            story.append(Paragraph(f"<b>{label}:</b> {_inline(str(value))}", style["meta"]))

    story += [
        Spacer(1, 10),
        HRFlowable(width="100%", thickness=1, color=ACCENT),
        Spacer(1, 10),
    ]
    story += _markdown_flowables(report_data.get("report", ""), style, width)

    def footer(canvas, doc_):
        canvas.saveState()
        canvas.setFont("Helvetica", 7.5)
        canvas.setFillColor(MUTED)
        canvas.drawString(0.75 * inch, 0.45 * inch,
                          _plain(f"Interview report - {candidate}"))
        canvas.drawRightString(LETTER[0] - 0.75 * inch, 0.45 * inch,
                               f"Page {doc_.page}")
        canvas.restoreState()

    doc.build(story, onFirstPage=footer, onLaterPages=footer)
    return output_path
