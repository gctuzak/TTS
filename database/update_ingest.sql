CREATE OR REPLACE FUNCTION public.ingest_telemetry(payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  item jsonb;
  v_boat_id uuid;
  v_secret text;
  v_count int := 0;
BEGIN
  -- Payload bir dizi olmalı. Eğer değilse hata fırlat veya boş dön.
  IF jsonb_typeof(payload) <> 'array' THEN
     RETURN jsonb_build_object('success', false, 'error', 'Payload must be an array');
  END IF;

  FOR item IN SELECT * FROM jsonb_array_elements(payload)
  LOOP
    -- 1. ESP32'den gelen PIN Kodunu (Device Secret) al (Firmware hala 'boat_name' alanıyla atıyor)
    v_secret := item->>'boat_name';
    
    IF v_secret IS NOT NULL THEN
        -- 2. Boat ID'yi PIN Koduna (device_secret) göre bul
        SELECT id INTO v_boat_id FROM boats WHERE device_secret = v_secret LIMIT 1;
        
        -- 3. Eğer Boat yoksa, veriyi kaydetme, çünkü yetim veri kalır.
        IF v_boat_id IS NULL THEN
            -- Kayıtlı olmayan PIN geldi, bu veriyi atla.
            CONTINUE;
        END IF;

        -- 4. Telemetry verisini kaydet
        INSERT INTO telemetry (
            boat_id,
            mac_address,
            voltage,
            current,
            power,
            temperature,
            alarm,
            device_type,
            soc,
            pv_power,
            pv_voltage,
            pv_current,
            load_current,
            device_state,
            yield_today,
            efficiency,
            consumed_ah,
            remaining_mins,
            aux_voltage,
            load_state
        ) VALUES (
            v_boat_id,
            item->>'mac_address',
            (item->>'voltage')::numeric,
            (item->>'current')::numeric,
            (item->>'power')::numeric,
            (item->>'temperature')::numeric,
            (item->>'alarm')::int,
            (item->>'device_type')::int,
            (item->>'soc')::numeric,
            (item->>'pv_power')::numeric,
            (item->>'pv_voltage')::numeric,
            (item->>'pv_current')::numeric,
            (item->>'load_current')::numeric,
            (item->>'device_state')::int,
            (item->>'yield_today')::numeric,
            (item->>'efficiency')::numeric,
            (item->>'consumed_ah')::numeric,
            (item->>'remaining_mins')::numeric,
            (item->>'aux_voltage')::numeric,
            (item->>'load_state')::int
        );
        
        v_count := v_count + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'inserted_count', v_count);
END;
$function$;
