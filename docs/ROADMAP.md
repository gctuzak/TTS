# Adım Adım Geliştirme Yol Haritası (Development Roadmap)

Bu proje için önerilen geliştirme sırası aşağıdadır. Her adım bir öncekinin üzerine inşa edilir.

## Faz 1: Temel Altyapı (Backend & DB)
1.  Supabase projesi oluşturulması.
2.  `backend/schema.sql` dosyasındaki tabloların ve güvenlik politikalarının (RLS) uygulanması.
3.  Edge Function (API) yazılarak "mock" (sahte) verilerle test edilmesi (Postman veya cURL ile).

## Faz 2: Uç Birim (ESP32 Firmware) - Çekirdek
1.  PlatformIO projesinin `firmware/` klasörüne kurulması.
2.  **BLE Tarama Modülü:** ESP32'nin etraftaki Victron cihazlarını bulup filtrelemesi.
3.  **Victron Decoder:** Şifreli BLE paketlerinin (AES-128-CTR) çözülmesi için C++ sınıfının yazılması.
4.  **Seri Port Testi:** Okunan voltaj/akım verilerinin seri porttan bilgisayara basılması.

## Faz 3: Uç Birim (ESP32 Firmware) - Bağlantı & Arayüz
1.  **WiFi Manager (SoftAP):** Cihazın "VictronMonitor_Setup" adında bir ağ yayması.
2.  **Web Arayüzü:** Kullanıcının bu ağa bağlanıp `192.168.4.1` adresinden WiFi şifresini ve Victron Key'i gireceği HTML formunun hazırlanması.
3.  **Veri Kaydı (NVS):** Girilen ayarların kalıcı hafızaya kaydedilmesi.
4.  **Bulut Bağlantısı:** Okunan verilerin JSON yapılıp HTTPS ile Faz 1'de kurulan API'ye gönderilmesi.

## Faz 4: Frontend (Dashboard)
1.  React + Vite projesinin `frontend/` klasörüne kurulması.
2.  Supabase Auth entegrasyonu (Login/Register sayfaları).
3.  Tekne ekleme/seçme arayüzü.
4.  **Dashboard:**
    - Anlık veriler için büyük kartlar (Voltaj, SOC).
    - Geçmiş veriler için Çizgi Grafikler (Recharts).
5.  Canlı veri akışının (Realtime) bağlanması.

## Faz 5: Test ve Optimizasyon
1.  **Bağlantı Kopma Testi:** WiFi kapatılıp açıldığında cihazın verileri biriktirip sonradan gönderip göndermediğinin testi.
2.  **Çoklu Kullanıcı Testi:** Farklı bir kullanıcı ile girip diğerinin teknesini göremediğinin doğrulanması.
3.  **OTA (Over-The-Air) Güncelleme:** Cihazların uzaktan güncellenebilmesi için altyapı eklenmesi (Opsiyonel ama önerilir).
