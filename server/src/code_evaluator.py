#!/usr/bin/env python3
"""
Code Evaluation Agent for Technical Interviews
Uses Claude to evaluate pseudocode/code submissions during interviews
"""

import anthropic
import os
from typing import Dict, Optional
from pydantic import BaseModel

from dotenv import load_dotenv
load_dotenv()


class CodeEvaluationResult(BaseModel):
    """Result of code evaluation"""
    score: float  # 0-100
    correctness: str  # "Correct", "Mostly Correct", "Partially Correct", "Incorrect"
    logic_score: float  # 0-100
    time_complexity: Optional[str]
    space_complexity: Optional[str]
    strengths: list[str]
    weaknesses: list[str]
    suggestions: list[str]
    overall_feedback: str


class CodeEvaluationAgent:
    """Agent that evaluates code submissions using Claude"""
    
    def __init__(self, api_key: str = None):
        self.api_key = api_key or os.environ.get('ANTHROPIC_API_KEY')
        if not self.api_key:
            raise ValueError("ANTHROPIC_API_KEY required")
        
        self.client = anthropic.Anthropic(api_key=self.api_key)
    
    def create_evaluation_prompt(self) -> str:
        """Create the system prompt for code evaluation"""
        return """
        You are an expert technical interviewer and code evaluator. Your job is to evaluate code/pseudocode submissions from candidates during technical interviews.

        ## Evaluation Criteria

        ### 1. LOGIC CORRECTNESS (60% weight)
        - Does the solution solve the problem correctly?
        - Are edge cases handled?
        - Is the algorithm fundamentally sound?
        - **Ignore minor syntax errors** - focus on logic

        ### 2. TIME COMPLEXITY (20% weight)
        - Is the time complexity optimal or acceptable?
        - Did they choose an efficient approach?

        ### 3. SPACE COMPLEXITY (10% weight)
        - Is memory usage reasonable?
        - Are there unnecessary space allocations?

        ### 4. CODE QUALITY (10% weight)
        - Is the code readable and well-structured?
        - Are variable names meaningful?
        - Is the approach clean and maintainable?

        ## Important Rules

        ✅ **DO:**
        - Accept any programming language or pseudocode
        - Forgive minor syntax errors (missing semicolons, brackets, etc.)
        - Focus on algorithmic correctness
        - Be lenient with language-specific details
        - Consider the candidate's thought process
        - Give credit for partially correct solutions

        ❌ **DON'T:**
        - Penalize for syntax errors unless they indicate misunderstanding
        - Expect perfect code - this is an interview setting
        - Be overly strict on formatting or style
        - Fail solutions that are slightly suboptimal but correct

        ## Scoring Scale

        **90-100: Excellent**
        - Correct logic with optimal complexity
        - Handles all edge cases
        - Clean, readable code

        **70-89: Good**
        - Correct logic, maybe suboptimal complexity
        - Handles most edge cases
        - Generally sound approach

        **50-69: Acceptable**
        - Mostly correct with some logical issues
        - Missing some edge cases
        - Works for common cases

        **30-49: Needs Improvement**
        - Partially correct logic
        - Significant edge cases missed
        - Inefficient approach

        **0-29: Incorrect**
        - Fundamentally flawed logic
        - Doesn't solve the problem
        - Major misunderstanding

        ## Output Format

        You MUST respond with ONLY valid JSON in this exact format:

        {
            "score": 85.0,
            "correctness": "Mostly Correct",
            "logic_score": 90.0,
            "time_complexity": "O(n log n)",
            "space_complexity": "O(n)",
            "strengths": [
                "Correct sorting approach",
                "Handles empty array edge case",
                "Good variable naming"
            ],
            "weaknesses": [
                "Could be optimized to O(n) with hash map",
                "Doesn't handle negative numbers explicitly"
            ],
            "suggestions": [
                "Consider using a hash map for O(n) solution",
                "Add explicit check for negative inputs",
                "Could add more comments for clarity"
            ],
            "overall_feedback": "Solid solution with correct logic. The sorting approach works well and handles most cases. Could be more optimal with a hash map approach, but this is acceptable for an interview setting."
        }

        CRITICAL: Your response must be ONLY the JSON object, nothing else. No markdown, no code blocks, no explanations outside the JSON.
        """

    def evaluate_code(
        self,
        question: str,
        code_submission: str,
        expected_approach: Optional[str] = None
    ) -> CodeEvaluationResult:
        """
        Evaluate a code submission for a given question
        
        Args:
            question: The coding question that was asked
            code_submission: The candidate's code/pseudocode
            expected_approach: Optional description of expected solution approach
        
        Returns:
            CodeEvaluationResult with scores and feedback
        """
        
        # Build the evaluation request
        evaluation_request = f"""
        Please evaluate the following code submission:

        **QUESTION:**
        {question}

        **CANDIDATE'S CODE:**
        ```
        {code_submission}
        ```
        """
        if expected_approach:
            evaluation_request += f"""**EXPECTED APPROACH:**{expected_approach}"""
        evaluation_request += """
        Evaluate this code based on logic correctness, efficiency, and code quality.
        Remember to be lenient with syntax errors and focus on the algorithmic approach.
        Respond with ONLY the JSON evaluation object, nothing else.
        """
        
        # Call Claude API
        try:
            response = self.client.messages.create(
                model="claude-sonnet-4-5-20250929",
                max_tokens=2000,
                system=self.create_evaluation_prompt(),
                messages=[
                    {
                        "role": "user",
                        "content": evaluation_request
                    }
                ]
            )
            
            # Extract and parse JSON response
            response_text = response.content[0].text.strip()
            
            # Remove markdown code blocks if present
            if response_text.startswith("```"):
                response_text = response_text.split("```")[1]
                if response_text.startswith("json"):
                    response_text = response_text[4:]
                response_text = response_text.strip()
            
            # Parse JSON
            import json
            result_dict = json.loads(response_text)
            
            # Create and return result object
            return CodeEvaluationResult(**result_dict)
            
        except Exception as e:
            raise Exception(f"Evaluation failed: {str(e)}")
    
    def get_grade(self, score: float) -> str:
        """Convert numeric score to letter grade"""
        if score >= 90:
            return "A (Excellent)"
        elif score >= 80:
            return "B+ (Very Good)"
        elif score >= 70:
            return "B (Good)"
        elif score >= 60:
            return "C+ (Acceptable)"
        elif score >= 50:
            return "C (Passing)"
        elif score >= 40:
            return "D (Needs Improvement)"
        else:
            return "F (Failing)"


