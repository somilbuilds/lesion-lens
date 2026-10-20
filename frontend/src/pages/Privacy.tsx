import { useState } from 'react';
import { Database, LockKeyhole, Shield, Trash2 } from 'lucide-react';
import { useAppContext } from '../Context';
import { clearAnalysisHistory } from '../history';
import { translations } from '../i18n';

export default function Privacy() {
  const { accessibility, setAccessibility, lang } = useAppContext();
  const t = translations[lang];
  const [message, setMessage] = useState('');
  const clearHistory = async () => {
    if (!window.confirm(t.privacyConfirmDelete)) return;
    try { await clearAnalysisHistory(); setMessage(t.privacyDeleted); }
    catch { setMessage(t.privacyDeleteError); }
  };

  return <main className="privacy-page">
    <header className="library-heading"><span className="eyebrow"><Shield size={14} /> {t.privacyTab.toUpperCase()} & ACCESSIBILITY</span><h1>{t.privacyTitle}</h1><p>{t.privacyDescription}</p></header>
    <section className="privacy-grid">
      <article className="privacy-card"><span className="library-code"><Database size={16} /></span><h2>{t.privacyLocalTitle}</h2><p>{t.privacyLocalBody}</p><button type="button" className="button-secondary privacy-delete" onClick={() => void clearHistory()}><Trash2 size={15} />{t.privacyDelete}</button>{message && <p role="status" className="privacy-feedback">{message}</p>}</article>
      <article className="privacy-card"><span className="library-code"><LockKeyhole size={16} /></span><h2>{t.privacyServerTitle}</h2><p>{t.privacyServerBody}</p></article>
      <article className="privacy-card"><span className="library-code">AI</span><h2>{t.privacyAiTitle}</h2><p>{t.privacyAiBody}</p></article>
      <article className="privacy-card accessibility-card"><span className="library-code">Aa</span><h2>{t.privacyAccessTitle}</h2><p>{t.privacyAccessBody}</p><label className="accessibility-switch"><input type="checkbox" checked={accessibility} onChange={(event) => setAccessibility(event.target.checked)} /><span>{accessibility ? t.privacyAccessOn : t.privacyAccessOff}</span></label></article>
    </section>
  </main>;
}
