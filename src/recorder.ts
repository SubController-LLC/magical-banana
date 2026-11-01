// Browser speech recognition may use the browser vendor's cloud service.
// Audio blobs themselves are kept on this device in IndexedDB.
interface SpeechResult {
  isFinal: boolean;
  [index: number]: { transcript: string };
}
interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult:
    ((e: { resultIndex: number; results: SpeechResult[] }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
declare global {
  interface Window {
    SpeechRecognition?: new () => Recognition;
    webkitSpeechRecognition?: new () => Recognition;
  }
}
export interface Capture {
  stop: () => Promise<{ blob: Blob; text: string }>;
  cancel: () => void;
}
export async function capture(
  onText: (text: string) => void,
  onError: (message: string) => void,
): Promise<Capture> {
  if (
    !navigator.mediaDevices?.getUserMedia ||
    typeof MediaRecorder === "undefined"
  )
    throw new Error(
      "このブラウザは録音に対応していません。文字入力で遊べます。",
    );
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const mime = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm"].find((m) =>
    MediaRecorder.isTypeSupported(m),
  );
  const recorder = new MediaRecorder(
    stream,
    mime ? { mimeType: mime } : undefined,
  );
  let speech: Recognition | undefined;
  let text = "";
  let closed = false;
  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size) chunks.push(e.data);
  };
  const done = new Promise<Blob>((resolve, reject) => {
    recorder.onstop = () =>
      resolve(new Blob(chunks, { type: recorder.mimeType || "audio/webm" }));
    recorder.onerror = () => reject(new Error("録音に失敗しました。"));
  });
  const Speech = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (Speech) {
    speech = new Speech();
    speech.lang = "ja-JP";
    speech.continuous = true;
    speech.interimResults = true;
    speech.onresult = (e) => {
      if (closed) return;
      text = Array.from(e.results)
        .map((r) => r[0].transcript)
        .join("");
      onText(text);
    };
    speech.onerror = (e) => {
      if (!closed && e.error !== "aborted")
        onError(
          "文字起こしができませんでした。録音は保存できるので、文字を入力してください。",
        );
    };
    try {
      speech.start();
    } catch {
      onError("文字起こしを開始できませんでした。文字入力も使えます。");
    }
  } else
    onError(
      "このブラウザは自動文字起こし非対応です。録音後に文字を入力してください。",
    );
  try {
    recorder.start();
  } catch (e) {
    speech?.abort();
    stream.getTracks().forEach((t) => t.stop());
    throw e;
  }
  function stopTracks() {
    stream.getTracks().forEach((t) => t.stop());
  }
  let result: Promise<{ blob: Blob; text: string }> | undefined;
  return {
    stop: () => {
      if (result) return result;
      closed = true;
      speech?.stop();
      if (recorder.state !== "inactive") recorder.stop();
      stopTracks();
      result = done.then((blob) => ({ blob, text }));
      return result;
    },
    cancel: () => {
      closed = true;
      speech?.abort();
      if (recorder.state !== "inactive") recorder.stop();
      stopTracks();
      void done.catch(() => {});
    },
  };
}
