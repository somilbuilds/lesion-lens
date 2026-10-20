import os
import time
import cv2
import base64
import torch
import torch.nn.functional as F
import numpy as np
import timm
from PIL import Image
from io import BytesIO
import matplotlib.cm as cm
from typing import Dict, Any

from .config import config
from .vision_features import (
    verify_skin_presence,
    segment_lesion,
    calculate_abcde_features,
    synthesize_verbal_explanation,
)


class SkinFusionNet(torch.nn.Module):
    """Checkpoint-compatible EfficientNet plus optional HAM10000 metadata head."""
    def __init__(self, metadata_dim: int, pretrained: bool = False):
        super().__init__()
        self.mdim = int(metadata_dim)
        self.encoder = timm.create_model("efficientnet_b0", pretrained=pretrained, num_classes=0)
        image_dim = self.encoder.num_features
        if self.mdim:
            self.fusion = torch.nn.Sequential(
                torch.nn.Linear(image_dim + self.mdim, 512), torch.nn.LayerNorm(512),
                torch.nn.ReLU(), torch.nn.Dropout(0.35), torch.nn.Linear(512, len(config.classes)),
            )
        else:
            self.fusion = torch.nn.Linear(image_dim, len(config.classes))

    def forward(self, images: torch.Tensor, metadata: torch.Tensor = None) -> torch.Tensor:
        features = self.encoder(images)
        if self.mdim:
            if metadata is None:
                metadata = torch.zeros((len(images), self.mdim), device=images.device)
            features = torch.cat([features, metadata], dim=1)
        return self.fusion(features)

# Image transformations for inference (exactly as training)
# RGB, Resize(224) short side, CenterCrop(224), ToTensor, Normalize
def preprocess_image(img: Image.Image) -> torch.Tensor:
    if img.mode != 'RGB':
        img = img.convert('RGB')
    
    # Resize shorter side to 224
    w, h = img.size
    min_side = min(w, h)
    ratio = 224.0 / min_side
    new_w, new_h = int(w * ratio), int(h * ratio)
    img = img.resize((new_w, new_h), Image.Resampling.BILINEAR)

    # Center crop 224x224
    left = (new_w - 224) // 2
    top = (new_h - 224) // 2
    img = img.crop((left, top, left + 224, top + 224))

    # ToTensor
    img_np = np.array(img).astype(np.float32) / 255.0
    img_np = img_np.transpose((2, 0, 1)) # HWC to CHW

    # Normalize
    mean = np.array([0.485, 0.456, 0.406]).astype(np.float32).reshape(3, 1, 1)
    std = np.array([0.229, 0.224, 0.225]).astype(np.float32).reshape(3, 1, 1)
    img_np = (img_np - mean) / std

    return torch.tensor(img_np, dtype=torch.float32)


