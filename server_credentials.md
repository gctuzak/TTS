# Sunucu ve Veritabanı Bilgileri (Supabase & Coolify)

## 1. Sunucu SSH Bağlantı Bilgileri
- **Host / Adres:** `n8n.gergitavan.tr`
- **Port:** `22`
- **Kullanıcı Adı:** `root`
- **Şifre:** `@G13c11T73`

## 2. Coolify Yapılandırma Bilgileri
- **Coolify Service UUID:** `dk4wswk04owo840ow488wcg4`
- **Proje Adı:** `supabase-tts`
- **Servis Dizin Yolu:** `/data/coolify/services/dk4wswk04owo840ow488wcg4/`
- **Docker Ağı (Network):** `dk4wswk04owo840ow488wcg4`

## 3. Supabase (Veritabanı ve API) Bilgileri
- **Supabase Studio URL (Arayüz):** `https://db.gergitavan.tr`
- **Supabase API (Kong) URL:** `https://tts-db.gergitavan.tr`
- **PostgreSQL Şifresi:** `@G13c11T73`
  *(Not: PostgREST gibi bazı iç servislerde `@` karakteri hataya yol açtığı için URL formatında `%40G13c11T73` olarak kodlanmıştır. Normal bağlantılarda direkt `@G13c11T73` kullanılır.)*
- **PostgreSQL Host:** Docker içerisinde `supabase-db`

## 4. Önemli Notlar & Yapılandırmalar
- SQL Editör "Snippet" verilerinin kalıcı olması için `dk4wswk04owo840ow488wcg4_supabase-snippets` adında bir Docker Volume oluşturulmuş ve `supabase-studio` servisine bağlanmıştır.
- Herhangi bir ortam değişkeni (env) veya docker-compose değişikliği sonrasında servisleri yeniden başlatmak için SSH ile sunucuya bağlanıp şu komutlar çalıştırılmalıdır:
  ```bash
  cd /data/coolify/services/dk4wswk04owo840ow488wcg4
  docker compose down && docker compose up -d
  ```