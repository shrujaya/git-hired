"""
Configuration Settings for AI Interviewer System
"""

import os
from pathlib import Path
from pydantic import BaseModel, Field
from typing import Optional

from dotenv import load_dotenv

# Base paths
BASE_DIR = Path(__file__).parent.parent
LOGS_DIR = BASE_DIR / "logs"
REPORTS_DIR = BASE_DIR / "reports"
PROMPTS_DIR = BASE_DIR / "prompts"

# Anchor the .env lookup to server/ rather than the current working directory,
# so the config resolves the same whether you launch from the repo root,
# server/backend, or an IDE with its own cwd.
load_dotenv(BASE_DIR / ".env")

# Create directories if they don't exist
LOGS_DIR.mkdir(exist_ok=True)
REPORTS_DIR.mkdir(exist_ok=True)
PROMPTS_DIR.mkdir(exist_ok=True)


def env_bool(name: str, default: bool) -> bool:
    """Read a boolean flag from the environment ("true"/"1"/"yes" are true)."""
    raw = os.getenv(name)
    if raw is None or not raw.strip():
        return default
    return raw.strip().lower() in ("1", "true", "yes", "on")


def env_int(name: str, default: int) -> int:
    """Read an int from the environment, falling back on blank/garbage values."""
    raw = os.getenv(name)
    if raw is None or not raw.strip():
        return default
    try:
        return int(raw.strip())
    except ValueError:
        print(f"Warning: {name}={raw!r} is not an integer - using {default}")
        return default


# A Tavus stock face, so the avatar works before anyone trains their own.
# Browse alternatives: GET https://tavusapi.com/v2/faces?face_type=system
DEFAULT_TAVUS_FACE_ID = "rf4703150052"  # "Charlie"


class APIConfig(BaseModel):
    """API Keys Configuration"""
    anthropic_api_key: str = Field(default_factory=lambda: os.getenv("ANTHROPIC_API_KEY", ""))
    tavus_api_key: str = Field(default_factory=lambda: os.getenv("TAVUS_API_KEY", ""))
    # Tavus renamed replica -> face and persona -> PAL. TAVUS_REPLICA_ID is
    # accepted as a legacy alias because the ids are the same "r..." values.
    tavus_face_id: str = Field(
        default_factory=lambda: (
            os.getenv("TAVUS_FACE_ID")
            or os.getenv("TAVUS_REPLICA_ID")
            or DEFAULT_TAVUS_FACE_ID
        )
    )
    # The PAL that renders the face. Left blank, the server provisions one on
    # first use and prints its id to pin here.
    tavus_pal_id: str = Field(default_factory=lambda: os.getenv("TAVUS_PAL_ID", ""))

    # Public origin of THIS backend, as Tavus must reach it (a tunnel URL in
    # local development). Tavus calls <base>/v1/chat/completions to get each
    # interviewer line, which is what lets Tavus own the voice pipeline -
    # sparrow-1 turn detection and barge-in - while our InterviewerAgent
    # still decides what is actually said.
    tavus_llm_base_url: str = Field(
        default_factory=lambda: os.getenv("TAVUS_LLM_BASE_URL", "").rstrip("/")
    )
    # Shared secret Tavus presents back to us. The endpoint is internet-facing,
    # so it must not be optional in practice.
    tavus_llm_api_key: str = Field(
        default_factory=lambda: os.getenv("TAVUS_LLM_API_KEY", "")
    )
    livekit_url: str = Field(default_factory=lambda: os.getenv("LIVEKIT_URL", "wss://test-w50p3304.livekit.cloud"))
    livekit_api_key: str = Field(default_factory=lambda: os.getenv("LIVEKIT_API_KEY", ""))
    livekit_api_secret: str = Field(default_factory=lambda: os.getenv("LIVEKIT_API_SECRET", ""))


class ConversationConfig(BaseModel):
    """Tavus conversational-flow tuning (natural turn-taking).

    These drive Tavus's own voice pipeline, which is what makes the interview
    feel live: the avatar stops when the candidate starts talking and replies
    as soon as they stop, with no push-to-talk button.
    """
    # sparrow-1 is Tavus's semantic turn detector: it waits on "umm..." but
    # answers immediately on a finished thought.
    turn_detection_model: str = Field(
        default_factory=lambda: os.getenv("TAVUS_TURN_DETECTION_MODEL", "sparrow-1")
    )
    # Interviews have real thinking pauses, so bias towards not cutting the
    # candidate off mid-thought.
    turn_taking_patience: str = Field(
        default_factory=lambda: os.getenv("TAVUS_TURN_TAKING_PATIENCE", "high")
    )
    # How readily the avatar yields when talked over ("barge-in").
    pal_interruptibility: str = Field(
        default_factory=lambda: os.getenv("TAVUS_INTERRUPTIBILITY", "medium")
    )
    voice_isolation: str = Field(
        default_factory=lambda: os.getenv("TAVUS_VOICE_ISOLATION", "near")
    )
    # Off: an interviewer that nags during a silence would be worse than one
    # that waits while the candidate thinks.
    idle_engagement: str = Field(
        default_factory=lambda: os.getenv("TAVUS_IDLE_ENGAGEMENT", "off")
    )


