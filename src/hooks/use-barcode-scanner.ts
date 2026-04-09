/**
 * Barcode Scanner Hook
 * 
 * Provides barcode scanning functionality with:
 * - Native ML Kit on Capacitor/mobile devices
 * - html5-qrcode fallback for web
 * - Vibration feedback
 * - Offline queue support
 * 
 * @module hooks/use-barcode-scanner
 */

"use client";

import { useState, useEffect, useCallback, useRef } from 'react'
import { Capacitor } from '@capacitor/core'
import { apiFetch } from '@/lib/mobile-api'

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

export interface ScannedFood {
  id?: string
  name: string
  brand?: string
  barcode: string
  calories: number
  protein: number
  carbs: number
  fat: number
  fiber?: number
  sugar?: number
  sodium?: number
  servingSize: number
  servingUnit: string
  isVerified: boolean
  source: 'local' | 'openfoodfacts'
  category?: string
  origin?: string
  image_url?: string
}

export interface BarcodeScanResult {
  success: boolean
  barcode?: string
  food?: ScannedFood
  error?: string
}

export interface ScannerCapabilities {
  hasCamera: boolean
  hasNativeScanner: boolean
  isNative: boolean
  platform: string
}

type ScanStatus = 'idle' | 'scanning' | 'processing' | 'found' | 'not_found' | 'error' | 'permission_denied'

interface OfflineQueueItem {
  barcode: string
  timestamp: number
  status: 'pending' | 'processed'
}

// ═══════════════════════════════════════════════════════════════
// Vibration Helper
// ═══════════════════════════════════════════════════════════════

function vibrate(pattern: number | number[] = 100): void {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    try {
      navigator.vibrate(pattern)
    } catch {
      // Vibration not supported
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// Offline Queue Manager
// ═══════════════════════════════════════════════════════════════

const OFFLINE_QUEUE_KEY = 'barcode_offline_queue'

function getOfflineQueue(): OfflineQueueItem[] {
  if (typeof window === 'undefined') return []
  try {
    const stored = localStorage.getItem(OFFLINE_QUEUE_KEY)
    return stored ? JSON.parse(stored) : []
  } catch {
    return []
  }
}

function saveOfflineQueue(queue: OfflineQueueItem[]): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue))
  } catch {
    // Storage full or unavailable
  }
}

function addToOfflineQueue(barcode: string): void {
  const queue = getOfflineQueue()
  if (!queue.find(item => item.barcode === barcode)) {
    queue.push({ barcode, timestamp: Date.now(), status: 'pending' })
    saveOfflineQueue(queue)
  }
}

function processOfflineQueue(): void {
  const queue = getOfflineQueue()
  const pending = queue.filter(item => item.status === 'pending')
  
  if (pending.length > 0 && navigator.onLine) {
    // Process each pending barcode
    pending.forEach(async (item) => {
      try {
        await lookupBarcode(item.barcode)
        item.status = 'processed'
      } catch {
        // Will retry later
      }
    })
    
    saveOfflineQueue(queue)
  }
}

// ═══════════════════════════════════════════════════════════════
// Barcode Lookup
// ═══════════════════════════════════════════════════════════════

