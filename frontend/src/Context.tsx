import React, { createContext, useContext, useState, useEffect } from 'react';

type Lang = 'en' | 'hi';
type Theme = 'light' | 'dark';

interface AppContextType {
  lang: Lang;
  setLang: (l: Lang) => void;
  theme: Theme;
  setTheme: (t: Theme) => void;
  accessibility: boolean;
  setAccessibility: (enabled: boolean) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider = ({ children }: { children: React.ReactNode }) => {
  const [lang, setLang] = useState<Lang>('en');
  const [theme, setTheme] = useState<Theme>('light');
  const [accessibility, setAccessibility] = useState(false);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.setAttribute('data-accessibility', accessibility ? 'on' : 'off');
  }, [accessibility]);

  // simple persistance
  useEffect(() => {
    const savedL = localStorage.getItem('lang') as Lang;
    const savedT = localStorage.getItem('theme') as Theme;
    const savedA = localStorage.getItem('accessibility');
    if (savedL) setLang(savedL);
    if (savedT) setTheme(savedT);
    if (savedA) setAccessibility(savedA === 'on');
  }, []);

  const changeLang = (l: Lang) => {
    setLang(l);
    localStorage.setItem('lang', l);
  }

  const changeTheme = (t: Theme) => {
    setTheme(t);
    localStorage.setItem('theme', t);
  }

  const changeAccessibility = (enabled: boolean) => {
    setAccessibility(enabled);
    localStorage.setItem('accessibility', enabled ? 'on' : 'off');
  }

  return (
    <AppContext.Provider value={{ lang, setLang: changeLang, theme, setTheme: changeTheme, accessibility, setAccessibility: changeAccessibility }}>
      {children}
    </AppContext.Provider>
  );
};

export const useAppContext = () => {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useAppContext must be used within AppProvider");
  return ctx;
};
