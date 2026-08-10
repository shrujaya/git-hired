"""
Helpers for reading Claude responses.
"""


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
