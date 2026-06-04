package com.telcorf.telephony

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.location.Location
import android.os.Build
import android.os.IBinder
import android.telephony.CellInfo
import android.telephony.CellInfoGsm
import android.telephony.CellInfoLte
import android.telephony.CellInfoNr
import android.telephony.CellInfoWcdma
import android.telephony.CellSignalStrengthLte
import android.telephony.SubscriptionManager
import android.telephony.TelephonyManager
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import com.google.android.gms.location.FusedLocationProviderClient
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await

/**
 * TelephonyTrackingService
 *
 * Android Foreground Service yang berjalan terus di background, membaca data seluler dan GPS
 * secara berkala, lalu menyiarkan data tersebut melalui LocalBroadcast agar dapat diterima
 * oleh komponen React Native atau disimpan ke database.
 *
 * Cara start/stop service ini dikendalikan dari TelephonyModule.kt:
 *   - startTrackingServiceAsync()  → context.startForegroundService(intent)
 *   - stopTrackingServiceAsync()   → context.stopService(intent)
 */
class TelephonyTrackingService : Service() {

  companion object {
    const val CHANNEL_ID           = "telco_rf_tracking"
    const val CHANNEL_NAME         = "RF Signal Tracking"
    const val NOTIFICATION_ID      = 1001
    const val ACTION_DATA_UPDATE   = "com.telcorf.telephony.ACTION_DATA_UPDATE"
    const val EXTRA_CELLS          = "cells"
    const val EXTRA_LATITUDE       = "latitude"
    const val EXTRA_LONGITUDE      = "longitude"
    const val EXTRA_ACCURACY       = "accuracy"
    const val EXTRA_SPEED          = "speed"

    /** Interval antar pembacaan (ms). Bisa di-override via Intent extra "intervalMs". */
    const val DEFAULT_INTERVAL_MS  = 5_000L
  }

  private val serviceScope = CoroutineScope(Dispatchers.IO + Job())
  private lateinit var fusedClient: FusedLocationProviderClient
  private var intervalMs = DEFAULT_INTERVAL_MS

  // ─── Lifecycle ─────────────────────────────────────────────────────────────

  override fun onCreate() {
    super.onCreate()
    fusedClient = LocationServices.getFusedLocationProviderClient(this)
    createNotificationChannel()
    startForeground(NOTIFICATION_ID, buildNotification("Memulai pemantauan jaringan…"))
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    intervalMs = intent?.getLongExtra("intervalMs", DEFAULT_INTERVAL_MS) ?: DEFAULT_INTERVAL_MS
    startTrackingLoop()
    return START_STICKY // Restart service otomatis jika dimatikan oleh sistem
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onDestroy() {
    serviceScope.cancel()
    super.onDestroy()
  }

  // ─── Tracking Loop ─────────────────────────────────────────────────────────

  private fun startTrackingLoop() {
    serviceScope.launch {
      while (isActive) {
        try {
          val location = readLocation()
          val cells    = readCells()

          // Update notifikasi dengan info terbaru
          val primaryCell = cells.firstOrNull { it["isRegistered"] == true } ?: cells.firstOrNull()
          val notifText = buildNotifText(primaryCell, location)
          updateNotification(notifText)

          // Broadcast data ke React Native / BroadcastReceiver lain
          broadcastUpdate(cells, location)

        } catch (e: Exception) {
          // Jangan crash service jika satu pembacaan gagal
          updateNotification("Kesalahan pembacaan: ${e.message?.take(60)}")
        }

        delay(intervalMs)
      }
    }
  }

  // ─── Location ──────────────────────────────────────────────────────────────

  private suspend fun readLocation(): Location? {
    val hasPermission = ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) ==
      PackageManager.PERMISSION_GRANTED
    if (!hasPermission) return null

    return try {
      fusedClient.getCurrentLocation(Priority.PRIORITY_HIGH_ACCURACY, null).await()
    } catch (e: Exception) {
      null
    }
  }

  // ─── Cells ─────────────────────────────────────────────────────────────────

  @Suppress("DEPRECATION")
  private fun readCells(): List<Map<String, Any?>> {
    val subscriptionManager = getSystemService(Context.TELEPHONY_SUBSCRIPTION_SERVICE) as SubscriptionManager
    val telephonyManager    = getSystemService(Context.TELEPHONY_SERVICE) as TelephonyManager

    val hasPhonePermission = ContextCompat.checkSelfPermission(this, Manifest.permission.READ_PHONE_STATE) ==
      PackageManager.PERMISSION_GRANTED
    if (!hasPhonePermission) return emptyList()

    val subscriptions = try {
      subscriptionManager.activeSubscriptionInfoList ?: emptyList()
    } catch (_: SecurityException) { emptyList() }

    val output = mutableListOf<Map<String, Any?>>()

    if (subscriptions.isEmpty()) {
      output.addAll(cellsForManager(telephonyManager, 0, telephonyManager.networkOperatorName ?: "Unknown"))
      return output
    }

    subscriptions.forEach { sub ->
      val scoped   = telephonyManager.createForSubscriptionId(sub.subscriptionId)
      val slot     = if (sub.simSlotIndex >= 0) sub.simSlotIndex else 0
      val operator = sub.carrierName?.toString()?.takeIf { it.isNotBlank() }
        ?: scoped.networkOperatorName?.takeIf { it.isNotBlank() }
        ?: "SIM ${slot + 1}"
      output.addAll(cellsForManager(scoped, slot, operator))
    }
    return output
  }

