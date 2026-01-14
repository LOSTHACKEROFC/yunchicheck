import { createContext, useContext, useState, useEffect, ReactNode } from "react";

export type Language = "en" | "es" | "fr" | "de" | "ar" | "zh";

export interface Translations {
  // Settings
  settings: string;
  theme: string;
  light: string;
  dark: string;
  system: string;
  sound: string;
  notificationSound: string;
  notificationTypes: string;
  ticketReplies: string;
  balanceUpdates: string;
  systemAnnouncements: string;
  topupAlerts: string;
  broadcastAnnouncements: string;
  language: string;
  dangerZone: string;
  deactivateAccount: string;
  permanentlyDeleteAccount: string;
  
  // Deactivation dialogs
  deactivateAccountQuestion: string;
  deactivateWarning: string;
  profileInfo: string;
  balanceHistory: string;
  supportTickets: string;
  allNotifications: string;
  cancel: string;
  yesContinue: string;
  finalWarning: string;
  lastChanceWarning: string;
  noKeepAccount: string;
  yesDeleteAccount: string;
  verifyIdentity: string;
  enterCredentials: string;
  email: string;
  password: string;
  enterEmail: string;
  enterPassword: string;
  deleting: string;
  deletePermanently: string;
  
  // Dashboard
  dashboard: string;
  yourBalance: string;
  notifications: string;
  markAllRead: string;
  noNotifications: string;
  viewAllTickets: string;
  
  // Sidebar
  home: string;
  profile: string;
  topup: string;
  balanceAndHistory: string;
  gateways: string;
  contactSupport: string;
  logout: string;
  
  // Toasts
  themeSetTo: string;
  notificationSoundEnabled: string;
  notificationSoundDisabled: string;
  notificationsEnabled: string;
  notificationsDisabled: string;
  languageChanged: string;
  
  // Auth page
  signInToAccount: string;
  createAccount: string;
  username: string;
  enterUsername: string;
  telegramChatId: string;
  enterTelegramChatId: string;
  telegramChatIdRequired: string;
  loading: string;
  signIn: string;
  signUp: string;
  dontHaveAccount: string;
  alreadyHaveAccount: string;
  loginSuccessful: string;
  registrationSuccessful: string;
  
  // Index page
  welcomeTo: string;
  heroDescription: string;
  startNow: string;
  viewPricing: string;
  fastProcessing: string;
  fastProcessingDesc: string;
  securePlatform: string;
  securePlatformDesc: string;
  multipleGateways: string;
  multipleGatewaysDesc: string;
  allRightsReserved: string;
  login: string;
  getStarted: string;
  pricing: string;
  back: string;
  
  // Pricing page
  pricingPlans: string;
  chooseYourPlan: string;
  selectPerfectPlan: string;
  mostPopular: string;
  starter: string;
  professional: string;
  enterprise: string;
  perfectForBeginners: string;
  mostPopularChoice: string;
  forPowerUsers: string;
  checksPerDay: string;
  unlimitedChecks: string;
  twoGateways: string;
  allGateways: string;
  basicSupport: string;
  prioritySupport: string;
  vipSupport: string;
  apiAccess: string;
  fullApiAccess: string;
  priorityQueue: string;
  bulkChecking: string;
  securePayment: string;
  needCustomPlan: string;
  perMonth: string;
}

