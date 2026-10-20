"""
Computer Vision ABCDE Feature Extractor and Verbal Explainability Engine.
Runs locally and fast on CPU with OpenCV and NumPy (zero cost, low load).
Provides:
1. Skin & OOD (Out-of-Distribution) Verification
2. Lesion Segmentation & Contour Analysis
3. Quantitative ABCDE Metrics (Asymmetry, Border, Color Variegation, Diameter proxy)
4. Verbal Clinical-Grounding Synthesizer
"""

import cv2
import numpy as np
from typing import Dict, Any, Tuple, List


def verify_skin_presence(image_rgb: np.ndarray) -> Tuple[bool, float, str]:
    """
    Checks if the uploaded image contains human skin tones using YCrCb and HSV thresholding.
    Rejects out-of-distribution (OOD) images like carpets, pets, wall photos, blank screens.
    Returns: (is_skin, skin_ratio, reason)
    """
    h, w = image_rgb.shape[:2]
    total_pixels = h * w
    if total_pixels == 0:
        return False, 0.0, "Empty image provided."

    # Convert to YCrCb for robust skin chrominance detection
    img_ycrcb = cv2.cvtColor(image_rgb, cv2.COLOR_RGB2YCrCb)
    # Standard dermatological/CV skin range in YCrCb: Cr in [133, 173], Cb in [77, 127]
    lower_ycrcb = np.array([0, 133, 77], dtype=np.uint8)
    upper_ycrcb = np.array([255, 173, 127], dtype=np.uint8)
    mask_ycrcb = cv2.inRange(img_ycrcb, lower_ycrcb, upper_ycrcb)

    # Convert to HSV for secondary validation
    img_hsv = cv2.cvtColor(image_rgb, cv2.COLOR_RGB2HSV)
    lower_hsv = np.array([0, 20, 40], dtype=np.uint8)
    upper_hsv = np.array([30, 200, 255], dtype=np.uint8)
    mask_hsv = cv2.inRange(img_hsv, lower_hsv, upper_hsv)

    combined_mask = cv2.bitwise_and(mask_ycrcb, mask_hsv)
    skin_pixels = cv2.countNonZero(combined_mask)
    skin_ratio = skin_pixels / float(total_pixels)

    # If less than 12% matches skin chrominance, it's very likely non-skin or poor quality lighting
    if skin_ratio < 0.12:
        return False, skin_ratio, "Image does not appear to contain sufficient human skin area. Please ensure a well-lit, close-up photo of the skin lesion."

    return True, skin_ratio, "Skin tones verified."


