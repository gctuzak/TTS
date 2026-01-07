import asyncio
import os
import struct
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.backends import default_backend

# --- AYARLAR ---
# Bu Key'i ESP32 kodunda da kullanmalısınız
VICTRON_KEY_HEX = "0102030405060708090a0b0c0d0e0f10"
# SmartShunt Model ID (0xA389 -> Little Endian: 0x89, 0xA3)
MODEL_ID = 0xA389
# Readout Type (0x02: Battery Monitor? Genelde Extra Data record type farklı olabilir ama kodumuzda 0x10 kontrolü var, encrypted data iç yapısı önemli)
# VictronBLE.cpp'de: rawData[0] 0x10 (Record Type) kontrolü var.
# rawData[3] Readout Type.
READOUT_TYPE = 0x02 # Battery Monitor Data

# --- SİMÜLASYON VERİLERİ ---
VOLTAGE = 12.50  # Volt
CURRENT = -1.250 # Amper (Deşarj)
SOC = 85.5       # Yüzde
REMAINING_MINS = 120 # Dakika
CONSUMED_AH = 15.0 # Ah

def encrypt_victron_data(key_hex, model_id, readout_type, voltage, current, soc, remaining, consumed):
    key = bytes.fromhex(key_hex)
    
    # 1. IV (Initialization Vector) Oluştur (2 Byte Random)
    iv = os.urandom(2)
    iv_int = struct.unpack('<H', iv)[0]
    
    # 2. Nonce (Counter) Hazırla (16 Byte)
    # VictronBLE.cpp: 
    # nonce[0] = rawData[1] (Model L)
    # nonce[1] = rawData[2] (Model H)
    # nonce[2] = rawData[3] (Readout Type)
    # nonce[3] = rawData[4] (IV L)
    # nonce[4] = rawData[5] (IV H)
    # Kalan 0
    
    nonce = bytearray(16)
    nonce[0] = model_id & 0xFF
    nonce[1] = (model_id >> 8) & 0xFF
    nonce[2] = readout_type
    nonce[3] = iv[0]
    nonce[4] = iv[1]
    
    # 3. Payload'ı Hazırla (Şifrelenecek Veri)
    # VictronBLE.cpp Parsing:
    # 0-1: Time To Go (u16)
    # 2-3: Voltage (s16, 0.01V)
    # 4-5: Alarm (u16)
    # 6-7: Aux Voltage (s16, 0.01V)
    # 8-10: Current (s24, 0.001A)
    # 11-12: Consumed Ah (s16, 0.1Ah)
    # 13-14: SOC (u16, 0x3FFF mask, 0.1%)
    
    ttg_val = remaining if remaining >= 0 else 0xFFFF
    volt_val = int(voltage * 100)
    alarm_val = 0
    aux_val = 0
    curr_val = int(current * 1000)
    cons_val = int(consumed * 10)
    soc_val = int(soc * 10) & 0x3FFF
    
    # Current 24-bit little endian
    # Python struct doesn't have 24-bit, manual packing
    curr_bytes = (curr_val & 0xFFFFFF).to_bytes(3, byteorder='little')
    
    payload = struct.pack('<h', ttg_val) + \
              struct.pack('<h', volt_val) + \
              struct.pack('<H', alarm_val) + \
              struct.pack('<h', aux_val) + \
              curr_bytes + \
              struct.pack('<h', cons_val) + \
              struct.pack('<H', soc_val)
              
    # 4. AES-CTR Şifreleme
    cipher = Cipher(algorithms.AES(key), modes.CTR(bytes(nonce)), backend=default_backend())
    encryptor = cipher.encryptor()
    encrypted_data = encryptor.update(payload) + encryptor.finalize()
    
    # 5. Paket Birleştirme (Manufacturer Data)
    # 0x10 (Record Type) + Model ID (2) + Readout Type (1) + IV (2) + Encrypted Data
    
    manuf_data = bytearray()
    manuf_data.append(0x10)
    manuf_data.append(model_id & 0xFF)
    manuf_data.append((model_id >> 8) & 0xFF)
    manuf_data.append(readout_type)
    manuf_data.append(iv[0])
    manuf_data.append(iv[1])
    manuf_data.extend(encrypted_data)
    
    return manuf_data

async def main():
    print("=== Victron BLE Simülatörü ===")
    print(f"Key: {VICTRON_KEY_HEX}")
    print(f"Model ID: {hex(MODEL_ID)}")
    print("-" * 30)
    
    packet = encrypt_victron_data(VICTRON_KEY_HEX, MODEL_ID, READOUT_TYPE, VOLTAGE, CURRENT, SOC, REMAINING_MINS, CONSUMED_AH)
    
    print(f"Oluşturulan Paket ({len(packet)} bytes):")
    print(packet.hex())
    print("-" * 30)
    print("Bu paketi yayınlamak için BLE destekli bir cihaz gerekir.")
    print("MacOS'te Python ile BLE advertising kısıtlıdır.")
    print("Eğer Linux/Raspberry Pi kullanıyorsanız 'bleak' kütüphanesi ile yayınlayabilirsiniz.")
    
    try:
        from bleak import BleakScanner, BleakClient
        # Advertising is platform specific and complex in pure Python/Bleak
        # Usually requires BlueZ (Linux).
        print("\nNOT: Bu script şimdilik sadece geçerli şifreli paketi üretir.")
        print("Test etmek için bu hex string'i başka bir ESP32'ye 'Advertising Data' olarak verebilirsiniz.")
    except ImportError:
        print("Gerekli kütüphaneler eksik: pip install cryptography bleak")

if __name__ == "__main__":
    asyncio.run(main())
