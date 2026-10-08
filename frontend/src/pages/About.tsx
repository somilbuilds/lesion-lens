import { useEffect, useState } from 'react';
import { fetchModelInfo } from '../api';

export default function About() {
  const [info, setInfo] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    fetchModelInfo().then(data => {
      setInfo(data);
      setLoading(false);
    }).catch(() => {
      setLoading(false);
    });
  }, []);

  return (
    <div className="about-page grid">
      <div className="card">
        <h2>About the Model</h2>
        <p>This tool uses a machine learning model to analyze skin images. It is a research prototype and must not be used as a substitute for professional medical advice, diagnosis, or treatment.</p>
        
        {loading ? <p>Loading model information...</p> : (
          <>
            <h3>Training Data & Bias</h3>
            <p>{info?.datasets}</p>
            
            <h3 style={{ marginTop: '24px' }}>Model Setup & Limitations</h3>
            <ul style={{ paddingLeft: '20px', marginBottom: '24px' }}>
              {info?.limitations?.map((l: string, i: number) => <li key={i} style={{ marginBottom: '8px' }}>{l}</li>)}
            </ul>
            
            <h3>Measured Test Results (1,203 held-out images)</h3>
            <div className="grid grid-cols-2" style={{ marginBottom: '24px' }}>
              <div style={{ backgroundColor: 'var(--bg-subtle)', padding: '16px', borderRadius: '8px' }}>
                <p style={{ margin: 0 }}><strong>Accuracy:</strong> {(info?.metrics?.accuracy * 100).toFixed(1)}%</p>
                <p style={{ margin: 0 }}><strong>Balanced Accuracy:</strong> {(info?.metrics?.balanced_accuracy * 100).toFixed(1)}%</p>
              </div>
              <div style={{ backgroundColor: 'var(--bg-subtle)', padding: '16px', borderRadius: '8px' }}>
                <p style={{ margin: 0 }}><strong>Macro AUC:</strong> {info?.metrics?.macro_auc}</p>
                <p style={{ margin: 0 }}><strong>Macro F1:</strong> {info?.metrics?.macro_f1}</p>
              </div>
            </div>
            
            <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse', marginBottom: '24px' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--border)' }}>
                  <th style={{ padding: '8px', textAlign: 'left' }}>Class</th>
                  <th style={{ padding: '8px', textAlign: 'left' }}>Recall</th>
                </tr>
              </thead>
              <tbody>
                {info?.metrics?.per_class_recall && Object.entries(info.metrics.per_class_recall).map(([cls, rec]: [string, any]) => (
                  <tr key={cls} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '8px', textTransform: 'uppercase' }}>{cls}</td>
                    <td style={{ padding: '8px' }}>{(rec * 100).toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
            
            <h3>Melanoma / Nevus Weakness</h3>
            <div style={{ backgroundColor: 'var(--warning-bg)', padding: '16px', borderRadius: '8px', color: 'var(--warning-color)' }}>
              <p style={{ margin: 0, fontWeight: 500 }}>Precision for Melanoma: {(info?.metrics?.melanoma_precision * 100).toFixed(1)}%</p>
              <p style={{ margin: '8px 0 0 0', fontSize: '14px' }}>{info?.metrics?.melanoma_notes}</p>
            </div>
          </>
        )}
      </div>
      
      <div className="card">
        <h3>Privacy Statement</h3>
        <p><strong>Nothing is stored or logged.</strong> Your images and data are processed in memory and are discarded immediately after analysis. They are never saved to disk, nor are they used for further training.</p>
      </div>
    </div>
  );
}
