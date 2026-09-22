// lib/i18n.js
// Small helper for bilingual text. For now the app always shows
// English — we wire up the real EN/中文 switch in Stage 7. But from
// now on, new screens should use t('someKey') instead of typing
// English text directly, so turning on Chinese later means filling
// in this dictionary, not editing every screen again.

import React, { createContext, useContext, useState } from 'react';

const strings = {
  en: {
    settings: 'Settings',
    language: 'Language',
  },
  zh: {
    settings: '设置',
    language: '语言',
  },
};

const LanguageContext = createContext({
  language: 'en',
  setLanguage: () => {},
  t: (key) => key,
});

export function LanguageProvider({ children }) {
  const [language, setLanguage] = useState('en');

  const t = (key) => (strings[language] && strings[language][key]) || strings.en[key] || key;

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useTranslation() {
  return useContext(LanguageContext);
}