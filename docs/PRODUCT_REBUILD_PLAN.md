# SkinLesionNet product rebuild plan

**Status:** Discovery and product plan, based on the current repository as of 16 October 2026. This document is not a clinical validation report, regulatory assessment, or claim that the existing model is clinically safe.

## Executive decision

Rebuild this as a **transparent skin-image research and learning workspace**, not as a consumer diagnostic or triage product. Keep the image model behind an explicitly experimental analysis workflow until its training provenance, evaluation, calibration, intended image domain, and human factors have been independently established. Do not add more diagnostic features on top of the present score-to-risk rules.

The rebuild has two tracks that must advance together:

1. **Product foundation:** make the app coherent, calm, accessible, useful, and honest about what each output means.
2. **Evidence foundation:** make the model, dataset, training run, evaluation, and release artifact reproducible and auditable.

An LLM can make approved evidence easier to understand. It must not supply missing clinical evidence, interpret a heatmap as a clinical sign, or make an action recommendation from unvalidated model scores.

## Repository audit

### Product and interaction

- The application is a small React SPA with Analyze, Results, and About screens. The workflow and most screen content live in large components with extensive inline styles; there is no design system or clear separation between capture, analysis, learning, and record keeping (`frontend/src/App.tsx`, `frontend/src/pages/Analyze.tsx`, `frontend/src/pages/Results.tsx`).
- The analysis page presents a file chooser, optional collapsible form, and one submit button. It does not guide the user through camera framing, image suitability, what is sent for processing, or what a result can and cannot tell them. The `fitzpatrick`, `body_region`, and `diameter_mm` fields are sent by the client only if set, but are not exposed in the current form.
- Results combine a heatmap viewer, model scores, generated educational content, condition reference content, appointment checklist, and print view in one component. Some content overlaps. Result state exists only in React memory, so refreshing `/results` loses the result. There is no analysis history, comparison flow, or reliable result link.
- A disclaimer banner is shown for every route. The Results view also has warning cards, interpretation caveats, a warning in the heatmap panel, and a further notice in the appointment panel and print view. The repetition makes important information harder to notice. Replace this with one short, persistent scope label and context-specific explanations only where the user needs them.
- English and Hindi strings are incomplete: navigation, results tabs, educational content, technical explanations, generated report, and print content include hardcoded English. Theme and language are stored in local storage without input validation. The UI also uses small text, dense panels, nested tabs, and fixed two-column layouts that need responsive and keyboard testing.
- The About screen claims it displays 1,203 held-out images and reads metrics from `/api/model-info`; the API metrics do not match `models/metrics.json` or the headline figures in the root README. The research chart screen itself tells users to replace placeholders, while chart images are present. The displayed precision/recall and benchmark provenance need to come from a single versioned evaluation artifact, not separately authored text.

### Model and evidence

- `models/best.pt` is present, and `models/metrics.json` records an EfficientNet-B0 run and metrics. The repository contains no training script, dataset manifest, split-generation code, environment lock for training, or prediction/evaluation command. This means the run cannot currently be reproduced or independently traced from the repository.
- The README reports test accuracy 86.31%, balanced accuracy 85.88%, macro AUC 0.9668, and macro F1 0.8144. `backend/app/main.py` instead hardcodes 79.38%, 74.40%, 0.943, and 0.69, and includes a 1,203-image HAM/PAD breakdown not present in the main metrics file. `models/test_metrics.json` repeats the latter aggregate values. It is unclear whether these refer to different checkpoints, splits, or datasets. Do not choose one set as “correct” without recovering its evaluation source.
- No confidence intervals, class support counts, calibration report, threshold selection rationale, external validation report, or stratified subgroup results are surfaced as structured release data. The metrics alone do not establish suitability for the images people will upload.
- Inference uses a 224-pixel center crop and four flips. Flip agreement and entropy are presented as uncertainty measures, but their thresholds are hand-coded and not validated against error or clinical outcomes. A stable model score is not evidence of correctness.
- The current image checks use Laplacian blur and a fixed YCrCb skin-color range. A simple color threshold can be brittle across skin tones, lighting, and cameras; the “not a typical skin photo” warning is not a validated lesion-quality test. A non-reject warning does not stop analysis.
- The code aggregates class scores into benign/pre-cancerous/malignant groups and maps arbitrary cutoffs to `routine_monitor`, `see_doctor_soon`, and `urgent_review` (`backend/app/model.py`). The names read like care recommendations despite no established threshold validation. Symptom combinations also alter these tiers. Until reviewed and validated, remove score-derived urgency labels; keep reported symptoms clearly separate from model output.
- Grad-CAM is shown as a heatmap, but the “outline” is generated by Otsu-thresholding that same heatmap and selecting its largest contour (`backend/app/segmentation.py`). It is not a lesion segmentation. Remove the outline feature or rename it as an experimental activation contour and keep it out of medical interpretation. Heatmaps and occlusion tests show sensitivity of a model score to image perturbations; they do not explain a diagnosis or demonstrate clinically meaningful reasoning.

