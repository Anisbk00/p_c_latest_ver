/**
 * Heart Rate Monitor Hook (BLE)
 * 
 * Provides Bluetooth Low Energy heart rate monitor connectivity:
 * - Device discovery and pairing
 * - Real-time heart rate streaming
 * - Connection management
 * - Battery level monitoring
 * 
 * Uses Web Bluetooth API (Chrome/Edge on desktop, Chrome Android)
 * 
 * @module hooks/use-heart-rate-monitor
 */

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { vibrate as capVibrate } from '@/lib/capacitor';

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface HeartRateDevice {
  id: string;
  name: string;
  batteryLevel?: number;
}

export interface HeartRateReading {
  heartRate: number;
  timestamp: number;
  contactDetected: boolean;
  energyExpended?: number;
  rrIntervals?: number[];
}

export interface HeartRateStats {
  current: number;
  min: number;
  max: number;
  average: number;
  readings: HeartRateReading[];
}

type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

interface UseHeartRateMonitorReturn {
  // State
  isConnected: boolean;
  isConnecting: boolean;
  connectionState: ConnectionState;
  device: HeartRateDevice | null;
  heartRate: number | null;
  stats: HeartRateStats;
  error: string | null;
  isSupported: boolean;
  
  // Actions
  connect: () => Promise<void>;
  disconnect: () => void;
  resetStats: () => void;
}

// ═══════════════════════════════════════════════════════════════
// BLE CONSTANTS
// ═══════════════════════════════════════════════════════════════

// Heart Rate Service UUID (standard BLE service)
const HEART_RATE_SERVICE_UUID = 'heart_rate'; // or 0x180D
const HEART_RATE_MEASUREMENT_UUID = 'heart_rate_measurement'; // or 0x2A37
const BATTERY_SERVICE_UUID = 'battery_service'; // or 0x180F
const BATTERY_LEVEL_UUID = 'battery_level'; // or 0x2A19

// ═══════════════════════════════════════════════════════════════
// HOOK IMPLEMENTATION
// ═══════════════════════════════════════════════════════════════

