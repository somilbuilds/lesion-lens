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

const CATEGORY_TABS = [
  { id: 'all', label: 'All Categories (35)' },
  { id: 'mel', label: 'Melanoma' },
  { id: 'nv', label: 'Nevus' },
  { id: 'bcc', label: 'Basal Cell' },
  { id: 'akiec', label: 'Actinic Keratosis' },
  { id: 'bkl', label: 'Benign Keratosis' },
  { id: 'df', label: 'Dermatofibroma' },
  { id: 'vasc', label: 'Vascular' },
];

export default function Library() {
  const [classes, setClasses] = useState<Record<string, Condition>>({});
  const [exemplars, setExemplars] = useState<Record<string, Exemplar[]>>({});
  const [contentStatus, setContentStatus] = useState('');
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');

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

    fetch('/library_exemplars.json')
      .then((r) => r.json())
      .then((data) => setExemplars(data))
      .catch((err) => console.warn('Could not load library exemplars:', err));
  }, []);

  const entries = useMemo(() => {
    return Object.entries(classes).filter(([key, item]) => {
      const matchesCategory = selectedCategory === 'all' || key === selectedCategory;
      const matchesSearch = `${key} ${item.name} ${item.overview || ''} ${item.symptoms_signs || ''}`
        .toLowerCase()
        .includes(search.trim().toLowerCase());
      return matchesCategory && matchesSearch;
    });
  }, [classes, search, selectedCategory]);

  return (
    <main className="library-page">
      <header className="library-heading">
        <span className="eyebrow">
          <BookOpen size={14} /> Clinical Atlas & Verified Reference
        </span>
        <h1>Dermoscopy Hallmarks & Exemplar Matrix</h1>
        <p>
          Examine confirmed histopathological cases from the International Skin Imaging Collaboration (ISIC HAM10000) archive.
          Compare 5 verified reference cases per lesion category across diagnostic hallmarks.
        </p>
        {contentStatus && (
          <span style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'block', marginTop: '4px' }}>
            Status: {contentStatus}
          </span>
        )}
      </header>

      {/* ============================================================== */}
      {/* 1. SIDE-BY-SIDE VISUAL TRIAGE COMPARISON WORKSTATION            */}
      {/* ============================================================== */}
      <section className="library-compare-box">
        <div className="library-compare-header">
          <div>
            <span className="eyebrow">
              <SlidersHorizontal size={13} /> Side-by-Side Visual Triage
            </span>
            <h2 style={{ fontSize: '17px', margin: 0 }}>Comparative Hallmarks Matrix</h2>
          </div>

          <div className="library-compare-selects">
            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)' }}>Condition A:</span>
            <select
              value={compareA}
              onChange={(e) => setCompareA(e.target.value)}
              aria-label="Select first condition to compare"
            >
              {Object.keys(labels).map((k) => (
                <option key={k} value={k}>
                  {labels[k]}
                </option>
              ))}
            </select>

            <span style={{ fontWeight: 700, color: 'var(--text-muted)', padding: '0 4px' }}>vs</span>

            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)' }}>Condition B:</span>
            <select
              value={compareB}
              onChange={(e) => setCompareB(e.target.value)}
              aria-label="Select second condition to compare"
            >
              {Object.keys(labels).map((k) => (
                <option key={k} value={k}>
                  {labels[k]}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Side-by-Side 2-Column Comparison */}
        <div className="library-compare-grid">
          {/* Column A */}
          <div className="library-compare-col">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <strong style={{ fontSize: '14.5px', color: 'var(--text-main)' }}>{labels[compareA]}</strong>
              <span className="abcde-badge">5 Verified Cases</span>
            </div>

            <div className="library-thumb-strip">
              {(exemplars[compareA] || []).map((img) => (
                <div
                  key={img.isic_id}
                  className="library-thumb-item"
                  onClick={() => setActiveModalImage(img)}
                  title={`Inspect ${img.isic_id}`}
                >
                  <img
                    src={img.local_url}
                    alt={img.isic_id}
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = img.remote_thumb;
                    }}
                  />
                  <div className="thumb-tag">
                    <span>{img.isic_id.replace('ISIC_', '#')}</span>
                    <Eye size={10} />
                  </div>
                </div>
              ))}
            </div>

            <p style={{ margin: '8px 0 0', fontSize: '12.5px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              {classes[compareA]?.overview?.slice(0, 150) || classes[compareA]?.what_it_is?.slice(0, 150)}...
            </p>
          </div>

          {/* Column B */}
          <div className="library-compare-col">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <strong style={{ fontSize: '14.5px', color: 'var(--text-main)' }}>{labels[compareB]}</strong>
              <span className="abcde-badge">5 Verified Cases</span>
            </div>

            <div className="library-thumb-strip">
              {(exemplars[compareB] || []).map((img) => (
                <div
                  key={img.isic_id}
                  className="library-thumb-item"
                  onClick={() => setActiveModalImage(img)}
                  title={`Inspect ${img.isic_id}`}
                >
                  <img
                    src={img.local_url}
                    alt={img.isic_id}
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = img.remote_thumb;
                    }}
                  />
                  <div className="thumb-tag">
                    <span>{img.isic_id.replace('ISIC_', '#')}</span>
                    <Eye size={10} />
                  </div>
                </div>
              ))}
            </div>

            <p style={{ margin: '8px 0 0', fontSize: '12.5px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              {classes[compareB]?.overview?.slice(0, 150) || classes[compareB]?.what_it_is?.slice(0, 150)}...
            </p>
          </div>
        </div>
      </section>

      {/* ============================================================== */}
      {/* 2. CATEGORY FILTER TABS & SEARCH BAR                           */}
      {/* ============================================================== */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px', marginBottom: '20px' }}>
        <div className="library-filter-bar" style={{ margin: 0 }}>
          {CATEGORY_TABS.map((tab) => (
            <button
              type="button"
              key={tab.id}
              className={`filter-pill ${selectedCategory === tab.id ? 'active' : ''}`}
              onClick={() => setSelectedCategory(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="history-search" style={{ maxWidth: '340px', minWidth: '220px' }}>
          <Search size={15} color="var(--text-muted)" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter symptoms or condition..."
            aria-label="Filter conditions"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              style={{ color: 'var(--text-muted)', padding: '2px', display: 'grid', placeItems: 'center' }}
            >
              <X size={13} />
            </button>
          )}
        </div>
      </div>

      {error && <p className="form-error" role="alert">{error}</p>}

      {/* ============================================================== */}
      {/* 3. CATEGORY ATLAS CARDS WITH 5 EMBEDDED CLINICAL IMAGES        */}
      {/* ============================================================== */}
      <div className="library-card-grid">
        {entries.map(([key, item]) => {
          const catExemplars = exemplars[key] || [];
          return (
            <article key={key} className="library-atlas-card">
              {/* Card Header */}
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', marginBottom: '12px' }}>
                <span className="library-code" style={{ textTransform: 'uppercase' }}>
                  {key}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h2 style={{ fontSize: '16px', margin: '0 0 2px' }}>{item.name || labels[key] || key}</h2>
                  <span style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>
                    ISIC Archive Verified Benchmark
                  </span>
                </div>
              </div>

              {/* 5 Exemplar Images Thumbnails Bar */}
              <div style={{ marginBottom: '14px' }}>
                <span style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>
                  Confirmed Histopathology Cases ({catExemplars.length} / 5):
                </span>
                <div className="library-thumb-strip">
                  {catExemplars.map((ex) => (
                    <div
                      key={ex.isic_id}
                      className="library-thumb-item"
                      onClick={() => setActiveModalImage(ex)}
                      title={`Inspect ${ex.isic_id} (${ex.diagnosis})`}
                    >
                      <img
                        src={ex.local_url}
                        alt={ex.isic_id}
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = ex.remote_thumb;
                        }}
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* Clinical Description */}
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.55, marginBottom: '14px' }}>
                {item.overview || item.what_it_is}
              </p>

              {/* Expandable Clinical Details */}
              <div className="library-details-group">
                {item.symptoms_signs && (
                  <details className="library-details-item">
                    <summary>Diagnostic Signs & Visual Hallmarks</summary>
                    <p>{item.symptoms_signs}</p>
                  </details>
                )}
                {item.causes_risks && (
                  <details className="library-details-item">
                    <summary>Etiology & Known Risk Factors</summary>
                    <p>{item.causes_risks}</p>
                  </details>
                )}
                {item.doctor_assessment && (
                  <details className="library-details-item">
                    <summary>Dermatological Workup Protocol</summary>
                    <p>{item.doctor_assessment}</p>
                  </details>
                )}
              </div>

              {/* Reference Links */}
              {item.links && item.links.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '12px', paddingTop: '10px', borderTop: '1px solid var(--border)' }}>
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
                        padding: '3px 7px',
                        background: 'var(--bg-subtle)',
                        borderRadius: '6px',
                        fontSize: '11px',
                        fontWeight: 600,
                      }}
                    >
                      {new URL(url).hostname.replace(/^www\./, '')} <ArrowUpRight size={11} />
                    </a>
                  ))}
                </div>
              )}
            </article>
          );
        })}
      </div>

      {/* ============================================================== */}
      {/* 4. LIGHTBOX MODAL FOR HIGH-RES INSPECTION                     */}
      {/* ============================================================== */}
      {activeModalImage && (
        <div className="lightbox-backdrop" onClick={() => setActiveModalImage(null)}>
          <div className="lightbox-dialog" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <div>
                <span className="eyebrow" style={{ marginBottom: 0 }}>
                  <ShieldCheck size={13} /> Confirmed Dermoscopy Case
                </span>
                <h3 style={{ margin: '2px 0 0', fontSize: '17px' }}>{activeModalImage.isic_id}</h3>
              </div>
              <button
                type="button"
                onClick={() => setActiveModalImage(null)}
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
              <img src={activeModalImage.local_url} alt={activeModalImage.isic_id} />
            </div>

            <div className="lightbox-grid">
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
              View on ISIC Archive <ExternalLink size={14} />
            </a>
          </div>
        </div>
      )}
    </main>
  );
}