async function lookupBarcode(barcode: string): Promise<BarcodeScanResult> {
  try {
    const response = await apiFetch(`/api/barcode-lookup?barcode=${encodeURIComponent(barcode)}`)
    const data = await response.json()

    if (data.found && data.food) {
      return {
        success: true,
        barcode,
        food: {
          id: data.food.id,
          name: data.food.name,
          brand: data.food.brand,
          barcode: data.food.barcode,
          calories: data.food.calories,
          protein: data.food.protein,
          carbs: data.food.carbs,
          fat: data.food.fat,
          fiber: data.food.fiber,
          sugar: data.food.sugar,
          sodium: data.food.sodium,
          servingSize: data.food.servingSize || 100,
          servingUnit: data.food.servingUnit || 'g',
          isVerified: data.food.isVerified,
          source: data.source,
          category: data.food.category,
          origin: data.food.origin,
          image_url: data.food.image_url,
        },
      }
    }

    return {
      success: false,
      barcode,
      error: 'Product not found',
    }
  } catch (error) {
    return {
      success: false,
      barcode,
      error: error instanceof Error ? error.message : 'Lookup failed',
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// Main Hook
// ═══════════════════════════════════════════════════════════════

export function useBarcodeScanner() {
  const [status, setStatus] = useState<ScanStatus>('idle')
  const [lastResult, setLastResult] = useState<BarcodeScanResult | null>(null)
  const [capabilities, setCapabilities] = useState<ScannerCapabilities>({
    hasCamera: false,
    hasNativeScanner: false,
    isNative: false,
    platform: 'web',
  })
  const [offlineQueue, setOfflineQueue] = useState<OfflineQueueItem[]>([])

  const isScanningRef = useRef(false)

  // Initialize capabilities
  useEffect(() => {
    const checkCapabilities = async () => {
      const isNative = Capacitor.isNativePlatform()
      const platform = Capacitor.getPlatform()
      
      let hasCamera = false
      let hasNativeScanner = false

      // Check for camera
      if (typeof navigator !== 'undefined' && navigator.mediaDevices) {
        try {
          const devices = await navigator.mediaDevices.enumerateDevices()
          hasCamera = devices.some(d => d.kind === 'videoinput')
        } catch {
          hasCamera = false
        }
      }

      // Check for native scanner plugin
      if (isNative) {
        try {
          // Check if @capacitor-mlkit/barcode-scanning is available
          // For now, we'll use html5-qrcode with enhanced native-like behavior
          hasNativeScanner = false
        } catch {
          hasNativeScanner = false
        }
      }

      setCapabilities({
        hasCamera,
        hasNativeScanner,
        isNative,
        platform,
      })
    }

    checkCapabilities()

    // Load offline queue - defer setState to avoid cascading renders
    const timer = setTimeout(() => {
      setOfflineQueue(getOfflineQueue().filter(item => item.status === 'pending'))
    }, 0)

    // Process offline queue when online
    const handleOnline = () => {
      processOfflineQueue()
      setOfflineQueue(getOfflineQueue().filter(item => item.status === 'pending'))
    }

    window.addEventListener('online', handleOnline)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('online', handleOnline)
    }
  }, [])

  // Scan barcode from camera
  const scanFromCamera = useCallback(async (): Promise<string | null> => {
    if (!capabilities.hasCamera) {
      setStatus('error')
      setLastResult({ success: false, error: 'No camera available' })
      return null
    }

    return new Promise((resolve) => {
      // The actual camera scanning is handled by the BarcodeScanner component
      // This hook provides the lookup and state management
      setStatus('scanning')
      isScanningRef.current = true
    })
  }, [capabilities.hasCamera])

  // Process scanned barcode
  const processBarcode = useCallback(async (barcode: string): Promise<BarcodeScanResult> => {
    // Validate barcode format
    const cleanBarcode = barcode.replace(/\D/g, '')
    if (cleanBarcode.length < 8 || cleanBarcode.length > 14) {
      const result: BarcodeScanResult = {
        success: false,
        barcode,
        error: 'Invalid barcode format',
      }
      setStatus('error')
      setLastResult(result)
      return result
    }

    setStatus('processing')
    vibrate(50) // Light vibration during processing

    // If offline, add to queue
    if (!navigator.onLine) {
      addToOfflineQueue(cleanBarcode)
      setOfflineQueue(getOfflineQueue().filter(item => item.status === 'pending'))
      
      const result: BarcodeScanResult = {
        success: false,
        barcode: cleanBarcode,
        error: 'You are offline. Barcode saved for later lookup.',
      }
      setStatus('not_found')
      setLastResult(result)
      return result
    }

    const result = await lookupBarcode(cleanBarcode)
    
    if (result.success) {
      // Success vibration pattern: short-long-short
      vibrate([50, 50, 100, 50, 50])
      setStatus('found')
    } else {
      vibrate(200) // Error vibration
      setStatus('not_found')
    }

    setLastResult(result)
    return result
  }, [])

  // Manual barcode entry
  const lookupManual = useCallback(async (barcode: string): Promise<BarcodeScanResult> => {
    return processBarcode(barcode)
  }, [processBarcode])

  // Reset state
  const reset = useCallback(() => {
    setStatus('idle')
    setLastResult(null)
    isScanningRef.current = false
  }, [])

  // Clear offline queue
  const clearOfflineQueue = useCallback(() => {
    saveOfflineQueue([])
    setOfflineQueue([])
  }, [])

  return {
    status,
    lastResult,
    capabilities,
    offlineQueue,
    // Don't return ref.current directly - use the status instead

    // Actions
    scanFromCamera,
    processBarcode,
    lookupManual,
    reset,
    clearOfflineQueue,

    // Utilities
    vibrate,
  }
}

// ═══════════════════════════════════════════════════════════════
// Quick Scan Hook (Simplified for inline scanning)
// ═══════════════════════════════════════════════════════════════

export function useQuickBarcodeScan() {
  const [isScanning, setIsScanning] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  const scan = useCallback(async (barcode: string): Promise<ScannedFood | null> => {
    setIsLoading(true)
    vibrate(50)

    try {
      const result = await lookupBarcode(barcode)
      
      if (result.success && result.food) {
        vibrate([50, 50, 100])
        return result.food
      }
      
      vibrate(200)
      return null
    } finally {
      setIsLoading(false)
    }
  }, [])

  return {
    isScanning,
    isLoading,
    scan,
    setIsScanning,
  }
}

export default useBarcodeScanner
