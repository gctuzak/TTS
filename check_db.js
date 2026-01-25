
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://rombkctiztzusujxezfh.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJvbWJrY3RpenR6dXN1anhlemZoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkzMjU1MzYsImV4cCI6MjA4NDkwMTUzNn0.oWlvD0vb1s7wIUOsWEQYGwTf70_REx-fo2hZdSlveho'

const supabase = createClient(supabaseUrl, supabaseKey)

async function main() {
  console.log('Checking connection to:', supabaseUrl)

  // Check boats
  const { data: boats, error: boatsError } = await supabase
    .from('boats')
    .select('count')
  
  if (boatsError) {
    console.error('Error checking boats:', boatsError)
  } else {
    console.log('Boats count:', boats.length) // Note: count is not returned like this with select('count') without head:true usually, but select('*', { count: 'exact', head: true }) is better.
    // Let's just select * limit 1
  }

  const { count: boatsCount, error: countError } = await supabase
    .from('boats')
    .select('*', { count: 'exact', head: true })
    
  console.log('Boats exact count:', boatsCount, 'Error:', countError)

  // Check telemetry
  const { count: telemetryCount, error: telError } = await supabase
    .from('telemetry')
    .select('*', { count: 'exact', head: true })

  console.log('Telemetry exact count:', telemetryCount, 'Error:', telError)
  
  if (telemetryCount > 0) {
      console.log('Data found! Proceeding to delete...')
      // Delete all
      // Since we don't have DELETE ALL permission usually without Where, we might need a condition.
      // But let's try.
      const { error: delError } = await supabase
        .from('telemetry')
        .delete()
        .neq('id', 0) // Delete all where id != 0 (assuming id is positive)
        
      console.log('Delete result:', delError || 'Success')
  }
}

main()