def main():
    """Example usage"""
    
    # Initialize agent
    agent = CodeEvaluationAgent()
    
    # Example 1: Two Sum Problem
    print("=" * 80)
    print("EXAMPLE 1: Two Sum Problem")
    print("=" * 80)
    
    question1 = """
    Given an array of integers nums and an integer target, return indices of the 
    two numbers such that they add up to target. You may assume that each input 
    would have exactly one solution, and you may not use the same element twice.

    Example:
    Input: nums = [2,7,11,15], target = 9
    Output: [0,1]
    """
    
    code1 = """
    def two_sum(nums, target):
        # Use hash map for O(n) solution
        seen = {}
        
        for i in range(len(nums)):
            complement = target - nums[i]
            
            if complement in seen:
                return [seen[complement], i]
            
            seen[nums[i]] = i
        
        return []  # No solution found
    """
    
    result1 = agent.evaluate_code(
        question=question1,
        code_submission=code1,
        expected_approach="Use a hash map to store seen numbers and their indices. For each number, check if its complement exists in the hash map."
    )
    
    print(f"\nScore: {result1.score}/100")
    print(f"Grade: {agent.get_grade(result1.score)}")
    print(f"Correctness: {result1.correctness}")
    print(f"Logic Score: {result1.logic_score}/100")
    print(f"Time Complexity: {result1.time_complexity}")
    print(f"Space Complexity: {result1.space_complexity}")
    
    print("\nStrengths:")
    for strength in result1.strengths:
        print(f"  ✓ {strength}")
    
    print("\nWeaknesses:")
    for weakness in result1.weaknesses:
        print(f"  ⚠ {weakness}")
    
    print("\nSuggestions:")
    for suggestion in result1.suggestions:
        print(f"  💡 {suggestion}")
    
    print(f"\nOverall Feedback:\n{result1.overall_feedback}")
    
    # Example 2: Suboptimal Solution
    print("\n" + "=" * 80)
    print("EXAMPLE 2: Two Sum with Suboptimal Approach")
    print("=" * 80)
    
    code2 = """
    function twoSum(nums, target) {
        // Brute force approach
        for (let i = 0; i < nums.length; i++) {
            for (let j = i + 1; j < nums.length; j++) {
                if (nums[i] + nums[j] == target) {
                    return [i, j]
                }
            }
        }
        return []
    }
    """
    
    result2 = agent.evaluate_code(
        question=question1,
        code_submission=code2,
        expected_approach="Use a hash map for O(n) solution"
    )
    
    print(f"\nScore: {result2.score}/100")
    print(f"Grade: {agent.get_grade(result2.score)}")
    print(f"Correctness: {result2.correctness}")
    print(f"Time Complexity: {result2.time_complexity}")
    print(f"\nOverall Feedback:\n{result2.overall_feedback}")
    
    # Example 3: Pseudocode with minor syntax issues
    print("\n" + "=" * 80)
    print("EXAMPLE 3: Reverse Linked List (Pseudocode)")
    print("=" * 80)
    
    question3 = """
    Given the head of a singly linked list, reverse the list and return the reversed list.

    Example:
    Input: head = [1,2,3,4,5]
    Output: [5,4,3,2,1]
    """
    
    code3 = """
    FUNCTION reverseList(head):
        prev = null
        current = head
        
        WHILE current is not null:
            next_node = current.next  // save next
            current.next = prev       // reverse link
            
            prev = current            // move prev forward
            current = next_node       // move current forward
        
        RETURN prev  // new head
    END FUNCTION
    """
    
    result3 = agent.evaluate_code(
        question=question3,
        code_submission=code3,
        expected_approach="Use three pointers (prev, current, next) to reverse links iteratively"
    )
    
    print(f"\nScore: {result3.score}/100")
    print(f"Grade: {agent.get_grade(result3.score)}")
    print(f"Correctness: {result3.correctness}")
    print(f"Time Complexity: {result3.time_complexity}")
    print(f"\nOverall Feedback:\n{result3.overall_feedback}")

if __name__ == "__main__":
    main()