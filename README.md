# 📡 Telco RF Monitor — Sonar Intelligence

**Telco RF Monitor** (dikenal juga sebagai *Telco Sonar Monitor*) adalah aplikasi prototype penganalisis frekuensi radio (RF Engineering Monitor) untuk perangkat Android. Aplikasi ini dibangun menggunakan teknologi **React Native**, **Expo Dev Client**, **TypeScript**, serta modul native berbasis **Kotlin** untuk mengakses API Telephony internal Android.

Aplikasi ini dirancang khusus untuk para RF Engineer, Network Optimizer, teknisi lapangan, akademisi, maupun pengguna umum yang ingin memahami, memetakan, dan menganalisis kualitas sinyal seluler di sekitar mereka secara real-time dan presisi.

---

## 🚀 Fitur Utama & Kegunaannya bagi Publik

Aplikasi ini dilengkapi dengan berbagai modul mutakhir untuk memvisualisasikan data telemetri jaringan seluler secara interaktif. Berikut adalah penjelasan detail fitur beserta kegunaan praktisnya:

### 1. Dashboard Utama (Real-time RF Monitor)
Menampilkan rangkuman telemetri jaringan aktif dari kartu SIM Anda secara real-time.
*   **Informasi Seluler Real-Time**: Memantau detail jaringan seperti GSM, WCDMA (3G), LTE (4G), dan NR (5G) langsung melalui API `TelephonyManager` Android.
    *   *Kegunaan*: Melihat tipe koneksi seluler aktif secara akurat dan memantau perpindahan teknologi jaringan (*handover*).
*   **Dual-SIM Battle Card (Komparator Operator)**: Menampilkan performa kartu SIM 1 dan SIM 2 secara berdampingan lengkap dengan logo operator, kekuatan sinyal (RSRP), dan persentase kesehatan sinyal. Aplikasi akan secara otomatis memberikan lencana **"RECOMMENDED DATA"** pada SIM dengan kualitas terbaik.
    *   *Kegunaan*: Membantu Anda memilih kartu SIM mana yang sebaiknya diaktifkan untuk koneksi internet berkecepatan tinggi di lokasi tertentu.
*   **Geiger Audio Finder (Pencari Sinyal Suara)**: Fitur unik yang mengeluarkan bunyi klik layaknya detektor Geiger radiasi. Frekuensi bunyi klik akan semakin cepat jika sinyal RSRP menguat, dan melambat jika sinyal melemah.
    *   *Kegunaan*: Membantu teknisi mencari lokasi fisik antena pemancar (BTS) atau area dengan sinyal terkuat tanpa harus menatap layar ponsel terus-menerus.
*   **Kompas Taktis HUD (Tactical HUD Compass)**: Memanfaatkan sensor magnetometer internal ponsel untuk menunjukkan arah sudut (*bearing*) pemancar BTS relatif terhadap arah hadap pengguna.
    *   *Kegunaan*: Menunjukkan orientasi fisik ke arah mana menara pemancar berada dari titik Anda berdiri.
*   **Skor Kesehatan Sinyal (Signal Health Score)**: Algoritma cerdas yang menghitung skor kualitas sinyal (0% - 100%) dan memberikan label rekomendasi aktivitas (misalnya: sangat kuat untuk streaming 4K & gaming online, atau buruk untuk telepon suara).
*   **Live Logcat Terminal**: Konsol log internal yang menampilkan log sistem (`*:E` filter style) seperti koordinat GPS, penulisan log SQLite, serta respons dari modul native Android.
    *   *Kegunaan*: Membantu proses debugging langsung di perangkat lapangan untuk mengetahui status pembacaan data.

### 2. Peta Radar Cakupan Interaktif (Interactive Coverage Map)
Visualisasi geografis dari menara pemancar seluler dan cakupan jangkauan antena menggunakan **MapLibre GL Native** dan **OpenStreetMap** (tidak membutuhkan kunci API berbayar).
*   **Estimasi Sektor Jangkauan Antena**: Menggambar polygon jangkauan antena berdasarkan estimasi arah pancaran (*Azimuth*) dan lebar pancaran (*Beamwidth*) yang disesuaikan secara default (65°).
    *   *Kegunaan*: Memetakan ke arah mana sektor antena memancarkan sinyal di sekitar lokasi Anda.