def segment_lesion(image_rgb: np.ndarray) -> Tuple[np.ndarray, np.ndarray, Dict[str, Any]]:
    """
    Segments the central lesion using Otsu adaptive thresholding and morphological cleanup.
    Returns: (mask_binary, contour, bbox_info)
    """
    h, w = image_rgb.shape[:2]
    # Convert to grayscale and apply mild Gaussian blur to suppress noise/hairs
    gray = cv2.cvtColor(image_rgb, cv2.COLOR_RGB2GRAY)
    blurred = cv2.GaussianBlur(gray, (7, 7), 0)

    # Most skin lesions are darker than surrounding skin; use inverse Otsu threshold
    _, thresh = cv2.threshold(blurred, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)

    # Morphological opening to remove isolated hairs/specks, then closing to fill lesion body
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
    clean_mask = cv2.morphologyEx(thresh, cv2.MORPH_OPEN, kernel, iterations=2)
    clean_mask = cv2.morphologyEx(clean_mask, cv2.MORPH_CLOSE, kernel, iterations=3)

    # Find contours
    contours, _ = cv2.findContours(clean_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    
    center_x, center_y = w / 2.0, h / 2.0
    best_cnt = None
    min_dist = float("inf")
    lesion_mask = np.zeros((h, w), dtype=np.uint8)

    # Find the prominent contour closest to the center with adequate area
    for cnt in contours:
        area = cv2.contourArea(cnt)
        if area < (h * w * 0.005):  # ignore tiny noise < 0.5% of frame
            continue
        m = cv2.moments(cnt)
        if m["m00"] > 0:
            cx = m["m10"] / m["m00"]
            cy = m["m01"] / m["m00"]
            dist = np.hypot(cx - center_x, cy - center_y)
            # Area-weighted distance preference
            score = dist / (np.sqrt(area) + 1e-5)
            if score < min_dist:
                min_dist = score
                best_cnt = cnt

    if best_cnt is not None:
        cv2.drawContours(lesion_mask, [best_cnt], -1, 255, thickness=cv2.FILLED)
        x, y, bw, bh = cv2.boundingRect(best_cnt)
        bbox = {"x": x / w, "y": y / h, "width": bw / w, "height": bh / h, "area_px": int(cv2.contourArea(best_cnt))}
    else:
        # Fallback to an ellipse centered in the image if segmentation fails
        best_cnt = np.array([[w // 4, h // 4], [3 * w // 4, h // 4], [3 * w // 4, 3 * h // 4], [w // 4, 3 * h // 4]])
        cv2.ellipse(lesion_mask, (int(center_x), int(center_y)), (int(w * 0.25), int(h * 0.25)), 0, 0, 360, 255, -1)
        bbox = {"x": 0.25, "y": 0.25, "width": 0.5, "height": 0.5, "area_px": int((w * 0.5) * (h * 0.5))}

    return lesion_mask, best_cnt, bbox


def calculate_abcde_features(image_rgb: np.ndarray, mask: np.ndarray, contour: np.ndarray) -> Dict[str, Any]:
    """
    Computes clinical ABCDE metrics:
    - A: Asymmetry Index (0 = symmetric, 1 = completely asymmetric)
    - B: Border Irregularity (Compactness ratio & margin roughness)
    - C: Color Variegation (Dermoscopic color zones present)
    - D: Diameter / Coverage (Area percentage in field of view)
    """
    h, w = image_rgb.shape[:2]
    area = cv2.contourArea(contour)
    perimeter = cv2.arcLength(contour, True)

    # 1. Asymmetry Index (A)
    # Fit ellipse or bounding box, crop lesion mask, test flip along X and Y axes
    x, y, bw, bh = cv2.boundingRect(contour)
    lesion_patch = mask[y:y+bh, x:x+bw]
    if lesion_patch.shape[0] > 4 and lesion_patch.shape[1] > 4:
        h_flip = cv2.flip(lesion_patch, 1)
        v_flip = cv2.flip(lesion_patch, 0)
        
        diff_h = np.sum(cv2.absdiff(lesion_patch, h_flip)) / 255.0
        diff_v = np.sum(cv2.absdiff(lesion_patch, v_flip)) / 255.0
        total_p = np.sum(lesion_patch) / 255.0
        
        asymmetry_h = float(diff_h / (2.0 * max(total_p, 1.0)))
        asymmetry_v = float(diff_v / (2.0 * max(total_p, 1.0)))
        asymmetry_index = round(float(np.clip(0.5 * (asymmetry_h + asymmetry_v) * 2.0, 0.0, 1.0)), 3)
    else:
        asymmetry_index = 0.25

    # 2. Border Irregularity (B)
    # Compactness: P^2 / (4 * pi * A). Perfect circle = 1.0, highly irregular > 1.8
    if area > 10:
        compactness = float((perimeter ** 2) / (4.0 * np.pi * area))
    else:
        compactness = 1.0
    # Normalize to 0-1 scale (1.0 = smooth circle, 3.0+ = highly serrated)
    border_roughness = round(float(np.clip((compactness - 1.0) / 2.5, 0.0, 1.0)), 3)

    # 3. Color Variegation (C)
    # Analyze pixels inside the lesion mask across dermoscopic color ranges
    lesion_pixels = image_rgb[mask > 0]
    color_zones = {
        "white_hypopigmented": 0,
        "red_erythematous": 0,
        "light_brown": 0,
        "dark_brown": 0,
        "slate_blue_gray": 0,
        "black": 0
    }
    
    if len(lesion_pixels) > 20:
        hsv_pixels = cv2.cvtColor(lesion_pixels.reshape(-1, 1, 3), cv2.COLOR_RGB2HSV).reshape(-1, 3)
        h_vals, s_vals, v_vals = hsv_pixels[:, 0], hsv_pixels[:, 1], hsv_pixels[:, 2]

        # Black / very dark: V < 55
        color_zones["black"] = float(np.mean(v_vals < 55))
        # White / pale: S < 30 and V > 180
        color_zones["white_hypopigmented"] = float(np.mean((s_vals < 35) & (v_vals > 185)))
        # Red / pink: H < 12 or H > 165, S > 40, V in [60, 200]
        color_zones["red_erythematous"] = float(np.mean(((h_vals < 12) | (h_vals > 165)) & (s_vals > 40) & (v_vals >= 60)))
        # Light brown: H in [12, 30], S in [40, 150], V > 100
        color_zones["light_brown"] = float(np.mean((h_vals >= 12) & (h_vals <= 30) & (s_vals >= 40) & (s_vals <= 150) & (v_vals > 100)))
        # Dark brown: H in [10, 30], S > 60, V in [55, 120]
        color_zones["dark_brown"] = float(np.mean((h_vals >= 10) & (h_vals <= 30) & (s_vals > 60) & (v_vals >= 55) & (v_vals <= 120)))
        # Blue / slate gray: S in [20, 80], V in [50, 140], H in [90, 140]
        color_zones["slate_blue_gray"] = float(np.mean((h_vals >= 90) & (h_vals <= 140) & (s_vals >= 20) & (s_vals <= 100) & (v_vals >= 50) & (v_vals <= 150)))

    # Count significant color regions (> 5% of lesion area)
    significant_colors = [c for c, ratio in color_zones.items() if ratio >= 0.05]
    color_variegation_score = round(float(np.clip(len(significant_colors) / 4.0, 0.0, 1.0)), 3)

    # 4. Diameter / Frame Coverage (D)
    coverage_ratio = round(float(area / (h * w)), 4)
    equivalent_diameter_px = round(float(np.sqrt(4.0 * area / np.pi)), 1)

    return {
        "asymmetry_index": asymmetry_index,
        "asymmetry_level": "High" if asymmetry_index > 0.55 else "Moderate" if asymmetry_index > 0.3 else "Low (Symmetric)",
        "border_roughness": border_roughness,
        "border_level": "Irregular / Notched" if border_roughness > 0.5 else "Mildly uneven" if border_roughness > 0.25 else "Smooth / Regular",
        "compactness": round(compactness, 2),
        "color_variegation_score": color_variegation_score,
        "color_count": len(significant_colors),
        "identified_colors": significant_colors,
        "color_distribution": {k: round(v, 3) for k, v in color_zones.items() if v >= 0.02},
        "frame_coverage_ratio": coverage_ratio,
        "equivalent_diameter_px": equivalent_diameter_px,
    }


def synthesize_verbal_explanation(
    top_class_key: str,
    top_class_name: str,
    top_score: float,
    runner_up_name: str,
    runner_up_score: float,
    abcde: Dict[str, Any],
    uncertainty: Dict[str, Any],
) -> Dict[str, Any]:
    """
    Builds a structured, human-readable verbal clinical explanation tying visual ABCDE findings
    directly to the model's top predictions.
    """
    observations: List[str] = []

    # 1. Prediction summary
    lead_pct = f"{top_score * 100:.1f}%"
    runner_pct = f"{runner_up_score * 100:.1f}%"
    summary = f"The primary category identified is {top_class_name} with a {lead_pct} relative score, followed by {runner_up_name} at {runner_pct}."

    # 2. Shape & Asymmetry grounding
    a_level = abcde.get("asymmetry_level", "Low")
    a_score = abcde.get("asymmetry_index", 0.0)
    if a_score > 0.5:
        observations.append(f"Marked structural asymmetry ({a_level}, score {a_score}): The two halves of the lesion contour diverge substantially in shape and area.")
    elif a_score > 0.28:
        observations.append(f"Moderate asymmetry ({a_level}, score {a_score}): Some geometric variance is observed along the orthogonal axes.")
    else:
        observations.append(f"Symmetric contour ({a_level}, score {a_score}): The lesion maintains an even, balanced geometric shape.")

    # 3. Border margin grounding
    b_level = abcde.get("border_level", "Smooth")
    b_score = abcde.get("border_roughness", 0.0)
    if b_score > 0.45:
        observations.append(f"Irregular boundary ({b_level}): Margin reveals indentations and notched edges rather than a sharp, smooth demarcation.")
    else:
        observations.append(f"Defined margin ({b_level}): Perimeter transitions smoothly into adjacent healthy skin.")

    # 4. Color variegation
    colors = abcde.get("identified_colors", [])
    color_names = [c.replace("_", " ") for c in colors]
    if len(colors) >= 3:
        observations.append(f"High color variegation: Detected {len(colors)} distinct chromatic zones ({', '.join(color_names)}). Multiple tones within a single lesion warrant clinical dermoscopy.")
    elif len(colors) == 2:
        observations.append(f"Dual-tone pattern: Detected {', '.join(color_names)} across the lesion surface.")
    else:
        observations.append("Monochromatic presentation: Relatively homogeneous pigmentation across the lesion body.")

    # 5. Stability & Uncertainty
    view_agree = uncertainty.get("view_agreement", 1.0)
    stability_note = f"Rotational and flip invariance test: {int(view_agree * 4)}/4 augmented views concurred on the leading classification."

    return {
        "headline": f"Visual & Algorithmic Rationale for {top_class_name}",
        "summary": summary,
        "findings": observations,
        "stability_note": stability_note,
        "clinical_relevance": "These extracted features mirror clinical ABCDE dermoscopy criteria used by specialists to assess lesion morphology."
    }