class ServerConfig(BaseModel):
    """HTTP server bind settings"""
    # 127.0.0.1 keeps the dev server off the network and avoids the Windows
    # Defender "allow this app" prompt. Set HOST=0.0.0.0 to expose it on the LAN.
    host: str = Field(default_factory=lambda: os.getenv("HOST", "127.0.0.1"))
    # 8000 is a popular default and is often already taken - on Windows a
    # service holding it produces WinError 10013 rather than a plain
    # "address in use", so the project defaults to a quieter port.
    port: int = Field(default_factory=lambda: env_int("PORT", 8100))
    reload: bool = Field(default_factory=lambda: env_bool("RELOAD", True))


class InterviewConfig(BaseModel):
    """Interview Settings"""
    # Interview duration in minutes
    max_duration: int = Field(
        default_factory=lambda: env_int("MAX_INTERVIEW_DURATION", 45),
        description="Maximum interview duration in minutes"
    )

    # Question distribution
    warmup_questions: int = Field(default_factory=lambda: env_int("WARMUP_QUESTIONS", 2))
    core_questions: int = Field(default_factory=lambda: env_int("CORE_QUESTIONS", 5))
    advanced_questions: int = Field(default_factory=lambda: env_int("ADVANCED_QUESTIONS", 3))

    # Timing
    question_timeout: int = Field(default=300, description="Timeout per question in seconds")
    coding_question_timeout: int = Field(default=600, description="Timeout for coding questions in seconds")
    
    # Coding round
    # How many hints the interviewer offers before moving on. The candidate is
    # nudged rather than told the answer; after this many unsuccessful attempts
    # the interview proceeds so one problem cannot consume the whole session.
    coding_max_hints: int = Field(
        default_factory=lambda: env_int("CODING_MAX_HINTS", 3),
        description="Hints offered on the coding question before moving on"
    )

    # Turns the candidate may spend talking before submitting anything. This is
    # a separate budget from the hints: filler like "yeah" or "mm-hmm" while
    # they read the problem used to burn the hint budget and abandon the round
    # before the candidate had written a line. Higher, because thinking aloud
    # and asking for the problem to be repeated are normal.
    coding_max_prompts: int = Field(
        default_factory=lambda: env_int("CODING_MAX_PROMPTS", 6),
        description="Turns allowed before a submission, before the round is abandoned"
    )

    # Scoring
    max_coding_score: int = Field(default=10, description="Maximum score for coding questions")
    total_interview_score: int = Field(default=100, description="Total interview score")
    
    # Model settings
    # The model id comes from CLAUDE_MODEL in .env — do not hardcode it anywhere else.
    claude_model: str = Field(
        default_factory=lambda: os.getenv("CLAUDE_MODEL", "claude-sonnet-5"),
        description="Claude model to use (set via CLAUDE_MODEL)"
    )
    # Sonnet 5 runs adaptive thinking by default and max_tokens caps thinking +
    # response text together, so this needs more headroom than a non-thinking model.
    max_tokens: int = Field(default=8192, description="Max tokens per response")

    # A spoken interview turn is 2-4 sentences. The generous budget above is for
    # reports; using it for conversation buys nothing and costs seconds, because
    # adaptive thinking expands to fill the headroom it is given.
    reply_max_tokens: int = Field(
        default_factory=lambda: env_int("REPLY_MAX_TOKENS", 1024),
        description="Max tokens for a single spoken interview turn"
    )
    # "low" is the documented setting for short, scoped, latency-sensitive work,
    # which is exactly what one interview question is.
    reply_effort: str = Field(
        default_factory=lambda: os.getenv("REPLY_EFFORT", "low"),
        description="Effort level for conversational turns (low|medium|high)"
    )

