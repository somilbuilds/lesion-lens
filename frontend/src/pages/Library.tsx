import { useEffect, useMemo, useState } from 'react';
import {
  ArrowUpRight,
  BookOpen,
  Search,
  SlidersHorizontal,
  ExternalLink,
  ShieldCheck,
  Eye,
  X,
} from 'lucide-react';
import { fetchConditions } from '../api';

type Condition = {
  name: string;
  overview?: string;
  what_it_is?: string;
  symptoms_signs?: string;
  causes_risks?: string;
  doctor_assessment?: string;
  links?: string[];
};

type Exemplar = {
  isic_id: string;
  local_url: string;
  remote_thumb: string;
  diagnosis: string;
  diagnosis_confirm: string;
  age: number | null;
  sex: string | null;
  site: string;
};

const labels: Record<string, string> = {
  akiec: 'Actinic keratosis / SCC in situ',
  bcc: 'Basal cell carcinoma',
  bkl: 'Benign keratosis-like lesion',
  df: 'Dermatofibroma',
  mel: 'Melanoma',
  nv: 'Melanocytic nevus (Mole)',
  vasc: 'Vascular lesion',
};

export default function Library() {
  const [classes, setClasses] = useState<Record<string, Condition>>({});
  const [exemplars, setExemplars] = useState<Record<string, Exemplar[]>>({});
  const [contentStatus, setContentStatus] = useState('');
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');

  // Interactive Side-by-Side Comparison state
  const [compareA, setCompareA] = useState<string>('mel');
  const [compareB, setCompareB] = useState<string>('nv');

  // Lightbox modal state
  const [activeModalImage, setActiveModalImage] = useState<Exemplar | null>(null);

  useEffect(() => {
    fetchConditions()
      .then((data) => {
        setClasses(data.classes || {});
        setContentStatus(data.content_status || 'Source-linked clinical reference.');
      })
      .catch(() => setError('The learning library could not be loaded. Check that the backend is running.'));

    // Fetch local verified exemplars manifest
    fetch('/library_exemplars.json')
      .then((r) => r.json())
      .then((data) => setExemplars(data))
      .catch((err) => console.warn('Could not load library exemplars:', err));
  }, []);

  const entries = useMemo(
    () =>
      Object.entries(classes).filter(([key, item]) =>
        `${key} ${item.name} ${item.overview}`.toLowerCase().includes(search.trim().toLowerCase())
      ),
    [classes, search]
  );

  return (
    <main className="library-page" style={{ maxWidth: '1240px' }}>
      <header className="library-heading" style={{ maxWidth: '860px', marginBottom: '28px' }}>
        <span className="eyebrow">
          <BookOpen size={15} /> Clinical Atlas & Learning Library
        </span>
        <h1>Compare Verified Dermoscopy Hallmarks</h1>
        <p style={{ fontSize: '15px', color: 'var(--text-secondary)' }}>
          Explore confirmed histopathological cases from the International Skin Imaging Collaboration (ISIC HAM10000) archive.
          Compare 5 verified clinical exemplar photos across all 7 lesion categories.
        </p>
        {contentStatus && (
          <span style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'block', marginTop: '6px' }}>
            Reference Status: {contentStatus}
          </span>
        )}
      </header>

      {/* ============================================================== */}
      {/* 1. INTERACTIVE SIDE-BY-SIDE LESION COMPARISON WORKSTATION       */}
      {/* ============================================================== */}
      <section
        style={{
          padding: '24px',
          background: 'var(--Surface)',
          border: '1.5px solid var(--accent-border)',
          borderRadius: '16px',
          marginBottom: '36px',
          boxShadow: 'var(--shadow-md)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px', marginBottom: '18px' }}>
          <div>
            <span className="eyebrow">
              <SlidersHorizontal size={14} /> Side-by-Side Visual Triage
            </span>
            <h2 style={{ fontSize: '19px', margin: 0 }}>Interactive Condition Comparison Matrix</h2>
          </div>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <label style={{ fontSize: '13px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
              Compare:
              <select
                value={compareA}
                onChange={(e) => setCompareA(e.target.value)}
                style={{ padding: '6px 10px', fontSize: '13px', borderRadius: '8px', border: '1px solid var(--border)' }}
              >
                {Object.keys(labels).map((k) => (
                  <option key={k} value={k}>
                    {labels[k]}
                  </option>
                ))}
              </select>
            </label>
            <span style={{ fontWeight: 700, color: 'var(--text-muted)' }}>vs</span>
            <label style={{ fontSize: '13px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
              With:
              <select
                value={compareB}
                onChange={(e) => setCompareB(e.target.value)}
                style={{ padding: '6px 10px', fontSize: '13px', borderRadius: '8px', border: '1px solid var(--border)' }}
              >
                {Object.keys(labels).map((k) => (
                  <option key={k} value={k}>
                    {labels[k]}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        {/* Side-by-Side 5x5 Gallery Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
          {/* Column A */}
          <div style={{ padding: '16px', background: 'var(--bg-lighter)', borderRadius: '12px', border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <strong style={{ fontSize: '15px', color: 'var(--text-main)' }}>{labels[compareA]}</strong>
              <span className="abcde-badge">5 Exemplars</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '8px' }}>
              {(exemplars[compareA] || []).map((img) => (
                <div
                  key={img.isic_id}
                  onClick={() => setActiveModalImage(img)}
                  style={{
                    position: 'relative',
                    aspectRatio: '1',
                    borderRadius: '8px',
                    overflow: 'hidden',
                    cursor: 'pointer',
                    border: '1px solid var(--border)',
                    boxShadow: 'var(--shadow-sm)',
                  }}
                  title={`Click to inspect ${img.isic_id}`}
                >
                  <img
                    src={img.local_url}
                    alt={img.isic_id}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = img.remote_thumb;
                    }}
                  />
                  <span
                    style={{
                      position: 'absolute',
                      bottom: '2px',
                      right: '2px',
                      background: 'rgba(0,0,0,0.65)',
                      color: 'white',
                      fontSize: '8px',
                      padding: '1px 3px',
                      borderRadius: '3px',
                    }}
                  >
                    <Eye size={10} />
                  </span>
                </div>
              ))}
            </div>
            <p style={{ marginTop: '10px', fontSize: '12px', color: 'var(--text-secondary)' }}>
              {classes[compareA]?.overview?.slice(0, 160)}...
            </p>
          </div>

          {/* Column B */}
          <div style={{ padding: '16px', background: 'var(--bg-lighter)', borderRadius: '12px', border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <strong style={{ fontSize: '15px', color: 'var(--text-main)' }}>{labels[compareB]}</strong>
              <span className="abcde-badge">5 Exemplars</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '8px' }}>
              {(exemplars[compareB] || []).map((img) => (
                <div
                  key={img.isic_id}
                  onClick={() => setActiveModalImage(img)}
                  style={{
                    position: 'relative',
                    aspectRatio: '1',
                    borderRadius: '8px',
                    overflow: 'hidden',
                    cursor: 'pointer',
                    border: '1px solid var(--border)',
                    boxShadow: 'var(--shadow-sm)',
                  }}
                  title={`Click to inspect ${img.isic_id}`}
                >
                  <img
                    src={img.local_url}
                    alt={img.isic_id}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = img.remote_thumb;
                    }}
                  />
                  <span
                    style={{
                      position: 'absolute',
                      bottom: '2px',
                      right: '2px',
                      background: 'rgba(0,0,0,0.65)',
                      color: 'white',
                      fontSize: '8px',
                      padding: '1px 3px',
                      borderRadius: '3px',
                    }}
                  >
                    <Eye size={10} />
                  </span>
                </div>
              ))}
            </div>
            <p style={{ marginTop: '10px', fontSize: '12px', color: 'var(--text-secondary)' }}>
              {classes[compareB]?.overview?.slice(0, 160)}...
            </p>
          </div>
        </div>
      </section>

      {/* Search Input */}
      <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '24px', maxWidth: '520px' }}>
        <div className="history-search" style={{ width: '100%' }}>
          <Search size={18} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search symptoms, signs, risk factors, or condition..."
          />
        </div>
      </div>

      {error && <p className="form-error" role="alert">{error}</p>}

      {/* ============================================================== */}
      {/* 2. CATEGORY ATLAS CARDS WITH 5 EMBEDDED CLINICAL IMAGES        */}
      {/* ============================================================== */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '24px' }}>
        {entries.map(([key, item]) => {
          const catExemplars = exemplars[key] || [];
          return (
            <article
              key={key}
              style={{
                padding: '22px',
                background: 'var(--Surface)',
                border: '1px solid var(--border)',
                borderRadius: '16px',
                boxShadow: 'var(--shadow-sm)',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              {/* Card Header */}
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', marginBottom: '14px' }}>
                <span className="step-number" style={{ textTransform: 'uppercase', fontSize: '12px' }}>
                  {key}
                </span>
                <div>
                  <h2 style={{ fontSize: '17px', margin: '0 0 2px' }}>{item.name || labels[key] || key}</h2>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Verified ISIC HAM10000 Reference</span>
                </div>
              </div>

              {/* 5 Exemplar Images Thumbnails Bar */}
              <div style={{ marginBottom: '16px' }}>
                <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
                  Verified Case Exemplars ({catExemplars.length} / 5):
                </span>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '6px' }}>
                  {catExemplars.map((ex) => (
                    <div
                      key={ex.isic_id}
                      onClick={() => setActiveModalImage(ex)}
                      style={{
                        aspectRatio: '1',
                        borderRadius: '6px',
                        overflow: 'hidden',
                        cursor: 'pointer',
                        border: '1px solid var(--border)',
                        background: 'var(--bg-subtle)',
                        transition: 'transform 0.15s ease',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.05)')}
                      onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
                      title={`Inspect ${ex.isic_id} (${ex.diagnosis})`}
                    >
                      <img
                        src={ex.local_url}
                        alt={ex.isic_id}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = ex.remote_thumb;
                        }}
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* Clinical Description */}
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', flex: 1, lineHeight: 1.6, marginBottom: '14px' }}>
                {item.overview || item.what_it_is}
              </p>

              {/* Expandable Clinical Details */}
              <div style={{ display: 'grid', gap: '8px', borderTop: '1px solid var(--border)', paddingTop: '12px' }}>
                {item.symptoms_signs && (
                  <details style={{ fontSize: '13px' }}>
                    <summary style={{ cursor: 'pointer', fontWeight: 600, color: 'var(--accent)' }}>
                      Recognized Symptoms & Visual Signs
                    </summary>
                    <p style={{ marginTop: '6px', color: 'var(--text-secondary)', fontSize: '12px', lineHeight: 1.5 }}>
                      {item.symptoms_signs}
                    </p>
                  </details>
                )}
                {item.causes_risks && (
                  <details style={{ fontSize: '13px' }}>
                    <summary style={{ cursor: 'pointer', fontWeight: 600, color: 'var(--accent)' }}>
                      Causes & Risk Factors
                    </summary>
                    <p style={{ marginTop: '6px', color: 'var(--text-secondary)', fontSize: '12px', lineHeight: 1.5 }}>
                      {item.causes_risks}
                    </p>
                  </details>
                )}
                {item.doctor_assessment && (
                  <details style={{ fontSize: '13px' }}>
                    <summary style={{ cursor: 'pointer', fontWeight: 600, color: 'var(--accent)' }}>
                      Dermatologist Assessment Protocol
                    </summary>
                    <p style={{ marginTop: '6px', color: 'var(--text-secondary)', fontSize: '12px', lineHeight: 1.5 }}>
                      {item.doctor_assessment}
                    </p>
                  </details>
                )}
              </div>

              {/* Reference Links */}
              {item.links && item.links.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '14px' }}>
                  {item.links.map((url) => (
                    <a
                      href={url}
                      target="_blank"
                      rel="noreferrer"
                      key={url}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        padding: '4px 8px',
                        background: 'var(--bg-subtle)',
                        borderRadius: '6px',
                        fontSize: '11px',
                        fontWeight: 600,
                      }}
                    >
                      {new URL(url).hostname.replace(/^www\./, '')} <ArrowUpRight size={12} />
                    </a>
                  ))}
                </div>
              )}
            </article>
          );
        })}
      </div>

      {/* ============================================================== */}
      {/* 3. LIGHTBOX MODAL FOR HIGH-RES INSPECTION                     */}
      {/* ============================================================== */}
      {activeModalImage && (
        <div
          onClick={() => setActiveModalImage(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.75)',
            display: 'grid',
            placeItems: 'center',
            zIndex: 100,
            padding: '20px',
            backdropFilter: 'blur(4px)',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'var(--Surface)',
              padding: '24px',
              borderRadius: '16px',
              maxWidth: '480px',
              width: '100%',
              boxShadow: 'var(--shadow-lg)',
              border: '1px solid var(--border)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <div>
                <span className="eyebrow" style={{ marginBottom: 0 }}>
                  <ShieldCheck size={14} /> Confirmed Dermoscopy Case
                </span>
                <h3 style={{ margin: '4px 0 0', fontSize: '18px' }}>{activeModalImage.isic_id}</h3>
              </div>
              <button
                type="button"
                onClick={() => setActiveModalImage(null)}
                style={{
                  background: 'transparent',
                  border: 0,
                  cursor: 'pointer',
                  color: 'var(--text-muted)',
                }}
              >
                <X size={20} />
              </button>
            </div>

            <div
              style={{
                borderRadius: '10px',
                overflow: 'hidden',
                background: '#000',
                aspectRatio: '1',
                display: 'grid',
                placeItems: 'center',
                marginBottom: '16px',
              }}
            >
              <img
                src={activeModalImage.local_url}
                alt={activeModalImage.isic_id}
                style={{ width: '100%', height: '100%', objectFit: 'contain' }}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '13px', marginBottom: '14px' }}>
              <div className="brief-metric-box">
                <span>Histopathologic Diagnosis</span>
                <strong>{activeModalImage.diagnosis}</strong>
              </div>
              <div className="brief-metric-box">
                <span>Confirmation Method</span>
                <strong>{activeModalImage.diagnosis_confirm}</strong>
              </div>
              <div className="brief-metric-box">
                <span>Patient Demographics</span>
                <strong>
                  {activeModalImage.age ? `${activeModalImage.age} yrs` : 'Unknown'} · {activeModalImage.sex || 'Unknown'}
                </strong>
              </div>
              <div className="brief-metric-box">
                <span>Anatomical Site</span>
                <strong>{activeModalImage.site}</strong>
              </div>
            </div>

            <a
              href={`https://api.isic-archive.com/images/${activeModalImage.isic_id}/`}
              target="_blank"
              rel="noreferrer"
              className="button-primary"
              style={{ width: '100%', justifyContent: 'center' }}
            >
              View on ISIC Archive <ExternalLink size={15} />
            </a>
          </div>
        </div>
      )}
    </main>
  );
}
