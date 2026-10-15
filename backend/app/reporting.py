"""Groq-assisted, class-specific educational guidance with a safe local fallback."""
import json
import logging
import os
from pathlib import Path
from typing import Any

import httpx

logger = logging.getLogger(__name__)
ROOT = Path(__file__).resolve().parents[2]


def _load_local_env() -> None:
    """Load KEY=value entries from root .env. Do not use .env.example for secrets."""
    env_path = ROOT / ".env"
    if not env_path.exists():
        return
    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key, value = key.strip(), value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


def _fallback_report(result: dict[str, Any], symptoms: dict[str, Any], patient: dict[str, Any], conditions: dict[str, Any]) -> dict[str, Any]:
    top = (result.get("top3") or [{}])[0]
    class_key = top.get("class", "unknown")
    score = float(top.get("prob", 0))
    condition = conditions.get(class_key, {})
    return {
        "available": False,
        "provider": "fallback",
        "error": "GROQ_API_KEY is not configured in the repository-root .env file." if not os.getenv("GROQ_API_KEY") else "Groq request failed; using local reference content.",
        "patient_report_en": {
            "headline": f"The image classifier's leading category is {condition.get('name', class_key)} ({score:.1%} model score).",
            "summary": "This is an image-model prediction, not a diagnosis. The score is not the probability that this lesion is cancer.",
            "next_steps": [
                "A clinician should assess a lesion that is changing, growing, bleeding, painful, or otherwise concerning.",
                "Do not delay medical assessment because of a low model score."
            ]
        },
        "clinical_report_en": "Image-only classifier output. Visual clinical features have not been independently verified by this system.",
        "condition_guidance_en": {
            "overview": condition.get("overview", "Condition information is unavailable."),
            "causes_risks": condition.get("causes_risks", "Discuss possible causes and risk factors with a clinician."),
            "symptoms_signs": condition.get("symptoms_signs", "Symptoms vary; the model has not confirmed signs on this image."),
            "doctor_assessment": condition.get("doctor_assessment", "A clinician can examine the lesion and decide whether further tests are needed."),
            "what_to_expect": condition.get("what_to_expect", "Assessment depends on the clinical examination."),
            "treatment": condition.get("treatment", "Treatment depends on a clinician-confirmed diagnosis."),
            "what_can_you_do": condition.get("what_can_you_do", "Avoid self-treatment and seek medical advice for concerning changes."),
            "urgent_care": condition.get("urgent_care", "Seek prompt clinical advice for rapid changes, bleeding, or significant pain."),
            "personalized_context": "The provided age, sex, and symptom details have not been used to make a diagnosis."
        }
    }


async def generate_report(
    result: dict[str, Any],
    symptoms: dict[str, Any],
    patient: dict[str, Any],
    conditions: dict[str, Any],
) -> dict[str, Any]:
    """Use Groq to explain reference content for the predicted class, without inventing findings."""
    _load_local_env()
    api_key = os.getenv("GROQ_API_KEY", "").strip()
    top = (result.get("top3") or [{}])[0]
    class_key = top.get("class", "unknown")
    condition = conditions.get(class_key, {})
    if not api_key:
        return _fallback_report(result, symptoms, patient, conditions)

    payload = {
        "predicted_class_key": class_key,
        "predicted_class_name": condition.get("name", class_key),
        "model_score_not_diagnostic_probability": top.get("prob"),
        "top_predictions": result.get("top3", []),
        "risk_group_scores": (result.get("risk") or {}).get("group_probs", {}),
        "uncertainty": result.get("uncertainty", {}),
        "inconclusive": result.get("inconclusive", True),
        "image_warnings": (result.get("input_check") or {}).get("reasons", []),
        "patient_context_reported_by_user": patient,
        "symptoms_reported_by_user": symptoms,
        "clinician_reviewed_reference_content_for_this_class": condition,
    }
    system_prompt = (
        "You write educational skin-lesion reports for a research prototype. Return only valid JSON with keys: "
        "patient_headline, patient_summary, causes_and_risk_factors, symptoms_and_signs, what_doctor_may_check, "
        "what_to_expect, care_and_next_steps, when_to_seek_help, personalized_context_note, clinician_summary. "
        "Use clear English, empathetic and non-alarmist. Use the supplied reference content for the predicted class, "
        "but phrase it naturally. Tailor general context using reported age, sex, body region, diameter and symptoms "
        "only where medically relevant; say when details are missing. Do not infer that any visual feature (redness, "
        "scaling, asymmetry, colour variation, irregular border) is present based on class score or heatmap. Never "
        "diagnose or claim the predicted class is confirmed. The model score is not cancer probability. State that a "
        "clinician may need examination/dermoscopy/biopsy as appropriate and that treatment must be clinician-led. "
        "Do not give prescription or home-remedy instructions. If user reports growth, change, bleeding or pain, "
        "highlight prompt clinical review. Keep every field useful and specific; no empty sections. Keep patient "
        "language simple; clinician summary may include technical limitations. JSON values must be strings except "
        "no arrays are needed. Do not include markdown."
    )
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            response = await client.post(
                "https://api.groq.com/openai/v1/chat/completions",
                headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                json={
                    "model": os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile"),
                    "temperature": 0.2,
                    "max_tokens": 1300,
                    "response_format": {"type": "json_object"},
                    "messages": [
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": json.dumps(payload, ensure_ascii=False)},
                    ],
                },
            )
            response.raise_for_status()
            report = json.loads(response.json()["choices"][0]["message"]["content"])
            fields = [
                "patient_headline", "patient_summary", "causes_and_risk_factors",
                "symptoms_and_signs", "what_doctor_may_check", "what_to_expect",
                "care_and_next_steps", "when_to_seek_help", "personalized_context_note",
                "clinician_summary",
            ]
            if any(not isinstance(report.get(key), str) or not report[key].strip() for key in fields):
                raise ValueError("Groq response has missing or empty fields")
            logger.info("Groq generated class-specific educational report for class=%s", class_key)
            return {
                "available": True,
                "provider": "groq",
                "patient_report_en": {
                    "headline": report["patient_headline"][:500],
                    "summary": report["patient_summary"][:1800],
                    "next_steps": [report["care_and_next_steps"][:1800], report["when_to_seek_help"][:1200]],
                },
                "clinical_report_en": report["clinician_summary"][:2400],
                "condition_guidance_en": {
                    "overview": report["patient_summary"][:1800],
                    "causes_risks": report["causes_and_risk_factors"][:1800],
                    "symptoms_signs": report["symptoms_and_signs"][:1800],
                    "doctor_assessment": report["what_doctor_may_check"][:1800],
                    "what_to_expect": report["what_to_expect"][:1200],
                    "treatment": report["care_and_next_steps"][:1800],
                    "what_can_you_do": report["personalized_context_note"][:1200],
                    "urgent_care": report["when_to_seek_help"][:1200],
                    "personalized_context": report["personalized_context_note"][:1200],
                },
            }
    except Exception as exc:
        logger.warning("Groq report request failed (%s); returning fallback report", type(exc).__name__)
        fallback = _fallback_report(result, symptoms, patient, conditions)
        fallback["error"] = f"Groq request failed ({type(exc).__name__}); check backend logs, API key, model access, and internet."
        return fallback
