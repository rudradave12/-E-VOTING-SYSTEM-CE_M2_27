/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import {
  Shield,
  KeyRound,
  FileCheck,
  EyeOff,
  CheckCircle2,
  Lock,
  ChevronDown,
  ChevronUp,
  Cpu,
  Terminal,
  Layers,
  ArrowRight,
} from 'lucide-react';

interface HowItWorksScreenProps {
  onStartPractice: () => void;
}

export const HowItWorksScreen: React.FC<HowItWorksScreenProps> = ({ onStartPractice }) => {
  const { t, language } = useLanguage();
  const [showTechnicalSpecs, setShowTechnicalSpecs] = useState<boolean>(false);

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-10">
      {/* Civic Introduction */}
      <div className="text-center max-w-3xl mx-auto space-y-3">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 text-blue-800 text-xs font-bold uppercase tracking-wider">
          <Shield className="w-3.5 h-3.5 text-blue-600" />
          <span>Civic Architecture & Integrity Guide</span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
          {language === 'hi'
            ? 'ब्लॉकबैलट कैसे काम करता है: पूर्ण गोपनीयता एवं सत्यापन'
            : 'How BlockBallot Works: Privacy & Verifiability'}
        </h1>
        <p className="text-base text-slate-600 leading-relaxed">
          {language === 'hi'
            ? 'पारंपरिक इलेक्ट्रॉनिक वोटिंग में विश्वास केंद्रीय सर्वर पर निर्भर करता है। ब्लॉकबैलट क्रिप्टोग्राफ़िक टोकन का उपयोग करके यह सुनिश्चित करता है कि कोई भी यह नहीं जान सके कि आपने किसे वोट दिया, जबकि प्रत्येक नागरिक अपने वोट की गणना को स्वतंत्र रूप से सत्यापित कर सकता है।'
            : 'Traditional electronic voting relies on trust in centralized machines. BlockBallot proves mathematical integrity: no authority can ever discover who you voted for, yet anyone can independently verify that every counted vote is legitimate.'}
        </p>
      </div>

      {/* 4 Core Civic Pillars */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Step 1 */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-2xs space-y-3">
          <div className="w-10 h-10 rounded-xl bg-orange-100 text-orange-700 flex items-center justify-center font-bold text-sm">
            1
          </div>
          <h3 className="text-lg font-bold text-slate-900">
            {language === 'hi' ? '1. नागरिक पहचान सत्यापन' : '1. Voter Identity Verification'}
          </h3>
          <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
            {language === 'hi'
              ? 'मतदाता अपने मतदाता पहचान पत्र (EPIC) और पंजीकृत मोबाइल पर प्राप्त एक-बारगी सुरक्षा कोड (OTP) के माध्यम से अपनी पात्रता साबित करते हैं।'
              : 'The voter authenticates with their Electoral Photo Identity Card (EPIC) and a one-time cryptographic authorization challenge. Only eligible registered electors proceed.'}
          </p>
        </div>

        {/* Step 2 */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-2xs space-y-3">
          <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-sm">
            2
          </div>
          <h3 className="text-lg font-bold text-slate-900">
            {language === 'hi' ? '2. ब्राउज़र-गोपनीय गुप्त मतपत्र' : '2. Browser-Confined Secret Ballot'}
          </h3>
          <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
            {language === 'hi'
              ? 'आपकी उम्मीदवार की पसंद आपके अपने ब्राउज़र में पूरी तरह स्थानीय रूप से चुनी जाती है। कोई भी पहचान सत्यापन सर्वर आपकी पसंद को कभी नहीं देखता।'
              : 'Your candidate selection is formed inside your local browser sandbox. The voter identity verification servers never receive, transmit, or record your ballot choice.'}
          </p>
        </div>

        {/* Step 3 */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-2xs space-y-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-sm">
            3
          </div>
          <h3 className="text-lg font-bold text-slate-900">
            {language === 'hi' ? '3. एकल-उपयोग अनाम टोकन (Anti-Double Voting)' : '3. Anonymous Single-Use Nullifier Token'}
          </h3>
          <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
            {language === 'hi'
              ? 'सर्वर आपके लिए एक विशेष एकल-उपयोग डिजिटल टिकट जारी करता है जो केवल एक वोट डालने की अनुमति देता है। दोबारा वोट डालने का कोई भी प्रयास स्वतः निरस्त हो जाता है।'
              : 'The authority signs an anonymous, single-use ticket bound to the election. This mathematical token strictly enforces 1-citizen-1-vote without revealing identity.'}
          </p>
        </div>

        {/* Step 4 */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-2xs space-y-3">
          <div className="w-10 h-10 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center font-bold text-sm">
            4
          </div>
          <h3 className="text-lg font-bold text-slate-900">
            {language === 'hi' ? '4. डिजिटल सत्यापन पावती' : '4. Tamper-Proof Digital Receipt'}
          </h3>
          <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
            {language === 'hi'
              ? 'वोट दर्ज होने पर मतदाता को एक डिजिटल पावती प्राप्त होती है जिसमें लेनदेन संदर्भ कोड होता है, जिससे वे अपने मत की पुष्टि कर सकते हैं।'
              : 'Upon successful ballot recording, the voter receives a cryptographic verification receipt. This proves inclusion in the public tally without revealing the chosen candidate.'}
          </p>
        </div>
      </div>

      {/* Interactive Try Mode Banner */}
      <div className="rounded-2xl bg-gradient-to-r from-orange-600 to-amber-600 text-white p-6 sm:p-8 flex flex-col sm:flex-row items-center justify-between gap-6 shadow-md">
        <div className="space-y-1 text-center sm:text-left">
          <h3 className="text-xl font-bold">
            {language === 'hi' ? 'स्वयं अभ्यास करके देखें' : 'Try the Complete Flow in Sandbox'}
          </h3>
          <p className="text-sm text-orange-100">
            {language === 'hi'
              ? 'सिंथेटिक डेमो पहचान के साथ अभ्यास करें। कोई वास्तविक वोट नहीं डाला जाएगा।'
              : 'Experience the 6-step voter journey with synthetic test IDs in our safe practice environment.'}
          </p>
        </div>
        <button
          onClick={onStartPractice}
          className="px-6 py-3 rounded-xl bg-white text-orange-700 font-extrabold text-sm shadow-sm hover:bg-orange-50 transition-colors shrink-0 cursor-pointer flex items-center gap-2"
        >
          <span>{t.tryPracticeMode}</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>

      {/* Advanced Cryptographic Specifications Accordion */}
      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-xs">
        <button
          onClick={() => setShowTechnicalSpecs((prev) => !prev)}
          className="w-full flex items-center justify-between p-6 text-left hover:bg-slate-50 transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-slate-900 text-white flex items-center justify-center">
              <Cpu className="w-5 h-5" />
            </div>
            <div>
              <h4 className="font-bold text-sm sm:text-base text-slate-900">
                {t.technicalDetails}
              </h4>
              <p className="text-xs text-slate-500">
                {language === 'hi'
                  ? 'डेवलपर्स एवं शोधकर्ताओं के लिए: EIP-712, सॉलिडिटी कॉन्ट्रैक्ट, एवं नलिफायर गणित'
                  : 'For researchers: EIP-712 domain hashing, Solidity guards, and deterministic nullifiers'}
              </p>
            </div>
          </div>
          <div className="text-xs font-semibold text-slate-600 flex items-center gap-1">
            <span>{showTechnicalSpecs ? t.hideTechnical : t.showTechnical}</span>
            {showTechnicalSpecs ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </div>
        </button>

        {showTechnicalSpecs && (
          <div className="p-6 border-t border-slate-200 bg-slate-50 space-y-6 text-xs sm:text-sm text-slate-700">
            {/* EIP-712 Specification */}
            <div className="space-y-2">
              <h5 className="font-bold text-slate-900 flex items-center gap-1.5">
                <Terminal className="w-4 h-4 text-slate-700" />
                <span>1. EIP-712 Typed Structured Data Signing</span>
              </h5>
              <p className="text-slate-600 text-xs">
                To prevent replay attacks across different chains or elections, the server signs a structured EIP-712 authorization ticket bound to domain parameters:
              </p>
              <pre className="p-3 bg-slate-900 text-emerald-400 rounded-xl overflow-x-auto text-[11px] font-mono leading-relaxed">
{`Domain: {
  name: "BlockBallot",
  version: "1",
  chainId: 31337,
  verifyingContract: "0x51A1ceB83B83F1985a81C295d1fF28Afef186E02"
}
Types: {
  VotingAuthorization: [
    { name: "electionId", type: "uint256" },
    { name: "constituencyId", type: "uint256" },
    { name: "voterWallet", type: "address" },
    { name: "nullifier", type: "bytes32" },
    { name: "expiry", type: "uint256" }
  ]
}`}
              </pre>
            </div>

            {/* Smart contract guards */}
            <div className="space-y-2">
              <h5 className="font-bold text-slate-900 flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-slate-700" />
                <span>2. Solidity On-Chain Security Guards (IndianElection.sol)</span>
              </h5>
              <ul className="list-disc pl-5 space-y-1 text-xs text-slate-600">
                <li>
                  <strong>Signature Verification:</strong> Recovered address must match the on-chain <code>authorizationSigner</code>.
                </li>
                <li>
                  <strong>Nullifier Check:</strong> <code>require(!spentNullifiers[nullifier], &quot;Nullifier already spent&quot;)</code> prevents any double voting.
                </li>
                <li>
                  <strong>Wallet Binding:</strong> <code>require(msg.sender == voterWallet, &quot;Sender is not authorized voter&quot;)</code> prevents front-running.
                </li>
                <li>
                  <strong>Timeframe & Status:</strong> Requires <code>election.status == Status.Active</code> and current block timestamp within election window.
                </li>
                <li>
                  <strong>Candidate Membership:</strong> Confirms candidate ID belongs to the declared constituency.
                </li>
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
