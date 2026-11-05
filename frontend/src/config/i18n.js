import React, { createContext, useContext, useState, useEffect } from "react";

export const translations = {
  en: {
    title: "GoldenHour",
    tagline: "Trusted Emergency Medical History",
    emergencyAccess: "🚨 Emergency Access",
    breakGlassTitle: "Emergency Break-Glass Protocol",
    breakGlassWarning: "Statutory Notice: This access initiates a time-bounded 15-minute emergency access window. Every read is recorded in the patient audit history. Unauthorized or fraudulent access is subject to institutional review and statutory investigation under applicable law.",
    reasonCode: "Clinical Reason Code",
    facility: "Medical Facility / Hospital Name",
    justification: "Clinical Justification",
    triggerAccess: "Unlock Critical Data (15 Min)",
    bloodGroup: "Blood Group",
    allergies: "Life-Threatening Allergies",
    conditions: "Chronic Conditions",
    emergencyContact: "Emergency Contact",
    consentActive: "Active Consent",
    grantConsent: "Grant Provider Consent",
    revokeConsent: "Revoke Consent",
    viewIPS: "Download FHIR IPS Bundle",

    // Navigation & Common
    skipToContent: "Skip to content",
    adminPortal: "🔑 Admin Portal",
    providerPortal: "🩺 Provider Portal",
    patientPortal: "👤 Patient Portal",
    completeOnboarding: "📝 Complete Onboarding",
    accountOnboarding: "📝 Account Onboarding",
    signOut: "Sign out",
    signIn: "Sign in",
    loadingWorkspace: "Loading your workspace…",
    savedQRCard: "Saved QR card",
    supportAndStatus: "Support and status",
    patientPrivacy: "Patient privacy · Encrypted records · Logged access",
    language: "Language",

    // Home / Hero
    everySecondMatters: "Every second matters",
    heroTitle: "Medical context when minutes matter.",
    heroLead: "Encrypted records, phone sign-in, patient-controlled access, and logged access history.",
    signInRegister: "Sign In / Register",
    goToAdmin: "Go to Admin Portal",
    goToProvider: "Go to Provider Portal",
    goToPatient: "Go to Patient Portal",

    // Common Actions
    save: "Save",
    cancel: "Cancel",
    submit: "Submit",
    download: "Download",
    search: "Search",
    delete: "Delete",
    confirm: "Confirm",
    retry: "Retry",
    back: "Back",
    close: "Close",
    status: "Status",
    date: "Date",
    actions: "Actions",

    // Patient Dashboard
    loadingPatient: "Loading patient profile and records...",
    patientSummary: "Emergency Medical Summary",
    criticalVitals: "Critical Health Information",
    myRecords: "My Clinical Records",
    noRecordsFound: "No clinical records recorded yet.",
    consentsTitle: "Healthcare Provider Access Consents",
    noConsentsFound: "No active healthcare provider consents.",
    auditTrailTitle: "Medical Record Access History",
    requestErasure: "Request Clinical Data Erasure",
    exportArchive: "Download Full Patient Archive",

    // Clinician Portal
    clinicianPortal: "Clinician Portal",
    careTeamWorkspace: "Care Team Workspace",
    verifiedClinician: "Verified Healthcare Professional",
    searchPatientTitle: "Lookup Patient Records",
    enterPatientId: "Enter Patient UUID or Scan Emergency Card",
    addRecordTitle: "Add New Clinical Record",
    recordType: "Record Type",
    clinicalNotes: "Clinical Findings & Notes",
    attachRecord: "Attach Encrypted Record",
    emergencyReviewsTitle: "Post-Hoc Emergency Access Reviews",

    // Governance & Admin
    adminDashboard: "Governance & Compliance Dashboard",
    providerManagement: "Provider Management",
    staffInvites: "Invite Clinical Staff",
    auditExportTitle: "Audit Log Export & Verification",
    downloadCsv: "Download Audit CSV",
    downloadPdf: "Download Audit PDF",
    systemIntegrity: "Cryptographic Audit Chain Integrity",

    // Support & Scanner
    scanHospitalCard: "Scan hospital QR card",
    stopCamera: "Stop camera",
    startCamera: "Start camera",
    pasteCardLink: "Or paste this hospital's card link",
    openCard: "Open card",
    cameraPrivacyNotice: "No camera images leave this device.",
    supportTitle: "Emergency System Support & Status",
    usualCareFallbackNotice: "In the event of an outage or unavailable data, proceed immediately with the hospital's standard trauma and emergency triage protocols.",
  },

  ta: {
    title: "கோல்டன்அவர் (GoldenHour)",
    tagline: "நம்பகமான அவசர மருத்துவ வரலாறு",
    emergencyAccess: "🚨 அவசர கால அணுகல்",
    breakGlassTitle: "அவசரகால தரவு அணுகல் விதிமுறை",
    breakGlassWarning: "சட்டப்பூர்வ அறிவிப்பு: இந்த அவசர கால அணுகல் 15 நிமிடங்களுக்கு மட்டுமே செல்லுபடியாகும். அனைத்து அணுகல்களும் நோயாளியின் தணிக்கை வரலாற்றில் பதிவு செய்யப்படுகின்றன. அங்கீகரிக்கப்படாத அணுகல் சட்டப்படி விசாரணைக்கு உட்பட்டது.",
    reasonCode: "மருத்துவ காரணக் குறியீடு",
    facility: "மருத்துவமனை / சிகிச்சை மையம்",
    justification: "மருத்துவ அவசரக் காரணம்",
    triggerAccess: "முக்கிய தகவல்களை திறக்க (15 நிமிடங்கள்)",
    bloodGroup: "இரத்த வகை",
    allergies: "உயிருக்கு ஆபத்தான ஒவ்வாமைகள்",
    conditions: "நீண்டகால நோய்கள்",
    emergencyContact: "அவசர தொடர்பு எண்",
    consentActive: "செயலில் உள்ள அனுமதி",
    grantConsent: "மருத்துவருக்கு அனுமதி வழங்குக",
    revokeConsent: "அனுமதியை ரத்து செய்க",
    viewIPS: "FHIR மருத்துவ சுருக்கத்தை பதிவிறக்கு",

    // Navigation & Common
    skipToContent: "உள்ளடக்கத்திற்கு செல்க",
    adminPortal: "🔑 நிர்வாகி தளம்",
    providerPortal: "🩺 மருத்துவர் தளம்",
    patientPortal: "👤 நோயாளி தளம்",
    completeOnboarding: "📝 பதிவை முடிக்கவும்",
    accountOnboarding: "📝 கணக்கு பதிவு",
    signOut: "வெளியேறு",
    signIn: "உள்நுழை",
    loadingWorkspace: "பணியிடம் ஏற்றப்படுகிறது…",
    savedQRCard: "சேமிக்கப்பட்ட QR அட்டை",
    supportAndStatus: "உதவி மற்றும் நிலை",
    patientPrivacy: "நோயாளி தனியுரிமை · மறைகுறியாக்கப்பட்ட பதிவுகள் · தணிக்கை பதிவு",
    language: "மொழி (Language)",

    // Home / Hero
    everySecondMatters: "ஒவ்வொரு நொடியும் முக்கியமானது",
    heroTitle: "நிமிடங்கள் முக்கியமாகும் போது மருத்துவ தகவல்.",
    heroLead: "மறைகுறியாக்கப்பட்ட பதிவுகள், தொலைபேசி உள்நுழைவு, நோயாளி அனுமதி கட்டுப்பாடு மற்றும் முழு அணுகல் வரலாறு.",
    signInRegister: "உள்நுழைவு / பதிவு",
    goToAdmin: "நிர்வாகி தளத்திற்கு செல்க",
    goToProvider: "மருத்துவர் தளத்திற்கு செல்க",
    goToPatient: "நோயாளி தளத்திற்கு செல்க",

    // Common Actions
    save: "சேமி",
    cancel: "ரத்து செய்",
    submit: "சமர்ப்பி",
    download: "பதிவிறக்கு",
    search: "தேடு",
    delete: "நீக்கு",
    confirm: "உறுதி செய்",
    retry: "மீண்டும் முயற்சி செய்",
    back: "பின்செல்",
    close: "மூடு",
    status: "நிலை",
    date: "தேதி",
    actions: "நடவடிக்கைகள்",

    // Patient Dashboard
    loadingPatient: "நோயாளி விவரங்கள் மற்றும் பதிவுகள் ஏற்றப்படுகின்றன...",
    patientSummary: "அவசர மருத்துவ சுருக்கம்",
    criticalVitals: "முக்கிய மருத்துவ தகவல்கள்",
    myRecords: "எனது மருத்துவ பதிவுகள்",
    noRecordsFound: "மருத்துவ பதிவுகள் எதுவும் இதுவரை இல்லை.",
    consentsTitle: "மருத்துவர் அணுகல் அனுமதிகள்",
    noConsentsFound: "செயலில் உள்ள மருத்துவ அனுமதிகள் இல்லை.",
    auditTrailTitle: "மருத்துவ பதிவு அணுகல் வரலாறு",
    requestErasure: "மருத்துவ தரவு நீக்க கோரிக்கை",
    exportArchive: "முழு நோயாளி கோப்பை பதிவிறக்கு",

    // Clinician Portal
    clinicianPortal: "மருத்துவர் தளம்",
    careTeamWorkspace: "சிகிச்சைக் குழு பணியிடம்",
    verifiedClinician: "சரிபார்க்கப்பட்ட மருத்துவர்",
    searchPatientTitle: "நோயாளி பதிவுகளைத் தேடுங்கள்",
    enterPatientId: "நோயாளி அடையாள எண் அல்லது அவசர அட்டையை ஸ்கேன் செய்க",
    addRecordTitle: "புதிய மருத்துவப் பதிவைச் சேர்க்கவும்",
    recordType: "பதிவு வகை",
    clinicalNotes: "மருத்துவக் குறிப்புகள்",
    attachRecord: "மறைகுறியாக்கப்பட்ட பதிவை இணைக்கவும்",
    emergencyReviewsTitle: "அவசரகால அணுகல் மதிப்பாய்வுகள்",

    // Governance & Admin
    adminDashboard: "நிர்வாக மற்றும் இணக்கத் தளம்",
    providerManagement: "மருத்துவர் மேலாண்மை",
    staffInvites: "மருத்துவப் பணியாளர்களை அழைக்கவும்",
    auditExportTitle: "தணிக்கை பதிவு ஏற்றுமதி மற்றும் சரிபார்ப்பு",
    downloadCsv: "தணிக்கை CSV பதிவிறக்கு",
    downloadPdf: "தணிக்கை PDF பதிவிறக்கு",
    systemIntegrity: "கிரிப்டோகிராஃபிக் தணிக்கை ஒருமைப்பாடு",

    // Support & Scanner
    scanHospitalCard: "மருத்துவமனை QR அட்டையை ஸ்கேன் செய்க",
    stopCamera: "கேமராவை நிறுத்து",
    startCamera: "கேமராவைத் தொடங்கு",
    pasteCardLink: "அல்லது அட்டை இணைப்பை இங்கே ஒட்டவும்",
    openCard: "அட்டையைத் திறக்கவும்",
    cameraPrivacyNotice: "எந்த கேமரா படங்களும் இந்த சாதனத்தை விட்டு வெளியேறாது.",
    supportTitle: "அவசர அமைப்பு உதவி மற்றும் நிலை",
    usualCareFallbackNotice: "அமைப்பு செயலிழந்தால், உடனடியாக மருத்துவமனையின் நிலையான அவசர சிகிச்சை நடைமுறைகளைப் பின்பற்றவும்.",
  },

  hi: {
    title: "गोल्डनऑवर (GoldenHour)",
    tagline: "विश्वसनीय आपातकालीन चिकित्सा इतिहास",
    emergencyAccess: "🚨 आपातकालीन एक्सेस",
    breakGlassTitle: "आपातकालीन ब्रेक-ग्लास प्रोटोकॉल",
    breakGlassWarning: "वैधानिक सूचना: यह केवल 15 मिनट की आपातकालीन खिड़की प्रदान करता है। हर एक्सेस रोगी के ऑडिट इतिहास में दर्ज होता है। अनधिकृत पहुंच संस्थागत और वैधानिक जांच के अधीन है।",
    reasonCode: "चिकित्सीय कारण कोड",
    facility: "अस्पताल / आपातकालीन केंद्र का नाम",
    justification: "चिकित्सीय औचित्य",
    triggerAccess: "महत्वपूर्ण डेटा अनलॉक करें (15 मिनट)",
    bloodGroup: "रक्त समूह",
    allergies: "गंभीर एलर्जी",
    conditions: "पुरानी बीमारियाँ",
    emergencyContact: "आपातकालीन संपर्क",
    consentActive: "सक्रिय सहमति",
    grantConsent: "चिकित्सक को सहमति दें",
    revokeConsent: "सहमति रद्द करें",
    viewIPS: "FHIR मेडिकल समरी डाउनलोड करें",

    // Navigation & Common
    skipToContent: "सामग्री पर जाएं",
    adminPortal: "🔑 व्यवस्थापक पोर्टल",
    providerPortal: "🩺 चिकित्सक पोर्टल",
    patientPortal: "👤 रोगी पोर्टल",
    completeOnboarding: "📝 पंजीकरण पूर्ण करें",
    accountOnboarding: "📝 खाता पंजीकरण",
    signOut: "साइन आउट",
    signIn: "साइन इन",
    loadingWorkspace: "कार्यस्थान लोड हो रहा है…",
    savedQRCard: "सहेजा गया QR कार्ड",
    supportAndStatus: "सहायता और स्थिति",
    patientPrivacy: "रोगी गोपनीयता · एन्क्रिप्टेड रिकॉर्ड · दर्ज एक्सेस",
    language: "भाषा (Language)",

    // Home / Hero
    everySecondMatters: "हर सेकंड महत्वपूर्ण है",
    heroTitle: "जब हर मिनट मायने रखता है, तब चिकित्सा संदर्भ।",
    heroLead: "सुरक्षित एन्क्रिप्टेड रिकॉर्ड, फोन साइन-इन, रोगी-नियंत्रित एक्सेस और पारदर्शी ऑडिट इतिहास।",
    signInRegister: "साइन इन / पंजीकरण",
    goToAdmin: "व्यवस्थापक पोर्टल पर जाएं",
    goToProvider: "चिकित्सक पोर्टल पर जाएं",
    goToPatient: "रोगी पोर्टल पर जाएं",

    // Common Actions
    save: "सहेजें",
    cancel: "रद्द करें",
    submit: "जमा करें",
    download: "डाउनलोड",
    search: "खोजें",
    delete: "हटाएं",
    confirm: "पुष्टि करें",
    retry: "पुनः प्रयास करें",
    back: "वापस",
    close: "बंद करें",
    status: "स्थिति",
    date: "दिनांक",
    actions: "कार्रवाई",

    // Patient Dashboard
    loadingPatient: "रोगी प्रोफाइल और रिकॉर्ड लोड हो रहे हैं...",
    patientSummary: "आपातकालीन चिकित्सा सारांश",
    criticalVitals: "महत्वपूर्ण स्वास्थ्य जानकारी",
    myRecords: "मेरे चिकित्सा रिकॉर्ड",
    noRecordsFound: "अभी तक कोई चिकित्सा रिकॉर्ड दर्ज नहीं है।",
    consentsTitle: "स्वास्थ्य सेवा प्रदाता पहुंच सहमति",
    noConsentsFound: "कोई सक्रिय सहमति नहीं मिली।",
    auditTrailTitle: "चिकित्सा रिकॉर्ड एक्सेस इतिहास",
    requestErasure: "चिकित्सा डेटा हटाने का अनुरोध",
    exportArchive: "पूर्ण रोगी संग्रह डाउनलोड करें",

    // Clinician Portal
    clinicianPortal: "चिकित्सक पोर्टल",
    careTeamWorkspace: "देखभाल टीम कार्यस्थान",
    verifiedClinician: "सत्यापित स्वास्थ्य सेवा पेशेवर",
    searchPatientTitle: "रोगी रिकॉर्ड खोजें",
    enterPatientId: "रोगी UUID दर्ज करें या आपातकालीन कार्ड स्कैन करें",
    addRecordTitle: "नया चिकित्सा रिकॉर्ड जोड़ें",
    recordType: "रिकॉर्ड प्रकार",
    clinicalNotes: "चिकित्सीय निष्कर्ष और नोट्स",
    attachRecord: "एन्क्रिप्टेड रिकॉर्ड संलग्न करें",
    emergencyReviewsTitle: "आपातकालीन एक्सेस समीक्षा",

    // Governance & Admin
    adminDashboard: "प्रशासन और अनुपालन डैशबोर्ड",
    providerManagement: "प्रदाता प्रबंधन",
    staffInvites: "चिकित्सा कर्मचारियों को आमंत्रित करें",
    auditExportTitle: "ऑडिट लॉग निर्यात और सत्यापन",
    downloadCsv: "ऑडिट CSV डाउनलोड करें",
    downloadPdf: "ऑडिट PDF डाउनलोड करें",
    systemIntegrity: "क्रिप्टोग्राफिक ऑडिट अखंडता",

    // Support & Scanner
    scanHospitalCard: "अस्पताल QR कार्ड स्कैन करें",
    stopCamera: "कैमरा बंद करें",
    startCamera: "कैमरा शुरू करें",
    pasteCardLink: "या अस्पताल कार्ड लिंक पेस्ट करें",
    openCard: "कार्ड खोलें",
    cameraPrivacyNotice: "कोई भी कैमरा छवि इस डिवाइस से बाहर नहीं जाती है।",
    supportTitle: "आपातकालीन प्रणाली सहायता और स्थिति",
    usualCareFallbackNotice: "सिस्टम अनुपलब्ध होने पर, तुरंत अस्पताल के मानक आपातकालीन उपचार प्रोटोकॉल का पालन करें।",
  },
};

