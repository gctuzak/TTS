import React from 'react'; 
import { Sun, Zap, Activity, Clock } from 'lucide-react'; 

export interface DashboardProps { 
  pvPower: number;      // Örn: 240 (Watt) 
  batteryPower: number; // Örn: -120 (Watt. Negatif: Deşarj, Pozitif: Şarj) 
  loadPower: number;    // Örn: 360 (Watt) 
  voltage: number;      // Örn: 13.2 (Volt) 
  soc: number;          // Örn: 85.5 (%) 
  remaining: number;    // Örn: 1250 (Dakika) 
} 

// Enerji akışını çizen ve canlandıran alt bileşen 
const FlowLine = ({ x1, y1, x2, y2, power, color }: any) => { 
  const isFlowing = power !== 0; 
  // Güç pozitifse düz (normal), negatifse ters (reverse) yönde akar 
  const direction = power > 0 ? 1 : -1; 
  // Animasyon hızı güce bağlıdır (Güç arttıkça süre kısalır, noktalar hızlanır) 
  const duration = isFlowing ? Math.max(0.3, 150 / (Math.abs(power) + 20)) : 0; 

  return ( 
    <g> 
      {/* Arka plan sabit çizgi */} 
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#334155" strokeWidth="4" strokeLinecap="round" /> 
      
      {/* Akan noktalar */} 
      {isFlowing ? ( 
        <line 
          x1={x1} 
          y1={y1} 
          x2={x2} 
          y2={y2} 
          stroke={color} 
          strokeWidth="4" 
          strokeLinecap="round" 
          strokeDasharray="8 8" 
          style={{ 
            animation: `dash-flow ${duration}s linear infinite ${direction === -1 ? 'reverse' : 'normal'}` 
          }} 
        /> 
      ) : ( 
        // Güç 0 ise noktalar hareketsiz durur ve rengi kararır 
        <line 
          x1={x1} 
          y1={y1} 
          x2={x2} 
          y2={y2} 
          stroke="#475569" 
          strokeWidth="4" 
          strokeLinecap="round" 
          strokeDasharray="8 8" 
        /> 
      )} 
    </g> 
  ); 
}; 

// Alt kısımdaki istatistik kartları için alt bileşen 
const StatCard = ({ title, value, icon, valueColor = "text-white" }: any) => ( 
  <div className="flex items-center p-3 sm:p-4 bg-slate-800 border border-slate-700 rounded-xl shadow-sm hover:bg-slate-700/50 transition-colors"> 
    <div className="flex shrink-0 items-center justify-center w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-slate-900/80 mr-3 sm:mr-4 border border-slate-700"> 
      {icon} 
    </div> 
    <div className="overflow-hidden"> 
      <p className="text-[10px] sm:text-xs text-slate-400 font-medium mb-0.5 truncate">{title}</p> 
      <p className={`text-base sm:text-lg font-bold truncate ${valueColor}`}>{value}</p> 
    </div> 
  </div> 
); 

// Dakika cinsinden süreyi okunabilir formata çeviren yardımcı fonksiyon 
const formatTime = (minutes: number) => { 
  if (minutes <= 0 || !isFinite(minutes)) return "--"; 
  if (minutes > 9999) return "Sınırsız"; 
  
  const d = Math.floor(minutes / (24 * 60)); 
  const h = Math.floor((minutes % (24 * 60)) / 60); 
  const m = Math.floor(minutes % 60); 

  if (d > 0) return `${d}g ${h}sa`; 
  if (h > 0) return `${h}sa ${m}dk`; 
  return `${m} dk`; 
}; 

