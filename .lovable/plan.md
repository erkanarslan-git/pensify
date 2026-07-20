## Sorun ve Çözüm

### 1) Google Login neden çalışmıyor
`hostingersite.com` üzerinde çalışıyorsun. Lovable'ın Google OAuth "broker" sistemi (`lovable.auth.signInWithOAuth`) sadece **Lovable altyapısındaki domainlerde** çalışır:
- `*.lovable.app`
- Lovable üzerinden bağlanmış custom domain

Harici hosting (Hostinger, Netlify, VPS vs.) üzerinde broker'ın callback'i reddedilir → Google login patlar.

**İki seçenek var:**
- **A)** Domainini Lovable'a bağla (Lovable custom domain). Broker çalışır, hiçbir kod değişikliği gerekmez. En temiz yol.
- **B)** Kendi Google OAuth Client ID + Secret'ını al, Lovable Cloud → Users → Authentication Settings → Google altına yapıştır. Sonra kod tarafında broker yerine doğrudan `supabase.auth.signInWithOAuth('google', ...)` kullanan bir yardımcı ekleyelim ve harici domain koşulunda onu çağıralım.

Önerim: **kısa vadede B**, uzun vadede müşteri kendi domainini alınca A'ya geçersin.

### 2) Şifremi unuttum akışı (yeni)

Ekleyeceklerim:
- `/auth` sayfasına **"Şifremi unuttum"** linki.
- `supabase.auth.resetPasswordForEmail(email, { redirectTo: origin + '/reset-password' })` çağrısı (küçük bir modal veya inline form).
- Yeni public route: **`src/routes/reset-password.tsx`**
  - URL hash'inde `type=recovery` varsa yeni şifre formu göster.
  - `supabase.auth.updateUser({ password })` ile şifreyi güncelle, sonra `/` veya `/auth`'a yönlendir.
- i18n: DE / EN / TR metinleri eklenir.

Auth email şablonları: Supabase varsayılan şablonu kullanabiliriz — özel marka istemiyorsan ek kurulum gerekmez. Ancak proje custom domain'de gönderim yapacaksa (uzun vadede) Lovable Email altyapısı kurulmalı; şimdilik varsayılanla ilerleyebiliriz.

### 3) Karar gereken 2 nokta

Plana onay vermeden önce şunları netleştirelim:

**Google OAuth için:**
- (A) "Şimdilik Lovable'ın verdiği `pensify.lovable.app` domaininde kalsın, Hostinger'ı bırakacağım." → hiçbir kod değişikliği yok, sadece şifremi unuttum'u ekleyeceğim.
- (B) "Hostinger'da devam edeceğim, kendi Google OAuth credentials'ımı alacağım." → sana Google Cloud Console adımlarını vereceğim, sen Client ID/Secret'ı alıp Cloud UI'ya yapıştıracaksın; ben `lovable.auth.signInWithOAuth` çağrısını broker yerine doğrudan Supabase OAuth'a düşen bir fallback ile değiştireceğim.
- (C) "Domainimi Lovable'a bağlayacağım (buy/connect)." → domain aktif olunca A ile aynı, ekstra kod yok.

**Reset password sayfası için:**
- Basit modern tasarım (Auth sayfasıyla aynı stil) — onay istiyorum.

### 4) Uygulama adımları (onaydan sonra)

1. Google OAuth: seçilen yola göre kod veya konfig.
2. `src/routes/reset-password.tsx` oluştur (public, SSR off, hash parse).
3. `src/routes/auth.tsx`: "Şifremi unuttum" linki + inline "e-posta gönder" modu.
4. i18n metinleri (DE/EN/TR).
5. Test:
   - Reset flow: e-posta iste → link tıkla → yeni şifre → login.
   - Google flow (seçilen yola göre) hem preview hem hedef domainde.

### Teknik notlar (kullanıcı için önemsiz)
- `redirectTo` mutlaka public route olmalı, `_authenticated` altında olamaz.
- `/reset-password` public kalır (auth guard'a takılmaz).
- Recovery link'i geldiğinde Supabase geçici bir session yaratır; `updateUser` onunla çalışır, sonra sign-out edip `/auth`'a atıyoruz ki kullanıcı yeni şifreyle giriş yapsın.

---

**Lütfen Google için A/B/C birini seç, ondan sonra tek turda hepsini uygulayıp test edeyim.**