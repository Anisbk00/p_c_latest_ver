'use client';

import { createContext, useContext, useState, useEffect, useCallback, ReactNode, useRef } from 'react';
import { useSupabaseAuth } from '@/lib/supabase/auth-context';
import { apiFetch } from '@/lib/mobile-api';

interface SetupContextType {
  needsSetup: boolean;
  isLoading: boolean;
  showSetupModal: boolean;
  openSetupModal: () => void;
  closeSetupModal: (completed: boolean) => void;
  refreshSetupStatus: () => Promise<void>;
}

const SetupContext = createContext<SetupContextType | null>(null);

export function SetupProvider({ children }: { children: ReactNode }) {
  const { user, isAuthenticated, isLoading: authLoading } = useSupabaseAuth();
  const [needsSetup, setNeedsSetup] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [showSetupModal, setShowSetupModal] = useState(false);
  
  // Track if we've already checked setup status to prevent auto-show on re-renders
  const hasCheckedSetup = useRef(false);
  // Track if modal was explicitly closed to prevent re-showing
  const wasModalClosed = useRef(false);

  const checkSetupStatus = useCallback(async () => {
    // Skip if not authenticated or still loading auth
    if (!user || !isAuthenticated || authLoading) {
      setNeedsSetup(false);
      setIsLoading(false);
      return;
    }

    try {
      // Supabase uses cookies for auth, no Authorization header needed
      const response = await apiFetch('/api/setup/status');

      if (response.ok) {
        const data = await response.json();
        setNeedsSetup(data.needsSetup);
        
        // Only auto-show modal if:
        // 1. Setup is needed
        // 2. We haven't checked before (first time after auth)
        // 3. User hasn't explicitly closed the modal
        if (data.needsSetup && !hasCheckedSetup.current && !wasModalClosed.current) {
          setShowSetupModal(true);
        }
        
        hasCheckedSetup.current = true;
      } else if (response.status === 401) {
        // Not authenticated - reset state
        setNeedsSetup(false);
      }
    } catch (error) {
      console.error('Failed to check setup status:', error);
    } finally {
      setIsLoading(false);
    }
  }, [user, isAuthenticated, authLoading]);

  // Check setup status when auth state stabilizes
  useEffect(() => {
    // Wait for auth to finish loading before checking setup
    if (authLoading) {
      setIsLoading(true);
      return;
    }
    
    if (isAuthenticated && user) {
      checkSetupStatus();
    } else {
      // Reset state when logged out
      setNeedsSetup(false);
      setIsLoading(false);
      hasCheckedSetup.current = false;
      wasModalClosed.current = false;
    }
  }, [isAuthenticated, user, authLoading, checkSetupStatus]);

  const openSetupModal = useCallback(() => {
    setShowSetupModal(true);
    wasModalClosed.current = false;
  }, []);

  const closeSetupModal = useCallback((completed: boolean) => {
    setShowSetupModal(false);
    if (completed) {
      setNeedsSetup(false);
    }
    // Mark that user has closed the modal to prevent auto-showing again
    wasModalClosed.current = true;
  }, []);

  const refreshSetupStatus = useCallback(async () => {
    setIsLoading(true);
    hasCheckedSetup.current = false;
    await checkSetupStatus();
  }, [checkSetupStatus]);

  return (
    <SetupContext.Provider
      value={{
        needsSetup,
        isLoading,
        showSetupModal,
        openSetupModal,
        closeSetupModal,
        refreshSetupStatus,
      }}
    >
      {children}
    </SetupContext.Provider>
  );
}

export function useSetup() {
  const context = useContext(SetupContext);
  if (!context) {
    throw new Error('useSetup must be used within a SetupProvider');
  }
  return context;
}