export function useHeartRateMonitor(): UseHeartRateMonitorReturn {
  // State
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const [device, setDevice] = useState<HeartRateDevice | null>(null);
  const [heartRate, setHeartRate] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<HeartRateStats>({
    current: 0,
    min: Infinity,
    max: 0,
    average: 0,
    readings: [],
  });

  // Refs for BLE objects
  const deviceRef = useRef<BluetoothDevice | null>(null);
  const characteristicRef = useRef<BluetoothRemoteGATTCharacteristic | null>(null);

  // Ref for storing the gattserverdisconnected handler so it can be removed on cleanup
  const gattDisconnectHandlerRef = useRef<(() => void) | null>(null);

  // Incremental stats accumulator to avoid O(n) recomputation per notification
  const statsAccumulatorRef = useRef({ min: Infinity, max: 0, sum: 0, count: 0 });

  // Race condition guard: prevent concurrent connect() calls
  const isConnectingRef = useRef(false);

  // Check if Web Bluetooth is supported
  const isSupported = typeof navigator !== 'undefined' && 'bluetooth' in navigator;

  // Derived states
  const isConnected = connectionState === 'connected';
  const isConnecting = connectionState === 'connecting';

  // ═══════════════════════════════════════════════════════════════
  // PARSE HEART RATE DATA
  // ═══════════════════════════════════════════════════════════════

  const parseHeartRateValue = useCallback((value: DataView): HeartRateReading => {
    const flags = value.getUint8(0);
    const is16Bit = flags & 0x01;
    const contactDetected = !!(flags & 0x02);
    const hasEnergyExpended = !!(flags & 0x08);
    const hasRRIntervals = !!(flags & 0x10);

    let offset = 1;
    let heartRateValue: number;

    if (is16Bit) {
      heartRateValue = value.getUint16(offset, true);
      offset += 2;
    } else {
      heartRateValue = value.getUint8(offset);
      offset += 1;
    }

    // Skip energy expended if present
    if (hasEnergyExpended) {
      offset += 2;
    }

    // Parse RR intervals if present
    const rrIntervals: number[] = [];
    if (hasRRIntervals) {
      while (offset + 1 < value.byteLength) {
        const rr = value.getUint16(offset, true);
        rrIntervals.push(rr / 1024 * 1000); // Convert to milliseconds
        offset += 2;
      }
    }

    return {
      heartRate: heartRateValue,
      timestamp: Date.now(),
      contactDetected,
      rrIntervals: rrIntervals.length > 0 ? rrIntervals : undefined,
    };
  }, []);

  // ═══════════════════════════════════════════════════════════════
  // HANDLE HEART RATE NOTIFICATION
  // ═══════════════════════════════════════════════════════════════

  const handleHeartRateNotification = useCallback((event: Event) => {
    const target = event.target as BluetoothRemoteGATTCharacteristic;
    if (!target || !target.value) return;

    const reading = parseHeartRateValue(target.value);
    
    setHeartRate(reading.heartRate);
    setStats(prev => {
      const newReadings = [...prev.readings, reading].slice(-1000); // Keep last 1000 readings
      const hr = reading.heartRate;

      // Incremental stats update
      const acc = statsAccumulatorRef.current;
      const newMin = hr < acc.min ? hr : acc.min;
      const newMax = hr > acc.max ? hr : acc.max;
      const newSum = acc.sum + hr;
      const newCount = acc.count + 1;

      // If we sliced off readings, recalculate from scratch (rare)
      if (newReadings.length < prev.readings.length) {
        const heartRates = newReadings.map(r => r.heartRate);
        statsAccumulatorRef.current = {
          min: Math.min(...heartRates),
          max: Math.max(...heartRates),
          sum: heartRates.reduce((a, b) => a + b, 0),
          count: heartRates.length,
        };
      } else {
        statsAccumulatorRef.current = { min: newMin, max: newMax, sum: newSum, count: newCount };
      }

      return {
        current: hr,
        min: statsAccumulatorRef.current.min,
        max: statsAccumulatorRef.current.max,
        average: Math.round(statsAccumulatorRef.current.sum / statsAccumulatorRef.current.count),
        readings: newReadings,
      };
    });
  }, [parseHeartRateValue]);

  // ═══════════════════════════════════════════════════════════════
  // CONNECT TO HEART RATE MONITOR
  // ═══════════════════════════════════════════════════════════════

  const connect = useCallback(async () => {
    if (!isSupported) {
      setError('Bluetooth is not supported in this browser');
      return;
    }

    // Race condition guard: prevent concurrent connect() calls
    if (isConnectingRef.current) return;
    isConnectingRef.current = true;

    setConnectionState('connecting');
    setError(null);

    try {
      // Request Bluetooth device with Heart Rate service
      const bluetoothDevice = await navigator.bluetooth.requestDevice({
        filters: [
          { services: [HEART_RATE_SERVICE_UUID] },
          { namePrefix: 'Polar' },
          { namePrefix: 'Wahoo' },
          { namePrefix: 'Garmin' },
          { namePrefix: 'Suunto' },
          { namePrefix: 'Mi Band' },
          { namePrefix: 'Heart Rate' },
        ],
        optionalServices: [BATTERY_SERVICE_UUID],
      });

      deviceRef.current = bluetoothDevice;

      // Set up disconnect handler (stored in ref so it can be removed on cleanup)
      const disconnectHandler = () => {
        setConnectionState('disconnected');
        setDevice(null);
        setHeartRate(null);
        characteristicRef.current = null;
      };
      gattDisconnectHandlerRef.current = disconnectHandler;
      bluetoothDevice.addEventListener('gattserverdisconnected', disconnectHandler);

      // Connect to GATT server
      const server = await bluetoothDevice.gatt?.connect();
      if (!server) {
        throw new Error('Failed to connect to GATT server');
      }

      // Get Heart Rate service
      const service = await server.getPrimaryService(HEART_RATE_SERVICE_UUID);
      
      // Get Heart Rate Measurement characteristic
      const characteristic = await service.getCharacteristic(HEART_RATE_MEASUREMENT_UUID);
      characteristicRef.current = characteristic;

      // Subscribe to notifications
      characteristic.addEventListener('characteristicvaluechanged', handleHeartRateNotification);
      await characteristic.startNotifications();

      // Try to get battery level
      let batteryLevel: number | undefined;
      try {
        const batteryService = await server.getPrimaryService(BATTERY_SERVICE_UUID);
        const batteryChar = await batteryService.getCharacteristic(BATTERY_LEVEL_UUID);
        const batteryValue = await batteryChar.readValue();
        batteryLevel = batteryValue.getUint8(0);
      } catch {
        // Battery service not available, continue without it
      }

      // Update state
      setDevice({
        id: bluetoothDevice.id,
        name: bluetoothDevice.name || 'Heart Rate Monitor',
        batteryLevel,
      });
      setConnectionState('connected');
      isConnectingRef.current = false;

      // Haptic feedback (Capacitor native or Web Vibration API)
      capVibrate('light').catch(() => {});

    } catch (err) {
      isConnectingRef.current = false;

      const message = err instanceof Error ? err.message : 'Failed to connect';
      
      if (message.includes('User cancelled')) {
        setConnectionState('disconnected');
        return;
      }

      setError(message);
      setConnectionState('error');
    }
  }, [isSupported, handleHeartRateNotification]);

  // ═══════════════════════════════════════════════════════════════
  // DISCONNECT FROM HEART RATE MONITOR
  // ═══════════════════════════════════════════════════════════════

  const disconnect = useCallback(() => {
    if (characteristicRef.current) {
      characteristicRef.current.removeEventListener(
        'characteristicvaluechanged',
        handleHeartRateNotification
      );
      characteristicRef.current.stopNotifications().catch(() => {});
      characteristicRef.current = null;
    }

    // Remove the gattserverdisconnected listener to prevent leak
    if (gattDisconnectHandlerRef.current && deviceRef.current) {
      deviceRef.current.removeEventListener('gattserverdisconnected', gattDisconnectHandlerRef.current);
      gattDisconnectHandlerRef.current = null;
    }

    if (deviceRef.current?.gatt?.connected) {
      deviceRef.current.gatt.disconnect();
    }

    deviceRef.current = null;
    setConnectionState('disconnected');
    setDevice(null);
    setHeartRate(null);
  }, [handleHeartRateNotification]);

  // ═══════════════════════════════════════════════════════════════
  // RESET STATS
  // ═══════════════════════════════════════════════════════════════

  const resetStats = useCallback(() => {
    // Reset the incremental stats accumulator
    statsAccumulatorRef.current = { min: Infinity, max: 0, sum: 0, count: 0 };

    setStats({
      current: heartRate || 0,
      min: heartRate || Infinity,
      max: heartRate || 0,
      average: heartRate || 0,
      readings: heartRate ? [{
        heartRate,
        timestamp: Date.now(),
        contactDetected: true,
      }] : [],
    });
  }, [heartRate]);

  // ═══════════════════════════════════════════════════════════════
  // CLEANUP ON UNMOUNT
  // ═══════════════════════════════════════════════════════════════

  useEffect(() => {
    return () => {
      if (characteristicRef.current) {
        characteristicRef.current.removeEventListener(
          'characteristicvaluechanged',
          handleHeartRateNotification
        );
      }
      // Remove the gattserverdisconnected listener to prevent leak on unmount
      if (gattDisconnectHandlerRef.current && deviceRef.current) {
        deviceRef.current.removeEventListener('gattserverdisconnected', gattDisconnectHandlerRef.current);
      }
      if (deviceRef.current?.gatt?.connected) {
        deviceRef.current.gatt.disconnect();
      }
    };
  }, [handleHeartRateNotification]);

  return {
    isConnected,
    isConnecting,
    connectionState,
    device,
    heartRate,
    stats,
    error,
    isSupported,
    connect,
    disconnect,
    resetStats,
  };
}
