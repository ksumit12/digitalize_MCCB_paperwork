"use client";

type PaddleCtor = {
  create: (options: Record<string, unknown>) => Promise<PaddleEngine>;
};

export type PaddleEngine = {
  predict: (
    image: HTMLCanvasElement | ImageBitmap | Blob,
    params?: Record<string, unknown>,
  ) => Promise<
    {
      items?: { text?: string; score?: number }[];
      metrics?: { totalMs?: number; detMs?: number; recMs?: number };
    }[]
  >;
};

let engine: PaddleEngine | null = null;
let loading: Promise<PaddleEngine> | null = null;

function importCdn<T>(url: string): Promise<T> {
  return new Function("u", "return import(u)")(url) as Promise<T>;
}

function quietOrtLogs() {
  const w = window as Window & { __mccbOrtQuiet?: boolean };
  if (w.__mccbOrtQuiet) return;
  w.__mccbOrtQuiet = true;
  const warn = console.warn.bind(console);
  const log = console.log.bind(console);
  const skip = (args: unknown[]) =>
    args.some((a) => typeof a === "string" && a.includes("CleanUnusedInitializersAndNodeArgs"));
  console.warn = (...args: unknown[]) => {
    if (skip(args)) return;
    warn(...args);
  };
  console.log = (...args: unknown[]) => {
    if (skip(args)) return;
    log(...args);
  };
}

export async function getPaddleOcr(): Promise<PaddleEngine> {
  if (engine) return engine;
  if (!loading) {
    loading = (async () => {
      quietOrtLogs();
      try {
        const ort = await importCdn<{ env?: { logLevel?: string } }>(
          "https://cdn.jsdelivr.net/npm/onnxruntime-web/dist/ort.min.mjs",
        );
        if (ort.env) ort.env.logLevel = "fatal";
      } catch {
        /* Paddle still loads its own ORT copy */
      }
      const { PaddleOCR } = await importCdn<{ PaddleOCR: PaddleCtor }>(
        "https://cdn.jsdelivr.net/npm/@paddleocr/paddleocr-js@0.4.2/+esm",
      );
      const ortOptions = {
        backend: "auto",
        wasmPaths: "https://cdn.jsdelivr.net/npm/onnxruntime-web/dist/",
        numThreads: 1,
      };
      try {
        engine = await PaddleOCR.create({
          textDetectionModelName: "PP-OCRv6_tiny_det",
          textRecognitionModelName: "PP-OCRv6_tiny_rec",
          textDetLimitSideLen: 480,
          textRecognitionBatchSize: 1,
          ortOptions,
        });
      } catch {
        engine = await PaddleOCR.create({
          lang: "en",
          ocrVersion: "PP-OCRv5",
          textDetLimitSideLen: 480,
          ortOptions,
        });
      }
      return engine;
    })();
  }
  return loading;
}

export function formatPaddleItems(items: { text?: string; score?: number }[] | undefined) {
  if (!items?.length) return "";
  return items.map((item) => `${item.text ?? ""} (${Math.round((item.score ?? 0) * 100)}%)`).join("\n");
}
