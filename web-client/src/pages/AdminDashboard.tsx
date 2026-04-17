import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { LogOut, Users, Anchor } from 'lucide-react'

export default function AdminDashboard() {
  const [, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(true)
  const [users, setUsers] = useState<any[]>([])
  const [boats, setBoats] = useState<any[]>([])
  const navigate = useNavigate()

  useEffect(() => {
    checkAdminStatus()
  }, [])

  const checkAdminStatus = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      navigate('/')
      return
    }

    // Kullanıcı profilinden rolü kontrol et
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', session.user.id)
      .single()

    if (error || profile?.role !== 'admin') {
      // Admin değilse anasayfaya at
      alert('Bu sayfayı görüntüleme yetkiniz yok.')
      navigate('/')
      return
    }

    setIsAdmin(true)
    fetchData()
  }

  const fetchData = async () => {
    // Tüm profilleri çek (Bunu zaten çekebiliyor olmanız lazım, eğer RLS engellemiyorsa)
    const { data: profilesData } = await supabase.from('profiles').select('*').order('created_at', { ascending: false })
    
    // Tekneleri güvenli RPC üzerinden çek (RLS'yi by-pass eden admin fonksiyonu)
    const { data: boatsData, error: rpcError } = await supabase.rpc('get_all_boats_for_admin')
    
    if (rpcError) {
      console.error("Admin yetkisiyle tekneler çekilemedi. SQL fonksiyonu eklenmemiş olabilir.", rpcError)
      // Fallback (Eğer RPC yoksa düz tablodan çekmeyi dene)
      const { data: fallbackBoats } = await supabase.from('boats').select('*, profiles(email, full_name)').order('created_at', { ascending: false })
      if (fallbackBoats) setBoats(fallbackBoats)
    } else if (boatsData) {
      // RPC'den gelen veriyi React state'ine uygun formata dönüştür
      const formattedBoats = boatsData.map((b: any) => ({
        ...b,
        profiles: {
          full_name: b.owner_name,
          email: b.owner_email
        }
      }))
      setBoats(formattedBoats)
    }
    
    if (profilesData) setUsers(profilesData)
    
    setLoading(false)
  }

  if (loading) return <div className="min-h-screen bg-gray-900 flex items-center justify-center text-white">Yükleniyor...</div>

  return (
    <div className="min-h-screen bg-gray-900 text-white p-6">
      <div className="max-w-7xl mx-auto">
        <header className="flex justify-between items-center mb-8 border-b border-gray-800 pb-4">
          <div className="flex items-center gap-3">
            <Anchor className="text-blue-500 w-8 h-8" />
            <h1 className="text-2xl font-bold">Admin Paneli</h1>
          </div>
          <div className="flex gap-4">
            <button 
              onClick={() => navigate('/')}
              className="px-4 py-2 bg-gray-800 rounded-lg hover:bg-gray-700 transition"
            >
              Müşteri Ekranına Dön
            </button>
            <button 
              onClick={() => supabase.auth.signOut().then(() => navigate('/'))}
              className="flex items-center gap-2 px-4 py-2 bg-red-600/20 text-red-500 rounded-lg hover:bg-red-600/30 transition"
            >
              <LogOut className="w-4 h-4" /> Çıkış
            </button>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Tekneler (Cihazlar) Listesi */}
          <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
            <div className="flex items-center gap-2 mb-6">
              <Anchor className="text-cyan-400" />
              <h2 className="text-xl font-semibold">Kayıtlı Cihazlar / Tekneler</h2>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left text-gray-400">
                <thead className="text-xs text-gray-500 uppercase bg-gray-700/50">
                  <tr>
                    <th className="px-4 py-3">Tekne Adı</th>
                    <th className="px-4 py-3">Sahibi</th>
                    <th className="px-4 py-3">Device Secret</th>
                  </tr>
                </thead>
                <tbody>
                  {boats.map(boat => (
                    <tr key={boat.id} className="border-b border-gray-700">
                      <td className="px-4 py-3 text-white font-medium">{boat.name}</td>
                      <td className="px-4 py-3">{boat.profiles?.full_name || boat.profiles?.email || 'Bilinmiyor'}</td>
                      <td className="px-4 py-3 font-mono text-xs text-yellow-400 bg-gray-900/50 rounded">{boat.device_secret}</td>
                    </tr>
                  ))}
                  {boats.length === 0 && (
                    <tr><td colSpan={3} className="px-4 py-4 text-center">Henüz cihaz yok</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Kullanıcılar Listesi */}
          <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
            <div className="flex items-center gap-2 mb-6">
              <Users className="text-purple-400" />
              <h2 className="text-xl font-semibold">Sistem Kullanıcıları</h2>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left text-gray-400">
                <thead className="text-xs text-gray-500 uppercase bg-gray-700/50">
                  <tr>
                    <th className="px-4 py-3">İsim</th>
                    <th className="px-4 py-3">E-posta</th>
                    <th className="px-4 py-3">Rol</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map(user => (
                    <tr key={user.id} className="border-b border-gray-700">
                      <td className="px-4 py-3 text-white">{user.full_name || '-'}</td>
                      <td className="px-4 py-3">{user.email}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded text-xs ${user.role === 'admin' ? 'bg-red-500/20 text-red-400' : 'bg-blue-500/20 text-blue-400'}`}>
                          {user.role}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}
