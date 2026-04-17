# TTS (Tekne Takip Sistemi) - Kapsamlı Coolify Dağıtım Rehberi

Bu rehber, projedeki güncel yapılandırma dosyaları (`web-client/Dockerfile`, ortam değişkenleri ve mevcut Supabase mimarisi) detaylıca incelenerek hazırlanmıştır. Uygulamanın web arayüzünü (Frontend) ve backend gereksinimlerini VPS'inizdeki Coolify üzerinde nasıl ayağa kaldıracağınızı adım adım açıklar.

## 🏗 Mimari Özet

Mevcut projemiz iki ana bileşenden oluşmaktadır:
1.  **Supabase (Backend & DB):** VPS üzerinde Coolify ile barındırılmaktadır (`n8n.gergitavan.tr`).
2.  **Web İstemcisi (Frontend):** `/web-client` dizinindeki React/Vite uygulaması. Docker kullanılarak Node.js ile derlenir ve hafif bir Nginx imajı üzerinden sunulur.
3.  **Supabase Edge Functions:** `/supabase/functions` dizininde, ESP32 cihazlarından telemetri verisi alan (örn. `telemetry`) fonksiyonlar mevcuttur.

---

## 🚀 AŞAMA 1: Web İstemcisini (Frontend) Coolify'a Kurma

Uygulamanın GitHub reposuna bağlı olduğunu varsayarak, Coolify üzerinden Frontend uygulamasını ayağa kaldırmak için aşağıdaki adımları izleyin.

