import { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom';
import { AppProvider, useAppContext } from './Context';
import { translations } from './i18n';
import Analyze from './pages/Analyze';
import Results from './pages/Results';
import About from './pages/About';

function Nav() {
  const location = useLocation();
  const { lang, setLang, theme, setTheme } = useAppContext();
  const t = translations[lang];

  return (
    <nav className="nav">
      <div style={{ fontWeight: 600, fontSize: '20px' }}>{t.appTitle}<span style={{color: 'var(--accent)'}}>Net</span></div>
      <div className="nav-links" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <Link to="/" className={location.pathname === '/' ? 'active' : ''}>{t.analyze}</Link>
        <Link to="/about" className={location.pathname === '/about' ? 'active' : ''}>{t.about}</Link>
        <select value={lang} onChange={(e) => setLang(e.target.value as 'en' | 'hi')} style={{ width: 'auto', margin: 0, padding: '4px' }}>
          <option value="en">Eng</option>
          <option value="hi">हिन्दी</option>
        </select>
        <button onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')} className="secondary" style={{ padding: '6px 12px', margin: 0 }}>
          {theme === 'light' ? '🌙' : '☀️'}
        </button>
      </div>
    </nav>
  );
}

function MainApp() {
  const [analysisResult, setAnalysisResult] = useState<any>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [symptoms, setSymptoms] = useState<any>(null);
  const { lang } = useAppContext();
  const t = translations[lang];

  const handleAnalysisComplete = (result: any, file: File, symps: any) => {
    setAnalysisResult(result);
    setImageFile(file);
    setSymptoms(symps);
  };

  return (
    <Router>
      <div className="notice" style={{ backgroundColor: 'var(--warning-bg)', color: 'var(--warning-color)' }}>
        {t.disclaimer}
      </div>
      <Nav />
      <div className="container">
        <Routes>
          <Route path="/" element={<Analyze onComplete={handleAnalysisComplete} />} />
          <Route path="/results" element={<Results result={analysisResult} imageFile={imageFile} symptoms={symptoms} />} />
          <Route path="/about" element={<About />} />
        </Routes>
      </div>
    </Router>
  );
}

export default function App() {
  return (
    <AppProvider>
      <MainApp />
    </AppProvider>
  );
}
