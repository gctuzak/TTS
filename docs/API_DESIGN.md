# API Dokümantasyonu

Sistemde iki tür API etkileşimi vardır:
1. **Cihaz -> Bulut (Ingestion):** ESP32'nin veri gönderdiği hat.
2. **Frontend -> Bulut (Dashboard):** Kullanıcının veri çektiği hat.

## 1. Cihaz Veri Gönderimi (Ingestion API)

ESP32, topladığı verileri bu endpoint'e gönderir.

- **Endpoint:** `POST https://<project-ref>.supabase.co/functions/v1/telemetry`
- **Auth:** Bearer Token (Cihaza özel üretilmiş JWT veya API Key - Basitlik için `x-device-secret` header kullanılacak)
- **Header:**
  - `Content-Type: application/json`
  - `x-boat-id`: <boat_uuid>
  - `x-device-secret`: <device_secret_hash>

**Örnek Payload:**
```json
{
  "measurements": [
    {
      "ts": 1715620000,
      "v": 12.85,
      "i": -1.2,
      "soc": 95.0,
      "p": -15.4,
      "t": 22.0,
      "a": 0
    }
    // Eğer bağlantı koptuysa geçmiş veriler de bu diziye eklenerek toplu gönderilebilir (Batching)
  ]
}
```

**Başarılı Yanıt (200 OK):**
```json
{
  "success": true,
  "server_time": 1715620005
}
```
*(Cihaz bu yanıtı alınca hafızasındaki gönderilmiş verileri siler.)*

---

## 2. Frontend API (Dashboard)

Frontend, doğrudan Supabase Client SDK kullanarak veritabanına sorgu atar. REST API yazmaya gerek yoktur, Supabase `postgrest` arayüzünü otomatik sağlar.

**Örnek JavaScript (Supabase SDK):**

```javascript
// Son 24 saatin verisini çek
const { data, error } = await supabase
  .from('telemetry')
  .select('measured_at, voltage, soc')
  .eq('boat_id', selectedBoatId)
  .gte('measured_at', new Date(Date.now() - 24*60*60*1000).toISOString())
  .order('measured_at', { ascending: true });
```

### Gerçek Zamanlı İzleme (Realtime)
Supabase Realtime özelliği sayesinde dashboard açıkken yeni veri geldiğinde otomatik güncellenir.

```javascript
const subscription = supabase
  .channel('telemetry_updates')
  .on(
    'postgres_changes',
    { event: 'INSERT', schema: 'public', table: 'telemetry', filter: `boat_id=eq.${boatId}` },
    (payload) => {
      console.log('Yeni veri geldi:', payload.new);
      updateChart(payload.new);
    }
  )
  .subscribe();
```
