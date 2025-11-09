"""
Interviewer Agent
Conducts adaptive technical interviews with AI avatar
"""

import anthropic
from typing import Dict, Any, List, Optional
import json
from datetime import datetime
from pathlib import Path
import sys

sys.path.append(str(Path(__file__).parent.parent))

from config.settings import config, DifficultyLevel, ResponseQuality
from prompts.agent_prompts import get_interviewer_prompt, RESPONSE_QUALITY_EVALUATOR_PROMPT


class InterviewerAgent:
    """
    Adaptive technical interviewer agent with real-time difficulty adjustment
    """
    
    def __init__(self, resume_analysis: str, api_key: str = None):
        self.api_key = api_key or config.api.anthropic_api_key
        self.client = anthropic.Anthropic(api_key=self.api_key)
        self.model = config.interview.claude_model
        
        # Interview state
        self.resume_analysis = resume_analysis
        self.conversation_history: List[Dict] = []
        self.transcript: List[Dict] = []
        
        # Interview metrics
        self.current_question_num = 0
        self.difficulty_level = DifficultyLevel.MEDIUM
        self.start_time = None
        self.coding_question_asked = False
        self.coding_question = None
        
        # Scoring
        self.response_scores: List[int] = []
        
    def start_interview(self) -> str:
        """
        Start the interview and get opening statement
        """
        self.start_time = datetime.now()
        self.current_question_num = 1
        
        print("🎤 Starting interview...")
        
        # Get opening statement
        system_prompt = get_interviewer_prompt(
            resume_analysis=self.resume_analysis,
            current_question=self.current_question_num,
            difficulty_level=self.difficulty_level,
            time_elapsed=0,
            questions_remaining=config.interview.warmup_questions + 
                              config.interview.core_questions +
                              config.interview.advanced_questions
        )
        
        response = self.client.messages.create(
            model=self.model,
            max_tokens=config.interview.max_tokens,
            temperature=config.interview.temperature,
            system=system_prompt,
            messages=[{
                "role": "user",
                "content": "Please start the interview with your opening statement and first question."
            }]
        )
        
        opening = response.content[0].text
        
        # Log
        self.transcript.append({
            "type": "opening",
            "timestamp": datetime.now().isoformat(),
            "interviewer": opening,
            "question_number": self.current_question_num
        })
        
        self.conversation_history.append({
            "role": "assistant",
            "content": opening
        })
        
        return opening
    
    def evaluate_response_quality(self, question: str, response: str) -> int:
        """
        Evaluate the quality of candidate's response
        
        Returns:
            Score from 0-100
        """
        prompt = RESPONSE_QUALITY_EVALUATOR_PROMPT.format(
            question=question,
            response=response
        )
        
        evaluation = self.client.messages.create(
            model=self.model,
            max_tokens=10,
            temperature=0.1,
            messages=[{
                "role": "user",
                "content": prompt
            }]
        )
        
        try:
            score = int(evaluation.content[0].text.strip())
            return max(0, min(100, score))
        except:
            return 50  # Default to middle if parsing fails
    
    def adjust_difficulty(self, response_score: int):
        """
        Adjust interview difficulty based on response quality
        """
        quality = ResponseQuality.get_category(response_score)
        
        if quality == "EXCELLENT":
            self.difficulty_level = DifficultyLevel.adjust(self.difficulty_level, 2)
        elif quality == "GOOD":
            self.difficulty_level = DifficultyLevel.adjust(self.difficulty_level, 1)
        elif quality == "RIGHT_DIRECTION":
            pass  # Maintain difficulty
        elif quality == "PARTIALLY_WRONG":
            self.difficulty_level = DifficultyLevel.adjust(self.difficulty_level, -1)
        elif quality == "WRONG":
            self.difficulty_level = DifficultyLevel.adjust(self.difficulty_level, -2)
    
    def get_next_question(self, candidate_response: str) -> Dict[str, Any]:
        """
        Get next question based on candidate's response
        
        Args:
            candidate_response: Candidate's answer to previous question
            
        Returns:
            Dictionary with next question and metadata
        """
        # Add candidate response to history
        self.conversation_history.append({
            "role": "user",
            "content": candidate_response
        })
        
        # Evaluate response quality
        if len(self.transcript) > 0:
            last_question = self.transcript[-1].get("interviewer", "")
            score = self.evaluate_response_quality(last_question, candidate_response)
            self.response_scores.append(score)
            self.adjust_difficulty(score)
        
        # Calculate time elapsed
        time_elapsed = 0
        if self.start_time:
            time_elapsed = int((datetime.now() - self.start_time).total_seconds() / 60)
        
        # Check if we should ask coding question
        should_ask_coding = (
            not self.coding_question_asked and
            self.current_question_num >= config.interview.warmup_questions + 2
        )
        
        # Update question number
        self.current_question_num += 1
        
        # Calculate remaining questions
        total_questions = (config.interview.warmup_questions + 
                          config.interview.core_questions +
                          config.interview.advanced_questions)
        questions_remaining = max(0, total_questions - self.current_question_num)
        
        # Get system prompt
        system_prompt = get_interviewer_prompt(
            resume_analysis=self.resume_analysis,
            current_question=self.current_question_num,
            difficulty_level=self.difficulty_level,
            time_elapsed=time_elapsed,
            questions_remaining=questions_remaining
        )
        
        # Add instruction for coding question if needed
        user_message = "Continue the interview with the next question."
        if should_ask_coding:
            user_message = """Now ask a coding question. State the problem clearly, specify input/output format, and tell the candidate to type their solution in the coding editor. Keep the problem description concise for voice communication."""
            self.coding_question_asked = True
        
        # Get next question
        response = self.client.messages.create(
            model=self.model,
            max_tokens=config.interview.max_tokens,
            temperature=config.interview.temperature,
            system=system_prompt,
            messages=self.conversation_history + [{
                "role": "user",
                "content": user_message
            }]
        )
        
        next_question = response.content[0].text
        
        # Add to history
        self.conversation_history.append({
            "role": "assistant",
            "content": next_question
        })
        
        # Log in transcript
        entry = {
            "type": "coding_question" if should_ask_coding else "question",
            "timestamp": datetime.now().isoformat(),
            "question_number": self.current_question_num,
            "difficulty_level": self.difficulty_level,
            "interviewer": next_question,
            "candidate": candidate_response
        }
        
        if should_ask_coding:
            self.coding_question = next_question
            entry["is_coding_question"] = True
        
        self.transcript.append(entry)
        
        return {
            "question": next_question,
            "is_coding_question": should_ask_coding,
            "question_number": self.current_question_num,
            "difficulty_level": self.difficulty_level,
            "time_elapsed": time_elapsed,
            "questions_remaining": questions_remaining
        }
    
    def end_interview(self) -> str:
        """
        End the interview gracefully
        """
        print("🏁 Ending interview...")
        
        closing = """Thank you for your time today. You did well and showed good problem-solving skills. We'll review your interview and get back to you soon. Do you have any questions for me?"""
        
        self.transcript.append({
            "type": "closing",
            "timestamp": datetime.now().isoformat(),
            "interviewer": closing
        })
        
        return closing
    
    def get_transcript(self) -> List[Dict]:
        """Get complete interview transcript"""
        return self.transcript
    
    def get_average_score(self) -> float:
        """Get average response score"""
        if not self.response_scores:
            return 0.0
        return sum(self.response_scores) / len(self.response_scores)
    
    def save_transcript(self, session_id: str) -> Path:
        """
        Save interview transcript to file
        
        Args:
            session_id: Session identifier
            
        Returns:
            Path to transcript file
        """
        session_dir = config.logs_dir / session_id
        session_dir.mkdir(exist_ok=True)
        
        # Save as formatted text
        transcript_file = session_dir / "interview_transcript.txt"
        with open(transcript_file, 'w', encoding='utf-8') as f:
            f.write("="*80 + "\n")
            f.write("INTERVIEW TRANSCRIPT\n")
            f.write("="*80 + "\n\n")
            
            for entry in self.transcript:
                f.write(f"\n[{entry['timestamp']}] ")
                if entry['type'] == 'opening':
                    f.write("OPENING\n")
                    f.write(f"Interviewer: {entry['interviewer']}\n")
                elif entry['type'] == 'closing':
                    f.write("CLOSING\n")
                    f.write(f"Interviewer: {entry['interviewer']}\n")
                else:
                    f.write(f"Q{entry['question_number']} (Difficulty: {entry['difficulty_level']})\n")
                    f.write(f"Interviewer: {entry['interviewer']}\n")
                    if 'candidate' in entry:
                        f.write(f"Candidate: {entry['candidate']}\n")
        
        # Save as JSON
        json_file = session_dir / "interview_transcript.json"
        with open(json_file, 'w', encoding='utf-8') as f:
            json.dump({
                "transcript": self.transcript,
                "average_score": self.get_average_score(),
                "total_questions": self.current_question_num,
                "response_scores": self.response_scores
            }, f, indent=2)
        
        print(f"📁 Transcript saved to: {transcript_file}")
        
        return transcript_file


# Example usage
if __name__ == "__main__":
    sample_analysis = """
    Candidate Profile: 5 years Python experience, strong in backend development.
    Key strengths: API development, cloud infrastructure
    Areas to probe: System design, scalability, debugging
    """
    
    agent = InterviewerAgent(sample_analysis)
    
    # Start interview
    opening = agent.start_interview()
    print("\nINTERVIEWER:", opening)
    
    # Simulate responses
    responses = [
        "I have worked with Django and FastAPI for 3 years...",
        "A RESTful API uses HTTP methods like GET, POST...",
        "I would use caching and database indexing..."
    ]
    
    for response in responses:
        print(f"\nCANDIDATE: {response}")
        next_q = agent.get_next_question(response)
        print(f"\nINTERVIEWER: {next_q['question']}")
    
    # End interview
    closing = agent.end_interview()
    print(f"\nINTERVIEWER: {closing}")
