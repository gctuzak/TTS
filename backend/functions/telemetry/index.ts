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
      // Supabase Edge Function'ları otomatik olarak bu env variable'ları sağlar
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Header Kontrolleri
    const boatId = req.headers.get('x-boat-id')
    const deviceSecret = req.headers.get('x-device-secret')

    if (!boatId || !deviceSecret) {
      throw new Error('Eksik kimlik bilgileri (Boat ID veya Secret)')
    }

    // Cihaz Doğrulama
    // Not: Gerçek senaryoda device_secret hashlenmiş olmalı.
    const { data: boat, error: boatError } = await supabaseClient
      .from('boats')
      .select('id')
      .eq('id', boatId)
      .eq('device_secret', deviceSecret)
      .single()

    if (boatError || !boat) {
      return new Response(
        JSON.stringify({ error: 'Yetkisiz Cihaz', details: 'Boat ID veya Secret yanlış' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Body Okuma
    const { measurements } = await req.json()
    
    if (!measurements || !Array.isArray(measurements)) {
      throw new Error('Geçersiz veri formatı. "measurements" dizisi bekleniyor.')
    }

    // Veriyi Dönüştür (ESP32 JSON -> DB Schema)
    const records = measurements.map((m: any) => ({
      boat_id: boatId,
      measured_at: new Date(m.ts * 1000).toISOString(), // Unix Timestamp -> ISO
      voltage: m.v,
      current: m.i,
      soc: m.soc,
      power: m.p,
      temperature: m.t,
      alarm_status: m.a ?? 0
    }))

    // Veritabanına Yaz
    const { error: insertError } = await supabaseClient
      .from('telemetry')
      .insert(records)

    if (insertError) {
      console.error('Insert Error:', insertError)
      throw insertError
    }

    return new Response(
      JSON.stringify({ success: true, server_time: Math.floor(Date.now() / 1000) }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
