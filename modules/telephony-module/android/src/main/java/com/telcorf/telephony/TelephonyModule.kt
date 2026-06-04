package com.telcorf.telephony

import android.Manifest
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.wifi.WifiManager
import android.os.BatteryManager
import android.os.Build
import android.telephony.CellIdentityGsm
import android.telephony.CellIdentityLte
import android.telephony.CellIdentityNr
import android.telephony.CellIdentityWcdma
import android.telephony.CellInfo
import android.telephony.CellInfoGsm
import android.telephony.CellInfoLte
import android.telephony.CellInfoNr
import android.telephony.CellInfoWcdma
import android.telephony.CellSignalStrengthGsm
import android.telephony.CellSignalStrengthLte
import android.telephony.CellSignalStrengthNr
import android.telephony.CellSignalStrengthWcdma
import android.telephony.PhoneStateListener
import android.telephony.SignalStrength
import android.telephony.SubscriptionManager
import android.telephony.TelephonyCallback
import android.telephony.TelephonyManager
import androidx.core.content.ContextCompat
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.BufferedReader
import java.io.InputStreamReader
import java.util.concurrent.Executor

@Suppress("DEPRECATION")
class TelephonyModule : Module() {

  // ─── Event names ───────────────────────────────────────────────────────────
  companion object {
    const val EVENT_CELL_INFO_CHANGED      = "onCellInfoChanged"
    const val EVENT_SIGNAL_STRENGTH_CHANGED = "onSignalStrengthChanged"
    const val EVENT_HANDOVER_OCCURRED      = "onHandoverOccurred"
    const val EVENT_BATTERY_CHANGED        = "onBatteryChanged"
    const val EVENT_BANDWIDTH_CHANGED      = "onBandwidthChanged"
  }

  // ─── State ─────────────────────────────────────────────────────────────────
  private var legacyListener: PhoneStateListener? = null
  private var modernCellCallback: Any? = null
  private var modernSignalCallback: Any? = null
  private var listenersRegistered = false

  // Handover tracking: simpan info sel terakhir yang terdaftar
  private var lastRegisteredCellId: String? = null
  private var lastRegisteredSignalDbm: Int? = null
  private var lastRegisteredNetworkType: String? = null

  // Battery receiver
  private var batteryReceiver: BroadcastReceiver? = null

  // ─── Module Definition ─────────────────────────────────────────────────────

  override fun definition() = ModuleDefinition {
    Name("TelephonyModule")

    Events(
      EVENT_CELL_INFO_CHANGED,
      EVENT_SIGNAL_STRENGTH_CHANGED,
      EVENT_HANDOVER_OCCURRED,
      EVENT_BATTERY_CHANGED,
      EVENT_BANDWIDTH_CHANGED
    )

    // ── Existing ──────────────────────────────────────────────────────────

    AsyncFunction("isTelephonyAvailableAsync") {
      requireContext().packageManager.hasSystemFeature(PackageManager.FEATURE_TELEPHONY)
    }

    AsyncFunction("getCurrentCellsAsync") {
      val ctx = requireContext()
      ensurePermissions(ctx)
      readAllCells(ctx)
    }

    AsyncFunction("getActiveWifiSsidAsync") {
      getActiveWifiSsid(requireContext())
    }

    // ── Fitur 1: Real-time cell & signal listeners ─────────────────────────

    AsyncFunction("startCellListenerAsync") {
      val ctx = requireContext()
      ensurePermissions(ctx)
      if (!listenersRegistered) {
        registerTelephonyListeners(ctx)
        listenersRegistered = true
      }
    }

    AsyncFunction("stopCellListenerAsync") {
      unregisterTelephonyListeners(requireContext())
      listenersRegistered = false
    }

    // ── Fitur 2: Foreground Service control ────────────────────────────────

    AsyncFunction("startTrackingServiceAsync") {
      val ctx = requireContext()
      ensurePermissions(ctx)
      val intent = Intent(ctx, TelephonyTrackingService::class.java)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        ctx.startForegroundService(intent)
      } else {
        ctx.startService(intent)
      }
      true
    }

    AsyncFunction("stopTrackingServiceAsync") {
      val ctx = requireContext()
      ctx.stopService(Intent(ctx, TelephonyTrackingService::class.java))
      true
    }

    // ── Fitur 3: Battery & Thermal Monitoring ──────────────────────────────

