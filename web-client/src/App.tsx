import { useState, useEffect, useMemo } from 'react'
import { supabase } from './lib/supabase'
import { Auth } from './components/Auth'
import { SystemFlow } from './components/SystemFlow'
import { StatCard } from './components/StatCard'
import { HistoryCharts } from './components/HistoryCharts'
import { DeviceDetail } from './components/DeviceDetail'
import { Battery, Zap, Sun, Clock, LogOut } from 'lucide-react'
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
  const [session, setSession] = useState<any>(null)
  const [boat, setBoat] = useState<Boat | null>(null)
  const [loading, setLoading] = useState(true)
  const [needsClaim, setNeedsClaim] = useState(false)
  const [boatNameInput, setBoatNameInput] = useState("")
  const [claimError, setClaimError] = useState("")

  // Cihaz bazlı son verileri tutan map: mac_address -> TelemetryRow
  const [deviceMap, setDeviceMap] = useState<Record<string, TelemetryRow>>({})

  // Geçmiş verileri (Grafik için)
  const [historyData, setHistoryData] = useState<any[]>([])

  // Günlük maksimum veriler map: mac_address -> {pmax, vmax}
  const [maxDataMap, setMaxDataMap] = useState<Record<string, { pmax: number, vmax: number }>>({})

  // Oturum kontrolü
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setLoading(false)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })

    return () => subscription.unsubscribe()
  }, [])

  // Tekne bilgisini çek ve Realtime başlat
  useEffect(() => {
    if (!session) {
      setBoat(null)
      setDeviceMap({})
      setNeedsClaim(false) // Oturum yoksa claim ekranı gösterme
      return
    }

    const fetchBoat = async () => {
      // 1. Sadece giriş yapan kullanıcıya (session.user.id) ait en son yüklenen tekneyi bul
      let { data, error } = await supabase
        .from('boats')
        .select('*')
        .eq('user_id', session.user.id) // DEĞİŞİKLİK: Sadece bu kullanıcının tekneleri
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (error) {
        console.error('Tekne verisi çekilemedi:', error)
      }

      // Eğer kullanıcının teknesi yoksa eşleştirme (tekne kurma) ekranına yönlendir
      if (!data) {
        setNeedsClaim(true)
        setBoat(null)
      } else {
        setNeedsClaim(false)
        setBoat(data)

        // 2. Yeni VIEW üzerinden cihazların en son durumlarını tek seferde ve eksiksiz çek.
        // limit(50) kaldırıldı çünkü artık her cihazın sadece güncel 1 satırı gelecek.
        // DİKKAT: Telemetry tablosunda boat_id hala UUID olduğu için eşleştirmeyi id üzerinden yapıyoruz.
        // ESP32 veriyi ismiyle (boat_name) atıyor, muhtemelen backend (ingest_telemetry) bunu UUID'ye çevirip kaydediyor.
        const { data: initialData } = await supabase
          .from('latest_device_telemetry') // DEĞİŞİKLİK: View kullanıyoruz
          .select('*')
          .eq('boat_id', data.id)

        if (initialData) {
          const map: Record<string, TelemetryRow> = {}
          initialData.forEach(row => {
            if (row.mac_address) {
              map[row.mac_address] = row
            }
          })
          setDeviceMap(map)
        }

        // 3. Günlük Pmax ve Vmax değerlerini RPC ile çek
        const { data: maxValues } = await supabase.rpc('get_daily_max_values', { p_boat_id: data.id })
        if (maxValues) {
          const tempMaxMap: Record<string, { pmax: number, vmax: number }> = {}
          maxValues.forEach((row: any) => {
            if (row.mac_address) {
              tempMaxMap[row.mac_address] = { pmax: row.pmax, vmax: row.vmax }
            }
          })
          setMaxDataMap(tempMaxMap)
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
              const newRow = payload.new as TelemetryRow
              if (newRow.mac_address) {
                setDeviceMap(prev => ({
                  ...prev,
                  [`${newRow.mac_address}`]: newRow
                }))

                // Grafik verisi güncelleme
                if (newRow.voltage) {
                  setHistoryData(prev => {
                    const newData = [...prev, {
                      time: new Date(newRow.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                      voltage: newRow.voltage,
                      solar: newRow.pv_power || 0
                    }].slice(-24)
                    return newData
                  })
                }
              }
            }
          )
          .subscribe()

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

  // Türkçe Karakter Temizleme (Opsiyonel / Normalizasyon)
  const normalizeString = (str: string) => {
    return str.trim()
      .replace(/ı/g, 'i')
      .replace(/ğ/g, 'g')
      .replace(/ü/g, 'u')
      .replace(/ş/g, 's')
      .replace(/ö/g, 'o')
      .replace(/ç/g, 'c')
      .replace(/İ/g, 'I')
      .replace(/Ğ/g, 'G')
      .replace(/Ü/g, 'U')
      .replace(/Ş/g, 'S')
      .replace(/Ö/g, 'O')
      .replace(/Ç/g, 'C')
      .toUpperCase() // ESP32 ile eşleştirmede hata riskini minimuma indirmek için tamamen büyültebiliriz
  }

  // Yeni Tekne (Sistem) Kurulum İşlemi
  const handleRegisterBoat = async (e: React.FormEvent) => {
    e.preventDefault()
    setClaimError("")

    if (!boatNameInput || boatNameInput.trim().length < 3) {
      setClaimError("Lütfen teknenizin adını en az 3 karakter olacak şekilde girin.")
      return
    }

    // İsmi standartlaştıralım 
    // (Böylece kullanıcı telefondan 'Yakamoz' yazsa bile sistem kolayca eşleşir)
    const normalizedName = normalizeString(boatNameInput)

    // Sadece adı ve user_id'si ile oluştur
    const { error: insertError } = await supabase
      .from('boats')
      .insert({
        name: normalizedName,
        user_id: session.user.id,
        device_secret: normalizedName // Artık secret ve id aynı şey oldu.
      })

    if (insertError) {
      setClaimError("Tekne adı kaydedilirken bir hata oluştu: " + insertError.message)
      return
    }

    // 3. Başarılı kayıt: Sayfayı yenile veya fetchBoat mantığını tekrar çağır
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
              Sisteme Hoş Geldiniz
            </h1>
            <p className="text-gray-400 mt-2 text-sm">
              Takibini yapmak istediğiniz teknenin adını aşağıya girin. (Örn: YAKAMOZ) <br /><br />
              <strong className="text-yellow-400">ÖNEMLI:</strong> Bu adı, ESP32 cihazınızı Wi-Fi uzerinden ayarlarken <strong>Boat ID</strong> alanına birebir aynı yazmalısınız.
            </p>
          </div>

          <form onSubmit={handleRegisterBoat} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Tekne Adı (Boat Name)
              </label>
              <input
                type="text"
                value={boatNameInput}
                onChange={(e) => setBoatNameInput(e.target.value)}
                placeholder="Örn: YAKAMOZ"
                className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-white placeholder-gray-500 uppercase"
              />
            </div>
            {claimError && <div className="text-red-400 text-sm text-center">{claimError}</div>}
            <button
              type="submit"
              className="w-full py-3 px-4 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white font-semibold rounded-lg shadow-lg transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-900"
            >
              Kaydet ve Başla
            </button>
          </form>
        </div>
      </div>
    )
  }

  // Hata yakalama için basit bir kontrol (Normalde ErrorBoundary kullanılır)
  try {
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
              onClick={() => supabase.auth.signOut()}
              className="p-2 hover:bg-gray-800 rounded-lg text-gray-400 hover:text-white transition-colors"
              title="Çıkış Yap"
            >
              <LogOut size={20} />
            </button>
          </div>
        </header>

        <main className="max-w-7xl mx-auto space-y-8">
          {/* Üst Kısım: Akış Şeması */}
          <section>
            <SystemFlow
              pvPower={dashboardData.pvPower}
              batteryPower={dashboardData.batteryPower}
              loadPower={dashboardData.loadPower}
              batterySoc={dashboardData.soc}
            />
          </section>

          {/* Orta Kısım: İstatistik Kartları */}
          <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard
              title="Akü Voltajı"
              value={dashboardData.voltage.toFixed(1)}
              unit="V"
              color="blue"
              icon={<Battery className="text-blue-400" size={20} />}
            />
            <StatCard
              title="Solar Güç"
              value={dashboardData.pvPower.toFixed(0)}
              unit="W"
              color="yellow"
              icon={<Sun className="text-yellow-400" size={20} />}
            />
            <StatCard
              title="Yük Tüketimi"
              value={dashboardData.loadPower.toFixed(0)}
              unit="W"
              color="red"
              icon={<Zap className="text-red-400" size={20} />}
            />
            <StatCard
              title="Kalan Süre"
              value={dashboardData.remaining === 0 ? '--' : `${Math.floor(dashboardData.remaining / 60)}s ${dashboardData.remaining % 60}d`}
              unit=""
              color="green"
              icon={<Clock className="text-green-400" size={20} />}
            />
          </section>

          {/* Alt Kısım: Grafikler */}
          <section>
            <HistoryCharts data={historyData} />
          </section>

          {/* Cihaz Detayları */}
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
  } catch (err) {
    return <div className="p-4 text-red-500">Bir hata oluştu: {String(err)}</div>
  }
}

export default App
