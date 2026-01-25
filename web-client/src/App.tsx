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
}

interface Boat {
  id: string
  name: string
}

function App() {
  const [session, setSession] = useState<any>(null)
  const [boat, setBoat] = useState<Boat | null>(null)
  const [loading, setLoading] = useState(true)
  
  // Cihaz bazlı son verileri tutan map: mac_address -> TelemetryRow
  const [deviceMap, setDeviceMap] = useState<Record<string, TelemetryRow>>({})
  
  // Geçmiş verileri (Grafik için)
  const [historyData, setHistoryData] = useState<any[]>([])

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
      return
    }

    const fetchBoat = async () => {
      // En son eklenen tekneyi al (Varsa Euphoria veya kullanıcının oluşturduğu son tekne)
      let { data, error } = await supabase
        .from('boats')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (error) {
        console.error('Tekne verisi çekilemedi:', error)
      }

      // Eğer hiç tekne yoksa, otomatik oluştur
      if (!data) {
        console.log("Hiç tekne bulunamadı, varsayılan tekne oluşturuluyor...")
        const { data: newBoat, error: createError } = await supabase
          .from('boats')
          .insert({
             name: 'Euphoria', // Firmware ile eşleşmesi için
             user_id: session.user.id, // Sahip olarak mevcut kullanıcıyı ata
             device_secret: 'default-secret' // Basit bir secret
          })
          .select()
          .single()
        
        if (createError) {
             console.error("Otomatik tekne oluşturma hatası:", createError)
        } else {
             data = newBoat
        }
      }

      if (data) {
        setBoat(data)
        
        // İlk veri yüklemesi (Son durum)
        const { data: initialData } = await supabase
          .from('telemetry')
          .select('*')
          .eq('boat_id', data.id)
          .order('created_at', { ascending: false })
          .limit(50)

        if (initialData) {
          const map: Record<string, TelemetryRow> = {}
          // Eskiden yeniye işleyerek son durumu bul
          initialData.reverse().forEach(row => {
            if (row.mac_address) {
              map[row.mac_address] = row
            }
          })
          setDeviceMap(map)
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
                  [newRow.mac_address]: newRow
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

  if (loading) {
    return <div className="min-h-screen bg-gray-950 flex items-center justify-center text-white">Yükleniyor...</div>
  }

  if (!session) {
    return <Auth />
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
              {Object.values(deviceMap).map((device) => (
                <DeviceDetail 
                  key={device.mac_address} 
                  device={device} 
                  name={device.device_type === 1 ? 'Solar Charger' : (device.device_type === 2 ? 'Battery Monitor' : device.mac_address || 'Cihaz')} 
                />
              ))}
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