class EmailConfig(BaseModel):
    """Email Configuration"""
    smtp_server: str = Field(
        default_factory=lambda: os.getenv("SMTP_SERVER", "smtp.gmail.com"),
        description="SMTP server"
    )
    smtp_port: int = Field(
        default_factory=lambda: env_int("SMTP_PORT", 587),
        description="SMTP port"
    )
    sender_email: str = Field(default_factory=lambda: os.getenv("SENDER_EMAIL", ""))
    sender_password: str = Field(default_factory=lambda: os.getenv("SENDER_PASSWORD", ""))
    manager_email: str = Field(default_factory=lambda: os.getenv("MANAGER_EMAIL", ""))


class SystemConfig(BaseModel):
    """Complete System Configuration"""
    api: APIConfig = Field(default_factory=APIConfig)
    server: ServerConfig = Field(default_factory=ServerConfig)
    conversation: ConversationConfig = Field(default_factory=ConversationConfig)
    interview: InterviewConfig = Field(default_factory=InterviewConfig)
    email: EmailConfig = Field(default_factory=EmailConfig)

    # File paths
    logs_dir: Path = LOGS_DIR
    reports_dir: Path = REPORTS_DIR
    prompts_dir: Path = PROMPTS_DIR

    # Feature flags
    enable_avatar: bool = Field(
        default_factory=lambda: env_bool("ENABLE_AVATAR", True),
        description="Enable Tavus avatar"
    )
    enable_livekit: bool = Field(
        default_factory=lambda: env_bool("ENABLE_LIVEKIT", True),
        description="Enable LiveKit"
    )
    enable_email_notifications: bool = Field(
        default_factory=lambda: env_bool("ENABLE_EMAIL_NOTIFICATIONS", True),
        description="Send email reports"
    )
    save_transcripts: bool = Field(
        default_factory=lambda: env_bool("SAVE_TRANSCRIPTS", True),
        description="Save interview transcripts"
    )


# Global configuration instance
config = SystemConfig()


def load_config() -> SystemConfig:
    """Load configuration from environment variables"""
    return SystemConfig()


def validate_config(cfg: SystemConfig) -> bool:
    """Validate that all required configuration is present"""
    errors = []
    
    if not cfg.api.anthropic_api_key:
        errors.append("ANTHROPIC_API_KEY is required")
    
    if cfg.enable_avatar and not cfg.api.tavus_api_key:
        errors.append("TAVUS_API_KEY is required when avatar is enabled")
    
    # tavus_face_id always has a stock default, so it only fails if explicitly
    # blanked out. The PAL is provisioned automatically when unset.
    if cfg.enable_avatar and not cfg.api.tavus_face_id:
        errors.append("TAVUS_FACE_ID must not be empty when avatar is enabled")

    if cfg.enable_avatar:
        if not cfg.api.tavus_llm_base_url:
            errors.append(
                "TAVUS_LLM_BASE_URL is required when avatar is enabled - Tavus "
                "must be able to reach this backend (use a tunnel locally)"
            )
        if not cfg.api.tavus_llm_api_key:
            errors.append(
                "TAVUS_LLM_API_KEY is required when avatar is enabled - it "
                "protects the internet-facing /v1/chat/completions endpoint"
            )


    if cfg.enable_email_notifications:
        if not cfg.email.sender_email:
            errors.append("SENDER_EMAIL is required for email notifications")
        if not cfg.email.manager_email:
            errors.append("MANAGER_EMAIL is required for email notifications")
    
    if errors:
        print("Configuration Errors:")
        for error in errors:
            print(f"  - {error}")
        return False
    
    return True


# Interview difficulty levels
class DifficultyLevel:
    EASY = 1
    MEDIUM = 2
    HARD = 3
    EXPERT = 4
    
    @staticmethod
    def adjust(current_level: int, adjustment: int) -> int:
        """Adjust difficulty level"""
        new_level = current_level + adjustment
        return max(1, min(4, new_level))


# Response quality thresholds
class ResponseQuality:
    EXCELLENT = (90, 100)
    GOOD = (70, 89)
    RIGHT_DIRECTION = (50, 69)
    PARTIALLY_WRONG = (30, 49)
    WRONG = (0, 29)
    
    @staticmethod
    def get_category(score: int) -> str:
        """Get quality category from score"""
        if ResponseQuality.EXCELLENT[0] <= score <= ResponseQuality.EXCELLENT[1]:
            return "EXCELLENT"
        elif ResponseQuality.GOOD[0] <= score <= ResponseQuality.GOOD[1]:
            return "GOOD"
        elif ResponseQuality.RIGHT_DIRECTION[0] <= score <= ResponseQuality.RIGHT_DIRECTION[1]:
            return "RIGHT_DIRECTION"
        elif ResponseQuality.PARTIALLY_WRONG[0] <= score <= ResponseQuality.PARTIALLY_WRONG[1]:
            return "PARTIALLY_WRONG"
        else:
            return "WRONG"