### 1.1. Yeni Uygulama (Application) Oluşturma
1.  Coolify kontrol panelinize (`https://n8n.gergitavan.tr` vb. Coolify URL'niz) giriş yapın.
2.  Sol menüden veya Dashboard üzerinden ilgili **Project** ve **Environment**'ı seçin.
3.  **+ Add Resource** butonuna tıklayın ve **Application** seçeneğini seçin.
4.  Git Sağlayıcısı olarak **GitHub**'ı seçin.
5.  Uygulamanızın bulunduğu repoyu (`TTS`) ve deploy edilecek branch'i (örn. `main`) seçin.

### 1.2. Yapılandırma Ayarları (Configuration)
Uygulamanın ayarlar ekranına yönlendirildiğinizde, aşağıdaki değerleri projenin mimarisine uygun şekilde doldurun:

*   **Build Pack:** `Docker` *(Coolify repoyu tarayıp otomatik Docker seçebilir, seçmezse manuel işaretleyin).*
*   **Base Directory:** `/web-client`
    *(⚠️ ÇOK ÖNEMLİ: Projemizin Dockerfile'ı ana dizinde değil, `/web-client` dizini altındadır. Bu ayarı yapmazsanız Coolify projeyi derleyemez.)*
*   **Ports Exposes:** `80`
    *(Dockerfile içerisindeki Nginx `EXPOSE 80` olarak ayarlandığı için bu portu dinlememiz gerekir).*
*   **Domain:** Uygulamanın çalışacağı adresi yazın (örn. `https://tts.gergitavan.tr`). Coolify, SSL sertifikasını (Let's Encrypt) otomatik ayarlayacaktır.

### 1.3. Ortam Değişkenleri (Environment Variables)
React uygulaması (Vite) derleme (build) aşamasında Supabase'e bağlanabilmek için iki önemli değişkene ihtiyaç duyar.

Coolify uygulama ayarlarında **Environment Variables** sekmesine gidin ve aşağıdaki değişkenleri ekleyin:

1.  **Anahtar (Key):** `VITE_SUPABASE_URL`
    *   **Değer (Value):** `https://tts-db.gergitavan.tr` *(server_credentials.md'de belirtilen API Kong adresi)*
2.  **Anahtar (Key):** `VITE_SUPABASE_ANON_KEY`
    *   **Değer (Value):** *(Supabase Studio `https://db.gergitavan.tr` üzerinden `Project Settings > API` sekmesine girip `anon` veya `public` anahtarını kopyalayın ve buraya yapıştırın)*

🚨 **Kritik Adım:** Bu iki değişkeni ekledikten sonra yanlarında bulunan **"Build Variable" (Is Build Variable?)** kutucuklarını MUTLAKA İŞARETLEYİN. Vite projeleri, ortam değişkenlerini run-time'da değil build-time'da okur. Bu işaretlenmezse uygulamanız Supabase'e bağlanamaz.

### 1.4. Yayına Alma (Deploy)
*   Tüm ayarları kaydedin.
*   Sağ üstteki **Deploy** butonuna tıklayın.
*   Coolify, `/web-client` dizinindeki `Dockerfile`'ı okuyacak, `npm ci` ve `npm run build` komutlarıyla uygulamayı derleyecek ve Nginx üzerinden yayına alacaktır.
*   Deployment Log'larından süreci izleyebilirsiniz. İşlem bitince belirlediğiniz Domain adresinden uygulamaya erişebilirsiniz.

---

## ⚙️ AŞAMA 2: Veritabanı (Supabase) Kontrolleri

Coolify üzerindeki Supabase sunucunuz çalışıyor. Ancak web uygulamanızın hatasız çalışması için veritabanı tablolarının (şemanın) güncel olması gerekir.

1.  Supabase Studio'ya (`https://db.gergitavan.tr`) giriş yapın.
2.  Sol menüden **SQL Editor**'e gidin.
3.  Proje dizininde yer alan `database/full_setup_v3.sql` veya `database/update_schema.sql` (en güncel şema hangisiyse) dosyalarının içeriğini kopyalayıp SQL Editor'de çalıştırın.
4.  Böylece `boats`, `users`, `telemetry` gibi tabloların mevcut olduğundan emin olun.

---

## 📡 AŞAMA 3: Supabase Edge Functions Dağıtımı (İsteğe Bağlı / Telemetri için)

ESP32 cihazları verilerini direkt veritabanına değil de `/supabase/functions/telemetry/index.ts` dosyasına gönderiyorsa, bu fonksiyonların Self-Hosted Supabase sunucunuza deploy edilmesi gerekir.

Eğer lokal bilgisayarınızda (veya bir CI/CD ortamında) Supabase CLI kuruluysa:

1.  Terminalden proje ana dizinine (`TTS`) gidin.
2.  Self-Hosted Supabase sunucunuza login olun:
    ```bash
    npx supabase login
    ```
    *(Supabase Studio üzerinden alacağınız Access Token'ı girin).*
3.  Projenizi linkleyin (Self-hosted ortamlar için Supabase projenizin Reference ID'sini kullanın):
    ```bash
    npx supabase link --project-ref <YOUR_PROJECT_REF>
    ```
4.  Ortam değişkenlerini Supabase'e gönderin (Edge function'ın çalışması için):
    ```bash
    npx supabase secrets set SUPABASE_URL="https://tts-db.gergitavan.tr"
    npx supabase secrets set SUPABASE_SERVICE_ROLE_KEY="<SUPABASE_SERVICE_ROLE_KEY>"
    ```
5.  Fonksiyonu deploy edin:
    ```bash
    npx supabase functions deploy telemetry
    ```

---

## 🔄 Otomatik Güncellemeler (CI/CD)

Coolify, uygulamanızı GitHub'a bağladığınız için varsayılan olarak depoya yapılan her **Push** işleminde (seçtiğiniz branch'e, örn. `main`) bir **Webhook** tetikler ve uygulamanızı otomatik olarak yeniden derleyip günceller.
Eğer otomatik deploy olmuyorsa:
1. Coolify'da uygulamanızın ayarlarına gidin.
2. **Webhooks** sekmesinde GitHub webhook'unun doğru yapılandırıldığından ve aktif olduğundan emin olun.