### API, LLM, and privacy

- `/api/analyze` reads the full upload before enforcing the byte limit, trusts the client content type, and does not visibly enforce decoded pixel dimensions. It returns validation failures as normal 200 responses. Decoding, CPU inference, Grad-CAM, and many occlusion forwards run from an async route and can block the event loop. Establish bounded upload/decode/inference behavior and explicit API error schemas.
- If the checkpoint path is missing, `SkinModel` silently keeps randomly initialized weights. Startup should fail closed and report the loaded model version and artifact hash.
- When `GROQ_API_KEY` is present, `generate_report` sends the predicted class/scores, risk aggregates, uncertainty, image warnings, user-provided demographics/context, and symptoms to the Groq API. The About page says “Nothing is stored or logged” and “never” sent elsewhere. That statement is incompatible with the optional external API path. Make external processing explicit and opt-in, minimize payloads, and explain retention/provider handling before consent.
- The Groq prompt requests useful class-specific health information, but generated fields are accepted based mainly on non-empty strings. The UI exposes provider errors and report source directly. Content sources are not attached to generated claims. Model scores are part of the prompt and may anchor the generated text to an uncertain class. Prefer curated, versioned source material with citations, deterministic templates for critical action wording, strict schema/content checks, and a clear “AI wording” provenance label. If those controls are absent, use local reviewed content only.
- The privacy statement also overlooks ordinary server logs and browser local storage, even if the raw image is not intentionally saved. Document the actual lifecycle for each data item and provider path.

### Tests and operations

- `backend/tests/test_main.py` has some endpoint and preprocessing checks, but several assertions permit either outcome, one test does not actually assert the heatmap size, and the risk tests encode current unvalidated tiers. Tests should be redesigned around contracts and the intended safe behavior, not the existing implementation.
- There is no frontend test suite, accessibility check, training/evaluation workflow, model release manifest, or documented monitoring/incident path. The current test scripts are not evidence that the model or user experience is safe.

## Product definition

### Intended users and promise

**Primary user:** a person learning about skin-lesion research or preparing a concise, private summary to discuss with a qualified clinician.

**Promise:** “Explore how this research model scores an image, understand the limits of that score, and prepare useful questions for a clinician.” The product does not diagnose, rule out disease, or assign a clinical urgency based on model output.

**Modes:**

1. **Learn** — model card, dataset and evaluation explorer, explanation glossary, and research comparisons. Works without uploading an image.
2. **Explore an image** — guided image capture/upload, optional reported context, image-quality feedback, model output with plain-language explanation and provenance.
3. **Prepare for a visit** — user-authored timeline and notes plus a shareable/printable summary. Keep this separate from the prediction and label user-reported facts as user-reported.

### Information architecture

- **Home / Learn:** clear purpose, concise scope statement, a primary “Explore an image” action, and a secondary “How this model was evaluated” route.
- **Image setup:** capture/upload, crop/rotate, preview, short photo-quality checklist, remove/replace, privacy and external-processing choice. Do not request context that has no defined use.
- **Context (optional):** structured, skippable questions about duration/change/symptoms and relevant image context. Explain whether each answer affects the model, the educational summary, or only the user's visit notes. Avoid collecting age/sex/skin tone merely because the API has fields for them.
- **Analysis:** visible progress and recoverable errors. The backend returns a versioned response with input quality, output scores, uncertainty/calibration status, model version, and explanation artifacts.
- **Result:** a single concise summary; full class score chart; “how to read this” disclosure; image/heatmap toggle with limits; reported symptoms in their own panel; next-step resources from reviewed sources; action to create a visit summary. No auto-assigned “routine” or “urgent” category from unvalidated model scores.
- **Visit summary:** editable, user-owned notes, dates, photo history only by explicit choice, print/export, delete. Do not turn a timeline into automated lesion-growth claims unless images are registered and the method has been validated.
- **Model & evidence:** training data and label definitions, model version, test population and counts, per-class metrics with uncertainty intervals, calibration, subgroup coverage/unknowns, evaluation date, and downloadable methods. Clearly separate internal validation from external and prospective evaluation.
- **Settings / privacy:** language, accessibility, external LLM consent, data controls, model and content provenance.

### Visual and interaction direction

