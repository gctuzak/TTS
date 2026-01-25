#include "VictronBLE.h"

VictronBLE::VictronBLE() {
}

void VictronBLE::hexStringToBytes(String hex, uint8_t* bytes) {
    for (unsigned int i = 0; i < hex.length(); i += 2) {
        String byteString = hex.substring(i, i + 2);
        bytes[i / 2] = (uint8_t)strtol(byteString.c_str(), NULL, 16);
    }
}

void VictronBLE::addDevice(String mac, String keyHex) {
    if (keyHex.length() != 32) {
        Serial.println("HATA: Victron Key 32 karakter olmali!");
        return;
    }
    
    // MAC adresini normalize et (küçük harf)
    mac.toLowerCase();
    
    std::vector<uint8_t> keyBytes(16);
    hexStringToBytes(keyHex, keyBytes.data());
    
    deviceKeys[mac] = keyBytes;
    Serial.printf("Cihaz eklendi: %s\n", mac.c_str());
}

void VictronBLE::begin() {
    Serial.printf("Free Heap before BLE init: %d\n", ESP.getFreeHeap());
    Serial.println("BLE: NimBLE init...");
    NimBLEDevice::init("");
    Serial.println("BLE: getScan...");
    pBLEScan = NimBLEDevice::getScan();
    Serial.println("BLE: setCallbacks...");
    pBLEScan->setAdvertisedDeviceCallbacks(this);
    Serial.println("BLE: setActiveScan...");
    pBLEScan->setActiveScan(false); // Passive scan is enough for Manufacturer Data
    Serial.println("BLE: setInterval...");
    pBLEScan->setInterval(100);
    Serial.println("BLE: setWindow...");
    pBLEScan->setWindow(50); // 50% duty cycle to allow WiFi to work
    Serial.println("BLE: begin finished.");
}

void VictronBLE::update() {
    if(!pBLEScan->isScanning()) {
        pBLEScan->start(5, false);
    }
}

bool VictronBLE::decryptData(String macAddress, const uint8_t* rawData, size_t len, uint8_t* decryptedBuffer) {
    macAddress.toLowerCase();
    
    if (deviceKeys.find(macAddress) == deviceKeys.end()) {
        Serial.printf("HATA: %s icin anahtar bulunamadi!\n", macAddress.c_str());
        lastError = "Key Yok: " + macAddress;
        return false;
    }
    
    const uint8_t* key = deviceKeys[macAddress].data();

    // Header 8 byte olmalı: 0x10, Len, ModelL, ModelH, Type, IV_L, IV_H, KeyCheck
    if (len < 10) return false; 
    if (rawData[0] != 0x10) return false;

    // Key Check (Byte 7) - Anahtarın ilk byte'ı ile eşleşmeli
    if (rawData[7] != key[0]) {
        Serial.printf("Key Check Hatasi: %02X != %02X\n", rawData[7], key[0]);
        lastError = "Key Check Fail";
        return false;
    }

    // Victron Nonce Yapısı (AES-CTR)
    // Fabian-Schmidt ve Victron dökümanlarına göre Nonce sadece Data Counter (IV) içerir.
    // İlk 2 byte Data Counter, gerisi 0.
    uint8_t nonce[16] = {0};
    nonce[0] = rawData[5]; // IV LSB (Data Counter L)
    nonce[1] = rawData[6]; // IV MSB (Data Counter H)
    // Kalanlar 0

    size_t encryptedLen = len - 8;
    const uint8_t* encryptedPtr = &rawData[8];

    mbedtls_aes_context aes;
    mbedtls_aes_init(&aes);
    
    int ret = mbedtls_aes_setkey_enc(&aes, key, 128);
    if (ret != 0) return false;

    size_t nc_off = 0;
    uint8_t stream_block[16] = {0};
    
    ret = mbedtls_aes_crypt_ctr(&aes, encryptedLen, &nc_off, nonce, stream_block, encryptedPtr, decryptedBuffer);
    
    mbedtls_aes_free(&aes);
    
    return (ret == 0);
}

void VictronBLE::parseDecryptedData(const uint8_t* data, size_t len, VictronData& result, uint8_t readoutType) {
    // Little Endian Helper
    auto getU16 = [&](int idx) -> uint16_t { return data[idx] | (data[idx+1] << 8); };
    auto getS16 = [&](int idx) -> int16_t { return data[idx] | (data[idx+1] << 8); };
    auto getU24 = [&](int idx) -> uint32_t { return data[idx] | (data[idx+1] << 8) | (data[idx+2] << 16); };
    
    result.timestamp = millis();
    result.valid = true;

    if (readoutType == 0x01) {
        // --- SOLAR CHARGER (MPPT) ---
        result.type = SOLAR_CHARGER;
        // 0: State (u8)
        result.deviceState = data[0];
        // 1: Error (u8)
        result.alarm = data[1];
        // 2-3: Battery Voltage (s16, 0.01V)
        result.voltage = (float)getS16(2) / 100.0;
        // 4-5: Battery Current (s16, 0.1A)
        result.current = (float)getS16(4) / 10.0;
        // 6-7: Yield Today (u16, 10Wh) -> Şimdilik kullanmıyoruz
        // 8-9: PV Power (u16, 1W)
        result.pvPower = (float)getU16(8);
        // 10-11: Load Current (u16, 0.1A)
        result.loadCurrent = (float)getU16(10) / 10.0;

    } else if (readoutType == 0x02) {
        // --- BATTERY MONITOR (SmartShunt / BMV) ---
        result.type = BATTERY_MONITOR;
        
        // 0-1: Time To Go
        uint16_t ttg = getU16(0);
        result.remainingMins = (ttg == 0xFFFF) ? -1 : ttg;
        
        // 2-3: Voltage (0.01V)
        result.voltage = (float)getS16(2) / 100.0;
        
        // 4-5: Alarm
        result.alarm = getU16(4);

        // 6-7: Aux Voltage

        // 8-10: Current (s24, 0.001A)
        int32_t current_raw = data[8] | (data[9] << 8) | (data[10] << 16);
        if (current_raw & 0x800000) current_raw |= 0xFF000000;
        result.current = (float)current_raw / 1000.0;
        
        // 11-12: Consumed Ah (0.1Ah)
        result.consumedAh = (float)getS16(11) / 10.0;
        
        // 13-14: SOC (0.1%)
        uint16_t soc_raw = getU16(13);
        result.soc = (float)(soc_raw & 0x3FFF) / 10.0;
        
        result.power = result.voltage * result.current;
    } else {
        result.type = UNKNOWN;
    }
}

