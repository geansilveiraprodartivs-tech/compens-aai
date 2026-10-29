// Reconhecimento de voz do CompensAI.
//
// Ordem de preferência:
//   1. Plugin nativo "SpeechRecognition" (app Android). O WebView do Android
//      NÃO implementa a Web Speech API, então no APK usamos o SpeechRecognizer
//      do próprio aparelho (sem custo e sem serviço externo).
//   2. Web Speech API do navegador (Chrome/Edge no desktop e no Android).
//   3. Sem suporte: createSpeechEngine() devolve null e a interface avisa,
//      mantendo as opções de texto e foto funcionando.

export type SpeechHandlers = {
  onStart: () => void;
  onPartial: (text: string) => void;
  onFinal: (text: string) => void;
  onError: (code: string) => void;
  onEnd: () => void;
};

export type SpeechEngine = {
  kind: "native" | "web";
  start: (handlers: SpeechHandlers) => void;
  stop: () => void;
  abort: () => void;
  /** Abre as configurações do app (só faz sentido no APK). */
  openSettings: () => void;
  dispose: () => void;
};

const LANGUAGE = "pt-BR";

/* ----------------------------------------------------------- plugin nativo */

type ListenerHandle = { remove: () => void | Promise<void> };

type NativePlugin = {
  available: () => Promise<{ available: boolean }>;
  start: (options: { language: string }) => Promise<void>;
  stop: () => Promise<void>;
  cancel: () => Promise<void>;
  openSettings: () => Promise<void>;
  addListener: (
    event: string,
    callback: (data: Record<string, unknown>) => void,
  ) => Promise<ListenerHandle>;
};

type CapacitorGlobal = {
  isNativePlatform?: () => boolean;
  Plugins?: Record<string, unknown>;
};

function nativePlugin(): NativePlugin | null {
  if (typeof window === "undefined") return null;
  const capacitor = (window as Window & { Capacitor?: CapacitorGlobal }).Capacitor;
  if (!capacitor?.isNativePlatform?.()) return null;
  const plugin = capacitor.Plugins?.["SpeechRecognition"];
  return (plugin as NativePlugin | undefined) ?? null;
}

class NativeEngine implements SpeechEngine {
  readonly kind = "native" as const;
  private handlers: SpeechHandlers | null = null;
  private handles: ListenerHandle[] = [];
  private bound = false;
  private disposed = false;

  constructor(private readonly plugin: NativePlugin) {}

  private async bind(event: string, callback: (data: Record<string, unknown>) => void) {
    try {
      const handle = await this.plugin.addListener(event, callback);
      if (this.disposed) void handle.remove();
      else this.handles.push(handle);
    } catch {
      // sem eventos: o fluxo degrada para "sem resultado"
    }
  }

  private async ensureListeners() {
    if (this.bound) return;
    this.bound = true;
    await Promise.all([
      this.bind("start", () => this.handlers?.onStart()),
      this.bind("partial", (data) => this.handlers?.onPartial(String(data["transcript"] ?? ""))),
      this.bind("final", (data) => this.handlers?.onFinal(String(data["transcript"] ?? ""))),
      this.bind("error", (data) => this.handlers?.onError(String(data["code"] ?? "unknown"))),
      this.bind("end", () => this.handlers?.onEnd()),
    ]);
  }

  start(handlers: SpeechHandlers) {
    this.handlers = handlers;
    void this.run(handlers);
  }

  private async run(handlers: SpeechHandlers) {
    try {
      await this.ensureListeners();
      const status = await this.plugin.available();
      if (!status.available) {
        handlers.onError("unavailable");
        handlers.onEnd();
        return;
      }
      await this.plugin.start({ language: LANGUAGE });
    } catch (error) {
      const code =
        (error as { code?: string } | null)?.code ??
        (error instanceof Error && error.message ? "start-failed" : "unknown");
      handlers.onError(code);
      handlers.onEnd();
    }
  }

  stop() {
    void this.plugin.stop().catch(() => undefined);
  }

  abort() {
    this.handlers = null;
    void this.plugin.cancel().catch(() => undefined);
  }

  openSettings() {
    void this.plugin.openSettings().catch(() => undefined);
  }

  dispose() {
    this.disposed = true;
    this.abort();
    for (const handle of this.handles) void handle.remove();
    this.handles = [];
  }
}

/* --------------------------------------------------------- Web Speech API */

type RecognitionResult = { isFinal: boolean; readonly 0: { transcript: string } };
type RecognitionEvent = { resultIndex: number; results: ArrayLike<RecognitionResult> };
type RecognitionError = { error: string };
type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onstart: (() => void) | null;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: ((event: RecognitionError) => void) | null;
  onend: (() => void) | null;
};
type RecognitionCtor = new () => Recognition;

function webCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const view = window as Window & {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return view.SpeechRecognition ?? view.webkitSpeechRecognition ?? null;
}

class WebEngine implements SpeechEngine {
  readonly kind = "web" as const;
  private recognizer: Recognition | null = null;

  start(handlers: SpeechHandlers) {
    const Ctor = webCtor();
    if (!Ctor) {
      handlers.onError("unavailable");
      return;
    }

    this.abort();

    const recognizer = new Ctor();
    recognizer.lang = LANGUAGE;
    recognizer.continuous = true;
    recognizer.interimResults = true;
    recognizer.maxAlternatives = 1;

    recognizer.onstart = () => handlers.onStart();

    recognizer.onresult = (event) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        if (!result) continue;
        const text = result[0]?.transcript ?? "";
        if (result.isFinal) handlers.onFinal(text);
        else interim += ` ${text}`;
      }
      const partial = interim.replace(/\s+/g, " ").trim();
      if (partial) handlers.onPartial(partial);
    };

    recognizer.onerror = (event) => {
      if (event.error === "aborted") return;
      handlers.onError(event.error || "unknown");
    };

    recognizer.onend = () => handlers.onEnd();

    this.recognizer = recognizer;
    try {
      recognizer.start();
    } catch {
      this.recognizer = null;
      handlers.onError("start-failed");
      handlers.onEnd();
    }
  }

  stop() {
    try {
      this.recognizer?.stop();
    } catch {
      // já encerrado
    }
  }

  abort() {
    const recognizer = this.recognizer;
    this.recognizer = null;
    if (!recognizer) return;
    recognizer.onstart = null;
    recognizer.onresult = null;
    recognizer.onerror = null;
    recognizer.onend = null;
    try {
      recognizer.abort();
    } catch {
      // já encerrado
    }
  }

  openSettings() {
    // no navegador a permissão é do site, tratada pelo próprio navegador
  }

  dispose() {
    this.abort();
  }
}

/* -------------------------------------------------------------- fábrica */

/** Há algum mecanismo de voz utilizável nesta plataforma? */
export function isSpeechSupported(): boolean {
  return nativePlugin() !== null || webCtor() !== null;
}

/** O reconhecimento em uso é o nativo do app? */
export function isNativeSpeech(): boolean {
  return nativePlugin() !== null;
}

export function createSpeechEngine(): SpeechEngine | null {
  const plugin = nativePlugin();
  if (plugin) return new NativeEngine(plugin);
  const Ctor = webCtor();
  if (Ctor) return new WebEngine();
  return null;
}
