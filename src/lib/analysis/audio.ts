// On-device voice measurements while recording. Nothing leaves the phone.
// Reads the mic track with the Web Audio API every 25 ms and works out, after the take:
//  - when they started talking (the hook), talk time vs silence, long pauses
//  - an estimated pace, from syllable beats in the loudness envelope (no transcript needed)
//  - how lively the voice is: pitch range and loudness variety

export type AudioStats = {
  seconds: number;
  /** Seconds before the first word. */
  startDelay: number | null;
  /** Share of the speaking span with voice in it (0-1). */
  talkRatio: number;
  /** Pauses of 0.6 s or more, and of 2 s or more, between first and last word. */
  pauses: number;
  longPauses: number;
  longestPause: number;
  /** Estimated words per minute over the speaking span. */
  wpm: number | null;
  /** Pitch spread in semitones (higher = more expressive), null if too little voice. */
  pitchRange: number | null;
  /** Loudness spread in dB over voiced frames. */
  loudnessRange: number | null;
  speakingSeconds: number;
};

const FRAME_MS = 25;
const SYLLABLES_PER_WORD = 1.45;

export class AudioMeter {
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private buf = new Float32Array(1024);
  private rms: number[] = [];
  private pitch: (number | null)[] = [];
  /** Real time of each frame: browsers throttle timers, so never assume a fixed step. */
  private times: number[] = [];
  private frame = 0;

  start(stream: MediaStream) {
    if (!stream.getAudioTracks().length) return;
    try {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctx();
      const source = this.ctx.createMediaStreamSource(new MediaStream(stream.getAudioTracks()));
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 1024;
      source.connect(this.analyser);
      void this.ctx.resume();
    } catch {
      this.ctx = null;
      return;
    }
    this.timer = setInterval(() => this.sample(), FRAME_MS);
  }

  private sample() {
    const a = this.analyser;
    if (!a || !this.ctx) return;
    a.getFloatTimeDomainData(this.buf);
    let sum = 0;
    for (let i = 0; i < this.buf.length; i++) sum += this.buf[i] * this.buf[i];
    const rms = Math.sqrt(sum / this.buf.length);
    this.rms.push(rms);
    this.times.push(performance.now() / 1000);
    // Pitch every 4th frame (100 ms) keeps the CPU cost low on phones.
    this.pitch.push(this.frame++ % 4 === 0 && rms > 0.01 ? detectPitch(this.buf, this.ctx.sampleRate) : null);
  }

  stop(): AudioStats | null {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    void this.ctx?.close().catch(() => {});
    this.ctx = null;
    return this.rms.length > 20 ? summarise(this.rms, this.pitch, this.times) : null;
  }
}

/** Autocorrelation pitch estimate (75-400 Hz), or null when the frame isn't clearly voiced. */
function detectPitch(buf: Float32Array, sampleRate: number): number | null {
  const minLag = Math.floor(sampleRate / 400);
  const maxLag = Math.min(Math.floor(sampleRate / 75), buf.length - 256);
  const n = 512;
  let best = -1;
  let bestLag = 0;
  let energy = 0;
  for (let i = 0; i < n; i++) energy += buf[i] * buf[i];
  if (!energy) return null;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let c = 0;
    for (let i = 0; i < n; i++) c += buf[i] * buf[i + lag];
    if (c > best) {
      best = c;
      bestLag = lag;
    }
  }
  return best / energy > 0.5 && bestLag ? sampleRate / bestLag : null;
}

const pct = (xs: number[], p: number) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
};
const sd = (xs: number[]) => {
  if (xs.length < 2) return 0;
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length);
};

function summarise(rms: number[], pitch: (number | null)[], times: number[]): AudioStats {
  const at = (i: number) => times[i] - times[0];
  const between = (a: number, b: number) => times[b] - times[a];
  const noise = pct(rms, 10);
  const thresh = Math.max(noise * 3, pct(rms, 90) * 0.22, 0.004);
  const voiced = rms.map((r) => r > thresh);

  // First and last word: 3 voiced frames in a row, so a click or breath doesn't count.
  const run = (i: number) => voiced[i] && voiced[i + 1] && voiced[i + 2];
  let first = -1;
  for (let i = 0; i < voiced.length - 2; i++) if (run(i)) {
    first = i;
    break;
  }
  let last = -1;
  for (let i = voiced.length - 3; i >= 0; i--) if (run(i)) {
    last = i + 2;
    break;
  }
  const seconds = at(rms.length - 1) + FRAME_MS / 1000;
  if (first < 0 || last <= first)
    return { seconds, startDelay: null, talkRatio: 0, pauses: 0, longPauses: 0, longestPause: 0, wpm: null, pitchRange: null, loudnessRange: null, speakingSeconds: 0 };

  // Pauses between the first and last word.
  let pauses = 0;
  let longPauses = 0;
  let longest = 0;
  let gapStart = -1;
  let talk = 0;
  for (let i = first; i <= last; i++) {
    if (voiced[i]) {
      talk += i > first ? between(i - 1, i) : 0;
      if (gapStart >= 0) {
        const g = between(gapStart, i);
        if (g >= 0.6) pauses++;
        if (g >= 2) longPauses++;
        longest = Math.max(longest, g);
      }
      gapStart = -1;
    } else if (gapStart < 0) gapStart = i;
  }
  const span = between(first, last) || FRAME_MS / 1000;

  // Syllable beats: peaks in the smoothed loudness that rise clearly above the dip before them.
  const smooth = rms.map((_, i) => (rms[i - 1] ?? rms[i]) * 0.25 + rms[i] * 0.5 + (rms[i + 1] ?? rms[i]) * 0.25);
  let syllables = 0;
  let trough = Infinity;
  let lastPeak = -1;
  for (let i = first + 1; i < last; i++) {
    trough = Math.min(trough, smooth[i]);
    const peak = smooth[i] > smooth[i - 1] && smooth[i] >= smooth[i + 1] && smooth[i] > thresh;
    if (peak && (lastPeak < 0 || between(lastPeak, i) >= 0.1) && smooth[i] - trough > smooth[i] * 0.25) {
      syllables++;
      lastPeak = i;
      trough = smooth[i];
    }
  }
  const wpm = span >= 3 ? Math.round(Math.min(260, Math.max(50, (syllables / SYLLABLES_PER_WORD / span) * 60))) : null;

  // Expressiveness: spread of pitch (semitones) and of loudness (dB) over voiced frames.
  const pitches = pitch.filter((p, i): p is number => p !== null && voiced[i]);
  const semis = pitches.map((p) => 12 * Math.log2(p / 100));
  const trimmed = semis.filter((s) => s >= pct(semis, 5) && s <= pct(semis, 95));
  const db = rms.filter((_, i) => voiced[i]).map((r) => 20 * Math.log10(r));

  return {
    seconds,
    startDelay: Math.round(at(first) * 10) / 10,
    talkRatio: Math.min(1, talk / span),
    pauses,
    longPauses,
    longestPause: Math.round(longest * 10) / 10,
    wpm,
    pitchRange: trimmed.length >= 15 ? Math.round(sd(trimmed) * 10) / 10 : null,
    loudnessRange: db.length >= 20 ? Math.round(sd(db) * 10) / 10 : null,
    speakingSeconds: Math.round(span * 10) / 10,
  };
}
