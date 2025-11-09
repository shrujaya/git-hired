"""
Resume Evaluator Agent
Analyzes candidate resume against job description
"""

import anthropic
from typing import Dict, Any
import json
from pathlib import Path
import sys

# Add parent directory to path
sys.path.append(str(Path(__file__).parent.parent))

from config.settings import config
from prompts.agent_prompts import get_resume_evaluator_prompt


class ResumeEvaluatorAgent:
    """
    Agent responsible for analyzing resume and job description
    to create interview preparation points
    """
    
    def __init__(self, api_key: str = None):
        self.api_key = api_key or config.api.anthropic_api_key
        self.client = anthropic.Anthropic(api_key=self.api_key)
        self.model = config.interview.claude_model
        
    def extract_text_from_pdf(self, pdf_content: bytes) -> str:
        """
        Extract text from PDF bytes using Claude's PDF capability
        """
        # Claude can directly process PDF files
        # We'll use the Anthropic API's document handling
        import base64
        
        # Convert to base64
        pdf_base64 = base64.b64encode(pdf_content).decode('utf-8')
        
        # Use Claude to extract text
        message = self.client.messages.create(
            model=self.model,
            max_tokens=4096,
            messages=[{
                "role": "user",
                "content": [
                    {
                        "type": "document",
                        "source": {
                            "type": "base64",
                            "media_type": "application/pdf",
                            "data": pdf_base64
                        }
                    },
                    {
                        "type": "text",
                        "text": "Extract all text content from this resume PDF. Preserve the structure and formatting. Return the complete text."
                    }
                ]
            }]
        )
        
        return message.content[0].text
    
    def analyze_resume(
        self,
        resume_text: str,
        job_description: str
    ) -> Dict[str, Any]:
        """
        Analyze resume against job description
        
        Args:
            resume_text: Extracted text from resume
            job_description: Job description text
            
        Returns:
            Dictionary containing analysis results
        """
        print("🔍 Analyzing resume against job description...")
        
        # Get the prompt
        prompt = get_resume_evaluator_prompt(resume_text, job_description)
        
        # Call Claude
        response = self.client.messages.create(
            model=self.model,
            max_tokens=4096,
            temperature=0.3,  # Lower temperature for analytical task
            messages=[{
                "role": "user",
                "content": prompt
            }]
        )
        
        analysis_text = response.content[0].text
        
        print("✅ Resume analysis complete!")
        
        return {
            "analysis": analysis_text,
            "resume_text": resume_text,
            "job_description": job_description,
            "model_used": self.model
        }
    
    def save_analysis(self, analysis: Dict[str, Any], session_id: str) -> Path:
        """
        Save analysis to file
        
        Args:
            analysis: Analysis results
            session_id: Unique session identifier
            
        Returns:
            Path to saved file
        """
        # Create session directory
        session_dir = config.logs_dir / session_id
        session_dir.mkdir(exist_ok=True)
        
        # Save analysis text
        analysis_file = session_dir / "resume_analysis.txt"
        with open(analysis_file, 'w', encoding='utf-8') as f:
            f.write("="*80 + "\n")
            f.write("RESUME ANALYSIS FOR INTERVIEW\n")
            f.write("="*80 + "\n\n")
            f.write(analysis["analysis"])
            f.write("\n\n" + "="*80 + "\n")
            f.write("ORIGINAL RESUME TEXT\n")
            f.write("="*80 + "\n\n")
            f.write(analysis["resume_text"])
            f.write("\n\n" + "="*80 + "\n")
            f.write("JOB DESCRIPTION\n")
            f.write("="*80 + "\n\n")
            f.write(analysis["job_description"])
        
        # Save as JSON for programmatic access
        json_file = session_dir / "resume_analysis.json"
        with open(json_file, 'w', encoding='utf-8') as f:
            json.dump(analysis, f, indent=2)
        
        print(f"📁 Analysis saved to: {analysis_file}")
        
        return analysis_file
    
    async def process_resume(
        self,
        resume_pdf_base64: str,
        job_description: str,
        session_id: str
    ) -> Dict[str, Any]:
        """
        Complete resume processing pipeline
        
        Args:
            resume_pdf_base64: Base64 encoded PDF
            job_description: Job description text
            session_id: Session identifier
            
        Returns:
            Analysis results with file path
        """
        import base64
        
        # Decode PDF
        pdf_bytes = base64.b64decode(resume_pdf_base64)
        
        # Extract text
        print("📄 Extracting text from resume PDF...")
        resume_text = self.extract_text_from_pdf(pdf_bytes)
        
        # Analyze
        analysis = self.analyze_resume(resume_text, job_description)
        
        # Save
        analysis_file = self.save_analysis(analysis, session_id)
        
        return {
            **analysis,
            "analysis_file": str(analysis_file),
            "session_id": session_id
        }


# Example usage
if __name__ == "__main__":
    import asyncio
    
    # Test with sample data
    agent = ResumeEvaluatorAgent()
    
    sample_resume = """
    John Doe
    Senior Software Engineer
    
    Experience:
    - 5 years of Python development
    - Expert in Django and FastAPI
    - Cloud infrastructure (AWS)
    - Machine learning projects
    
    Education:
    - BS Computer Science, MIT
    """
    
    sample_jd = """
    We're looking for a Senior Backend Engineer with:
    - 5+ years Python experience
    - Strong API development skills
    - Cloud platform experience
    - Interest in ML/AI
    """
    
    result = agent.analyze_resume(sample_resume, sample_jd)
    print("\n" + "="*80)
    print("ANALYSIS RESULT:")
    print("="*80)
    print(result["analysis"])
