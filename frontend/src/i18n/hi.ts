import { en, type Strings } from "./en";

/**
 * Hindi translation — Phase 1 scope only (§7 NFR: "no Hindi content ships in
 * Phase 1" applied to the authenticated app; the sign-in page's language
 * switcher is the first exception). Only the sections an unauthenticated
 * visitor can actually see — `common` (a couple of shared strings used on
 * that page), `app.tagline`, `auth`, and `about` — are translated; everything
 * else is inherited from `en` unchanged so the rest of the app keeps
 * rendering in English even if `hi` is selected.
 */
// `en`'s fields are `as const` literal types (e.g. `auth.signIn: "Sign in"`),
// so a direct `: Strings` annotation here would reject any different string
// value. Build the object untyped (each field widens to plain `string`) and
// assert the shape at the end instead.
const hiDictionary = {
  ...en,
  common: {
    ...en.common,
    saving: "सहेजा जा रहा है…",
    somethingWentWrong: "कुछ गड़बड़ हो गई। कृपया पुनः प्रयास करें।",
  },
  app: {
    ...en.app,
    tagline: "आत्मविश्वास के साथ प्रारूपित करें, समीक्षा करें और सबमिट करें — इससे पहले कि यह CCTNS तक पहुंचे।",
  },
  auth: {
    signIn: "साइन इन करें",
    signUp: "साइन अप करें",
    pno: "पीएनओ (विभागीय आईडी)",
    name: "पूरा नाम",
    designation: "पदनाम",
    email: "ईमेल",
    mobile: "मोबाइल नंबर",
    otpCode: "6-अंकीय ओटीपी",
    sendOtp: "ओटीपी भेजें",
    verifyAndContinue: "सत्यापित करें और जारी रखें",
    needAccount: "नए अधिकारी? खाता बनाएं",
    haveAccount: "पहले से पंजीकृत? साइन इन करें",
    otpSent: "दिए गए संपर्क विवरण पर एक ओटीपी भेजा गया है।",
    signedOut: "आपको साइन आउट कर दिया गया है।",
    signUpTagline: "केस डायरी बनाना शुरू करने के लिए अपनी विभागीय आईडी से पंजीकरण करें।",
    signInTagline: "जारी रखने के लिए अपना पंजीकृत ईमेल या मोबाइल नंबर दर्ज करें।",
    contactRequired: "एक ईमेल या मोबाइल नंबर दर्ज करें।",
    mobileHint: "10 अंक, 6–9 से शुरू — जैसे 9876543210",
    emailOrMobile: "ईमेल या मोबाइल नंबर",
    emailOrMobileHint: "अपना पंजीकृत ईमेल पता या 10-अंकीय मोबाइल नंबर दर्ज करें।",
    invalidEmailOrMobile: "एक मान्य ईमेल पता या 6–9 से शुरू होने वाला 10-अंकीय मोबाइल नंबर दर्ज करें।",
    selectDesignation: "अपना पदनाम चुनें",
    loadingOptions: "लोड हो रहा है…",
    enterCode: "अपने पंजीकृत संपर्क विवरण पर भेजा गया 6-अंकीय कोड दर्ज करें।",
    changeDetails: "अलग विवरण का उपयोग करें",
    resendCode: "नया कोड भेजें",
    aboutMeChip: "मुझे पढ़ें!",
    signInMethod: "साइन-इन विधि",
    passwordSignInTagline: "जारी रखने के लिए अपना पीएनओ या पंजीकृत ईमेल, साथ ही पासवर्ड दर्ज करें।",
    loginWithPassword: "पासवर्ड से लॉगिन करें",
    loginWithOtp: "ओटीपी से लॉगिन करें",
    password: "पासवर्ड",
    login: "लॉगिन",
    pnoOrEmail: "पीएनओ या ईमेल",
    pnoOrEmailPlaceholder: "आपका पीएनओ या पंजीकृत ईमेल",
    forgotPassword: "पासवर्ड भूल गए?",
    forgotPasswordHint: "अपना मौजूदा पासवर्ड याद नहीं है? इसे रीसेट करने के लिए किसी एडमिन से कहें — फिर साइन इन करके अपना खुद का पासवर्ड सेट करें।",
    resetPasswordTagline: "नया पासवर्ड सेट करने के लिए अपना मौजूदा पासवर्ड दर्ज करें।",
    setNewPassword: "नया पासवर्ड सेट करें",
    backToSignIn: "साइन इन पर वापस जाएं",
    currentPassword: "मौजूदा पासवर्ड",
    newPassword: "नया पासवर्ड",
    confirmNewPassword: "नए पासवर्ड की पुष्टि करें",
    changePassword: "पासवर्ड बदलें",
    passwordChanged: "पासवर्ड बदल दिया गया।",
    passwordsDoNotMatch: "नए पासवर्ड मेल नहीं खाते।",
    passwordTooShort: "पासवर्ड कम से कम 8 अक्षरों का होना चाहिए।",
    passwordRule: "कम से कम 8 अक्षर। यह डिफ़ॉल्ट पासवर्ड नहीं हो सकता।",
    setNewPasswordHeading: "अपना पासवर्ड सेट करें",
    setNewPasswordBody:
      "आपका खाता अभी भी एडमिन द्वारा जारी किए गए पासवर्ड पर है। जारी रखने के लिए एक निजी पासवर्ड चुनें — जब तक आप ऐसा नहीं करते, बाकी सब कुछ लॉक रहेगा।",
  },
  about: {
    heading: "परिचय!",
    subheading: "विवेचक अधिकारियों के लिए प्रस्तुतीकरण-पूर्व प्रारूपण एवं सहयोग हेतु एक परत।",
    whatHeading: "यह क्या है?",
    whatBody:
      "यह पोर्टल आपको यह सुविधा प्रदान करता है कि आप सीसीटीएनएस पर अभियोग दैनिकी (सीडी) जमा करने से पहले टाइप करके एक प्रारूप तैयार कर लें और सीडी के जमा करने से पहले पढ़कर यह सुनिश्चित कर लें कि सीडी सही बना है। इस पोर्टल पर टाइप किया गया पर्चा न तो कोई आधिकारिक अभिलेख है और न ही इसे CCTNS का विकल्प माना जाए। इसका मुख्य उद्देश्य CD बनाने में AI सहयता प्रदान करना है।",
    whyHeading: "यह क्यों बनाया गया?",
    whyPoints: [
      "सीसीटीएनएस टर्मिनल/कंप्यूटर सिर्फ थानों पर इंस्टाल होते हैं, जिससे फील्ड डियूटी में तैनात विवेचकों के लिए पर्चा तैयार करने में बाधाएं उत्पन्न होती हैं।",
      "वर्तमान में विवेचक सीसीटीएनएस पर सीडी जमा करने से पहले अनौपचारिक रूप से नोट्स तैयार करते हैं और उसके बाद सीसीटीएनएस कंप्यूटर पर टाइप करके पर्चे जमा करते हैं। जिससे एक ही काम को पहले कागज/मोबाइल पर टाइप करने के बाद कंप्यूटर पर जमा करते हैं, जिससे काम का बार बार दुहराव होता है — जिससे त्रुटियाँ, काम में देरी और समय की हानि होती है।",
      "यह प्लेटफ़ॉर्म एक तेज़, काम का दोहराव कम करना और पर्चे टाइप करने के लिए सीसीटीएनएस कंप्यूटर पर अनिवार्य मौजूदगी जैसे अंतर को समाप्त करता है और पर्चे जमा करने से पहले त्रुटियों को कम करता है।",
    ],
    whoHeading: "यह किनके लिए है?",
    whoBody:
      "अलग-अलग स्तर की तकनीकी जानकारी रखने वाले सरकारी अधिकारी। इंटरफ़ेस जानबूझकर सरल, तेज़ और कम-घर्षण वाला रखा गया है — पासवर्ड-रहित साइन-इन, ऑटोसेव, और न्यूनतम क्लिक — ताकि यह उपकरण काम में बाधा न बने।",
    aiHeading: "उद्देश्य",
    aiBody:
      "यह पोर्टल एआई-संचालित सुविधाओं से सुसज्जित है जो विवेचकों को विवेचना अधिक प्रभावी ढंग से करने में सहायता करने हेतु डिज़ाइन की गई हैं। यह पोर्टल विवेचक को विवेचना के दौरान सीडी टाइप करने में मात्र सहयोग और सलाह प्रदान करता है।",
    disclaimerHeading: "ध्यान दें",
    disclaimerBody:
      "यह केवल एक प्रारूपण सहायक है। यह CCTNS में सबमिट नहीं करता, उससे सिंक नहीं करता, या उसका स्थान नहीं लेता। आधिकारिक अभिलेख हमेशा CCTNS की आधिकारिक प्रविष्टि ही रहेगा।",
  },
};

export const hi: Strings = hiDictionary as unknown as Strings;