export const REASON_CODES = [
  { code: "UNCONSCIOUS_TRAUMA", label: "Unconscious Trauma / Road Accident" },
  { code: "CARDIAC_ARREST", label: "Acute Cardiac Event / CPR" },
  { code: "ANAPHYLAXIS", label: "Severe Acute Anaphylaxis / Airway Compromise" },
  { code: "STATUS_EPILEPTICUS", label: "Status Epilepticus / Uncontrolled Seizures" },
  { code: "ACUTE_RESPIRATORY_DISTRESS", label: "Acute Respiratory Distress" },
  { code: "COMA_UNRESPONSIVE", label: "Unresponsive / Altered Mental Status" },
];

export const I18nContext = createContext({
  language: "en",
  setLanguage: () => {},
  t: (key) => key,
});

export function I18nProvider({ children }) {
  const [language, setLanguageState] = useState(() => {
    try {
      return localStorage.getItem("goldenhour_lang") || "en";
    } catch {
      return "en";
    }
  });

  const setLanguage = (lang) => {
    if (!["en", "ta", "hi"].includes(lang)) return;
    setLanguageState(lang);
    try {
      localStorage.setItem("goldenhour_lang", lang);
      document.documentElement.lang = lang;
    } catch {}
  };

  useEffect(() => {
    try {
      document.documentElement.lang = language;
    } catch {}
  }, [language]);

  const t = (key) => {
    const langDict = translations[language] || translations.en;
    if (langDict && langDict[key] !== undefined) {
      return langDict[key];
    }
    return translations.en[key] !== undefined ? translations.en[key] : key;
  };

  return React.createElement(
    I18nContext.Provider,
    { value: { language, setLanguage, t } },
    children
  );
}

export function useI18n() {
  return useContext(I18nContext);
}

export function LanguageSelector() {
  const { language, setLanguage } = useI18n();
  return React.createElement(
    "select",
    {
      className: "lang-select",
      value: language,
      onChange: (e) => setLanguage(e.target.value),
      "aria-label": "Select application language",
      style: {
        padding: "0.25rem 0.5rem",
        borderRadius: "4px",
        background: "var(--card-bg, #1e293b)",
        color: "inherit",
        border: "1px solid var(--border-color, #334155)",
        fontSize: "0.85rem",
        cursor: "pointer",
      },
    },
    React.createElement("option", { value: "en" }, "English"),
    React.createElement("option", { value: "ta" }, "தமிழ் (Tamil)"),
    React.createElement("option", { value: "hi" }, "हिंदी (Hindi)")
  );
}
