import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Inspect Telemetry Table Columns
    // Note: PostgREST usually doesn't expose information_schema by default unless configured.
    // So this might fail or return empty.
    // Instead, let's try to select * from telemetry limit 0 and see if we can get keys?
    // Or just try to select specific columns and see which one fails?
    
    // Attempt 1: Get one row (even if empty)
    const { data: sample, error: sampleError } = await supabaseAdmin
        .from('telemetry')
        .select('*')
        .limit(1)

    return new Response(
      JSON.stringify({ 
          sample: sample, 
          error: sampleError 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
