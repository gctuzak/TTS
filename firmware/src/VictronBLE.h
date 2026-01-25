#ifndef VICTRON_BLE_H
#define VICTRON_BLE_H

#include <Arduino.h>
#include <NimBLEDevice.h>
#include "mbedtls/aes.h"

// Desteklenen Cihaz Tipleri
enum VictronDeviceType {
    SOLAR_CHARGER = 0x01,
    BATTERY_MONITOR = 0x02,
    INVERTER = 0x03,
    DC_DC = 0x04,
    UNKNOWN = 0xFF
};

struct VictronData {
    bool valid = false;
    VictronDeviceType type = UNKNOWN;
    String macAddress;
    unsigned long timestamp;
    
    // Ortak Veriler
    float voltage = 0.0;     // Akü Voltajı (V)
    float current = 0.0;     // Akım (A)
    float power = 0.0;       // Güç (W) - Hesaplanabilir veya okunabilir
    
    // Battery Monitor (SmartShunt/BMV) Özel
    float soc = 0.0;         // Şarj Durumu (%)
    float consumedAh = 0.0;  // Tüketilen Ah
    int remainingMins = 0;   // Kalan Süre
    
    // Solar Charger (MPPT) Özel
    float pvPower = 0.0;     // Panel Gücü (W)
    float loadCurrent = 0.0; // Yük Akımı (A)
    int deviceState = 0;     // MPPT Durumu (Bulk, Abs, Float vs.)

    float temperature = -999.0; // Varsa sıcaklık
    int alarm = 0;           // Alarm durumu
};

#include <map>

// ... existing code ...

class VictronBLE : public NimBLEAdvertisedDeviceCallbacks {
private:
    NimBLEScan* pBLEScan;
    std::map<String, VictronData> devices;
    
    // Cihaz MAC adresi -> AES Key (16 byte) haritası
    std::map<String, std::vector<uint8_t>> deviceKeys;

    void hexStringToBytes(String hex, uint8_t* bytes);
    // decryptData artık MAC adresini de alıyor
    bool decryptData(String macAddress, const uint8_t* rawData, size_t len, uint8_t* decryptedBuffer);
    void parseDecryptedData(const uint8_t* data, size_t len, VictronData& result, uint8_t readoutType);

public:
    VictronBLE();
    void begin();
    void update();
    // Yeni cihaz ekleme fonksiyonu
    void addDevice(String mac, String keyHex);
    void simulate(); // Test için simülasyon verisi ekler
    
    // Tüm cihazların listesini döndür
    std::map<String, VictronData> getDevices() { return devices; }

    String lastSeenDevice; // Son gorulen cihaz MAC adresi
    String lastError;      // Son hata mesaji

    // NimBLE Callback
    void onResult(NimBLEAdvertisedDevice* advertisedDevice) override;
};

#endif
