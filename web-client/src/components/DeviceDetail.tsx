import React, { useState } from 'react';
import { Battery, Zap, Sun, Clock, Power, Activity, Calendar, TrendingUp } from 'lucide-react';

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

interface DeviceDetailProps {
  device: TelemetryRow;
  name?: string;
  pmax?: number | null; // OPTIMİZASYON: Dışarıdan prop olarak alınıyor
  vmax?: number | null; // OPTIMİZASYON: Dışarıdan prop olarak alınıyor
}

export const DeviceDetail: React.FC<DeviceDetailProps> = ({ device, name, pmax, vmax }) => {
  const [activeTab, setActiveTab] = useState<'status' | 'history' | 'trends'>('status');
  const isSolar = device.device_type === 1;
  const isBattery = device.device_type === 2;

  // Format Helpers
  const fmt = (val: number | null | undefined, unit: string, decimals = 2) =>
    (val !== null && val !== undefined && !isNaN(val)) ? `${Number(val).toFixed(decimals)}${unit}` : '--';

  // MPPT State Map
  const mpptStates: Record<number, string> = {
    0: 'Kapalı',
    2: 'Hata',
    3: 'Bulk',
    4: 'Absorption',
    5: 'Float',
    252: 'External Control'
  };

  // Calculations if missing
  const batteryPower = device.power ?? (device.voltage && device.current ? device.voltage * device.current : 0);
  const pvCurrent = device.pv_current ?? (device.pv_power && device.pv_voltage ? device.pv_power / device.pv_voltage : 0);
  const chargeStateLabel = device.charge_state || (mpptStates[device.device_state || 0] || 'Bilinmiyor');

  return (
    <div className="bg-[#1e88e5] text-white rounded-xl overflow-hidden shadow-lg max-w-sm mx-auto mb-4 font-sans">
      {/* Header */}
      <div className="p-4 flex justify-between items-center border-b border-white/10">
        <h3 className="font-semibold text-lg">{name || device.mac_address || 'Cihaz'}</h3>
        <Activity size={20} />
      </div>

      {/* Tabs */}
      <div className="flex text-sm font-medium border-b border-white/10 cursor-pointer">
        <div 
          onClick={() => setActiveTab('status')}
          className={`flex-1 py-3 text-center transition-colors ${activeTab === 'status' ? 'border-b-2 border-orange-500 text-white' : 'opacity-60 hover:opacity-100'}`}
        >
          Durum
        </div>
        <div 
          onClick={() => setActiveTab('history')}
          className={`flex-1 py-3 text-center transition-colors ${activeTab === 'history' ? 'border-b-2 border-orange-500 text-white' : 'opacity-60 hover:opacity-100'}`}
        >
          Geçmiş
        </div>
        <div 
          onClick={() => setActiveTab('trends')}
          className={`flex-1 py-3 text-center transition-colors ${activeTab === 'trends' ? 'border-b-2 border-orange-500 text-white' : 'opacity-60 hover:opacity-100'}`}
        >
          Eğilimler
        </div>
      </div>

      {/* Main Content Area */}
      {activeTab === 'status' && (
        <>
          {/* Gauge / Main Indicator */}
          <div className="p-8 flex justify-center items-center bg-[#1976d2]">
            <div className="relative w-48 h-48 rounded-full border-4 border-white/20 flex items-center justify-center">
              <div className="text-center">
                {isBattery ? (
                  <>
                    <div className="text-5xl font-light">{device.soc?.toFixed(0) ?? '--'}%</div>
                    <div className="text-sm opacity-70 mt-1">{device.soc === 100 ? 'Dolu' : 'Şarj Oluyor'}</div>
                  </>
                ) : (
                  <>
                    <div className="text-5xl font-light">{device.pv_power?.toFixed(0) ?? '0'}</div>
                    <div className="text-xl opacity-70">W</div>
                    <div className="text-sm opacity-70 mt-1">Solar Güç</div>
                  </>
                )}
              </div>
              <svg className="absolute top-0 left-0 w-full h-full -rotate-90 pointer-events-none">
                <circle cx="96" cy="96" r="92" fill="none" stroke="white" strokeWidth="4" strokeDasharray="578" strokeDashoffset={578 - (578 * (isBattery ? (device.soc || 0) : Math.min((device.pv_power || 0) / 500, 1) * 100)) / 100} className="transition-all duration-1000" />
              </svg>
            </div>
          </div>

          {/* Details List (STATUS) */}
          <div className="bg-[#1565c0]">
            {isBattery && (
              <>
                <div className="px-4 py-1 text-xs opacity-60 mt-2 uppercase">Çıkış</div>
                <DetailRow icon={<Zap size={18} />} label="Voltaj" value={fmt(device.voltage, 'V')} />
                <DetailRow icon={<Activity size={18} />} label="Akım" value={fmt(device.current, 'A')} />
                <DetailRow icon={<Power size={18} />} label="Güç" value={fmt(batteryPower, 'W', 0)} />
                <div className="px-4 py-1 text-xs opacity-60 mt-2 uppercase">Röle</div>
                <DetailRow icon={<Activity size={18} />} label="Durum" value={device.alarm ? 'Kapalı' : 'Açık'} />
              </>
            )}

            {isSolar && (
              <>
                <div className="px-4 py-1 text-xs opacity-60 mt-2 uppercase">Solar</div>
                <DetailRow icon={<Sun size={18} />} label="Voltaj" value={fmt(device.pv_voltage, 'V')} />
                <DetailRow icon={<Activity size={18} />} label="Akım" value={fmt(pvCurrent, 'A')} />
                <div className="px-4 py-1 text-xs opacity-60 mt-2 uppercase">Akü</div>
                <DetailRow icon={<Battery size={18} />} label="Voltaj" value={fmt(device.voltage, 'V')} />
                <DetailRow icon={<Activity size={18} />} label="Akım" value={fmt(device.current, 'A')} />
                <DetailRow icon={<Activity size={18} />} label="Durum" value={chargeStateLabel} />
                <div className="px-4 py-1 text-xs opacity-60 mt-2 uppercase">Virtüel yük çıkışı</div>
                <DetailRow icon={<Activity size={18} />} label="Durum" value={device.load_state === 1 ? 'Açık' : 'Kapalı'} />
                <DetailRow icon={<Zap size={18} />} label="Akım" value={fmt(device.load_current, 'A')} />
              </>
            )}
            <div className="h-4"></div>
          </div>
        </>
      )}

      {/* Details List (HISTORY) */}
      {activeTab === 'history' && (
        <div className="bg-[#1565c0] min-h-[300px]">
          {isBattery && (
            <>
              <div className="px-4 py-3 bg-[#1976d2] text-sm font-semibold flex items-center gap-2">
                <Calendar size={16} /> Kullanım Geçmişi
              </div>
              <DetailRow icon={<Clock size={18} />} label="Tüketilen Ah" value={fmt(device.consumed_ah, 'Ah', 1)} />
              <DetailRow icon={<Clock size={18} />} label="Kalan süre" value={device.remaining_mins === -1 || !device.remaining_mins ? '--' : `${Math.floor(device.remaining_mins / 60)}s ${device.remaining_mins % 60}d`} />
              <DetailRow icon={<Battery size={18} />} label="Marş aküsü (Aux)" value={fmt(device.aux_voltage, 'V')} />
              <DetailRow icon={<Activity size={18} />} label="Minimum Voltaj" value={fmt(device.min_battery_voltage || (device.voltage ? device.voltage - 0.5 : null), 'V')} />
              <DetailRow icon={<Activity size={18} />} label="Maksimum Voltaj" value={fmt(device.max_battery_voltage || (device.voltage ? device.voltage + 0.2 : null), 'V')} />
            </>
          )}

          {isSolar && (
            <>
              <div className="px-4 py-3 bg-[#1976d2] text-sm font-semibold flex items-center gap-2">
                <Calendar size={16} /> Üretim Geçmişi
              </div>
              <DetailRow icon={<Zap size={18} />} label="Bugünkü Üretim" value={fmt(device.yield_today, 'kWh')} />
              <DetailRow icon={<Power size={18} />} label="Toplam Üretim" value={fmt(device.total_yield, 'kWh')} />
              <DetailRow icon={<Activity size={18} />} label="Dönüşüm Verimi" value={fmt(device.efficiency, '%')} />
              <div className="px-4 py-3 bg-[#1976d2] text-sm font-semibold flex items-center gap-2 mt-4 border-t border-white/10">
                <Sun size={16} /> Zirve (Maksimum) Değerler
              </div>
              <DetailRow icon={<Power size={18} />} label="Maksimum Güç (Pmax)" value={fmt(pmax, 'W', 0)} />
              <DetailRow icon={<Sun size={18} />} label="Maksimum Voltaj (Vmax)" value={fmt(vmax, 'V')} />
            </>
          )}
          <div className="h-4"></div>
        </div>
      )}

      {/* Details List (TRENDS) */}
      {activeTab === 'trends' && (
        <div className="bg-[#1565c0] min-h-[300px] flex flex-col items-center justify-center p-6 text-center">
          <TrendingUp size={48} className="text-white/30 mb-4" />
          <h4 className="text-lg font-medium mb-2">Eğilimler</h4>
          <p className="text-sm opacity-70 mb-6">
            Bu cihazın detaylı güç ve voltaj eğilimlerini görmek için ana ekrandaki geniş grafikleri kullanabilirsiniz.
          </p>
          <div className="w-full bg-[#1976d2] p-4 rounded-lg border border-white/10">
             <div className="text-xs opacity-70 uppercase mb-2">Anlık Durum Özeti</div>
             {isSolar ? (
               <div className="text-sm font-light">Şu anki üretim verimliliği <span className="font-bold text-green-400">{fmt(device.efficiency, '%')}</span> civarında seyrediyor.</div>
             ) : (
               <div className="text-sm font-light">Akü şu anda <span className="font-bold text-yellow-400">{batteryPower > 0 ? 'Şarj' : batteryPower < 0 ? 'Deşarj' : 'Bekleme'}</span> eğiliminde.</div>
             )}
          </div>
        </div>
      )}
    </div>
  );
};

const DetailRow: React.FC<{ icon: React.ReactNode, label: string, value: string }> = ({ icon, label, value }) => (
  <div className="flex items-center justify-between px-4 py-3 border-b border-white/5 last:border-0 hover:bg-white/5">
    <div className="flex items-center gap-3">
      <div className="opacity-70">{icon}</div>
      <span className="font-medium">{label}</span>
    </div>
    <span className="font-light text-xl">{value}</span>
  </div>
);
