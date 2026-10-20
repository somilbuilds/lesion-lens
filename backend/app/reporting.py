"""
Groq-assisted clinical dermatology copilot, educational guidance, and interactive Q&A.
Features:
- Quantitative ABCDE-grounded report generation
- Interactive multi-turn clinical chat copilot
- Standardized Doctor Referral / Clinical Brief generator
- Safe offline fallback when API key is missing
"""

import json
import logging
import os
from pathlib import Path
from typing import Any, List, Dict

import httpx

logger = logging.getLogger(__name__)
ROOT = Path(__file__).resolve().parents[2]


def _load_local_env() -> None:
    """Load KEY=value entries from root .env."""
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


def _fallback_report(
    result: dict[str, Any],
    symptoms: dict[str, Any],
    patient: dict[str, Any],
    conditions: dict[str, Any]
) -> dict[str, Any]:
    top = (result.get("top3") or [{}])[0]
    class_key = top.get("class", "unknown")
    score = float(top.get("score", 0))
    condition = conditions.get(class_key, {})
    abcde = result.get("abcde", {})
    verbal = result.get("verbal_explanation", {})

    observations = verbal.get("findings", [])
    obs_text = " ".join(observations) if observations else "No morphological anomalies detected."

    return {
        "available": False,
        "provider": "fallback",
        "error": "External AI summary offline; built-in local clinical analysis shown.",
        "patient_report_en": {
            "headline": f"Leading algorithmic match: {condition.get('name', class_key)} ({score:.1%} relative score).",
            "summary": f"Automated morphology assessment: {obs_text} This is a research classifier score, not a definitive diagnosis.",
            "next_steps": [
                "Schedule a clinical evaluation with a dermatologist or GP if the spot is new, changing, or causing discomfort.",
                "Mention your reported history and any symptoms to your healthcare provider.",
                "Do not rely solely on automated imaging to rule out pathology."
            ]
        },
        "clinical_report_en": (
            f"Image assessment: Top differential {condition.get('name', class_key)} (Score: {score:.2f}). "
            f"Asymmetry index: {abcde.get('asymmetry_index', 'N/A')} ({abcde.get('asymmetry_level', 'N/A')}), "
            f"Border roughness: {abcde.get('border_roughness', 'N/A')} ({abcde.get('border_level', 'N/A')}), "
            f"Color variegation score: {abcde.get('color_variegation_score', 'N/A')} with {abcde.get('color_count', 'N/A')} chromatic zones. "
            "Formal dermoscopic examination and biopsy recommended if clinically indicated."
        ),
        "doctor_letter": {
            "header": "PATIENT CLINICAL SUMMARY FOR DERMATOLOGIST CONSULTATION",
            "chief_complaint": f"Evaluation of skin lesion ({patient.get('body_region') or 'Unspecified site'})",
            "morphological_metrics": {
                "asymmetry": f"{abcde.get('asymmetry_level', 'Normal')} (Index: {abcde.get('asymmetry_index', 0.0)})",
                "border": f"{abcde.get('border_level', 'Regular')} (Roughness: {abcde.get('border_roughness', 0.0)})",
                "color_zones": abcde.get("identified_colors", []),
                "relative_area": f"{abcde.get('frame_coverage_ratio', 0.0) * 100:.2f}% of frame"
            },
            "suggested_questions": [
                "Does this lesion warrant dermoscopic assessment or a punch/shave biopsy?",
                "What baseline interval should be maintained for follow-up imaging?",
                "Are there signs of atypical melanocytic proliferation or solar keratosis?"
            ]
        },
        "condition_guidance_en": {
            "overview": condition.get("overview", "Condition reference unavailable."),
            "causes_risks": condition.get("causes_risks", "Discuss UV exposure and genetic risk factors with a doctor."),
            "symptoms_signs": condition.get("symptoms_signs", "Review clinical signs during in-person evaluation."),
            "doctor_assessment": condition.get("doctor_assessment", "Dermoscopy and physical palpation."),
            "what_to_expect": condition.get("what_to_expect", "Visual inspection and dermoscopic triage."),
            "treatment": condition.get("treatment", "Treatment depends on histological confirmation."),
            "what_can_you_do": condition.get("what_can_you_do", "Protect from sun exposure; avoid scratching or picking."),
            "urgent_care": condition.get("urgent_care", "Seek urgent care if bleeding, rapid growth, or acute pain occurs.")
        }
    }