class SkinModel:
    def __init__(self, model_path: str):
        self.device = torch.device('cpu')
        if not os.path.isfile(model_path):
            raise FileNotFoundError(f"Required model checkpoint is missing: {model_path}")
        
        # Older app checkpoints include NumPy training metrics; allowlist only
        # those inert NumPy types when using PyTorch's restricted loader.
        numpy_core = getattr(np, "_core", None) or getattr(np, "core")
        safe_types = [numpy_core.multiarray.scalar, np.dtype]
        float64_dtype = getattr(getattr(np, "dtypes", None), "Float64DType", None)
        if float64_dtype is not None:
            safe_types.append(float64_dtype)
        with torch.serialization.safe_globals(safe_types):
            checkpoint = torch.load(model_path, map_location=self.device, weights_only=True)

        self.model_type = "efficientnet_b0_image_only_v1"
        self.metadata_schema = None
        self.metadata_dim = 0
        self.temperature = config.temperature
        if isinstance(checkpoint, dict) and "model_type" in checkpoint:
            self.model_type = checkpoint["model_type"]
            state_dict = checkpoint.get("model_state")
            self.metadata_schema = checkpoint.get("metadata_schema")
            self.temperature = float(checkpoint.get("temperature", config.temperature))
            if self.model_type == "efficientnet_b0_metadata_fusion_v1":
                if not isinstance(self.metadata_schema, dict):
                    raise ValueError("Metadata-fusion checkpoint is missing metadata_schema")
                self.metadata_dim = len(self.metadata_schema.get("feature_names", []))
                if self.metadata_dim < 1:
                    raise ValueError("Metadata-fusion checkpoint has an empty feature schema")
                self.model = SkinFusionNet(self.metadata_dim, pretrained=False)
            elif self.model_type == "efficientnet_b0_image_only_v1":
                self.model = SkinFusionNet(0, pretrained=False)
            else:
                raise ValueError(f"Unsupported checkpoint model_type: {self.model_type}")
        else:
            self.model = timm.create_model("efficientnet_b0", pretrained=False, num_classes=7)
            state_dict = checkpoint
            if isinstance(state_dict, dict) and "state_dict" in state_dict:
                state_dict = state_dict["state_dict"]
            elif isinstance(state_dict, dict) and "model_state" in state_dict:
                state_dict = state_dict["model_state"]
        if not isinstance(state_dict, dict):
            raise ValueError("Model checkpoint does not contain a valid state dictionary")
        self.model.load_state_dict(state_dict)
            
        self.model.to(self.device)
        self.model.eval()

        # Hooks for Grad-CAM
        self.activations = None
        self.gradients = None

        def forward_hook(module, args, output):
            self.activations = output

        def backward_hook(module, grad_input, grad_output):
            self.gradients = grad_output[0]

        # Attach hooks to the last conv block. 
        # For efficientnet_b0, model.conv_head is usually the last feature map before pooling.
        feature_model = getattr(self.model, "encoder", self.model)
        if hasattr(feature_model, 'conv_head'):
            feature_model.conv_head.register_forward_hook(forward_hook)
            feature_model.conv_head.register_full_backward_hook(backward_hook)
        elif hasattr(feature_model, 'bn2'):
            feature_model.bn2.register_forward_hook(forward_hook)
            feature_model.bn2.register_full_backward_hook(backward_hook)

    def encode_metadata(self, metadata: Dict[str, Any], batch_size: int = 1) -> torch.Tensor:
        """Apply the training-time metadata schema; absent/unseen values map to unknown."""
        schema = self.metadata_schema or {}
        try:
            age = float(metadata.get("age"))
            age_missing = not np.isfinite(age)
        except (TypeError, ValueError):
            age, age_missing = float(schema.get("age_median", 0.0)), True
        if age_missing:
            age = float(schema.get("age_median", 0.0))
        age = float(np.clip(age, schema.get("age_lower", age), schema.get("age_upper", age)))
        age_z = (age - float(schema.get("age_median", 0.0))) / max(float(schema.get("age_std", 1.0)), 1e-6)
        sex_categories = schema.get("sex_categories", ["unknown"])
        location_categories = schema.get("localization_categories", ["unknown"])
        sex = str(metadata.get("sex") or "unknown").strip().lower()
        location = str(metadata.get("localization") or metadata.get("body_region") or "unknown").strip().lower()
        if sex not in sex_categories:
            sex = "unknown"
        if location not in location_categories:
            location = "unknown"
        values = [age_z, float(age_missing)]
        values.extend(float(sex == item) for item in sex_categories)
        values.extend(float(location == item) for item in location_categories)
        vector = torch.tensor(values, dtype=torch.float32, device=self.device)
        return vector.unsqueeze(0).expand(batch_size, -1).contiguous()

    def _forward(self, images: torch.Tensor, metadata: torch.Tensor = None) -> torch.Tensor:
        if self.metadata_dim:
            if metadata is None:
                metadata = torch.zeros((len(images), self.metadata_dim), device=images.device)
            return self.model(images, metadata)
        return self.model(images)

    def generate_gradcam(self, input_tensor: torch.Tensor, class_idx: int, metadata: torch.Tensor = None) -> np.ndarray:
        self.model.zero_grad()
        
        output = self._forward(input_tensor, metadata)
        
        # Calculate gradients for the target class
        target = output[0, class_idx]
        target.backward()

        gradients = self.gradients.cpu().data.numpy()[0]
        activations = self.activations.cpu().data.numpy()[0]

        # Global average pool the gradients
        weights = np.mean(gradients, axis=(1, 2))

        # Weight the channels
        cam = np.zeros(activations.shape[1:], dtype=np.float32)
        for i, w in enumerate(weights):
            cam += w * activations[i, :, :]

        # ReLU and normalize
        cam = np.maximum(cam, 0)
        cam = cam - np.min(cam)
        cam_max = np.max(cam)
        if cam_max != 0:
            cam = cam / cam_max
            
        # Resize to 224x224 match input
        cam_resized = cv2.resize(cam, (224, 224))
        return cam_resized
        
    def _array_to_base64(self, img_array: np.ndarray) -> str:
        # img_array must be RGB or RGBA uint8
        img_pil = Image.fromarray(img_array)
        buffer = BytesIO()
        img_pil.save(buffer, format="PNG")
        buffer.seek(0)
        return "data:image/png;base64," + base64.b64encode(buffer.read()).decode('utf-8')


    def _occlusion_explanation(self, input_tensor: torch.Tensor, class_idx: int, metadata: torch.Tensor = None) -> Dict[str, Any]:
        """Measure how masking image patches changes the selected class score."""
        patch_size, step = 32, 28
        _, height, width = input_tensor.shape
        regions = [(x, y, min(x + patch_size, width), min(y + patch_size, height))
                   for y in range(0, height - patch_size + 1, step)
                   for x in range(0, width - patch_size + 1, step)]
        with torch.no_grad():
            baseline_metadata = metadata[:1] if metadata is not None else None
            baseline_logits = self._forward(input_tensor.unsqueeze(0).to(self.device), baseline_metadata) / self.temperature
            baseline_prob = float(F.softmax(baseline_logits, dim=-1)[0, class_idx].item())
            drops = []
            for start in range(0, len(regions), 16):
                region_batch = regions[start:start + 16]
                masked_batch = input_tensor.unsqueeze(0).repeat(len(region_batch), 1, 1, 1)
                for i, (x1, y1, x2, y2) in enumerate(region_batch):
                    # Zero in normalized space corresponds to ImageNet mean colour.
                    masked_batch[i, :, y1:y2, x1:x2] = 0.0
                mask_metadata = metadata[:1].expand(len(region_batch), -1) if metadata is not None else None
                logits = self._forward(masked_batch.to(self.device), mask_metadata) / self.temperature
                probs = F.softmax(logits, dim=-1)[:, class_idx].cpu().tolist()
                drops.extend(baseline_prob - float(p) for p in probs)
        if not drops:
            return {"available": False}
        best_idx = int(np.argmax(drops))
        return {
            "available": True,
            "baseline_probability": baseline_prob,
            "max_probability_drop": float(max(0.0, drops[best_idx])),
            "mean_positive_drop": float(np.mean([max(0.0, d) for d in drops])),
            "positive_patch_fraction": float(np.mean(np.array(drops) > 0)),
            "patch_grid": {
                "x_start": regions[best_idx][0] / width,
                "y_start": regions[best_idx][1] / height,
                "x_end": regions[best_idx][2] / width,
                "y_end": regions[best_idx][3] / height
            },
            "patch_size_px": patch_size,
            "patch_count": len(regions),
            "method": "32px patches, 28px stride; patches replaced with ImageNet mean colour"
        }

    def analyze_image(self, img: Image.Image, symptoms: Dict[str, bool], metadata: Dict[str, Any] = None) -> Dict[str, Any]:
        start_time = time.time()
        
        # 1. Validation checks on image content
        original_img = img.copy()
        if original_img.mode != 'RGB':
            original_img = original_img.convert('RGB')
        img_np = np.array(original_img)
        
        input_check = {"level": "ok", "reasons": []}
        
        # OOD Skin presence check
        is_skin, skin_ratio, skin_msg = verify_skin_presence(img_np)
        if not is_skin:
            if skin_ratio < 0.05:
                input_check["level"] = "reject"
                input_check["reasons"].append(skin_msg)
                return {
                    "input_check": input_check,
                    "inference_ms": int((time.time() - start_time) * 1000)
                }
            else:
                input_check["level"] = "warning"
                input_check["reasons"].append(skin_msg)
        
        # Image too small
        if img.width < config.min_short_side_px or img.height < config.min_short_side_px:
            input_check["level"] = "warning"
            input_check["reasons"].append(f"Image is too small (under {config.min_short_side_px}px on short side).")
            
        # Blur check
        gray = cv2.cvtColor(img_np, cv2.COLOR_RGB2GRAY)
        laplace_var = cv2.Laplacian(gray, cv2.CV_64F).var()
        if laplace_var < 50:
            input_check["level"] = "warning"
            input_check["reasons"].append("The photo appears very blurry.")
            
        if input_check["level"] == "reject":
            # Early return if rejected
            return {
                "input_check": input_check,
                "inference_ms": int((time.time() - start_time) * 1000)
            }
            
        # 2. TTA Preparation
        # Original, horizontally flipped, vertically flipped, both flipped
        t_img = preprocess_image(original_img)
        t_img_h = torch.flip(t_img, dims=[2])
        t_img_v = torch.flip(t_img, dims=[1])
        t_img_hv = torch.flip(t_img, dims=[1, 2])
        
        batch = torch.stack([t_img, t_img_h, t_img_v, t_img_hv]).to(self.device)
        metadata = metadata or {}
        metadata_tensor = self.encode_metadata(metadata, batch_size=4) if self.metadata_dim else None
        
        # 3. Model Inference (TTA)
        with torch.no_grad():
            outputs = self._forward(batch, metadata_tensor)
            outputs = outputs / self.temperature
            probs_batch = F.softmax(outputs, dim=-1).cpu().numpy()
            
        avg_probs = np.mean(probs_batch, axis=0)
        
        # Top classes
        top_indices = np.argsort(avg_probs)[::-1]
        top1_idx = top_indices[0]
        top1_prob = float(avg_probs[top1_idx])
        top1_class = config.classes[top1_idx]
        margin = float(avg_probs[top1_idx] - avg_probs[top_indices[1]])
        
        # Normalized entropy
        entropy = -np.sum(avg_probs * np.log(np.clip(avg_probs, 1e-7, 1.0)))
        max_entropy = np.log(len(config.classes))
        norm_entropy = float(entropy / max_entropy)
        
        # View agreement
        view_top_classes = [np.argmax(probs_batch[i]) for i in range(4)]
        view_agreement = sum(1 for c in view_top_classes if c == top1_idx) / 4.0
        
        # Keep raw stability signals for research display. Do not derive care tiers or
        # categorical confidence labels from unvalidated score thresholds.

        # Grad-CAM
        # We need gradients, so re-run forward pass with require_grad on for the original image tensor
        t_img_grad = t_img.unsqueeze(0).clone()
        t_img_grad.requires_grad = True
        gradcam = self.generate_gradcam(t_img_grad, top1_idx, metadata_tensor[:1] if metadata_tensor is not None else None)
        
        # Upsample Grad-CAM to original image size
        w, h = original_img.size
        # The gradcam is 224x224, but our image was center cropped.
        # However, for display simplicity, we can apply the gradcam back onto the original resized/cropped 
        # or map it back carefully.
        # Actually, let's just resize the original image to 224x224 and return that for the frontend,
        # or we upsample gradcam to the original image dimensions.
        # Since Grad-CAM is generated on the cropped version, it applies only to the cropped part.
        # Let's create an original-size full gradcam. We pad it so it aligns with the original image.
        
        min_side = min(w, h)
        ratio = 224.0 / min_side
        new_w, new_h = int(w * ratio), int(h * ratio)
        
        # Resize gradcam to the new_w, new_h crop box
        # Our crop was (left, top, left+224, top+224)
        # So we embed the 224x224 gradcam into a new_w, new_h array of zeros, 
        # then resize back to w, h
        
        full_gradcam_new = np.zeros((new_h, new_w), dtype=np.float32)
        left = (new_w - 224) // 2
        top = (new_h - 224) // 2
        full_gradcam_new[top:top+224, left:left+224] = gradcam
        
        # resize back to original image size
        full_gradcam = cv2.resize(full_gradcam_new, (w, h))
        
        # Create heatmap image
        heatmap_colored = cm.jet(full_gradcam)[:, :, :3]
        heatmap_colored = np.uint8(255 * heatmap_colored)
        
        # Create overlay
        overlay = np.uint8(0.4 * img_np + 0.6 * heatmap_colored)
        
        overlay_b64 = self._array_to_base64(overlay)
        heatmap_b64 = self._array_to_base64(heatmap_colored)
        
        # Segment lesion & calculate clinical ABCDE metrics
        lesion_mask, lesion_cnt, lesion_bbox = segment_lesion(img_np)
        abcde_metrics = calculate_abcde_features(img_np, lesion_mask, lesion_cnt)
        
        # Create lesion contour visualization
        contour_viz = img_np.copy()
        cv2.drawContours(contour_viz, [lesion_cnt], -1, (0, 235, 140), 2)
        contour_b64 = self._array_to_base64(contour_viz)
        
        # Explainability report: model-score evidence, stability, and perturbation sensitivity.
        occlusion = self._occlusion_explanation(t_img, top1_idx, metadata_tensor[:1] if metadata_tensor is not None else None)
        class_names = {
            "akiec": "actinic keratosis / intraepithelial carcinoma",
            "bcc": "basal cell carcinoma",
            "bkl": "benign keratosis-like lesion",
            "df": "dermatofibroma",
            "mel": "melanoma",
            "nv": "melanocytic nevus",
            "vasc": "vascular lesion"
        }
        top2_idx = int(top_indices[1])
        top2_class = config.classes[top2_idx]
        top2_prob = float(avg_probs[top2_idx])
        agreement_text = f"The same leading class appeared in {int(round(view_agreement * 4))} of 4 original/flip views."
        if occlusion.get("available"):
            drop_pp = occlusion["max_probability_drop"] * 100
            occlusion_text = f"Masking the most influential tested 32-pixel patch changed the leading-class score by up to {drop_pp:.1f} percentage points in this perturbation test."
        else:
            occlusion_text = "Patch occlusion analysis was unavailable."
        explanation_report = {
            "headline": f"The model ranked {class_names.get(top1_class, top1_class)} highest.",
            "narrative": [
                f"The leading class score was {top1_prob * 100:.1f}%; the second-ranked class was {class_names.get(top2_class, top2_class)} at {top2_prob * 100:.1f}%. These are model scores, not calibrated probabilities of disease.",
                f"The score margin was {margin * 100:.1f} percentage points; this is a comparison of model scores, not a measure of diagnostic certainty.",
                f"Normalized prediction entropy was {norm_entropy:.3f} on a 0–1 scale; higher values mean scores are more spread out.",
                agreement_text,
                occlusion_text,
                "Grad-CAM and patch occlusion describe model sensitivity, not validated medical features. They do not prove the model used clinically meaningful signs and are not a diagnosis."
            ],
            "metrics": {
                "top_class_score": top1_prob,
                "runner_up_score": top2_prob,
                "score_margin": margin,
                "normalized_entropy": norm_entropy,
                "view_agreement": view_agreement,
                "occlusion": occlusion
            }
        }
        verbal_explanation = synthesize_verbal_explanation(
            top1_class,
            class_names.get(top1_class, top1_class),
            top1_prob,
            class_names.get(top2_class, top2_class),
            top2_prob,
            abcde_metrics,
            {"view_agreement": view_agreement}
        )
        
        result = {
            "scores": {config.classes[i]: float(avg_probs[i]) for i in range(len(config.classes))},
            "abcde": abcde_metrics,
            "verbal_explanation": verbal_explanation,
            "contour_overlay": contour_b64,
            "lesion_bbox": lesion_bbox,
            "view_scores": [
                {"view": name, "scores": {config.classes[i]: float(probs_batch[view_idx][i]) for i in range(len(config.classes))}}
                for view_idx, name in enumerate(("original", "horizontal_flip", "vertical_flip", "horizontal_vertical_flip"))
            ],
            "explanation_report": explanation_report,
            "top3": [{"class": config.classes[idx], "score": float(avg_probs[idx])} for idx in top_indices[:3]],
            "uncertainty": {
                "margin": margin,
                "entropy": norm_entropy,
                "view_agreement": view_agreement
            },
            "model_context": {
                "metadata_supported": bool(self.metadata_dim),
                "metadata_used": bool(self.metadata_dim),
                "provided": {
                    "age": metadata.get("age") not in (None, ""),
                    "sex": metadata.get("sex") not in (None, "", "unknown"),
                    "localization": metadata.get("localization", metadata.get("body_region")) not in (None, "", "unknown"),
                },
                "feature_names": (self.metadata_schema or {}).get("feature_names", []),
            },
            "input_check": input_check,
            "gradcam": {
                "overlay": overlay_b64,
                "heatmap": heatmap_b64
            },
            "inference_ms": int((time.time() - start_time) * 1000)
        }
        
        return result
