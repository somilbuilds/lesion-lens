import os
import json
from fastapi import FastAPI, File, UploadFile, Form
from fastapi.middleware.cors import CORSMiddleware
from typing import Optional
from pydantic import BaseModel
from PIL import Image
from io import BytesIO
import logging

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger(__name__)

from app.model import SkinModel
from app.config import config

app = FastAPI()

# Allow CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://lesion-lens-1.onrender.com",
    ],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

model_path = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "models", "best.pt")
metrics_path = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "models", "test_metrics.json")
content_path = os.path.join(os.path.dirname(__file__), "content", "conditions.json")

# Initialize model
skin_model = SkinModel(model_path)

with open(content_path, "r", encoding="utf-8") as f:
    conditions_content = json.load(f)

@app.get("/api/health")
def health():
    return {"status": "ok"}

@app.get("/api/model-info")
def model_info():
    return {
        "classes": config.classes,
        "metrics": {
            "test_images": 1203,
            "accuracy": 0.794,
            "balanced_accuracy": 0.744,
            "macro_auc": 0.943,
            "macro_f1": 0.69,
            "per_class_recall": {
                "akiec": 0.67,
                "bcc": 0.79,
                "bkl": 0.57,
                "df": 1.00,
                "mel": 0.59,
                "nv": 0.88,
                "vasc": 0.71
            },
            "per_source_balanced_accuracy": {
                "HAM": 0.73,
                "PAD": 0.63
            },
            "melanoma_precision": 0.47,
            "melanoma_notes": "Of 112 true melanomas, 31 were labelled nevus and 46 nevi were labelled melanoma."
        },
        "datasets": "HAM10000 (dermoscopy, mostly Austria/Australia, lighter skin) + PAD-UFES-20 (smartphone photos, Brazil). Performance on other skin tones, cameras, body sites and non-dermoscopic photos is unverified.",
        "limitations": [
            "IMAGE-ONLY: Does not use age, sex, body site or symptoms for analysis.",
            "Label merges: squamous cell carcinoma merged into akiec, seborrheic keratosis merged into bkl.",
            "Misses some melanomas. A changing, growing, or atypical mole should be checked regardless of the result."
        ]
    }

@app.post("/api/analyze")
async def analyze(
    image: UploadFile = File(...),
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
    # Validate image format and size
    logger.info(f"Received request for analyze: file_type={image.content_type}")
    if image.content_type not in ["image/jpeg", "image/png", "image/webp"]:
        logger.warning(f"Invalid format: {image.content_type}")
        return {"input_check": {"level": "reject", "reasons": ["Invalid image format. Only JPG, PNG, WEBP allowed."]}}
    
    # Read to memory
    content = await image.read()
    if len(content) > config.max_image_size_mb * 1024 * 1024:
        logger.warning(f"Image too large: {len(content)} bytes")
        return {"input_check": {"level": "reject", "reasons": [f"Image exceeds maximum size of {config.max_image_size_mb} MB."]}}
    
    try:
        # Strip EXIF while opening
        img = Image.open(BytesIO(content))
        data = list(img.getdata())
        image_without_exif = Image.new(img.mode, img.size)
        image_without_exif.putdata(data)
        img = image_without_exif
    except Exception as e:
        logger.error(f"Image parse error: {e}")
        return {"input_check": {"level": "reject", "reasons": ["Could not parse image."]}}
        
    logger.info("Image parsed successfully")
        
    symptoms = {
        "itch": itch,
        "grew": grew,
        "hurt": hurt,
        "changed": changed,
        "bleed": bleed,
        "personal_skin_cancer_history": personal_skin_cancer_history
    }
    
    result = skin_model.analyze_image(img, symptoms)
    
    logger.info(f"Analysis complete: input_check={result.get('input_check', {}).get('level')}")
    
    # Attach conditions content for convenience
    top_class = result.get("top3", [{"class": ""}])[0]["class"] if result.get("top3") else ""
    if "input_check" in result and result["input_check"]["level"] == "reject":
        pass
    else:
        result["content"] = conditions_content
        
    # NV extra warning
    if top_class == "nv":
        if "guidance" not in result:
            result["guidance"] = []
        result["guidance"].append("This tool misses some melanomas. A mole that is changing, growing, itching, bleeding or looks different from your others should be checked regardless of this result.")

    return result