void VictronBLE::onResult(NimBLEAdvertisedDevice* advertisedDevice) {
    // Sadece Manufacturer Data olan cihazlarla ilgileniyoruz
    if (!advertisedDevice->haveManufacturerData()) return;

    std::string manuData = advertisedDevice->getManufacturerData();
    
    // Veri çok kısaysa yoksay
    if (manuData.length() < 4) return;

    uint8_t* data = (uint8_t*)manuData.data();

    // Victron ID kontrolü: 0x02E1 (Little Endian -> E1 02)
    // Ancak bazı durumlarda ID başta olmayabilir veya farklı olabilir.
    // Debug için gördüğümüz tüm Manufacturer Data ID'lerini yazdıralım (kısa süreliğine)
    // Serial.printf("BLE Device: %s, ManuID: %02X%02X\n", advertisedDevice->getAddress().toString().c_str(), data[0], data[1]);

    if (data[0] != 0xE1 || data[1] != 0x02) return;
    
    String mac = advertisedDevice->getAddress().toString().c_str();
    lastSeenDevice = mac; // Son gorulen cihazi kaydet
    Serial.printf("Victron Cihazi Bulundu: %s\n", mac.c_str());

    const uint8_t* victronPayload = &data[2];
    size_t victronLen = manuData.length() - 2;
    
    // Header Kontrol (0x10 = Victron BLE Protocol)
    if (victronPayload[0] != 0x10) {
        Serial.printf("Gecersiz Header (%s): %02X\n", mac.c_str(), victronPayload[0]);
        return;
    }

    uint8_t decrypted[32] = {0};
    
    if (decryptData(mac, victronPayload, victronLen, decrypted)) {
        Serial.printf("Sifre Cozme BASARILI: %s\n", mac.c_str());
        
        // Mevcut kaydı al veya yeni oluştur
        VictronData& devData = devices[mac];
        devData.macAddress = mac;
        
        // Model ID ve Readout Type (Offset düzeltmesi: +1 kaydı)
        // 0: 0x10, 1: Len, 2: ModelL, 3: ModelH, 4: Type
        uint16_t modelId = victronPayload[2] | (victronPayload[3] << 8);
        uint8_t readoutType = victronPayload[4];

        // Veriyi işle (Header 8 byte olduğu için len - 8)
        parseDecryptedData(decrypted, victronLen - 8, devData, readoutType);
    } else {
        // Şifre çözme başarısızsa nedenini anlamak için log
        // Serial.printf("Sifre Cozme BASARISIZ: %s (Anahtar tanimli mi?)\n", mac.c_str());
    }
}

void VictronBLE::simulate() {
    // 1. MPPT - Solar Charger 1
    String mac1 = "AA:BB:CC:DD:EE:01";
    VictronData& dev1 = devices[mac1];
    dev1.macAddress = mac1;
    dev1.type = SOLAR_CHARGER;
    dev1.valid = true;
    dev1.timestamp = millis();
    dev1.voltage = 13.5 + (random(-10, 10) / 100.0);
    dev1.current = 10.0 + (random(-5, 5) / 10.0);
    dev1.pvPower = 150.0 + random(-10, 20);
    dev1.deviceState = 3; // Bulk
    dev1.loadCurrent = 0;

    // 2. MPPT - Solar Charger 2
    String mac2 = "AA:BB:CC:DD:EE:02";
    VictronData& dev2 = devices[mac2];
    dev2.macAddress = mac2;
    dev2.type = SOLAR_CHARGER;
    dev2.valid = true;
    dev2.timestamp = millis();
    dev2.voltage = 13.5 + (random(-10, 10) / 100.0);
    dev2.current = 8.0 + (random(-5, 5) / 10.0);
    dev2.pvPower = 120.0 + random(-10, 20);
    dev2.deviceState = 3; // Bulk
    dev2.loadCurrent = 0;

    // 3. SmartShunt - Battery Monitor
    String mac3 = "AA:BB:CC:DD:EE:03";
    VictronData& dev3 = devices[mac3];
    dev3.macAddress = mac3;
    dev3.type = BATTERY_MONITOR;
    dev3.valid = true;
    dev3.timestamp = millis();
    dev3.voltage = 12.8 + (random(-5, 5) / 100.0);
    dev3.current = -5.2 + (random(-1, 1) / 10.0);
    dev3.power = dev3.voltage * dev3.current;
    dev3.soc = 85.5 + (random(-1, 1) / 10.0);
    dev3.consumedAh = -20.0;
    dev3.remainingMins = 1200;
}
