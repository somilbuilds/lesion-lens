import { useState } from 'react';
import { AlertTriangle, Info, Printer } from 'lucide-react';
import { useAppContext } from '../Context';
import { translations } from '../i18n';

export default function Results({ result, imageFile, symptoms }: { result: any, imageFile: File | null, symptoms: any }) {
  const [opacity, setOpacity] = useState(0.5);
  const [showOutline, setShowOutline] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  
  if (!result) return <div>{translations['en'].noResult}</div>;

  const { lang } = useAppContext();
  const t = translations[lang];

  const { input_check, top3, inconclusive, uncertainty, risk, gradcam, outline, content, guidance } = result;

  const topConditionKey = top3?.[0]?.class || 'nv';
  const [selectedCondition, setSelectedCondition] = useState(topConditionKey);

  const conditionData = content?.[selectedCondition] || {};

  const handlePrint = () => window.print();

  return (
    <div className="results-page">
      {input_check?.level === 'reject' ? (
        <div className="card tier-urgent">
          <h3>{t.analysisRejected}</h3>
          <ul>
            {input_check.reasons.map((r: string, i: number) => <li key={i}>{r}</li>)}
          </ul>
        </div>
      ) : (
        <div className="grid grid-cols-2">
          {/* Left Column: Image Viewer */}
          <div>
            <div className="card">
              <div className="viewer" style={{ backgroundColor: 'var(--bg-subtle)', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                {imageFile ? (
                  <img src={URL.createObjectURL(imageFile)} alt="Original" />
                ) : (
                  <span style={{ color: 'var(--text-muted)' }}>Image Error</span>
                )}
                {gradcam && (
                  <img 
                    src={gradcam.heatmap} 
                    alt="GradCAM Heatmap" 
                    style={{ opacity: opacity, mixBlendMode: 'multiply' }} 
                  />
                )}
                {showOutline && outline && outline.polygon.length > 0 && (
                  <svg viewBox="0 0 1 1" preserveAspectRatio="none">
                    <polygon 
                      points={outline.polygon.map((p: number[]) => `${p[0]},${p[1]}`).join(' ')} 
                      fill="none" 
                      stroke="var(--accent)" 
                      strokeWidth="0.01"
                      strokeDasharray="0.02, 0.01"
                    />
                  </svg>
                )}
              </div>
              
              <div style={{ marginTop: '16px', display: 'flex', gap: '16px', alignItems: 'center' }}>
                <label style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '8px', marginBottom: 0 }}>
                  <span style={{ fontSize: '14px' }}>{t.highlight}</span>
                  <input type="range" min="0" max="1" step="0.1" value={opacity} onChange={(e) => setOpacity(Number(e.target.value))} style={{ flex: 1 }} />
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: 0 }}>
                  <input type="checkbox" checked={showOutline} onChange={(e) => setShowOutline(e.target.checked)} />
                  <span style={{ fontSize: '14px' }}>{t.outline}</span>
                </label>
              </div>
              
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '12px' }}>
                {t.highlightDesc}
              </p>
              {showOutline && (
                <p style={{ fontSize: '12px', color: 'var(--accent)' }}>{outline?.method}</p>
              )}
              {gradcam?.focus_warning && (
                <p style={{ fontSize: '12px', color: 'var(--warning-color)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <AlertTriangle size={14} /> {gradcam.focus_warning}
                </p>
              )}
            </div>
          </div>

          {/* Right Column: Results */}
          <div>
            {input_check?.level === 'warning' && (
              <div className="card" style={{ backgroundColor: 'var(--warning-bg)', borderLeft: '4px solid var(--warning-color)' }}>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', color: 'var(--warning-color)', fontWeight: 600, marginBottom: '8px' }}>
                  <AlertTriangle size={18} /> {t.imageWarning}
                </div>
                <ul style={{ margin: 0, paddingLeft: '24px', fontSize: '14px' }}>
                  {input_check.reasons.map((r: string, i: number) => <li key={i}>{r}</li>)}
                </ul>
              </div>
            )}

            {inconclusive ? (
              <div className="card" style={{ backgroundColor: 'var(--bg-subtle)' }}>
                <h3 style={{ fontSize: '24px', marginBottom: '8px' }}>{t.inconclusiveResult}</h3>
                <p>{t.inconclusiveDesc}</p>
              </div>
            ) : (
              <div className="card">
                <p style={{ fontSize: '12px', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '4px' }}>
                  {t.topMatchLabel}
                </p>
                <h3 style={{ fontSize: '24px', marginBottom: '8px', color: 'var(--text-main)' }}>
                  {t[topConditionKey as keyof typeof t] || content?.[topConditionKey]?.name || topConditionKey}
                </h3>
                <p style={{ fontSize: '14px' }}>
                  {t.uncertaintyLevel}: <strong>{uncertainty?.level.toUpperCase()}</strong>
                </p>
              </div>
            )}

            <div className={`card tier-${risk?.tier === 'urgent_review' ? 'urgent' : risk?.tier === 'see_doctor_soon' ? 'soon' : 'routine'}`}>
              <h4 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Info size={18} /> 
                {risk?.tier === 'urgent_review' ? t.urgentReviewAd : risk?.tier === 'see_doctor_soon' ? t.seeDoctorSoon : t.routineMonitoring}
              </h4>
              <ul style={{ margin: 0, paddingLeft: '24px', fontSize: '14px' }}>
                {risk?.reasons.map((r: string, i: number) => <li key={i}>{r}</li>)}
                {risk?.reasons.length === 0 && <li>The model score and symptoms do not suggest immediate urgency, but this does not rule out cancer.</li>}
              </ul>
            </div>

            <div className="card">
              <h4>Top Matches</h4>
              {top3?.map((t: any) => (
                <div key={t.class} style={{ marginBottom: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px' }}>
                    <span>{t[t.class as keyof typeof t] || content?.[t.class]?.name || t.class}</span>
                    <span>{(t.prob * 100).toFixed(1)}%</span>
                  </div>
                  <div className="progress-bar">
                    <div className="progress-fill" style={{ width: `${t.prob * 100}%` }}></div>
                  </div>
                </div>
              ))}
              
              <h4 style={{ marginTop: '24px' }}>{t.riskGroups}</h4>
              <div style={{ display: 'flex', gap: '16px', fontSize: '12px', textAlign: 'center' }}>
                <div style={{ flex: 1, padding: '8px', backgroundColor: 'var(--tier-urgent-bg)', borderRadius: '6px', color: 'var(--text-main)' }}>
                  <strong>{t.malignant}</strong><br />
                  {(risk?.group_probs?.malignant * 100).toFixed(1)}%
                </div>
                <div style={{ flex: 1, padding: '8px', backgroundColor: 'var(--tier-soon-bg)', borderRadius: '6px', color: 'var(--text-main)' }}>
                  <strong>{t.precancerous}</strong><br />
                  {(risk?.group_probs?.precancerous * 100).toFixed(1)}%
                </div>
                <div style={{ flex: 1, padding: '8px', backgroundColor: 'var(--tier-routine-bg)', borderRadius: '6px', color: 'var(--text-main)' }}>
                  <strong>{t.benign}</strong><br />
                  {(risk?.group_probs?.benign * 100).toFixed(1)}%
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {input_check?.level !== 'reject' && (
        <>
          <div className="card" style={{ marginTop: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0 }}>{t.learnAbout} </h3>
              <select value={selectedCondition} onChange={(e) => setSelectedCondition(e.target.value)} style={{ width: 'auto', margin: 0 }}>
                {Object.keys(content || {}).filter(k => k !== '__meta__').map(k => (
                  <option key={k} value={k}>{t[k as keyof typeof t] || content[k].name}</option>
                ))}
              </select>
            </div>
            
            <div className="tabs" style={{ marginTop: '16px' }}>
              <div className={`tab ${activeTab === 'overview' ? 'active' : ''}`} onClick={() => setActiveTab('overview')}>{t.overview}</div>
              <div className={`tab ${activeTab === 'causes' ? 'active' : ''}`} onClick={() => setActiveTab('causes')}>{t.causesRisks}</div>
              <div className={`tab ${activeTab === 'symptoms' ? 'active' : ''}`} onClick={() => setActiveTab('symptoms')}>{t.symptomsSigns}</div>
              <div className={`tab ${activeTab === 'doctor' ? 'active' : ''}`} onClick={() => setActiveTab('doctor')}>{t.doctorVisit}</div>
              <div className={`tab ${activeTab === 'action' ? 'active' : ''}`} onClick={() => setActiveTab('action')}>{t.whatYouCanDo}</div>
            </div>
            
            <div style={{ fontSize: '15px' }}>
              {activeTab === 'overview' && (
                <>
                  <p><strong>{t.overview}:</strong> {conditionData.overview}</p>
                  <p><strong>{t.whatItIs}</strong> {conditionData.what_it_is}</p>
                </>
              )}
              {activeTab === 'causes' && <p>{conditionData.causes_risks}</p>}
              {activeTab === 'symptoms' && <p>{conditionData.symptoms_signs}</p>}
              {activeTab === 'doctor' && (
                <>
                  <p><strong>{t.assessment}</strong> {conditionData.doctor_assessment}</p>
                  <p><strong>{t.whatToExpect}</strong> {conditionData.what_to_expect}</p>
                  <p><strong>{t.treatment}</strong> {conditionData.treatment}</p>
                </>
              )}
              {activeTab === 'action' && (
                <>
                  <p>{conditionData.what_can_you_do}</p>
                  <p style={{ color: 'var(--tier-urgent)' }}><strong>{t.urgentCare}</strong> {conditionData.urgent_care}</p>
                </>
              )}
              
              <div style={{ marginTop: '16px', fontSize: '12px' }}>
                <strong>{t.sources}</strong>
                <ul style={{ paddingLeft: '16px' }}>
                  {conditionData.links?.map((l: string, i: number) => (
                    <li key={i}><a href={l} target="_blank" rel="noreferrer">{l}</a></li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          <div className="card" style={{ backgroundColor: 'var(--bg-lighter)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0 }}>{t.prepAppointment}</h3>
              <button className="secondary" onClick={handlePrint} style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
                <Printer size={16} /> {t.printSave}
              </button>
            </div>
            
            <div style={{ display: 'grid', gap: '16px', gridTemplateColumns: '1fr 1fr' }}>
              <div>
                <p style={{ fontWeight: 600, marginBottom: '8px' }}>{t.checklistBring}</p>
                <ul style={{ paddingLeft: '20px', fontSize: '14px', lineHeight: 1.6 }}>
                  <li>{t.checklist1}</li>
                  <li>{t.checklist2}</li>
                  <li>{t.checklist3}</li>
                  <li>{t.checklist4}</li>
                  <li>{t.checklist5}</li>
                  <li>{t.checklist6}</li>
                  <li>{t.checklist7}</li>
                </ul>
              </div>
              
              <div style={{ backgroundColor: 'var(--Surface)', padding: '16px', borderRadius: '4px', border: '1px solid var(--border)' }}>
                <p style={{ fontWeight: 600, fontSize: '14px', marginBottom: '4px' }}>{t.yourNotes}</p>
                {guidance?.map((g: string, i: number) => <p key={i} style={{ fontSize: '13px', margin: '4px 0' }}>• {g}</p>)}
                <p style={{ fontSize: '13px', margin: '4px 0' }}>
                  • {t.age}: {symptoms?.age || t.notProvided}, {t.sex}: {symptoms?.sex ? t[symptoms.sex as keyof typeof t] || symptoms.sex : t.notProvided}
                </p>
              </div>
            </div>
          </div>
          
          <div style={{ textAlign: 'center', padding: '24px', backgroundColor: 'var(--error-bg)', borderRadius: '8px', color: 'var(--error-color)' }}>
            <h4 style={{ marginBottom: '8px' }}>{t.importantMedicalNotice}</h4>
            <p style={{ fontSize: '14px', margin: 0, whiteSpace: 'pre-wrap' }}>
              {t.importantMedicalNoticeDesc}
            </p>
          </div>
        </>
      )}
    </div>
  );
}
