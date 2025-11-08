import anthropic
import base64
import os
from pathlib import Path

from dotenv import load_dotenv
load_dotenv()

class Interviewer:
    def __init__(self, api_key):
        self.client = anthropic.Anthropic(api_key=api_key)
        self.conversation_history = []
        self.difficulty = "medium"
        self.question_count = 0
        
    def load_pdf_as_base64(self, pdf_path):
        with open(pdf_path, 'rb') as f:
            return base64.b64encode(f.read()).decode('utf-8')
    
    def create_initial_system_prompt(self):
        return f"""
            You are an expert technical interviewer conducting an adaptive technical interview.

            Your responsibilities:
            1. ANALYZE the resume and job description to understand:
            - Required technical skills for the role
            - Candidate's background and experience level
            - Key technologies and concepts relevant to the position

            2. ASK QUESTIONS with these guidelines:
            - Start at {self.difficulty} difficulty
            - Focus on technical skills mentioned in BOTH the resume and job description
            - Ask ONE question at a time, stop the interview after you have asked enough questions to assess the candidate
            - Make questions specific, practical, and relevant to the role

            3. EVALUATE ANSWERS adaptively:
            - If answer is CORRECT and shows deep understanding → Increase difficulty, acknowledge their expertise
            - If answer shows RIGHT DIRECTION but incomplete → Provide encouraging nudges like:
                * "You're on the right track with [specific concept]. Can you elaborate on..."
                * "Good start! Now consider what happens when..."
                * "That's partially correct. Think about [related aspect]..."
            - If answer is INCORRECT → Decrease difficulty, provide gentle guidance without giving away the answer
            - If answer is completely off → Ask a simpler foundational question on the same topic

            4. AFTER EACH ANSWER:
            - Acknowledge what they got right first
            - If correct: Briefly affirm and immediately ask a harder follow-up question
            - If partially correct: Give a nudge and ask them to refine their answer
            - If incorrect: Ask a simpler related question to help them build understanding
            - Keep moving forward with new questions - don't dwell on explanations

            CRITICAL RULES:
            - NEVER give away answers directly
            - ALWAYS nudge in the right direction when they're close
            - Keep responses concise - quick feedback then next question
            - Focus on continuous questioning, not lengthy explanations
            - Each response should end with a new question
            - Adapt difficulty seamlessly based on their answers

            Current difficulty level: {self.difficulty}
            Question count: {self.question_count}

            Begin the interview with a relevant question at the current difficulty level.
        """

    def start_interview(self, resume_path, job_desc_path):
        print("\n🎯 Interview Starting...")
        print("=" * 60)
        
        # Load PDFs
        resume_base64 = self.load_pdf_as_base64(resume_path)
        job_desc_base64 = self.load_pdf_as_base64(job_desc_path)
        
        # Create initial message with both PDFs
        initial_message = {
            "role": "user",
            "content": [
                {
                    "type": "document",
                    "source": {
                        "type": "base64",
                        "media_type": "application/pdf",
                        "data": resume_base64
                    }
                },
                {
                    "type": "text",
                    "text": "This is the candidate's resume."
                },
                {
                    "type": "document",
                    "source": {
                        "type": "base64",
                        "media_type": "application/pdf",
                        "data": job_desc_base64
                    }
                },
                {
                    "type": "text",
                    "text": f"""
                        This is the job description.

                        Please analyze both documents and start the technical interview. 
                        Current difficulty: {self.difficulty}

                        Ask the first question now.
                    """
                }
            ]
        }
        
        self.conversation_history.append(initial_message)
        
        # Get first question from Claude
        response = self.client.messages.create(
            model="claude-sonnet-4-5-20250929",
            max_tokens=2000,
            system=self.create_initial_system_prompt(),
            messages=self.conversation_history
        )
        
        assistant_message = response.content[0].text
        self.conversation_history.append({
            "role": "assistant",
            "content": assistant_message
        })
        
        self.question_count += 1
        
        print(f"\n📝 INTERVIEWER:\n{assistant_message}\n")
        print("=" * 60)
        
    def submit_answer(self, answer):
        if answer.lower() in ['quit', 'exit', 'stop']:
            return self.end_interview()
        
        print("\n⏳ Evaluating your answer...\n")
        
        # Add user's answer to conversation
        self.conversation_history.append({
            "role": "user",
            "content": answer
        })
        
        # Get Claude's response
        response = self.client.messages.create(
            model="claude-sonnet-4-5-20250929",
            max_tokens=2000,
            system=self.create_initial_system_prompt(),
            messages=self.conversation_history
        )
        
        assistant_message = response.content[0].text
        self.conversation_history.append({
            "role": "assistant",
            "content": assistant_message
        })
        
        self.question_count += 1
        
        print("=" * 60)
        print(f"📝 INTERVIEWER:\n{assistant_message}\n")
        print("=" * 60)
        
        return True
    
    def end_interview(self):
        print("\n🏁 Interview ended. Thank you for your time!\n")
        return False

def main():
    # Get API key
    api_key = os.environ.get('ANTHROPIC_API_KEY')
    if not api_key:
        print("❌ Error: ANTHROPIC_API_KEY environment variable not set")
        print("Please set it with: export ANTHROPIC_API_KEY='your-key-here'")
        return
    
    # Get file paths
    directory = "./server/files/"

    if not os.path.exists(directory):
        os.makedirs(directory)
    
    resume_path = directory + "resume.pdf"
    job_desc_path = directory + "jd.pdf"

    # Validate files exist
    if not Path(resume_path).exists():
        print(f"❌ Error: Resume file not found: {resume_path}")
        return
    if not Path(job_desc_path).exists():
        print(f"❌ Error: Job description file not found: {job_desc_path}")
        return
    
    
    # Initialize Interviewer
    interviewer = Interviewer(api_key)
    interviewer.difficulty = "medium"  # Starting difficulty level
    # Start interview
    interviewer.start_interview(resume_path, job_desc_path)

    # Interview loop
    print("\n💡 TIP: Type your answers naturally. Say 'I would like to end this interview' to end the interview.\n")
    
    active = True
    while active:
        print("\n" + "─" * 60)
        answer = input("YOUR ANSWER: ").strip()
        
        if not answer:
            print("⚠️ Please provide an answer or say 'I would like to end this interview' to end.")
            continue

        active = interviewer.submit_answer(answer)

    print("\n✅ Interview session completed. More information will be communicated to you later!\n")

if __name__ == "__main__":
    main()