/**
 * Web Audio API synthesizer for soft, premium UI interaction sounds.
 * Zero external asset dependencies, ultra-low latency, non-intrusive tactile feedback.
 */

class SoundEngine {
  private ctx: AudioContext | null = null;
  private isMuted: boolean = false;
  private lastPlayTime: number = 0;

  constructor() {
    // Check saved mute preference
    try {
      const saved = localStorage.getItem('gen0_sound_muted');
      this.isMuted = saved === 'true';
    } catch {
      this.isMuted = false;
    }
  }

  private getContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  public toggleMute(): boolean {
    this.isMuted = !this.isMuted;
    try {
      localStorage.setItem('gen0_sound_muted', String(this.isMuted));
    } catch {}
    if (!this.isMuted) {
      this.playSoftClick(600, 0.05);
    }
    return this.isMuted;
  }

  public getIsMuted(): boolean {
    return this.isMuted;
  }

  /**
   * Soft, warm, tactile UI click sound
   * Frequency sweep from ~540Hz to ~160Hz over 35ms with a smooth exponential envelope
   */
  public playSoftClick(baseFreq = 520, volume = 0.04): void {
    if (this.isMuted) return;

    // Rate-limit consecutive sound bursts (minimum 40ms interval)
    const nowMs = performance.now();
    if (nowMs - this.lastPlayTime < 40) return;
    this.lastPlayTime = nowMs;

    try {
      const ctx = this.getContext();
      if (!ctx) return;

      const now = ctx.currentTime;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();

      // Gentle bandpass filter to eliminate any harsh high or low resonant buzz
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(1400, now);
      filter.frequency.exponentialRampToValueAtTime(300, now + 0.035);

      // Pitch sweep
      osc.type = 'sine';
      osc.frequency.setValueAtTime(baseFreq, now);
      osc.frequency.exponentialRampToValueAtTime(140, now + 0.032);

      // Gain envelope: fast 2ms attack, soft exponential decay
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(volume, now + 0.002);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.035);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.038);
    } catch {
      // AudioContext unavailable or blocked by browser policy until gesture
    }
  }

  /**
   * Subtle switch/tab activation tone
   */
  public playTabSound(): void {
    this.playSoftClick(620, 0.045);
  }
}

export const soundEngine = new SoundEngine();

/**
 * Initializes a global click listener that plays the soft click sound
 * on any interactive element click (buttons, links, inputs, tabs, roles).
 */
export function initGlobalClickSound(): () => void {
  if (typeof window === 'undefined') return () => {};

  const handleClick = (e: MouseEvent) => {
    const target = e.target as HTMLElement | null;
    if (!target) return;

    // Check if the clicked target or any ancestor is an interactive element
    const interactive = target.closest(
      'button, a, input, select, textarea, [role="button"], [role="tab"], [role="checkbox"], [role="switch"], summary, .cursor-pointer'
    );

    if (interactive) {
      soundEngine.playSoftClick();
    }
  };

  window.addEventListener('click', handleClick, { capture: true, passive: true });

  return () => {
    window.removeEventListener('click', handleClick, { capture: true });
  };
}
