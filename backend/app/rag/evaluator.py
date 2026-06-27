"""
AI-powered grading evaluator using Google Gemini API.
Performs RAG-based evaluation with rubrics and course context.
"""
import json
import re
from dataclasses import dataclass
from typing import List, Dict, Any
import structlog

import google.generativeai as genai

from app.core.config import Settings
from app.rag.retrieval import RetrievalResult
from app.models.assignment import Assignment
from app.models.rubric import Rubric

logger = structlog.get_logger(__name__)


@dataclass
class EvaluationResult:
    """Result of AI evaluation."""
    total_score: float
    max_score: float
    percentage: float
    criteria_scores: List[Dict[str, Any]]  # Each: criterion_name, awarded, max, reasoning
    strengths: List[str]  # Max 3
    weaknesses: List[str]  # Max 3
    missing_topics: List[str]
    overall_feedback: str
    confidence_score: float  # 0-1
    retrieved_sources: List[str]  # Source file names


class GradingEvaluator:
    """
    AI-powered grading evaluator using Google Gemini.
    Performs structured evaluation based on rubrics and retrieved context.
    """
    
    def __init__(self, settings: Settings):
        """
        Initialize evaluator with Gemini API.
        
        Args:
            settings: Application settings with GEMINI_API_KEY
        """
        self.settings = settings
        self.model_name = settings.gemini_model
        
        # Configure Gemini API
        genai.configure(api_key=settings.gemini_api_key)
        
        # Initialize model with safety settings
        self.model = genai.GenerativeModel(
            model_name=self.model_name,
            generation_config={
                "temperature": 0.1,  # Low temperature for consistent grading
                "top_p": 0.95,
                "top_k": 40,
                "max_output_tokens": 4096,
            },
        )
        
        logger.info("gemini_evaluator_initialized", model=self.model_name)
    
    def evaluate(
        self,
        submission_text: str,
        rubrics: List[Rubric],
        retrieval_result: RetrievalResult,
        assignment: Assignment,
    ) -> EvaluationResult:
        """
        Evaluate a submission using AI with RAG context.
        
        Args:
            submission_text: The student's submission text
            rubrics: List of rubric criteria for the assignment
            retrieval_result: Retrieved context (rubrics, notes, samples)
            assignment: Assignment object with metadata
            
        Returns:
            EvaluationResult with scores and feedback
        """
        logger.info(
            "starting_evaluation",
            assignment_id=str(assignment.id),
            rubric_count=len(rubrics),
        )
        
        # Build prompts
        system_prompt = self._build_system_prompt()
        user_prompt = self._build_user_prompt(
            submission_text=submission_text,
            rubrics=rubrics,
            retrieval_result=retrieval_result,
            assignment=assignment,
        )
        
        # Call Gemini API
        try:
            response = self.model.generate_content([system_prompt, user_prompt])
            response_text = response.text
            
            logger.info("gemini_response_received", length=len(response_text))
            
        except Exception as exc:
            logger.error("gemini_api_call_failed", error=str(exc))
            # Return fallback evaluation
            return self._create_fallback_evaluation(rubrics, assignment, retrieval_result)
        
        # Parse response
        try:
            result_dict = self._parse_response(response_text, assignment.max_score)
            
            # Validate criteria count matches
            if len(result_dict["criteria_scores"]) != len(rubrics):
                logger.warning(
                    "criteria_count_mismatch",
                    expected=len(rubrics),
                    received=len(result_dict["criteria_scores"]),
                )
            
            # Extract source names
            sources = list(set(
                chunk.source_name
                for chunks in [
                    retrieval_result.rubric_chunks,
                    retrieval_result.notes_chunks,
                    retrieval_result.sample_chunks,
                ]
                for chunk in chunks
            ))
            
            return EvaluationResult(
                total_score=result_dict["total_score"],
                max_score=result_dict["max_score"],
                percentage=result_dict["percentage"],
                criteria_scores=result_dict["criteria_scores"],
                strengths=result_dict["strengths"][:3],  # Max 3
                weaknesses=result_dict["weaknesses"][:3],  # Max 3
                missing_topics=result_dict.get("missing_topics", []),
                overall_feedback=result_dict["overall_feedback"],
                confidence_score=result_dict.get("confidence_score", 0.7),
                retrieved_sources=sources,
            )
            
        except Exception as exc:
            logger.error("evaluation_parse_failed", error=str(exc))
            # Retry once with more explicit prompt
            return self._retry_evaluation(
                submission_text=submission_text,
                rubrics=rubrics,
                retrieval_result=retrieval_result,
                assignment=assignment,
            )
    
    def _build_system_prompt(self) -> str:
        """Build system prompt for the evaluator."""
        return """You are an expert academic evaluator. Your task is to grade student submissions based ONLY on the provided rubric criteria and course materials.

Guidelines:
- Be fair, specific, and constructive in your feedback
- Award points based on demonstrated understanding and quality of work
- Reference specific parts of the student's submission in your reasoning
- Never hallucinate facts not present in the provided context
- Use the course materials and sample solutions as reference standards
- Be consistent and objective in applying rubric criteria
- Provide actionable feedback that helps students improve

Your evaluation must be thorough, evidence-based, and formatted exactly as specified."""
    
    def _build_user_prompt(
        self,
        submission_text: str,
        rubrics: List[Rubric],
        retrieval_result: RetrievalResult,
        assignment: Assignment,
    ) -> str:
        """Build user prompt with all context."""
        
        # Assignment info
        prompt = f"""=== ASSIGNMENT ===
Title: {assignment.title}
Description: {assignment.description or "No description provided"}
Max Score: {assignment.max_score}
Grading Mode: {assignment.grading_mode.value}

"""
        
        # Rubric criteria
        prompt += "=== GRADING RUBRIC ===\n"
        for rubric in rubrics:
            prompt += f"""
Criterion: {rubric.criteria_name} (Weight: {rubric.weight}%, Max Points: {rubric.max_points})
Description: {rubric.description or "No description"}
Evaluation Hints: {rubric.evaluation_hints or "No specific hints"}
---
"""
        
        # Course notes context
        if retrieval_result.notes_chunks:
            prompt += "\n=== RELEVANT COURSE MATERIAL ===\n"
            for chunk in retrieval_result.notes_chunks:
                prompt += f"""
Source: {chunk.source_name}
{chunk.chunk_text}
---
"""
        
        # Sample solution context
        if retrieval_result.sample_chunks:
            prompt += "\n=== SAMPLE SOLUTION EXCERPTS ===\n"
            for chunk in retrieval_result.sample_chunks:
                prompt += f"{chunk.chunk_text}\n---\n"
        
        # Student submission
        prompt += f"""
=== STUDENT SUBMISSION ===
<student_answer>
{submission_text}
</student_answer>

=== EVALUATION INSTRUCTIONS ===
Evaluate the student answer criterion by criterion based on the rubric above.

For each criterion:
1. Award points from 0 to the criterion's max_points
2. Provide specific reasoning that references the student's actual text
3. Compare against the rubric description and evaluation hints

Return ONLY valid JSON matching this exact schema (no markdown, no code blocks):

{{
  "total_score": <sum of all awarded points>,
  "max_score": {assignment.max_score},
  "percentage": <(total_score / max_score) * 100>,
  "criteria_scores": [
    {{
      "criterion_name": "<exact criterion name from rubric>",
      "awarded": <points awarded (0 to max)>,
      "max": <max points for this criterion>,
      "reasoning": "<2-3 specific sentences explaining the score>"
    }}
  ],
  "strengths": [
    "<specific strength with example from submission>",
    "<another strength>"
  ],
  "weaknesses": [
    "<specific weakness with example>",
    "<another weakness>"
  ],
  "missing_topics": [
    "<topic required by rubric but not addressed>"
  ],
  "overall_feedback": "<3-4 sentences of constructive summary feedback>",
  "confidence_score": <your confidence in this evaluation, 0.0 to 1.0>
}}

CRITICAL: Return ONLY the JSON object. Do not include markdown code blocks, explanations, or any other text.
"""
        
        return prompt
    
    def _parse_response(self, response_text: str, max_score: float) -> Dict[str, Any]:
        """
        Parse Gemini response into structured dict.
        
        Args:
            response_text: Raw response from Gemini
            max_score: Maximum possible score for validation
            
        Returns:
            Parsed evaluation dict
            
        Raises:
            ValueError: If parsing fails or validation fails
        """
        # Strip markdown code blocks if present
        text = response_text.strip()
        
        # Remove ```json and ``` markers
        text = re.sub(r'^```json\s*', '', text, flags=re.MULTILINE)
        text = re.sub(r'^```\s*$', '', text, flags=re.MULTILINE)
        text = text.strip()
        
        # Parse JSON
        try:
            result = json.loads(text)
        except json.JSONDecodeError as exc:
            logger.error("json_parse_failed", error=str(exc), text=text[:500])
            raise ValueError(f"Failed to parse JSON response: {exc}")
        
        # Validate required fields
        required_fields = [
            "total_score", "max_score", "percentage", "criteria_scores",
            "strengths", "weaknesses", "overall_feedback"
        ]
        
        for field in required_fields:
            if field not in result:
                raise ValueError(f"Missing required field: {field}")
        
        # Validate score constraints
        if result["total_score"] > max_score:
            logger.warning(
                "total_score_exceeds_max",
                total=result["total_score"],
                max=max_score,
            )
            result["total_score"] = max_score
            result["percentage"] = 100.0
        
        # Ensure confidence_score exists
        if "confidence_score" not in result:
            result["confidence_score"] = 0.7
        
        # Ensure missing_topics exists
        if "missing_topics" not in result:
            result["missing_topics"] = []
        
        return result
    
    def _retry_evaluation(
        self,
        submission_text: str,
        rubrics: List[Rubric],
        retrieval_result: RetrievalResult,
        assignment: Assignment,
    ) -> EvaluationResult:
        """
        Retry evaluation with more explicit instructions.
        If this fails too, return fallback evaluation.
        """
        logger.info("retrying_evaluation")
        
        try:
            # Simplified prompt for retry
            simple_prompt = f"""Grade this student submission for the assignment "{assignment.title}".

Max Score: {assignment.max_score}

Rubric:
{chr(10).join(f"- {r.criteria_name}: {r.max_points} points" for r in rubrics)}

Student Answer:
{submission_text[:2000]}

Return JSON only:
{{"total_score": <number>, "max_score": {assignment.max_score}, "percentage": <number>, "criteria_scores": [...], "strengths": [...], "weaknesses": [...], "missing_topics": [], "overall_feedback": "<text>", "confidence_score": 0.5}}
"""
            
            response = self.model.generate_content(simple_prompt)
            result_dict = self._parse_response(response.text, assignment.max_score)
            
            sources = list(set(
                chunk.source_name
                for chunks in [
                    retrieval_result.rubric_chunks,
                    retrieval_result.notes_chunks,
                    retrieval_result.sample_chunks,
                ]
                for chunk in chunks
            ))
            
            return EvaluationResult(
                total_score=result_dict["total_score"],
                max_score=result_dict["max_score"],
                percentage=result_dict["percentage"],
                criteria_scores=result_dict["criteria_scores"],
                strengths=result_dict["strengths"][:3],
                weaknesses=result_dict["weaknesses"][:3],
                missing_topics=result_dict.get("missing_topics", []),
                overall_feedback=result_dict["overall_feedback"],
                confidence_score=0.5,  # Lower confidence for retry
                retrieved_sources=sources,
            )
            
        except Exception as exc:
            logger.error("retry_evaluation_failed", error=str(exc))
            return self._create_fallback_evaluation(rubrics, assignment, retrieval_result)
    
    def _create_fallback_evaluation(
        self,
        rubrics: List[Rubric],
        assignment: Assignment,
        retrieval_result: RetrievalResult,
    ) -> EvaluationResult:
        """Create a fallback evaluation when AI fails."""
        logger.warning("creating_fallback_evaluation")
        
        # Award 50% of points as placeholder
        criteria_scores = []
        for rubric in rubrics:
            criteria_scores.append({
                "criterion_name": rubric.criteria_name,
                "awarded": rubric.max_points * 0.5,
                "max": rubric.max_points,
                "reasoning": "Automatic evaluation failed. Manual grading required.",
            })
        
        total_score = assignment.max_score * 0.5
        
        sources = list(set(
            chunk.source_name
            for chunks in [
                retrieval_result.rubric_chunks,
                retrieval_result.notes_chunks,
                retrieval_result.sample_chunks,
            ]
            for chunk in chunks
        ))
        
        return EvaluationResult(
            total_score=total_score,
            max_score=assignment.max_score,
            percentage=50.0,
            criteria_scores=criteria_scores,
            strengths=["Submission received"],
            weaknesses=["Automatic evaluation failed"],
            missing_topics=[],
            overall_feedback="Automatic evaluation encountered an error. This submission requires manual grading by the professor.",
            confidence_score=0.0,
            retrieved_sources=sources,
        )
