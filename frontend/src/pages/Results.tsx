import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  BookOpen,
  ExternalLink,
  Info,
  Printer,
  ScanEye,
  Sparkles,
  Send,
  Activity,
  Layers,
  FileText,
  ShieldCheck,
  Eye,
  X
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAppContext } from '../Context';
import { translations } from '../i18n';
import { updateAnalysisHistory } from '../history';
import { sendCopilotMessage } from '../api';

type Props = {
  result: any;
  imageFile: File | null;
  symptoms: any;
  patient?: { name: string; gender: string };
  historyError?: string;
  historyId?: string;
  firstNoticed?: string;
};

const classKeys = ['akiec', 'bcc', 'bkl', 'df', 'mel', 'nv', 'vasc'];
const labelMap: Record<string, string> = {
  akiec: 'Actinic keratosis / in-situ carcinoma',
  bcc: 'Basal cell carcinoma',
  bkl: 'Benign keratosis-like lesion',
  df: 'Dermatofibroma',
  mel: 'Melanoma',
  nv: 'Melanocytic nevus (Mole)',
  vasc: 'Vascular lesion',
};

const detailLabels: Record<string, string> = {
  changed: 'Changed in size, shape, or color',
  grew: 'Grown rapidly',
  bleed: 'Bled without scratching',
  itch: 'Itchy or uncomfortable',
  hurt: 'Painful or tender',
  personal_skin_cancer_history: 'Personal history of skin cancer',
};

