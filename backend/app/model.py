import os
import time
import math
import cv2
import base64
import torch
import torch.nn.functional as F
import numpy as np
import timm
from PIL import Image
from io import BytesIO
import matplotlib.cm as cm
from typing import Dict, Any, List

from .config import config
from .segmentation import DefaultSegmenter

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
        
        # Build with timm
        self.model = timm.create_model("efficientnet_b0", pretrained=False, num_classes=7)
        if os.path.exists(model_path):
            state_dict = torch.load(model_path, map_location=self.device)
            # handle cases where model weights are saved inside a model state dict
            if 'state_dict' in state_dict:
                state_dict = state_dict['state_dict']
            self.model.load_state_dict(state_dict)
            
        self.model.to(self.device)
        self.model.eval()

        self.segmenter = DefaultSegmenter()

        # Hooks for Grad-CAM
        self.activations = None
        self.gradients = None

        def forward_hook(module, args, output):
            self.activations = output

        def backward_hook(module, grad_input, grad_output):
            self.gradients = grad_output[0]

        # Attach hooks to the last conv block. 
        # For efficientnet_b0, model.conv_head is usually the last feature map before pooling.
        if hasattr(self.model, 'conv_head'):
            self.model.conv_head.register_forward_hook(forward_hook)
            self.model.conv_head.register_full_backward_hook(backward_hook)
        elif hasattr(self.model, 'bn2'):
            self.model.bn2.register_forward_hook(forward_hook)
            self.model.bn2.register_full_backward_hook(backward_hook)

    def generate_gradcam(self, input_tensor: torch.Tensor, class_idx: int) -> np.ndarray:
        self.model.zero_grad()
        
        output = self.model(input_tensor)
        
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

    def analyze_image(self, img: Image.Image, symptoms: Dict[str, bool]) -> Dict[str, Any]:
        start_time = time.time()
        
        # 1. Validation checks on image content
        original_img = img.copy()
        if original_img.mode != 'RGB':
            original_img = original_img.convert('RGB')
        img_np = np.array(original_img)
        
        input_check = {"level": "ok", "reasons": []}
        
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
            
        # Skin color check
        # Naive approach in YCrCb space
        ycrcb = cv2.cvtColor(img_np, cv2.COLOR_RGB2YCrCb)
        mask_cr = (ycrcb[:,:,1] > 133) & (ycrcb[:,:,1] < 173)
        mask_cb = (ycrcb[:,:,2] > 77) & (ycrcb[:,:,2] < 127)
        skin_mask = mask_cr & mask_cb
        skin_ratio = np.sum(skin_mask) / (img.width * img.height)
        
        if skin_ratio < 0.05:
            # Maybe reject if it's purely synthetic or obviously non-skin
            # e.g., a solid color or gradient
            color_std = np.std(img_np, axis=(0, 1))
            if np.all(color_std < 5):
                input_check["level"] = "reject"
                input_check["reasons"].append("Image lacks color variation and does not appear to be a photo of skin.")
            else:
                input_check["level"] = "warning"
                input_check["reasons"].append("This does not look like a typical skin photo.")
        
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
        
        # 3. Model Inference (TTA)
        with torch.no_grad():
            outputs = self.model(batch)
            outputs = outputs / config.temperature
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
        
        input_check_top_prob = float(np.max(avg_probs))
        if input_check_top_prob < 0.2 and norm_entropy > 0.9:
            # Overriding check if output is highly uncertain
            if input_check["level"] != "warning":
                input_check["level"] = "warning"
                input_check["reasons"].append("The model is deeply uncertain. Ensure this is a clear, well-lit photo of a skin lesion.")
                
        # 4. Uncertainty
        inconclusive = False
        unc_level = "low"
        
        if top1_prob < config.uncertainty_prob_threshold or margin < config.uncertainty_margin_threshold or view_agreement < config.uncertainty_view_agreement_threshold:
            inconclusive = True
            unc_level = "high"
        elif top1_prob < 0.7 or margin < 0.3:
            unc_level = "moderate"
            
        # 5. Risk grouping
        p_mel = float(avg_probs[config.classes.index("mel")])
        p_bcc = float(avg_probs[config.classes.index("bcc")])
        p_akiec = float(avg_probs[config.classes.index("akiec")])
        
        p_malignant = sum([float(avg_probs[config.classes.index(c)]) for c in config.malignant_group])
        p_precancerous = sum([float(avg_probs[config.classes.index(c)]) for c in config.precancerous_group])
        p_benign = sum([float(avg_probs[config.classes.index(c)]) for c in config.benign_group])
        
        tier = "routine_monitor"
        reasons = []
        
        symptom_active = any(symptoms.get(s, False) for s in ["grew", "changed", "bleed", "itch", "hurt", "personal_skin_cancer_history"])
        
        # Urgent review logic
        if p_mel >= 0.35:
            tier = "urgent_review"
            reasons.append("High model score for melanoma.")
        elif any(symptoms.get(s, False) for s in ["grew", "changed", "bleed"]) and (p_mel + p_bcc + p_akiec >= 0.30):
            tier = "urgent_review"
            reasons.append("Patient reported concerning symptoms (growth/change/bleeding) combined with elevated model risk.")
        
        # See doctor soon logic (if not already urgent)
        elif tier == "routine_monitor":
            if p_mel >= 0.15:
                tier = "see_doctor_soon"
                reasons.append("Elevated model score for melanoma.")
            elif (p_mel + p_bcc + p_akiec >= 0.40):
                tier = "see_doctor_soon"
                reasons.append("Elevated risk of pre-cancer or cancer.")
            elif inconclusive:
                tier = "see_doctor_soon"
                reasons.append("The model's analysis was inconclusive.")
            elif symptom_active:
                tier = "see_doctor_soon"
                reasons.append("Patient reported symptoms like itching, pain, or changes.")
                
        # 6. Grad-CAM
        # We need gradients, so re-run forward pass with require_grad on for the original image tensor
        t_img_grad = t_img.unsqueeze(0).clone()
        t_img_grad.requires_grad = True
        gradcam = self.generate_gradcam(t_img_grad, top1_idx)
        
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
        
        # Focus sanity check
        focus_warning = False
        # Calculate mass on the edges (let's say 15% margin)
        margin_y = int(0.15 * h)
        margin_x = int(0.15 * w)
        edge_mask = np.ones((h, w), dtype=bool)
        edge_mask[margin_y:-margin_y, margin_x:-margin_x] = False
        total_mass = np.sum(full_gradcam)
        if total_mass > 0:
            edge_mass = np.sum(full_gradcam[edge_mask])
            if edge_mass / total_mass > 0.6:
                focus_warning = True
                
        # 7. Segmentation
        # The segmenter uses the GradCAM
        polygon = self.segmenter.segment(img_np, full_gradcam)
        
        # 8. Guidance text
        guidance = []
        if symptoms.get("grew", False):
            guidance.append("You noted growth. Tell the doctor how fast it has been growing.")
        if symptoms.get("changed", False):
            guidance.append("You noted a change. Describe exactly what looks different (color, shape).")
        if symptoms.get("bleed", False):
            guidance.append("You noted bleeding. Mention if it bled without being scratched or bumped.")
            
        result = {
            "probabilities": {config.classes[i]: float(avg_probs[i]) for i in range(len(config.classes))},
            "top3": [{"class": config.classes[idx], "prob": float(avg_probs[idx])} for idx in top_indices[:3]],
            "inconclusive": inconclusive,
            "uncertainty": {
                "margin": margin,
                "entropy": norm_entropy,
                "view_agreement": view_agreement,
                "level": unc_level
            },
            "risk": {
                "tier": tier,
                "group_probs": {
                    "malignant": p_malignant,
                    "precancerous": p_precancerous,
                    "benign": p_benign
                },
                "reasons": reasons
            },
            "input_check": input_check,
            "gradcam": {
                "overlay": overlay_b64,
                "heatmap": heatmap_b64,
                "focus_warning": "The model may be reacting to the image edge or background, not the lesion." if focus_warning else None
            },
            "outline": {
                "polygon": polygon,
                "method": "Approximate region of interest, not a medical segmentation."
            },
            "guidance": guidance,
            "inference_ms": int((time.time() - start_time) * 1000)
        }
        
        return result
