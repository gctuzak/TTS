# Supabase & Coolify Kimlik Bilgileri ve Şifreler

Bu dosya, VPS üzerinde (Coolify) kurulu olan Supabase sisteminin erişim ve yapılandırma bilgilerini içermektedir.

## 🌍 URL ve Bağlantı Adresleri
*   **API Adresi (Frontend için):** `https://tts-db.gergitavan.tr:8000` *(API_EXTERNAL_URL)*
*   **Kong Adresi:** `https://tts-db.gergitavan.tr`
*   **Studio (Yönetim Paneli) Adresi:** `https://db.gergitavan.tr`

---

## 🔑 Anahtar (Key) Bilgileri

### Anon Key (Frontend `.env` dosyası için)
eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJzdXBhYmFzZSIsImlhdCI6MTc3NDc5NjgyMCwiZXhwIjo0OTMwNDcwNDIwLCJyb2xlIjoiYW5vbiJ9.CK5wj0bZD5ZqDYEJXtbOEkEYtyeFuf4fgt46BtAVyWE

### Service Role Key (Sadece Backend/Admin işlemleri için, asla frontend'e koymayın!)
eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJzdXBhYmFzZSIsImlhdCI6MTc3NDc5NjgyMCwiZXhwIjo0OTMwNDcwNDIwLCJyb2xlIjoic2VydmljZV9yb2xlIn0.0Y0cJlbH9dp1TFYThgy9_oXZ7GBfXheXuTMj52VK0D8

### JWT Secret
7ryyfJVaaoTSvp19vvnNPc97NlaTjjKA

---

## 👤 Yönetici (Admin) Giriş Bilgileri

### Supabase Studio (Yönetim Paneli) Girişi
*   **Kullanıcı Adı:** `gctuzak` *(veya bazen varsayılan olarak `supabase` veya Coolify ilk ekrandaki `ZeOfByd602LJPqru`)*
*   **Şifre:** `@G13c11T73`

### PostgreSQL Veritabanı Doğrudan Bağlantı Bilgileri
*   **Kullanıcı:** `postgres`
*   **Şifre:** `@G13c11T73`
*   **Veritabanı Adı:** `postgres`

### MinIO (Storage/Depolama) Giriş Bilgileri
*   **Kullanıcı Adı:** `UHqz2kyuKe0hSYOU`
*   **Şifre:** `k4yeFjTkC7znS7ytODal6GuAlIXlhLtZ`

---

## ⚙️ Diğer İç Sistem Şifreleri (Bilgi Amaçlı)
*   **Logflare API Key:** `rku8P9MtJc56hSR0UKIwlmbjdc256Ty7`
*   **Supavisor Secret:** `uWOd3znVgKL72Hc9Z69zTZk12HWY27lq`
*   **Vault Encryption Key:** `cmGjMZMBEX6ZNqiqtrGXS6UsBoAsyype`

---
> ⚠️ **Güvenlik Uyarısı:** Bu dosya kritik şifreler içermektedir. Lütfen bu dosyayı `.gitignore`'a eklediğinizden veya GitHub/herkese açık bir depoya yüklemediğinizden emin olun!