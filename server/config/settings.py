"""
Configuration Settings for AI Interviewer System
"""

import os
from pathlib import Path
from pydantic import BaseModel, Field
from typing import Optional

# Base paths
BASE_DIR = Path(__file__).parent.parent
LOGS_DIR = BASE_DIR / "logs"
REPORTS_DIR = BASE_DIR / "reports"
PROMPTS_DIR = BASE_DIR / "prompts"

# Create directories if they don't exist
LOGS_DIR.mkdir(exist_ok=True)
REPORTS_DIR.mkdir(exist_ok=True)
PROMPTS_DIR.mkdir(exist_ok=True)


class APIConfig(BaseModel):
    """API Keys Configuration"""
    anthropic_api_key: str = Field(default_factory=lambda: os.getenv("ANTHROPIC_API_KEY", ""))
    tavus_api_key: str = Field(default_factory=lambda: os.getenv("TAVUS_API_KEY", ""))
    tavus_replica_id: str = Field(default_factory=lambda: os.getenv("TAVUS_REPLICA_ID", ""))
    livekit_url: str = Field(default_factory=lambda: os.getenv("LIVEKIT_URL", "wss://test-w50p3304.livekit.cloud"))
    livekit_api_key: str = Field(default_factory=lambda: os.getenv("LIVEKIT_API_KEY", ""))
    livekit_api_secret: str = Field(default_factory=lambda: os.getenv("LIVEKIT_API_SECRET", ""))


class InterviewConfig(BaseModel):
    """Interview Settings"""
    # Interview duration in minutes
    max_duration: int = Field(default=45, description="Maximum interview duration in minutes")
    
    # Question distribution
    warmup_questions: int = Field(default=2, description="Number of warmup questions")
    core_questions: int = Field(default=5, description="Number of core questions")
    advanced_questions: int = Field(default=3, description="Number of advanced questions")
    
    # Timing
    question_timeout: int = Field(default=300, description="Timeout per question in seconds")
    coding_question_timeout: int = Field(default=600, description="Timeout for coding questions in seconds")
    
    # Scoring
    max_coding_score: int = Field(default=10, description="Maximum score for coding questions")
    total_interview_score: int = Field(default=100, description="Total interview score")
    
    # Model settings
    claude_model: str = Field(default="claude-sonnet-4-20250514", description="Claude model to use")
    max_tokens: int = Field(default=1024, description="Max tokens per response")
    temperature: float = Field(default=0.7, description="Temperature for responses")


class EmailConfig(BaseModel):
    """Email Configuration"""
    smtp_server: str = Field(default="smtp.gmail.com", description="SMTP server")
    smtp_port: int = Field(default=587, description="SMTP port")
    sender_email: str = Field(default_factory=lambda: os.getenv("SENDER_EMAIL", ""))
    sender_password: str = Field(default_factory=lambda: os.getenv("SENDER_PASSWORD", ""))
    manager_email: str = Field(default_factory=lambda: os.getenv("MANAGER_EMAIL", ""))


class SystemConfig(BaseModel):
    """Complete System Configuration"""
    api: APIConfig = Field(default_factory=APIConfig)
    interview: InterviewConfig = Field(default_factory=InterviewConfig)
    email: EmailConfig = Field(default_factory=EmailConfig)
    
    # File paths
    logs_dir: Path = LOGS_DIR
    reports_dir: Path = REPORTS_DIR
    prompts_dir: Path = PROMPTS_DIR
    
    # Feature flags
    enable_avatar: bool = Field(default=True, description="Enable Tavus avatar")
    enable_livekit: bool = Field(default=True, description="Enable LiveKit")
    enable_email_notifications: bool = Field(default=True, description="Send email reports")
    save_transcripts: bool = Field(default=True, description="Save interview transcripts")


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
    
    if cfg.enable_avatar and not cfg.api.tavus_replica_id:
        errors.append("TAVUS_REPLICA_ID is required when avatar is enabled")
    
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

