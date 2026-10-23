import React, { createContext, useContext, useState, ReactNode } from 'react';

export type SupportedLanguage = 'en' | 'hi';

interface Translations {
  // Navigation & General
  portalTitle: string;
  portalSubtitle: string;
  electionPortal: string;
  castBallot: string;
  liveResults: string;
  commissionConsole: string;
  officerAccess: string;
  logout: string;
  exitSession: string;
  academicNoticeBadge: string;
  academicNoticeText: string;

  // Candidate Selection Screen
  step4Of6: string;
  officialBallotPaper: string;
  selectYourCandidate: string;
  candidateSelectSubtext: string;
  privacyGuaranteeTitle: string;
  privacyGuaranteeText: string;
  searchPlaceholder: string;
  clearSearch: string;
  showingCandidates: string;
  ofCandidates: string;
  sortAlphabeticalNotice: string;
  symbolVerifiedBadge: string;
  symbolUnavailable: string;
  selectedBadge: string;
  clickToSelect: string;
  readyForReview: string;
  chosenChoice: string;
  backToConstituency: string;
  reviewBallotSelection: string;
  candidateEducation: string;
  candidateCriminalCases: string;
  candidateAssets: string;
  candidateAge: string;
  yearsOld: string;
  noCases: string;

  // Review Screen
  step5Of6: string;
  preConfirmationReview: string;
  reviewBallotTitle: string;
  reviewBallotSubtext: string;
  selectedChoiceHeader: string;
  constituencyLabel: string;
  stateLabel: string;
  electorNameLabel: string;
  syntheticEpicLabel: string;
  authorizedSignerLabel: string;
  duplicateVoteGuardLabel: string;
  guardDescription: string;
  academicPrivacyNoticeTitle: string;
  academicPrivacyNoticeText: string;
  confirmCheckboxText: string;
  changeCandidateChoice: string;
  proceedToSign: string;
  processingBallot: string;

  // Common & Errors
  symbolAltPrefix: string;
  noneOfTheAbove: string;
  notaDescription: string;
}