const translations: Record<Language, Translations> = {
  en: {
    settings: "Settings",
    theme: "Theme",
    light: "Light",
    dark: "Dark",
    system: "System",
    sound: "Sound",
    notificationSound: "Notification Sound",
    notificationTypes: "Notification Types",
    ticketReplies: "Ticket Replies",
    balanceUpdates: "Balance Updates",
    systemAnnouncements: "System Announcements",
    topupAlerts: "Topup Alerts",
    broadcastAnnouncements: "Broadcast Announcements",
    language: "Language",
    dangerZone: "Danger Zone",
    deactivateAccount: "Deactivate Account",
    permanentlyDeleteAccount: "Permanently delete your account and all data.",
    deactivateAccountQuestion: "Deactivate Account?",
    deactivateWarning: "Are you sure you want to deactivate your account? This action will permanently delete all your data including:",
    profileInfo: "Your profile information",
    balanceHistory: "Your balance and transaction history",
    supportTickets: "All support tickets and messages",
    allNotifications: "All notifications",
    cancel: "Cancel",
    yesContinue: "Yes, Continue",
    finalWarning: "Final Warning",
    lastChanceWarning: "This is your last chance to cancel. Once you proceed, your account will be permanently deleted and cannot be recovered.",
    noKeepAccount: "No, Keep My Account",
    yesDeleteAccount: "Yes, Delete My Account",
    verifyIdentity: "Verify Your Identity",
    enterCredentials: "Please enter your email and password to confirm account deletion.",
    email: "Email",
    password: "Password",
    enterEmail: "Enter your email",
    enterPassword: "Enter your password",
    deleting: "Deleting...",
    deletePermanently: "Delete Account Permanently",
    dashboard: "Dashboard",
    yourBalance: "Your Balance",
    notifications: "Notifications",
    markAllRead: "Mark all read",
    noNotifications: "No notifications yet",
    viewAllTickets: "View all tickets",
    home: "Home",
    profile: "Profile",
    topup: "Topup",
    balanceAndHistory: "Balance & History",
    gateways: "Gateways",
    contactSupport: "Contact Support",
    logout: "Logout",
    themeSetTo: "Theme set to",
    notificationSoundEnabled: "Notification sound enabled",
    notificationSoundDisabled: "Notification sound disabled",
    notificationsEnabled: "notifications enabled",
    notificationsDisabled: "notifications disabled",
    languageChanged: "Language changed to",
    // Auth
    signInToAccount: "Sign in to your account",
    createAccount: "Create your account",
    username: "Username",
    enterUsername: "Enter username",
    telegramChatId: "Telegram Chat ID",
    enterTelegramChatId: "Enter your Telegram Chat ID",
    telegramChatIdRequired: "Telegram Chat ID is required for notifications",
    loading: "Loading...",
    signIn: "Sign In",
    signUp: "Sign Up",
    dontHaveAccount: "Don't have an account? Sign up",
    alreadyHaveAccount: "Already have an account? Sign in",
    loginSuccessful: "Login successful!",
    registrationSuccessful: "Registration successful!",
    // Index
    welcomeTo: "Welcome to",
    heroDescription: "Fast, reliable, and secure checking service. Join thousands of users worldwide.",
    startNow: "Start Now",
    viewPricing: "View Pricing",
    fastProcessing: "Fast Processing",
    fastProcessingDesc: "Lightning-fast checks with instant results",
    securePlatform: "Secure Platform",
    securePlatformDesc: "Enterprise-grade security for your data",
    multipleGateways: "Multiple Gateways",
    multipleGatewaysDesc: "Access to various payment gateways",
    allRightsReserved: "All rights reserved.",
    login: "Login",
    getStarted: "Get Started",
    pricing: "Pricing",
    back: "Back",
    // Pricing
    pricingPlans: "Pricing Plans",
    chooseYourPlan: "Choose Your Plan",
    selectPerfectPlan: "Select the perfect plan for your needs. Upgrade or downgrade anytime.",
    mostPopular: "Most Popular",
    starter: "Starter",
    professional: "Professional",
    enterprise: "Enterprise",
    perfectForBeginners: "Perfect for beginners",
    mostPopularChoice: "Most popular choice",
    forPowerUsers: "For power users",
    checksPerDay: "checks/day",
    unlimitedChecks: "Unlimited checks",
    twoGateways: "2 gateways",
    allGateways: "All gateways",
    basicSupport: "Basic support",
    prioritySupport: "Priority support",
    vipSupport: "24/7 VIP support",
    apiAccess: "API access",
    fullApiAccess: "Full API access",
    priorityQueue: "Priority queue",
    bulkChecking: "Bulk checking",
    securePayment: "All plans include secure payment processing. Cancel anytime.",
    needCustomPlan: "Need a custom plan?",
    perMonth: "/month",
  },
  es: {
    settings: "Configuración",
    theme: "Tema",
    light: "Claro",
    dark: "Oscuro",
    system: "Sistema",
    sound: "Sonido",
    notificationSound: "Sonido de Notificación",
    notificationTypes: "Tipos de Notificación",
    ticketReplies: "Respuestas de Tickets",
    balanceUpdates: "Actualizaciones de Saldo",
    systemAnnouncements: "Anuncios del Sistema",
    topupAlerts: "Alertas de Recarga",
    broadcastAnnouncements: "Anuncios de Difusión",
    language: "Idioma",
    dangerZone: "Zona Peligrosa",
    deactivateAccount: "Desactivar Cuenta",
    permanentlyDeleteAccount: "Eliminar permanentemente tu cuenta y todos los datos.",
    deactivateAccountQuestion: "¿Desactivar Cuenta?",
    deactivateWarning: "¿Estás seguro de que deseas desactivar tu cuenta? Esta acción eliminará permanentemente todos tus datos incluyendo:",
    profileInfo: "Tu información de perfil",
    balanceHistory: "Tu saldo e historial de transacciones",
    supportTickets: "Todos los tickets de soporte y mensajes",
    allNotifications: "Todas las notificaciones",
    cancel: "Cancelar",
    yesContinue: "Sí, Continuar",
    finalWarning: "Advertencia Final",
    lastChanceWarning: "Esta es tu última oportunidad de cancelar. Una vez que continúes, tu cuenta será eliminada permanentemente y no podrá ser recuperada.",
    noKeepAccount: "No, Mantener Mi Cuenta",
    yesDeleteAccount: "Sí, Eliminar Mi Cuenta",
    verifyIdentity: "Verifica Tu Identidad",
    enterCredentials: "Por favor ingresa tu correo y contraseña para confirmar la eliminación de la cuenta.",
    email: "Correo",
    password: "Contraseña",
    enterEmail: "Ingresa tu correo",
    enterPassword: "Ingresa tu contraseña",
    deleting: "Eliminando...",
    deletePermanently: "Eliminar Cuenta Permanentemente",
    dashboard: "Panel",
    yourBalance: "Tu Saldo",
    notifications: "Notificaciones",
    markAllRead: "Marcar todo leído",
    noNotifications: "Sin notificaciones aún",
    viewAllTickets: "Ver todos los tickets",
    home: "Inicio",
    profile: "Perfil",
    topup: "Recargar",
    balanceAndHistory: "Saldo e Historial",
    gateways: "Pasarelas",
    contactSupport: "Contactar Soporte",
    logout: "Cerrar Sesión",
    themeSetTo: "Tema cambiado a",
    notificationSoundEnabled: "Sonido de notificación activado",
    notificationSoundDisabled: "Sonido de notificación desactivado",
    notificationsEnabled: "notificaciones activadas",
    notificationsDisabled: "notificaciones desactivadas",
    languageChanged: "Idioma cambiado a",
    // Auth
    signInToAccount: "Inicia sesión en tu cuenta",
    createAccount: "Crea tu cuenta",
    username: "Usuario",
    enterUsername: "Ingresa usuario",
    telegramChatId: "ID de Chat de Telegram",
    enterTelegramChatId: "Ingresa tu ID de Chat de Telegram",
    telegramChatIdRequired: "El ID de Chat de Telegram es requerido para notificaciones",
    loading: "Cargando...",
    signIn: "Iniciar Sesión",
    signUp: "Registrarse",
    dontHaveAccount: "¿No tienes cuenta? Regístrate",
    alreadyHaveAccount: "¿Ya tienes cuenta? Inicia sesión",
    loginSuccessful: "¡Inicio de sesión exitoso!",
    registrationSuccessful: "¡Registro exitoso!",
    // Index
    welcomeTo: "Bienvenido a",
    heroDescription: "Servicio de verificación rápido, confiable y seguro. Únete a miles de usuarios en todo el mundo.",
    startNow: "Comenzar Ahora",
    viewPricing: "Ver Precios",
    fastProcessing: "Procesamiento Rápido",
    fastProcessingDesc: "Verificaciones ultrarrápidas con resultados instantáneos",
    securePlatform: "Plataforma Segura",
    securePlatformDesc: "Seguridad de nivel empresarial para tus datos",
    multipleGateways: "Múltiples Pasarelas",
    multipleGatewaysDesc: "Acceso a varias pasarelas de pago",
    allRightsReserved: "Todos los derechos reservados.",
    login: "Iniciar Sesión",
    getStarted: "Comenzar",
    pricing: "Precios",
    back: "Volver",
    // Pricing
    pricingPlans: "Planes de Precios",
    chooseYourPlan: "Elige Tu Plan",
    selectPerfectPlan: "Selecciona el plan perfecto para tus necesidades. Actualiza o degrada en cualquier momento.",
    mostPopular: "Más Popular",
    starter: "Inicial",
    professional: "Profesional",
    enterprise: "Empresarial",
    perfectForBeginners: "Perfecto para principiantes",
    mostPopularChoice: "La opción más popular",
    forPowerUsers: "Para usuarios avanzados",
    checksPerDay: "verificaciones/día",
    unlimitedChecks: "Verificaciones ilimitadas",
    twoGateways: "2 pasarelas",
    allGateways: "Todas las pasarelas",
    basicSupport: "Soporte básico",
    prioritySupport: "Soporte prioritario",
    vipSupport: "Soporte VIP 24/7",
    apiAccess: "Acceso API",
    fullApiAccess: "Acceso API completo",
    priorityQueue: "Cola prioritaria",
    bulkChecking: "Verificación masiva",
    securePayment: "Todos los planes incluyen procesamiento de pago seguro. Cancela en cualquier momento.",
    needCustomPlan: "¿Necesitas un plan personalizado?",
    perMonth: "/mes",
  },
  fr: {
    settings: "Paramètres",
    theme: "Thème",
    light: "Clair",
    dark: "Sombre",
    system: "Système",
    sound: "Son",
    notificationSound: "Son de Notification",
    notificationTypes: "Types de Notification",
    ticketReplies: "Réponses aux Tickets",
    balanceUpdates: "Mises à jour du Solde",
    systemAnnouncements: "Annonces Système",
    topupAlerts: "Alertes de Recharge",
    broadcastAnnouncements: "Annonces de Diffusion",
    language: "Langue",
    dangerZone: "Zone Dangereuse",
    deactivateAccount: "Désactiver le Compte",
    permanentlyDeleteAccount: "Supprimer définitivement votre compte et toutes les données.",
    deactivateAccountQuestion: "Désactiver le Compte?",
    deactivateWarning: "Êtes-vous sûr de vouloir désactiver votre compte? Cette action supprimera définitivement toutes vos données, y compris:",
    profileInfo: "Vos informations de profil",
    balanceHistory: "Votre solde et historique des transactions",
    supportTickets: "Tous les tickets de support et messages",
    allNotifications: "Toutes les notifications",
    cancel: "Annuler",
    yesContinue: "Oui, Continuer",
    finalWarning: "Avertissement Final",
    lastChanceWarning: "C'est votre dernière chance d'annuler. Une fois que vous continuez, votre compte sera définitivement supprimé et ne pourra pas être récupéré.",
    noKeepAccount: "Non, Garder Mon Compte",
    yesDeleteAccount: "Oui, Supprimer Mon Compte",
    verifyIdentity: "Vérifiez Votre Identité",
    enterCredentials: "Veuillez entrer votre email et mot de passe pour confirmer la suppression du compte.",
    email: "Email",
    password: "Mot de passe",
    enterEmail: "Entrez votre email",
    enterPassword: "Entrez votre mot de passe",
    deleting: "Suppression...",
    deletePermanently: "Supprimer le Compte Définitivement",
    dashboard: "Tableau de Bord",
    yourBalance: "Votre Solde",
    notifications: "Notifications",
    markAllRead: "Tout marquer comme lu",
    noNotifications: "Pas encore de notifications",
    viewAllTickets: "Voir tous les tickets",
    home: "Accueil",
    profile: "Profil",
    topup: "Recharger",
    balanceAndHistory: "Solde et Historique",
    gateways: "Passerelles",
    contactSupport: "Contacter le Support",
    logout: "Déconnexion",
    themeSetTo: "Thème défini sur",
    notificationSoundEnabled: "Son de notification activé",
    notificationSoundDisabled: "Son de notification désactivé",
    notificationsEnabled: "notifications activées",
    notificationsDisabled: "notifications désactivées",
    languageChanged: "Langue changée en",
    // Auth
    signInToAccount: "Connectez-vous à votre compte",
    createAccount: "Créez votre compte",
    username: "Nom d'utilisateur",
    enterUsername: "Entrez le nom d'utilisateur",
    telegramChatId: "ID de Chat Telegram",
    enterTelegramChatId: "Entrez votre ID de Chat Telegram",
    telegramChatIdRequired: "L'ID de Chat Telegram est requis pour les notifications",
    loading: "Chargement...",
    signIn: "Se Connecter",
    signUp: "S'inscrire",
    dontHaveAccount: "Pas de compte? Inscrivez-vous",
    alreadyHaveAccount: "Déjà un compte? Connectez-vous",
    loginSuccessful: "Connexion réussie!",
    registrationSuccessful: "Inscription réussie!",
    // Index
    welcomeTo: "Bienvenue sur",
    heroDescription: "Service de vérification rapide, fiable et sécurisé. Rejoignez des milliers d'utilisateurs dans le monde.",
    startNow: "Commencer",
    viewPricing: "Voir les Prix",
    fastProcessing: "Traitement Rapide",
    fastProcessingDesc: "Vérifications ultra-rapides avec résultats instantanés",
    securePlatform: "Plateforme Sécurisée",
    securePlatformDesc: "Sécurité de niveau entreprise pour vos données",
    multipleGateways: "Passerelles Multiples",
    multipleGatewaysDesc: "Accès à diverses passerelles de paiement",
    allRightsReserved: "Tous droits réservés.",
    login: "Connexion",
    getStarted: "Commencer",
    pricing: "Tarifs",
    back: "Retour",
    // Pricing
    pricingPlans: "Plans Tarifaires",
    chooseYourPlan: "Choisissez Votre Plan",
    selectPerfectPlan: "Sélectionnez le plan parfait pour vos besoins. Mettez à niveau ou rétrogradez à tout moment.",
    mostPopular: "Plus Populaire",
    starter: "Débutant",
    professional: "Professionnel",
    enterprise: "Entreprise",
    perfectForBeginners: "Parfait pour les débutants",
    mostPopularChoice: "Le choix le plus populaire",
    forPowerUsers: "Pour les utilisateurs avancés",
    checksPerDay: "vérifications/jour",
    unlimitedChecks: "Vérifications illimitées",
    twoGateways: "2 passerelles",
    allGateways: "Toutes les passerelles",
    basicSupport: "Support basique",
    prioritySupport: "Support prioritaire",
    vipSupport: "Support VIP 24/7",
    apiAccess: "Accès API",
    fullApiAccess: "Accès API complet",
    priorityQueue: "File prioritaire",
    bulkChecking: "Vérification en masse",
    securePayment: "Tous les plans incluent un traitement de paiement sécurisé. Annulez à tout moment.",
    needCustomPlan: "Besoin d'un plan personnalisé?",
    perMonth: "/mois",
  },
  de: {
    settings: "Einstellungen",
    theme: "Thema",
    light: "Hell",
    dark: "Dunkel",
    system: "System",
    sound: "Ton",
    notificationSound: "Benachrichtigungston",
    notificationTypes: "Benachrichtigungstypen",
    ticketReplies: "Ticket-Antworten",
    balanceUpdates: "Kontostand-Updates",
    systemAnnouncements: "Systemankündigungen",
    topupAlerts: "Auflade-Benachrichtigungen",
    broadcastAnnouncements: "Broadcast-Ankündigungen",
    language: "Sprache",
    dangerZone: "Gefahrenzone",
    deactivateAccount: "Konto Deaktivieren",
    permanentlyDeleteAccount: "Konto und alle Daten dauerhaft löschen.",
    deactivateAccountQuestion: "Konto Deaktivieren?",
    deactivateWarning: "Sind Sie sicher, dass Sie Ihr Konto deaktivieren möchten? Diese Aktion löscht dauerhaft alle Ihre Daten, einschließlich:",
    profileInfo: "Ihre Profilinformationen",
    balanceHistory: "Ihren Kontostand und Transaktionsverlauf",
    supportTickets: "Alle Support-Tickets und Nachrichten",
    allNotifications: "Alle Benachrichtigungen",
    cancel: "Abbrechen",
    yesContinue: "Ja, Fortfahren",
    finalWarning: "Letzte Warnung",
    lastChanceWarning: "Dies ist Ihre letzte Chance abzubrechen. Sobald Sie fortfahren, wird Ihr Konto dauerhaft gelöscht und kann nicht wiederhergestellt werden.",
    noKeepAccount: "Nein, Konto Behalten",
    yesDeleteAccount: "Ja, Konto Löschen",
    verifyIdentity: "Identität Bestätigen",
    enterCredentials: "Bitte geben Sie Ihre E-Mail und Ihr Passwort ein, um die Kontolöschung zu bestätigen.",
    email: "E-Mail",
    password: "Passwort",
    enterEmail: "E-Mail eingeben",
    enterPassword: "Passwort eingeben",
    deleting: "Löschen...",
    deletePermanently: "Konto Dauerhaft Löschen",
    dashboard: "Dashboard",
    yourBalance: "Ihr Kontostand",
    notifications: "Benachrichtigungen",
    markAllRead: "Alle als gelesen markieren",
    noNotifications: "Noch keine Benachrichtigungen",
    viewAllTickets: "Alle Tickets anzeigen",
    home: "Startseite",
    profile: "Profil",
    topup: "Aufladen",
    balanceAndHistory: "Kontostand & Verlauf",
    gateways: "Gateways",
    contactSupport: "Support Kontaktieren",
    logout: "Abmelden",
    themeSetTo: "Thema geändert zu",
    notificationSoundEnabled: "Benachrichtigungston aktiviert",
    notificationSoundDisabled: "Benachrichtigungston deaktiviert",
    notificationsEnabled: "Benachrichtigungen aktiviert",
    notificationsDisabled: "Benachrichtigungen deaktiviert",
    languageChanged: "Sprache geändert zu",
    // Auth
    signInToAccount: "Melden Sie sich bei Ihrem Konto an",
    createAccount: "Erstellen Sie Ihr Konto",
    username: "Benutzername",
    enterUsername: "Benutzername eingeben",
    telegramChatId: "Telegram Chat-ID",
    enterTelegramChatId: "Geben Sie Ihre Telegram Chat-ID ein",
    telegramChatIdRequired: "Telegram Chat-ID ist für Benachrichtigungen erforderlich",
    loading: "Laden...",
    signIn: "Anmelden",
    signUp: "Registrieren",
    dontHaveAccount: "Kein Konto? Registrieren",
    alreadyHaveAccount: "Bereits ein Konto? Anmelden",
    loginSuccessful: "Anmeldung erfolgreich!",
    registrationSuccessful: "Registrierung erfolgreich!",
    // Index
    welcomeTo: "Willkommen bei",
    heroDescription: "Schneller, zuverlässiger und sicherer Überprüfungsservice. Schließen Sie sich Tausenden von Benutzern weltweit an.",
    startNow: "Jetzt Starten",
    viewPricing: "Preise Ansehen",
    fastProcessing: "Schnelle Verarbeitung",
    fastProcessingDesc: "Blitzschnelle Überprüfungen mit sofortigen Ergebnissen",
    securePlatform: "Sichere Plattform",
    securePlatformDesc: "Sicherheit auf Unternehmensebene für Ihre Daten",
    multipleGateways: "Mehrere Gateways",
    multipleGatewaysDesc: "Zugang zu verschiedenen Zahlungs-Gateways",
    allRightsReserved: "Alle Rechte vorbehalten.",
    login: "Anmelden",
    getStarted: "Loslegen",
    pricing: "Preise",
    back: "Zurück",
    // Pricing
    pricingPlans: "Preispläne",
    chooseYourPlan: "Wählen Sie Ihren Plan",
    selectPerfectPlan: "Wählen Sie den perfekten Plan für Ihre Bedürfnisse. Jederzeit upgraden oder downgraden.",
    mostPopular: "Beliebteste",
    starter: "Starter",
    professional: "Professionell",
    enterprise: "Unternehmen",
    perfectForBeginners: "Perfekt für Anfänger",
    mostPopularChoice: "Die beliebteste Wahl",
    forPowerUsers: "Für Power-User",
    checksPerDay: "Überprüfungen/Tag",
    unlimitedChecks: "Unbegrenzte Überprüfungen",
    twoGateways: "2 Gateways",
    allGateways: "Alle Gateways",
    basicSupport: "Basis-Support",
    prioritySupport: "Prioritäts-Support",
    vipSupport: "24/7 VIP-Support",
    apiAccess: "API-Zugang",
    fullApiAccess: "Voller API-Zugang",
    priorityQueue: "Prioritätswarteschlange",
    bulkChecking: "Massenüberprüfung",
    securePayment: "Alle Pläne beinhalten sichere Zahlungsabwicklung. Jederzeit kündbar.",
    needCustomPlan: "Benötigen Sie einen individuellen Plan?",
    perMonth: "/Monat",
  },
  ar: {
    settings: "الإعدادات",
    theme: "المظهر",
    light: "فاتح",
    dark: "داكن",
    system: "النظام",
    sound: "الصوت",
    notificationSound: "صوت الإشعارات",
    notificationTypes: "أنواع الإشعارات",
    ticketReplies: "ردود التذاكر",
    balanceUpdates: "تحديثات الرصيد",
    systemAnnouncements: "إعلانات النظام",
    topupAlerts: "تنبيهات الشحن",
    broadcastAnnouncements: "إعلانات البث",
    language: "اللغة",
    dangerZone: "منطقة الخطر",
    deactivateAccount: "إلغاء تنشيط الحساب",
    permanentlyDeleteAccount: "حذف حسابك وجميع البيانات بشكل دائم.",
    deactivateAccountQuestion: "إلغاء تنشيط الحساب؟",
    deactivateWarning: "هل أنت متأكد أنك تريد إلغاء تنشيط حسابك؟ سيؤدي هذا الإجراء إلى حذف جميع بياناتك بشكل دائم بما في ذلك:",
    profileInfo: "معلومات ملفك الشخصي",
    balanceHistory: "رصيدك وسجل المعاملات",
    supportTickets: "جميع تذاكر الدعم والرسائل",
    allNotifications: "جميع الإشعارات",
    cancel: "إلغاء",
    yesContinue: "نعم، استمر",
    finalWarning: "تحذير أخير",
    lastChanceWarning: "هذه فرصتك الأخيرة للإلغاء. بمجرد المتابعة، سيتم حذف حسابك بشكل دائم ولا يمكن استرداده.",
    noKeepAccount: "لا، احتفظ بحسابي",
    yesDeleteAccount: "نعم، احذف حسابي",
    verifyIdentity: "تحقق من هويتك",
    enterCredentials: "يرجى إدخال بريدك الإلكتروني وكلمة المرور لتأكيد حذف الحساب.",
    email: "البريد الإلكتروني",
    password: "كلمة المرور",
    enterEmail: "أدخل بريدك الإلكتروني",
    enterPassword: "أدخل كلمة المرور",
    deleting: "جاري الحذف...",
    deletePermanently: "حذف الحساب نهائياً",
    dashboard: "لوحة التحكم",
    yourBalance: "رصيدك",
    notifications: "الإشعارات",
    markAllRead: "تحديد الكل كمقروء",
    noNotifications: "لا توجد إشعارات بعد",
    viewAllTickets: "عرض جميع التذاكر",
    home: "الرئيسية",
    profile: "الملف الشخصي",
    topup: "شحن",
    balanceAndHistory: "الرصيد والسجل",
    gateways: "البوابات",
    contactSupport: "اتصل بالدعم",
    logout: "تسجيل الخروج",
    themeSetTo: "تم تغيير المظهر إلى",
    notificationSoundEnabled: "تم تفعيل صوت الإشعارات",
    notificationSoundDisabled: "تم إيقاف صوت الإشعارات",
    notificationsEnabled: "تم تفعيل الإشعارات",
    notificationsDisabled: "تم إيقاف الإشعارات",
    languageChanged: "تم تغيير اللغة إلى",
    // Auth
    signInToAccount: "تسجيل الدخول إلى حسابك",
    createAccount: "إنشاء حسابك",
    username: "اسم المستخدم",
    enterUsername: "أدخل اسم المستخدم",
    telegramChatId: "معرف محادثة تيليجرام",
    enterTelegramChatId: "أدخل معرف محادثة تيليجرام الخاص بك",
    telegramChatIdRequired: "معرف محادثة تيليجرام مطلوب للإشعارات",
    loading: "جاري التحميل...",
    signIn: "تسجيل الدخول",
    signUp: "إنشاء حساب",
    dontHaveAccount: "ليس لديك حساب؟ سجل الآن",
    alreadyHaveAccount: "لديك حساب بالفعل؟ سجل دخول",
    loginSuccessful: "تم تسجيل الدخول بنجاح!",
    registrationSuccessful: "تم التسجيل بنجاح!",
    // Index
    welcomeTo: "مرحباً بك في",
    heroDescription: "خدمة فحص سريعة وموثوقة وآمنة. انضم إلى آلاف المستخدمين حول العالم.",
    startNow: "ابدأ الآن",
    viewPricing: "عرض الأسعار",
    fastProcessing: "معالجة سريعة",
    fastProcessingDesc: "فحوصات فائقة السرعة مع نتائج فورية",
    securePlatform: "منصة آمنة",
    securePlatformDesc: "أمان على مستوى المؤسسات لبياناتك",
    multipleGateways: "بوابات متعددة",
    multipleGatewaysDesc: "الوصول إلى بوابات دفع متنوعة",
    allRightsReserved: "جميع الحقوق محفوظة.",
    login: "تسجيل الدخول",
    getStarted: "ابدأ",
    pricing: "الأسعار",
    back: "رجوع",
    // Pricing
    pricingPlans: "خطط الأسعار",
    chooseYourPlan: "اختر خطتك",
    selectPerfectPlan: "اختر الخطة المثالية لاحتياجاتك. قم بالترقية أو التخفيض في أي وقت.",
    mostPopular: "الأكثر شعبية",
    starter: "مبتدئ",
    professional: "احترافي",
    enterprise: "مؤسسي",
    perfectForBeginners: "مثالي للمبتدئين",
    mostPopularChoice: "الخيار الأكثر شعبية",
    forPowerUsers: "للمستخدمين المتقدمين",
    checksPerDay: "فحص/يوم",
    unlimitedChecks: "فحوصات غير محدودة",
    twoGateways: "2 بوابة",
    allGateways: "جميع البوابات",
    basicSupport: "دعم أساسي",
    prioritySupport: "دعم ذو أولوية",
    vipSupport: "دعم VIP على مدار الساعة",
    apiAccess: "الوصول إلى API",
    fullApiAccess: "وصول كامل إلى API",
    priorityQueue: "قائمة انتظار ذات أولوية",
    bulkChecking: "فحص جماعي",
    securePayment: "جميع الخطط تتضمن معالجة دفع آمنة. إلغاء في أي وقت.",
    needCustomPlan: "تحتاج خطة مخصصة؟",
    perMonth: "/شهر",
  },
  zh: {
    settings: "设置",
    theme: "主题",
    light: "浅色",
    dark: "深色",
    system: "系统",
    sound: "声音",
    notificationSound: "通知声音",
    notificationTypes: "通知类型",
    ticketReplies: "工单回复",
    balanceUpdates: "余额更新",
    systemAnnouncements: "系统公告",
    topupAlerts: "充值提醒",
    broadcastAnnouncements: "广播公告",
    language: "语言",
    dangerZone: "危险区域",
    deactivateAccount: "停用账户",
    permanentlyDeleteAccount: "永久删除您的账户和所有数据。",
    deactivateAccountQuestion: "停用账户？",
    deactivateWarning: "您确定要停用您的账户吗？此操作将永久删除您的所有数据，包括：",
    profileInfo: "您的个人资料信息",
    balanceHistory: "您的余额和交易历史",
    supportTickets: "所有支持工单和消息",
    allNotifications: "所有通知",
    cancel: "取消",
    yesContinue: "是的，继续",
    finalWarning: "最后警告",
    lastChanceWarning: "这是您取消的最后机会。一旦继续，您的账户将被永久删除且无法恢复。",
    noKeepAccount: "不，保留我的账户",
    yesDeleteAccount: "是的，删除我的账户",
    verifyIdentity: "验证您的身份",
    enterCredentials: "请输入您的电子邮件和密码以确认删除账户。",
    email: "电子邮件",
    password: "密码",
    enterEmail: "输入您的电子邮件",
    enterPassword: "输入您的密码",
    deleting: "删除中...",
    deletePermanently: "永久删除账户",
    dashboard: "仪表板",
    yourBalance: "您的余额",
    notifications: "通知",
    markAllRead: "全部标为已读",
    noNotifications: "暂无通知",
    viewAllTickets: "查看所有工单",
    home: "首页",
    profile: "个人资料",
    topup: "充值",
    balanceAndHistory: "余额与历史",
    gateways: "网关",
    contactSupport: "联系支持",
    logout: "退出登录",
    themeSetTo: "主题已设置为",
    notificationSoundEnabled: "已启用通知声音",
    notificationSoundDisabled: "已禁用通知声音",
    notificationsEnabled: "通知已启用",
    notificationsDisabled: "通知已禁用",
    languageChanged: "语言已更改为",
    // Auth
    signInToAccount: "登录您的账户",
    createAccount: "创建您的账户",
    username: "用户名",
    enterUsername: "输入用户名",
    telegramChatId: "Telegram 聊天 ID",
    enterTelegramChatId: "输入您的 Telegram 聊天 ID",
    telegramChatIdRequired: "需要 Telegram 聊天 ID 以接收通知",
    loading: "加载中...",
    signIn: "登录",
    signUp: "注册",
    dontHaveAccount: "没有账户？注册",
    alreadyHaveAccount: "已有账户？登录",
    loginSuccessful: "登录成功！",
    registrationSuccessful: "注册成功！",
    // Index
    welcomeTo: "欢迎来到",
    heroDescription: "快速、可靠、安全的检查服务。加入全球数千用户。",
    startNow: "立即开始",
    viewPricing: "查看定价",
    fastProcessing: "快速处理",
    fastProcessingDesc: "闪电般的检查，即时结果",
    securePlatform: "安全平台",
    securePlatformDesc: "企业级数据安全",
    multipleGateways: "多种网关",
    multipleGatewaysDesc: "访问各种支付网关",
    allRightsReserved: "版权所有。",
    login: "登录",
    getStarted: "开始使用",
    pricing: "定价",
    back: "返回",
    // Pricing
    pricingPlans: "定价方案",
    chooseYourPlan: "选择您的方案",
    selectPerfectPlan: "选择适合您需求的完美方案。随时升级或降级。",
    mostPopular: "最受欢迎",
    starter: "入门版",
    professional: "专业版",
    enterprise: "企业版",
    perfectForBeginners: "适合初学者",
    mostPopularChoice: "最受欢迎的选择",
    forPowerUsers: "适合高级用户",
    checksPerDay: "次检查/天",
    unlimitedChecks: "无限检查",
    twoGateways: "2个网关",
    allGateways: "所有网关",
    basicSupport: "基础支持",
    prioritySupport: "优先支持",
    vipSupport: "24/7 VIP支持",
    apiAccess: "API访问",
    fullApiAccess: "完整API访问",
    priorityQueue: "优先队列",
    bulkChecking: "批量检查",
    securePayment: "所有方案包含安全支付处理。随时取消。",
    needCustomPlan: "需要定制方案？",
    perMonth: "/月",
  },
};

export const languageNames: Record<Language, string> = {
  en: "English",
  es: "Español",
  fr: "Français",
  de: "Deutsch",
  ar: "العربية",
  zh: "中文",
};

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: Translations;
  isRTL: boolean;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider = ({ children }: { children: ReactNode }) => {
  const [language, setLanguageState] = useState<Language>(() => {
    const saved = localStorage.getItem("app-language");
    return (saved as Language) || "en";
  });

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem("app-language", lang);
    // Update document direction for RTL languages
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
  };

  useEffect(() => {
    document.documentElement.dir = language === "ar" ? "rtl" : "ltr";
  }, []);

  const t = translations[language];
  const isRTL = language === "ar";

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t, isRTL }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }
  return context;
};
