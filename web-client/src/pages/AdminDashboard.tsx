import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { LogOut, Users, Anchor } from 'lucide-react'

type ProfileRow = {
  id: string
  email: string | null
  full_name: string | null
  role: string | null
  created_at?: string
}

type BoatRow = {
  id: string
  name: string
  device_secret: string
  profiles?: {
    full_name: string | null
    email: string | null
  }
}

export default function AdminDashboard() {
  const [, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(true)
  const [users, setUsers] = useState<ProfileRow[]>([])
  const [boats, setBoats] = useState<BoatRow[]>([])
  const navigate = useNavigate()

  useEffect(() => {
    let mounted = true
    const run = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        if (mounted) navigate('/')
        return
      }

      const { data: profile, error } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', session.user.id)
        .single()

      if (error || profile?.role !== 'admin') {
        alert('Bu sayfayı görüntüleme yetkiniz yok.')
        if (mounted) navigate('/')
        return
      }

      if (mounted) setIsAdmin(true)

      const { data: profilesData } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false })

      if (profilesData && mounted) setUsers(profilesData as ProfileRow[])

      const { data: boatsData, error: rpcError } = await supabase.rpc('get_all_boats_for_admin')
      if (rpcError) {
        const { data: fallbackBoats } = await supabase
          .from('boats')
          .select('id, name, device_secret, profiles(email, full_name)')
          .order('created_at', { ascending: false })

        if (fallbackBoats && mounted) {
          const formatted: BoatRow[] = (fallbackBoats as Record<string, unknown>[]).map((b) => {
            const id = typeof b.id === 'string' ? b.id : ''
            const name = typeof b.name === 'string' ? b.name : ''
            const device_secret = typeof b.device_secret === 'string' ? b.device_secret : ''
            const profilesRaw = (b as { profiles?: unknown }).profiles
            const profile0 =
              Array.isArray(profilesRaw) ? profilesRaw[0] :
              (profilesRaw && typeof profilesRaw === 'object' ? profilesRaw : null)
            const full_name = profile0 && typeof profile0 === 'object' && 'full_name' in profile0 ? (profile0 as { full_name?: unknown }).full_name : null
            const email = profile0 && typeof profile0 === 'object' && 'email' in profile0 ? (profile0 as { email?: unknown }).email : null
            return {
              id,
              name,
              device_secret,
              profiles: {
                full_name: typeof full_name === 'string' ? full_name : null,
                email: typeof email === 'string' ? email : null,
              },
            }
          })
          setBoats(formatted)
        }
      } else if (boatsData) {
        const formatted: BoatRow[] = (boatsData as Record<string, unknown>[]).map((b) => {
          const id = typeof b.id === 'string' ? b.id : ''
          const name = typeof b.name === 'string' ? b.name : ''
          const device_secret = typeof b.device_secret === 'string' ? b.device_secret : ''
          const ownerName = typeof b.owner_name === 'string' ? b.owner_name : null
          const ownerEmail = typeof b.owner_email === 'string' ? b.owner_email : null
          return {
            id,
            name,
            device_secret,
            profiles: { full_name: ownerName, email: ownerEmail },
          }
        })
        if (mounted) setBoats(formatted)
      }

      if (mounted) setLoading(false)
    }

    void run()
    return () => {
      mounted = false
    }
  }, [navigate])

  if (loading) return <div className="min-h-screen bg-white dark:bg-gray-900 flex items-center justify-center text-slate-900 dark:text-white">Yükleniyor...</div>

  return (
    <div className="min-h-screen bg-white dark:bg-gray-900 text-slate-900 dark:text-white p-6">
      <div className="max-w-7xl mx-auto">
        <header className="flex justify-between items-center mb-8 border-b border-gray-200 dark:border-gray-800 pb-4">
          <div className="flex items-center gap-3">
            <Anchor className="text-blue-500 w-8 h-8" />
            <h1 className="text-2xl font-bold">Admin Paneli</h1>
          </div>
          <div className="flex gap-4">
            <button 
              onClick={() => navigate('/')}
              className="px-4 py-2 bg-gray-100 dark:bg-gray-800 rounded-lg hover:bg-gray-700 transition"
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
          <div className="bg-gray-100 dark:bg-gray-800 rounded-xl p-6 border border-gray-300 dark:border-gray-700">
            <div className="flex items-center gap-2 mb-6">
              <Anchor className="text-cyan-400" />
              <h2 className="text-xl font-semibold">Kayıtlı Cihazlar / Tekneler</h2>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left text-gray-600 dark:text-gray-400">
                <thead className="text-xs text-gray-500 dark:text-gray-500 uppercase bg-gray-700/50">
                  <tr>
                    <th className="px-4 py-3">Tekne Adı</th>
                    <th className="px-4 py-3">Sahibi</th>
                    <th className="px-4 py-3">Device Secret</th>
                  </tr>
                </thead>
                <tbody>
                  {boats.map(boat => (
                    <tr key={boat.id} className="border-b border-gray-300 dark:border-gray-700">
                      <td className="px-4 py-3 text-slate-900 dark:text-white font-medium">{boat.name}</td>
                      <td className="px-4 py-3">{boat.profiles?.full_name || boat.profiles?.email || 'Bilinmiyor'}</td>
                      <td className="px-4 py-3 font-mono text-xs text-yellow-400 bg-white dark:bg-gray-900/50 rounded">{boat.device_secret}</td>
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
          <div className="bg-gray-100 dark:bg-gray-800 rounded-xl p-6 border border-gray-300 dark:border-gray-700">
            <div className="flex items-center gap-2 mb-6">
              <Users className="text-purple-400" />
              <h2 className="text-xl font-semibold">Sistem Kullanıcıları</h2>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left text-gray-600 dark:text-gray-400">
                <thead className="text-xs text-gray-500 dark:text-gray-500 uppercase bg-gray-700/50">
                  <tr>
                    <th className="px-4 py-3">İsim</th>
                    <th className="px-4 py-3">E-posta</th>
                    <th className="px-4 py-3">Rol</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map(user => (
                    <tr key={user.id} className="border-b border-gray-300 dark:border-gray-700">
                      <td className="px-4 py-3 text-slate-900 dark:text-white">{user.full_name || '-'}</td>
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