export default function Results({
  result,
  imageFile,
  symptoms,
  patient = { name: '', gender: '' },
  historyError = '',
  historyId = '',
  firstNoticed = '',
}: Props) {
  const { lang } = useAppContext();
  const t = translations[lang];

  const [imageUrl, setImageUrl] = useState('');
  const [vizMode, setVizMode] = useState<'original' | 'contour' | 'overlay' | 'heatmap' | 'occlusion'>('contour');
  const [notes, setNotes] = useState('');
  const [activeView, setActiveView] = useState('average');
  const [exemplars, setExemplars] = useState<Record<string, any[]>>({});
  const [activeModalExemplar, setActiveModalExemplar] = useState<any | null>(null);

  // Copilot Chat state
  const [chatMessages, setChatMessages] = useState<Array<{ role: string; content: string }>>([
    {
      role: 'assistant',
      content:
        "Hello! I am your LesionLens Clinical Copilot. I've reviewed your image's ABCDE morphological findings and classification scores. Ask me anything about your results, what the scores mean, or how to prepare for your doctor's appointment.",
    },
  ]);
  const [inputQuestion, setInputQuestion] = useState('');
  const [chatLoading, setChatLoading] = useState(false);

  useEffect(() => {
    if (!imageFile) {
      setImageUrl('');
      return;
    }
    const url = URL.createObjectURL(imageFile);
    setImageUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [imageFile]);

  useEffect(() => {
    if (!historyId) return;
    const timer = window.setTimeout(() => {
      void updateAnalysisHistory(historyId, { notes }).catch(() => undefined);
    }, 350);
    return () => window.clearTimeout(timer);
  }, [historyId, notes]);

  useEffect(() => {
    fetch('/library_exemplars.json')
      .then((r) => r.json())
      .then((data) => setExemplars(data))
      .catch((err) => console.warn('Could not load library exemplars:', err));
  }, []);

  if (!result) {
    return (
      <main className="result-empty">
        <h1>No image result to show</h1>
        <p>Start with an image to explore a model result.</p>
        <Link className="button-primary" to="/">
          Return to image explorer
        </Link>
      </main>
    );
  }

  const {
    input_check,
    top3 = [],
    scores = {},
    view_scores = [],
    uncertainty = {},
    gradcam = {},
    content = {},
    language_reports: report,
    explanation_report: explanation,
    abcde = {},
    verbal_explanation: verbalExp = {},
    contour_overlay: contourB64,
  } = result;

  const modelContext = result.model_context || {};
  const activeScores =
    activeView === 'average'
      ? scores
      : view_scores.find((view: any) => view.view === activeView)?.scores || scores;
  const top3Fallback = Object.fromEntries(top3.map((item: any) => [item.class, item.score]));
  const scoreRows = classKeys
    .map((key) => [key, Number(activeScores[key] ?? top3Fallback[key] ?? 0)] as [string, number])
    .sort((a, b) => b[1] - a[1]);
  const topClass = top3[0]?.class || scoreRows[0]?.[0] || 'unknown';
  const condition = content[topClass] || {};
  const positives = Object.entries(symptoms || {})
    .filter(([key, value]) => key in detailLabels && Boolean(value))
    .map(([key]) => detailLabels[key]);

  const scoreLabel = (key: string) => {
    const translated = t[key as keyof typeof t];
    if (translated) return translated;
    if (condition?.name && key === topClass) return condition.name;
    return labelMap[key] || key.toUpperCase();
  };

  const handleSendChat = async (questionText?: string) => {
    const textToSend = (questionText || inputQuestion).trim();
    if (!textToSend || chatLoading) return;

    const newMessages = [...chatMessages, { role: 'user', content: textToSend }];
    setChatMessages(newMessages);
    setInputQuestion('');
    setChatLoading(true);

    const contextPayload = {
      top_class_key: topClass,
      top_class_name: labelMap[topClass] || topClass,
      top_score: top3[0]?.score || scoreRows[0]?.[1],
      abcde_metrics: abcde,
      verbal_findings: verbalExp.findings || [],
      reported_symptoms: positives,
      patient_details: patient,
    };

    const replyData = await sendCopilotMessage(newMessages, contextPayload);
    setChatMessages((prev) => [...prev, { role: 'assistant', content: replyData.reply }]);
    setChatLoading(false);
  };

  if (input_check?.level === 'reject') {
    return (
      <main className="result-page">
        <Link to="/" className="back-link">
          <ArrowLeft size={16} /> Back to image explorer
        </Link>
        <section className="result-rejected">
          <span className="step-number">!</span>
          <h1>This image could not be analyzed</h1>
          <p>{input_check.reasons?.[0] || 'Choose a supported skin photo and try again.'}</p>
          <Link className="button-primary" to="/">
            Choose another image
          </Link>
        </section>
      </main>
    );
  }

  const categoryExemplars = exemplars[topClass] || [];

  return (
    <main className="result-page">
      {/* Top action bar */}
      <div className="result-topline">
        <Link to="/" className="back-link">
          <ArrowLeft size={18} /> {t.newImage || 'Analyze another image'}
        </Link>
        <div className="result-actions">
          <Link to="/library" className="button-secondary">
            <BookOpen size={16} /> View Image Library
          </Link>
          <button type="button" className="button-primary" onClick={() => window.print()}>
            <Printer size={16} /> Save / Print Clinical Brief
          </button>
        </div>
      </div>

      <header className="result-heading">
        <span className="eyebrow">
          <ScanEye size={15} /> Clinical Morphological Diagnostic Workspace
        </span>
        <h1>{scoreLabel(topClass)}</h1>
        <p>
          Comprehensive computer-vision assessment combining deep feature attribution, ABCDE
          morphology, and interactive clinical guidance.
        </p>
      </header>

      {historyError && (
        <div className="quality-message" role="status">
          <Info size={16} />
          <span>{historyError}</span>
        </div>
      )}

      {input_check?.level === 'warning' && (
        <div className="quality-message">
          <Info size={16} />
          <span>{input_check.reasons?.join(' ')}</span>
        </div>
      )}

      {/* 1. VERBAL EXPLAINABILITY BANNER */}
      {verbalExp?.findings && verbalExp.findings.length > 0 && (
        <section className="verbal-banner">
          <div className="verbal-banner-top">
            <Activity size={20} color="var(--accent)" />
            <h2>{verbalExp.headline || 'Morphological Feature Breakdown'}</h2>
          </div>
          <p style={{ margin: '4px 0', fontSize: '14px', color: 'var(--text-secondary)' }}>
            {verbalExp.summary}
          </p>
          <ul className="verbal-findings-list">
            {verbalExp.findings.map((item: string, idx: number) => (
              <li key={idx}>{item}</li>
            ))}
          </ul>
        </section>
      )}

      {/* 2. MAIN GRID: MULTI-MODE VISUALIZER & SCORES */}
      <section className="result-main-grid">
        {/* Left Card: High-Res Visualizer */}
        <div className="result-image-card">
          <div className="result-section-title" style={{ marginBottom: '14px' }}>
            <div>
              <span className="eyebrow">
                <Layers size={14} /> Diagnostic Attribution
              </span>
              <h2>Visualizer & Lesion Segmentation</h2>
            </div>
          </div>

          <div className={`result-image-stage ${vizMode === 'occlusion' ? 'occlusion-view' : ''}`}>
            {vizMode === 'contour' && contourB64 ? (
              <img className="result-original" src={contourB64} alt="Segmented lesion boundary contour" />
            ) : vizMode === 'overlay' && gradcam?.overlay ? (
              <img className="result-original" src={gradcam.overlay} alt="Grad-CAM activation overlay" />
            ) : vizMode === 'heatmap' && gradcam?.heatmap ? (
              <img className="result-original" src={gradcam.heatmap} alt="Grad-CAM heatmap" />
            ) : (
              imageUrl && <img className="result-original" src={imageUrl} alt="Uploaded skin image" />
            )}

            {vizMode === 'occlusion' && explanation?.metrics?.occlusion?.patch_grid && (
              <span
                className="occlusion-patch"
                style={{
                  left: `${explanation.metrics.occlusion.patch_grid.x_start * 100}%`,
                  top: `${explanation.metrics.occlusion.patch_grid.y_start * 100}%`,
                  width: `${(explanation.metrics.occlusion.patch_grid.x_end - explanation.metrics.occlusion.patch_grid.x_start) * 100}%`,
                  height: `${(explanation.metrics.occlusion.patch_grid.y_end - explanation.metrics.occlusion.patch_grid.y_start) * 100}%`,
                }}
              />
            )}
          </div>

          {/* Visualization mode toggle buttons */}
          <div className="image-controls-bar">
            <div className="explanation-view-tabs" role="group" aria-label="Visualizer Modes">
              <button
                type="button"
                className={vizMode === 'original' ? 'active' : ''}
                onClick={() => setVizMode('original')}
              >
                Original
              </button>
              {contourB64 && (
                <button
                  type="button"
                  className={vizMode === 'contour' ? 'active' : ''}
                  onClick={() => setVizMode('contour')}
                >
                  Lesion Border
                </button>
              )}
              {gradcam?.overlay && (
                <button
                  type="button"
                  className={vizMode === 'overlay' ? 'active' : ''}
                  onClick={() => setVizMode('overlay')}
                >
                  Attribution Overlay
                </button>
              )}
              {gradcam?.heatmap && (
                <button
                  type="button"
                  className={vizMode === 'heatmap' ? 'active' : ''}
                  onClick={() => setVizMode('heatmap')}
                >
                  Heatmap
                </button>
              )}
              {explanation?.metrics?.occlusion?.patch_grid && (
                <button
                  type="button"
                  className={vizMode === 'occlusion' ? 'active' : ''}
                  onClick={() => setVizMode('occlusion')}
                >
                  Perturbation Patch
                </button>
              )}
            </div>
          </div>
          <p style={{ marginTop: '10px', fontSize: '12px', color: 'var(--text-muted)' }}>
            Green outline highlights the computer-vision segmented lesion boundary used for ABCDE calculations.
          </p>
        </div>

        {/* Right Card: Category Ranking & Probabilities */}
        <div className="result-score-card">
          <div className="result-section-title">
            <div>
              <span className="eyebrow">Statistical Differential</span>
              <h2>Differential Diagnosis Ranking</h2>
            </div>
            {typeof uncertainty?.view_agreement === 'number' && (
              <span className="abcde-badge">
                {Math.round(uncertainty.view_agreement * 100)}% view consensus
              </span>
            )}
          </div>

          {/* View selector tabs */}
          {view_scores.length > 0 && (
            <div style={{ display: 'flex', gap: '6px', margin: '10px 0 14px' }}>
              <button
                type="button"
                onClick={() => setActiveView('average')}
                style={{
                  padding: '4px 10px',
                  borderRadius: '6px',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  background: activeView === 'average' ? 'var(--accent)' : 'var(--bg-subtle)',
                  color: activeView === 'average' ? '#fff' : 'var(--text-secondary)',
                  border: '1px solid var(--border)',
                }}
              >
                Average (4-view)
              </button>
              {view_scores.map((v: any) => (
                <button
                  type="button"
                  key={v.view}
                  onClick={() => setActiveView(v.view)}
                  style={{
                    padding: '4px 10px',
                    borderRadius: '6px',
                    fontSize: '11px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    background: activeView === v.view ? 'var(--accent)' : 'var(--bg-subtle)',
                    color: activeView === v.view ? '#fff' : 'var(--text-secondary)',
                    border: '1px solid var(--border)',
                  }}
                >
                  {v.view.replace('_', ' ')}
                </button>
              ))}
            </div>
          )}

          {scoreRows.length > 0 && (
            <div className="lead-score-box">
              <span>{scoreLabel(scoreRows[0][0])}</span>
              <strong>{(Number(scoreRows[0][1]) * 100).toFixed(1)}%</strong>
            </div>
          )}

          <div style={{ marginTop: '16px' }}>
            {scoreRows.map(([key, value]: any, index: number) => (
              <div className="score-row-item" key={key}>
                <div className="score-row-header">
                  <span>{scoreLabel(key)}</span>
                  <strong>{(value * 100).toFixed(1)}%</strong>
                </div>
                <div className="score-track-bar">
                  <div
                    className="score-fill"
                    style={{
                      width: `${Math.max(0, Math.min(100, value * 100))}%`,
                      background: index === 0 ? 'var(--accent)' : 'var(--text-muted)',
                    }}
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="scope-note" style={{ marginTop: '18px' }}>
            <Info size={16} />
            <div>
              <strong>Calibrated Research Probabilities</strong>
              <span>
                Scores represent model ranking across 7 classes under temperature scaling. They do not replace a histologic biopsy.
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* 3. QUANTITATIVE ABCDE DERMOSCOPY FEATURE CARDS */}
      {abcde && (
        <section className="result-score-card" style={{ marginBottom: '24px' }}>
          <div className="result-section-title">
            <div>
              <span className="eyebrow">Dermatological Morphology</span>
              <h2>Computer Vision ABCDE Analysis</h2>
            </div>
          </div>

          <div className="abcde-grid">
            {/* A: Asymmetry */}
            <div className="abcde-card">
              <div className="abcde-card-header">
                <span className="eyebrow">A — Asymmetry</span>
                <span className="abcde-badge">{abcde.asymmetry_level || 'Evaluated'}</span>
              </div>
              <strong>Asymmetry Index: {abcde.asymmetry_index ?? 'N/A'} / 1.0</strong>
              <p>
                Calculated by flipping lesion contour along orthogonal major and minor axes to evaluate geometric symmetry.
              </p>
            </div>

            {/* B: Border */}
            <div className="abcde-card">
              <div className="abcde-card-header">
                <span className="eyebrow">B — Border</span>
                <span className="abcde-badge">{abcde.border_level || 'Evaluated'}</span>
              </div>
              <strong>Border Roughness: {abcde.border_roughness ?? 'N/A'}</strong>
              <p>
                Isoperimetric compactness quotient (P² / 4πA). High values indicate notched, jagged, or scalloped edges.
              </p>
            </div>

            {/* C: Color */}
            <div className="abcde-card">
              <div className="abcde-card-header">
                <span className="eyebrow">C — Color Variegation</span>
                <span className="abcde-badge">{abcde.color_count ?? 1} Chromatic Zones</span>
              </div>
              <strong>Diversity Score: {abcde.color_variegation_score ?? 'N/A'}</strong>
              <div className="color-swatch-list">
                {(abcde.identified_colors || []).map((col: string) => (
                  <span className="color-swatch-pill" key={col}>
                    {col.replace('_', ' ')}
                  </span>
                ))}
              </div>
            </div>

            {/* D: Diameter */}
            <div className="abcde-card">
              <div className="abcde-card-header">
                <span className="eyebrow">D — Diameter & Footprint</span>
                <span className="abcde-badge">Field Coverage</span>
              </div>
              <strong>{((abcde.frame_coverage_ratio || 0) * 100).toFixed(1)}% of frame</strong>
              <p>
                Equivalent pixel diameter: {abcde.equivalent_diameter_px} px. Lesions larger than 6 mm (pencil eraser) warrant close clinical monitoring.
              </p>
            </div>
          </div>
        </section>
      )}

      {/* 4. VISUAL COMPARISON: 5 VERIFIED EXEMPLARS OF THE DIAGNOSED CATEGORY */}
      {categoryExemplars.length > 0 && (
        <section
          className="result-score-card"
          style={{
            marginBottom: '24px',
            border: '1.5px solid var(--accent-border)',
            background: 'var(--Surface)',
          }}
        >
          <div className="result-section-title" style={{ marginBottom: '14px' }}>
            <div>
              <span className="eyebrow">
                <ShieldCheck size={14} /> Confirmed ISIC Reference Cases
              </span>
              <h2>Visual Comparison: 5 Verified Cases of {labelMap[topClass]}</h2>
            </div>
            <Link to="/library" className="button-secondary" style={{ fontSize: '12px', padding: '6px 12px' }}>
              Explore Full 35-Image Atlas <ExternalLink size={13} />
            </Link>
          </div>

          <p style={{ fontSize: '13.5px', color: 'var(--text-secondary)', marginBottom: '14px' }}>
            Compare your lesion against 5 biopsy-confirmed dermoscopic exemplars of {labelMap[topClass]} from the HAM10000 archive. Click any thumbnail to view case metadata.
          </p>

          <div className="library-thumb-strip">
            {categoryExemplars.map((ex) => (
              <div
                key={ex.isic_id}
                className="library-thumb-item"
                onClick={() => setActiveModalExemplar(ex)}
                title={`Inspect ${ex.isic_id}`}
              >
                <img
                  src={ex.local_url}
                  alt={ex.isic_id}
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = ex.remote_thumb;
                  }}
                />
                <div className="thumb-tag">
                  <span>{ex.isic_id.replace('ISIC_', '#')}</span>
                  <Eye size={10} />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 5. INTERACTIVE CLINICAL COPILOT CHAT (Powered by Groq LLM) */}
      <section className="copilot-section">
        <div className="copilot-header">
          <Sparkles size={22} color="var(--accent)" />
          <div>
            <h2>Clinical AI Copilot (Interactive Q&A)</h2>
            <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-muted)' }}>
              Ask anything about your lesion findings, what the scores mean, or how to speak with your doctor.
            </p>
          </div>
        </div>

        {/* Chat message stream */}
        <div className="copilot-chat-box">
          {chatMessages.map((msg, index) => (
            <div key={index} className={`chat-bubble ${msg.role}`}>
              {msg.content}
            </div>
          ))}
          {chatLoading && (
            <div className="chat-bubble assistant" style={{ fontStyle: 'italic', opacity: 0.8 }}>
              Analyzing morphological findings and clinical guidelines...
            </div>
          )}
        </div>

        {/* Quick prompt suggestions */}
        <div className="suggested-prompts">
          <button
            type="button"
            className="suggested-prompt-btn"
            onClick={() => handleSendChat("What do my Asymmetry and Border scores indicate?")}
          >
            "What do my Asymmetry and Border scores indicate?"
          </button>
          <button
            type="button"
            className="suggested-prompt-btn"
            onClick={() => handleSendChat("What specific questions should I ask my dermatologist?")}
          >
            "What questions should I ask my dermatologist?"
          </button>
          <button
            type="button"
            className="suggested-prompt-btn"
            onClick={() => handleSendChat("How does dermoscopy differ from an automated image scan?")}
          >
            "How does dermoscopy differ from an automated scan?"
          </button>
        </div>

        {/* Input box */}
        <form
          className="copilot-input-row"
          onSubmit={(e) => {
            e.preventDefault();
            handleSendChat();
          }}
        >
          <input
            type="text"
            value={inputQuestion}
            onChange={(e) => setInputQuestion(e.target.value)}
            placeholder="Type your question about this lesion or doctor visit..."
            disabled={chatLoading}
          />
          <button type="submit" className="button-primary" disabled={chatLoading || !inputQuestion.trim()}>
            <Send size={16} /> Send
          </button>
        </form>
      </section>

      {/* 6. DOCTOR REFERRAL & CLINICAL BRIEF (Print / PDF Ready) */}
      <section className="doctor-brief-card">
        <div className="doctor-brief-header">
          <div>
            <span className="eyebrow">
              <FileText size={15} /> Clinical Consultation Memo
            </span>
            <h2>Pre-Appointment Doctor Brief</h2>
          </div>
          <button type="button" className="button-secondary" onClick={() => window.print()}>
            <Printer size={15} /> Print / Save as PDF
          </button>
        </div>

        <div className="doctor-brief-grid">
          <div className="brief-metric-box">
            <span>Patient / Body Site</span>
            <strong>
              {patient.name || 'Anonymous'} · {patient.gender || 'Not specified'} (
              {modelContext.provided?.localization || 'Body site unrecorded'})
            </strong>
            {firstNoticed && (
              <small style={{ display: 'block', marginTop: '4px', color: 'var(--text-muted)' }}>
                First noticed: {firstNoticed}
              </small>
            )}
          </div>
          <div className="brief-metric-box">
            <span>Primary Algorithmic Indication</span>
            <strong>{labelMap[topClass] || topClass} ({(scoreRows[0]?.[1] * 100).toFixed(1)}%)</strong>
          </div>
          <div className="brief-metric-box">
            <span>Reported Symptoms</span>
            <strong>{positives.length > 0 ? positives.join(', ') : 'None reported'}</strong>
          </div>
        </div>

        {/* Morphological Summary */}
        {report?.patient_report_en?.questions_for_doctor && (
          <div style={{ marginTop: '16px' }}>
            <h4 style={{ fontSize: '14px', marginBottom: '8px' }}>Recommended Questions for Your Clinician:</h4>
            <ul style={{ paddingLeft: '20px', fontSize: '14px', color: 'var(--text-secondary)' }}>
              {report.patient_report_en.questions_for_doctor.map((q: string, idx: number) => (
                <li key={idx} style={{ marginBottom: '4px' }}>
                  {q}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Visit Notes */}
        <div style={{ marginTop: '18px' }}>
          <label style={{ fontSize: '13px', fontWeight: 600, display: 'block', marginBottom: '6px' }}>
            Your Personal Notes for the Doctor:
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Add specific details (e.g. date first noticed, changes over time, family history)..."
            rows={3}
            style={{
              width: '100%',
              padding: '12px',
              fontSize: '14px',
              background: 'var(--bg-lighter)',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              color: 'var(--text-main)',
            }}
          />
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            Notes are saved automatically in your browser's local history and included in print/PDF output.
          </span>
        </div>
      </section>

      {/* Reference Educational Card */}
      <section className="result-content-card">
        <div className="result-card-heading">
          <BookOpen size={20} color="var(--accent)" />
          <div>
            <h2>Clinical Reference: {condition.name || labelMap[topClass]}</h2>
            <p>Peer-reviewed reference guidelines on condition pathology, risk factors, and staging.</p>
          </div>
        </div>
        <p>{condition.overview || 'General condition reference details.'}</p>
        {condition.causes_risks && (
          <p>
            <strong>Risk Factors & Etiology:</strong> {condition.causes_risks}
          </p>
        )}
        {condition.doctor_assessment && (
          <p>
            <strong>Diagnostic Workup:</strong> {condition.doctor_assessment}
          </p>
        )}
        {condition.links && condition.links.length > 0 && (
          <div className="source-list">
            <strong>Trusted Medical Sources:</strong>
            {condition.links.map((url: string) => (
              <a href={url} target="_blank" rel="noreferrer" key={url}>
                {new URL(url).hostname.replace(/^www\./, '')} <ExternalLink size={12} />
              </a>
            ))}
          </div>
        )}
      </section>

      {/* Lightbox Modal for Results Screen */}
      {activeModalExemplar && (
        <div className="lightbox-backdrop" onClick={() => setActiveModalExemplar(null)}>
          <div className="lightbox-dialog" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <div>
                <span className="eyebrow" style={{ marginBottom: 0 }}>
                  <ShieldCheck size={13} /> Confirmed Clinical Case
                </span>
                <h3 style={{ margin: '2px 0 0', fontSize: '17px' }}>{activeModalExemplar.isic_id}</h3>
              </div>
              <button
                type="button"
                onClick={() => setActiveModalExemplar(null)}
                style={{
                  background: 'transparent',
                  border: 0,
                  cursor: 'pointer',
                  color: 'var(--text-muted)',
                  padding: '4px',
                }}
                aria-label="Close modal"
              >
                <X size={18} />
              </button>
            </div>

            <div className="lightbox-image-box">
              <img src={activeModalExemplar.local_url} alt={activeModalExemplar.isic_id} />
            </div>

            <div className="lightbox-grid">
              <div className="brief-metric-box">
                <span>Histopathologic Diagnosis</span>
                <strong>{activeModalExemplar.diagnosis}</strong>
              </div>
              <div className="brief-metric-box">
                <span>Confirmation Method</span>
                <strong>{activeModalExemplar.diagnosis_confirm}</strong>
              </div>
              <div className="brief-metric-box">
                <span>Patient Demographics</span>
                <strong>
                  {activeModalExemplar.age ? `${activeModalExemplar.age} yrs` : 'Unknown'} · {activeModalExemplar.sex || 'Unknown'}
                </strong>
              </div>
              <div className="brief-metric-box">
                <span>Anatomical Site</span>
                <strong>{activeModalExemplar.site}</strong>
              </div>
            </div>

            <a
              href={`https://api.isic-archive.com/images/${activeModalExemplar.isic_id}/`}
              target="_blank"
              rel="noreferrer"
              className="button-primary"
              style={{ width: '100%', justifyContent: 'center' }}
            >
              View on ISIC Archive <ExternalLink size={14} />
            </a>
          </div>
        </div>
      )}
    </main>
  );
}
