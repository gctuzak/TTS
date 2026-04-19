import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from './lib/supabase'
import type { Session } from '@supabase/supabase-js'
import { Auth } from './components/Auth'
import { SystemFlow } from './components/SystemFlow'
import { HistoryCharts } from './components/HistoryCharts'
import { DeviceDetail } from './components/DeviceDetail'
import { LogOut, Settings, DownloadCloud } from 'lucide-react'
import './App.css'

// Veritabanı tipleri
interface TelemetryRow {
  id: number
  boat_id: string
  created_at: string
  voltage: number | null
  current: number | null
  power: number | null
  soc: number | null
  consumed_ah: number | null
  remaining_mins: number | null
  aux_voltage: number | null
  pv_power: number | null
  pv_voltage: number | null
  pv_current: number | null
  load_current: number | null
  load_state: number | null
  device_state: number | null
  temperature: number | null
  alarm: number | null
  mac_address: string | null
  device_type: number | null
  yield_today: number | null
  efficiency: number | null
  charge_state: string | null
  total_yield: number | null
  max_pv_voltage: number | null
  max_pv_power: number | null
  min_battery_voltage: number | null
  max_battery_voltage: number | null
}

interface Boat {
  id: string
  name: string
}

function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [boat, setBoat] = useState<Boat | null>(null)
  const [loading, setLoading] = useState(true)
  const [needsClaim, setNeedsClaim] = useState(false)
  const [boatNameInput, setBoatNameInput] = useState("")
  const [claimError, setClaimError] = useState("")
  const [debugLog, setDebugLog] = useState<string>("")
  const [isAdmin, setIsAdmin] = useState(false)
  const navigate = useNavigate()

  // Cihaz bazlı son verileri tutan map: mac_address -> TelemetryRow

  const [deviceMap, setDeviceMap] = useState<Record<string, TelemetryRow>>({})

  // Geçmiş verileri (Grafik için)
  const [historyData, setHistoryData] = useState<Array<{ bucket: number; time: string; voltage?: number; solar?: number }>>([])

  // Günlük maksimum veriler map: mac_address -> {pmax, vmax}
  const [maxDataMap, setMaxDataMap] = useState<Record<string, { pmax: number, vmax: number }>>({})

  // Oturum kontrolü
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (!session) {
        setBoat(null)
        setDeviceMap({})
        setHistoryData([])
        setMaxDataMap({})
        setNeedsClaim(false)
        setIsAdmin(false)
      }
      setLoading(false)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      setBoat(null)
      setDeviceMap({})
      setHistoryData([])
      setMaxDataMap({})
      setNeedsClaim(false)
      setIsAdmin(false)
    })

    return () => subscription.unsubscribe()
  }, [])

  // Tekne bilgisini çek ve Realtime başlat
  useEffect(() => {
    if (!session) return

    const trOffsetMs = 3 * 60 * 60 * 1000
    const toTrDateFromIso = (iso: string) => new Date(new Date(iso).getTime() + trOffsetMs)
    const toTrNow = () => new Date(Date.now() + trOffsetMs)
    const getTrParts = (trShiftedDate: Date) => {
      const year = trShiftedDate.getUTCFullYear()
      const month = trShiftedDate.getUTCMonth() + 1
      const day = trShiftedDate.getUTCDate()
      const hour = trShiftedDate.getUTCHours()
      return { year, month, day, hour }
    }

    const getTrDayKey = (trShiftedDate: Date) => {
      const p = getTrParts(trShiftedDate)
      return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`
    }

    const getTrHourBucket = (createdAt: string) => {
      const tr = toTrDateFromIso(createdAt)
      const p = getTrParts(tr)
      return { dayKey: getTrDayKey(tr), hour: p.hour }
    }

    const formatHourLabel = (hour: number) => `${String(hour).padStart(2, '0')}:00`

    const fillHourlyBuckets = (
      points: Array<{ bucket: number; time: string; voltage?: number; solar?: number }>,
      trNow: Date
    ) => {
      const todayKey = getTrDayKey(trNow)
      const currentHour = getTrParts(trNow).hour
      const byBucket = new Map<number, { bucket: number; time: string; voltage?: number; solar?: number }>()
      points.forEach((p) => byBucket.set(p.bucket, p))
      const filled: Array<{ bucket: number; time: string; voltage?: number; solar?: number }> = []
      for (let h = 0; h <= currentHour; h += 1) {
        filled.push(byBucket.get(h) ?? { bucket: h, time: formatHourLabel(h) })
      }
      if (filled.length > 0) {
        const last = filled[filled.length - 1]
        filled[filled.length - 1] = { ...last, time: last.time, bucket: last.bucket }
      }
      return { todayKey, filled: filled.slice(-24) }
    }

    const buildHistoryData = (rows: Array<{ created_at: string; voltage: number | null; pv_power: number | null; device_type: number | null }>) => {
      const byBucket = new Map<number, { bucket: number; time: string; voltage?: number; solar?: number; _hasBatteryVoltage?: boolean }>()
      const trNow = toTrNow()
      const { todayKey } = fillHourlyBuckets([], trNow)

      rows.forEach((r) => {
        const { dayKey, hour } = getTrHourBucket(r.created_at)
        if (dayKey !== todayKey) return
        const existing = byBucket.get(hour) ?? { bucket: hour, time: formatHourLabel(hour) }

        if (r.pv_power !== null && r.pv_power !== undefined && !isNaN(Number(r.pv_power))) {
          const val = Number(r.pv_power)
          existing.solar = existing.solar === undefined ? val : Math.max(existing.solar, val)
        }

        if (r.voltage !== null && r.voltage !== undefined && !isNaN(Number(r.voltage))) {
          const val = Number(r.voltage)
          if (r.device_type === 2) {
            existing.voltage = val
            existing._hasBatteryVoltage = true
          } else if (!existing._hasBatteryVoltage && existing.voltage === undefined) {
            existing.voltage = val
          }
        }

        byBucket.set(hour, existing)
      })

      const points = Array.from(byBucket.values()).sort((a, b) => a.bucket - b.bucket)
      const { filled } = fillHourlyBuckets(points, trNow)
      return filled
    }

    const upsertHistoryPoint = (
      prev: Array<{ bucket: number; time: string; voltage?: number; solar?: number }>,
      newRow: TelemetryRow
    ) => {
      if (newRow.device_type !== 1 && newRow.device_type !== 2) return prev

      const { dayKey, hour } = getTrHourBucket(newRow.created_at)
      const trNow = toTrNow()
      const { todayKey } = fillHourlyBuckets([], trNow)
      if (dayKey !== todayKey) return prev
      const idx = prev.findIndex((p) => p.bucket === hour)

      if (idx === -1) {
        const nextPoint: { bucket: number; time: string; voltage?: number; solar?: number } = {
          bucket: hour,
          time: formatHourLabel(hour),
        }

        if (newRow.voltage !== null && newRow.voltage !== undefined && !isNaN(Number(newRow.voltage))) {
          nextPoint.voltage = Number(newRow.voltage)
        }
        if (newRow.device_type === 1 && newRow.pv_power !== null && newRow.pv_power !== undefined) {
          nextPoint.solar = Number(newRow.pv_power)
        }

        const merged = [...prev, nextPoint].sort((a, b) => a.bucket - b.bucket)
        const { filled } = fillHourlyBuckets(merged, trNow)
        return filled
      }

      const existing = prev[idx]
      const updated = { ...existing }

      if (newRow.voltage !== null && newRow.voltage !== undefined && !isNaN(Number(newRow.voltage))) {
        updated.voltage = Number(newRow.voltage)
      }
      if (newRow.device_type === 1 && newRow.pv_power !== null && newRow.pv_power !== undefined) {
        updated.solar = Number(newRow.pv_power)
      }

      const next = [...prev]
      next[idx] = updated
      const merged = next.sort((a, b) => a.bucket - b.bucket)
      const { filled } = fillHourlyBuckets(merged, trNow)
      return filled
    }

    const fetchBoat = async () => {
      // Profil rolünü kontrol et
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', session.user.id)
        .single()
        
      if (profile && profile.role === 'admin') {
        setIsAdmin(true)
      }

      // 1. Sadece giriş yapan kullanıcıya (session.user.id) ait en son yüklenen tekneyi bul
        const { data, error } = await supabase
          .from('boats')
          .select('*')
          .eq('user_id', session.user.id) // DEĞİŞİKLİK: Sadece bu kullanıcının tekneleri
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        if (error) {
          console.error('Tekne verisi çekilemedi:', error)
          setDebugLog("Boats hatası: " + error.message)
        }

        // Eğer kullanıcının teknesi yoksa eşleştirme (tekne kurma) ekranına yönlendir
        if (!data) {
          setDebugLog(prev => prev + " | Tekne bulunamadı, claim ekranına atılıyor. user_id: " + session.user.id)
          setNeedsClaim(true)
          setBoat(null)
        } else {
          setNeedsClaim(false)
          setBoat(data)

        // 2. Yeni VIEW üzerinden cihazların en son durumlarını tek seferde ve eksiksiz çek.
        const { data: initialData, error: viewError } = await supabase
          .from('latest_device_telemetry')
          .select('*')
          .eq('boat_id', data.id)

        if (viewError) {
          console.warn("View okunamadı, cihazlar şimdilik boş gösterilecek:", viewError.message)
        } else if (initialData) {
          const map: Record<string, TelemetryRow> = {}
          initialData.forEach(row => {
            if (row.mac_address) {
              map[row.mac_address] = row
            }
          })
          setDeviceMap(map)
        }

        // 3. Günlük Pmax ve Vmax değerlerini RPC ile çek
        const { data: maxValues, error: rpcError } = await supabase.rpc('get_daily_max_values', { p_boat_id: data.id })
        
        if (rpcError) {
           console.warn("RPC fonksiyonu okunamadı:", rpcError.message)
        } else if (Array.isArray(maxValues)) {
          const tempMaxMap: Record<string, { pmax: number, vmax: number }> = {}
          maxValues.forEach((row) => {
            if (!row || typeof row !== 'object') return
            const mac = (row as { mac_address?: unknown }).mac_address
            const pmax = (row as { pmax?: unknown }).pmax
            const vmax = (row as { vmax?: unknown }).vmax
            if (typeof mac === 'string') {
              tempMaxMap[mac] = { pmax: Number(pmax ?? 0), vmax: Number(vmax ?? 0) }
            }
          })
          setMaxDataMap(tempMaxMap)
        }

        // 4. Grafikler İçin Bulunulan Günün Verisini Çek (Saatlik bucket ile son 24 nokta)
        const startOfDay = new Date()
        startOfDay.setHours(0, 0, 0, 0)
        const startOfTomorrow = new Date(startOfDay)
        startOfTomorrow.setDate(startOfTomorrow.getDate() + 1)

        const { data: historyRes } = await supabase
          .from('telemetry')
          .select('created_at, voltage, pv_power, device_type')
          .eq('boat_id', data.id)
          .gte('created_at', startOfDay.toISOString())
          .lt('created_at', startOfTomorrow.toISOString())
          .in('device_type', [1, 2])
          .order('created_at', { ascending: true })
          .limit(10000)
        
        if (historyRes && historyRes.length > 0) {
          setHistoryData(buildHistoryData(historyRes))
        } else {
          setHistoryData([])
        }

        // Realtime Abonelik
        const channel = supabase
          .channel('telemetry_updates')
          .on(
            'postgres_changes',
            {
              event: 'INSERT',
              schema: 'public',
              table: 'telemetry',
              filter: `boat_id=eq.${data.id}`
            },
            (payload) => {
              console.log('🔥 YENİ VERİ GELDİ (Realtime):', payload)
              const newRow = payload.new as TelemetryRow
              if (newRow.mac_address) {
                setDeviceMap(prev => ({
                  ...prev,
                  [`${newRow.mac_address}`]: newRow
                }))
                setHistoryData(prev => upsertHistoryPoint(prev, newRow))
              }
            }
          )
          .subscribe((status) => {
            console.log('📡 Realtime Abonelik Durumu:', status)
            if (status === 'SUBSCRIBED') {
              console.log(`✅ Tekne (ID: ${data.id}) için canlı veri dinleniyor...`)
            }
          })

        return () => {
          supabase.removeChannel(channel)
        }
      }
    }

    fetchBoat()
  }, [session])

  // Dashboard Verilerini Hesapla (Aggregation)
  const dashboardData = useMemo(() => {
    let totalPvPower = 0
    let batteryVoltage = 0
    let batterySoc = 0
    let batteryPower = 0 // + şarj, - deşarj
    let loadPower = 0
    let remaining = 0

    Object.values(deviceMap).forEach(d => {
      // Solar Charger (Tip 1)
      if (d.device_type === 1) {
        totalPvPower += Number(d.pv_power) || 0
      }
      // Battery Monitor (Tip 2)
      else if (d.device_type === 2) {
        batteryVoltage = Number(d.voltage) || 0
        batterySoc = Number(d.soc) || 0
        const current = Number(d.current) || 0
        batteryPower = batteryVoltage * current
        remaining = Number(d.remaining_mins) || 0
      }
    })

    // Yük Hesabı: (Solar Üretim) - (Aküye Giden) = Yük
    loadPower = Math.max(0, totalPvPower - batteryPower)

    return {
      pvPower: totalPvPower,
      batteryPower,
      loadPower,
      voltage: batteryVoltage,
      soc: batterySoc,
      remaining
    }
  }, [deviceMap])

  // Rastgele PIN Üretici (Örn: A7X9-B2)
  const generatePin = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // Karışabilecek O,0,I,1 çıkarıldı
    let pin = ''
    for (let i = 0; i < 6; i++) {
      if (i === 4) pin += '-'
      pin += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    return pin
  }

  // Yeni Tekne (Sistem) Kurulum İşlemi
  const handleRegisterBoat = async (e: React.FormEvent) => {
    e.preventDefault()
    setClaimError("")
    if (!session) return

    if (!boatNameInput || boatNameInput.trim().length < 3) {
      setClaimError("Lütfen teknenizin adını en az 3 karakter olacak şekilde girin.")
      return
    }

    const devicePin = generatePin()

    // Sadece adı ve user_id'si ile oluştur
    const { error: insertError } = await supabase
      .from('boats')
      .insert({
        name: boatNameInput.trim(),
        user_id: session.user.id,
        device_secret: devicePin // Artık rastgele güvenli PIN kullanılıyor
      })

    if (insertError) {
      setClaimError("Tekne kaydedilirken bir hata oluştu: " + insertError.message)
      return
    }

    // Kayıt sonrası kullanıcıya şifreyi göstermek için alert yerine şık bir bekleme yapabiliriz
    // Ama en kolayı uyarıyı gösterip fetchBoat'ı tekrar çağırmak
    alert(`TEKNENİZ BAŞARIYLA OLUŞTURULDU!\n\nLütfen cihazı kurarken (WiFi ekranında) şu PIN kodunu girin:\n\n>>> ${devicePin} <<<\n\nBu kodu daha sonra Admin panelinden görebilirsiniz.`)
    
    // Sayfayı yenilemek yerine state'i güncelleyelim
    setNeedsClaim(false)
    setBoatNameInput("")
    
    // Yeni eklenen tekneyi çekmesi için fetchBoat'ı simüle edebiliriz ama
    // reload yapmak RLS cache'lerini temizlemek için daha güvenli.
    window.location.reload()
  }

  if (loading) {
    return <div className="min-h-screen bg-gray-950 flex items-center justify-center text-white">Yükleniyor...</div>
  }

  if (!session) {
    return <Auth />
  }

  if (needsClaim) {
    return (
      <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center text-white p-4 font-sans">
        <div className="max-w-md w-full bg-gray-900 rounded-xl p-8 shadow-2xl border border-gray-800">
          <div className="mb-8 text-center">
            <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-emerald-400 bg-clip-text text-transparent">
              Yeni Tekne Ekle
            </h1>
            <p className="text-gray-400 mt-2 text-sm">
              Takibini yapmak istediğiniz teknenin adını aşağıya girin. <br /><br />
              Kaydet butonuna bastığınızda size özel bir <strong>Cihaz Şifresi (PIN)</strong> üretilecektir.
            </p>
          </div>

          <form onSubmit={handleRegisterBoat} className="space-y-6">
            {debugLog && <div className="text-xs text-yellow-500 bg-black p-2 rounded">{debugLog}</div>}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Tekne Adı
              </label>
              <input
                type="text"
                value={boatNameInput}
                onChange={(e) => setBoatNameInput(e.target.value)}
                placeholder="Örn: YAKAMOZ"
                className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-white placeholder-gray-500"
              />
            </div>
            {claimError && <div className="text-red-400 text-sm text-center">{claimError}</div>}
            <button
              type="submit"
              className="w-full py-3 px-4 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white font-semibold rounded-lg shadow-lg transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-900"
            >
              Tekneyi Oluştur ve PIN Al
            </button>
          </form>
        </div>
      </div>
    )
  }

  if (!boat) {
    return (
      <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center text-white p-4">
        <h1 className="text-2xl mb-4">Tekne Bilgisi Yükleniyor...</h1>
        <p className="text-gray-400">Veritabanı bağlantısı kuruluyor.</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white p-4 md:p-8 font-sans">
      <header className="mb-8 flex flex-col md:flex-row justify-between items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-emerald-400 bg-clip-text text-transparent">
            {boat.name}
          </h1>
          <p className="text-gray-400 text-sm mt-1">Tekne Telemetri Sistemi</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-green-500/10 border border-green-500/20 text-green-400 text-sm">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
            </span>
            Canlı
          </div>
          <button
            onClick={() => navigate('/update')}
            className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-blue-600/20 border border-blue-500/30 text-blue-400 hover:bg-blue-600/40 transition-colors text-sm"
            title="Cihaz Yazılımı Güncelle"
          >
            <DownloadCloud size={16} /> Cihaz Güncelle
          </button>
          {isAdmin && (
            <button
              onClick={() => navigate('/admin')}
              className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-purple-600/20 border border-purple-500/30 text-purple-400 hover:bg-purple-600/40 transition-colors text-sm"
              title="Admin Paneli"
            >
              <Settings size={16} /> Admin
            </button>
          )}
          <button
            onClick={() => supabase.auth.signOut()}
            className="p-2 hover:bg-gray-800 rounded-lg text-gray-400 hover:text-white transition-colors"
            title="Çıkış Yap"
          >
            <LogOut size={20} />
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto space-y-8">
        <section>
          <SystemFlow
            pvPower={dashboardData.pvPower}
            batteryPower={dashboardData.batteryPower}
            loadPower={dashboardData.loadPower}
            voltage={dashboardData.voltage}
            soc={dashboardData.soc}
            remaining={dashboardData.remaining}
          />
        </section>

        <section>
          <HistoryCharts data={historyData} />
        </section>

        <section>
          <h2 className="text-xl font-bold mb-4 text-gray-300">Cihaz Detayları</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {Object.values(deviceMap).map((device) => {
              const maxes = device.mac_address ? maxDataMap[device.mac_address] : null
              return (
                <DeviceDetail
                  key={device.mac_address || device.id}
                  device={device}
                  pmax={maxes?.pmax ?? null}
                  vmax={maxes?.vmax ?? null}
                  name={device.device_type === 1 ? 'Solar Charger' : (device.device_type === 2 ? 'Battery Monitor' : device.mac_address || 'Cihaz')}
                />
              )
            })}
          </div>
        </section>
      </main>
    </div>
  )
}

export default App