const TRANSLATIONS: Record<SupportedLanguage, Translations> = {
  en: {
    portalTitle: 'BlockBallot',
    portalSubtitle: 'E-Voting System · ECI Prototype',
    electionPortal: 'Election Portal',
    castBallot: 'Cast Ballot',
    liveResults: 'Live Results',
    commissionConsole: 'Commission Console',
    officerAccess: 'Officer Access',
    logout: 'Logout',
    exitSession: 'Exit',
    academicNoticeBadge: 'Academic Demonstration Prototype',
    academicNoticeText:
      'BlockBallot is an academic research prototype demonstrating verifiable voting. Official party symbols are referenced solely for educational demonstration pursuant to ECI gazette records. Not an official Election Commission of India service.',

    step4Of6: 'Step 4 of 6',
    officialBallotPaper: 'Official Electronic Ballot',
    selectYourCandidate: 'Select Your Candidate',
    candidateSelectSubtext:
      'Choose one contesting candidate or the None of the Above (NOTA) option for your verified constituency.',
    privacyGuaranteeTitle: 'Browser-Confined Secret Ballot',
    privacyGuaranteeText:
      'Your candidate choice is processed locally in your browser. The identification server and public authority APIs never receive or store your selection.',
    searchPlaceholder: 'Search candidate or party name...',
    clearSearch: 'Clear',
    showingCandidates: 'Showing',
    ofCandidates: 'candidates',
    sortAlphabeticalNotice: 'Listed alphabetically by candidate name as per demonstration standard.',
    symbolVerifiedBadge: 'ECI Verified',
    symbolUnavailable: 'Symbol unavailable',
    selectedBadge: 'Selected',
    clickToSelect: 'Tap to select',
    readyForReview: 'Selection recorded · Ready for review',
    chosenChoice: 'Your chosen ballot option:',
    backToConstituency: 'Back to Constituency',
    reviewBallotSelection: 'Review Ballot Selection',
    candidateEducation: 'Education',
    candidateCriminalCases: 'Criminal Cases',
    candidateAssets: 'Declared Assets',
    candidateAge: 'Age',
    yearsOld: 'yrs',
    noCases: 'None reported',

    step5Of6: 'Step 5 of 6',
    preConfirmationReview: 'Ballot Verification & Review',
    reviewBallotTitle: 'Review Your Ballot Selection',
    reviewBallotSubtext:
      'Please carefully verify your selection before generating the EIP-712 authorization and submitting to the blockchain ledger.',
    selectedChoiceHeader: 'Confirmed Ballot Choice',
    constituencyLabel: 'Constituency',
    stateLabel: 'State / UT',
    electorNameLabel: 'Verified Elector',
    syntheticEpicLabel: 'Synthetic EPIC ID',
    authorizedSignerLabel: 'Voter Wallet Address',
    duplicateVoteGuardLabel: 'Duplicate Vote Guard',
    guardDescription: 'Server-Signed EIP-712 Nullifier Commitment',
    academicPrivacyNoticeTitle: 'Academic Privacy Boundary Notice',
    academicPrivacyNoticeText:
      'Submitting an EVM transaction binds candidateId and your nullifier in public calldata. This provides pseudonymous duplicate-vote protection on-chain, but does not provide formal Zero-Knowledge unlinkability.',
    confirmCheckboxText:
      'I have reviewed my selection above and confirm this is my intended democratic choice. I understand this action cannot be reversed once signed.',
    changeCandidateChoice: 'Change Selection',
    proceedToSign: 'Confirm and Continue',
    processingBallot: 'Securing Ballot...',

    symbolAltPrefix: 'Official Election Commission of India reserved symbol for',
    noneOfTheAbove: 'None of the Above (NOTA)',
    notaDescription: 'Supreme Court PUCL Mandated Option',
  },
  hi: {
    portalTitle: 'ब्लॉकबैलट',
    portalSubtitle: 'ई-मतदान प्रणाली · ईसीआई प्रोटोटाइप',
    electionPortal: 'निर्वाचन पोर्टल',
    castBallot: 'मतदान करें',
    liveResults: 'लाइव परिणाम',
    commissionConsole: 'आयोग कंसोल',
    officerAccess: 'अधिकारी प्रवेश',
    logout: 'लॉगआउट',
    exitSession: 'सत्र छोड़ें',
    academicNoticeBadge: 'शैक्षणिक अनुसंधान प्रोटोटाइप',
    academicNoticeText:
      'ब्लॉकबैलट सत्यापन योग्य मतदान प्रदर्शित करने वाला एक शैक्षणिक प्रोटोटाइप है। आधिकारिक पार्टी प्रतीकों का संदर्भ केवल ईसीआई राजपत्र के अनुसार शैक्षिक प्रदर्शन के लिए दिया गया है। यह भारत निर्वाचन आयोग की आधिकारिक सेवा नहीं है।',

    step4Of6: 'चरण 4 का 6',
    officialBallotPaper: 'आधिकारिक इलेक्ट्रॉनिक मतपत्र',
    selectYourCandidate: 'अपने उम्मीदवार का चयन करें',
    candidateSelectSubtext:
      'अपने सत्यापित निर्वाचन क्षेत्र के लिए एक चुनाव लड़ रहे उम्मीदवार या नोटा (इनमें से कोई नहीं) का चयन करें।',
    privacyGuaranteeTitle: 'ब्राउज़र-गोपनीय गुप्त मतदान',
    privacyGuaranteeText:
      'आपकी उम्मीदवार पसंद आपके ब्राउज़र में स्थानीय रूप से संसाधित होती है। पहचान सत्यापन सर्वर या आयोग के एपीआई आपकी पसंद को कभी प्राप्त या संग्रहीत नहीं करते।',
    searchPlaceholder: 'उम्मीदवार या दल का नाम खोजें...',
    clearSearch: 'हटाएं',
    showingCandidates: 'प्रदर्शित',
    ofCandidates: 'उम्मीदवार',
    sortAlphabeticalNotice: 'मानक प्रदर्शन के अनुसार उम्मीदवारों के नाम वर्णानुक्रम (Alphabetical) में सूचीबद्ध हैं।',
    symbolVerifiedBadge: 'ईसीआई सत्यापित',
    symbolUnavailable: 'प्रतीक अनुपलब्ध',
    selectedBadge: 'चयनित',
    clickToSelect: 'चयन के लिए क्लिक करें',
    readyForReview: 'पसंद दर्ज · समीक्षा के लिए तैयार',
    chosenChoice: 'आपकी चुनी गई मतपत्र पसंद:',
    backToConstituency: 'निर्वाचन क्षेत्र पर वापस',
    reviewBallotSelection: 'मतपत्र समीक्षा करें',
    candidateEducation: 'शिक्षा',
    candidateCriminalCases: 'आपराधिक मामले',
    candidateAssets: 'घोषित संपत्ति',
    candidateAge: 'आयु',
    yearsOld: 'वर्ष',
    noCases: 'शून्य',

    step5Of6: 'चरण 5 का 6',
    preConfirmationReview: 'मतपत्र सत्यापन एवं समीक्षा',
    reviewBallotTitle: 'अपनी मतपत्र पसंद की समीक्षा करें',
    reviewBallotSubtext:
      'कृपया ईआईपी-712 प्राधिकरण उत्पन्न करने और ब्लॉकचेन पर भेजने से पहले अपनी पसंद का ध्यानपूर्वक सत्यापन करें।',
    selectedChoiceHeader: 'पुष्ट मतपत्र पसंद',
    constituencyLabel: 'निर्वाचन क्षेत्र',
    stateLabel: 'राज्य / केंद्र शासित प्रदेश',
    electorNameLabel: 'सत्यापित मतदाता',
    syntheticEpicLabel: 'सिंथेटिक ईपीआईसी पहचान',
    authorizedSignerLabel: 'मतदाता वॉलेट पता',
    duplicateVoteGuardLabel: 'दोहरे मतदान से सुरक्षा',
    guardDescription: 'सर्वर-हस्ताक्षरित ईआईपी-712 नलिफायर कमिटमेंट',
    academicPrivacyNoticeTitle: 'शैक्षणिक गोपनीयता सीमा सूचना',
    academicPrivacyNoticeText:
      'ईवीएम लेनदेन उम्मीदवार आईडी और आपके नलिफायर को सार्वजनिक कॉलडेटा में जोड़ता है। यह ऑन-चेन छद्म नाम दोहरा-मतदान रोकथाम प्रदान करता है, लेकिन औपचारिक शून्य-ज्ञान (Zero-Knowledge) पूर्ण अस्पष्टता की गारंटी नहीं देता।',
    confirmCheckboxText:
      'मैंने ऊपर अपने चयन की समीक्षा कर ली है और पुष्टि करता हूँ कि यह मेरा इच्छित लोकतांत्रिक विकल्प है। हस्ताक्षरित होने के बाद इसे बदला नहीं जा सकता।',
    changeCandidateChoice: 'पसंद बदलें',
    proceedToSign: 'पुष्टि करें और आगे बढ़ें',
    processingBallot: 'मतपत्र सुरक्षित किया जा रहा है...',

    symbolAltPrefix: 'भारत निर्वाचन आयोग द्वारा आरक्षित आधिकारिक प्रतीक:',
    noneOfTheAbove: 'इनमें से कोई भी नहीं (नोटा)',
    notaDescription: 'सर्वोच्च न्यायालय द्वारा अनिवार्य विकल्प',
  },
};

interface LanguageContextType {
  language: SupportedLanguage;
  setLanguage: (lang: SupportedLanguage) => void;
  toggleLanguage: () => void;
  t: Translations;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [language, setLanguage] = useState<SupportedLanguage>('en');

  const toggleLanguage = () => {
    setLanguage((prev) => (prev === 'en' ? 'hi' : 'en'));
  };

  const value: LanguageContextType = {
    language,
    setLanguage,
    toggleLanguage,
    t: TRANSLATIONS[language],
  };

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
};

export const useLanguage = (): LanguageContextType => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
};
