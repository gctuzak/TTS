import { useState } from 'react'
import { supabase } from '../lib/supabase'
import QRCode from 'react-qr-code'
import { Plus, QrCode, Smartphone, Copy, Check, ArrowRight, Loader2 } from 'lucide-react'

interface DeviceOnboardingProps {
  onComplete: () => void
}

export const DeviceOnboarding: React.FC<DeviceOnboardingProps> = ({ onComplete }) => {
  const [mode, setMode] = useState<'select' | 'create' | 'claim'>('select')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Create Mode States
  const [newBoatName, setNewBoatName] = useState('')
  const [createdCredentials, setCreatedCredentials] = useState<{id: string, secret: string} | null>(null)

  // Claim Mode States
  const [claimId, setClaimId] = useState('')
  const [claimSecret, setClaimSecret] = useState('')

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Kullanıcı bulunamadı')

      // 1. Generate a secret (simple random string)
      const secret = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)

      // 2. Insert into DB
      const { data, error } = await supabase
        .from('boats')
        .insert({
          name: newBoatName,
          user_id: user.id,
          device_secret: secret
        })
        .select()
        .single()

      if (error) throw error

      setCreatedCredentials({
        id: data.id,
        secret: secret
      })
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleClaim = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      // RPC call to claim_boat
      // Note: This requires the database function to be set up and user_id to be nullable
      const { data, error } = await supabase.rpc('claim_boat', {
        boat_id: claimId,
        secret: claimSecret
      })

      if (error) throw error

      if (data === true) {
        onComplete() // Refresh parent
      } else {
        throw new Error('Cihaz bulunamadı veya zaten sahipli. Bilgileri kontrol edin.')
      }
    } catch (err: any) {
      // Fallback: If RPC fails or doesn't exist, maybe we can just try to fetch it?
      // But if it belongs to another user (or null), RLS might block SELECT.
      // So RPC is the only way for "Claiming" an unowned row securely.
      setError(err.message || 'Eşleştirme başarısız')
    } finally {
      setLoading(false)
    }
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
  }

  if (mode === 'select') {
    return (
      <div className="flex flex-col gap-4 max-w-md w-full mx-auto">
        <h2 className="text-2xl font-bold text-center mb-4">Cihaz Ekleme Yöntemi</h2>
        
        <button
          onClick={() => setMode('create')}
          className="flex items-center gap-4 p-6 bg-blue-600/20 border border-blue-500/30 rounded-xl hover:bg-blue-600/30 transition-all group"
        >
          <div className="p-3 bg-blue-500 rounded-lg text-white group-hover:scale-110 transition-transform">
            <Plus size={24} />
          </div>
          <div className="text-left">
            <h3 className="font-semibold text-lg text-blue-100">Yeni Cihaz Oluştur</h3>
            <p className="text-sm text-blue-200/60">Sıfırdan kurulum yapıyorsanız</p>
          </div>
          <ArrowRight className="ml-auto opacity-50 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
        </button>

        <button
          onClick={() => setMode('claim')}
          className="flex items-center gap-4 p-6 bg-emerald-600/20 border border-emerald-500/30 rounded-xl hover:bg-emerald-600/30 transition-all group"
        >
          <div className="p-3 bg-emerald-500 rounded-lg text-white group-hover:scale-110 transition-transform">
            <QrCode size={24} />
          </div>
          <div className="text-left">
            <h3 className="font-semibold text-lg text-emerald-100">Mevcut Cihazı Ekle</h3>
            <p className="text-sm text-emerald-200/60">ID veya QR Kod ile</p>
          </div>
          <ArrowRight className="ml-auto opacity-50 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
        </button>
      </div>
    )
  }

  if (mode === 'create') {
    return (
      <div className="max-w-md w-full mx-auto bg-gray-900 p-6 rounded-2xl border border-gray-800">
        <button onClick={() => setMode('select')} className="text-sm text-gray-500 hover:text-white mb-4">
          ← Geri Dön
        </button>
        
        {!createdCredentials ? (
          <form onSubmit={handleCreate} className="space-y-4">
            <h2 className="text-xl font-bold">Yeni Tekne Oluştur</h2>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Tekne Adı</label>
              <input
                type="text"
                value={newBoatName}
                onChange={e => setNewBoatName(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-white focus:border-blue-500 outline-none"
                placeholder="Örn: Mavi Yolculuk"
                required
              />
            </div>
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-500 text-white p-3 rounded-lg font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? <Loader2 className="animate-spin" /> : 'Oluştur ve Bilgileri Al'}
            </button>
          </form>
        ) : (
          <div className="space-y-6">
            <div className="text-center">
              <div className="mx-auto bg-white p-4 rounded-xl w-fit mb-4">
                <QRCode 
                  value={JSON.stringify(createdCredentials)} 
                  size={180}
                />
              </div>
              <p className="text-sm text-gray-400">
                Bu QR kodu ESP32 cihazınıza okutun veya aşağıdaki bilgileri girin.
              </p>
            </div>

            <div className="space-y-3 bg-gray-800/50 p-4 rounded-xl border border-gray-700">
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-xs text-gray-500 uppercase">Boat ID</p>
                  <p className="font-mono text-sm text-blue-300">{createdCredentials.id}</p>
                </div>
                <button onClick={() => copyToClipboard(createdCredentials.id)} className="p-2 hover:bg-gray-700 rounded-lg">
                  <Copy size={16} />
                </button>
              </div>
              <div className="h-px bg-gray-700" />
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-xs text-gray-500 uppercase">Device Secret</p>
                  <p className="font-mono text-sm text-emerald-300">{createdCredentials.secret}</p>
                </div>
                <button onClick={() => copyToClipboard(createdCredentials.secret)} className="p-2 hover:bg-gray-700 rounded-lg">
                  <Copy size={16} />
                </button>
              </div>
            </div>

            <button
              onClick={onComplete}
              className="w-full bg-green-600 hover:bg-green-500 text-white p-3 rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
            >
              <Check size={20} />
              Tamamladım, Panele Git
            </button>
          </div>
        )}
      </div>
    )
  }

  if (mode === 'claim') {
    return (
      <div className="max-w-md w-full mx-auto bg-gray-900 p-6 rounded-2xl border border-gray-800">
        <button onClick={() => setMode('select')} className="text-sm text-gray-500 hover:text-white mb-4">
          ← Geri Dön
        </button>

        <form onSubmit={handleClaim} className="space-y-4">
          <h2 className="text-xl font-bold">Mevcut Cihazı Ekle</h2>
          <p className="text-sm text-gray-400">
            Cihazınızın üzerindeki etikette veya ekranında yazan ID ve Secret bilgilerini girin.
          </p>

          <div>
            <label className="block text-sm text-gray-400 mb-1">Boat ID</label>
            <input
              type="text"
              value={claimId}
              onChange={e => setClaimId(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-white focus:border-emerald-500 outline-none font-mono"
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              required
            />
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">Device Secret</label>
            <input
              type="text"
              value={claimSecret}
              onChange={e => setClaimSecret(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-white focus:border-emerald-500 outline-none font-mono"
              placeholder="Gizli Anahtar"
              required
            />
          </div>

          {error && <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-400 text-sm rounded-lg">{error}</div>}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-emerald-600 hover:bg-emerald-500 text-white p-3 rounded-lg font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 className="animate-spin" /> : 'Cihazı Eşleştir'}
          </button>
        </form>
      </div>
    )
  }

  return null
}
