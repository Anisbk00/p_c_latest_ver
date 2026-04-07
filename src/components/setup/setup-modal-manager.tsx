'use client';

import { FinishSetupModal } from './finish-setup-modal';
import { useSetup } from '@/contexts/setup-context';
import { useSupabaseAuth } from '@/lib/supabase/auth-context';

/**
 * Setup Modal Manager
 * 
 * Renders the FinishSetupModal when needed.
 * This component is placed in the layout and handles showing/hiding the modal.
 */
export function SetupModalManager() {
  const { isAuthenticated } = useSupabaseAuth();
  const { showSetupModal, closeSetupModal } = useSetup();

  // Don't render if not authenticated
  if (!isAuthenticated) {
    return null;
  }

  return (
    <FinishSetupModal
      isOpen={showSetupModal}
      onClose={closeSetupModal}
      showSkip={false}
    />
  );
}

export default SetupModalManager;
