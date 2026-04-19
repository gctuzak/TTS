import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { ESPLoader, Transport } from 'esptool-js'
import { ArrowLeft, Usb, DownloadCloud, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react'

export default function UpdateDevice() {
  const [status, setStatus] = useState<'idle' | 'connecting' | 'flashing' | 'success' | 'error'>('idle')
  const [progress, setProgress] = useState(0)
  const [logs, setLogs] = useState<string[]>([])
  const navigate = useNavigate()
  const getErrorMessage = (err: unknown) => {
    if (err && typeof err === 'object' && 'message' in err) {
      const msg = (err as { message?: unknown }).message
      if (typeof msg === 'string') return msg
    }
    return String(err ?? 'Bilinmeyen hata')
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        navigate('/')
      }
    })
  }, [navigate])

  const logMsg = (msg: string) => {
    console.log(msg)
    setLogs(prev => [...prev, msg].slice(-10)) // Son 10 logu tut
  }

  const handleFlash = async () => {
    try {
      setStatus('connecting')
      setProgress(0)
      setLogs([])
      logMsg('Tarayıcı üzerinden USB portu isteniyor...')

      // Web Serial API Kontrolü
      if (!navigator.serial) {
        throw new Error('Tarayıcınız Web Serial API desteklemiyor. Lütfen Google Chrome veya Edge kullanın.')
      }

      // Port seçimi
      const port = await navigator.serial.requestPort()
      const transport = new Transport(port, true) // verbose: true

      const flashOptions = {
        transport,
        baudrate: 115200,
        terminal: {
          clean: () => {},
          writeLine: (data: string) => logMsg(data),
          write: (data: string) => logMsg(data),
        }
      }

      logMsg('Cihaza bağlanılıyor...')
      const loader = new ESPLoader(flashOptions)
      await loader.main()
      
      setStatus('flashing')
      logMsg('Bağlantı başarılı!')

      logMsg('Güncel firmware dosyaları indiriliyor...')
      
      try {
        const fetchBin = async (url: string, name: string) => {
          const res = await fetch(url)
          if (!res.ok) throw new Error(`${name} bulunamadı (HTTP ${res.status})`)
          
          // Vite dev server dosyayı bulamazsa index.html döner. Bunu yakalayalım:
          const contentType = res.headers.get('content-type')
          if (contentType && contentType.includes('text/html')) {
            throw new Error(`${name} eksik! Dosyayı public/firmware klasörüne kopyalamayı unutmuş olabilirsiniz.`)
          }
          return await res.arrayBuffer()
        }

        const bootloader = await fetchBin('/firmware/bootloader.bin', 'Bootloader')
        const partitions = await fetchBin('/firmware/partitions.bin', 'Partitions')
        const firmware = await fetchBin('/firmware/firmware.bin', 'Firmware')
        
        const fileArray = [
          { data: new Uint8Array(bootloader), address: 0x1000 },
          { data: new Uint8Array(partitions), address: 0x8000 },
          { data: new Uint8Array(firmware), address: 0x10000 },
        ]
        
        logMsg('Flash moduna geçiliyor...')
        await loader.writeFlash({
          fileArray: fileArray,
          flashSize: 'keep',
          flashMode: 'keep', // 'dout' yerine 'keep' deneyelim (cihazın varsayılanına bıraksın)
          flashFreq: 'keep', // '40m' yerine 'keep' deneyelim
          eraseAll: false, // Sadece yazılan bölgeleri sil
          compress: true,
          reportProgress: (fileIndex: number, written: number, total: number) => {
            setProgress(Math.round((written / total) * 100))
            if (written === total) logMsg(`Dosya ${fileIndex + 1}/3 başarıyla yazıldı.`)
          }
        })
      } catch (err: unknown) {
        throw new Error('Firmware dosyaları eksik. Lütfen sistem yöneticisi ile görüşün. (' + getErrorMessage(err) + ')')
      }

      logMsg('Yazılım başarıyla atıldı! Lütfen cihazı manuel olarak resetleyin (USB kablosunu tak-çıkar yapabilirsiniz).')
        
      try {
        const maybeLoader = loader as unknown as { hardReset?: () => Promise<void> | void }
        if (typeof maybeLoader.hardReset === 'function') await maybeLoader.hardReset()
      } catch {
        logMsg('Cihaz reset komutu desteklenmiyor, manuel reset gerekli olabilir.')
      }
      
      await transport.disconnect()
      setStatus('success')

    } catch (err: unknown) {
      logMsg('HATA: ' + getErrorMessage(err))
      setStatus('error')
    }
  }

  return (
    <div className="min-h-screen bg-white dark:bg-gray-900 text-slate-900 dark:text-white p-6">
      <div className="max-w-2xl mx-auto mt-12">
        
        <button 
          onClick={() => navigate('/')}
          className="flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-slate-900 dark:text-white mb-8 transition"
        >
          <ArrowLeft className="w-5 h-5" /> Anasayfaya Dön
        </button>

        <div className="bg-gray-100 dark:bg-gray-800 rounded-2xl border border-gray-300 dark:border-gray-700 p-8 text-center shadow-xl">
          <div className="w-20 h-20 bg-blue-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
            <Usb className="w-10 h-10 text-blue-400" />
          </div>
          
          <h1 className="text-3xl font-bold mb-4">Cihaz Yazılımı Güncelleme</h1>
          <p className="text-gray-600 dark:text-gray-400 mb-8 max-w-md mx-auto">
            Cihazınızı USB Type-C kablosu ile bilgisayarınıza bağlayın. İşlem sırasında kabloyu kesinlikle çıkarmayın. Bu özellik sadece Google Chrome ve Microsoft Edge tarayıcılarında çalışır.
          </p>

          {status === 'idle' || status === 'error' ? (
            <button 
              onClick={handleFlash}
              className="w-full sm:w-auto px-8 py-4 bg-blue-600 hover:bg-blue-500 text-slate-900 dark:text-white rounded-xl font-semibold text-lg transition flex items-center justify-center gap-3 mx-auto"
            >
              <DownloadCloud className="w-6 h-6" />
              Cihazı Güncelle
            </button>
          ) : status === 'success' ? (
            <div className="bg-green-500/20 border border-green-500/50 rounded-xl p-6 mb-6 text-green-400">
              <CheckCircle2 className="w-12 h-12 mx-auto mb-4" />
              <h3 className="text-xl font-bold mb-2">Güncelleme Başarılı!</h3>
              <p>Cihazınız başarıyla güncellendi. Artık kabloyu çıkarıp teknenize bağlayabilirsiniz.</p>
            </div>
          ) : (
            <div className="bg-white dark:bg-gray-900 rounded-xl p-6 border border-gray-300 dark:border-gray-700 mb-6">
              <Loader2 className="w-10 h-10 text-blue-500 animate-spin mx-auto mb-4" />
              <h3 className="text-lg font-medium mb-4">
                {status === 'connecting' ? 'Cihaza Bağlanılıyor...' : 'Yazılım Atılıyor...'}
              </h3>
              
              <div className="w-full bg-gray-100 dark:bg-gray-800 rounded-full h-4 mb-2 overflow-hidden border border-gray-300 dark:border-gray-700">
                <div className="bg-blue-500 h-4 rounded-full transition-all duration-300" style={{ width: `${progress}%` }}></div>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400 text-right">{progress}%</p>
            </div>
          )}

          {/* Terminal Logs */}
          <div className="mt-8 text-left bg-black/50 p-4 rounded-lg border border-gray-200 dark:border-gray-800 font-mono text-xs text-gray-600 dark:text-gray-400 h-48 overflow-y-auto">
            {logs.length === 0 ? (
              <span className="text-gray-600">Sistem logları burada görünecektir...</span>
            ) : (
              logs.map((log, i) => (
                <div key={i} className="mb-1">{log}</div>
              ))
            )}
          </div>

          {status === 'error' && (
            <div className="mt-4 flex items-center gap-2 text-red-400 text-sm justify-center bg-red-500/10 p-3 rounded-lg border border-red-500/20">
              <AlertTriangle className="w-5 h-5 flex-shrink-0" />
              <span>Bağlantı hatası oluştu. Lütfen kablonun takılı olduğundan ve başka bir programın (örn. Arduino IDE) portu kullanmadığından emin olun.</span>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
