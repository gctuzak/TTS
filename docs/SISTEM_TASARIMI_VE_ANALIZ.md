# Victron Tekne Enerji İzleme Sistemi - Sistem Tasarımı ve Analiz

## 1. Veri Sıklığı ve Boyut Simülasyonu (Analiz)

Kullanıcı isteği üzerine, ESP32'nin **saniyede 1 (1 Hz)** veri gönderdiği senaryonun simülasyonu aşağıdadır.

### Varsayımlar
- **Payload (Veri Paketi):**
  ```json
  {
    "boat_id": "boat_123456",
    "timestamp": 1715000000,
    "voltage": 12.85,
    "current": 5.4,
    "soc": 98.5,
    "power": 69.3,
    "temp": 24.5,
    "alarm": 0
  }
  ```
- **Ham Veri Boyutu:** ~120 Byte (JSON string)
- **Ağ Protokolü:** HTTPS (SSL/TLS overhead + HTTP Headers)
- **Toplam Paket Boyutu (Network):** ~400-500 Byte (Keep-Alive bağlantısı varsayılarak)
- **Veritabanı Satır Boyutu:** PostgreSQL'de indexler dahil yaklaşık ~150 Byte/satır.

### Hesaplamalar (Tek Bir Tekne İçin)

| Metrik | Saniyede 1 (1 Hz) | Dakikada 1 (Önerilen) |
| :--- | :--- | :--- |
| **Saniye Başına Veri** | 1 | - |
| **Saatlik Veri Adedi** | 3,600 | 60 |
| **Günlük Veri Adedi** | 86,400 | 1,440 |
| **Aylık Veri Adedi** | **2,592,000** | **43,200** |
| **Aylık Ağ Trafiği (Tahmini)** | ~1.3 GB | ~21 MB |
| **Aylık Veritabanı Boyutu** | ~390 MB | ~6.5 MB |

### 10 Tekne İçin Toplam Yük (Aylık)
- **Saniyede 1 Gönderim:**
  - **Veritabanı:** ~4 GB / Ay (Yılda ~48 GB -> Çok hızlı büyür, yönetimi zorlaşır, maliyet artar.)
  - **Trafik:** ~13 GB / Ay (GSM modem kullanılıyorsa kota sorunu yaratabilir.)

### Öneri: "Akıllı Sıkıştırma ve Aggregation"
Saniyede 1 veri okumak (sampling) ile saniyede 1 veri göndermek (publishing) farklı şeylerdir.
- **ESP32:** Saniyede 1 kez Victron'dan veriyi okur.
- **ESP32:** Bu verileri hafızada tutar ve ortalamasını alır.
- **ESP32:** **Dakikada 1 kez** veya **Değerde %5 değişim olduğunda** (örn. motor çalıştı, voltaj fırladı) veriyi buluta gönderir.
- **Sonuç:** Hem anlık değişimler yakalanır hem de veri trafiği %90+ azalır.

---

## 2. Sistem Mimarisi ve Teknoloji Seçimleri

### A. Uç Birim (ESP32 Firmware)
Kullanıcının "Performanslı ama görsel" isteğine uygun olarak:
- **Framework:** Arduino (PlatformIO ile). Hızlı geliştirme ve geniş kütüphane desteği için.
- **Web Arayüzü (SoftAP):** `ESPAsyncWebServer` kullanılacak.
  - **Görsel Yapı:** Bootstrap veya Tailwind tabanlı, önceden derlenmiş (GZIP) tek bir HTML dosyası. Bu sayede ESP32 hafızasında yer kaplamaz ve tarayıcıda çok hızlı açılır. Modern ve şık bir "Ayar Ekranı" sunar.
- **Victron Entegrasyonu:** `NimBLE-Arduino` kütüphanesi (Standart BLE kütüphanesinden çok daha az RAM harcar ve hızlıdır).
- **Veri Gönderimi:** MQTT (daha hafif) yerine **HTTPS POST** (daha güvenilir ve firewall dostu). Supabase Edge Functions ile doğrudan konuşacak.

### B. Backend (Sunucu Tarafı)
- **Platform:** Supabase (PostgreSQL + Auth + Edge Functions).
- **Veritabanı:** PostgreSQL. TimescaleDB eklentisi (opsiyonel) ile zaman serisi verileri daha performanslı tutulabilir.
- **API:** Supabase Edge Functions (Deno/TypeScript). ESP32 doğrudan veritabanına yazmaz, bir API fonksiyonuna atar. Bu fonksiyon veriyi doğrular ve yazar.
- **Güvenlik (RLS):** "Row Level Security" aktif olacak. `users` tablosundaki bir kullanıcı SADECE `boats` tablosunda kendine tanımlı tekneleri görebilir.

### C. Frontend (Kullanıcı Paneli)
- **Framework:** React + Vite.
- **Dil:** TypeScript.
- **UI Kütüphanesi:** Tailwind CSS + Shadcn/UI (Modern, temiz ve profesyonel görünüm).
- **Grafikler:** Recharts veya ApexCharts (Mobil uyumlu, performanslı).
- **Durum Yönetimi:** React Query (Sunucu durumu senkronizasyonu için en iyisi).

---

## 3. Güvenlik Modeli

1.  **Cihaz Kimliği:** Her ESP32'nin fabrikasyon bir `Device ID`'si veya üretimde atanan bir `Token`'ı olacak.
2.  **Veri İzolasyonu:**
    - Veritabanında `boat_id` sütunu ana anahtardır.
    - RLS Politikası: `auth.uid() = boats.owner_id` kuralı ile sorgular veritabanı seviyesinde filtrelenir.
3.  **Victron Anahtarları:**
    - Kullanıcı anahtarı ESP32 arayüzüne girer.
    - ESP32 bu anahtarı NVS (Non-Volatile Storage) içinde şifreli saklar.
    - Anahtar buluta GÖNDERİLMEZ. Şifre çözme işlemi ESP32 içinde yapılır (Edge Computing). Buluta sadece çözülmüş temiz veri gider.

---

## 4. Klasör Yapısı

```
/
├── firmware/           # ESP32 PlatformIO Projesi
│   ├── src/
│   │   ├── main.cpp    # Ana döngü
│   │   ├── victron.cpp # BLE okuma mantığı
│   │   ├── web.cpp     # Captive Portal arayüzü
│   │   └── net.cpp     # WiFi ve API yönetimi
│   └── platformio.ini  # Kütüphane bağımlılıkları
│
├── backend/            # Supabase Yapılandırması
│   ├── migrations/     # Veritabanı şemaları (SQL)
│   └── functions/      # Edge Functions (API)
│       └── telemetry/  # Veri alım endpoint'i
│
├── frontend/           # React Dashboard
│   ├── src/
│   │   ├── components/ # Grafikler, Tablolar
│   │   ├── pages/      # Dashboard, Ayarlar
│   │   └── hooks/      # Veri çekme kancaları
│   └── ...
│
└── docs/               # Proje Dokümantasyonu
```
