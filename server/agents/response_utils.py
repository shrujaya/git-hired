"""
Helpers for reading Claude responses, and for handling untrusted candidate
input on the way in.
"""

import re


def first_text(message) -> str:
    """
    Return the first text block from a Claude response.

    Indexing content[0] directly is not safe: with adaptive thinking enabled
    (the default on Claude Sonnet 5) the first block is a thinking block, which
    has no .text attribute. Scan for the text block instead.
    """
    for block in message.content:
        if block.type == "text":
            return block.text

    raise ValueError(
        f"No text block in response (stop_reason={message.stop_reason}, "
        f"blocks={[b.type for b in message.content]})"
    )


# ---------------------------------------------------------------------------
# Candidate input is untrusted
# ---------------------------------------------------------------------------
#
# Everything the candidate says reaches a model prompt: the interviewer's own
# turn, the response scorer that drives difficulty, and the coding assessor.
# Two separate problems have to be handled, and only one of them is a text
# problem:
#
#   1. Tavus splices its own markup into the transcript - audio-analysis blocks
#      and placeholder text for silence. Left alone it is stored and scored as
#      if the candidate had said it.
#   2. A candidate can *speak* text designed to look like system framing, to
#      talk the interviewer into a different question, an easier difficulty, or
#      a coding problem out of turn.
#
# This module strips the structure that makes injected text look authoritative.
# It deliberately does NOT try to detect persuasion by pattern - "ignore the
# previous approach" is a legitimate thing to say about a data structure. The
# semantic half of the defence lives in the prompts, which state plainly that
# the candidate cannot direct the interview, and in the fact that question
# number, difficulty and coding-round timing are computed in Python and only
# ever *reported* to the model.

# Tavus wraps its inferred tone in this element and prepends it to the answer.
_AUDIO_ANALYSIS_RE = re.compile(
    r"<user_audio_analysis>.*?</user_audio_analysis>",
    re.IGNORECASE | re.DOTALL,
)

# Any other XML-ish tag: the candidate has no legitimate reason to speak one,
# and it is the cheapest way to imitate the framing of a real system message.
_TAG_RE = re.compile(r"</?\s*[a-z_][\w\-]*\s*/?>", re.IGNORECASE)

# Tavus placeholders for "nothing was said". These are not answers: scoring
# them drags difficulty down and they burn a question.
_PLACEHOLDERS = {
    "the user did not respond",
    "user did not respond",
    "no response",
    "the user was silent",
    "silence",
    "inaudible",
}

# Speaking this would otherwise let one candidate address another candidate's
# session - see _extract_session_id in the backend.
_SESSION_MARKER_RE = re.compile(r"git-hired-session\s*:?\s*\S*", re.IGNORECASE)

# Role labels at the start of a line, which is how a chat transcript marks who
# is talking. Spoken aloud they are an attempt to forge a turn.
_ROLE_PREFIX_RE = re.compile(
    r"^\s*(system|assistant|developer|interviewer|user)\s*:\s*",
    re.IGNORECASE | re.MULTILINE,
)


def sanitize_candidate_speech(text: str) -> str:
    """
    Clean one turn of candidate speech before it reaches any prompt.

    Removes Tavus's own markup and the structural devices that let spoken text
    impersonate system instructions. The candidate's actual words are left
    intact - including words that argue for an easier question, which the
    interviewer is expected to hear and decline rather than never see.

    Args:
        text: Raw transcript for this turn, as Tavus delivered it

    Returns:
        The cleaned turn, or "" if nothing of substance remains
    """
    if not text:
        return ""

    cleaned = _AUDIO_ANALYSIS_RE.sub(" ", text)
    cleaned = _TAG_RE.sub(" ", cleaned)
    cleaned = _SESSION_MARKER_RE.sub(" ", cleaned)
    cleaned = _ROLE_PREFIX_RE.sub("", cleaned)

    # Bracketed asides are how Tavus reports non-speech. Drop the ones we
    # recognise as placeholders; keep anything else, since a candidate may
    # legitimately have said something the transcriber bracketed.
    def _drop_placeholder(match: re.Match) -> str:
        inner = match.group(1).strip().lower().rstrip(".")
        return " " if inner in _PLACEHOLDERS else match.group(0)

    cleaned = re.sub(r"\[([^\[\]]*)\]", _drop_placeholder, cleaned)

    cleaned = re.sub(r"\s+", " ", cleaned).strip()

    # What is left may be only punctuation once the markup is gone.
    if not re.search(r"\w", cleaned):
        return ""

    return cleaned
