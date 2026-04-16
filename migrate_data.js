import { createClient } from '@supabase/supabase-js';

// --- SOURCE (CLOUD) SUPABASE ---
const SOURCE_URL = 'https://rombkctiztzusujxezfh.supabase.co';
const SOURCE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJvbWJrY3RpenR6dXN1anhlemZoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkzMjU1MzYsImV4cCI6MjA4NDkwMTUzNn0.oWlvD0vb1s7wIUOsWEQYGwTf70_REx-fo2hZdSlveho'; // Anon key is enough to read boats/telemetry

// --- TARGET (COOLIFY VPS) SUPABASE ---
// NOT: Eger bu scripti kisisel bilgisayarinizda calistiriyorsaniz,
// 'tts-db.gergitavan.tr' adresinin cozumlendiginden emin olun (DNS veya /etc/hosts uzerinden).
// Eger cozumlenmiyorsa script hata verecektir.
const TARGET_URL = 'https://tts-db.gergitavan.tr'; // API External URL
const TARGET_KEY = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJzdXBhYmFzZSIsImlhdCI6MTc3NDc5NjgyMCwiZXhwIjo0OTMwNDcwNDIwLCJyb2xlIjoic2VydmljZV9yb2xlIn0.0Y0cJlbH9dp1TFYThgy9_oXZ7GBfXheXuTMj52VK0D8'; // Service Role Key

const source = createClient(SOURCE_URL, SOURCE_KEY);
const target = createClient(TARGET_URL, TARGET_KEY);

async function migrateData() {
  console.log("🚀 Veri migrasyonu basliyor...\n");

  // 1. BOATS MIGRATION
  console.log("📦 Boats tablosu cekiliyor...");
  const { data: boats, error: boatsErr } = await source.from('boats').select('*');
  if (boatsErr) {
    console.error("❌ Boats cekilirken hata:", boatsErr.message);
    return;
  }
  console.log(`✅ Toplam ${boats.length} tekne bulundu.`);

  if (boats.length > 0) {
    console.log("📤 Tekneler hedef veritabanina yaziliyor...");
    const { error: insertBoatsErr } = await target.from('boats').upsert(boats);
    if (insertBoatsErr) {
      console.error("❌ Tekneler yazilirken hata:", insertBoatsErr.message);
      console.error("   NOT: Eger 'foreign key constraint' hatasi aliyorsaniz, target_supabase_setup.sql scriptini calistirdiginizdan emin olun (dummy kullaniciyi olusturmasi icin).");
      return;
    }
    console.log("✅ Tekneler basariyla kopyalandi!\n");
  }

  // 2. TELEMETRY MIGRATION
  console.log("📦 Telemetry tablosu boyut hesaplaniyor...");
  const { count: telemetryCount, error: countErr } = await source.from('telemetry').select('*', { count: 'exact', head: true });
  
  if (countErr) {
    console.error("❌ Telemetry sayisi alinamadi:", countErr.message);
    return;
  }
  console.log(`ℹ️ Toplam ${telemetryCount} telemetry kaydi bulundu. Parcalar halinde (batch) tasinacak...`);

  let processedCount = 0;
  const BATCH_SIZE = 1000;
  
  while (processedCount < telemetryCount) {
    console.log(`   ⏳ ${processedCount} - ${processedCount + BATCH_SIZE} arasi kayitlar cekiliyor...`);
    const { data: telemetryBatch, error: fetchErr } = await source
      .from('telemetry')
      .select('*')
      .order('id', { ascending: true })
      .range(processedCount, processedCount + BATCH_SIZE - 1);
      
    if (fetchErr) {
      console.error("❌ Telemetry cekilirken hata:", fetchErr.message);
      break;
    }

    if (telemetryBatch.length === 0) break;

    // Hedef veritabanina yaz (upsert kullanarak cakismalari engelle)
    // Supabase JS onConflict hatasini onlemek icin parametreleri duzenliyoruz
    const { error: insertErr } = await target.from('telemetry').upsert(telemetryBatch);
    
    if (insertErr) {
      console.error(`❌ Telemetry yazilirken hata (${processedCount} offset):`, insertErr.message);
      break;
    }

    processedCount += telemetryBatch.length;
    console.log(`   ✅ ${processedCount}/${telemetryCount} kayit tamamlandi.`);
  }

  console.log("\n🎉 Migrasyon Islemi Tamamlandi!");
}

migrateData().catch(err => console.error("Beklenmeyen Hata:", err));
