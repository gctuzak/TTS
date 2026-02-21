import React from 'react';
import { Battery, Zap, Sun, Clock, Power, Activity } from 'lucide-react';

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

      {/* Tabs (Visual only) */}
      <div className="flex text-sm font-medium border-b border-white/10">
        <div className="flex-1 py-3 text-center border-b-2 border-orange-500">Durum</div>
        <div className="flex-1 py-3 text-center opacity-70">Geçmiş</div>
        <div className="flex-1 py-3 text-center opacity-70">Eğilimler</div>
      </div>

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
          {/* Arc simulation (CSS only for now) */}
          <svg className="absolute top-0 left-0 w-full h-full -rotate-90 pointer-events-none">
            <circle cx="96" cy="96" r="92" fill="none" stroke="white" strokeWidth="4" strokeDasharray="578" strokeDashoffset={578 - (578 * (isBattery ? (device.soc || 0) : Math.min((device.pv_power || 0) / 500, 1) * 100)) / 100} className="transition-all duration-1000" />
          </svg>
        </div>
      </div>

      {/* Details List */}
      <div className="bg-[#1565c0]">

        {isBattery && (
          <>
            <div className="px-4 py-1 text-xs opacity-60 mt-2 uppercase">Çıkış</div>
            <DetailRow icon={<Zap size={18} />} label="Voltaj" value={fmt(device.voltage, 'V')} />
            <DetailRow icon={<Activity size={18} />} label="Akım" value={fmt(device.current, 'A')} />
            <DetailRow icon={<Power size={18} />} label="Güç" value={fmt(batteryPower, 'W', 0)} />
            <DetailRow icon={<Clock size={18} />} label="Ah tüketildi" value={fmt(device.consumed_ah, 'Ah', 1)} />
            <DetailRow icon={<Clock size={18} />} label="Kalan süre" value={device.remaining_mins === -1 || !device.remaining_mins ? '--' : `${Math.floor(device.remaining_mins / 60)}s ${device.remaining_mins % 60}d`} />

            <div className="px-4 py-1 text-xs opacity-60 mt-2 uppercase">Giriş</div>
            <DetailRow icon={<Battery size={18} />} label="Marş aküsü" value={fmt(device.aux_voltage, 'V')} />

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

            <div className="px-4 py-1 text-xs opacity-60 mt-2 uppercase">Diğer</div>
            <DetailRow icon={<Zap size={18} />} label="Günlük Üretim" value={fmt(device.yield_today, 'kWh')} />
            <DetailRow icon={<Activity size={18} />} label="Verim" value={fmt(device.efficiency, '%')} />
            <DetailRow icon={<Power size={18} />} label="Toplam Üretim" value={fmt(device.total_yield, 'kWh')} />
            <DetailRow icon={<Power size={18} />} label="Pmax" value={fmt(pmax, 'W', 0)} />
            <DetailRow icon={<Sun size={18} />} label="Vmax" value={fmt(vmax, 'V')} />
          </>
        )}

        {/* Padding bottom */}
        <div className="h-4"></div>
      </div>
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
