export type Lang = "en" | "it";

export function getLang(): Lang {
  if (typeof window === "undefined") return "en";
  return (localStorage.getItem("vela_lang") as Lang) ?? "en";
}

export function setLang(lang: Lang) {
  if (typeof window === "undefined") return;
  localStorage.setItem("vela_lang", lang);
}

// ── All Vela chat strings ─────────────────────────────────────────────────────
export const T = {
  en: {
    // Greeting
    greeting:
      "Hi! I'm Vela, your investment assistant. I can help you add holdings, analyse your portfolio, or answer questions about your investments. What would you like to do?",

    // Add flow
    askTicker:
      "Sure! What stock or ETF would you like to add? Say the company name or ticker symbol.",
    lookingUp: "Looking that up for you…",
    foundTicker: (name: string, symbol: string) =>
      `Found it — ${name} (${symbol}). How many shares did you buy?`,
    tickerNotFound: (q: string) =>
      `I couldn't find "${q}". Try the ticker symbol directly — for example: AAPL for Apple, NVDA for NVIDIA.`,
    askShares:
      "I didn't catch a valid number. How many shares did you buy?",
    gotShares: (n: number) =>
      `Got it — ${n} shares. What was your average purchase price per share?`,
    askCost:
      "I didn't catch a valid price. What was the cost per share? For example: 160, or 23.50.",
    gotCost: (n: number) =>
      `Perfect — $${n.toFixed(2)} per share. When did you buy them? For example: March 2023 or 15 January 2024.`,

    // Confirm
    confirmSummary: (
      name: string, ticker: string,
      shares: number, cost: number, date: string
    ) =>
      `Here's what I have:\n\n` +
      `• Stock: ${name} (${ticker})\n` +
      `• Shares: ${shares}\n` +
      `• Price per share: $${cost.toFixed(2)}\n` +
      `• Purchase date: ${date}\n\n` +
      `Shall I add this to your portfolio?`,
    confirmRepeat: (shares: number, name: string, cost: number) =>
      `Say yes to confirm adding ${shares} shares of ${name} at $${cost.toFixed(2)}, or no to cancel.`,

    // Save
    saving: "Perfect! Saving to your portfolio now…",
    saved: (shares: number, name: string, ticker: string) =>
      `Done! ${shares} shares of ${name} (${ticker}) have been added to your portfolio. Head back to the Portfolio tab to see them live. Anything else I can help with?`,
    saveError:
      "Sorry, something went wrong saving that. Please try again.",
    startOver:
      "No problem — let's start over. What would you like to add?",

    // Mic / UI
    inputPlaceholder: "Type a message…",
    listeningPlaceholder: "Recording… tap ■ to stop",
    processingPlaceholder: "Processing…",
    listeningHint: "🔴 Recording — tap ■ when done",
    processingHint: "✨ Processing your voice…",
    thinkingLabel: "Thinking…",
    processingAudioLabel: "Processing audio…",
    micDenied:
      "Microphone access was denied. Please allow it in your browser settings.",
    micNetwork:
      "Voice recognition needs a stable internet connection. Please try again or type your message.",
    micError: (e: string) =>
      `Voice error (${e}). Please type your message instead.`,
    noAudio:
      "No audio was captured. Please try again.",
    transcriptEmpty:
      "I didn't catch that. Please try again or type your message.",
    transcriptError: (e: string) =>
      `Voice processing failed: ${e}. Please type your message.`,
    aiError: "I couldn't reach the AI right now. Please check your connection and try again.",

    // Confirm buttons
    confirmYes: "✓ Yes, add it",
    confirmNo:  "✕ No, cancel",

    // Header
    headerSubtitle: "Powered by Groq AI",
    voiceOn: "🔊 Voice on",
    muted:   "🔇 Muted",
  },

  it: {
    // Greeting
    greeting:
      "Ciao! Sono Vela, la tua assistente agli investimenti. Posso aiutarti ad aggiungere titoli, analizzare il portafoglio o rispondere alle tue domande. Come posso aiutarti?",

    // Add flow
    askTicker:
      "Certo! Quale azione o ETF vuoi aggiungere? Di' il nome dell'azienda o il simbolo del ticker.",
    lookingUp: "Lo sto cercando per te…",
    foundTicker: (name: string, symbol: string) =>
      `Trovato — ${name} (${symbol}). Quante azioni hai acquistato?`,
    tickerNotFound: (q: string) =>
      `Non ho trovato "${q}". Prova il simbolo del ticker direttamente — ad esempio: AAPL per Apple, NVDA per NVIDIA.`,
    askShares:
      "Non ho capito il numero. Quante azioni hai acquistato?",
    gotShares: (n: number) =>
      `Capito — ${n} azioni. Qual era il prezzo medio di acquisto per azione?`,
    askCost:
      "Non ho capito il prezzo. Qual era il costo per azione? Ad esempio: 160, oppure 23.50.",
    gotCost: (n: number) =>
      `Perfetto — $${n.toFixed(2)} per azione. Quando le hai acquistate? Ad esempio: marzo 2023 o 15 gennaio 2024.`,

    // Confirm
    confirmSummary: (
      name: string, ticker: string,
      shares: number, cost: number, date: string
    ) =>
      `Ecco i dati:\n\n` +
      `• Titolo: ${name} (${ticker})\n` +
      `• Azioni: ${shares}\n` +
      `• Prezzo per azione: $${cost.toFixed(2)}\n` +
      `• Data acquisto: ${date}\n\n` +
      `Vuoi aggiungere questo al tuo portafoglio?`,
    confirmRepeat: (shares: number, name: string, cost: number) =>
      `Di' sì per confermare l'aggiunta di ${shares} azioni di ${name} a $${cost.toFixed(2)}, oppure no per annullare.`,

    // Save
    saving: "Perfetto! Sto salvando nel tuo portafoglio…",
    saved: (shares: number, name: string, ticker: string) =>
      `Fatto! ${shares} azioni di ${name} (${ticker}) sono state aggiunte al tuo portafoglio. Torna alla scheda Portafoglio per vederle in tempo reale. Posso aiutarti con altro?`,
    saveError:
      "Spiacente, qualcosa è andato storto. Riprova.",
    startOver:
      "Nessun problema — ricominciamo. Cosa vuoi aggiungere?",

    // Mic / UI
    inputPlaceholder: "Scrivi un messaggio…",
    listeningPlaceholder: "Registrazione… tocca ■ per fermare",
    processingPlaceholder: "Elaborazione…",
    listeningHint: "🔴 Registrazione — tocca ■ quando hai finito",
    processingHint: "✨ Elaboro la tua voce…",
    thinkingLabel: "Sto pensando…",
    processingAudioLabel: "Elaborazione audio…",
    micDenied:
      "Accesso al microfono negato. Abilitalo nelle impostazioni del browser.",
    micNetwork:
      "Il riconoscimento vocale richiede una connessione stabile. Riprova o scrivi il messaggio.",
    micError: (e: string) =>
      `Errore voce (${e}). Scrivi il messaggio invece.`,
    noAudio:
      "Nessun audio registrato. Riprova.",
    transcriptEmpty:
      "Non ho capito. Riprova o scrivi il messaggio.",
    transcriptError: (e: string) =>
      `Elaborazione voce fallita: ${e}. Scrivi il messaggio.`,
    aiError: "Non riesco a connettermi all'AI. Controlla la connessione e riprova.",

    // Confirm buttons
    confirmYes: "✓ Sì, aggiungi",
    confirmNo:  "✕ No, annulla",

    // Header
    headerSubtitle: "Powered by Groq AI",
    voiceOn: "🔊 Voce attiva",
    muted:   "🔇 Muto",
  },
} as const;

