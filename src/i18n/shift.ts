export const shiftTranslations = {
  de: {
    title: "Meine Arbeitszeit", hello: "Hallo", state: { idle: "Nicht gestartet", working: "Arbeitet", on_break: "In Pause", elsewhere: "An anderem Standort aktiv" },
    start: "Arbeit beginnen", break: "Pause", resume: "Weiter", finish: "Arbeit beenden",
    started: "Arbeit begonnen um {{time}}", breakStarted: "Pause begonnen um {{time}}", resumed: "Weiter um {{time}}", finished: "Arbeit beendet um {{time}}",
    elsewhere: "Offene Arbeitszeit bei {{name}}. Bitte zuerst dort beenden.",
    scanQr: "Zum Beginnen bitte den QR-Code am Standort scannen.", gettingLocation: "Standort wird geprüft…",
    noProfile: "Dein Konto ist keinem Mitarbeiterprofil zugeordnet. Bitte Vorgesetzte kontaktieren.",
    signOut: "Abmelden", since: "Seit {{time}}", breakTotal: "Pause {{m}} Min.", menu: "Mesaim",
  },
  en: {
    title: "My work time", hello: "Hello", state: { idle: "Not started", working: "Working", on_break: "On break", elsewhere: "Active at another location" },
    start: "Start work", break: "Break", resume: "Resume", finish: "Finish work",
    started: "Started at {{time}}", breakStarted: "Break started at {{time}}", resumed: "Resumed at {{time}}", finished: "Finished at {{time}}",
    elsewhere: "Open work time at {{name}}. Please finish it there first.",
    scanQr: "To start, scan the QR code at the location.", gettingLocation: "Checking location…",
    noProfile: "Your account has no staff profile. Please contact your supervisor.",
    signOut: "Sign out", since: "Since {{time}}", breakTotal: "Break {{m}} min", menu: "Mesaim",
  },
  tr: {
    title: "Mesaim", hello: "Merhaba", state: { idle: "Başlamadı", working: "Çalışıyor", on_break: "Molada", elsewhere: "Başka lokasyonda açık" },
    start: "İşe başla", break: "Ara ver", resume: "Devam et", finish: "Çalışmayı bitir",
    started: "{{time}} itibarıyla başladınız", breakStarted: "Mola {{time}} başladı", resumed: "{{time}} devam ettiniz", finished: "{{time}} çalışma bitti",
    elsewhere: "{{name}} lokasyonunda açık mesainiz var. Önce orada bitirin.",
    scanQr: "Başlamak için lokasyondaki QR kodu okutun.", gettingLocation: "Konum kontrol ediliyor…",
    noProfile: "Hesabınız bir personel profiline bağlı değil. Lütfen yöneticinize başvurun.",
    signOut: "Hesaptan çık", since: "{{time}} itibarıyla", breakTotal: "Mola {{m}} dk", menu: "Mesaim",
  },
} as const;
