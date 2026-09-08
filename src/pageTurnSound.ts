// DESIGN.md SS18 "Sound": page-turn sound is optional, "short; soft;
// paper-rustle-like; local/offline; no external network asset." Rather
// than sourcing a licensed audio file (a real product-ownership/licensing
// question of its own, per ARCHITECTURE.md SS14's font-rights reasoning
// applied to any bundled asset), this synthesizes a short decaying
// band-passed noise burst at playback time -- genuinely local/offline,
// no asset to license or redistribute.

export function createPageTurnSound(): () => void {
  let ctx: AudioContext | null = null;

  return function play() {
    if (typeof window === "undefined" || typeof window.AudioContext === "undefined") return;
    ctx ??= new AudioContext();

    const duration = 0.12;
    const bufferSize = Math.max(1, Math.floor(ctx.sampleRate * duration));
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 2500;
    const gain = ctx.createGain();
    gain.gain.value = 0.12;

    source.connect(filter).connect(gain).connect(ctx.destination);
    source.start();
  };
}
