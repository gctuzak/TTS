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

    // Header'dan Boat ID (veya İsmi) al (Artık opsiyonel)
    const boatIdOrName = req.headers.get('x-boat-id')

    let targetBoatId = boatIdOrName;

    // Eğer boat ID gelmediyse, veritabanındaki ilk tekneyi bul
    if (!boatIdOrName) {
         const { data: firstBoat, error: firstBoatError } = await supabaseClient
            .from('boats')
            .select('id')
            .limit(1)
            .maybeSingle();
        
        if (firstBoat) {
            targetBoatId = firstBoat.id;
        } else {
             // Hiç tekne yoksa, otomatik oluştur
             const { data: newBoat, error: createError } = await supabaseClient
                .from('boats')
                .insert({
                    name: 'My Boat',
                    device_secret: 'default-secret'
                    // user_id yok, çünkü bu public/anon bir cihaz olabilir veya user daha sonra atanır
                })
                .select('id')
                .single();
            
            if (createError) throw new Error('Otomatik tekne oluşturulamadı: ' + createError.message);
            targetBoatId = newBoat.id;
        }
    } else {
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
                 // İsme göre bulunamadıysa da oluşturabiliriz ama şimdilik hata verelim
                 // throw new Error(`'${boatIdOrName}' isminde bir tekne bulunamadı.`);
                 // VEYA: İsme göre de otomatik oluşturabiliriz:
                 const { data: newBoat, error: createError } = await supabaseClient
                    .from('boats')
                    .insert({ name: boatIdOrName.trim(), device_secret: 'default-secret' })
                    .select('id')
                    .single();
                 
                 if (createError) throw new Error(`'${boatIdOrName}' oluşturulamadı.`);
                 targetBoatId = newBoat.id;

            } else {
                targetBoatId = boat.id;
            }
        } else {
            // UUID ise direkt kullan (kontrol etmeden de insert edilebilir ama FK hatası verebilir)
            targetBoatId = boatIdOrName;
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
      power: m.p ?? m.power ?? m.pv_power, // Note: For MPPT this is PV Power, for BMV this is Battery Power (calc on client or fw)
      pv_power: m.p, // MPPT için p = pv_power
      pv_voltage: m.pv_v,
      pv_current: m.pv_i,
      load_current: m.l_i,
      load_state: m.l_s,
      device_state: m.d_s,
      consumed_ah: m.c_ah,
      remaining_mins: m.rem,
      aux_voltage: m.aux,
      yield_today: m.yt,
      efficiency: m.eff,
      temperature: m.t ?? m.temperature,
      alarm: m.a ?? m.alarm ?? m.alarm_status ?? 0,
      mac_address: m.mac ?? null,
      device_type: m.dt ?? m.device_type
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