*   **Pemetaan Sel Tetangga (Neighbor Cells)**: Menghitung jarak estimasi sel tetangga menggunakan nilai RSRP, memetakan posisinya secara melingkar di sekeliling pengguna berdasarkan perhitungan *bearing* dari Physical Cell Identity (PCI).
    *   *Kegunaan*: Mengidentifikasi keberadaan BTS alternatif di sekitar lokasi yang siap menjadi cadangan jika BTS utama terganggu.
*   **Radar Azimuth RF**: Tampilan radar visual untuk menganalisis penyebaran spasial sinyal menara seluler terdekat.
*   **Floating GPS Overlay**: Menampilkan data telemetri posisi berakurasi tinggi seperti Koordinat Lintang/Bujur, Kecepatan Bergerak (km/jam), dan Ketinggian (mdpl).

### 3. Log Pengujian Lapangan (Drive Test Log)
Alat untuk merekam data perjalanan dan memetakan kualitas sinyal sepanjang rute tertentu.
*   **Penyimpanan Database SQLite Lokal**: Secara otomatis mencatat data telemetri (Operator, tipe jaringan, Cell ID, TAC, PCI, Band, RSRP, RSRQ, SINR, serta koordinat GPS) ketika mode pemantauan aktif.
    *   *Kegunaan*: Menghindari kehilangan data saat melakukan pengujian jaringan di area terpencil tanpa koneksi internet.
*   **Ekspor ke CSV**: Mengonversi database SQLite lokal menjadi file CSV standar industri yang siap dibagikan.
    *   *Kegunaan*: Memungkinkan data hasil uji jalan (*drive test*) diimpor ke software GIS/RF profesional seperti Google Earth, Microsoft Excel, QGIS, atau MapInfo untuk dianalisis lebih mendalam oleh tim perencanaan jaringan.

### 4. Pengaturan Parameter Fleksibel (Configuration Settings)
Menyediakan kendali penuh atas visualisasi peta dan kinerja aplikasi:
*   **Update Interval (5s - 60s)**: Menyesuaikan seberapa sering aplikasi mengambil data dari modul native untuk menghemat baterai.
*   **Default Beamwidth (30° - 120°)**: Menentukan lebar sudut visualisasi sektor antena pemancar di peta.
*   **Default Radius (100m - 5000m)**: Menentukan panjang visualisasi radius pancaran antena di peta.
*   **Logging Switch**: Menyalakan atau mematikan pencatatan log otomatis ke SQLite.

---

## 📊 Kamus Istilah RF (Radio Frequency Glossary)
Agar informasi lebih mudah dipahami oleh publik, berikut adalah penjelasan singkat mengenai parameter RF yang ditampilkan di aplikasi:

| Parameter | Nama Kepanjangan | Penjelasan Singkat | Batas Kualitas Bagus |
| :--- | :--- | :--- | :--- |
| **RSRP** | *Reference Signal Received Power* | Kekuatan sinyal murni yang diterima ponsel dari BTS (dalam dBm). Semakin mendekati 0, semakin kuat. | `>= -85 dBm` (Sangat Baik) |
| **RSRQ** | *Reference Signal Received Quality* | Kualitas sinyal yang diterima ponsel, menunjukkan adanya interferensi. Semakin mendekati 0, semakin bersih. | `>= -10 dB` (Sangat Baik) |
| **SINR** | *Signal-to-Interference-plus-Noise Ratio* | Rasio kekuatan sinyal utama dibandingkan dengan gangguan/noise (dalam dB). Semakin tinggi angkanya, semakin jernih sinyalnya. | `>= 15 dB` (Sangat Baik) |
| **Cell ID** | *Cell Identifier* | Nomor identitas unik dari suatu sektor pemancar BTS. | N/A |
| **PCI** | *Physical Cell Identity* | Identitas fisik pemancar jarak dekat untuk membedakan antar BTS yang berdekatan. | N/A |
| **Band** | *Frequency Band* | Pita frekuensi radio yang sedang digunakan untuk berkomunikasi (misalnya Band 1 = 2100 MHz, Band 3 = 1800 MHz, dll). | N/A |
| **TAC / LAC** | *Tracking / Location Area Code* | Kode area geografis sekumpulan BTS untuk pengelolaan mobilitas jaringan. | N/A |

---

## 🛠️ Panduan Penggunaan Aplikasi (How to Use)

