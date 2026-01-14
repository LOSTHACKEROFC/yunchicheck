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
