/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export type SupportedLanguage = 'en' | 'hi';

export interface Translations {
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

  // 6 Primary Navigation Sections
  navHome: string;
  navElectionResults: string;
  navVote: string;
  navPoliticalParties: string;
  navConstituencyInfo: string;
  navAdministration: string;
  navStaffLogin: string;

  // Independent Party-Preference Poll
  pollTitle: string;
  pollSubtitle: string;
  pollDisclaimer: string;
  pollStepChoose: string;
  pollStepSelect: string;
  pollStepReview: string;
  pollStepConfirm: string;
  pollStepSaved: string;
  pollNoResponsesYet: string;
  pollTotalVotesCounted: string;
  pollYourSelection: string;
  pollConfirmSubmit: string;
  pollReceiptNotice: string;
  pollOneVoteNotice: string;
  pollAlreadyParticipated: string;

  // Civic Section Headers & Labels
  historicalArchiveTitle: string;
  historicalArchiveSubtitle: string;
  archiveBadge: string;
  practiceVotingTitle: string;
  practiceVotingSubtitle: string;
  practiceDisclaimer: string;
  searchConstOrCand: string;
  electorLabel: string;
  turnoutLabel: string;
  winnerLabel: string;
  marginLabel: string;
  provenanceSources: string;
  candidateAffidavit: string;
  tryPracticeMode: string;
  selectSyntheticPersona: string;
  technicalDetails: string;
  showTechnical: string;
  hideTechnical: string;
  nonEndorsementDisclaimer: string;

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
    portalSubtitle: 'E-Voting Civic Portal · Research Prototype',
    electionPortal: 'Civic Home',
    castBallot: 'Practice Voting',
    liveResults: 'Election Archive',
    commissionConsole: 'Commission Console',
    officerAccess: 'Staff Login',
    logout: 'Logout',
    exitSession: 'Exit',
    academicNoticeBadge: 'Academic Demonstration Prototype',
    academicNoticeText:
      'BlockBallot is an academic research prototype demonstrating verifiable voting. Official party symbols are referenced solely for educational demonstration pursuant to ECI gazette records. Not an official Election Commission of India service.',

    navHome: 'Home',
    navElectionResults: 'Election Results',
    navVote: 'Vote',
    navPoliticalParties: 'Political Parties',
    navConstituencyInfo: 'Constituency Information',
    navAdministration: 'Administration',
    navStaffLogin: 'Staff Login',

    pollTitle: 'National Party Preference Poll',
    pollSubtitle: 'Independent, Non-Binding Civic Opinion Survey (10 Verified Political Parties)',
    pollDisclaimer: 'This is an independent academic research poll. It is non-binding and is not operated, approved, or endorsed by the Election Commission of India. Responses do NOT count toward any official election.',
    pollStepChoose: 'Choose a Poll',
    pollStepSelect: 'Select a Party',
    pollStepReview: 'Review Your Selection',
    pollStepConfirm: 'Confirm Choice',
    pollStepSaved: 'Response Saved',
    pollNoResponsesYet: 'No responses have been received yet. Be the first to share your party preference!',
    pollTotalVotesCounted: 'Verified Responses Counted',
    pollYourSelection: 'Your Selected Party',
    pollConfirmSubmit: 'Confirm & Submit Response',
    pollReceiptNotice: 'Your response receipt has been cryptographically recorded in the independent poll archive.',
    pollOneVoteNotice: 'One verified response per authenticated participant. Responses cannot be modified once confirmed.',
    pollAlreadyParticipated: 'You have already recorded your verified response for this poll.',

