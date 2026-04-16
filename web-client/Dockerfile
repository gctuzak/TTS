# ==========================
# 1. BUILD AŞAMASI (Builder)
# ==========================
FROM node:20-alpine AS builder

WORKDIR /app

# 1.1 Sadece package.json dosyalarını kopyalayıp npm ci ile temiz kurulum yap
COPY package*.json ./
RUN npm ci

# 1.2 Geri kalan tüm proje dosyalarını kopyala
COPY . .

# 1.3 Vite (React) uygulaması için ortam değişkenlerini (ENV) ARG olarak alıyoruz.
# Coolify Deployment ekranından "Environment Variables" sekmesinde bu değişkenleri set etmelisiniz.
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY

ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY

# 1.4 Vite ile derleme (dist klasörünü oluşturur)
RUN npm run build


# ==========================
# 2. SUNUM AŞAMASI (Nginx)
# ==========================
FROM nginx:alpine

# 2.1 SPA yönlendirmeleri (404 Not Found önleme) için nginx.conf'u kopyala
COPY nginx.conf /etc/nginx/conf.d/default.conf

# 2.2 Derlenen statik React (Vite) dosyalarını Nginx dizinine kopyala
COPY --from=builder /app/dist /usr/share/nginx/html

# 2.3 Sunucunun 80 portundan dışa açıldığını belirt (Coolify bu portu algılar)
EXPOSE 80

# 2.4 Nginx'i arka planda (daemon off) çalıştır
CMD ["nginx", "-g", "daemon off;"]