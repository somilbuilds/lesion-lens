import { useState } from 'react';
import { AlertTriangle, Info, Printer } from 'lucide-react';
import { useAppContext } from '../Context';
import { translations } from '../i18n';

export default function Results({ result, imageFile, symptoms }: { result: any, imageFile: File | null, symptoms: any }) {
  const [opacity, setOpacity] = useState(0.5);
  const [showOutline, setShowOutline] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  const [mainTab, setMainTab] = useState<'analysis' | 'learn' | 'appointment'>('analysis');
  
  if (!result) return <div>{translations['en'].noResult}</div>;

  const { lang } = useAppContext();
  const t = translations[lang];

  const { input_check, top3, inconclusive, uncertainty, risk, gradcam, outline, content, guidance } = result;

  const topConditionKey = top3?.[0]?.class || 'nv';
  const [selectedCondition, setSelectedCondition] = useState(topConditionKey);

  const conditionData = content?.[selectedCondition] || {};

  const handlePrint = () => window.print();

  return (
    <div className="results-page" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {input_check?.level === 'reject' ? (
        <div className="card tier-urgent">
          <h3>{t.analysisRejected}</h3>
          <ul>
            {input_check.reasons.map((r: string, i: number) => <li key={i}>{r}</li>)}
          </ul>
        </div>
      ) : (
        <>
          <div className="tabs" style={{ marginBottom: '16px', flexShrink: 0 }}>
            <div className={`tab ${mainTab === 'analysis' ? 'active' : ''}`} onClick={() => setMainTab('analysis')}>
              Analysis
            </div>
            <div className={`tab ${mainTab === 'learn' ? 'active' : ''}`} onClick={() => setMainTab('learn')}>
              {t.learnAbout}
            </div>
            <div className={`tab ${mainTab === 'appointment' ? 'active' : ''}`} onClick={() => setMainTab('appointment')}>
              Appointment & Notes
            </div>
          </div>

          <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            {mainTab === 'analysis' && (
              <div className="grid grid-cols-2" style={{ height: '100%' }}>
                {/* Left Column: Image Viewer */}
                <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                  <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, padding: '12px', margin: 0 }}>
                    <div className="viewer" style={{ flex: 1, minHeight: 0, backgroundColor: 'var(--bg-subtle)', display: 'flex', justifyContent: 'center', alignItems: 'center', position: 'relative', borderRadius: '8px', overflow: 'hidden' }}>
                      {imageFile ? (
                        <img src={URL.createObjectURL(imageFile)} alt="Original" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'contain' }} />
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>Image Error</span>
                      )}
                      {gradcam && (
                        <img 
                          src={gradcam.heatmap} 
                          alt="GradCAM Heatmap" 
                          style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'contain', opacity: opacity, mixBlendMode: 'multiply' }} 
                        />
                      )}
                      {showOutline && outline && outline.polygon.length > 0 && (
                        <svg viewBox="0 0 1 1" preserveAspectRatio="none" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
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
                    
                    <div style={{ marginTop: '8px', display: 'flex', gap: '16px', alignItems: 'center', flexShrink: 0 }}>
                      <label style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '4px', marginBottom: 0 }}>
                        <span style={{ fontSize: '13px' }}>{t.highlight}</span>
                        <input type="range" min="0" max="1" step="0.1" value={opacity} onChange={(e) => setOpacity(Number(e.target.value))} style={{ flex: 1, margin: 0 }} />
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: 0 }}>
                        <input type="checkbox" checked={showOutline} onChange={(e) => setShowOutline(e.target.checked)} style={{ margin: 0 }} />
                        <span style={{ fontSize: '13px' }}>{t.outline}</span>
                      </label>
                    </div>
                    
                    <div style={{ flexShrink: 0, marginTop: '8px' }}>
                      <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: 0 }}>
                        {t.highlightDesc}
                      </p>
                      {showOutline && (
                        <p style={{ fontSize: '11px', color: 'var(--accent)', marginBottom: 0 }}>{outline?.method}</p>
                      )}
                      {gradcam?.focus_warning && (
                        <p style={{ fontSize: '11px', color: 'var(--warning-color)', display: 'flex', alignItems: 'center', gap: '4px', marginBottom: 0 }}>
                          <AlertTriangle size={14} /> {gradcam.focus_warning}
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Right Column: Results Data */}
                <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '16px' }}>
                  {input_check?.level === 'warning' && (
                    <div className="card" style={{ marginBottom: 0, padding: '12px', flexShrink: 0, backgroundColor: 'var(--warning-bg)', borderLeft: '4px solid var(--warning-color)' }}>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', color: 'var(--warning-color)', fontWeight: 600, marginBottom: '4px' }}>
                        <AlertTriangle size={16} /> {t.imageWarning}
                      </div>
                      <ul style={{ margin: 0, paddingLeft: '24px', fontSize: '13px' }}>
                        {input_check.reasons.map((r: string, i: number) => <li key={i}>{r}</li>)}
                      </ul>
                    </div>
                  )}

                  {inconclusive ? (
                    <div className="card" style={{ backgroundColor: 'var(--bg-subtle)', marginBottom: 0, padding: '16px', flexShrink: 0 }}>
                      <h3 style={{ fontSize: '18px', marginBottom: '8px' }}>{t.inconclusiveResult}</h3>
                      <p style={{ marginBottom: 0, fontSize: '14px' }}>{t.inconclusiveDesc}</p>
                    </div>
                  ) : (
                    <div className="card" style={{ marginBottom: 0, padding: '12px', flexShrink: 0 }}>
                      <p style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '2px' }}>
                        {t.topMatchLabel}
                      </p>
                      <h3 style={{ fontSize: '18px', marginBottom: '4px', color: 'var(--text-main)' }}>
                        {t[topConditionKey as keyof typeof t] || content?.[topConditionKey]?.name || topConditionKey}
                      </h3>
                      <p style={{ fontSize: '13px', marginBottom: 0 }}>
                        {t.uncertaintyLevel}: <strong>{uncertainty?.level.toUpperCase()}</strong>
                      </p>
                    </div>
                  )}

                  <div className={`card tier-${risk?.tier === 'urgent_review' ? 'urgent' : risk?.tier === 'see_doctor_soon' ? 'soon' : 'routine'}`} style={{ marginBottom: 0, padding: '12px', flexShrink: 0 }}>
                    <h4 style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', fontSize: '14px' }}>
                      <Info size={16} /> 
                      {risk?.tier === 'urgent_review' ? t.urgentReviewAd : risk?.tier === 'see_doctor_soon' ? t.seeDoctorSoon : t.routineMonitoring}
                    </h4>
                    <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '12px' }}>
                      {risk?.reasons.map((r: string, i: number) => <li key={i}>{r}</li>)}
                      {risk?.reasons.length === 0 && <li>The model score and symptoms do not suggest immediate urgency, but this does not rule out cancer.</li>}
                    </ul>
                  </div>

                  <div className="card" style={{ marginBottom: 0, padding: '12px', flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                    <h4 style={{ marginBottom: '8px', fontSize: '14px' }}>Top Matches</h4>
                    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                      {top3?.map((t: any) => (
                        <div key={t.class} style={{ marginBottom: '8px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                            <span>{t[t.class as keyof typeof t] || content?.[t.class]?.name || t.class}</span>
                            <span>{(t.prob * 100).toFixed(1)}%</span>
                          </div>
                          <div className="progress-bar" style={{ margin: '2px 0 4px 0', height: '6px' }}>
                            <div className="progress-fill" style={{ width: `${t.prob * 100}%` }}></div>
                          </div>
                        </div>
                      ))}
                    </div>
                    
                    <h4 style={{ marginTop: '8px', marginBottom: '8px', fontSize: '14px' }}>{t.riskGroups}</h4>
                    <div style={{ display: 'flex', gap: '8px', fontSize: '11px', textAlign: 'center', flexShrink: 0 }}>
                      <div style={{ flex: 1, padding: '6px', backgroundColor: 'var(--tier-urgent-bg)', borderRadius: '6px', color: 'var(--text-main)', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                        <strong>{t.malignant}</strong>
                        <span>{(risk?.group_probs?.malignant * 100).toFixed(1)}%</span>
                      </div>
                      <div style={{ flex: 1, padding: '6px', backgroundColor: 'var(--tier-soon-bg)', borderRadius: '6px', color: 'var(--text-main)', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                        <strong>{t.precancerous}</strong>
                        <span>{(risk?.group_probs?.precancerous * 100).toFixed(1)}%</span>
                      </div>
                      <div style={{ flex: 1, padding: '6px', backgroundColor: 'var(--tier-routine-bg)', borderRadius: '6px', color: 'var(--text-main)', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                        <strong>{t.benign}</strong>
                        <span>{(risk?.group_probs?.benign * 100).toFixed(1)}%</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {mainTab === 'learn' && (
              <div className="card" style={{ height: '100%', display: 'flex', flexDirection: 'column', margin: 0, padding: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0, marginBottom: '12px' }}>
                  <h3 style={{ margin: 0 }}>{t.learnAbout} </h3>
                  <select value={selectedCondition} onChange={(e) => setSelectedCondition(e.target.value)} style={{ width: 'auto', margin: 0, padding: '4px 8px' }}>
                    {Object.keys(content || {}).filter(k => k !== '__meta__').map(k => (
                      <option key={k} value={k}>{t[k as keyof typeof t] || content[k].name}</option>
                    ))}
                  </select>
                </div>
                
                <div className="tabs" style={{ marginBottom: '16px', flexShrink: 0 }}>
                  <div className={`tab ${activeTab === 'overview' ? 'active' : ''}`} onClick={() => setActiveTab('overview')}>{t.overview}</div>
                  <div className={`tab ${activeTab === 'causes' ? 'active' : ''}`} onClick={() => setActiveTab('causes')}>{t.causesRisks}</div>
                  <div className={`tab ${activeTab === 'symptoms' ? 'active' : ''}`} onClick={() => setActiveTab('symptoms')}>{t.symptomsSigns}</div>
                  <div className={`tab ${activeTab === 'doctor' ? 'active' : ''}`} onClick={() => setActiveTab('doctor')}>{t.doctorVisit}</div>
                  <div className={`tab ${activeTab === 'action' ? 'active' : ''}`} onClick={() => setActiveTab('action')}>{t.whatYouCanDo}</div>
                </div>
                
                <div style={{ fontSize: '14px', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                  <div style={{ flex: 1, overflowY: 'auto' }}>
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
                  </div>
                  
                  <div style={{ marginTop: '12px', fontSize: '11px', flexShrink: 0, borderTop: '1px solid var(--border)', paddingTop: '12px' }}>
                    <strong>{t.sources}</strong>
                    <ul style={{ paddingLeft: '16px', marginBottom: 0 }}>
                      {conditionData.links?.map((l: string, i: number) => (
                        <li key={i}><a href={l} target="_blank" rel="noreferrer">{l}</a></li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            )}

            {mainTab === 'appointment' && (
              <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column', margin: 0, backgroundColor: 'var(--bg-lighter)', padding: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexShrink: 0 }}>
                    <h3 style={{ margin: 0 }}>{t.prepAppointment}</h3>
                    <button className="secondary" onClick={handlePrint} style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: 0, padding: '6px 12px' }}>
                      <Printer size={16} /> {t.printSave}
                    </button>
                  </div>
                  
                  <div style={{ display: 'grid', gap: '16px', gridTemplateColumns: '1fr 1fr', flex: 1 }}>
                    <div>
                      <p style={{ fontWeight: 600, marginBottom: '8px', fontSize: '14px' }}>{t.checklistBring}</p>
                      <ul style={{ paddingLeft: '20px', fontSize: '13px', lineHeight: 1.6, marginBottom: 0 }}>
                        <li>{t.checklist1}</li>
                        <li>{t.checklist2}</li>
                        <li>{t.checklist3}</li>
                        <li>{t.checklist4}</li>
                        <li>{t.checklist5}</li>
                        <li>{t.checklist6}</li>
                        <li>{t.checklist7}</li>
                      </ul>
                    </div>
                    
                    <div style={{ backgroundColor: 'var(--Surface)', padding: '12px', borderRadius: '4px', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column' }}>
                      <p style={{ fontWeight: 600, fontSize: '14px', marginBottom: '4px' }}>{t.yourNotes}</p>
                      <div style={{ flex: 1 }}>
                        {guidance?.map((g: string, i: number) => <p key={i} style={{ fontSize: '13px', margin: '2px 0' }}>• {g}</p>)}
                        <p style={{ fontSize: '13px', margin: '2px 0' }}>
                          • {t.age}: {symptoms?.age || t.notProvided}, {t.sex}: {symptoms?.sex ? t[symptoms.sex as keyof typeof t] || symptoms.sex : t.notProvided}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
                
                <div style={{ textAlign: 'center', padding: '12px', flexShrink: 0, backgroundColor: 'var(--error-bg)', borderRadius: '8px', color: 'var(--error-color)' }}>
                  <h4 style={{ marginBottom: '4px', fontSize: '15px' }}>{t.importantMedicalNotice}</h4>
                  <p style={{ fontSize: '13px', margin: 0, whiteSpace: 'pre-wrap' }}>
                    {t.importantMedicalNoticeDesc}
                  </p>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
