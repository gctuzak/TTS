#include <Arduino.h>
#include <NimBLEDevice.h>
#include "mbedtls/aes.h"

// --- Victron Key ---
// Main firmware ile ayni key: 0102030405060708090a0b0c0d0e0f10
const uint8_t AES_KEY[16] = {
    0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08,
    0x09, 0x0A, 0x0B, 0x0C, 0x0D, 0x0E, 0x0F, 0x10
};

NimBLEAdvertising* pAdvertising;
uint16_t iv_counter = 0;

void encrypt_victron_data(uint8_t* buffer, size_t len, uint16_t model_id, uint8_t readout_type, uint16_t iv) {
    // Nonce Yapısı
    uint8_t nonce[16] = {0};
    nonce[0] = model_id & 0xFF;
    nonce[1] = (model_id >> 8) & 0xFF;
    nonce[2] = readout_type;
    nonce[3] = iv & 0xFF;
    nonce[4] = (iv >> 8) & 0xFF;
    // Kalanlar 0

    mbedtls_aes_context aes;
    mbedtls_aes_init(&aes);
    mbedtls_aes_setkey_enc(&aes, AES_KEY, 128);

    size_t nc_off = 0;
    uint8_t stream_block[16] = {0};
    uint8_t input_buffer[32] = {0}; // Temp buffer
    
    // Encrypt in place (buffer -> buffer)
    // Note: AES-CTR works by XORing the keystream with input. 
    // Since input is in buffer, we can use it as both input and output if careful, 
    // but safer to copy to temp input.
    memcpy(input_buffer, buffer, len);
    
    mbedtls_aes_crypt_ctr(&aes, len, &nc_off, nonce, stream_block, input_buffer, buffer);
    
    mbedtls_aes_free(&aes);
}

void setup() {
    Serial.begin(115200);
    Serial.println("Victron BLE Emulator Baslatiliyor...");

    NimBLEDevice::init("VictronSim");
    
    // Power Level 9dbm (Max)
    NimBLEDevice::setPower(ESP_PWR_LVL_P9); 
    
    pAdvertising = NimBLEDevice::getAdvertising();
}

void loop() {
    // --- Veri Simülasyonu ---
    float voltage = 12.5 + (sin(millis() / 5000.0) * 1.0); // 11.5 - 13.5V
    float current = 5.0 + (cos(millis() / 5000.0) * 5.0);  // 0 - 10A
    float soc = 80.0 + (sin(millis() / 10000.0) * 20.0);   // 60 - 100%
    int ttg = 120; // 2 saat
    
    // --- Raw Data Hazırlama (Decrypted) ---
    // SmartShunt / BMV (Type 0x02) Structure:
    // 0-1: TTG (u16)
    // 2-3: Voltage (s16, 0.01V)
    // 4-5: Alarm (u16)
    // 6-7: Aux Voltage (u16, nan)
    // 8-10: Current (s24, 0.001A) -> LSB First
    // 11-12: Consumed Ah (s16, 0.1Ah)
    // 13-14: SOC (u16, 0.1%)
    
    uint8_t decrypted[16] = {0};
    
    // TTG
    decrypted[0] = ttg & 0xFF;
    decrypted[1] = (ttg >> 8) & 0xFF;
    
    // Voltage
    int16_t v_raw = (int16_t)(voltage * 100);
    decrypted[2] = v_raw & 0xFF;
    decrypted[3] = (v_raw >> 8) & 0xFF;
    
    // Alarm
    decrypted[4] = 0;
    decrypted[5] = 0;
    
    // Aux
    decrypted[6] = 0;
    decrypted[7] = 0;
    
    // Current (3 bytes)
    int32_t c_raw = (int32_t)(current * 1000);
    decrypted[8] = c_raw & 0xFF;
    decrypted[9] = (c_raw >> 8) & 0xFF;
    decrypted[10] = (c_raw >> 16) & 0xFF;
    
    // Consumed Ah
    int16_t cah_raw = -100; // -10.0 Ah
    decrypted[11] = cah_raw & 0xFF;
    decrypted[12] = (cah_raw >> 8) & 0xFF;
    
    // SOC
    uint16_t soc_raw = (uint16_t)(soc * 10);
    decrypted[13] = soc_raw & 0xFF;
    decrypted[14] = (soc_raw >> 8) & 0xFF;

    // --- Paket Oluşturma ---
    uint16_t model_id = 0xA389; // SmartShunt
    uint8_t readout_type = 0x02;
    
    // Şifrele
    encrypt_victron_data(decrypted, 15, model_id, readout_type, iv_counter);
    
    // Full Payload Construction
    // 0: 0x10 (Prefix)
    // 1-2: Model ID
    // 3: Readout Type
    // 4-5: IV
    // 6..20: Encrypted Data (15 bytes)
    
    uint8_t payload[22];
    payload[0] = 0x10;
    payload[1] = model_id & 0xFF;
    payload[2] = (model_id >> 8) & 0xFF;
    payload[3] = readout_type;
    payload[4] = iv_counter & 0xFF;
    payload[5] = (iv_counter >> 8) & 0xFF;
    memcpy(&payload[6], decrypted, 15);
    
    // --- Manufacturer Data ---
    // Victron ID: 0x02E1 (Little Endian -> 0xE1 0x02)
    // NimBLE uses std::string for manufacturer data.
    // The first 2 bytes of the string are the Manufacturer ID (Little Endian).
    
    std::string manufData;
    manufData += (char)0xE1;
    manufData += (char)0x02;
    for(int i=0; i<21; i++) manufData += (char)payload[i];
    
    // Stop old advertising
    pAdvertising->stop();
    
    // New Advertisement Data
    NimBLEAdvertisementData oAdvertisementData = NimBLEAdvertisementData();
    oAdvertisementData.setManufacturerData(manufData);
    
    pAdvertising->setAdvertisementData(oAdvertisementData);
    pAdvertising->start();
    
    Serial.printf("Advertised: IV=%d, V=%.2f, I=%.2f\n", iv_counter, voltage, current);
    
    iv_counter++;
    delay(1000); // 1 saniyede bir güncelle
}
