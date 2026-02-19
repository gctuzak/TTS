
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://rombkctiztzusujxezfh.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJvbWJrY3RpenR6dXN1anhlemZoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkzMjU1MzYsImV4cCI6MjA4NDkwMTUzNn0.oWlvD0vb1s7wIUOsWEQYGwTf70_REx-fo2hZdSlveho'

const supabase = createClient(supabaseUrl, supabaseKey)

async function main() {
  console.log('Checking connection to:', supabaseUrl)

  // Check boats
  const { data: boats, error: boatsError } = await supabase
    .from('boats')
    .select('*')
    .limit(1)
  
  if (boatsError) {
    console.error('Error checking boats:', boatsError)
  } else {
    console.log('Boat Record:', JSON.stringify(boats, null, 2))
  }

  const { count: boatsCount, error: countError } = await supabase
    .from('boats')
    .select('*', { count: 'exact', head: true })
    
  console.log('Boats exact count:', boatsCount, 'Error:', countError)
  
  const { count: telemetryCount, error: telError } = await supabase
    .from('telemetry')
    .select('*', { count: 'exact', head: true })
  
  console.log('Telemetry exact count:', telemetryCount, 'Error:', telError)

  const { data: latestTelemetry, error: latestError } = await supabase
    .from('telemetry')
    .select('id, created_at, boat_id, voltage, current')
    .order('created_at', { ascending: false })
    .limit(5)

  if (latestError) {
    console.error('Error fetching latest telemetry:', latestError)
  } else {
    console.log('Latest telemetry rows:', JSON.stringify(latestTelemetry, null, 2))
  }

  const testPayload = [
    {
      mac_address: '08:3a:f2:67:92:d0',
      boat_name: 'Test Boat (Node)',
      voltage: 12.3,
      current: 1.2
    }
  ]

  const { data: rpcData, error: rpcError } = await supabase.rpc('ingest_telemetry', {
    payload: testPayload
  })

  console.log('RPC ingest_telemetry result:', rpcData, 'Error:', rpcError)
}

main()
