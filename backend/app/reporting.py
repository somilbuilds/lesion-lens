"""Optional English-language report wording via Groq; deterministic fallback always available."""
import json
import os
from pathlib import Path
from typing import Any

import httpx

ROOT = Path(__file__).resolve().parents[2]


def _load_local_env() -> None:
    """Load simple KEY=value entries from the project-root .env without extra dependencies."""
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


def _fallback_report(result: dict[str, Any]) -> dict[str, Any]:
    top = (result.get("top3") or [{}])[0]
    class_name = top.get("class", "unknown")
    score = float(top.get("prob", 0))
    uncertain = bool(result.get("inconclusive"))
    headline = (
        f"The image classifier's leading category is {class_name} ({score:.1%})."
        if class_name != "unknown"
        else "The image classifier could not provide a usable category."
    )
    summary = (
        "The result is uncertain. Please do not use this output to rule out a serious condition."
        if uncertain else
        "This is a model prediction from an image, not a diagnosis. A clinician must assess concerning or changing lesions."
    )
    return {
        "available": False,
        "provider": "fallback",
        "patient_report_en": {"headline": headline, "summary": summary, "next_steps": [
            "Seek clinical assessment for a changing, growing, bleeding, painful, or otherwise concerning lesion.",
            "Use the technical metrics as model outputs, not as the probability that the lesion is cancer."
        ]},
        "clinical_report_en": "Image-only classifier output. Visual clinical features have not been independently validated by this system."
    }


async def generate_report(result: dict[str, Any], symptoms: dict[str, Any]) -> dict[str, Any]:
    """Generate conservative patient-friendly English wording. Never invent visual findings."""
    _load_local_env()
    api_key = os.getenv("GROQ_API_KEY", "").strip()
    if not api_key:
        return _fallback_report(result)

    top3 = result.get("top3") or []
    explanation = result.get("explanation_report") or {}
    payload = {
        "top_predictions": top3,
        "risk_group_scores": (result.get("risk") or {}).get("group_probs", {}),
        "uncertainty": result.get("uncertainty", {}),
        "inconclusive": result.get("inconclusive", True),
        "input_check": result.get("input_check", {}),
        "model_explanation": explanation,
        "reported_symptoms": symptoms,
    }
    system_prompt = (
        "You write cautious, plain-English reports for a skin-lesion research prototype. "
        "Return only valid JSON with keys patient_headline, patient_summary, next_steps (array of 2-3 strings), "
        "clinician_summary. Explain model output in accessible wording. NEVER diagnose, claim a lesion is cancer, "
        "or infer visible redness, asymmetry, border irregularity, scaling, texture, or colour from class scores/Grad-CAM. "
        "Explicitly say the system has not independently verified visual clinical features. Treat scores as classifier "
        "scores, not calibrated cancer probabilities. Mention uncertainty and image warnings when present. "
        "Advise clinical assessment for changing, growing, bleeding, painful, or concerning lesions. No markdown."
    )
    try:
        async with httpx.AsyncClient(timeout=12.0) as client:
            response = await client.post(
                "https://api.groq.com/openai/v1/chat/completions",
                headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                json={
                    "model": os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile"),
                    "temperature": 0.2,
                    "max_tokens": 550,
                    "response_format": {"type": "json_object"},
                    "messages": [
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": json.dumps(payload, ensure_ascii=False)},
                    ],
                },
            )
            response.raise_for_status()
            content = response.json()["choices"][0]["message"]["content"]
            report = json.loads(content)
            required = ("patient_headline", "patient_summary", "next_steps", "clinician_summary")
            if any(key not in report for key in required) or not isinstance(report["next_steps"], list):
                raise ValueError("Groq report response missing required fields")
            return {
                "available": True,
                "provider": "groq",
                "patient_report_en": {
                    "headline": str(report["patient_headline"])[:400],
                    "summary": str(report["patient_summary"])[:1200],
                    "next_steps": [str(x)[:300] for x in report["next_steps"][:4]],
                },
                "clinical_report_en": str(report["clinician_summary"])[:2000],
            }
    except Exception:
        # Keep image analysis available even if network/API/quota/configuration fails.
        return _fallback_report(result)