  private fun cellsForManager(manager: TelephonyManager, slot: Int, operator: String): List<Map<String, Any?>> {
    val cells = try { manager.allCellInfo ?: emptyList() } catch (_: SecurityException) { emptyList() }
    return cells.mapNotNull { toMap(it, slot, operator) }
      .sortedByDescending { it["isRegistered"] as Boolean }
  }

  private fun toMap(cell: CellInfo, slot: Int, operator: String): Map<String, Any?>? {
    val now = System.currentTimeMillis()
    return when (cell) {
      is CellInfoLte   -> mapOf(
        "simSlot" to slot, "operatorName" to operator, "networkType" to "LTE",
        "isRegistered" to cell.isRegistered, "timestamp" to now,
        "rsrp" to cell.cellSignalStrength.rsrp.takeIf { it != Int.MAX_VALUE },
        "rsrq" to cell.cellSignalStrength.rsrq.takeIf { it != Int.MAX_VALUE },
        "cellId" to cell.cellIdentity.ci.takeIf { it != Int.MAX_VALUE }?.toString(),
        "pci" to cell.cellIdentity.pci.takeIf { it != Int.MAX_VALUE }?.toString()
      )
      is CellInfoNr if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) -> mapOf(
        "simSlot" to slot, "operatorName" to operator, "networkType" to "NR",
        "isRegistered" to cell.isRegistered, "timestamp" to now
      )
      is CellInfoWcdma -> mapOf(
        "simSlot" to slot, "operatorName" to operator, "networkType" to "WCDMA",
        "isRegistered" to cell.isRegistered, "timestamp" to now,
        "rssi" to cell.cellSignalStrength.dbm.takeIf { it != Int.MAX_VALUE }
      )
      is CellInfoGsm   -> mapOf(
        "simSlot" to slot, "operatorName" to operator, "networkType" to "GSM",
        "isRegistered" to cell.isRegistered, "timestamp" to now,
        "rssi" to cell.cellSignalStrength.dbm.takeIf { it != Int.MAX_VALUE }
      )
      else -> null
    }
  }

  // ─── Broadcast ─────────────────────────────────────────────────────────────

  private fun broadcastUpdate(cells: List<Map<String, Any?>>, location: Location?) {
    val intent = Intent(ACTION_DATA_UPDATE).apply {
      `package` = packageName
      putExtra(EXTRA_LATITUDE,  location?.latitude)
      putExtra(EXTRA_LONGITUDE, location?.longitude)
      putExtra(EXTRA_ACCURACY,  location?.accuracy)
      putExtra(EXTRA_SPEED,     location?.speed)
      // cells diserialisasi sebagai string JSON sederhana agar bisa di-pass via Intent
      putExtra(EXTRA_CELLS,     cellsToJson(cells))
    }
    sendBroadcast(intent)
  }

  private fun cellsToJson(cells: List<Map<String, Any?>>): String {
    val sb = StringBuilder("[")
    cells.forEachIndexed { idx, map ->
      sb.append("{")
      map.entries.forEachIndexed { i, (k, v) ->
        sb.append("\"$k\":")
        when (v) {
          null       -> sb.append("null")
          is String  -> sb.append("\"${v.replace("\"", "\\\"")}\"")
          is Boolean -> sb.append(v.toString())
          else       -> sb.append(v.toString())
        }
        if (i < map.size - 1) sb.append(",")
      }
      sb.append("}")
      if (idx < cells.size - 1) sb.append(",")
    }
    sb.append("]")
    return sb.toString()
  }

  // ─── Notification ──────────────────────────────────────────────────────────

  private fun createNotificationChannel() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val channel = NotificationChannel(
        CHANNEL_ID,
        CHANNEL_NAME,
        NotificationManager.IMPORTANCE_LOW  // LOW = tidak berbunyi, tapi tetap terlihat
      ).apply {
        description = "Notifikasi pemantauan sinyal RF aktif"
        setShowBadge(false)
      }
      val manager = getSystemService(NotificationManager::class.java)
      manager.createNotificationChannel(channel)
    }
  }

  private fun buildNotifText(cell: Map<String, Any?>?, location: Location?): String {
    val operator = cell?.get("operatorName") as? String ?: "—"
    val type     = cell?.get("networkType")  as? String ?: "—"
    val rsrp     = cell?.get("rsrp")
    val lat      = location?.latitude?.let { "%.4f".format(it) } ?: "—"
    val lon      = location?.longitude?.let { "%.4f".format(it) } ?: "—"
    return "$operator | $type | RSRP: ${rsrp ?: "—"} dBm | $lat, $lon"
  }

  private fun buildNotification(contentText: String): Notification {
    // Buka aplikasi utama saat notifikasi di-tap
    val launchIntent = packageManager.getLaunchIntentForPackage(packageName)
    val pendingIntent = if (launchIntent != null) {
      PendingIntent.getActivity(this, 0, launchIntent, PendingIntent.FLAG_IMMUTABLE)
    } else null

    return NotificationCompat.Builder(this, CHANNEL_ID)
      .setContentTitle("📡 RF Tracking Aktif")
      .setContentText(contentText)
      .setSmallIcon(android.R.drawable.ic_menu_compass)
      .setOngoing(true)
      .setSilent(true)
      .setContentIntent(pendingIntent)
      .build()
  }

  private fun updateNotification(text: String) {
    val manager = getSystemService(NotificationManager::class.java)
    manager.notify(NOTIFICATION_ID, buildNotification(text))
  }
}
