-- SUPABASE SQL KONSOLUNDA (SQL EDITOR) ÇALIŞTIRILACAK KOMUTLAR --

-- 1. Her cihazın en son durumunu veren güçlü bir VIEW:
-- Bu View sayesinde, frontend sadece 1 sorgu ile her MAC adresi için en son atılan satırı (latest telemetry) çekecek.
CREATE OR REPLACE VIEW latest_device_telemetry AS
SELECT DISTINCT ON (boat_id, mac_address) *
FROM telemetry
ORDER BY boat_id, mac_address, created_at DESC;

-- NOT: VIEW üzerinde RLS çalışması için alt tablodaki kuralların geçerli olduğundan emin olun,
-- Supabase otomatik olarak alt tablonun (telemetry) RLS politikalarını izler.


-- 2. "DeviceDetail" bileşenindeki N+1 sorgu problemini çözmek için 
-- her cihazın gün içi "Maksimum" (Pmax, Vmax) değerlerini hesaplayan pratik bir fonksiyon (RPC):
-- React içerisinden: await supabase.rpc('get_daily_max_values', { p_boat_id: 'x' }) şeklinde kolayca çağıracağız.
CREATE OR REPLACE FUNCTION get_daily_max_values(p_boat_id UUID) 
RETURNS TABLE (
  mac_address TEXT, 
  pmax NUMERIC, 
  vmax NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    t.mac_address::text,
    MAX(t.pv_power)::numeric as pmax,
    MAX(t.pv_voltage)::numeric as vmax
  FROM telemetry t
  WHERE t.boat_id = p_boat_id
    AND t.created_at >= date_trunc('day', CURRENT_DATE) -- Bugünün başlangıcından itibaren
    AND t.device_type = 1 -- Sadece Solar Charger'lar
  GROUP BY t.mac_address;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
