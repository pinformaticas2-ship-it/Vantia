import React, { createContext, useContext, useMemo, useState } from "react";

// Contexto minimo: solo indica si ESTE usuario tiene una importacion de
// documentos (cedula -> expediente) en curso, para que el icono de
// "Expedientes" en el sidebar muestre un spinner mientras tanto. No hace
// falta polling a backend -- el propio flujo de subida en ExpedienteList.tsx
// marca inicio/fin directamente.
interface DocumentProcessingCtx {
  isProcessing: boolean;
  setProcessing: (value: boolean) => void;
}

const DocumentProcessingContext = createContext<DocumentProcessingCtx>({
  isProcessing: false,
  setProcessing: () => {},
});

export function DocumentProcessingProvider({ children }: { children: React.ReactNode }) {
  const [isProcessing, setIsProcessing] = useState(false);
  const value = useMemo(() => ({ isProcessing, setProcessing: setIsProcessing }), [isProcessing]);
  return (
    <DocumentProcessingContext.Provider value={value}>
      {children}
    </DocumentProcessingContext.Provider>
  );
}

export const useDocumentProcessing = () => useContext(DocumentProcessingContext);