async def generate_report(
    result: dict[str, Any],
    symptoms: dict[str, Any],
    patient: dict[str, Any],
    conditions: dict[str, Any],
) -> dict[str, Any]:
    """
    Use Groq (Llama-3.3-70B-Versatile) with quantitative ABCDE feature grounding.
    """
    _load_local_env()
    api_key = os.getenv("GROQ_API_KEY", "").strip()
    top = (result.get("top3") or [{}])[0]
    class_key = top.get("class", "unknown")
    condition = conditions.get(class_key, {})
    abcde = result.get("abcde", {})
    verbal = result.get("verbal_explanation", {})

    if not api_key:
        return _fallback_report(result, symptoms, patient, conditions)

    payload = {
        "predicted_class_key": class_key,
        "predicted_class_name": condition.get("name", class_key),
        "model_confidence_score": top.get("score"),
        "differential_diagnoses": result.get("top3", []),
        "extracted_abcde_morphology": abcde,
        "verbal_morphological_findings": verbal.get("findings", []),
        "patient_reported_context": patient,
        "patient_reported_symptoms": symptoms,
        "reference_dermatology_guidelines": condition,
    }

    system_prompt = (
        "You are an expert dermatological communication specialist and clinical AI assistant. "
        "Analyze the provided image morphology data (Asymmetry, Border, Color variegation, Diameter) "
        "and top differential diagnoses to create an educational, rigorous, and grounded clinical report. "
        "Return strictly valid JSON with the following keys:\n"
        "- patient_headline (clear summary headline)\n"
        "- patient_summary (detailed explanation of why the model and morphology point here, referencing the specific ABCDE findings)\n"
        "- morphological_rationale (plain English explanation of how the lesion's symmetry, borders, and colors relate to clinical criteria)\n"
        "- causes_and_risk_factors\n"
        "- symptoms_and_signs\n"
        "- what_doctor_may_check (dermoscopy, biopsy, full-body skin check)\n"
        "- care_and_next_steps\n"
        "- when_to_seek_help\n"
        "- clinician_summary (concise clinical note using standard medical terminology for a doctor review)\n"
        "- questions_for_doctor (array of 3-4 specific, actionable questions the patient should ask their clinician)\n"
        "Tone must be compassionate, professional, and clear. Explicitly remind the user that AI is an adjunct tool, not a definitive diagnosis."
    )

    try:
        async with httpx.AsyncClient(timeout=25.0) as client:
            response = await client.post(
                "https://api.groq.com/openai/v1/chat/completions",
                headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                json={
                    "model": os.getenv("GROQ_MODEL", "openai/gpt-oss-120b"),
                    "temperature": 0.25,
                    "max_tokens": 1600,
                    "response_format": {"type": "json_object"},
                    "messages": [
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": json.dumps(payload, ensure_ascii=False)},
                    ],
                },
            )
            response.raise_for_status()
            report = json.loads(response.json()["choices"][0]["message"]["content"])

            logger.info("Groq successfully generated ABCDE-grounded report for class=%s", class_key)

            questions = report.get("questions_for_doctor", [
                "Does this spot show any dermoscopic signs that require biopsy?",
                "What is the recommended monitoring interval for this lesion?",
                "Are my personal risk factors (sun exposure, history) a factor in managing this lesion?"
            ])
            if isinstance(questions, str):
                questions = [questions]

            return {
                "available": True,
                "provider": "groq",
                "patient_report_en": {
                    "headline": report.get("patient_headline", f"Assessment for {condition.get('name', class_key)}"),
                    "summary": report.get("patient_summary", ""),
                    "morphological_rationale": report.get("morphological_rationale", ""),
                    "next_steps": [
                        report.get("care_and_next_steps", "Consult a physician for visual confirmation."),
                        report.get("when_to_seek_help", "Seek prompt review if changes or bleeding occur.")
                    ],
                    "questions_for_doctor": questions
                },
                "clinical_report_en": report.get("clinician_summary", ""),
                "condition_guidance_en": {
                    "overview": condition.get("overview", ""),
                    "causes_risks": report.get("causes_and_risk_factors", condition.get("causes_risks", "")),
                    "symptoms_signs": report.get("symptoms_and_signs", condition.get("symptoms_signs", "")),
                    "doctor_assessment": report.get("what_doctor_may_check", condition.get("doctor_assessment", "")),
                    "what_to_expect": condition.get("what_to_expect", ""),
                    "treatment": report.get("care_and_next_steps", condition.get("treatment", "")),
                    "urgent_care": report.get("when_to_seek_help", condition.get("urgent_care", ""))
                }
            }
    except Exception as exc:
        logger.warning("Groq report request failed (%s); returning rich fallback", type(exc).__name__)
        fallback = _fallback_report(result, symptoms, patient, conditions)
        fallback["error"] = f"AI summary unavailable ({type(exc).__name__}); local ABCDE analysis presented."
        return fallback


