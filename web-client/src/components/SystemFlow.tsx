import React, { useEffect, useState } from 'react';

interface SystemFlowProps {
  pvPower: number; // Watt
  batteryPower: number; // Watt (+ charging, - discharging)
  loadPower: number; // Watt
  batterySoc: number; // %
}

export const SystemFlow: React.FC<SystemFlowProps> = ({
  pvPower,
  batteryPower,
  loadPower,
  batterySoc
}) => {
  // Animasyon hızını güce göre hesapla (0 = duruyor, düşük değer = hızlı)
  const getSpeed = (power: number) => {
    if (Math.abs(power) < 5) return 0;
    // 1000W = 1s, 100W = 5s gibi basit bir mantık
    const speed = Math.max(0.5, 5 - (Math.abs(power) / 200)); 
    return speed;
  };

  const pvSpeed = getSpeed(pvPower);
  const batSpeed = getSpeed(batteryPower);
  const loadSpeed = getSpeed(loadPower);

  // Akü doluluk rengi
  const getBatColor = (soc: number) => {
    if (soc > 50) return '#4ade80'; // Green
    if (soc > 20) return '#facc15'; // Yellow
    return '#ef4444'; // Red
  };

  return (
    <div className="w-full max-w-3xl mx-auto p-4 bg-gray-900 rounded-xl shadow-2xl">
      <svg viewBox="0 0 800 600" className="w-full h-auto">
        <defs>
          {/* Hareketli Nokta (Elektron) */}
          <circle id="electron" r="6" fill="white" className="filter drop-shadow-[0_0_4px_rgba(255,255,255,0.8)]" />
          
          {/* Akış Yolu Maskesi (Opsiyonel) */}
        </defs>

        {/* --- YOLLAR (Statik Çizgiler) --- */}
        
        {/* PV -> Battery (Sol Üst -> Orta) */}
        <path d="M 150 150 L 150 300 L 350 300" stroke="#374151" strokeWidth="4" fill="none" />
        
        {/* Battery -> Load (Orta -> Sağ Alt) */}
        <path d="M 450 300 L 650 300 L 650 450" stroke="#374151" strokeWidth="4" fill="none" />

        {/* Grid -> Battery (Sağ Üst -> Orta) - Opsiyonel - KALDIRILDI */}
        {/* <path d="M 650 150 L 650 300 L 450 300" stroke="#374151" strokeWidth="4" fill="none" /> */}

        {/* --- CİHAZ KUTULARI --- */}

        {/* 1. PV (Güneş Paneli) - Sol Üst */}
        <g transform="translate(100, 50)">
          <rect x="0" y="0" width="100" height="100" rx="10" fill="#f59e0b" fillOpacity="0.2" stroke="#f59e0b" strokeWidth="2" />
          <text x="50" y="40" textAnchor="middle" fill="#f59e0b" fontWeight="bold">SOLAR</text>
          <text x="50" y="70" textAnchor="middle" fill="white" fontSize="18">{pvPower.toFixed(0)} W</text>
          {/* Güneş İkonu (Basit) */}
          <circle cx="50" cy="0" r="15" fill="#f59e0b" />
        </g>

        {/* 2. Battery (Akü) - Orta */}
        <g transform="translate(350, 250)">
          <rect x="0" y="0" width="100" height="100" rx="10" fill={getBatColor(batterySoc)} fillOpacity="0.2" stroke={getBatColor(batterySoc)} strokeWidth="2" />
          <text x="50" y="30" textAnchor="middle" fill={getBatColor(batterySoc)} fontWeight="bold">BATTERY</text>
          <text x="50" y="60" textAnchor="middle" fill="white" fontSize="24">{batterySoc.toFixed(0)}%</text>
          <text x="50" y="85" textAnchor="middle" fill="gray" fontSize="14">{Math.abs(batteryPower).toFixed(0)} W</text>
          
          {/* Akü İkonu/Doluluk Barı */}
          <rect x="10" y="40" width="80" height="40" rx="4" stroke="white" strokeWidth="1" fill="none" />
          <rect x="12" y="42" width={76 * (batterySoc / 100)} height="36" rx="2" fill={getBatColor(batterySoc)} />
        </g>

        {/* 3. Load (Yükler) - Sağ Alt */}
        <g transform="translate(600, 450)">
          <rect x="0" y="0" width="100" height="100" rx="10" fill="#3b82f6" fillOpacity="0.2" stroke="#3b82f6" strokeWidth="2" />
          <text x="50" y="40" textAnchor="middle" fill="#3b82f6" fontWeight="bold">LOADS</text>
          <text x="50" y="70" textAnchor="middle" fill="white" fontSize="18">{loadPower.toFixed(0)} W</text>
        </g>

        {/* 4. Grid (Şebeke) - Sağ Üst (Opsiyonel) - KALDIRILDI */}
        {/*
        <g transform="translate(600, 50)">
          <rect x="0" y="0" width="100" height="100" rx="10" fill="#ef4444" fillOpacity="0.2" stroke="#ef4444" strokeWidth="2" />
          <text x="50" y="40" textAnchor="middle" fill="#ef4444" fontWeight="bold">GRID</text>
          <text x="50" y="70" textAnchor="middle" fill="white" fontSize="18">{Math.abs(gridPower).toFixed(0)} W</text>
        </g>
        */}


        {/* --- ANİMASYONLAR --- */}

        {/* PV -> Battery Akışı */}
        {pvSpeed > 0 && (
          <g>
            <path id="pv-path" d="M 150 150 L 150 300 L 350 300" fill="none" />
            <circle r="5" fill="#f59e0b">
              <animateMotion repeatCount="indefinite" dur={`${pvSpeed}s`} keyPoints="0;1" keyTimes="0;1">
                <mpath href="#pv-path" />
              </animateMotion>
            </circle>
            {/* Yoğunluk için ikinci parçacık */}
            <circle r="5" fill="#f59e0b">
              <animateMotion repeatCount="indefinite" dur={`${pvSpeed}s`} begin={`${pvSpeed/2}s`} keyPoints="0;1" keyTimes="0;1">
                <mpath href="#pv-path" />
              </animateMotion>
            </circle>
          </g>
        )}

        {/* Battery -> Load Akışı (Deşarj) */}
        {loadPower > 0 && (
          <g>
            <path id="load-path" d="M 450 300 L 650 300 L 650 450" fill="none" />
            <circle r="5" fill="#3b82f6">
              <animateMotion repeatCount="indefinite" dur={`${loadSpeed}s`} keyPoints="0;1" keyTimes="0;1">
                <mpath href="#load-path" />
              </animateMotion>
            </circle>
            <circle r="5" fill="#3b82f6">
              <animateMotion repeatCount="indefinite" dur={`${loadSpeed}s`} begin={`${loadSpeed/2}s`} keyPoints="0;1" keyTimes="0;1">
                <mpath href="#load-path" />
              </animateMotion>
            </circle>
          </g>
        )}

        {/* Grid <-> Battery Akışı (Basitleştirilmiş: Sadece Grid'den Aküye) - KALDIRILDI */}
        {/*
        {gridPower > 0 && (
           <g>
           <path id="grid-import-path" d="M 650 150 L 650 300 L 450 300" fill="none" />
           <circle r="5" fill="#ef4444">
             <animateMotion repeatCount="indefinite" dur={`${gridSpeed}s`} keyPoints="0;1" keyTimes="0;1">
               <mpath href="#grid-import-path" />
             </animateMotion>
           </circle>
         </g>
        )}
        */}

      </svg>
    </div>
  );
};