export const SystemFlow: React.FC<DashboardProps> = ({ 
  pvPower = 0, 
  batteryPower = 0, 
  loadPower = 0, 
  voltage = 0, 
  soc = 0, 
  remaining = 0, 
}) => { 
  // Undefined/null değerler için güvenli fallback
  const safePvPower = Number(pvPower) || 0;
  const safeBatteryPower = Number(batteryPower) || 0;
  const safeLoadPower = Number(loadPower) || 0;
  const safeVoltage = Number(voltage) || 0;
  const safeSoc = Number(soc) || 0;
  const safeRemaining = Number(remaining) || 0;
  const batteryStatusLabel =
    safeLoadPower > safePvPower ? 'Deşarj Oluyor' : safeLoadPower < safePvPower ? 'Şarj Oluyor' : 'Beklemede';

  return ( 
    <div className="w-full max-w-4xl mx-auto p-4 sm:p-6 bg-slate-900 rounded-2xl text-white shadow-2xl border border-slate-800 font-sans"> 
      {/* Animasyon Keyframes Tanımı */} 
      <style>{` 
        @keyframes dash-flow { 
          from { stroke-dashoffset: 16; } 
          to { stroke-dashoffset: 0; } 
        } 
      `}</style> 

      {/* --- ÜST KISIM: Başlık ve Durum --- */} 
      <div className="flex justify-between items-center mb-6 sm:mb-8 pb-4 border-b border-slate-800"> 
        <div className="flex items-center space-x-3"> 
          <h1 className="text-xl sm:text-2xl font-bold tracking-wider text-slate-100">CERBO GX</h1> 
        </div> 
        <div className="flex items-center space-x-2 bg-slate-800/50 px-3 py-1.5 rounded-full border border-slate-700"> 
          <div className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full bg-green-500 animate-pulse"></div> 
          <span className="text-xs sm:text-sm font-medium text-green-400">Canlı</span> 
        </div> 
      </div> 

      {/* --- ORTA KISIM: Enerji Akış Şeması --- */} 
      <div className="relative h-64 sm:h-80 w-full mb-8 rounded-xl bg-slate-900/50 border border-slate-800/50 overflow-hidden"> 
        
        {/* SVG Bağlantı Çizgileri */} 
        <svg className="absolute inset-0 w-full h-full pointer-events-none z-0"> 
          {/* Güneş Panelinden -> Ana Hatta (Soldan Sağa) */} 
          <FlowLine x1="25%" y1="30%" x2="50%" y2="30%" power={safePvPower} color="#eab308" /> 
          {/* Ana Hattan -> DC Yüke (Soldan Sağa) */} 
          <FlowLine x1="50%" y1="30%" x2="75%" y2="30%" power={safeLoadPower} color="#ef4444" /> 
          {/* Ana Hattan -> Aküye (Yukarıdan Aşağıya) */} 
          <FlowLine x1="50%" y1="30%" x2="50%" y2="80%" power={safeBatteryPower} color="#3b82f6" /> 
        </svg> 

        {/* Merkez Birleşim Noktası */} 
        <div className="absolute top-[30%] left-[50%] -translate-x-1/2 -translate-y-1/2 w-3 h-3 bg-slate-700 rounded-full border-2 border-slate-500 z-0"></div> 

        {/* DÜĞÜM 1: GÜNEŞ PANELİ */} 
        <div className="absolute top-[30%] left-[25%] -translate-x-1/2 -translate-y-1/2 z-10"> 
          <div className="flex flex-col items-center justify-center bg-slate-800 border-2 border-slate-700 rounded-xl w-24 h-24 sm:w-32 sm:h-32 shadow-lg hover:border-yellow-500/50 transition-colors"> 
            <Sun className="text-yellow-500 w-8 h-8 sm:w-10 sm:h-10 mb-1 sm:mb-2" /> 
            <span className="text-[9px] sm:text-xs text-slate-400 font-semibold mb-0.5 sm:mb-1 text-center">GÜNEŞ PANELİ</span> 
            <span className="text-sm sm:text-xl font-bold text-yellow-500">{safePvPower.toFixed(0)} W</span> 
          </div> 
        </div> 

        {/* DÜĞÜM 2: DC YÜK */} 
        <div className="absolute top-[30%] left-[75%] -translate-x-1/2 -translate-y-1/2 z-10"> 
          <div className="flex flex-col items-center justify-center bg-slate-800 border-2 border-slate-700 rounded-xl w-24 h-24 sm:w-32 sm:h-32 shadow-lg hover:border-red-500/50 transition-colors"> 
            <Zap className="text-red-500 w-8 h-8 sm:w-10 sm:h-10 mb-1 sm:mb-2" /> 
            <span className="text-[9px] sm:text-xs text-slate-400 font-semibold mb-0.5 sm:mb-1 text-center">DC YÜK</span> 
            <span className="text-sm sm:text-xl font-bold text-red-500">{safeLoadPower.toFixed(0)} W</span> 
          </div> 
        </div> 

        {/* DÜĞÜM 3: AKÜ */} 
        <div className="absolute top-[80%] left-[50%] -translate-x-1/2 -translate-y-1/2 z-10"> 
          <div className="flex flex-col items-center justify-center bg-slate-800 border-2 border-slate-700 rounded-xl w-28 h-28 sm:w-36 sm:h-36 shadow-lg hover:border-blue-500/50 transition-colors"> 
            {/* Dinamik Pil İkonu */} 
            <div className="relative w-12 h-6 sm:w-16 sm:h-8 border-2 border-slate-500 rounded-sm sm:rounded-md mb-1 sm:mb-2 flex items-center p-[2px]"> 
              <div className="absolute -right-1.5 sm:-right-2 top-1/2 -translate-y-1/2 w-1 sm:w-1.5 h-3 sm:h-4 bg-slate-500 rounded-r-sm"></div> 
              <div 
                className={`h-full rounded-sm transition-all duration-500 ${safeSoc > 50 ? 'bg-green-500' : safeSoc > 20 ? 'bg-yellow-500' : 'bg-red-500'}`} 
                style={{ width: `${Math.min(100, Math.max(0, safeSoc))}%` }} 
              ></div> 
              <span className="absolute inset-0 flex items-center justify-center text-[9px] sm:text-[11px] font-bold text-white drop-shadow-md"> 
                %{safeSoc.toFixed(1)} 
              </span> 
            </div> 
            
            <span className="text-[10px] sm:text-xs text-slate-400 font-semibold mb-0.5 sm:mb-1">AKÜ</span> 
            <span className="text-sm sm:text-xl font-bold text-blue-400">{Math.abs(safeBatteryPower).toFixed(0)} W</span> 
            <span className="text-[8px] sm:text-[10px] text-slate-500 uppercase tracking-wider mt-0.5 sm:mt-1 text-center font-medium"> 
              {batteryStatusLabel} 
            </span> 
          </div> 
        </div> 
      </div> 

      {/* --- ALT KISIM: İstatistik Kartları --- */} 
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4"> 
        <StatCard 
          title="Akü Voltajı" 
          value={`${safeVoltage.toFixed(1)} V`} 
          icon={<Activity className="text-blue-400 w-5 h-5 sm:w-6 sm:h-6" />} 
          valueColor="text-white" 
        /> 
        <StatCard 
          title="Solar Güç" 
          value={`${safePvPower.toFixed(0)} W`} 
          icon={<Sun className="text-yellow-500 w-5 h-5 sm:w-6 sm:h-6" />} 
          valueColor="text-yellow-500" 
        /> 
        <StatCard 
          title="Yük Tüketimi" 
          value={`${safeLoadPower.toFixed(0)} W`} 
          icon={<Zap className="text-red-500 w-5 h-5 sm:w-6 sm:h-6" />} 
          valueColor="text-red-500" 
        /> 
        <StatCard 
          title="Kalan Süre" 
          value={formatTime(safeRemaining)} 
          icon={<Clock className="text-slate-400 w-5 h-5 sm:w-6 sm:h-6" />} 
          valueColor="text-white" 
        /> 
      </div> 
    </div> 
  ); 
};
