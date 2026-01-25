import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-device-secret, x-boat-id',
}

serve(async (req) => {
  // CORS Handle
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Header'dan Boat ID (veya İsmi) al
    const boatIdOrName = req.headers.get('x-boat-id')

    if (!boatIdOrName) {
      throw new Error('Boat ID (veya ismi) eksik (x-boat-id header)')
    }

    let targetBoatId = boatIdOrName;

    // UUID Format Kontrolü
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(boatIdOrName);

    // Eğer UUID değilse, isme göre arama yap (Case Insensitive)
    if (!isUuid) {
        const { data: boat, error } = await supabaseClient
            .from('boats')
            .select('id')
            .ilike('name', boatIdOrName.trim())
            .single();
        
        if (error || !boat) {
             throw new Error(`'${boatIdOrName}' isminde bir tekne bulunamadı. Lütfen panelden oluşturun.`);
        }
        targetBoatId = boat.id;
    } else {
        // UUID ise, veritabanında var mı diye kontrol et (opsiyonel ama güvenli)
        // Direkt insert denersek FK hatası alırız, bu daha temiz hata mesajı verir.
         const { data: boat, error } = await supabaseClient
            .from('boats')
            .select('id')
            .eq('id', boatIdOrName)
            .single();
        
        if (error || !boat) {
             throw new Error(`'${boatIdOrName}' ID'li tekne bulunamadı.`);
        }
    }

    // Body Okuma
    const { measurements } = await req.json()
    
    if (!measurements || !Array.isArray(measurements)) {
      throw new Error('Geçersiz veri formatı. "measurements" dizisi bekleniyor.')
    }

    // Veriyi Dönüştür
    const records = measurements.map((m: any) => ({
      boat_id: targetBoatId, // Bulduğumuz UUID'yi kullan
      created_at: m.ts ? new Date(m.ts * 1000).toISOString() : new Date().toISOString(),
      voltage: m.v ?? m.voltage,
      current: m.i ?? m.current,
          soc: m.soc,
          power: m.p ?? m.power ?? m.pv_power,
          temperature: m.t ?? m.temperature,
          alarm: m.a ?? m.alarm ?? m.alarm_status ?? 0,
          mac_address: m.mac ?? null
        }))

    // Veritabanına Yaz
    const { data, error } = await supabaseClient
      .from('telemetry')
      .insert(records)
      .select()

    if (error) throw error

    return new Response(
      JSON.stringify({ success: true, data }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
