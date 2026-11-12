import { useEffect, useState, useCallback } from 'react';

export interface UseTallyNavigationProps {
  isModalOpen?: boolean;
  closeActiveModal?: () => void;
  activeView: string;
  setActiveView: (view: string) => void;
  activeCompany: any;
  setActiveCompany: (company: any) => void;
  onLogout: () => void;
  defaultView?: string;
}

export const useTallyNavigation = ({
  isModalOpen = false,
  closeActiveModal,
  activeView,
  setActiveView,
  activeCompany,
  setActiveCompany,
  onLogout,
  defaultView = 'dashboard',
}: UseTallyNavigationProps) => {
  const [showQuitModal, setShowQuitModal] = useState<boolean>(false);

  // Step-back navigation logic for both '<=' button and Esc key
  const handleStepBack = useCallback(() => {
    // 1. Jo koi form/modal khullo hoy to fakt te close thashe
    if (isModalOpen && closeActiveModal) {
      closeActiveModal();
      return;
    }

    // 2. Jo Quit modal pehlethi open hoy to cancel thashe
    if (showQuitModal) {
      setShowQuitModal(false);
      return;
    }

    // 3. Sub-pages (Selling, Buying, Stock, Ledger) -> Return to Dashboard
    if (activeView !== defaultView) {
      setActiveView(defaultView);
      return;
    }

    // 4. Company Dashboard -> Return to Company Selection Workspace
    if (activeCompany) {
      setActiveCompany(null);
      return;
    }

    // 5. Root Level (Company Select screen) par pachhi Esc maro tyare quit confirm popup aavshe
    setShowQuitModal(true);
  }, [
    isModalOpen,
    closeActiveModal,
    showQuitModal,
    activeView,
    defaultView,
    setActiveView,
    activeCompany,
    setActiveCompany,
  ]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Input boxes, textarea ke select ma type karti vakhate key events ignore thashe
      const target = e.target as HTMLElement;
      const isInput =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable;

      // Handle Quit Confirmation popup shortcuts
      if (showQuitModal) {
        if (e.key === 'Enter' || e.key.toLowerCase() === 'y') {
          e.preventDefault();
          setShowQuitModal(false);
          onLogout();
          return;
        }
        if (e.key === 'Escape' || e.key.toLowerCase() === 'n') {
          e.preventDefault();
          setShowQuitModal(false);
          return;
        }
      }

      // Escape key navigation
      if (e.key === 'Escape') {
        if (isInput && !isModalOpen) {
          // Input field focus mathi bahar aavva devu
          (target as HTMLElement).blur();
          return;
        }
        e.preventDefault();
        handleStepBack();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showQuitModal, onLogout, isModalOpen, handleStepBack]);

  return {
    showQuitModal,
    setShowQuitModal,
    handleStepBack,
  };
};