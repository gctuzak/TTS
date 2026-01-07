import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useNavigate } from 'react-router-dom'

export default function Dashboard() {
  const [boats, setBoats] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    fetchBoats()
  }, [])

  async function fetchBoats() {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        navigate('/login')
        return
      }

      const { data, error } = await supabase
        .from('boats')
        .select('*')
      
      if (error) throw error
      setBoats(data || [])
    } catch (error) {
      console.error('Hata:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) return <div className="p-8 text-center">Yükleniyor...</div>

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <header className="flex justify-between items-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Teknelerim</h1>
          <button 
            onClick={() => supabase.auth.signOut().then(() => navigate('/login'))}
            className="text-sm text-red-600 hover:text-red-800"
          >
            Çıkış Yap
          </button>
        </header>

        {boats.length === 0 ? (
          <div className="bg-white p-6 rounded-lg shadow text-center">
            <p className="text-gray-500">Henüz kayıtlı bir tekneniz yok.</p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {boats.map((boat) => (
              <div key={boat.id} className="bg-white p-6 rounded-lg shadow hover:shadow-md transition cursor-pointer">
                <h3 className="text-lg font-semibold text-gray-800">{boat.name}</h3>
                <p className="text-sm text-gray-500 mt-1">ID: {boat.id}</p>
                <div className="mt-4 flex items-center text-blue-600 text-sm font-medium">
                  Detayları Gör &rarr;
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
