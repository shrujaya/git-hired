"""
Interviewer Agent
Conducts adaptive technical interviews with AI avatar
"""

import anthropic
from typing import Dict, Any, List, Optional
import json
import threading
from datetime import datetime
from pathlib import Path
import sys

sys.path.append(str(Path(__file__).parent.parent))

from config.settings import config, DifficultyLevel, ResponseQuality
from prompts.agent_prompts import get_interviewer_prompt, RESPONSE_QUALITY_EVALUATOR_PROMPT
from agents.response_utils import first_text


class InterviewerAgent:
    """
    Adaptive technical interviewer agent with real-time difficulty adjustment
    """
    
    def __init__(self, resume_analysis: str, api_key: str = None, candidate_first_name: str = ""):
        self.api_key = api_key or config.api.anthropic_api_key
        self.client = anthropic.Anthropic(api_key=self.api_key)
        self.model = config.interview.claude_model
        
        # Interview state
        self.resume_analysis = resume_analysis
        self.candidate_first_name = candidate_first_name
        self.conversation_history: List[Dict] = []
        self.transcript: List[Dict] = []
        
        # Interview metrics
        self.current_question_num = 0
        self.difficulty_level = DifficultyLevel.MEDIUM
        self.start_time = None
        self.coding_question_asked = False
        self.coding_question = None
        # Set once the closing line has been delivered.
        self.interview_complete = False

        # Scripted opening: greeting -> ask for an introduction -> first
        # question. Advances one beat per candidate turn.
        self.opening_stage = "awaiting_ack"

        # Coding round. While this is open the candidate's spoken turns are
        # explanations of their solution, not answers to a new question, so
        # they are assessed and hinted on instead of advancing the interview.
        self.coding_round_active = False
        self.submitted_code: Optional[str] = None
        self.coding_hints_given = 0
        self.coding_prompts_given = 0
        self.coding_assessments: List[Dict] = []
        self.coding_solved = False
        self.coding_score: Optional[int] = None
        # Spoken on the way out of the coding round, ahead of the next question.
        self.coding_closing_remark: Optional[str] = None
        # Set when code is submitted; only needed to file the evaluation.
        self.session_id: Optional[str] = None
        self._code_evaluator = None

        # Scoring
        self.response_scores: List[int] = []
        
    def start_interview(self) -> str:
        """
        Start the interview and get opening statement
        """
        self.start_time = datetime.now()
        # The greeting is not a question, so the counter stays at zero until
        # the interview proper begins - the candidate still gets the full set.
        self.current_question_num = 0
        self.opening_stage = "awaiting_ack"

        print("🎤 Starting interview...")
        
        # Get opening statement
        system_prompt = get_interviewer_prompt(
            resume_analysis=self.resume_analysis,
            current_question=self.current_question_num,
            difficulty_level=self.difficulty_level,
            time_elapsed=0,
            questions_remaining=config.interview.warmup_questions + 
                              config.interview.core_questions +
                              config.interview.advanced_questions,
            candidate_first_name=self.candidate_first_name
        )
        
        # The opening is spoken aloud before the candidate can say anything, so
        # a long one is a monologue they have to sit through. Same tight budget
        # as every other turn.
        response = self.client.messages.create(
            model=self.model,
            max_tokens=config.interview.reply_max_tokens,
            output_config={"effort": config.interview.reply_effort},
            system=system_prompt,
            messages=[{
                "role": "user",
                "content": (
                    "Open the interview with a greeting only. Greet them by "
                    "first name, say you're glad they could make it, and ask "
                    "how they are doing. One or two sentences, spoken aloud. "
                    "Do not ask an interview question, do not ask them to "
                    "introduce themselves yet, and do not describe the format."
                )
            }]
        )
        
        opening = first_text(response)
        
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
        
        # Thinking is disabled here: this call wants a bare number, and with
        # adaptive thinking on (the Sonnet 5 default) the small max_tokens budget
        # would be spent thinking, leaving no score text to parse.
        evaluation = self.client.messages.create(
            model=self.model,
            max_tokens=16,
            thinking={"type": "disabled"},
            messages=[{
                "role": "user",
                "content": prompt
            }]
        )
        
        try:
            score = int(first_text(evaluation).strip())
            return max(0, min(100, score))
        except:
            return 50  # Default to middle if parsing fails
    
    def _score_in_background(self, question: str, response: str):
        """Score an answer off the critical path and apply it when it lands."""
        def run():
            try:
                score = self.evaluate_response_quality(question, response)
            except Exception as e:
                print(f"Response scoring failed: {e}")
                return
            # Appended from a worker thread; both operations are single
            # bytecode-level mutations of interpreter-owned objects, and the
            # only reader is the next question's prompt, so no lock is needed.
            self.response_scores.append(score)
            self.adjust_difficulty(score)

        threading.Thread(target=run, daemon=True).start()

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
    
    @property
    def code_evaluator(self):
        """
        Lazily built so an interview that never reaches the coding question
        does not construct a second Anthropic client.
        """
        if self._code_evaluator is None:
            from agents.code_evaluator import CodeEvaluatorAgent
            self._code_evaluator = CodeEvaluatorAgent(api_key=self.api_key)
        return self._code_evaluator

    def _evaluate_code_in_background(self, session_id: Optional[str] = None):
        """
        Run the full scoring rubric on the final solution.

        Kept off the critical path for the same reason response scoring is:
        it only feeds the end-of-interview report, and the candidate is
        waiting to hear the next question. Runs once, when the coding round
        closes, against whatever code was last submitted.
        """
        code = self.submitted_code
        question = self.coding_question or ""
        if not code:
            return

        def run():
            try:
                result = self.code_evaluator.evaluate_code(
                    coding_question=question,
                    candidate_code=code
                )
                self.coding_score = result["evaluation"]["score"]
                if session_id:
                    self.code_evaluator.save_evaluation(result, session_id)
            except Exception as e:
                print(f"Code evaluation failed: {e}")

        threading.Thread(target=run, daemon=True).start()

    def record_code_submission(self, code: str, session_id: Optional[str] = None):
        """
        Record the candidate's current solution.

        Submitting does not itself produce a reply - the candidate explains
        their logic out loud next, and that spoken turn is what gets assessed.
        Resubmitting after a hint simply replaces the code.
        """
        self.submitted_code = code
        if session_id:
            self.session_id = session_id
        print(f"📥 Code submission recorded ({len(code)} chars)")

    def _non_question_turn(self, spoken: str, **flags) -> Dict[str, Any]:
        """
        Shape a turn that is conversation rather than assessment - an opening
        beat or a coding hint - so callers need no special case. The question
        number deliberately does not advance: none of these is a new question.
        """
        self.conversation_history.append({"role": "assistant", "content": spoken})
        return {
            "question": spoken,
            "is_coding_question": False,
            "is_final": False,
            "question_number": self.current_question_num,
            "difficulty_level": self.difficulty_level,
            "time_elapsed": self._minutes_elapsed(),
            "questions_remaining": self._questions_remaining(),
            **flags,
        }

    def _coding_turn_result(self, spoken: str) -> Dict[str, Any]:
        return self._non_question_turn(spoken, is_coding_hint=True)

    def _handle_opening_turn(self, candidate_response: str) -> Optional[Dict[str, Any]]:
        """
        Walk the scripted opening: the greeting has been spoken, so this turn
        is either the candidate's reply to it (ask them to introduce
        themselves) or their introduction (start the interview).

        Returns a reply while the warm-up is still running, or None once the
        interview proper should begin.

        Args:
            candidate_response: What the candidate just said
        """
        if self.opening_stage == "awaiting_ack":
            system_prompt = get_interviewer_prompt(
                resume_analysis=self.resume_analysis,
                current_question=self.current_question_num,
                difficulty_level=self.difficulty_level,
                time_elapsed=self._minutes_elapsed(),
                questions_remaining=self._questions_remaining(),
                candidate_first_name=self.candidate_first_name,
            )
            response = self.client.messages.create(
                model=self.model,
                max_tokens=config.interview.reply_max_tokens,
                output_config={"effort": config.interview.reply_effort},
                system=system_prompt,
                messages=self.conversation_history + [{
                    "role": "user",
                    "content": (
                        "They have just replied to your greeting. Acknowledge "
                        "that in a few words and ask them to introduce "
                        "themselves. One or two sentences, spoken aloud. Do "
                        "not ask an interview question yet."
                    )
                }]
            )
            line = first_text(response)

            self.opening_stage = "awaiting_intro"
            self.transcript.append({
                "type": "opening_intro_request",
                "timestamp": datetime.now().isoformat(),
                "interviewer": line,
                "candidate": candidate_response,
            })
            print("👋 Asked the candidate to introduce themselves")
            return self._non_question_turn(line, is_opening=True)

        # That was their introduction - the interview proper starts now.
        self.opening_stage = "done"
        return None

    def _handle_coding_turn(self, candidate_response: str) -> Optional[Dict[str, Any]]:
        """
        Handle a spoken turn while the coding question is open.

        Returns a reply to send when the candidate should stay on the problem,
        or None when the round is finished and the interview should move on -
        in which case self.coding_closing_remark holds the line to say first.

        Args:
            candidate_response: The candidate explaining their logic

        Returns:
            A turn dict to return to the caller, or None to proceed
        """
        max_hints = config.interview.coding_max_hints

        # Nothing to assess yet. Hold the floor with a nudge rather than
        # advancing, or the coding question gets skipped by a candidate who
        # starts talking before they submit. Capped so it cannot loop forever.
        if not self.submitted_code:
            if self.coding_prompts_given >= max_hints:
                self.coding_round_active = False
                self.coding_closing_remark = (
                    "No problem, let's leave that one there and keep going."
                )
                return None

            self.coding_prompts_given += 1
            return self._coding_turn_result(
                "Take your time - put your solution in the editor and hit submit, "
                "then talk me through your thinking."
            )

        assessment = self.code_evaluator.assess_attempt(
            coding_question=self.coding_question or "",
            candidate_code=self.submitted_code,
            explanation=candidate_response,
            hints_given=self.coding_hints_given,
            hints_remaining=max(0, max_hints - self.coding_hints_given),
            candidate_first_name=self.candidate_first_name or "there",
        )

        self.coding_assessments.append({
            "timestamp": datetime.now().isoformat(),
            "hints_given": self.coding_hints_given,
            "is_correct": assessment["is_correct"],
            "assessment": assessment.get("assessment", ""),
            "explanation": candidate_response,
            "code": self.submitted_code,
        })

        # Correct, or out of hints: either way the interview moves on. The
        # difference is only in what gets said on the way out, which the
        # assessment already wrote.
        if assessment["is_correct"] or self.coding_hints_given >= max_hints:
            self.coding_round_active = False
            self.coding_solved = bool(assessment["is_correct"])
            self.coding_closing_remark = assessment["spoken_response"]
            self._evaluate_code_in_background(self.session_id)
            return None

        self.coding_hints_given += 1
        self.transcript.append({
            "type": "coding_hint",
            "timestamp": datetime.now().isoformat(),
            "question_number": self.current_question_num,
            "hint_number": self.coding_hints_given,
            "interviewer": assessment["spoken_response"],
            "candidate": candidate_response,
        })
        return self._coding_turn_result(assessment["spoken_response"])

    def _minutes_elapsed(self) -> int:
        if not self.start_time:
            return 0
        return int((datetime.now() - self.start_time).total_seconds() / 60)

    def _questions_remaining(self) -> int:
        total_questions = (config.interview.warmup_questions +
                           config.interview.core_questions +
                           config.interview.advanced_questions)
        return max(0, total_questions - self.current_question_num)

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

        # The scripted opening runs before any assessment: this turn is either
        # a reply to the greeting or an introduction, neither of which is an
        # answer to a question.
        opening_beat = False
        if self.opening_stage != "done":
            opening_turn = self._handle_opening_turn(candidate_response)
            if opening_turn is not None:
                return opening_turn
            opening_beat = True

        # While the coding question is open this turn is the candidate
        # explaining their solution, not answering a new question. Assess it
        # and either hint or fall through to move the interview on.
        if self.coding_round_active:
            coding_turn = self._handle_coding_turn(candidate_response)
            if coding_turn is not None:
                return coding_turn

        # Evaluate response quality.
        #
        # Scored in the background: this is a second Claude round trip, and
        # running it inline doubled the silence the candidate hears before the
        # interviewer speaks. The score only feeds difficulty for *later*
        # questions, so it does not have to land before this one is asked - it
        # is applied as soon as it arrives.
        # An introduction is not an answer to a technical question. Scoring it
        # would drag the difficulty down before the interview has started.
        if not opening_beat and len(self.transcript) > 0:
            last_question = self.transcript[-1].get("interviewer", "")
            self._score_in_background(last_question, candidate_response)


        # Calculate time elapsed
        time_elapsed = 0
        if self.start_time:
            time_elapsed = int((datetime.now() - self.start_time).total_seconds() / 60)
        
        total_questions = (config.interview.warmup_questions +
                          config.interview.core_questions +
                          config.interview.advanced_questions)

        # Every planned question has been asked, so this turn closes the
        # interview out instead of adding another one. Checked before the
        # counter moves: the interview previously ran past its own budget
        # because nothing ever compared the two.
        is_final = self.current_question_num >= total_questions

        # Check if we should ask coding question
        should_ask_coding = (
            not is_final and
            not self.coding_question_asked and
            self.current_question_num >= config.interview.warmup_questions + 2
        )

        # A closing is not a question, so it does not advance the count.
        if not is_final:
            self.current_question_num += 1

        questions_remaining = max(0, total_questions - self.current_question_num)

        # Get system prompt
        system_prompt = get_interviewer_prompt(
            resume_analysis=self.resume_analysis,
            current_question=self.current_question_num,
            difficulty_level=self.difficulty_level,
            time_elapsed=time_elapsed,
            questions_remaining=questions_remaining,
            candidate_first_name=self.candidate_first_name
        )
        
        # Add instruction for coding question if needed
        user_message = "Continue the interview with the next question."
        if is_final:
            user_message = (
                "That was the final question - the interview is now over. "
                "Close it out: thank the candidate by name, tell them plainly "
                "that this is the end of the interview and someone will follow "
                "up with next steps, and invite any last questions. Two or "
                "three sentences, spoken aloud. Do not ask another interview "
                "question and do not start a new topic."
            )
            self.interview_complete = True
        elif should_ask_coding:
            user_message = """Now ask a coding question. State the problem clearly, specify input/output format, and tell the candidate to type their solution in the coding editor. Keep the problem description concise for voice communication."""
            self.coding_question_asked = True
            self.coding_round_active = True
        elif opening_beat:
            user_message = (
                "They have just introduced themselves. Acknowledge it in a few "
                "words, then ask your first interview question - pick up on "
                "something they mentioned or something specific from their "
                "resume."
            )
        elif self.coding_closing_remark:
            # The coding round just closed. Its parting line is prepended
            # verbatim below, so the question itself must not comment on the
            # solution again or the candidate hears it acknowledged twice.
            user_message = (
                "The candidate has finished the coding exercise and you have "
                "already responded to their solution. Do not mention it again "
                "or refer back to it - simply ask the next interview question."
            )

        # Get next question.
        #
        # This call is on the critical path of a live conversation: the
        # candidate is sitting in silence until it returns. Two settings keep
        # it fast. A spoken turn is 2-4 sentences, so the 8192-token budget
        # used for reports is wasted headroom - and adaptive thinking expands
        # to fill whatever it is given. "low" effort is the documented setting
        # for short, scoped, latency-sensitive work.
        response = self.client.messages.create(
            model=self.model,
            max_tokens=config.interview.reply_max_tokens,
            output_config={"effort": config.interview.reply_effort},
            system=system_prompt,
            messages=self.conversation_history + [{
                "role": "user",
                "content": user_message
            }]
        )
        
        next_question = first_text(response)

        # Lead with the coding round's parting line so the acknowledgement and
        # the next question arrive as one spoken turn - a bare acknowledgement
        # on its own would cost the candidate an extra round of silence.
        if self.coding_closing_remark:
            next_question = f"{self.coding_closing_remark.rstrip()} {next_question}"
            self.coding_closing_remark = None

        # Add to history
        self.conversation_history.append({
            "role": "assistant",
            "content": next_question
        })

        # Log in transcript
        entry = {
            "type": "closing" if is_final
            else "coding_question" if should_ask_coding
            else "question",
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
            "is_final": is_final,
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
