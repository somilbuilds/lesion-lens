# SkinLesionNet — Clinical Dermatology Intelligence & Explainability Platform

SkinLesionNet is a modern clinical-grade research and learning platform for exploring skin lesion image classification, understanding dermatological morphology (ABCDE), and preparing for doctor consultations.

A model score is an adjunct research tool, not a definitive diagnosis, and does not replace a clinical biopsy.

---

## What's New & Upgraded

### 1. Multi-Modal Explainability & Computer Vision ABCDE Engine
- **Computer Vision Morphology Extraction**: Automatically segments the lesion and computes quantitative ABCDE features:
  - **A (Asymmetry Index)**: Orthogonal axis flip divergence score (0.0 to 1.0).
  - **B (Border Irregularity)**: Isoperimetric compactness ratio ($P^2 / 4\pi A$) and margin roughness.
  - **C (Color Variegation)**: Identifies presence of 6 clinical dermoscopic color zones (light brown, dark brown, black, red/erythematous, slate blue-gray, white/hypopigmentation).
  - **D (Diameter & Area)**: Equivalent pixel diameter and relative frame coverage.
- **Verbal Explainability Rationale**: Generates plain-English clinical explanations tying morphological contours to classification scores.
- **5-Mode Diagnostic Visualizer**:
  1. *Original Photo*: High-resolution unedited view.
  2. *Lesion Border*: Computer-vision segmented boundary contour in neon green.
  3. *Attribution Overlay*: High-resolution Grad-CAM activation overlay.
  4. *Heatmap*: Standalone activation intensity map.
  5. *Perturbation Patch*: 32px patch occlusion sensitivity analysis.

### 2. Interactive Clinical AI Copilot (Powered by Groq LLM)
- Multi-turn interactive conversational copilot grounded in the user's specific lesion morphology and clinical guidelines.
- Patients can ask follow-up questions about their asymmetry scores, border irregularities, and how to discuss findings with their doctor.
- Includes 1-click clinical prompt pills for common patient inquiries.

### 3. ISIC HAM10000 35-Image Clinical Atlas & Comparison
- Complete 35-image reference atlas (5 histopathologically confirmed cases for each of the 7 diagnostic categories) sourced directly from the official ISIC HAM10000 collection.
- **Interactive Side-by-Side Comparison Matrix**: Compare any two conditions (e.g. Melanoma vs. Benign Nevus) side-by-side with 5 exemplar images each.
- **Results Comparison Gallery**: View 5 confirmed clinical cases of the diagnosed category directly on the results screen.
- High-resolution modal with patient demographics, anatomical site, and biopsy confirmation method.

### 4. Pre-Appointment Doctor Consultation Brief (PDF / Print-Ready)
- Standardized medical consultation memo summarizing:
  - Patient & Anatomical Body Location.
  - Primary differential diagnosis and calibrated probabilities.
  - Recommended questions to ask the dermatologist.
  - User visit notes automatically saved in browser IndexedDB.
  - Print/PDF export formatted for clinical review.

### 5. Out-of-Distribution (OOD) Guardrail
- Automated skin chrominance validation in YCrCb and HSV color spaces to reject non-skin images (floors, pets, walls, artifacts).

### 6. Modern Clinical Design System
- Clean, accessible typography (14px–16px body, 18px–28px card headings).
- Modern medical color palette with WCAG AA compliant contrast.
- 1-click Anatomical Body Location Selector (Face/Scalp, Neck, Chest, Back, Arm, Hand, Leg, Foot).

---

## Seven Diagnostic Categories

1. **mel**: Melanoma
2. **bcc**: Basal cell carcinoma
3. **akiec**: Actinic keratosis / Squamous cell carcinoma in situ
4. **bkl**: Benign keratosis-like lesion (seborrheic keratosis, solar lentigo)
5. **nv**: Melanocytic nevus (Mole)
6. **df**: Dermatofibroma
7. **vasc**: Vascular lesion (cherry angioma, pyogenic granuloma)

---

## Run Locally

### Requirements
- Python 3.11+
- Node.js 18+

### Setup & Launch
```bash
# Easy launcher:
python start_local.py
```

Or run services in separate terminal tabs:
```bash
# Tab 1: Backend
python start_backend.py

# Tab 2: Frontend
cd frontend
npm install
npm run dev
```

### Groq API Configuration (Optional)
To enable the interactive Clinical AI Copilot, copy `.env.example` to `.env` and add your Groq API key:
```env
GROQ_API_KEY=your_key_here
GROQ_MODEL=openai/gpt-oss-120b
```
*(If no key is provided, the platform automatically presents rich local ABCDE and morphological reference cards).*

---

## Running Automated Tests

```bash
cd backend
venv\Scripts\python.exe -m pytest tests
```
*All 8 unit and integration tests covering preprocessing, calibration, OOD rejection, ABCDE extraction, and Copilot endpoints pass 100%.*

---

## Project Structure

```
├── backend/
│   ├── app/
│   │   ├── config.py           # App configuration & thresholds
│   │   ├── main.py             # FastAPI REST endpoints & Copilot chat
│   │   ├── model.py            # PyTorch inference, TTA, and Grad-CAM
│   │   ├── reporting.py        # Groq Copilot chat & clinical memo generator
│   │   ├── vision_features.py  # Computer Vision ABCDE & OOD engine
│   │   └── content/            # Condition medical reference library
│   └── tests/                  # Pytest unit & integration test suite
├── frontend/
│   ├── public/
│   │   ├── library_exemplars.json  # 35-case clinical atlas manifest
│   │   └── library_images/         # 5 verified images per category
│   └── src/
│       ├── api.ts              # Backend API & Copilot client
│       ├── index.css           # Modern clinical design system tokens
│       └── pages/
│           ├── Analyze.tsx     # Intake, camera, body site selector
│           ├── Results.tsx     # Workspace, 5-mode visualizer, ABCDE, chat
│           ├── Library.tsx     # Atlas, 5x5 comparison matrix, lightbox
│           ├── History.tsx     # Browser IndexedDB analysis history
│           └── About.tsx       # Model evidence & training records
└── models/                     # PyTorch model weights & evaluation metrics
```
