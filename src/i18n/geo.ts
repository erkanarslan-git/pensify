import i18n from "i18next";
const labels: Record<string, readonly [string, string, string]> = {
  "Geofence Test": [
    "Standorttest",
    "Location test",
    "Geofence Test"
  ],
  "Yenile": [
    "Aktualisieren",
    "Refresh",
    "Yenile"
  ],
  "Mevcut konum": [
    "Aktueller Standort",
    "Current location",
    "Mevcut konum"
  ],
  "Konum alınıyor…": [
    "Standort wird ermittelt…",
    "Getting location…",
    "Konum alınıyor…"
  ],
  "Konum API desteklenmiyor": [
    "Standortermittlung nicht unterstützt",
    "Location unavailable",
    "Konum API desteklenmiyor"
  ],
  "Enlem": [
    "Breitengrad",
    "Latitude",
    "Enlem"
  ],
  "Boylam": [
    "Längengrad",
    "Longitude",
    "Boylam"
  ],
  "Doğruluk": [
    "Genauigkeit",
    "Accuracy",
    "Doğruluk"
  ],
  "Zaman": [
    "Zeit",
    "Time",
    "Zaman"
  ],
  "Lokasyonlar": [
    "Standorte",
    "Locations",
    "Lokasyonlar"
  ],
  "Laden…": [
    "Lädt…",
    "Loading…",
    "Laden…"
  ],
  "Lokasyon yok.": [
    "Keine Standorte.",
    "No locations.",
    "Lokasyon yok."
  ],
  "Koordinat tanımlı değil": [
    "Keine Koordinaten hinterlegt",
    "No coordinates configured",
    "Koordinat tanımlı değil"
  ],
  "Yarıçap": [
    "Radius",
    "Radius",
    "Yarıçap"
  ],
  "Mesafe": [
    "Entfernung",
    "Distance",
    "Mesafe"
  ],
  "Etkin": [
    "Effektiv",
    "Effective",
    "Etkin"
  ],
  "Koord. yok": [
    "Keine Koordinaten",
    "No coordinates",
    "Koord. yok"
  ],
  "Konum bekleniyor": [
    "Warte auf Standort",
    "Waiting for location",
    "Konum bekleniyor"
  ],
  "İçeride": [
    "Innerhalb",
    "Inside",
    "İçeride"
  ],
  "Kesişim (kabul)": [
    "Überschneidung (akzeptiert)",
    "Intersection (accepted)",
    "Kesişim (kabul)"
  ],
  "Doğruluk düşük": [
    "Genauigkeit zu gering",
    "Low accuracy",
    "Doğruluk düşük"
  ],
  "Sınırda (red)": [
    "An der Grenze (abgelehnt)",
    "At boundary (rejected)",
    "Sınırda (red)"
  ],
  "Uzak": [
    "Außerhalb",
    "Outside",
    "Uzak"
  ],
  "Mavi = senin doğruluk çemberin · Yeşil = lokasyonun geofence çemberi": [
    "Blau = Genauigkeitskreis · Grün = Standortkreis",
    "Blue = accuracy circle · Green = location circle",
    "Mavi = senin doğruluk çemberin · Yeşil = lokasyonun geofence çemberi"
  ],
  "Bu lokasyon için koordinat tanımlı değil — kesişim çizilemiyor.": [
    "Keine Koordinaten für diesen Standort — Überschneidung nicht darstellbar.",
    "No coordinates for this location — intersection unavailable.",
    "Bu lokasyon için koordinat tanımlı değil — kesişim çizilemiyor."
  ],
  "Konum henüz alınmadı.": [
    "Standort noch nicht ermittelt.",
    "Location not yet acquired.",
    "Konum henüz alınmadı."
  ],
  "Lokasyon": [
    "Standort",
    "Location",
    "Lokasyon"
  ],
  "Sen": [
    "Du",
    "You",
    "Sen"
  ],
  "Lokasyon enlem": [
    "Standort-Breitengrad",
    "Location latitude",
    "Lokasyon enlem"
  ],
  "Lokasyon boylam": [
    "Standort-Längengrad",
    "Location longitude",
    "Lokasyon boylam"
  ],
  "Etkin mesafe": [
    "Effektive Entfernung",
    "Effective distance",
    "Etkin mesafe"
  ],
  "Kesişim?": [
    "Überschneidung?",
    "Intersection?",
    "Kesişim?"
  ],
  "Tamamen içeride?": [
    "Vollständig innerhalb?",
    "Fully inside?",
    "Tamamen içeride?"
  ],
  "Sonuç": [
    "Ergebnis",
    "Result",
    "Sonuç"
  ],
  "Evet": [
    "Ja",
    "Yes",
    "Evet"
  ],
  "Hayır": [
    "Nein",
    "No",
    "Hayır"
  ],
  "Kabul": [
    "Akzeptiert",
    "Accepted",
    "Kabul"
  ],
  "Red": [
    "Abgelehnt",
    "Rejected",
    "Red"
  ],
  "Kabul kuralı": [
    "Akzeptanzregel",
    "Acceptance rule",
    "Kabul kuralı"
  ],
  "mesafe ≤ geofence yarıçapı + doğruluk": [
    "Entfernung ≤ Standortradius + Genauigkeit",
    "distance ≤ geofence radius + accuracy",
    "mesafe ≤ geofence yarıçapı + doğruluk"
  ],
  "Doğruluk üst sınırı": [
    "Maximale Ungenauigkeit",
    "Maximum inaccuracy",
    "Doğruluk üst sınırı"
  ]
};
export function geoText(label: string) {
  const values = labels[label];
  if (!values) return label;
  const lang = i18n.resolvedLanguage ?? i18n.language;
  return values[lang?.startsWith("tr") ? 2 : lang?.startsWith("en") ? 1 : 0];
}
