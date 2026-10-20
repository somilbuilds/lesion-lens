import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  Camera,
  Check,
  FileImage,
  ImagePlus,
  Info,
  RotateCcw,
  Sparkles,
  UploadCloud,
  MapPin,
  User,
  ShieldCheck,
  Calendar,
} from 'lucide-react';
import { analyzeImage } from '../api';
import { saveAnalysisHistory } from '../history';
import { inspectImage } from '../imageQuality';
import type { ImageQualityReport } from '../imageQuality';

type ReportedDetails = {
  itch: boolean;
  grew: boolean;
  hurt: boolean;
  changed: boolean;
  bleed: boolean;
  personal_skin_cancer_history: boolean;
};

const COMMON_BODY_SITES = [
  { id: 'face', label: 'Face / Scalp' },
  { id: 'neck', label: 'Neck' },
  { id: 'chest', label: 'Chest' },
  { id: 'back', label: 'Back' },
  { id: 'abdomen', label: 'Abdomen' },
  { id: 'upper extremity', label: 'Arm / Shoulder' },
  { id: 'hand', label: 'Hand' },
  { id: 'lower extremity', label: 'Leg / Thigh' },
  { id: 'foot', label: 'Foot' },
];

export default function Analyze({
  onComplete,
}: {
  onComplete: (
    res: any,
    file: File,
    symps: any,
    patient: { name: string; gender: string },
    historyError?: string,
    historyId?: string,
    firstNoticed?: string
  ) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [allowAiReport, setAllowAiReport] = useState(true);

  // Patient Context
  const [patientName, setPatientName] = useState('');
  const [gender, setGender] = useState('');
  const [firstNoticed, setFirstNoticed] = useState('');
  const [modelAge, setModelAge] = useState('');
  const [modelLocation, setModelLocation] = useState('');
  const [quality, setQuality] = useState<ImageQualityReport | null>(null);
  const [dragging, setDragging] = useState(false);

  const [details, setDetails] = useState<ReportedDetails>({
    itch: false,
    grew: false,
    hurt: false,
    changed: false,
    bleed: false,
    personal_skin_cancer_history: false,
  });

  const inputRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const previewRef = useRef<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    return () => {
      if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    };
  }, []);

  const selectFile = (next: File | undefined) => {
    if (!next) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(next.type) || next.size > 10 * 1024 * 1024) {
      setError('Please choose a valid JPEG, PNG or WebP image under 10 MB.');
      return;
    }
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    const url = URL.createObjectURL(next);
    previewRef.current = url;
    setFile(next);
    setPreview(url);
    setQuality(null);
    void inspectImage(next).then(setQuality).catch(() => setQuality(null));
    setError(null);
  };

  const submit = async () => {
    if (!file || loading) return;
    setLoading(true);
    setError(null);
    try {
      const context = { ...details };
      const result = await analyzeImage(file, context, allowAiReport, {
        age: modelAge,
        sex: gender.toLowerCase(),
        localization: modelLocation,
      });

      const patient = { name: patientName.trim(), gender };
      const historyId = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      let historyError = '';

      if (result.input_check?.level !== 'reject') {
        try {
          await saveAnalysisHistory({
            id: historyId,
            createdAt: new Date().toISOString(),
            imageName: file.name,
            imageType: file.type,
            image: file,
            result,
            symptoms: context,
            patient,
            firstNoticed,
            notes: '',
          });
        } catch (saveError) {
          console.error('Could not save analysis to local history', saveError);
          historyError = 'This result is available, but browser storage could not save it to History.';
        }
      }

      onComplete(
        result,
        file,
        context,
        patient,
        historyError,
        result.input_check?.level === 'reject' ? '' : historyId,
        firstNoticed
      );
      navigate('/results');
    } catch (err: any) {
      setError(err?.message || 'We could not analyze that image. Please verify your backend server is running.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="explorer-page">
      <section className="explorer-hero">
        <div className="explorer-copy">
          <span className="eyebrow">
            <span className="eyebrow-dot" /> Advanced Clinical Dermatology Workspace
          </span>
          <h1>Analyze skin lesions with multi-modal explainability.</h1>
          <p>
            Upload a close-up photo to inspect automated ABCDE clinical features, deep visual attribution maps, and an interactive clinical AI copilot.
          </p>
          <div className="scope-note">
            <Info size={18} color="var(--accent)" />
            <div>
              <strong>Educational & Research System</strong>
              <span>
                Algorithmic scores and contour extractions provide diagnostic assistance and clinical visit preparation, not a replacement for a dermatologist's biopsy.
              </span>
            </div>
          </div>
        </div>

        <div className="hero-art" aria-hidden="true">
          <div style={{ textAlign: 'center', padding: '24px' }}>
            <div className="upload-icon" style={{ margin: '0 auto 12px' }}>
              <ShieldCheck size={28} />
            </div>
            <strong style={{ fontSize: '16px', display: 'block', color: 'var(--text-main)' }}>
              100% Private & Device-Safe
            </strong>
            <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
              Images processed locally on your backend · Zero cloud training leakage
            </span>
          </div>
        </div>
      </section>

      <section className="explorer-grid">
        {/* Step 1: Upload */}
        <div className="upload-panel">
          <div className="panel-heading">
            <span className="step-number">01</span>
            <div>
              <h2>Upload Skin Lesion Photo</h2>
              <p>Close-up dermoscopic or macro photo in natural, even lighting. Max 10 MB.</p>
            </div>
          </div>

          {!preview ? (
            <div
              className={`dropzone ${dragging ? 'is-dragging' : ''}`}
              onDragEnter={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragOver={(e) => e.preventDefault()}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                selectFile(e.dataTransfer.files[0]);
              }}
            >
              <input
                ref={inputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(e) => selectFile(e.target.files?.[0])}
                hidden
              />
              <input
                ref={cameraRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                capture="environment"
                onChange={(e) => selectFile(e.target.files?.[0])}
                hidden
              />
              <div className="upload-icon">
                <ImagePlus size={26} />
              </div>
              <strong>Drag & drop your skin image here, or select an option below</strong>
              <div className="upload-actions">
                <button type="button" className="button-primary" onClick={() => inputRef.current?.click()}>
                  <UploadCloud size={17} /> Browse Files
                </button>
                <button type="button" className="button-secondary" onClick={() => cameraRef.current?.click()}>
                  <Camera size={17} /> Open Camera
                </button>
              </div>
            </div>
          ) : (
            <div className="preview-panel">
              <div className="preview-image-wrap">
                <img src={preview} alt="Selected skin image preview" />
                <span className="preview-chip">
                  <Check size={14} /> Ready for Analysis
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
                  <FileImage size={16} color="var(--accent)" />
                  <span>{file?.name}</span>
                  <span style={{ color: 'var(--text-muted)' }}>
                    ({((file?.size || 0) / (1024 * 1024)).toFixed(2)} MB)
                  </span>
                </div>
                <button
                  type="button"
                  className="button-secondary"
                  style={{ padding: '6px 12px', fontSize: '12px' }}
                  onClick={() => inputRef.current?.click()}
                >
                  <RotateCcw size={14} /> Change Photo
                </button>
                <input
                  ref={inputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(e) => selectFile(e.target.files?.[0])}
                  hidden
                />
              </div>
            </div>
          )}

          {/* Quality Coach Feedback */}
          {quality && (
            <div style={{ marginTop: '18px', padding: '14px', background: 'var(--bg-lighter)', borderRadius: '10px', border: '1px solid var(--border)' }}>
              <strong style={{ fontSize: '13px', display: 'block', marginBottom: '6px', color: 'var(--text-main)' }}>
                Image Quality Pre-Check:
              </strong>
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', fontSize: '12px', color: 'var(--text-secondary)' }}>
                <span>Dimensions: {quality.width} × {quality.height} px</span>
                <span>Sharpness score: {quality.sharpness.toFixed(0)}</span>
              </div>
              {quality.sharpness < 40 && (
                <p style={{ margin: '6px 0 0', color: 'var(--warning-color)', fontSize: '12px' }}>
                  • Photo may be slightly blurry. Ensure camera focus is locked on the lesion.
                </p>
              )}
            </div>
          )}

          {error && <div className="form-error" role="alert">{error}</div>}
        </div>

        {/* Step 2: Clinical Context & Body Site */}
        <aside className="context-panel">
          <div className="panel-heading">
            <span className="step-number">02</span>
            <div>
              <h2>Clinical & Anatomical Context</h2>
              <p>Optional metadata helps improve diagnostic accuracy.</p>
            </div>
          </div>

          {/* Body Site Pill Selector */}
          <div style={{ marginBottom: '18px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
              <MapPin size={15} color="var(--accent)" /> Anatomical Body Location:
            </label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {COMMON_BODY_SITES.map((site) => (
                <button
                  type="button"
                  key={site.id}
                  onClick={() => setModelLocation(modelLocation === site.id ? '' : site.id)}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '20px',
                    fontSize: '12px',
                    fontWeight: 500,
                    cursor: 'pointer',
                    background: modelLocation === site.id ? 'var(--accent)' : 'var(--bg-subtle)',
                    color: modelLocation === site.id ? '#ffffff' : 'var(--text-main)',
                    border: '1px solid',
                    borderColor: modelLocation === site.id ? 'var(--accent)' : 'var(--border)',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {site.label}
                </button>
              ))}
            </div>
          </div>

          {/* Patient Details */}
          <div className="patient-fields">
            <strong>
              <User size={13} style={{ display: 'inline', marginRight: '4px' }} /> Patient Information (Optional)
            </strong>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <label>
                Patient Name / Tag:
                <input
                  type="text"
                  maxLength={80}
                  value={patientName}
                  onChange={(e) => setPatientName(e.target.value)}
                  placeholder="e.g. Alex M."
                />
              </label>
              <label>
                Biological Sex:
                <select value={gender} onChange={(e) => setGender(e.target.value)}>
                  <option value="">Prefer not to say</option>
                  <option value="Female">Female</option>
                  <option value="Male">Male</option>
                </select>
              </label>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <label>
                Patient Age:
                <input
                  type="number"
                  min="0"
                  max="120"
                  value={modelAge}
                  onChange={(e) => setModelAge(e.target.value)}
                  placeholder="e.g. 45"
                />
              </label>
              <label>
                <Calendar size={13} style={{ display: 'inline', marginRight: '2px' }} /> First Noticed Date:
                <input
                  type="date"
                  value={firstNoticed}
                  onChange={(e) => setFirstNoticed(e.target.value)}
                />
              </label>
            </div>
          </div>

          {/* Clinical Symptom Flags */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ marginBottom: '8px' }}>Reported Lesion History:</label>
            <div style={{ display: 'grid', gap: '6px' }}>
              {[
                ['changed', 'Has changed in size, shape, or color recently'],
                ['grew', 'Has grown noticeably in the past few months'],
                ['bleed', 'Has bled or oozed without scratching'],
                ['itch', 'Is itchy, irritated, or painful'],
                ['personal_skin_cancer_history', 'Personal or family history of skin cancer'],
              ].map(([key, labelText]) => (
                <label className="detail-option" key={key}>
                  <input
                    type="checkbox"
                    checked={details[key as keyof ReportedDetails]}
                    onChange={(e) => setDetails({ ...details, [key]: e.target.checked })}
                  />
                  <span className="custom-check">
                    <Check size={14} />
                  </span>
                  <span>{labelText}</span>
                </label>
              ))}
            </div>
          </div>

          {/* AI Copilot Toggle */}
          <div className="ai-option">
            <label className="ai-check">
              <input
                type="checkbox"
                checked={allowAiReport}
                onChange={(e) => setAllowAiReport(e.target.checked)}
              />
              <span className="custom-check">
                <Check size={14} />
              </span>
              <div className="ai-copy">
                <strong>
                  <Sparkles size={16} /> Enable Interactive Clinical Copilot
                </strong>
                <small>
                  Uses Groq AI to generate personalized doctor consultation questions and interactive chat grounded in your image's ABCDE metrics.
                </small>
              </div>
            </label>
          </div>

          {/* Submit Button */}
          <button
            type="button"
            className="explore-button"
            disabled={!file || loading}
            onClick={submit}
          >
            {loading ? (
              'Analyzing Image & Extracting Morphology…'
            ) : (
              <>
                Analyze Lesion Morphology <ArrowRight size={18} />
              </>
            )}
          </button>
        </aside>
      </section>
    </main>
  );
}
