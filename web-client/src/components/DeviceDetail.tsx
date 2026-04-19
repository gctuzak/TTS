import React, { useEffect, useMemo, useState } from 'react';
import { Battery, Zap, Sun, Clock, Power, Activity, Calendar, TrendingUp } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell } from 'recharts';
import { supabase } from '../lib/supabase';

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
  const [historyWindow, setHistoryWindow] = useState<7 | 30>(7);
  const [dailyHistory, setDailyHistory] = useState<Array<{
    dayKey: string;
    label: string;
    yield: number;
    pmax: number;
    battMax: number | null;
    battMin: number | null;
    bulkSec: number;
    absorptionSec: number;
    floatSec: number;
    phaseTotalSec: number;
    isToday: boolean;
  }>>([]);
  const [selectedDayKey, setSelectedDayKey] = useState<string | null>(null);
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
  const chargeStateLabel = device.charge_state || (mpptStates[device.device_state || 0] || 'Bilinmiyor');
  const batteryFlowLabel = batteryPower > 0 ? 'Şarj Oluyor' : batteryPower < 0 ? 'Deşarj Oluyor' : 'Beklemede';
  const loadCurrentNumber = device.load_current === null || device.load_current === undefined ? null : Number(device.load_current);
  const loadCurrentUnknown = loadCurrentNumber === null ? true : loadCurrentNumber < 0 || loadCurrentNumber >= 51.0;
  const fmtDuration = (seconds: number) => {
    if (!seconds || seconds <= 0) return '--';
    const totalMins = Math.round(seconds / 60);
    const h = Math.floor(totalMins / 60);
    const m = totalMins % 60;
    if (h > 0 && m > 0) return `${h}s ${m}d`;
    if (h > 0) return `${h}s`;
    return `${m}d`;
  };
  const displayDays = useMemo(
    () => dailyHistory.slice(-historyWindow),
    [dailyHistory, historyWindow]
  );
  const selectedDay = useMemo(
    () =>
      displayDays.find((d) => d.dayKey === selectedDayKey) ??
      displayDays.find((d) => d.isToday) ??
      displayDays[displayDays.length - 1] ??
      null,
    [displayDays, selectedDayKey]
  );
  const phaseRows = useMemo(() => {
    if (!selectedDay || selectedDay.phaseTotalSec <= 0) return [];
    const total = selectedDay.phaseTotalSec;
    const pct = (v: number) => Math.round((v / total) * 100);
    return [
      { key: 'float', label: 'Float', sec: selectedDay.floatSec, percent: pct(selectedDay.floatSec) },
      { key: 'absorption', label: 'Abs', sec: selectedDay.absorptionSec, percent: pct(selectedDay.absorptionSec) },
      { key: 'bulk', label: 'Bulk', sec: selectedDay.bulkSec, percent: pct(selectedDay.bulkSec) },
    ].filter((p) => p.sec > 0);
  }, [selectedDay]);

  useEffect(() => {
    if (!isSolar || !device.boat_id || !device.mac_address) {
      setDailyHistory([]);
      setSelectedDayKey(null);
      return;
    }

    const fetchSolarHistory = async () => {
      const fromDate = new Date();
      fromDate.setDate(fromDate.getDate() - 30);

      const { data, error } = await supabase
        .from('telemetry')
        .select('created_at, yield_today, pv_power, max_pv_power, voltage, min_battery_voltage, max_battery_voltage, device_state')
        .eq('boat_id', device.boat_id)
        .eq('mac_address', device.mac_address)
        .eq('device_type', 1)
        .gte('created_at', fromDate.toISOString())
        .order('created_at', { ascending: true });

      if (error || !data) {
        setDailyHistory([]);
        setSelectedDayKey(null);
        return;
      }

      const byDay = new Map<
        string,
        {
          dayKey: string;
          dateObj: Date;
          yield: number;
          pmax: number;
          battMax: number | null;
          battMin: number | null;
          bulkSec: number;
          absorptionSec: number;
          floatSec: number;
          phaseTotalSec: number;
          lastTs: number | null;
          lastState: number | null;
        }
      >();

      data.forEach((row) => {
        const d = new Date(row.created_at);
        const ts = d.getTime();
        const dayKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        const existing = byDay.get(dayKey) ?? {
          dayKey,
          dateObj: new Date(d.getFullYear(), d.getMonth(), d.getDate()),
          yield: 0,
          pmax: 0,
          battMax: null,
          battMin: null,
          bulkSec: 0,
          absorptionSec: 0,
          floatSec: 0,
          phaseTotalSec: 0,
          lastTs: null,
          lastState: null,
        };

        const yieldToday = Number(row.yield_today ?? 0);
        const pvPower = Number(row.pv_power ?? 0);
        const maxPvPower = Number(row.max_pv_power ?? 0);
        const voltage = row.voltage !== null && row.voltage !== undefined ? Number(row.voltage) : null;
        const maxBatt = row.max_battery_voltage !== null && row.max_battery_voltage !== undefined
          ? Number(row.max_battery_voltage)
          : null;
        const minBatt = row.min_battery_voltage !== null && row.min_battery_voltage !== undefined
          ? Number(row.min_battery_voltage)
          : null;

        existing.yield = Math.max(existing.yield, yieldToday);
        existing.pmax = Math.max(existing.pmax, maxPvPower, pvPower);
        existing.battMax = [existing.battMax, maxBatt, voltage].filter((v): v is number => v !== null)
          .reduce<number | null>((acc, v) => (acc === null ? v : Math.max(acc, v)), null);
        existing.battMin = [existing.battMin, minBatt, voltage].filter((v): v is number => v !== null)
          .reduce<number | null>((acc, v) => (acc === null ? v : Math.min(acc, v)), null);
        if (existing.lastTs !== null && existing.lastState !== null) {
          const deltaSec = Math.max(0, Math.round((ts - existing.lastTs) / 1000));
          // Çok uzun boşluklar örnekleme tutarsızlığında dağılımı bozmasın.
          const safeDeltaSec = Math.min(deltaSec, 60 * 30);
          if (safeDeltaSec > 0) {
            if (existing.lastState === 3) existing.bulkSec += safeDeltaSec;
            if (existing.lastState === 4) existing.absorptionSec += safeDeltaSec;
            if (existing.lastState === 5) existing.floatSec += safeDeltaSec;
            if ([3, 4, 5].includes(existing.lastState)) existing.phaseTotalSec += safeDeltaSec;
          }
        }
        existing.lastTs = ts;
        existing.lastState = row.device_state !== null && row.device_state !== undefined ? Number(row.device_state) : null;

        byDay.set(dayKey, existing);
      });

      const today = new Date();
      const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      const normalized = Array.from(byDay.values())
        .sort((a, b) => a.dateObj.getTime() - b.dateObj.getTime())
        .map((d, idx, arr) => ({
          dayKey: d.dayKey,
          label: d.dayKey === todayKey ? 'Bugün' : idx === arr.length - 2 && todayKey === arr[arr.length - 1]?.dayKey ? 'Dün' : d.dateObj.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit' }),
          yield: d.yield,
          pmax: d.pmax,
          battMax: d.battMax,
          battMin: d.battMin,
          bulkSec: d.bulkSec,
          absorptionSec: d.absorptionSec,
          floatSec: d.floatSec,
          phaseTotalSec: d.phaseTotalSec,
          isToday: d.dayKey === todayKey,
        }));

      setDailyHistory(normalized);
      const defaultDay = normalized.find((d) => d.isToday) ?? normalized[normalized.length - 1] ?? null;
      setSelectedDayKey(defaultDay?.dayKey ?? null);
    };

    fetchSolarHistory();
  }, [device.boat_id, device.mac_address, isSolar]);

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
                    <div className="text-sm opacity-70 mt-1">{batteryFlowLabel}</div>
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
                <div className="px-4 py-1 text-xs opacity-60 mt-2 uppercase">Akü</div>
                <DetailRow icon={<Battery size={18} />} label="Voltaj" value={fmt(device.voltage, 'V')} />
                <DetailRow icon={<Activity size={18} />} label="Akım" value={fmt(device.current, 'A')} />
                <DetailRow icon={<Activity size={18} />} label="Durum" value={chargeStateLabel} />
                {!loadCurrentUnknown && (
                  <>
                    <div className="px-4 py-1 text-xs opacity-60 mt-2 uppercase">Virtüel yük çıkışı</div>
                    <DetailRow icon={<Activity size={18} />} label="Durum" value={device.load_state === 1 ? 'Açık' : 'Kapalı'} />
                    <DetailRow icon={<Zap size={18} />} label="Akım" value={fmt(loadCurrentNumber, 'A')} />
                  </>
                )}
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
              <div className="px-4 pt-4 pb-2 bg-[#0d47a1] border-b border-white/10">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-xs uppercase tracking-wide text-white/70">Günlük Verim</div>
                  <div className="flex items-center gap-2 text-xs">
                    <button
                      onClick={() => setHistoryWindow(7)}
                      className={`px-2 py-1 rounded ${historyWindow === 7 ? 'bg-[#42a5f5] text-white' : 'bg-white/10 text-white/70 hover:text-white'}`}
                    >
                      7 Gün
                    </button>
                    <button
                      onClick={() => setHistoryWindow(30)}
                      className={`px-2 py-1 rounded ${historyWindow === 30 ? 'bg-[#42a5f5] text-white' : 'bg-white/10 text-white/70 hover:text-white'}`}
                    >
                      30 Gün
                    </button>
                  </div>
                </div>
                <div className="h-44 w-full">
                  {displayDays.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={displayDays}>
                        <XAxis dataKey="label" stroke="#bbdefb" fontSize={11} tickLine={false} axisLine={false} />
                        <YAxis stroke="#bbdefb" fontSize={11} width={36} tickLine={false} axisLine={false} />
                        <Tooltip
                          formatter={(value: number | string | undefined) => [`${Number(value ?? 0).toFixed(2)} kWh`, 'Verim']}
                          labelFormatter={(label) => `Gün: ${label}`}
                          contentStyle={{ backgroundColor: '#0b3d91', border: '1px solid #42a5f5', borderRadius: 8, color: '#fff' }}
                        />
                        <Bar
                          dataKey="yield"
                          radius={[6, 6, 0, 0]}
                          onClick={(barData: any) => setSelectedDayKey(barData?.dayKey ?? null)}
                          cursor="pointer"
                        >
                          {displayDays.map((entry) => (
                            <Cell
                              key={entry.dayKey}
                              fill={selectedDay?.dayKey === entry.dayKey ? '#90caf9' : '#42a5f5'}
                            />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-full flex items-center justify-center text-sm text-white/60">
                      Son günlere ait SmartSolar geçmiş verisi bulunamadı.
                    </div>
                  )}
                </div>
              </div>

              <div className="px-4 py-3 bg-[#1565c0] border-b border-white/10">
                <div className="text-sm font-semibold mb-3">
                  {selectedDay ? `${selectedDay.label} Özeti` : 'Gün Özeti'}
                </div>
                <div className="rounded-lg border border-white/10 overflow-hidden text-sm">
                  <div className="px-3 py-2 bg-[#0d47a1] font-semibold text-white/90">Güneş Paneli</div>
                  <div className="px-3 py-2 flex justify-between border-t border-white/10">
                    <span className="text-white/75">Verim (yield_today)</span>
                    <span className="font-semibold">{fmt(selectedDay?.yield ?? null, 'kWh')}</span>
                  </div>
                  <div className="px-3 py-2 flex justify-between border-t border-white/10">
                    <span className="text-white/75">P max</span>
                    <span className="font-semibold">{fmt(selectedDay?.pmax ?? null, 'W', 0)}</span>
                  </div>

                  <div className="px-3 py-2 bg-[#0d47a1] font-semibold text-white/90 border-t border-white/10">Akü</div>
                  <div className="px-3 py-2 flex justify-between border-t border-white/10">
                    <span className="text-white/75">Voltaj Maks.</span>
                    <span className="font-semibold">{fmt(selectedDay?.battMax ?? null, 'V')}</span>
                  </div>
                  <div className="px-3 py-2 flex justify-between border-t border-white/10">
                    <span className="text-white/75">Voltaj Min.</span>
                    <span className="font-semibold">{fmt(selectedDay?.battMin ?? null, 'V')}</span>
                  </div>
                </div>
                <div className="mt-3 rounded-lg border border-white/10 overflow-hidden text-sm">
                  <div className="px-3 py-2 bg-[#0d47a1] font-semibold text-white/90">Şarj Aşamaları</div>
                  {phaseRows.length > 0 ? (
                    phaseRows.map((phase) => (
                      <div key={phase.key} className="px-3 py-2 flex items-center justify-between border-t border-white/10">
                        <span className="text-white/85">{phase.label}</span>
                        <span className="text-white/80">{fmtDuration(phase.sec)}</span>
                        <span className="font-semibold text-white">{phase.percent}%</span>
                      </div>
                    ))
                  ) : (
                    <div className="px-3 py-2 border-t border-white/10 text-white/60">
                      Bu gün için faz süresi hesaplayacak yeterli ardışık kayıt yok.
                    </div>
                  )}
                </div>
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
