package com.telcorf.telephony

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
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
import android.telephony.SubscriptionManager
import android.telephony.TelephonyManager
import androidx.core.content.ContextCompat
import android.net.wifi.WifiManager
import android.net.wifi.WifiInfo
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class TelephonyModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("TelephonyModule")

    AsyncFunction("isTelephonyAvailableAsync") {
      val context = requireContext()
      context.packageManager.hasSystemFeature(PackageManager.FEATURE_TELEPHONY)
    }

    AsyncFunction("getCurrentCellsAsync") {
      val context = requireContext()
      ensurePermissions(context)
      readAllCells(context)
    }

    AsyncFunction("getActiveWifiSsidAsync") {
      val context = requireContext()
      getActiveWifiSsid(context)
    }
  }

  private fun getActiveWifiSsid(context: Context): String? {
    val wifiManager = context.applicationContext.getSystemService(Context.WIFI_SERVICE) as? WifiManager ?: return null
    val wifiInfo = wifiManager.connectionInfo ?: return null
    val ssid = wifiInfo.ssid
    if (ssid != null && ssid != "<unknown ssid>" && ssid.isNotEmpty()) {
      return ssid.replace("\"", "")
    }
    return null
  }

  private fun requireContext(): Context {
    return appContext.reactContext ?: throw IllegalStateException("React context is not available")
  }

  private fun ensurePermissions(context: Context) {
    val fineLocation = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION)
    val coarseLocation = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION)
    val phoneState = ContextCompat.checkSelfPermission(context, Manifest.permission.READ_PHONE_STATE)
    if (fineLocation != PackageManager.PERMISSION_GRANTED && coarseLocation != PackageManager.PERMISSION_GRANTED) {
      throw SecurityException("Location permission is required to read Android CellInfo.")
    }
    if (phoneState != PackageManager.PERMISSION_GRANTED) {
      throw SecurityException("READ_PHONE_STATE permission is required to read subscription and telephony data.")
    }
  }

  private fun readAllCells(context: Context): List<Map<String, Any?>> {
    val subscriptionManager = context.getSystemService(Context.TELEPHONY_SUBSCRIPTION_SERVICE) as SubscriptionManager
    val telephonyManager = context.getSystemService(Context.TELEPHONY_SERVICE) as TelephonyManager
    val subscriptions = try {
      subscriptionManager.activeSubscriptionInfoList ?: emptyList()
    } catch (_: SecurityException) {
      emptyList()
    }

    val output = mutableListOf<Map<String, Any?>>()
    if (subscriptions.isEmpty()) {
      output.addAll(readCellsForManager(telephonyManager, 0, telephonyManager.networkOperatorName ?: "Unknown"))
      return output
    }

    subscriptions.forEach { sub ->
      val scopedManager = telephonyManager.createForSubscriptionId(sub.subscriptionId)
      val slot = if (sub.simSlotIndex >= 0) sub.simSlotIndex else 0
      val operator = sub.carrierName?.toString() ?: scopedManager.networkOperatorName ?: "Unknown"
      output.addAll(readCellsForManager(scopedManager, slot, operator))
    }
    return output
  }

  private fun readCellsForManager(manager: TelephonyManager, simSlot: Int, operatorName: String): List<Map<String, Any?>> {
    val cells = try {
      manager.allCellInfo ?: emptyList()
    } catch (_: SecurityException) {
      emptyList()
    }
    return cells.mapNotNull { cell -> parseCell(cell, manager, simSlot, operatorName) }
      .sortedByDescending { it["isRegistered"] as Boolean }
  }

  private fun parseCell(
    cell: CellInfo,
    manager: TelephonyManager,
    simSlot: Int,
    operatorName: String
  ): Map<String, Any?>? {
    val now = System.currentTimeMillis()
    return when (cell) {
      is CellInfoLte -> lteMap(cell, manager, simSlot, operatorName, now)
      is CellInfoNr -> if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) nrMap(cell, manager, simSlot, operatorName, now) else null
      is CellInfoWcdma -> wcdmaMap(cell, manager, simSlot, operatorName, now)
      is CellInfoGsm -> gsmMap(cell, manager, simSlot, operatorName, now)
      else -> null
    }
  }

  private fun lteMap(cell: CellInfoLte, manager: TelephonyManager, simSlot: Int, operator: String, now: Long): Map<String, Any?> {
    val id: CellIdentityLte = cell.cellIdentity
    val signal: CellSignalStrengthLte = cell.cellSignalStrength
    return baseMap(simSlot, operator, "LTE", id.mccString, id.mncString, cell.isRegistered, now) + mapOf(
      "cellId" to validInt(id.ci),
      "tac" to validInt(id.tac),
      "lac" to null,
      "pci" to validInt(id.pci),
      "earfcn" to validInt(id.earfcn),
      "nrarfcn" to null,
      "band" to null,
      "rsrp" to validSignal(signal.rsrp),
      "rsrq" to validSignal(signal.rsrq),
      "rssi" to if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) validSignal(signal.rssi) else validSignal(signal.dbm),
      "sinr" to validSignal(signal.rssnr),
      "timingAdvance" to validTimingAdvance(signal.timingAdvance)
    )
  }

  private fun nrMap(cell: CellInfoNr, manager: TelephonyManager, simSlot: Int, operator: String, now: Long): Map<String, Any?> {
    val id = cell.cellIdentity as CellIdentityNr
    val signal = cell.cellSignalStrength as CellSignalStrengthNr
    val networkType = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R && manager.dataNetworkType == TelephonyManager.NETWORK_TYPE_NR) "5G SA" else "NR"
    return baseMap(simSlot, operator, networkType, id.mccString, id.mncString, cell.isRegistered, now) + mapOf(
      "cellId" to validLong(id.nci),
      "tac" to validInt(id.tac),
      "lac" to null,
      "pci" to validInt(id.pci),
      "earfcn" to null,
      "nrarfcn" to validInt(id.nrarfcn),
      "band" to null,
      "rsrp" to validSignal(signal.ssRsrp),
      "rsrq" to validSignal(signal.ssRsrq),
      "rssi" to null,
      "sinr" to validSignal(signal.ssSinr)
    )
  }

  private fun wcdmaMap(cell: CellInfoWcdma, manager: TelephonyManager, simSlot: Int, operator: String, now: Long): Map<String, Any?> {
    val id: CellIdentityWcdma = cell.cellIdentity
    val signal: CellSignalStrengthWcdma = cell.cellSignalStrength
    return baseMap(simSlot, operator, "WCDMA", id.mccString, id.mncString, cell.isRegistered, now) + mapOf(
      "cellId" to validInt(id.cid),
      "tac" to null,
      "lac" to validInt(id.lac),
      "pci" to validInt(id.psc),
      "earfcn" to validInt(id.uarfcn),
      "nrarfcn" to null,
      "band" to null,
      "rsrp" to null,
      "rsrq" to null,
      "rssi" to validSignal(signal.dbm),
      "sinr" to null
    )
  }

  private fun gsmMap(cell: CellInfoGsm, manager: TelephonyManager, simSlot: Int, operator: String, now: Long): Map<String, Any?> {
    val id: CellIdentityGsm = cell.cellIdentity
    val signal: CellSignalStrengthGsm = cell.cellSignalStrength
    return baseMap(simSlot, operator, "GSM", id.mccString, id.mncString, cell.isRegistered, now) + mapOf(
      "cellId" to validInt(id.cid),
      "tac" to null,
      "lac" to validInt(id.lac),
      "pci" to validInt(id.bsic),
      "earfcn" to validInt(id.arfcn),
      "nrarfcn" to null,
      "band" to null,
      "rsrp" to null,
      "rsrq" to null,
      "rssi" to validSignal(signal.dbm),
      "sinr" to null
    )
  }

  private fun baseMap(
    simSlot: Int,
    operatorName: String,
    networkType: String,
    mcc: String?,
    mnc: String?,
    registered: Boolean,
    timestamp: Long
  ): Map<String, Any?> {
    return mapOf(
      "simSlot" to simSlot,
      "operatorName" to operatorName,
      "mcc" to mcc,
      "mnc" to mnc,
      "networkType" to networkType,
      "isRegistered" to registered,
      "timestamp" to timestamp
    )
  }

  private fun validInt(value: Int): String? {
    if (value == Int.MAX_VALUE || value < 0) return null
    return value.toString()
  }

  private fun validLong(value: Long): String? {
    if (value == Long.MAX_VALUE || value < 0) return null
    return value.toString()
  }

  private fun validSignal(value: Int): Int? {
    if (value == Int.MAX_VALUE || value == 99 || value == 2147483647) return null
    return value
  }

  private fun validTimingAdvance(value: Int): Int? {
    if (value == Int.MAX_VALUE || value == 2147483647 || value < 0) return null
    return value
  }
}
