"""
Code Evaluator Agent
Evaluates candidate's coding solutions focusing on logic over syntax
"""

import anthropic
from typing import Dict, Any
import json
from pathlib import Path
import sys

sys.path.append(str(Path(__file__).parent.parent))

from config.settings import config
from prompts.agent_prompts import (
    get_code_evaluator_prompt,
    get_coding_assessment_prompt,
)
from agents.response_utils import first_text


class CodeEvaluatorAgent:
    """
    Agent responsible for evaluating coding solutions
    Focuses on logic and approach rather than syntax
    """
    
    def __init__(self, api_key: str = None):
        self.api_key = api_key or config.api.anthropic_api_key
        self.client = anthropic.Anthropic(api_key=self.api_key)
        self.model = config.interview.claude_model
        
    def evaluate_code(
        self,
        coding_question: str,
        candidate_code: str
    ) -> Dict[str, Any]:
        """
        Evaluate candidate's code solution
        
        Args:
            coding_question: The coding problem asked
            candidate_code: Candidate's solution (code or pseudocode)
            
        Returns:
            Dictionary with evaluation results
        """
        print("💻 Evaluating code solution...")
        
        # Get evaluation prompt
        prompt = get_code_evaluator_prompt(coding_question, candidate_code)
        
        # Call Claude for evaluation
        response = self.client.messages.create(
            model=self.model,
            max_tokens=4096,
            messages=[{
                "role": "user",
                "content": prompt
            }]
        )
        
        evaluation_text = first_text(response)
        
        # Parse JSON response
        try:
            # Extract JSON from response (might be wrapped in markdown)
            if "```json" in evaluation_text:
                json_start = evaluation_text.find("```json") + 7
                json_end = evaluation_text.find("```", json_start)
                json_text = evaluation_text[json_start:json_end].strip()
            elif "```" in evaluation_text:
                json_start = evaluation_text.find("```") + 3
                json_end = evaluation_text.find("```", json_start)
                json_text = evaluation_text[json_start:json_end].strip()
            else:
                json_text = evaluation_text
            
            evaluation = json.loads(json_text)
            
        except json.JSONDecodeError as e:
            print(f"⚠️  Warning: Could not parse JSON response: {e}")
            # Fallback evaluation
            evaluation = {
                "score": 5,
                "correctness_score": 20,
                "approach_score": 15,
                "quality_score": 10,
                "completeness_score": 5,
                "strengths": ["Attempted solution"],
                "weaknesses": ["Could not fully evaluate"],
                "summary": "Code evaluation encountered parsing issues.",
                "feedback": "Please review the solution manually."
            }
        
        print(f"✅ Code evaluation complete! Score: {evaluation['score']}/10")
        
        return {
            "evaluation": evaluation,
            "raw_response": evaluation_text,
            "coding_question": coding_question,
            "candidate_code": candidate_code,
            "model_used": self.model
        }
    
    def assess_attempt(
        self,
        coding_question: str,
        candidate_code: str,
        explanation: str,
        hints_given: int,
        hints_remaining: int,
        candidate_first_name: str = "there",
        is_last_chance: bool = False
    ) -> Dict[str, Any]:
        """
        Judge one attempt at the coding question, mid-interview.

        Unlike evaluate_code, this runs while the candidate is waiting to hear
        a reply, so it answers only what the conversation needs: is the attempt
        correct, and what does the interviewer say next. One round trip returns
        both - asking for the verdict and then generating a line separately
        would double the silence the candidate sits through.

        Args:
            coding_question: The problem that was posed
            candidate_code: Whatever is currently in the editor
            explanation: How the candidate described their logic out loud
            hints_given: Hints already offered for this problem
            hints_remaining: Hints still available *after* this one
            is_last_chance: No hints left - close the exercise instead
            candidate_first_name: Used to address the candidate naturally

        Returns:
            Dictionary with is_correct, spoken_response and assessment
        """
        prompt = get_coding_assessment_prompt(
            coding_question=coding_question,
            candidate_code=candidate_code,
            explanation=explanation,
            hints_given=hints_given,
            hints_remaining=hints_remaining,
            candidate_first_name=candidate_first_name,
            is_last_chance=is_last_chance
        )

        # Structured output so the verdict is a real boolean rather than
        # something scraped out of prose - the hint loop branches on it.
        response = self.client.messages.create(
            model=self.model,
            max_tokens=config.interview.reply_max_tokens,
            output_config={
                "effort": config.interview.reply_effort,
                "format": {
                    "type": "json_schema",
                    "schema": {
                        "type": "object",
                        "properties": {
                            "is_correct": {
                                "type": "boolean",
                                "description": "True if the approach is sound and would solve the problem, judging logic over syntax."
                            },
                            "spoken_response": {
                                "type": "string",
                                "description": "What the interviewer says next, aloud: a brief acknowledgement if correct, otherwise a hint that nudges without giving the answer."
                            },
                            "assessment": {
                                "type": "string",
                                "description": "One short private note on the attempt, for the transcript and report. Never spoken."
                            },
                        },
                        "required": ["is_correct", "spoken_response", "assessment"],
                        "additionalProperties": False,
                    },
                }
            },
            messages=[{"role": "user", "content": prompt}]
        )

        try:
            result = json.loads(first_text(response))
        except (json.JSONDecodeError, ValueError) as e:
            # Never strand the candidate in silence over a parsing problem.
            # Treating an unreadable assessment as "correct" moves the
            # interview on rather than hinting at something we cannot judge.
            print(f"⚠️  Could not parse coding assessment: {e}")
            return {
                "is_correct": True,
                "spoken_response": "Thanks for walking me through that.",
                "assessment": "Assessment unavailable - response could not be parsed.",
                "parse_failed": True,
            }

        verdict = "correct" if result["is_correct"] else f"needs work (hint {hints_given + 1})"
        print(f"💡 Coding attempt assessed: {verdict}")

        return result

    def save_evaluation(
        self,
        evaluation_result: Dict[str, Any],
        session_id: str
    ) -> Path:
        """
        Save code evaluation results to file
        
        Args:
            evaluation_result: Evaluation results
            session_id: Session identifier
            
        Returns:
            Path to saved file
        """
        session_dir = config.logs_dir / session_id
        session_dir.mkdir(parents=True, exist_ok=True)
        
        # Save as formatted text
        eval_file = session_dir / "code_evaluation.txt"
        eval_data = evaluation_result["evaluation"]
        
        with open(eval_file, 'w', encoding='utf-8') as f:
            f.write("="*80 + "\n")
            f.write("CODE EVALUATION REPORT\n")
            f.write("="*80 + "\n\n")
            
            f.write(f"Overall Score: {eval_data['score']}/10\n\n")
            
            f.write("DETAILED SCORES:\n")
            f.write(f"  Correctness: {eval_data['correctness_score']}/40\n")
            f.write(f"  Approach: {eval_data['approach_score']}/30\n")
            f.write(f"  Quality: {eval_data['quality_score']}/20\n")
            f.write(f"  Completeness: {eval_data['completeness_score']}/10\n\n")
            
            f.write("STRENGTHS:\n")
            for strength in eval_data['strengths']:
                f.write(f"  • {strength}\n")
            f.write("\n")
            
            f.write("AREAS FOR IMPROVEMENT:\n")
            for weakness in eval_data['weaknesses']:
                f.write(f"  • {weakness}\n")
            f.write("\n")
            
            f.write("SUMMARY:\n")
            f.write(f"{eval_data['summary']}\n\n")
            
            f.write("FEEDBACK:\n")
            f.write(f"{eval_data['feedback']}\n\n")
            
            f.write("="*80 + "\n")
            f.write("CODING QUESTION:\n")
            f.write("="*80 + "\n\n")
            f.write(evaluation_result['coding_question'] + "\n\n")
            
            f.write("="*80 + "\n")
            f.write("CANDIDATE'S SOLUTION:\n")
            f.write("="*80 + "\n\n")
            f.write(evaluation_result['candidate_code'] + "\n")
        
        # Save as JSON
        json_file = session_dir / "code_evaluation.json"
        with open(json_file, 'w', encoding='utf-8') as f:
            json.dump(evaluation_result, f, indent=2)
        
        print(f"📁 Code evaluation saved to: {eval_file}")
        
        return eval_file
    
    def get_score_for_report(self, evaluation_result: Dict[str, Any]) -> int:
        """
        Extract the final score from evaluation for reporting
        
        Args:
            evaluation_result: Evaluation results
            
        Returns:
            Score out of 10
        """
        return evaluation_result["evaluation"]["score"]


# Example usage
if __name__ == "__main__":
    agent = CodeEvaluatorAgent()
    
    sample_question = """
    Write a function to find the two numbers in an array that sum up to a target value.
    Input: array of integers, target integer
    Output: indices of the two numbers
    """
    
    sample_code = """
    def two_sum(nums, target):
        # Use a hash map for O(n) solution
        seen = {}
        for i, num in enumerate(nums):
            complement = target - num
            if complement in seen:
                return [seen[complement], i]
            seen[num] = i
        return None
    """
    
    result = agent.evaluate_code(sample_question, sample_code)
    
    print("\n" + "="*80)
    print("EVALUATION RESULT:")
    print("="*80)
    print(json.dumps(result["evaluation"], indent=2))
