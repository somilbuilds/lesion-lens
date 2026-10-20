import { Fragment, useEffect, useState } from 'react';
import { ArrowUpRight, BookOpen, Database, Shield, Sparkles } from 'lucide-react';
import { fetchModelInfo } from '../api';

type ModelInfo = {
  classes: string[];
  metadata_supported?: boolean;
  model_type?: string;
  metrics?: { accuracy?: number; balanced_accuracy?: number; macro_auc?: number; macro_f1?: number; per_class_recall?: Record<string, number>; per_class?: Record<string, { precision?: number; recall?: number; 'f1-score'?: number; support?: number }> };
  evaluation?: { status?: string; evaluation_date?: string; test_images?: number; test_class_support?: Record<string, number>; confusion_matrix?: number[][]; confusion_matrix_classes?: string[]; calibration?: string | object; model_version?: string; dataset?: string; dataset_doi?: string; split_group?: string; split_counts?: Record<string, number>; evaluation_manifest_sha256?: string };
  versions?: { id: string; evaluation_manifest_sha256?: string; metrics: { accuracy?: number; balanced_accuracy?: number; macro_f1?: number; macro_ovr_auc?: number } }[];
  evaluation_status?: string;
  datasets?: string;
  limitations?: string[];
};

const classNames: Record<string, string> = {
  akiec: 'Actinic keratosis / in-situ carcinoma', bcc: 'Basal cell carcinoma', bkl: 'Benign keratosis-like lesion',
  df: 'Dermatofibroma', mel: 'Melanoma', nv: 'Melanocytic nevus', vasc: 'Vascular lesion',
};

function percent(value?: number) { return typeof value === 'number' ? `${(value * 100).toFixed(1)}%` : '—'; }

