import { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom';
import { BookOpen, History as HistoryIcon, Moon, ScanLine, Shield, Sun, Type } from 'lucide-react';
import { AppProvider, useAppContext } from './Context';
import { translations } from './i18n';
import Analyze from './pages/Analyze';
import Results from './pages/Results';
import About from './pages/About';
import History from './pages/History';
import Library from './pages/Library';
import Privacy from './pages/Privacy';

function Nav() {
  const location = useLocation();
  const { lang, setLang, theme, setTheme, accessibility, setAccessibility } = useAppContext();
  const t = translations[lang];

  return (
    <nav className="nav">
      <Link to="/" className="brand"><span className="brand-mark"><ScanLine size={17} /></span><span>{t.appTitle}<b>Net</b></span></Link>
      <div className="nav-links" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <Link to="/" className={location.pathname === '/' ? 'active' : ''}>{t.analyze}</Link>
        <Link to="/history" className={location.pathname === '/history' ? 'active' : ''}><HistoryIcon size={15} />{t.historyTab}</Link>
        <Link to="/library" className={location.pathname === '/library' ? 'active' : ''}><BookOpen size={15} />{t.libraryTab}</Link>
        <Link to="/about" className={location.pathname === '/about' ? 'active' : ''}>{t.about}</Link>
        <Link to="/privacy" className={location.pathname === '/privacy' ? 'active' : ''}><Shield size={15} />{t.privacyTab}</Link>
        <select aria-label="Language" value={lang} onChange={(e) => setLang(e.target.value as 'en' | 'hi')} style={{ width: 'auto', margin: 0, padding: '4px' }}>
          <option value="en">Eng</option>
          <option value="hi">हिन्दी</option>
        </select>
        <button aria-label={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'} title={theme === 'light' ? 'Dark mode' : 'Light mode'} onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')} className="theme-toggle secondary">
          {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
        </button>
        <button aria-label={accessibility ? 'Turn off accessibility display' : 'Turn on larger text and contrast'} title="Accessibility display" aria-pressed={accessibility} onClick={() => setAccessibility(!accessibility)} className="theme-toggle secondary"><Type size={16} /></button>
      </div>
    </nav>
  );
}

function MainApp() {
  const [analysisResult, setAnalysisResult] = useState<any>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [symptoms, setSymptoms] = useState<any>(null);
  const [patient, setPatient] = useState({ name: '', gender: '' });
  const [historyError, setHistoryError] = useState('');
  const [historyId, setHistoryId] = useState('');
  const [firstNoticed, setFirstNoticed] = useState('');

  const handleAnalysisComplete = (result: any, file: File, symps: any, patientDetails: { name: string; gender: string }, saveError = '', id = '', noticed = '') => {
    setAnalysisResult(result);
    setImageFile(file);
    setSymptoms(symps);
    setPatient(patientDetails);
    setHistoryError(saveError);
    setHistoryId(id);
    setFirstNoticed(noticed);
  };

  return (
    <Router>
      <Nav />
      <div className="container">
        <Routes>
          <Route path="/" element={<Analyze onComplete={handleAnalysisComplete} />} />
          <Route path="/results" element={<Results result={analysisResult} imageFile={imageFile} symptoms={symptoms} patient={patient} historyError={historyError} historyId={historyId} firstNoticed={firstNoticed} />} />
          <Route path="/history" element={<History />} />
          <Route path="/library" element={<Library />} />
          <Route path="/about" element={<About />} />
          <Route path="/privacy" element={<Privacy />} />
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