### Persyaratan Utama:
1.  **HP Android Fisik**: Aplikasi tidak dapat berjalan di Emulator karena emulator tidak memiliki modul radio GSM/LTE fisik yang memancarkan CellInfo asli.
2.  **Kartu SIM Aktif**: Diperlukan minimal satu kartu SIM aktif terpasang untuk memicu pembacaan data telemetri.
3.  **Izin Lokasi & Telepon**: Pengguna harus memberikan izin lokasi berpresisi tinggi (`ACCESS_FINE_LOCATION`) serta izin membaca status telepon (`READ_PHONE_STATE`) pada saat startup.

### Langkah Melakukan Pengujian Lapangan (Drive Test):
1.  Buka aplikasi dan berikan semua izin akses yang diminta.
2.  Di halaman **Dashboard**, nyalakan sakelar **"Start Monitoring"** untuk mengaktifkan pemantauan real-time.
3.  Pilih SIM slot yang ingin Anda jadikan referensi utama pengamatan.
4.  Buka menu **Settings**, aktifkan opsi **"Enable Logging"** agar data otomatis tersimpan selama pengujian berjalan.
5.  Beralih ke halaman **Map**, Anda akan melihat posisi GPS Anda serta arah estimasi pancaran sektor BTS terhubung. Tekan tombol FAB navigasi (ikon panah) untuk mengaktifkan mode **"Follow Map"** yang akan memusatkan peta pada posisi Anda saat berjalan/berkendara.
6.  Setelah selesai melakukan perjalanan, masuk ke menu **Drive Log** dan ketuk tombol **"Export CSV"** untuk menyimpan hasil rekaman Anda ke memori internal ponsel.

---

## 📂 Struktur Proyek

```text
app/                         Expo Router screens (Struktur Navigasi Utama)
src/components/              Komponen UI RF yang dapat digunakan kembali
src/screens/                 Layar utama (Dashboard, Map, Logs, Settings, Permission)
src/services/                Polling telemetri seluler, runtime state, GPS & SQLite logging
src/native/                  TypeScript bridge untuk berkomunikasi dengan TelephonyModule
src/storage/                 Penyimpanan SQLite log dan AsyncStorage settings
src/maps/                    Rumus perhitungan geometri polygon sektor & BTS
src/utils/                   Fungsi pembantu (helpers) konversi sinyal & frekuensi band
src/types/                   Definisi tipe data TypeScript
modules/telephony-module/    Modul Kotlin Native khusus Expo (Android-only)
```

---

## 🚀 Panduan Pengembangan & Instalasi (Developer Guide)

### Pemasangan Dependensi
```bash
npm install
npx expo install expo-dev-client
```

### Menjalankan di Perangkat Android
Karena menggunakan modul native kustom (`telephony-module`), aplikasi harus dijalankan melalui skema pembangunan Expo Dev Client pada perangkat fisik Android:

1.  Aktifkan **Developer Options** dan **USB Debugging** di ponsel Anda.
2.  Hubungkan ponsel ke komputer dengan kabel USB dan pastikan terdeteksi dengan perintah `adb devices`.
3.  Lakukan inisialisasi folder build Android:
    ```bash
    npx expo prebuild
    ```
4.  Kompilasi dan instal aplikasi ke ponsel Anda:
    ```bash
    npx expo run:android
    ```
5.  Jalankan server Metro untuk sinkronisasi JavaScript:
    ```bash
    npm run start
    ```

### Membangun File APK Debug Mandiri (Standalone Debug APK)
Untuk membangun file APK secara lokal yang bisa diinstal langsung ke perangkat tanpa koneksi ke server komputer:

Pada terminal macOS/Linux:
```bash
cd android
./gradlew assembleDebug
```

Pada Windows PowerShell:
```powershell
cd android
.\gradlew.bat assembleDebug
```
File APK akan tersimpan di:
`android/app/build/outputs/apk/debug/app-debug.apk`

---

## ⚠️ Disklaimer Jaringan & Peta
Visualisasi azimuth, beamwidth, dan cakupan jangkauan BTS pada peta adalah **estimasi matematis tingkat tinggi** berdasarkan data telemetri yang diekspos oleh sistem operasi Android dan parameter masukan pengguna. Visualisasi ini bukan merupakan hasil pengukuran radar absolut ataupun letak geografis BTS yang sesungguhnya (karena alasan keamanan operator).

Beberapa parameter seperti PCI, EARFCN, RSRP, SINR, dan daftar sel tetangga dapat tersembunyi atau tidak terbaca tergantung pada model chipset modem perangkat, versi Android, kebijakan manufaktur (OEM), dan enkripsi kartu SIM yang digunakan.
