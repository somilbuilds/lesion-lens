import io
import os
import pytest
import numpy as np
from PIL import Image
from fastapi.testclient import TestClient
import torch

from app.main import app, skin_model
from app.config import config
from app.model import preprocess_image

client = TestClient(app)

def create_test_image(color=(210, 155, 125), size=(300, 300)):
    # Create a basic skin-colored image with a small central pigmented lesion
    img = Image.new('RGB', size, color=color)
    img_np = np.array(img).astype(np.float32)
    # Add subtle skin texture noise
    noise = np.random.normal(0, 5, img_np.shape)
    img_np = np.clip(img_np + noise, 0, 255).astype(np.uint8)

    # Add a pigmented spot in the center so segmentation & ABCDE have a lesion
    w, h = size
    y_idx, x_idx = np.ogrid[:h, :w]
    mask = ((x_idx - w // 2) ** 2 + (y_idx - h // 2) ** 2) <= (w // 6) ** 2
    img_np[mask] = [95, 55, 40]  # dark brown nevus tone

    return Image.fromarray(img_np)

def image_to_bytes(img):
    buf = io.BytesIO()
    img.save(buf, format='JPEG')
    return buf.getvalue()

def test_preprocessing_shape():
    img = create_test_image(size=(300, 400))
    tensor = preprocess_image(img)
    assert tensor.shape == (3, 224, 224)
    batch = tensor.unsqueeze(0)
    assert batch.shape == (1, 3, 224, 224)

def test_class_order():
    expected = ["akiec", "bcc", "bkl", "df", "mel", "nv", "vasc"]
    assert config.classes == expected

def test_probabilities_sum_to_1():
    img = create_test_image()
    res = skin_model.analyze_image(img, {})
    if res.get("input_check", {}).get("level") != "reject":
        scores = res.get("scores", {})
        assert len(scores) == 7
        assert np.isclose(sum(scores.values()), 1.0, atol=1e-3)

def test_validation_errors():
    img = create_test_image(size=(50, 50))
    res = client.post("/api/analyze", files={"image": ("test.jpg", image_to_bytes(img), "image/jpeg")})
    assert res.status_code == 200
    data = res.json()
    assert data["input_check"]["level"] in ["warning", "reject"]
    assert any("too small" in r for r in data["input_check"]["reasons"])

def test_reject_non_skin():
    # Plain solid blue image (zero skin tone)
    img = Image.new('RGB', (300, 300), color=(0, 0, 255))
    res = client.post("/api/analyze", files={"image": ("test.jpg", image_to_bytes(img), "image/jpeg")})
    assert res.status_code == 200
    data = res.json()
    assert data["input_check"]["level"] == "reject"
    assert any("skin" in r.lower() for r in data["input_check"]["reasons"])

def test_abcde_and_verbal_explanation_present():
    img = create_test_image()
    res = client.post("/api/analyze", files={"image": ("test.jpg", image_to_bytes(img), "image/jpeg")})
    assert res.status_code == 200
    data = res.json()
    assert "abcde" in data
    assert "asymmetry_index" in data["abcde"]
    assert "border_roughness" in data["abcde"]
    assert "color_variegation_score" in data["abcde"]
    assert "verbal_explanation" in data
    assert "headline" in data["verbal_explanation"]
    assert "findings" in data["verbal_explanation"]

def test_copilot_chat_endpoint():
    payload = {
        "messages": [{"role": "user", "content": "What does my asymmetry score mean?"}],
        "context": {"top_class": "nv", "asymmetry_level": "Moderate"}
    }
    res = client.post("/api/chat/copilot", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert "reply" in data
    assert "provider" in data

def test_end_to_end_call():
    img = create_test_image()
    res = client.post(
        "/api/analyze", 
        files={"image": ("test.jpg", image_to_bytes(img), "image/jpeg")},
        data={"grew": True}
    )
    assert res.status_code == 200
    data = res.json()
    assert "input_check" in data
    assert "scores" in data
    assert "top3" in data
