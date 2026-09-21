export function inquiryProviderLabel(provider: string | null | undefined): string {
  if (provider === "local") return "Parser lokal (tanpa LLM)";
  if (provider === "mock") return "Demo (mock)";
  if (provider?.startsWith("ollama:") || provider === "ollama") return "Ollama lokal";
  return "Provider belum tercatat";
}

export function documentProviderLabel(provider: string | null): string {
  switch (provider) {
    case "tesseract": return "Tesseract lokal";
    case "ollama": return "Ollama Vision lokal";
    case "pdf-text": return "Teks PDF";
    case "text-file": return "File teks";
    default: return "Pembaca dokumen belum tercatat";
  }
}
