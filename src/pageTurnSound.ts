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

    const duration = 0.08;
    const bufferSize = Math.max(1, Math.floor(ctx.sampleRate * duration));
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      const progress = i / bufferSize;
      // Soft quadratic envelope decay
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - progress, 2.5);
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    
    // Lowpass filter around 1000Hz removes harsh high frequencies
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 1000;
    
    // Soft, restrained peak gain
    const gain = ctx.createGain();
    gain.gain.value = 0.035;

    source.connect(filter).connect(gain).connect(ctx.destination);
    source.start();
  };
}
