# 📡 Telco RF Monitor — Sonar Intelligence

**Telco RF Monitor** adalah aplikasi Android prototype untuk pemantauan dan analisis kualitas frekuensi radio (RF) seluler secara real-time. Aplikasi ini dirancang untuk mendeteksi telemetri jaringan, memvisualisasikan estimasi arah pancaran sektor antena (BTS), dan merekam data perjalanan (drive test).

---

## 🎯 Kegunaan Utama Proyek (What is it for?)

Aplikasi ini berguna untuk:
1.  **Analisis Sinyal Lapangan**: Membantu teknisi atau RF engineer memantau kekuatan dan kualitas sinyal seluler di suatu lokasi tanpa peralatan berat.
2.  **Pemetaan Sektor Antena**: Memetakan estimasi arah hadap pancaran antena pemancar (BTS) terdekat secara visual di peta.
3.  **Drive Testing Seluler**: Merekam pergerakan dan melacak fluktuasi kualitas sinyal sepanjang jalur perjalanan untuk dianalisis lebih lanjut di komputer.
4.  **Komparator Operator (Dual-SIM)**: Membandingkan performa jaringan seluler antara SIM 1 dan SIM 2 secara objektif untuk menentukan operator terbaik di wilayah tersebut.

---

## ⚙️ Fungsi & Cara Kerja Fitur (Core Functions)

*   **Real-time Telemetry Dashboard**: Menampilkan parameter krusial jaringan aktif (RSRP, RSRQ, SINR, Band, Cell ID, PCI, TAC) untuk teknologi GSM, 3G (WCDMA), 4G (LTE), dan 5G (NR).
*   **Geiger Audio Finder**: Mengeluarkan bunyi klik layaknya detektor Geiger yang berbunyi semakin cepat saat sinyal seluler menguat, membantu pencarian sinyal secara auditori.
*   **HUD Compass**: Mengarahkan orientasi fisik hadap perangkat ke perkiraan posisi menara pemancar BTS aktif.
*   **Radar Coverage Map**: Memvisualisasikan estimasi beamwidth sektor antena dan sebaran menara sel tetangga (neighbor cells) secara interaktif menggunakan OpenStreetMap.
*   **Drive Logging (SQLite & CSV)**: Mencatat telemetri sinyal yang dikombinasikan dengan koordinat GPS ke database SQLite lokal, dan mengekspornya menjadi berkas CSV untuk diimpor ke software analisis RF profesional (seperti Google Earth atau QGIS).

---

## 📊 Kamus Singkat Parameter Sinyal

*   **RSRP**: Kekuatan sinyal murni (semakin mendekati 0, semakin kuat).
*   **RSRQ**: Kualitas sinyal yang diterima (mengukur tingkat kebersihan/interferensi).
*   **SINR**: Rasio sinyal utama terhadap gangguan/noise (semakin besar angkanya, semakin jernih).
*   **PCI**: Identitas fisik pemancar jarak dekat.
*   **Cell ID**: Identifikasi unik sektor BTS aktif.

---

## ⚠️ Disklaimer
Tampilan peta jangkauan, arah azimuth, dan posisi menara seluler adalah **estimasi matematis** berdasarkan parameter telemetri Android dan bukan merupakan lokasi fisik BTS yang sesungguhnya.