// ── Add-intent: only fires when the user is RECORDING a purchase, not asking for advice ──
// "I bought AAPL" ✓  |  "add Apple to my portfolio" ✓  |  "what should I buy?" ✗
export const ADD_INTENT_REGEX: Record<Lang, RegExp> = {
  en: /\b(?:I\s+(?:just\s+)?(?:bought|purchased|got|picked\s+up|invested\s+in)|add(?:ing)?\s+(?:\w+\s+){0,4}(?:to|into)\s+(?:my\s+)?(?:portfolio|holdings?)|record(?:ing)?\s+(?:a\s+|my\s+)?(?:purchase|buy|holding|position)|insert(?:ing)?\s+(?:a\s+|this\s+)?(?:holding|stock|position))\b/i,
  it: /\b(?:ho\s+(?:appena\s+)?(?:comprato|acquistato|preso|investito(?:\s+in)?)|aggiungi\s+(?:\w+\s+){0,4}(?:al|nel)\s+(?:mio\s+)?portafoglio|registra(?:re)?\s+(?:un|il|questo)?\s*(?:mio\s+)?(?:acquisto|compra)|inserisci\s+(?:un|questo)?\s*(?:titolo|azione))\b/i,
};

// Note: avoid \b around accented chars (ì, à etc.) — JS \b only works on ASCII word chars.
// Instead match as substrings alongside ASCII alternatives.
export const CONFIRM_YES_REGEX: Record<Lang, RegExp> = {
  en: /\b(yes|confirm|correct|ok|sure|add it|go ahead|yep|yeah)\b/i,
  it: /\b(si|ok|certo|confermo|giusto|aggiungilo|vai|procedi|yes)\b|sì|aggiungi/i,
};

export const CONFIRM_NO_REGEX: Record<Lang, RegExp> = {
  en: /\b(no|cancel|wrong|restart|start over|nope)\b/i,
  it: /\b(no|annulla|sbagliato|ricomincia|cancella|nope)\b/i,
};

// ── Voice locale ─────────────────────────────────────────────────────────────
export const VOICE_LOCALE: Record<Lang, string> = {
  en: "en-US",
  it: "it-IT",
};

export const SPEECH_LOCALE: Record<Lang, string> = {
  en: "en-GB",
  it: "it-IT",
};
