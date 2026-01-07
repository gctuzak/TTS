#ifndef WEB_INDEX_H
#define WEB_INDEX_H

#include <Arduino.h>

const char index_html[] PROGMEM = R"rawliteral(
<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Victron Monitor</title>
  <style>
    :root { --primary: #0284c7; --bg: #f3f4f6; --card: #ffffff; --text: #1f2937; --success: #10b981; --warning: #f59e0b; --danger: #ef4444; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background-color: var(--bg); color: var(--text); margin: 0; padding: 0; min-height: 100vh; }
    .header { background: var(--primary); color: white; padding: 1rem; text-align: center; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
    .header h1 { margin: 0; font-size: 1.25rem; }
    .nav { display: flex; justify-content: center; background: white; padding: 0.5rem; gap: 1rem; box-shadow: 0 1px 2px rgba(0,0,0,0.05); }
    .nav-btn { background: none; border: none; padding: 0.5rem 1rem; font-size: 1rem; font-weight: 600; color: #6b7280; cursor: pointer; border-bottom: 2px solid transparent; }
    .nav-btn.active { color: var(--primary); border-bottom-color: var(--primary); }
    
    .container { padding: 1rem; max-width: 600px; margin: 0 auto; }
    
    /* Dashboard Styles */
    .device-card { background: var(--card); border-radius: 12px; padding: 1rem; margin-bottom: 1rem; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    .device-header { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #e5e7eb; padding-bottom: 0.5rem; margin-bottom: 0.5rem; }
    .device-title { font-weight: 700; color: var(--primary); font-size: 1.1rem; }
    .device-mac { font-size: 0.75rem; color: #9ca3af; }
    
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; }
    .metric { text-align: center; background: #f9fafb; padding: 0.75rem; border-radius: 8px; }
    .metric-label { font-size: 0.75rem; color: #6b7280; display: block; margin-bottom: 0.25rem; }
    .metric-value { font-size: 1.25rem; font-weight: 700; color: #111827; }
    .unit { font-size: 0.8rem; font-weight: 400; color: #6b7280; }
    
    .progress-bar { width: 100%; height: 8px; background: #e5e7eb; border-radius: 4px; overflow: hidden; margin-top: 0.5rem; }
    .progress-fill { height: 100%; background: var(--success); transition: width 0.3s ease; }
    
    /* Form Styles */
    .form-group { margin-bottom: 1rem; }
    label { display: block; font-size: 0.875rem; font-weight: 500; margin-bottom: 0.5rem; }
    input { width: 100%; padding: 0.75rem; border: 1px solid #d1d5db; border-radius: 6px; box-sizing: border-box; font-size: 1rem; }
    button.save-btn { width: 100%; background-color: var(--primary); color: white; padding: 0.75rem; border: none; border-radius: 6px; font-weight: 600; cursor: pointer; font-size: 1rem; }
    
    .hidden { display: none; }
    .loading { text-align: center; color: #6b7280; padding: 2rem; }
  </style>
</head>
<body>
  <div class="header">
    <h1>⚓ Victron Monitor</h1>
  </div>
  
  <div class="nav">
    <button class="nav-btn active" onclick="showTab('dashboard')">Gösterge Paneli</button>
    <button class="nav-btn" onclick="showTab('settings')">Ayarlar</button>
  </div>

  <div class="container">
    <!-- Dashboard Tab -->
    <div id="dashboard" class="tab-content">
      <div id="deviceList">
        <div class="loading">Veri bekleniyor...</div>
      </div>
    </div>

    <!-- Settings Tab -->
    <div id="settings" class="tab-content hidden">
      <div class="device-card">
        <h2 style="margin-top:0; font-size:1.2rem;">Kurulum Ayarları</h2>
        <form action="/save" method="POST">
          <div class="form-group">
            <label for="ssid">WiFi Adı (SSID)</label>
            <input type="text" id="ssid" name="ssid" placeholder="Tekne WiFi Adı" required>
          </div>
          <div class="form-group">
            <label for="pass">WiFi Şifresi</label>
            <input type="password" id="pass" name="pass" placeholder="WiFi Şifresi">
          </div>
          <div class="form-group">
            <label for="boatId">Tekne Adı</label>
            <input type="text" id="boatId" name="boatId" placeholder="Örn: Mavi Marmara" required>
          </div>
          <div class="form-group">
            <label for="victronKey">Victron BLE Key</label>
            <input type="text" id="victronKey" name="victronKey" placeholder="32 karakterlik hex anahtar">
          </div>
          <button type="submit" class="save-btn">Kaydet ve Yeniden Başlat</button>
        </form>
      </div>
    </div>
  </div>

  <script>
    function showTab(tabId) {
      document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
      document.querySelectorAll('.nav-btn').forEach(el => el.classList.remove('active'));
      
      document.getElementById(tabId).classList.remove('hidden');
      event.target.classList.add('active');
    }

    function renderDevices(devices) {
      const container = document.getElementById('deviceList');
      if (devices.length === 0) {
        container.innerHTML = '<div class="loading">Cihaz bulunamadı. Lütfen bekleyin...</div>';
        return;
      }

      let html = '';
      devices.forEach(d => {
        let metricsHtml = '';
        let extraHtml = '';
        
        // Voltage & Current (Common)
        metricsHtml += `
          <div class="metric">
            <span class="metric-label">Voltaj</span>
            <div class="metric-value">${d.voltage.toFixed(2)} <span class="unit">V</span></div>
          </div>
          <div class="metric">
            <span class="metric-label">Akım</span>
            <div class="metric-value" style="color:${d.current > 0 ? 'var(--success)' : 'var(--danger)'}">${d.current.toFixed(1)} <span class="unit">A</span></div>
          </div>
        `;

        if (d.type === 1) { // Solar Charger
          metricsHtml += `
            <div class="metric">
              <span class="metric-label">Panel Gücü</span>
              <div class="metric-value" style="color:var(--warning)">${d.pv_power} <span class="unit">W</span></div>
            </div>
            <div class="metric">
              <span class="metric-label">Durum</span>
              <div class="metric-value">${d.state}</div>
            </div>
          `;
        } else if (d.type === 2) { // Battery Monitor
          const socColor = d.soc > 50 ? 'var(--success)' : (d.soc > 20 ? 'var(--warning)' : 'var(--danger)');
          extraHtml = `
            <div style="margin-top:1rem;">
              <div style="display:flex; justify-content:space-between; font-size:0.9rem; font-weight:600;">
                <span>Şarj Durumu (SOC)</span>
                <span>${d.soc.toFixed(1)}%</span>
              </div>
              <div class="progress-bar">
                <div class="progress-fill" style="width:${d.soc}%; background:${socColor}"></div>
              </div>
              <div style="margin-top:0.5rem; font-size:0.85rem; color:#6b7280; display:flex; justify-content:space-between;">
                 <span>Tüketilen: ${d.consumed_ah.toFixed(1)} Ah</span>
                 <span>Süre: ${d.remaining_mins === -1 ? 'Sonsuz' : d.remaining_mins + ' dk'}</span>
              </div>
            </div>
          `;
        }

        html += `
          <div class="device-card">
            <div class="device-header">
              <span class="device-title">${d.type === 1 ? '☀️ MPPT Solar' : (d.type === 2 ? '🔋 SmartShunt' : 'Cihaz')}</span>
              <span class="device-mac">${d.mac}</span>
            </div>
            <div class="grid">
              ${metricsHtml}
            </div>
            ${extraHtml}
          </div>
        `;
      });
      container.innerHTML = html;
    }

    function fetchData() {
      // Eğer dashboard aktif değilse veri çekme (opsiyonel)
      // if (document.getElementById('dashboard').classList.contains('hidden')) return;

      fetch('/api/data')
        .then(response => response.json())
        .then(data => renderDevices(data))
        .catch(err => console.error('Veri hatası:', err));
    }

    // İlk yükleme
    fetchData();
    // 3 saniyede bir yenile
    setInterval(fetchData, 3000);
  </script>
</body>
</html>
)rawliteral";

#endif