- Use a calm editorial health-research aesthetic: warm neutral background, deep ink text, one restrained teal/blue accent, and clear high-contrast status colors reserved for real actions. Make the uploaded lesion image the visual focus, not a stack of cards.
- Establish a compact type scale, spacing grid, consistent buttons/fields/cards, responsive breakpoints, and semantic design tokens before rebuilding screens. Remove inline styling and emoji-as-controls.
- Use progressive disclosure: basic image exploration first; detailed model science and condition reference behind clear expandable sections. Keep the main result scannable, with “What the model returned”, “What this does not tell you”, and “Prepare to talk to a clinician” as distinct concepts.
- Support keyboard-only use, visible focus, screen-reader labels, meaningful alt text, reduced motion, zoom/reflow, and WCAG AA contrast. Never rely on color alone for risk or status.
- Replace global warning repetition with: one persistent product-scope label; one concise, contextual output limitation; and action-specific safety guidance only when the user reports a concerning symptom. Avoid empty emergency placeholders and arbitrary urgency labels.

## ML rebuild and release gates

### Gate 0 — Establish a trustworthy baseline

1. Freeze the current checkpoint and compute its SHA-256. Record the exact Python/PyTorch/timm versions and inference preprocessing. Fail startup if the artifact is missing or incompatible.
2. Trace the README metrics, `models/metrics.json`, `models/test_metrics.json`, endpoint values, and research images to their source runs and data splits. Mark any untraceable result as historical/unverified and remove it from the user-facing product.
3. Recover or recreate dataset manifests with source, license/terms, patient/lesion grouping, label mapping, class counts, exclusion rules, and de-identified sample IDs. Document how data overlap and duplicate images were prevented across train/validation/test.
4. Add reproducible training/evaluation entry points, a pinned environment, seeds, config, checkpoint metadata, and a model card. Do not claim retraining is a fix until the evaluation is rerun.

### Gate 1 — Valid evaluation before product claims

1. Lock the intended image domain. Dermoscopy and phone photos are separate domains unless evidence supports both. Identify out-of-domain inputs and provide an abstain/unsupported state.
2. Use a patient/lesion-level split and a locked test set. Report class support, sensitivity/recall, specificity, PPV/precision, NPV, AUROC, AUPRC, confusion matrix, confidence intervals, and calibration. Include class imbalance and operating-point rationale.
3. Evaluate by source, skin tone when data quality/ethics allow, sex/age where available and justified, camera/site/body location, and image quality. Describe missing subgroups plainly; do not imply fairness from aggregate metrics.
4. Select abstention and decision thresholds on validation data against a predeclared target; do not tune on the test set. Evaluate selective risk/coverage and calibration under distribution shift. A low-confidence output must not become reassurance.
5. Run external evaluation on independently sourced data before any broader performance claim. A clinical-use claim would need prospective evaluation and appropriate clinical/regulatory review for the intended market; this plan does not assert that the current app is cleared for such use.
6. Treat explanation maps as a research visualization. Test localization fidelity and stability separately if retained; do not label a heatmap contour a lesion boundary.

### Gate 2 — Versioned model contract

Every response and model-info payload should include:

- `schema_version`, `model_id`, `model_version`, `artifact_hash`, `input_domain`, and `inference_timestamp`;
- validated image-quality results and specific actionable upload feedback;
- ordered class scores, explicitly named as **model scores** unless calibration supports stronger wording;
- uncertainty/abstention fields whose thresholds and evaluation are tied to that model version;
- optional explanation artifacts with method, target class, coordinate transform, limits, and no clinical-feature assertions;
- provenance for any educational text and the version/date of its reviewed sources;
- machine-readable error codes for unsupported inputs, upload limits, unavailable model, and provider failure.

## LLM and content design

Use LLMs for **translation of reviewed content into accessible wording**, not clinical judgment.

1. Keep class scores, image pixels, demographics, symptoms, and identifiers out of third-party prompts by default. LLM use is an explicit opt-in after a just-in-time explanation of what leaves the device and which provider processes it.
2. Prefer retrieval from a small, reviewed, versioned library of authoritative sources. Return citations/links alongside the exact sections they support, and keep source dates visible. If retrieval or validation fails, show the reviewed local content.
3. Provide only the minimum relevant, non-identifying context. Do not ask an LLM to infer visual characteristics from Grad-CAM, model class, or an image it was not asked/authorized to analyze.
4. Validate a strict response schema, permitted claims, source coverage, length, language, and unsafe advice. Use deterministic, reviewed wording for urgent symptoms and privacy/safety instructions. A failed validation returns the local fallback.
5. Show “Prepared with AI from reviewed sources” and the provider/model/version where applicable. Do not call the response a “clinical report”; use “plain-language learning summary.” Keep user-specific notes separate from generated content.
6. Add offline/no-key behavior, timeouts, rate limits, request IDs without sensitive payloads, and an auditable set of prompt/content versions. Never expose raw provider exception details to the user.

## Feature roadmap

These are product capabilities, staged behind evidence and privacy requirements:

