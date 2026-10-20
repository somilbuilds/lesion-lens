import os
import json
from fastapi import FastAPI, File, UploadFile, Form, Body
from fastapi.middleware.cors import CORSMiddleware
from typing import Optional, List, Dict, Any
from PIL import Image, ImageOps, UnidentifiedImageError
from io import BytesIO
import logging

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger(__name__)

from app.model import SkinModel
from app.config import config
from app.reporting import generate_report, copilot_chat

app = FastAPI(title="SkinLesionNet Clinical API", version="2.0.0")

# Allow local frontend during development/demo, plus the deployed frontend.
frontend_origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "https://lesion-lens-1.onrender.com",
    "*",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

model_path = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "models", "best.pt")
content_path = os.path.join(os.path.dirname(__file__), "content", "conditions.json")

# Initialize model
skin_model = SkinModel(model_path)

with open(content_path, "r", encoding="utf-8") as f:
    conditions_content = json.load(f)

@app.get("/api/health")
def health():
    return {"status": "ok", "version": "2.0.0", "model_loaded": True}

@app.get("/api/model-info")
def model_info():
    models_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "models")
    evaluation_path = os.path.join(models_dir, "evaluation_metrics.json")
    metadata_path = os.path.join(models_dir, "model_metadata.json")
    metrics_path = evaluation_path if os.path.exists(evaluation_path) else os.path.join(models_dir, "metrics.json")
    with open(metrics_path, "r", encoding="utf-8") as metrics_file:
        recorded_metrics = json.load(metrics_file)
    metadata = {}
    if os.path.exists(metadata_path):
        with open(metadata_path, "r", encoding="utf-8") as metadata_file:
            metadata = json.load(metadata_file)
    is_reproducible_export = os.path.exists(evaluation_path) and bool(metadata.get("artifact_sha256"))
    per_class = recorded_metrics.get("per_class", {})
    recall = recorded_metrics.get("test_recall") or {key: value.get("recall") for key, value in per_class.items() if isinstance(value, dict)}
    versions = []
    if is_reproducible_export:
        versions.append({"id": (metadata.get("artifact_sha256") or "")[:12], "evaluation_manifest_sha256": metadata.get("evaluation_manifest_sha256"), "metrics": recorded_metrics})
    versions_dir = os.path.join(models_dir, "versions")
    if os.path.isdir(versions_dir):
        for version_dir in sorted(os.scandir(versions_dir), key=lambda entry: entry.name):
            if not version_dir.is_dir():
                continue
            version_metrics_path = os.path.join(version_dir.path, "evaluation_metrics.json")
            version_metadata_path = os.path.join(version_dir.path, "model_metadata.json")
            if not (os.path.isfile(version_metrics_path) and os.path.isfile(version_metadata_path)):
                continue
            with open(version_metrics_path, "r", encoding="utf-8") as stream:
                version_metrics = json.load(stream)
            with open(version_metadata_path, "r", encoding="utf-8") as stream:
                version_metadata = json.load(stream)
            manifest_hash = version_metadata.get("evaluation_manifest_sha256")
            if manifest_hash:
                versions.append({"id": version_metadata.get("artifact_sha256", version_dir.name)[:12], "evaluation_manifest_sha256": manifest_hash, "metrics": version_metrics})
    return {
        "classes": config.classes,
        "model_type": skin_model.model_type,
        "metadata_supported": bool(skin_model.metadata_dim),
        "metadata_schema": skin_model.metadata_schema,
        "metrics": {
            "accuracy": recorded_metrics.get("accuracy", recorded_metrics.get("test_accuracy")),
            "balanced_accuracy": recorded_metrics.get("balanced_accuracy", recorded_metrics.get("test_balanced_accuracy")),
            "macro_auc": recorded_metrics.get("macro_ovr_auc", recorded_metrics.get("test_macro_auc")),
            "macro_f1": recorded_metrics.get("macro_f1", recorded_metrics.get("test_macro_f1")),
            "per_class_recall": recall,
            "per_class": per_class,
        },
        "evaluation": {
            "status": "Reproducible notebook export" if is_reproducible_export else "Historical metrics; provenance unverified",
            "evaluation_date": metadata.get("evaluation_date"),
            "test_images": recorded_metrics.get("test_images"),
            "test_class_support": recorded_metrics.get("test_class_support"),
            "confusion_matrix": recorded_metrics.get("confusion_matrix_normalized"),
            "confusion_matrix_classes": recorded_metrics.get("classes", config.classes),
            "calibration": recorded_metrics.get("calibration", "Not evaluated"),
            "model_version": (metadata.get("artifact_sha256") or "historical")[:12],
            "dataset": metadata.get("dataset", "Unverified historical training data"),
            "dataset_doi": metadata.get("dataset_doi"),
            "split_group": metadata.get("split_group", "Unknown"),
            "split_counts": metadata.get("split_counts"),
            "evaluation_manifest_sha256": metadata.get("manifest_sha256"),
        },
        "versions": versions,
        "evaluation_status": "Metrics and provenance loaded from the Colab notebook export." if is_reproducible_export else "Historical experiment metrics; dataset and split provenance have not been verified from this repository.",
        "datasets": metadata.get("dataset_citation") or "Dataset and split details are not currently traceable from the checked-in training artifacts.",
        "limitations": [
            "The selected checkpoint may use optional age, sex, and body-location metadata; symptoms are not model inputs.",
            "The recorded metrics have not been independently reproduced or traced to an evaluation manifest.",
            "The model has not been established as a diagnostic or triage system."
        ]
    }


