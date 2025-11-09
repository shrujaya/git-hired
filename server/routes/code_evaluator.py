from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from src.code_evaluator import CodeEvaluationAgent, CodeEvaluationResult

router = APIRouter(prefix="/api")

class CodeEvalRequest(BaseModel):
    question: str
    code_submission: str
    expected_approach: str | None = None  # optional

@router.post("/evaluate-code", response_model=CodeEvaluationResult)
def evaluate_code(request: CodeEvalRequest):
    """
    Evaluate the code submitted by the user against the given question.
    """
    try:
        agent = CodeEvaluationAgent()
        result = agent.evaluate_code(
            question=request.question,
            code_submission=request.code_submission,
            expected_approach=request.expected_approach
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))