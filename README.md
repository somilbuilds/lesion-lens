<div align="center">
  <img src="https://raw.githubusercontent.com/somilbuilds/lesion-lens/main/docs/banner.png" alt="SkinLesionNet Banner" width="100%" />

  <h1>SkinLesionNet</h1>

  <p>
    <strong>A high-performance ML web portal for skin lesion classification and analysis</strong>
  </p>
  
  <p>
    <img alt="Python" src="https://img.shields.io/badge/Python-3.11+-blue.svg?logo=python&logoColor=white" />
    <img alt="FastAPI" src="https://img.shields.io/badge/FastAPI-0.103.0+-009688.svg?logo=fastapi&logoColor=white" />
    <img alt="React" src="https://img.shields.io/badge/React-18.2.0+-61DAFB.svg?logo=react&logoColor=black" />
    <img alt="Vite" src="https://img.shields.io/badge/Vite-5.0+-646CFF.svg?logo=vite&logoColor=white" />
    <img alt="PyTorch" src="https://img.shields.io/badge/PyTorch-2.0+-EE4C2C.svg?logo=pytorch&logoColor=white" />
  </p>
</div>

---

> **⚠️ Disclaimer:** This is a research prototype/demo system, not a medical device. It should never be used as a substitute for professional medical advice, diagnosis, or treatment. It does not provide clinical validation.

## 📖 Overview

SkinLesionNet is a fully-integrated full-stack web application wrapped around a trained PyTorch `EfficientNet-B0` model capable of classifying skin images into 7 distinct lesion categories. The application emphasizes **clinical-restrained UI design**, high structural performance, and seamless offline data protection.

### ✨ Key Features
- **Intelligent Analysis**: Rejects blurry/non-skin images and measures clinical risk grouping (Malignant, Pre-cancerous, Benign).
- **Test-Time Augmentation (TTA)**: Employs 4 views (original + flips) for robust certainty checks and metric pooling.
- **Explainable AI (Grad-CAM)**: Heatmap highlighting model-influenced image regions, verified with custom focus contouring.
- **Localization**: Supports dynamic `English` and `Hindi` globally persisting across Analysis workflow.
- **Dark & Light Mode**: Accessible dual-color themes strictly built using vanilla CSS semantic variables, avoiding hardcoded UI colors.

---

## 🏗 System Architecture

The project maintains a sharp decoupled structure:

1. **Backend** `/backend`: FastAPI microservice serving the CPU-bound PyTorch model via endpoints `/api/analyze` and `/api/model-info`. Employs custom Grad-CAM overlays and OpenCV image manipulation algorithms.
2. **Frontend** `/frontend`: Vite `React+TypeScript` SPA enforcing WCAG AA contrast.
3. **ML Pipeline** `/models`: Centralized store for the `best.pt` model state dictionary weights alongside experimental metric logs.

---

## 📊 Model & Metrics

Built around `timm.create_model("efficientnet_b0", pretrained=False, num_classes=7)`, this model was extensively trained utilizing the **ISIC 2019** dataset to distinguish between the following 7 diagnostic classes. Checkpoint chosen is Epoch 24.

| Metric | Score |
| :--- | :--- |
| **Accuracy** | 86.31% |
| **Balanced Accuracy** | 85.88% |
| **Macro AUC** | 0.9668 |
| **Macro F1** | 0.8144 |

### Per-Class Recall Table

| Class | Scientific Name | Recall Score | Risk Group |
|:---|:---|:---:|:---:|
| **AKIEC** | Actinic Keratosis / SCC in situ | `84.56%` | Pre-cancerous |
| **BCC** | Basal Cell Carcinoma | `92.49%` | Malignant |
| **BKL** | Benign Keratosis | `76.43%` | Benign |
| **DF** | Dermatofibroma | `87.50%` | Benign |
| **MEL** | Melanoma | `78.76%` | Malignant |
| **NV** | Melanocytic Nevus | `89.44%` | Benign |
| **VASC** | Vascular Lesion | `92.00%` | Benign |

> **Crucial Weakness Check**: Performance outside the dataset/domain is not guaranteed. 

---

## 🚀 Setup & Installation

### Requirements
Ensure **Python 3.11** and **Node.js 18+** are installed in your OS environment.

### One-command local demo

From the project root, run:

```bash
python start_local.py
```

This automatically prepares the backend virtual environment and dependencies on first run, starts the FastAPI backend and Vite frontend, streams both developer logs into the same terminal, opens the app in your browser, and stops both services when you press `Ctrl+C`. No separate stop script is required.

### 1. Clone Repository
```bash
git clone https://github.com/somilbuilds/lesion-lens.git
cd lesion-lens
```

### 2. Launch Backend (API Server)
```bash
# Windows
python -m venv backend\venv
backend\venv\Scripts\pip install -r backend\requirements.txt
backend\venv\Scripts\uvicorn app.main:app --app-dir backend --reload --port 8000

# macOS / Linux
python3 -m venv backend/venv
backend/venv/bin/pip install -r backend/requirements.txt
backend/venv/bin/uvicorn app.main:app --app-dir backend --reload --port 8000
```
*API available at `http://localhost:8000`*

### 3. Launch Frontend (UI)
```bash
cd frontend
npm install
npm run dev
```
*App available at `http://localhost:5173`*

---

## 🔐 Privacy
The architecture performs all image buffering and computation exclusively strictly **In-Memory**. 
No external telemetry, cookies, or tracking logs persist image inputs to disks.

## 🤝 Known Limitations
- The system doesn't input secondary age/skin features into the pipeline dynamically (they remain strictly context fields for final printout forms).
- Performance limits are unverified across non-standard imaging or complex ethnic skin tones outside the training parameters.

<div align="center">
  <i>Developed autonomously around specialized clinical web requirements.</i>
</div>