export default function About() {
  const [info, setInfo] = useState<ModelInfo | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    fetchModelInfo().then(setInfo).catch(() => setInfo(null)).finally(() => setLoading(false));
  }, []);
  const comparableVersions = (info?.versions || []).filter((version) => Boolean(info?.evaluation?.evaluation_manifest_sha256) && version.evaluation_manifest_sha256 === info?.evaluation?.evaluation_manifest_sha256);

  return (
    <main className="evidence-page">
      <header className="evidence-hero">
        <span className="eyebrow"><BookOpen size={14} /> MODEL & EVIDENCE</span>
        <h1>Know what the model can tell you.</h1>
        <p>LesionLens is an image-classification research project. This page separates the recorded experiment from what has been verified about it.</p>
      </header>

      <section className="evidence-callout">
        <div className="evidence-icon"><Database size={18} /></div>
        <div><strong>{info?.evaluation?.status || 'Evaluation provenance is still being reconstructed'}</strong><p>{info?.evaluation_status || 'Metrics are not available from the local API right now.'} These results do not establish clinical performance.</p></div>
      </section>

      <section className="evidence-section">
        <div className="section-title"><span>01</span><div><h2>Recorded evaluation</h2><p>Aggregate metrics currently stored with the repository.</p></div></div>
        {loading ? <p>Loading model record…</p> : info?.metrics ? (
          <>
            <div className="metric-grid">
              {[
                ['Accuracy', info.metrics.accuracy], ['Balanced accuracy', info.metrics.balanced_accuracy],
                ['Macro AUC', info.metrics.macro_auc], ['Macro F1', info.metrics.macro_f1],
              ].map(([label, value]) => <div className="metric-card" key={String(label)}><span>{label}</span><strong>{percent(value as number | undefined)}</strong></div>)}
            </div>
            <div className="evidence-meta-grid">
              {[
                ['Model version', info.evaluation?.model_version || 'Unidentified'],
                ['Evaluation date', info.evaluation?.evaluation_date || 'Not recorded'],
                ['Test images', info.evaluation?.test_images ?? 'Not recorded'],
                ['Calibration', typeof info.evaluation?.calibration === 'string' ? info.evaluation.calibration : 'Not evaluated'],
                ['Dataset', info.evaluation?.dataset || 'Unknown'],
                ['Split grouping', info.evaluation?.split_group || 'Not recorded'],
                ['Split sizes', info.evaluation?.split_counts ? Object.entries(info.evaluation.split_counts).map(([key, count]) => `${key}: ${count}`).join(' · ') : 'Not recorded'],
                ['Evaluation manifest', info.evaluation?.evaluation_manifest_sha256 ? `${info.evaluation.evaluation_manifest_sha256.slice(0, 12)}…` : 'Not recorded'],
              ].map(([label, value]) => <div className="evidence-meta-card" key={label}><span>{label}</span><strong>{String(value)}</strong></div>)}
            </div>
            <p className="evidence-caption">Per-class results from the selected evaluation export. Missing fields are shown as unavailable rather than estimated.</p>
            <div className="recall-list">{Object.entries(info.metrics.per_class_recall || {}).map(([key, value]) => <div className="recall-row" key={key}><span>{classNames[key] || key}</span><div className="recall-track"><i style={{ width: `${Math.max(0, Math.min(100, value * 100))}%` }} /></div><strong>{percent(value)}</strong></div>)}</div>
            {!!Object.keys(info.metrics.per_class || {}).length && <div className="table-scroll"><table className="evidence-class-table"><thead><tr><th>Class</th><th>Precision</th><th>Recall</th><th>F1</th><th>Test cases</th></tr></thead><tbody>{Object.entries(info.metrics.per_class || {}).filter(([key]) => key !== 'accuracy' && key !== 'macro avg' && key !== 'weighted avg').map(([key, values]) => <tr key={key}><td>{classNames[key] || key}</td><td>{percent(values.precision)}</td><td>{percent(values.recall)}</td><td>{percent(values['f1-score'])}</td><td>{values.support ?? '—'}</td></tr>)}</tbody></table></div>}
            {info.evaluation?.confusion_matrix?.length ? <section className="confusion-section"><h3>Normalized confusion matrix</h3><p>Rows are true labels; columns are model-ranked labels. Color intensity represents the row share.</p><div className="table-scroll"><div className="confusion-matrix" style={{ gridTemplateColumns: `minmax(105px,1.2fr) repeat(${info.evaluation.confusion_matrix_classes?.length || 0}, minmax(38px,1fr))` }}>
              <span className="confusion-label">True ↓ / Model →</span>{(info.evaluation.confusion_matrix_classes || []).map((key) => <span className="confusion-label" key={`head-${key}`}>{key}</span>)}
              {info.evaluation.confusion_matrix.map((row, rowIndex) => <Fragment key={`row-${rowIndex}`}><span className="confusion-label">{(info.evaluation?.confusion_matrix_classes || [])[rowIndex]}</span>{row.map((value, colIndex) => <span className="confusion-cell" key={`${rowIndex}-${colIndex}`} style={{ background: `rgba(23,107,96,${Math.max(.06, Math.min(.88, value))})`, color: value > .55 ? '#fff' : 'var(--text-main)' }} title={`${(info.evaluation?.confusion_matrix_classes || [])[rowIndex]} predicted as ${(info.evaluation?.confusion_matrix_classes || [])[colIndex]}: ${percent(value)}`}>{percent(value)}</span>)}</Fragment>)}
            </div></div></section> : <p className="evidence-caption">A confusion matrix was not included in the available evaluation export.</p>}
            <p className="evidence-caption">Model versions are compared only when their evaluation-manifest hashes match exactly, which binds the same split and labels.</p>
            {comparableVersions.length > 1 ? <div className="table-scroll"><table className="evidence-class-table"><thead><tr><th>Matched evaluation set</th>{comparableVersions.map((version) => <th key={version.id}>Model {version.id}</th>)}</tr></thead><tbody>{[
              ['Accuracy', 'accuracy'], ['Balanced accuracy', 'balanced_accuracy'], ['Macro F1', 'macro_f1'], ['Macro AUC', 'macro_ovr_auc'],
            ].map(([label, key]) => <tr key={key}><td>{label}</td>{comparableVersions.map((version) => <td key={version.id}>{percent(version.metrics[key as keyof typeof version.metrics])}</td>)}</tr>)}</tbody></table></div> : <p className="evidence-caption">Version comparison is locked until at least two model exports share the exact same evaluation-manifest hash.</p>}
          </>
        ) : <p>The local model record could not be loaded.</p>}
      </section>

      <section className="evidence-section evidence-two-col">
        <article className="evidence-card"><div className="evidence-icon"><Database size={18} /></div><h2>Data and training</h2><p>{info?.datasets || 'Training data, patient-level split rules, and the original training pipeline are not currently traceable from the checked-in artifacts.'}</p><p>The seven-class EfficientNet-B0 checkpoint {info?.metadata_supported ? 'can use optional age, sex, and body-location features.' : 'uses image pixels only.'} Symptoms do not change its scores.</p></article>
        <article className="evidence-card"><div className="evidence-icon"><Shield size={18} /></div><h2>How to read a result</h2><p>A ranked score shows how the model’s categories compare for an image. It is not the probability that a person has a disease, and it cannot rule out a condition.</p><p>Heatmaps show image regions that affected a score. They do not establish that the model recognized a clinically meaningful feature.</p></article>
      </section>

      <section className="evidence-section">
        <div className="section-title"><span>02</span><div><h2>Current limits</h2><p>Known gaps that are part of the rebuild work.</p></div></div>
        <ul className="limit-list">{(info?.limitations || ['Training and test data provenance has not been verified from this repository.', 'External validation, calibration, and subgroup performance have not been established.', 'This research tool is not a diagnostic or triage system.']).map((item) => <li key={item}>{item}</li>)}</ul>
      </section>

      <section className="evidence-section llm-card">
        <div className="evidence-icon"><Sparkles size={18} /></div><div><h2>Optional AI-written summary</h2><p>The external summary is off unless you select it on the image screen. If selected, model outputs and the context you report are sent to Groq for wording; the image itself is not included in that request. The generated text is educational and may be incomplete.</p></div>
      </section>

      <div className="evidence-footer"><span>Research & learning</span><a href="/">Explore an image <ArrowUpRight size={15} /></a></div>
    </main>
  );
}