    historicalArchiveTitle: '18th Lok Sabha General Election 2024 Archive',
    historicalArchiveSubtitle: 'Official results and statistics from the Election Commission of India and data.gov.in',
    archiveBadge: 'Official Historical Archive (Read-Only)',
    practiceVotingTitle: 'Civic Practice Voting Sandbox',
    practiceVotingSubtitle: 'Experience the secret digital voting journey with synthetic test voter IDs',
    practiceDisclaimer: 'Practice Sandbox · No real votes cast · Test identifiers only',
    searchConstOrCand: 'Search by state, parliamentary constituency, candidate, or party...',
    electorLabel: 'Registered Electors',
    turnoutLabel: 'Voter Turnout',
    winnerLabel: 'Winning Candidate',
    marginLabel: 'Winning Margin',
    provenanceSources: 'Official Sources & Provenance',
    candidateAffidavit: 'ECI Candidate Affidavit',
    tryPracticeMode: 'Try Practice Mode',
    selectSyntheticPersona: 'Choose a Practice Voter Profile',
    technicalDetails: 'Cryptographic Architecture & Verification Details',
    showTechnical: 'Show Cryptographic Details',
    hideTechnical: 'Hide Technical Details',
    nonEndorsementDisclaimer:
      'BlockBallot is an independent academic research platform. It is not affiliated with, operated by, or endorsed by the Election Commission of India (ECI).',

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
      'Please carefully verify your selection before generating the digital confirmation ticket.',
    selectedChoiceHeader: 'Confirmed Ballot Choice',
    constituencyLabel: 'Constituency',
    stateLabel: 'State / UT',
    electorNameLabel: 'Verified Elector',
    syntheticEpicLabel: 'Practice Voter ID',
    authorizedSignerLabel: 'Voter Wallet Address',
    duplicateVoteGuardLabel: 'Duplicate Vote Guard',
    guardDescription: 'Server-Signed EIP-712 Single-Use Nullifier Token',
    academicPrivacyNoticeTitle: 'Ballot Privacy Notice',
    academicPrivacyNoticeText:
      'Your vote is committed with a single-use anonymous ticket. Your identity and your ballot choice remain cryptographically separated.',
    confirmCheckboxText:
      'I have reviewed my selection above and confirm this is my intended democratic choice. I understand this action cannot be reversed once submitted.',
    changeCandidateChoice: 'Change Selection',
    proceedToSign: 'Confirm and Continue',
    processingBallot: 'Securing Ballot...',

