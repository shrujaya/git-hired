"""
Report Generator Agent
Generates comprehensive interview reports and sends via email
"""

import anthropic
from typing import Dict, Any
import json
from datetime import datetime
from pathlib import Path
import sys
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.mime.base import MIMEBase
from email import encoders

sys.path.append(str(Path(__file__).parent.parent))

from config.settings import config
from prompts.agent_prompts import get_report_generator_prompt


class ReportGeneratorAgent:
    """
    Agent responsible for generating comprehensive interview reports
    and emailing them to managers
    """
    
    def __init__(self, api_key: str = None):
        self.api_key = api_key or config.api.anthropic_api_key
        self.client = anthropic.Anthropic(api_key=self.api_key)
        self.model = config.interview.claude_model
        
    def load_transcript(self, transcript_file: Path) -> str:
        """Load interview transcript from file"""
        with open(transcript_file, 'r', encoding='utf-8') as f:
            return f.read()
    
    def load_resume_analysis(self, analysis_file: Path) -> str:
        """Load resume analysis from file"""
        with open(analysis_file, 'r', encoding='utf-8') as f:
            return f.read()
    
    def generate_report(
        self,
        interview_transcript: str,
        coding_score: int,
        candidate_name: str,
        job_role: str,
        interview_date: str,
        interview_duration: int,
        resume_analysis: str
    ) -> Dict[str, Any]:
        """
        Generate comprehensive interview report
        
        Args:
            interview_transcript: Complete interview transcript
            coding_score: Score from code evaluation (0-10)
            candidate_name: Candidate's name
            job_role: Position applied for
            interview_date: Date of interview
            interview_duration: Duration in minutes
            resume_analysis: Resume analysis text
            
        Returns:
            Dictionary with report and metadata
        """
        print("📊 Generating interview report...")
        
        # Get report generation prompt
        prompt = get_report_generator_prompt(
            interview_transcript=interview_transcript,
            coding_score=coding_score,
            candidate_name=candidate_name,
            job_role=job_role,
            interview_date=interview_date,
            interview_duration=interview_duration,
            resume_analysis=resume_analysis
        )
        
        # Generate report
        response = self.client.messages.create(
            model=self.model,
            max_tokens=4096,
            temperature=0.5,
            messages=[{
                "role": "user",
                "content": prompt
            }]
        )
        
        report_text = response.content[0].text
        
        print("✅ Report generated successfully!")
        
        return {
            "report": report_text,
            "candidate_name": candidate_name,
            "job_role": job_role,
            "interview_date": interview_date,
            "interview_duration": interview_duration,
            "coding_score": coding_score,
            "model_used": self.model,
            "generated_at": datetime.now().isoformat()
        }
    
    def save_report(
        self,
        report_data: Dict[str, Any],
        session_id: str
    ) -> Path:
        """
        Save report to file
        
        Args:
            report_data: Report data dictionary
            session_id: Session identifier
            
        Returns:
            Path to saved report
        """
        # Create reports directory
        reports_dir = config.reports_dir / session_id
        reports_dir.mkdir(exist_ok=True)
        
        # Generate filename
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        candidate_name_safe = report_data['candidate_name'].replace(" ", "_")
        
        # Save as Markdown
        report_file = reports_dir / f"interview_report_{candidate_name_safe}_{timestamp}.md"
        with open(report_file, 'w', encoding='utf-8') as f:
            f.write(f"# Interview Report: {report_data['candidate_name']}\n\n")
            f.write(f"**Position:** {report_data['job_role']}\n\n")
            f.write(f"**Date:** {report_data['interview_date']}\n\n")
            f.write(f"**Duration:** {report_data['interview_duration']} minutes\n\n")
            f.write(f"**Coding Score:** {report_data['coding_score']}/10\n\n")
            f.write("---\n\n")
            f.write(report_data['report'])
        
        # Save as JSON
        json_file = reports_dir / f"interview_report_{candidate_name_safe}_{timestamp}.json"
        with open(json_file, 'w', encoding='utf-8') as f:
            json.dump(report_data, f, indent=2)
        
        # Also save in logs directory for consistency
        log_dir = config.logs_dir / session_id
        log_dir.mkdir(exist_ok=True)
        log_report_file = log_dir / "interview_report.md"
        with open(log_report_file, 'w', encoding='utf-8') as f:
            f.write(f"# Interview Report: {report_data['candidate_name']}\n\n")
            f.write(f"**Position:** {report_data['job_role']}\n\n")
            f.write(f"**Date:** {report_data['interview_date']}\n\n")
            f.write(f"**Duration:** {report_data['interview_duration']} minutes\n\n")
            f.write(f"**Coding Score:** {report_data['coding_score']}/10\n\n")
            f.write("---\n\n")
            f.write(report_data['report'])
        
        print(f"📁 Report saved to: {report_file}")
        
        return report_file
    
    def send_email(
        self,
        report_file: Path,
        candidate_name: str,
        job_role: str,
        recipient_email: str = None
    ) -> bool:
        """
        Send interview report via email
        
        Args:
            report_file: Path to report file
            candidate_name: Candidate's name
            job_role: Position
            recipient_email: Email to send to (defaults to config manager email)
            
        Returns:
            True if email sent successfully, False otherwise
        """
        if not config.enable_email_notifications:
            print("📧 Email notifications disabled in config")
            return False
        
        recipient = recipient_email or config.email.manager_email
        
        if not recipient:
            print("❌ No recipient email configured")
            return False
        
        print(f"📧 Sending report to {recipient}...")
        
        try:
            # Create message
            msg = MIMEMultipart()
            msg['From'] = config.email.sender_email
            msg['To'] = recipient
            msg['Subject'] = f"Interview Report: {candidate_name} - {job_role}"
            
            # Email body
            body = f"""
Dear Hiring Manager,

Please find attached the comprehensive interview report for:

Candidate: {candidate_name}
Position: {job_role}
Date: {datetime.now().strftime("%Y-%m-%d")}

The report includes:
- Executive summary with overall recommendation
- Detailed technical assessment
- Problem-solving evaluation
- Communication skills assessment
- Coding evaluation results
- Complete interview transcript
- Specific recommendations

Best regards,
AI Interview System
            """
            
            msg.attach(MIMEText(body, 'plain'))
            
            # Attach report file
            with open(report_file, 'rb') as f:
                part = MIMEBase('application', 'octet-stream')
                part.set_payload(f.read())
                encoders.encode_base64(part)
                part.add_header(
                    'Content-Disposition',
                    f'attachment; filename={report_file.name}'
                )
                msg.attach(part)
            
            # Send email
            with smtplib.SMTP(config.email.smtp_server, config.email.smtp_port) as server:
                server.starttls()
                server.login(config.email.sender_email, config.email.sender_password)
                server.send_message(msg)
            
            print("✅ Email sent successfully!")
            return True
            
        except Exception as e:
            print(f"❌ Failed to send email: {e}")
            return False
    
    def generate_and_send_report(
        self,
        session_id: str,
        candidate_name: str,
        job_role: str,
        coding_score: int
    ) -> Dict[str, Any]:
        """
        Complete report generation and sending pipeline
        
        Args:
            session_id: Session identifier
            candidate_name: Candidate's name
            job_role: Position
            coding_score: Coding evaluation score
            
        Returns:
            Dictionary with report data and email status
        """
        # Load required files
        session_dir = config.logs_dir / session_id
        
        transcript_file = session_dir / "interview_transcript.txt"
        analysis_file = session_dir / "resume_analysis.txt"
        
        if not transcript_file.exists():
            raise FileNotFoundError(f"Transcript not found: {transcript_file}")
        
        if not analysis_file.exists():
            raise FileNotFoundError(f"Resume analysis not found: {analysis_file}")
        
        # Load data
        transcript = self.load_transcript(transcript_file)
        resume_analysis = self.load_resume_analysis(analysis_file)
        
        # Get interview duration
        transcript_json_file = session_dir / "interview_transcript.json"
        if transcript_json_file.exists():
            with open(transcript_json_file, 'r') as f:
                transcript_data = json.load(f)
                # Calculate duration from timestamps
                if transcript_data.get('transcript'):
                    first_time = datetime.fromisoformat(transcript_data['transcript'][0]['timestamp'])
                    last_time = datetime.fromisoformat(transcript_data['transcript'][-1]['timestamp'])
                    duration = int((last_time - first_time).total_seconds() / 60)
                else:
                    duration = 30  # Default
        else:
            duration = 30  # Default
        
        # Generate report
        report_data = self.generate_report(
            interview_transcript=transcript,
            coding_score=coding_score,
            candidate_name=candidate_name,
            job_role=job_role,
            interview_date=datetime.now().strftime("%Y-%m-%d"),
            interview_duration=duration,
            resume_analysis=resume_analysis
        )
        
        # Save report
        report_file = self.save_report(report_data, session_id)
        
        # Send email
        email_sent = self.send_email(
            report_file=report_file,
            candidate_name=candidate_name,
            job_role=job_role
        )
        
        return {
            **report_data,
            "report_file": str(report_file),
            "email_sent": email_sent,
            "session_id": session_id
        }


# Example usage
if __name__ == "__main__":
    agent = ReportGeneratorAgent()
    
    # This would normally be called with actual session data
    print("Report Generator Agent initialized successfully")
    print(f"Reports will be saved to: {config.reports_dir}")
    print(f"Email notifications: {'enabled' if config.enable_email_notifications else 'disabled'}")
