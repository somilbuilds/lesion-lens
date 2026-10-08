import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { UploadCloud, Camera, AlertCircle } from 'lucide-react';
import { analyzeImage } from '../api';
import { useAppContext } from '../Context';
import { translations } from '../i18n';

export default function Analyze({ onComplete }: { onComplete: (res: any, file: File, symps: any) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const { lang, theme } = useAppContext();
  const t = translations[lang];

  const dropZoneBg = theme === 'light' ? '#F9FAFB' : '#1F2937';

  const [symptoms, setSymptoms] = useState({
    itch: false, grew: false, hurt: false, changed: false, bleed: false, personal_skin_cancer_history: false,
    age: '', sex: '', fitzpatrick: '', body_region: '', diameter_mm: ''
  });

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const f = e.target.files[0];
      setFile(f);
      setPreview(URL.createObjectURL(f));
      setError(null);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const f = e.dataTransfer.files[0];
      setFile(f);
      setPreview(URL.createObjectURL(f));
    }
  };

  const submit = async () => {
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      const res = await analyzeImage(file, symptoms);
      onComplete(res, file, symptoms);
      navigate('/results');
    } catch (err: any) {
      setError(err.message || t.errorOccurred);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="analyze-page">
      <div className="card">
        <h2>{t.submitTitle}</h2>
        <p>{t.submitDesc}</p>
        
        {!preview ? (
          <div 
            className="upload-area" 
            onDragOver={(e) => e.preventDefault()} 
            onDrop={handleDrop}
            style={{ border: '2px dashed var(--border)', borderRadius: '8px', padding: '48px', textAlign: 'center', backgroundColor: dropZoneBg, cursor: 'pointer' }}
            onClick={() => fileInputRef.current?.click()}
          >
            <UploadCloud size={48} color="var(--text-muted)" style={{ margin: '0 auto 16px auto', display: 'block' }} />
            <p style={{ color: 'var(--text-main)', fontWeight: 500 }}>{t.dragDrop}</p>
            <p style={{ fontSize: '14px' }}>{t.maxFileSize}</p>
            
            <div style={{ marginTop: '24px' }}>
              <button 
                type="button" 
                className="secondary" 
                onClick={(e) => { e.stopPropagation(); cameraInputRef.current?.click(); }}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}
              >
                <Camera size={18} /> {t.takePhoto}
              </button>
            </div>
            
            <input type="file" ref={fileInputRef} onChange={handleFile} accept="image/jpeg,image/png,image/webp" style={{ display: 'none' }} />
            <input type="file" ref={cameraInputRef} onChange={handleFile} accept="image/jpeg,image/png,image/webp" capture="environment" style={{ display: 'none' }} />
          </div>
        ) : (
          <div>
            <div style={{ position: 'relative', maxWidth: '400px', margin: '0 auto 24px auto' }}>
              <img src={preview} alt="Preview" style={{ width: '100%', borderRadius: '8px', objectFit: 'contain' }} />
              <button className="secondary" onClick={() => { setFile(null); setPreview(null); }} style={{ position: 'absolute', top: '8px', right: '8px', padding: '4px 8px', fontSize: '14px' }}>{t.changePhoto}</button>
            </div>
            
            <div className="card" style={{ backgroundColor: dropZoneBg, marginTop: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }} onClick={() => setShowForm(!showForm)}>
                <h3 style={{ margin: 0 }}>{t.addDetails}</h3>
                <span>{showForm ? '−' : '+'}</span>
              </div>
              
              {showForm && (
                <div style={{ marginTop: '16px' }}>
                  <p style={{ fontSize: '14px', marginBottom: '16px' }}><strong>Note:</strong> {t.noteDetails}</p>
                  
                  <div className="grid grid-cols-2">
                    <div>
                      <label>{t.age}</label>
                      <input type="number" onChange={(e) => setSymptoms({...symptoms, age: e.target.value})} style={{ backgroundColor: 'var(--Surface)', color: 'var(--text-main)' }} />
                    </div>
                    <div>
                      <label>{t.sex}</label>
                      <select onChange={(e) => setSymptoms({...symptoms, sex: e.target.value})} style={{ backgroundColor: 'var(--Surface)', color: 'var(--text-main)' }}>
                        <option value=""></option>
                        <option value="male">{t.male}</option>
                        <option value="female">{t.female}</option>
                      </select>
                    </div>
                  </div>
                  
                  <div className="checkbox-group">
                    <input type="checkbox" id="grew" onChange={(e) => setSymptoms({...symptoms, grew: e.target.checked})} />
                    <label htmlFor="grew">{t.grewQuestion}</label>
                  </div>
                  <div className="checkbox-group">
                    <input type="checkbox" id="changed" onChange={(e) => setSymptoms({...symptoms, changed: e.target.checked})} />
                    <label htmlFor="changed">{t.changedQuestion}</label>
                  </div>
                  <div className="checkbox-group">
                    <input type="checkbox" id="bleed" onChange={(e) => setSymptoms({...symptoms, bleed: e.target.checked})} />
                    <label htmlFor="bleed">{t.bleedQuestion}</label>
                  </div>
                  <div className="checkbox-group">
                    <input type="checkbox" id="itch" onChange={(e) => setSymptoms({...symptoms, itch: e.target.checked})} />
                    <label htmlFor="itch">{t.itchQuestion}</label>
                  </div>
                  <div className="checkbox-group">
                    <input type="checkbox" id="personal_skin_cancer_history" onChange={(e) => setSymptoms({...symptoms, personal_skin_cancer_history: e.target.checked})} />
                    <label htmlFor="personal_skin_cancer_history">{t.cancerHistoryQuestion}</label>
                  </div>
                </div>
              )}
            </div>
            
            {error && (
              <div style={{ backgroundColor: 'var(--tier-soon-bg)', color: 'var(--tier-soon)', padding: '12px', borderRadius: '6px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <AlertCircle size={20} /> {error}
              </div>
            )}
            
            <button onClick={submit} disabled={loading} style={{ width: '100%', padding: '14px', fontSize: '18px' }}>
              {loading ? t.analyzingBtn : t.analyzeBtn}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