@app.get("/api/conditions")
def condition_library():
    return {
        "content_status": conditions_content.get("__meta__", {}).get("disclaimer", "Source-linked education; not medical advice."),
        "classes": {key: value for key, value in conditions_content.items() if key != "__meta__"},
    }

@app.post("/api/analyze")
async def analyze(
    image: UploadFile = File(...),
    allow_ai_report: bool = Form(False),
    age: Optional[str] = Form(None),
    sex: Optional[str] = Form(None),
    fitzpatrick: Optional[str] = Form(None),
    body_region: Optional[str] = Form(None),
    diameter_mm: Optional[str] = Form(None),
    itch: Optional[bool] = Form(False),
    grew: Optional[bool] = Form(False),
    hurt: Optional[bool] = Form(False),
    changed: Optional[bool] = Form(False),
    bleed: Optional[bool] = Form(False),
    personal_skin_cancer_history: Optional[bool] = Form(False),
):
    logger.info("Received image analysis request")
    max_bytes = config.max_image_size_mb * 1024 * 1024
    content = await image.read(max_bytes + 1)
    if len(content) > max_bytes:
        return {"input_check": {"level": "reject", "reasons": [f"Image exceeds the {config.max_image_size_mb} MB upload limit."]}}
    try:
        with Image.open(BytesIO(content)) as source:
            if source.format not in {"JPEG", "PNG", "WEBP"}:
                return {"input_check": {"level": "reject", "reasons": ["Use a JPEG, PNG, or WebP image."]}}
            if source.width * source.height > config.max_image_pixels:
                return {"input_check": {"level": "reject", "reasons": ["Image dimensions are too large. Resize the image and try again."]}}
            img = ImageOps.exif_transpose(source).convert("RGB")
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError):
        return {"input_check": {"level": "reject", "reasons": ["This image could not be opened. Choose a valid JPEG, PNG, or WebP file."]}}

    logger.info("Image parsed successfully")
    symptoms = {
        "itch": itch, "grew": grew, "hurt": hurt, "changed": changed,
        "bleed": bleed, "personal_skin_cancer_history": personal_skin_cancer_history
    }

    result = skin_model.analyze_image(img, symptoms, {
        "age": age,
        "sex": sex,
        "localization": body_region,
    })
    logger.info(f"Analysis complete: input_check={result.get('input_check', {}).get('level')}")

    if result.get("input_check", {}).get("level") != "reject":
        result["content"] = conditions_content
        if allow_ai_report:
            result["language_reports"] = await generate_report(
                result,
                symptoms,
                {"age": age, "sex": sex, "fitzpatrick": fitzpatrick, "body_region": body_region, "diameter_mm": diameter_mm},
                conditions_content,
            )

    return result

@app.post("/api/chat/copilot")
async def chat_with_copilot(payload: Dict[str, Any] = Body(...)):
    """
    Interactive clinical Q&A copilot. Accepts conversation history and current lesion context.
    """
    messages = payload.get("messages", [])
    lesion_context = payload.get("context", {})
    response = await copilot_chat(messages, lesion_context)
    return response
