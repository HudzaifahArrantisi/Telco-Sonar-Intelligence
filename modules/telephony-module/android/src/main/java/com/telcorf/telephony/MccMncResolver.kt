package com.telcorf.telephony

/**
 * MccMncResolver
 *
 * Peta statis offline MCC + MNC → nama operator seluler.
 * Digunakan sebagai fallback ketika carrierName dari sistem kosong atau null.
 *
 * Data mencakup:
 * - Indonesia (MCC 510) — semua operator aktif
 * - Malaysia (MCC 502)
 * - Singapura (MCC 525)
 * - Regional lainnya
 */
object MccMncResolver {

  /**
   * Key format: "$mcc-$mnc"  →  Nama operator
   */
  private val TABLE: Map<String, String> = mapOf(
    // ── Indonesia (MCC 510) ────────────────────────────────────────────────
    "510-01" to "Indosat Ooredoo Hutchison",   // IM3 Ooredoo / Tri
    "510-08" to "Telkomsel",                   // Kartu Halo
    "510-10" to "Telkomsel",                   // simPATI / As
    "510-11" to "XL Axiata",                   // XL
    "510-21" to "Indosat Ooredoo Hutchison",   // Mentari
    "510-28" to "Telkomsel",                   // Loop/Simpati
    "510-89" to "Indosat Ooredoo Hutchison",   // Tri Indonesia (3)
    "510-00" to "PSN (PASTI)",
    "510-07" to "TELKOM flexi",
    "510-09" to "Smartfren",
    "510-27" to "Indosat Ooredoo Hutchison",   // StarOne
    "510-36" to "3 (Tri)",
    "510-88" to "Axiata/XL",
    "510-99" to "Esia (Bakrie Telecom)",

    // ── Malaysia (MCC 502) ─────────────────────────────────────────────────
    "502-01" to "Celcom",
    "502-12" to "Maxis",
    "502-13" to "Celcom",
    "502-16" to "DiGi",
    "502-17" to "Maxis",
    "502-18" to "U Mobile",
    "502-19" to "Celcom",
    "502-20" to "Webe (Packet One)",
    "502-150" to "DiGi",
    "502-152" to "TM",
    "502-153" to "DiGi",
    "502-154" to "YTL Communications",
    "502-157" to "Webe",
    "502-195" to "Tune Talk",

    // ── Singapura (MCC 525) ────────────────────────────────────────────────
    "525-01" to "SingTel",
    "525-03" to "StarHub",
    "525-05" to "M1",
    "525-07" to "MyRepublic",

    // ── Australia (MCC 505) ────────────────────────────────────────────────
    "505-01" to "Telstra",
    "505-03" to "Vodafone AU",
    "505-06" to "Optus",

    // ── Amerika Serikat (MCC 310) ──────────────────────────────────────────
    "310-410" to "AT&T",
    "310-260" to "T-Mobile US",
    "311-480" to "Verizon",
    "310-120" to "Sprint"
  )

  /**
   * Cari nama operator berdasarkan MCC dan MNC.
   *
   * @param mcc  Mobile Country Code (contoh: "510")
   * @param mnc  Mobile Network Code (contoh: "10")
   * @return Nama operator, atau null jika tidak ditemukan di tabel
   */
  fun resolve(mcc: String?, mnc: String?): String? {
    if (mcc.isNullOrBlank() || mnc.isNullOrBlank()) return null
    val key = "$mcc-$mnc"
    return TABLE[key]
  }

  /**
   * Resolve dengan fallback:
   * 1. Coba gunakan carrierName dari sistem.
   * 2. Jika kosong, cari dari tabel MCC/MNC.
   * 3. Jika masih tidak ditemukan, kembalikan "Unknown".
   */
  fun resolveWithFallback(carrierName: String?, mcc: String?, mnc: String?, slotIndex: Int = 0): String {
    if (!carrierName.isNullOrBlank()) return carrierName
    return resolve(mcc, mnc) ?: "SIM ${slotIndex + 1}"
  }
}