async def copilot_chat(messages: List[Dict[str, str]], lesion_context: Dict[str, Any]) -> Dict[str, Any]:
    """
    Multi-turn interactive clinical chat copilot powered by Groq Llama-3.3.
    Allows user to ask follow-up questions about their specific image findings,
    ABCDE measurements, differential diagnosis, and doctor visit preparation.
    """
    _load_local_env()
    api_key = os.getenv("GROQ_API_KEY", "").strip()

    if not api_key:
        return {
            "reply": (
                "The interactive AI Copilot is currently offline because no GROQ_API_KEY was found in the environment. "
                "You can still review the automated ABCDE metrics and local clinical reference cards on this page."
            ),
            "provider": "offline"
        }

    system_prompt = (
        "You are the SkinLesionNet Clinical Copilot, a helpful, knowledgeable, and empathetic dermatology assistant. "
        "You have access to the specific patient's lesion analysis:\n"
        f"Context: {json.dumps(lesion_context, ensure_ascii=False)}\n\n"
        "Guidelines:\n"
        "1. Directly answer the user's question, grounding your answers in their specific findings (e.g. Asymmetry score, border irregularities, color zones, top differential classes).\n"
        "2. Explain dermatological concepts (e.g. ABCDE rules, melanocytic vs non-melanocytic lesions, dermoscopy) in clear, accessible language without sounding condescending.\n"
        "3. Provide practical, actionable guidance for their upcoming doctor's appointment.\n"
        "4. Always maintain medical safety: you do not provide definitive diagnoses or prescribe treatments; always advise consulting a certified dermatologist or GP."
    )

    groq_messages = [{"role": "system", "content": system_prompt}]
    for msg in messages[-8:]:  # keep last 8 turns for conversational context
        groq_messages.append({"role": msg.get("role", "user"), "content": msg.get("content", "")})

    try:
        async with httpx.AsyncClient(timeout=25.0) as client:
            res = await client.post(
                "https://api.groq.com/openai/v1/chat/completions",
                headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                json={
                    "model": os.getenv("GROQ_MODEL", "openai/gpt-oss-120b"),
                    "temperature": 0.4,
                    "max_tokens": 800,
                    "messages": groq_messages,
                },
            )
            res.raise_for_status()
            data = res.json()
            reply = data["choices"][0]["message"]["content"]
            return {"reply": reply, "provider": "groq"}
    except Exception as exc:
        logger.error("Copilot chat failed: %s", exc)
        return {
            "reply": f"Sorry, I encountered an issue connecting to the AI assistant ({type(exc).__name__}). Please check your internet connection or try again in a moment.",
            "provider": "error"
        }