    symbolAltPrefix: 'Official Election Commission of India reserved symbol for',
    noneOfTheAbove: 'None of the Above (NOTA)',
    notaDescription: 'Supreme Court PUCL Mandated Option',
  },
  hi: {
    portalTitle: 'ब्लॉकबैलट',
    portalSubtitle: 'ई-मतदान नागरिक पोर्टल · शैक्षणिक प्रोटोटाइप',
    electionPortal: 'नागरिक मुख्य पृष्ठ',
    castBallot: 'अभ्यास मतदान',
    liveResults: 'निर्वाचन अभिलेखागार',
    commissionConsole: 'आयोग कंसोल',
    officerAccess: 'कर्मचारी लॉगिन',
    logout: 'लॉगआउट',
    exitSession: 'सत्र छोड़ें',
    academicNoticeBadge: 'शैक्षणिक अनुसंधान प्रोटोटाइप',
    academicNoticeText:
      'ब्लॉकबैलट सत्यापन योग्य मतदान प्रदर्शित करने वाला एक शैक्षणिक प्रोटोटाइप है। आधिकारिक पार्टी प्रतीकों का संदर्भ केवल ईसीआई राजपत्र के अनुसार शैक्षिक प्रदर्शन के लिए दिया गया है। यह भारत निर्वाचन आयोग की आधिकारिक सेवा नहीं है।',

    navHome: 'मुख्य पृष्ठ',
    navElectionResults: 'चुनाव परिणाम',
    navVote: 'मतदान',
    navPoliticalParties: 'राजनीतिक दल',
    navConstituencyInfo: 'निर्वाचन क्षेत्र विवरण',
    navAdministration: 'प्रशासन',
    navStaffLogin: 'अधिकारी लॉगिन',

    pollTitle: 'राष्ट्रीय राजनीतिक दल प्राथमिकता जनमत',
    pollSubtitle: 'स्वतंत्र, गैर-बाध्यकारी नागरिक जनमत सर्वेक्षण (10 सत्यापित दल)',
    pollDisclaimer: 'यह एक स्वतंत्र शैक्षणिक अनुसंधान सर्वेक्षण है। यह गैर-बाध्यकारी है और भारत निर्वाचन आयोग द्वारा संचालित, अनुमोदित या संबद्ध नहीं है। इस जनमत के मत किसी सार्वजनिक चुनाव में नहीं गिने जाते।',
    pollStepChoose: 'जनमत चुनें',
    pollStepSelect: 'दल चुनें',
    pollStepReview: 'पसंद की समीक्षा करें',
    pollStepConfirm: 'पुष्टि करें',
    pollStepSaved: 'उत्तर सुरक्षित',
    pollNoResponsesYet: 'अभी तक कोई प्रतिक्रिया प्राप्त नहीं हुई है। अपनी दल प्राथमिकता दर्ज कराने वाले पहले प्रतिभागी बनें!',
    pollTotalVotesCounted: 'सत्यापित प्रतिक्रियाएं',
    pollYourSelection: 'आपका चुना हुआ राजनीतिक दल',
    pollConfirmSubmit: 'पुष्टि करें और उत्तर दर्ज करें',
    pollReceiptNotice: 'आपकी प्रतिक्रिया रसीद स्वतंत्र सर्वेक्षण संग्रह में सुरक्षित रूप से दर्ज कर ली गई है।',
    pollOneVoteNotice: 'प्रति सत्यापित प्रतिभागी केवल एक प्रतिक्रिया अनुमत है। पुष्टि के बाद इसे बदला नहीं जा सकता।',
    pollAlreadyParticipated: 'आप इस सर्वेक्षण में अपनी सत्यापित प्रतिक्रिया पहले ही दर्ज करा चुके हैं।',

    historicalArchiveTitle: '18वीं लोकसभा आम चुनाव 2024 ऐतिहासिक अभिलेखागार',
    historicalArchiveSubtitle: 'भारत निर्वाचन आयोग एवं data.gov.in से आधिकारिक परिणाम एवं सांख्यिकी',
    archiveBadge: 'आधिकारिक ऐतिहासिक अभिलेखागार (केवल पठन हेतु)',
    practiceVotingTitle: 'नागरिक अभ्यास मतदान सैंडबॉक्स',
    practiceVotingSubtitle: 'सिंथेटिक डेमो वोटर पहचान के साथ गुप्त डिजिटल मतदान का अनुभव लें',
    practiceDisclaimer: 'अभ्यास सैंडबॉक्स · कोई वास्तविक वोट नहीं डाला जाता · केवल परीक्षण पहचान',
    searchConstOrCand: 'राज्य, संसदीय क्षेत्र, उम्मीदवार या दल के नाम से खोजें...',
    electorLabel: 'पंजीकृत मतदाता',
    turnoutLabel: 'मतदान प्रतिशत',
    winnerLabel: 'विजयी उम्मीदवार',
    marginLabel: 'जीत का अंतर',
    provenanceSources: 'आधिकारिक स्रोत एवं साक्ष्य',
    candidateAffidavit: 'ईसीआई उम्मीदवार शपथ पत्र',
    tryPracticeMode: 'अभ्यास मोड आज़माएं',
    selectSyntheticPersona: 'अभ्यास के लिए परीक्षण मतदाता प्रोफ़ाइल चुनें',
    technicalDetails: 'क्रिप्टोग्राफ़िक संरचना एवं तकनीकी विनिर्देश',
    showTechnical: 'तकनीकी विवरण देखें',
    hideTechnical: 'तकनीकी विवरण छिपाएं',
    nonEndorsementDisclaimer:
      'ब्लॉकबैलट एक स्वतंत्र शैक्षणिक अनुसंधान मंच है। यह भारत निर्वाचन आयोग (ECI) द्वारा संचालित, अनुमोदित या संबद्ध नहीं है।',

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
      'कृपया डिजिटल पुष्टि टिकट उत्पन्न करने से पहले अपनी पसंद का ध्यानपूर्वक सत्यापन करें।',
    selectedChoiceHeader: 'पुष्ट मतपत्र पसंद',
    constituencyLabel: 'निर्वाचन क्षेत्र',
    stateLabel: 'राज्य / केंद्र शासित प्रदेश',
    electorNameLabel: 'सत्यापित मतदाता',
    syntheticEpicLabel: 'अभ्यास वोटर आईडी',
    authorizedSignerLabel: 'मतदाता वॉलेट पता',
    duplicateVoteGuardLabel: 'दोहरे मतदान से सुरक्षा',
    guardDescription: 'सर्वर-हस्ताक्षरित ईआईपी-712 एकल-उपयोग टोकन',
    academicPrivacyNoticeTitle: 'मतपत्र गोपनीयता सूचना',
    academicPrivacyNoticeText:
      'आपका वोट एकल-उपयोग अनाम टोकन के साथ दर्ज होता है। आपकी पहचान और मतपत्र पसंद क्रिप्टोग्राफ़िक रूप से हमेशा अलग रहते हैं।',
    confirmCheckboxText:
      'मैंने ऊपर अपने चयन की समीक्षा कर ली है और पुष्टि करता हूँ कि यह मेरा इच्छित लोकतांत्रिक विकल्प है। प्रस्तुत करने के बाद इसे बदला नहीं जा सकता।',
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
  const [language, setLanguageState] = useState<SupportedLanguage>(() => {
    try {
      const stored = localStorage.getItem('blockballot_lang');
      if (stored === 'hi' || stored === 'en') return stored;
    } catch {
      // Fallback
    }
    return 'en';
  });

  const setLanguage = (lang: SupportedLanguage) => {
    setLanguageState(lang);
    try {
      localStorage.setItem('blockballot_lang', lang);
    } catch {
      // Ignore
    }
  };

  const toggleLanguage = () => {
    setLanguage(language === 'en' ? 'hi' : 'en');
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
