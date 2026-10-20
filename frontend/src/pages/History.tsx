import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Clock3, History as HistoryIcon, Search, Trash2, UserRound } from 'lucide-react';
import { Link } from 'react-router-dom';
import { deleteAnalysisHistory, getAnalysisHistory } from '../history';
import type { AnalysisHistoryRecord } from '../history';
import { useAppContext } from '../Context';
import { translations } from '../i18n';

const classNames: Record<string, string> = {
  akiec: 'Actinic keratosis / in-situ carcinoma', bcc: 'Basal cell carcinoma', bkl: 'Benign keratosis-like lesion',
  df: 'Dermatofibroma', mel: 'Melanoma', nv: 'Melanocytic nevus', vasc: 'Vascular lesion',
};
const classKeys = ['akiec', 'bcc', 'bkl', 'df', 'mel', 'nv', 'vasc'];

function HistoryCard({ record, onDelete, copy }: { record: AnalysisHistoryRecord; onDelete: (id: string) => void; copy: Record<string, string> }) {
  const [imageUrl, setImageUrl] = useState('');
  useEffect(() => {
    const url = URL.createObjectURL(record.image);
    setImageUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [record.image]);

  const fallback = Object.fromEntries((record.result?.top3 || []).map((row: any) => [row.class, row.score]));
  const scores = classKeys.map((key) => [key, Number(record.result?.scores?.[key] ?? fallback[key] ?? 0)] as [string, number]).sort((a, b) => b[1] - a[1]);
  const leader = scores[0];
  const date = new Date(record.createdAt);

  return (
    <article className="history-card">
      <div className="history-image">{imageUrl && <img src={imageUrl} alt="Saved analysis image" />}</div>
      <div className="history-main">
        <div className="history-meta"><span><Clock3 size={14} />{date.toLocaleString()}</span>{(record.patient.name || record.patient.gender) && <span><UserRound size={14} />{[record.patient.name, record.patient.gender ? (copy[record.patient.gender.toLowerCase()] || record.patient.gender) : ''].filter(Boolean).join(' · ')}</span>}</div>
        <h2>{leader ? classNames[leader[0]] || leader[0] : 'Analysis'} <small>{leader ? `${(Number(leader[1]) * 100).toFixed(1)}% model score` : 'Scores unavailable'}</small></h2>
        <p className="history-filename">{record.imageName}{record.firstNoticed ? ` · First noticed ${record.firstNoticed}` : ''}</p>
        <details className="history-score-details">
          <summary>{copy.historyViewScores}</summary>
          <div className="history-score-grid">
            {scores.map(([key, value]) => <div className="history-score-row" key={key}>
              <span>{classNames[key] || key}</span><strong>{(Number(value) * 100).toFixed(1)}%</strong>
              <div className="score-track"><i className={key === leader?.[0] ? 'is-leading' : ''} style={{ width: `${Math.max(0, Math.min(100, Number(value) * 100))}%` }} /></div>
            </div>)}
          </div>
          <p className="history-score-note">Relative model scores, not calibrated disease probabilities.</p>
          {record.notes && <p className="history-notes"><strong>Visit notes:</strong> {record.notes}</p>}
        </details>
      </div>
      <button type="button" className="history-delete" aria-label="Delete this analysis" title="Delete this analysis" onClick={() => onDelete(record.id)}><Trash2 size={16} /></button>
    </article>
  );
}

export default function History() {
  const { lang } = useAppContext();
  const t = translations[lang];
  const [records, setRecords] = useState<AnalysisHistoryRecord[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const refresh = async () => {
    setLoading(true);
    try { setRecords(await getAnalysisHistory()); setError(''); }
    catch { setError('Browser storage is unavailable. Try this app in a current browser with site storage enabled.'); }
    finally { setLoading(false); }
  };

  useEffect(() => { void refresh(); }, []);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return records;
    return records.filter((record) => {
      const scores = Object.keys(record.result?.scores || {}).map((key) => classNames[key] || key).join(' ');
      return `${record.patient.name} ${record.patient.gender} ${record.imageName} ${scores}`.toLowerCase().includes(term);
    });
  }, [records, search]);

  const removeRecord = async (id: string) => {
    try { await deleteAnalysisHistory(id); setRecords((current) => current.filter((record) => record.id !== id)); }
    catch { setError('Could not delete this item from browser history.'); }
  };

  return (
    <main className="history-page">
      <header className="history-heading">
        <span className="eyebrow"><HistoryIcon size={14} /> YOUR DEVICE</span>
        <h1>{t.historyTitle}</h1>
        <p>{t.historyDescription}</p>
      </header>
      <div className="history-toolbar">
        <label className="history-search"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t.historySearch} aria-label={t.historySearch} /></label>
        <span className="history-count">{records.length} {records.length === 1 ? t.historyCountSingular : t.historyCountPlural}</span>
        <Link to="/" className="button-primary">{t.analyzeBtn} <ArrowRight size={16} /></Link>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      {loading ? <div className="history-empty">{t.historyLoading}</div> : filtered.length ? <section className="history-list" aria-label={t.historyTitle}>
        {filtered.map((record) => <HistoryCard key={record.id} record={record} onDelete={(id) => void removeRecord(id)} copy={t} />)}
      </section> : <section className="history-empty"><span className="history-empty-icon"><HistoryIcon size={22} /></span><h2>{records.length ? t.historyNoMatches : t.historyEmpty}</h2><p>{records.length ? t.historyTryAgain : t.historyEmptyDescription}</p>{!records.length && <Link className="button-primary" to="/">{t.analyzeBtn} <ArrowRight size={16} /></Link>}</section>}
      <p className="history-privacy">{t.historyScores} {t.historyLocalNote}</p>
    </main>
  );
}