- **Image quality coach:** framing, focus, lighting, scale, and supported-image-type checks with actionable retake suggestions; validate across skin tones and cameras before presenting an automated quality score.
- **Prediction explorer:** ranked class score visualization, score/calibration explanation, uncertainty/abstention, version comparison, and a clear distinction between model output and clinician findings.
- **Explanation lab:** compare original image and selected model-sensitivity maps, show perturbation method and caveats, and allow class-specific explanation exploration; no lesion contours unless a separate segmentation model has ground-truth validation.
- **Evidence browser:** dataset/source cards, class taxonomy, confusion matrices, per-class metrics, calibration plots, subgroup results, and changelog, all generated from a single evaluation bundle.
- **Visit preparation:** user-authored timeline, questions, symptom notes, and exportable visit sheet. Optional local-only photo history with explicit delete/export controls; no server-side persistence by default.
- **Research workspace (later):** compare model versions on the same locked evaluation cohort; annotate errors for research only; export de-identified aggregate summaries. Never silently feed uploads into training.
- **Multilingual education:** professionally reviewed Hindi localization of all core screens and static content; LLM translation may draft language but cannot be the sole review for medical wording.

## Implementation sequence

| Phase | Work | Exit criteria |
|---|---|---|
| 0. Evidence inventory | Resolve metric/checkpoint/split provenance; audit data rights; define intended use and supported image domains | One reconciled model card or explicit “unverified” status; product claims inventory; no unsupported benchmark shown |
| 1. Safe product skeleton | Define information architecture, design tokens, responsive/accessible components, privacy language, API response contract | Reviewed flows and screen states; clear separation of model score, reported context, reference education, and next steps |
| 2. Reproducible ML | Training/evaluation scripts, manifests, versioned artifact metadata, split integrity, evaluation bundle, startup fail-closed | Same artifact and metrics can be recreated; locked test and uncertainty/calibration reports published |
| 3. Core workflow | Guided image intake; strict backend limits/errors; versioned inference response; prediction/explanation view; local visit prep/export | End-to-end use with keyboard, mobile, failure, unsupported-input, and privacy scenarios handled |
| 4. Grounded LLM | Opt-in provider path; reviewed retrieval; strict schema and safety checks; local fallback; source provenance | No external request before consent; deterministic fallback; claim/source audit passes |
| 5. Validation and release | Usability sessions, accessibility review, model external evaluation, security/privacy review, clinical/regulatory assessment for intended market | Predeclared release criteria met; unresolved evidence limitations are visible and accurate |

## Acceptance criteria for the rebuild

- Users can explain, after a short usability session, what the model output means, what it does not mean, and whether their image/context was sent to an external provider.
- The app never presents an unvalidated probability as disease probability or maps arbitrary model scores to urgency/reassurance language.
- A missing, corrupt, or mismatched model artifact prevents inference instead of returning random predictions.
- All benchmark numbers shown in the app are generated from one versioned evaluation artifact and identify cohort, split, sample counts, date, metrics, and limitations.
- Every generated educational claim is grounded in versioned content with citations; provider failure or invalid output produces a useful reviewed fallback.
- Image quality prompts are actionable and demonstrably do not systematically reject particular skin tones or supported capture devices.
- No raw image or health context is sent to an LLM without a clear opt-in; data flows, logs, local storage, retention, export, and deletion are accurately described.
- Core paths work on mobile and desktop, with keyboard and screen-reader navigation, visible focus, responsive zoom, and reviewed English/Hindi copy.
- Automated checks cover API schemas, upload bounds, model artifact loading, inference behavior, content/LLM validation, and core user flows; evaluation metrics are not substituted for clinical validation.

## Immediate next actions

1. Reconcile the two evaluation tracks and find the source for the 1,203-image result before changing its UI label.
2. Draft and approve the intended-use statement, supported image domains, and explicit non-goals.
3. Produce low-fidelity wireframes for Home, Image setup, Result, Evidence, and Visit preparation.
4. Build a reproducible model/evaluation bundle and decide whether the current checkpoint remains useful as a research baseline.
5. Implement the new API contract and design system, then migrate one user flow at a time.

## References for the evidence workflow

- STARD-AI reporting guideline for diagnostic accuracy studies using AI: [Nature Medicine](https://doi.org/10.1038/s41591-025-03953-8) and [EQUATOR Network](https://www.equator-network.org/reporting-guidelines/the-stard-ai-reporting-guideline-for-diagnostic-accuracy-studies-using-artificial-intelligence/).
- CONSORT-AI extension for reporting clinical trials involving AI: [The BMJ](https://www.bmj.com/content/370/bmj.m3164).
- FDA, Health Canada, and MHRA guiding principles for transparency in machine-learning-enabled medical devices: [FDA](https://www.fda.gov/medical-devices/artificial-intelligence-enabled-medical-devices/transparency-machine-learning-enabled-medical-devices-guiding-principles). Applicable obligations depend on intended use and jurisdiction; this plan is not legal advice.