    AsyncFunction("startBatteryMonitorAsync") {
      val ctx = requireContext()
      if (batteryReceiver == null) {
        registerBatteryReceiver(ctx)
      }
    }

    AsyncFunction("stopBatteryMonitorAsync") {
      val ctx = requireContext()
      batteryReceiver?.let {
        try { ctx.unregisterReceiver(it) } catch (_: Exception) {}
      }
      batteryReceiver = null
    }

    AsyncFunction("getBatteryStatusAsync") {
      getBatteryStatus(requireContext())
    }

    // ── Fitur 3: Estimasi Bandwidth Real-Time ──────────────────────────────

    AsyncFunction("getLinkBandwidthAsync") {
      getLinkBandwidth(requireContext())
    }

    // ── Fitur 4: Native Ping ───────────────────────────────────────────────

    AsyncFunction("runNativePingAsync") { host: String, count: Int ->
      withContext(Dispatchers.IO) {
        runNativePing(host, count.coerceIn(1, 20))
      }
    }
  }

  // ─── Fitur 1: Telephony Listeners ─────────────────────────────────────────

  private fun registerTelephonyListeners(context: Context) {
    val tm = context.getSystemService(Context.TELEPHONY_SERVICE) as TelephonyManager

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      val executor: Executor = context.mainExecutor

      val cellCallback = object : TelephonyCallback(), TelephonyCallback.CellInfoListener {
        override fun onCellInfoChanged(cellInfo: MutableList<CellInfo>) {
          val mapped = cellInfo.mapNotNull { parseCell(it, tm, 0, "") }
          checkHandover(mapped)
          sendEvent(EVENT_CELL_INFO_CHANGED, mapOf("cells" to mapped))
          // Emit bandwidth setiap ada update sel juga
          sendBandwidthEvent(context)
        }
      }

      val signalCallback = object : TelephonyCallback(), TelephonyCallback.SignalStrengthsListener {
        override fun onSignalStrengthsChanged(signalStrength: SignalStrength) {
          val lteSignal = signalStrength.getCellSignalStrengths(CellSignalStrengthLte::class.java).firstOrNull()
          sendEvent(
            EVENT_SIGNAL_STRENGTH_CHANGED,
            mapOf(
              "level"        to signalStrength.level,
              "dbm"          to lteSignal?.dbm,
              "rsrp"         to lteSignal?.rsrp?.takeIf { it != Int.MAX_VALUE },
              "rsrq"         to lteSignal?.rsrq?.takeIf { it != Int.MAX_VALUE },
              "rssnr"        to lteSignal?.rssnr?.takeIf { it != Int.MAX_VALUE },
              "cqi"          to if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
                                  lteSignal?.cqi?.takeIf { it != Int.MAX_VALUE } else null,
              "timingAdvance" to lteSignal?.timingAdvance?.takeIf { it != Int.MAX_VALUE && it >= 0 }
            )
          )
        }
      }

      tm.registerTelephonyCallback(executor, cellCallback)
      tm.registerTelephonyCallback(executor, signalCallback)
      modernCellCallback = cellCallback
      modernSignalCallback = signalCallback

    } else {
      val listener = object : PhoneStateListener() {
        @Deprecated("Deprecated in API 31")
        override fun onCellInfoChanged(cellInfo: MutableList<CellInfo>?) {
          val mapped = cellInfo?.mapNotNull { parseCell(it, tm, 0, "") } ?: emptyList()
          checkHandover(mapped)
          sendEvent(EVENT_CELL_INFO_CHANGED, mapOf("cells" to mapped))
          sendBandwidthEvent(context)
        }

        @Deprecated("Deprecated in API 31")
        override fun onSignalStrengthsChanged(signalStrength: SignalStrength?) {
          val lteSignal = signalStrength?.getCellSignalStrengths(CellSignalStrengthLte::class.java)?.firstOrNull()
          sendEvent(
            EVENT_SIGNAL_STRENGTH_CHANGED,
            mapOf(
              "level" to (signalStrength?.level ?: -1),
              "dbm"   to lteSignal?.dbm,
              "rsrp"  to lteSignal?.rsrp?.takeIf { it != Int.MAX_VALUE },
              "rsrq"  to lteSignal?.rsrq?.takeIf { it != Int.MAX_VALUE },
              "rssnr" to lteSignal?.rssnr?.takeIf { it != Int.MAX_VALUE },
              "cqi"   to if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
                            lteSignal?.cqi?.takeIf { it != Int.MAX_VALUE } else null
            )
          )
        }
      }
      @Suppress("DEPRECATION")
      tm.listen(listener, PhoneStateListener.LISTEN_CELL_INFO or PhoneStateListener.LISTEN_SIGNAL_STRENGTHS)
      legacyListener = listener
    }
  }

  private fun unregisterTelephonyListeners(context: Context) {
    val tm = context.getSystemService(Context.TELEPHONY_SERVICE) as TelephonyManager
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      modernCellCallback?.let { tm.unregisterTelephonyCallback(it as TelephonyCallback) }
      modernSignalCallback?.let { tm.unregisterTelephonyCallback(it as TelephonyCallback) }
      modernCellCallback = null
      modernSignalCallback = null
    } else {
      legacyListener?.let {
        @Suppress("DEPRECATION")
        tm.listen(it, PhoneStateListener.LISTEN_NONE)
      }
      legacyListener = null
    }
    lastRegisteredCellId = null
    lastRegisteredSignalDbm = null
    lastRegisteredNetworkType = null
  }

  // ─── Handover Detection ────────────────────────────────────────────────────

  private fun checkHandover(cells: List<Map<String, Any?>>) {
    val newRegistered = cells.firstOrNull { it["isRegistered"] == true } ?: return
    val newCellId     = newRegistered["cellId"] as? String ?: return
    val newDbm        = newRegistered["rsrp"] as? Int ?: newRegistered["rssi"] as? Int
    val newType       = newRegistered["networkType"] as? String

    if (lastRegisteredCellId != null && lastRegisteredCellId != newCellId) {
      // Handover detected!
      sendEvent(
        EVENT_HANDOVER_OCCURRED,
        mapOf(
          "fromCellId"     to lastRegisteredCellId,
          "toCellId"       to newCellId,
          "fromSignalDbm"  to lastRegisteredSignalDbm,
          "toSignalDbm"    to newDbm,
          "fromNetworkType" to lastRegisteredNetworkType,
          "toNetworkType"  to newType,
          "timestamp"      to System.currentTimeMillis()
        )
      )
    }

    lastRegisteredCellId    = newCellId
    lastRegisteredSignalDbm = newDbm
    lastRegisteredNetworkType = newType
  }

  // ─── Fitur 3: Battery Monitor ─────────────────────────────────────────────

  private fun registerBatteryReceiver(context: Context) {
    val receiver = object : BroadcastReceiver() {
      override fun onReceive(ctx: Context?, intent: Intent?) {
        if (intent?.action != Intent.ACTION_BATTERY_CHANGED) return
        val status = buildBatteryMap(intent)
        sendEvent(EVENT_BATTERY_CHANGED, status)
      }
    }
    context.registerReceiver(receiver, IntentFilter(Intent.ACTION_BATTERY_CHANGED))
    batteryReceiver = receiver
  }

  private fun getBatteryStatus(context: Context): Map<String, Any?> {
    val intent = context.registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED))
    return buildBatteryMap(intent)
  }

  private fun buildBatteryMap(intent: Intent?): Map<String, Any?> {
    if (intent == null) return mapOf("available" to false)
    val level       = intent.getIntExtra(BatteryManager.EXTRA_LEVEL, -1)
    val scale       = intent.getIntExtra(BatteryManager.EXTRA_SCALE, 100)
    val tempRaw     = intent.getIntExtra(BatteryManager.EXTRA_TEMPERATURE, -1)
    val voltage     = intent.getIntExtra(BatteryManager.EXTRA_VOLTAGE, -1)
    val status      = intent.getIntExtra(BatteryManager.EXTRA_STATUS, -1)
    val plugged     = intent.getIntExtra(BatteryManager.EXTRA_PLUGGED, -1)
    val isCharging  = status == BatteryManager.BATTERY_STATUS_CHARGING ||
                      status == BatteryManager.BATTERY_STATUS_FULL

    return mapOf(
      "available"         to true,
      "levelPercent"      to if (level >= 0 && scale > 0) (level * 100f / scale).toInt() else null,
      "temperatureCelsius" to if (tempRaw >= 0) tempRaw / 10.0 else null,  // tenths of a degree → °C
      "voltageMillivolts" to if (voltage > 0) voltage else null,
      "isCharging"        to isCharging,
      "isPlugged"         to (plugged != 0),
      "timestamp"         to System.currentTimeMillis()
    )
  }

  // ─── Fitur 3: Link Bandwidth ───────────────────────────────────────────────

  private fun getLinkBandwidth(context: Context): Map<String, Any?> {
    val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
    val network = cm.activeNetwork ?: return mapOf("available" to false)
    val caps    = cm.getNetworkCapabilities(network) ?: return mapOf("available" to false)

    val isCellular = caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR)
    val isWifi     = caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)

    return mapOf(
      "available"                  to true,
      "isCellular"                 to isCellular,
      "isWifi"                     to isWifi,
      "linkDownstreamBandwidthKbps" to caps.linkDownstreamBandwidthKbps,
      "linkUpstreamBandwidthKbps"  to caps.linkUpstreamBandwidthKbps,
      "signalStrengthWifi"         to if (isWifi && Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q)
                                        caps.signalStrength else null,
      "timestamp"                  to System.currentTimeMillis()
    )
  }

  private fun sendBandwidthEvent(context: Context) {
    try {
      val bw = getLinkBandwidth(context)
      sendEvent(EVENT_BANDWIDTH_CHANGED, bw)
    } catch (_: Exception) {}
  }

  // ─── Fitur 4: Native Ping ─────────────────────────────────────────────────

  private fun runNativePing(host: String, count: Int): Map<String, Any?> {
    return try {
      val process = Runtime.getRuntime().exec(arrayOf("ping", "-c", count.toString(), "-W", "3", host))
      val output  = BufferedReader(InputStreamReader(process.inputStream)).readText()
      process.waitFor()
      parsePingOutput(output, count)
    } catch (e: Exception) {
      mapOf(
        "host" to host, "sent" to count, "received" to 0,
        "packetLoss" to 100.0,
        "rttMin" to null, "rttAvg" to null, "rttMax" to null,
        "error" to e.message
      )
    }
  }

  private fun parsePingOutput(output: String, count: Int): Map<String, Any?> {
    val rttRegex      = Regex("""(\d+\.?\d*)/(\d+\.?\d*)/(\d+\.?\d*)""")
    val rttMatch      = rttRegex.find(output)
    val lossRegex     = Regex("""(\d+)% packet loss""")
    val lossMatch     = lossRegex.find(output)
    val receivedRegex = Regex("""(\d+) received""")
    val receivedMatch = receivedRegex.find(output)
    return mapOf(
      "sent"        to count,
      "received"    to (receivedMatch?.groupValues?.get(1)?.toIntOrNull() ?: 0),
      "packetLoss"  to (lossMatch?.groupValues?.get(1)?.toDoubleOrNull() ?: 100.0),
      "rttMin"      to rttMatch?.groupValues?.get(1)?.toDoubleOrNull(),
      "rttAvg"      to rttMatch?.groupValues?.get(2)?.toDoubleOrNull(),
      "rttMax"      to rttMatch?.groupValues?.get(3)?.toDoubleOrNull(),
      "rawOutput"   to output.takeLast(500)
    )
  }

  // ─── Cell Parsing ──────────────────────────────────────────────────────────

  private fun getActiveWifiSsid(context: Context): String? {
    val wm   = context.applicationContext.getSystemService(Context.WIFI_SERVICE) as? WifiManager ?: return null
    val ssid = wm.connectionInfo?.ssid ?: return null
    return if (ssid != "<unknown ssid>" && ssid.isNotEmpty()) ssid.replace("\"", "") else null
  }

  private fun requireContext(): Context =
    appContext.reactContext ?: throw IllegalStateException("React context is not available")

  private fun ensurePermissions(context: Context) {
    val fine   = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION)
    val coarse = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION)
    val phone  = ContextCompat.checkSelfPermission(context, Manifest.permission.READ_PHONE_STATE)
    if (fine != PackageManager.PERMISSION_GRANTED && coarse != PackageManager.PERMISSION_GRANTED)
      throw SecurityException("Location permission is required to read Android CellInfo.")
    if (phone != PackageManager.PERMISSION_GRANTED)
      throw SecurityException("READ_PHONE_STATE permission is required.")
  }

  private fun readAllCells(context: Context): List<Map<String, Any?>> {
    val sm = context.getSystemService(Context.TELEPHONY_SUBSCRIPTION_SERVICE) as SubscriptionManager
    val tm = context.getSystemService(Context.TELEPHONY_SERVICE) as TelephonyManager
    val subs = try { sm.activeSubscriptionInfoList ?: emptyList() } catch (_: SecurityException) { emptyList() }

    val output = mutableListOf<Map<String, Any?>>()
    if (subs.isEmpty()) {
      val operator = MccMncResolver.resolveWithFallback(
        tm.networkOperatorName, tm.networkOperator?.take(3), tm.networkOperator?.drop(3), 0
      )
      output.addAll(readCellsForManager(tm, 0, operator))
      return output
    }
    subs.forEach { sub ->
      val scoped   = tm.createForSubscriptionId(sub.subscriptionId)
      val slot     = if (sub.simSlotIndex >= 0) sub.simSlotIndex else 0
      val mcc      = sub.mccString ?: scoped.networkOperator?.take(3)
      val mnc      = sub.mncString ?: scoped.networkOperator?.drop(3)
      // Use MccMncResolver as fallback if carrierName is blank
      val operator = MccMncResolver.resolveWithFallback(
        sub.carrierName?.toString(), mcc, mnc, slot
      )
      output.addAll(readCellsForManager(scoped, slot, operator))
    }
    return output
  }

  private fun readCellsForManager(manager: TelephonyManager, simSlot: Int, operatorName: String): List<Map<String, Any?>> {
    val cells = try { manager.allCellInfo ?: emptyList() } catch (_: SecurityException) { emptyList() }
    return cells.mapNotNull { parseCell(it, manager, simSlot, operatorName) }
      .sortedByDescending { it["isRegistered"] as Boolean }
  }

  private fun parseCell(cell: CellInfo, manager: TelephonyManager, simSlot: Int, operatorName: String): Map<String, Any?>? {
    val now = System.currentTimeMillis()
    return when (cell) {
      is CellInfoLte   -> lteMap(cell, manager, simSlot, operatorName, now)
      is CellInfoNr    -> if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) nrMap(cell, manager, simSlot, operatorName, now) else null
      is CellInfoWcdma -> wcdmaMap(cell, manager, simSlot, operatorName, now)
      is CellInfoGsm   -> gsmMap(cell, manager, simSlot, operatorName, now)
      else             -> null
    }
  }

  // ─── Cell Map Builders (dengan advanced metrics) ───────────────────────────

  private fun lteMap(cell: CellInfoLte, manager: TelephonyManager, simSlot: Int, operator: String, now: Long): Map<String, Any?> {
    val id: CellIdentityLte         = cell.cellIdentity
    val signal: CellSignalStrengthLte = cell.cellSignalStrength

    // Resolve operator via MCC/MNC jika belum ada
    val resolvedOperator = MccMncResolver.resolveWithFallback(operator, id.mccString, id.mncString, simSlot)

    return baseMap(simSlot, resolvedOperator, "LTE", id.mccString, id.mncString, cell.isRegistered, now) + mapOf(
      "cellId"         to validInt(id.ci),
      "tac"            to validInt(id.tac),
      "lac"            to null,
      "pci"            to validInt(id.pci),
      "earfcn"         to validInt(id.earfcn),
      "nrarfcn"        to null,
      "band"           to null,
      "rsrp"           to validSignal(signal.rsrp),
      "rsrq"           to validSignal(signal.rsrq),
      "rssi"           to if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) validSignal(signal.rssi) else validSignal(signal.dbm),
      "sinr"           to validSignal(signal.rssnr),
      "timingAdvance"  to validTimingAdvance(signal.timingAdvance),
      // ── Advanced LTE metrics ──────────────────────────────────────────
      "rssnr"          to validSignal(signal.rssnr),
      "cqi"            to if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) signal.cqi.takeIf { it != Int.MAX_VALUE } else null,
      "cqiTableIndex"  to if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) signal.cqiTableIndex.takeIf { it != Int.MAX_VALUE } else null
    )
  }

  private fun nrMap(cell: CellInfoNr, manager: TelephonyManager, simSlot: Int, operator: String, now: Long): Map<String, Any?> {
    val id     = cell.cellIdentity as CellIdentityNr
    val signal = cell.cellSignalStrength as CellSignalStrengthNr
    val networkType = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R &&
      manager.dataNetworkType == TelephonyManager.NETWORK_TYPE_NR) "5G SA" else "NR"

    val resolvedOperator = MccMncResolver.resolveWithFallback(operator, id.mccString, id.mncString, simSlot)

    return baseMap(simSlot, resolvedOperator, networkType, id.mccString, id.mncString, cell.isRegistered, now) + mapOf(
      "cellId"   to validLong(id.nci),
      "tac"      to validInt(id.tac),
      "lac"      to null,
      "pci"      to validInt(id.pci),
      "earfcn"   to null,
      "nrarfcn"  to validInt(id.nrarfcn),
      "band"     to null,
      // SS-RSRP/RSRQ/SINR (Synchronization Signal)
      "rsrp"     to validSignal(signal.ssRsrp),
      "rsrq"     to validSignal(signal.ssRsrq),
      "rssi"     to null,
      "sinr"     to validSignal(signal.ssSinr),
      // ── Advanced 5G/NR metrics (CSI — Channel State Information) ──────
      "csiRsrp"  to if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) signal.csiRsrp.takeIf { it != Int.MAX_VALUE } else null,
      "csiRsrq"  to if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) signal.csiRsrq.takeIf { it != Int.MAX_VALUE } else null,
      "csiSinr"  to if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) signal.csiSinr.takeIf { it != Int.MAX_VALUE } else null
    )
  }

  private fun wcdmaMap(cell: CellInfoWcdma, manager: TelephonyManager, simSlot: Int, operator: String, now: Long): Map<String, Any?> {
    val id: CellIdentityWcdma           = cell.cellIdentity
    val signal: CellSignalStrengthWcdma = cell.cellSignalStrength
    val resolvedOperator = MccMncResolver.resolveWithFallback(operator, id.mccString, id.mncString, simSlot)
    return baseMap(simSlot, resolvedOperator, "WCDMA", id.mccString, id.mncString, cell.isRegistered, now) + mapOf(
      "cellId"   to validInt(id.cid),
      "tac"      to null,
      "lac"      to validInt(id.lac),
      "pci"      to validInt(id.psc),
      "earfcn"   to validInt(id.uarfcn),
      "nrarfcn"  to null,
      "band"     to null,
      "rsrp"     to null, "rsrq" to null,
      "rssi"     to validSignal(signal.dbm),
      "sinr"     to null
    )
  }

  private fun gsmMap(cell: CellInfoGsm, manager: TelephonyManager, simSlot: Int, operator: String, now: Long): Map<String, Any?> {
    val id: CellIdentityGsm           = cell.cellIdentity
    val signal: CellSignalStrengthGsm = cell.cellSignalStrength
    val resolvedOperator = MccMncResolver.resolveWithFallback(operator, id.mccString, id.mncString, simSlot)
    return baseMap(simSlot, resolvedOperator, "GSM", id.mccString, id.mncString, cell.isRegistered, now) + mapOf(
      "cellId"   to validInt(id.cid),
      "tac"      to null,
      "lac"      to validInt(id.lac),
      "pci"      to validInt(id.bsic),
      "earfcn"   to validInt(id.arfcn),
      "nrarfcn"  to null,
      "band"     to null,
      "rsrp"     to null, "rsrq" to null,
      "rssi"     to validSignal(signal.dbm),
      "sinr"     to null
    )
  }

  private fun baseMap(
    simSlot: Int, operatorName: String, networkType: String,
    mcc: String?, mnc: String?, registered: Boolean, timestamp: Long
  ): Map<String, Any?> = mapOf(
    "simSlot"      to simSlot,
    "operatorName" to operatorName,
    "mcc"          to mcc,
    "mnc"          to mnc,
    "networkType"  to networkType,
    "isRegistered" to registered,
    "timestamp"    to timestamp
  )

  // ─── Value validators ──────────────────────────────────────────────────────

  private fun validInt(value: Int): String? =
    if (value == Int.MAX_VALUE || value < 0) null else value.toString()

  private fun validLong(value: Long): String? =
    if (value == Long.MAX_VALUE || value < 0) null else value.toString()

  private fun validSignal(value: Int): Int? =
    if (value == Int.MAX_VALUE || value == 99 || value == 2147483647) null else value

  private fun validTimingAdvance(value: Int): Int? =
    if (value == Int.MAX_VALUE || value == 2147483647 || value < 0) null else value
}
