import { useEffect, useSyncExternalStore } from "react";
import { LibraryController } from "../lib/library";

let controller: LibraryController | undefined;
export function getLibraryController(): LibraryController {
  controller ??= new LibraryController();
  return controller;
}

export function useLibrary() {
  const library = getLibraryController();
  const state = useSyncExternalStore(
    library.subscribe,
    library.getSnapshot,
    library.getSnapshot,
  );
  useEffect(() => {
    void library.initialize();
    const flush = () => {
      void library.flush();
    };
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
    };
  }, [library]);
  return {
    ...state,
    savePreset: library.savePreset,
    deletePreset: library.deletePreset,
    toggleFavorite: library.toggleFavorite,
    createConversation: library.createConversation,
    deleteConversation: library.deleteConversation,
    updateSettings: library.updateSettings,
    setConversationModel: library.setConversationModel,
    sendMessage: library.sendMessage,
    stopGeneration: library.stopGeneration,
    retryMessage: library.retryMessage,
    clearError: library.clearError,
    importData: library.importData,
    exportData: library.exportData,
  };
}

export type Library = ReturnType<typeof useLibrary>;
