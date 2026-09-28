# Look at the ElevenLabs takes (decoded by scripts/sfx-decode.mjs): levels, where the
# sound starts and ends, pitch (nearest note of the yo scale on D, in cents) for the
# pitched cues, how cleanly a loop wraps — and a sheet per cue (spectrogram + waveform per
# take) in sound-raw/<cue>/sheet.png; and sound-raw/index.json, what the app and the
# listening page read: each take's trim, peak, loudness and pitch.
#   ~/.local/bin/uv run -p 3.12 --no-project --with numpy --with matplotlib python scripts/sfx-look.py [cues…]
import sys, os, glob, wave, json
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

BOOK = json.load(open('docs/sound/prompts.json'))['cues']
PITCHED = {'kalimba', 'kalimba-notes', 'bowl', 'chime', 'bell', 'boop', 'plip', 'click', 'dot', 'fish'}
SUSTAINED = {'sho', 'harmonium', 'glass'}  # held notes: pitched over their steady middle, and how much they wander
LOOPS = {k for k, c in BOOK.items() if c.get('loop')}
NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
YO = {2, 4, 7, 9, 11}  # D E G A B
db = lambda v: 20 * np.log10(max(float(v), 1e-9))


def load(p):
    w = wave.open(p)
    x = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).reshape(-1, w.getnchannels()) / 32768
    return x, w.getframerate()


def envelope(m, sr, ms=5):
    k = max(1, int(sr * ms / 1000))
    return np.sqrt(np.convolve(m ** 2, np.ones(k) / k, mode='same'))


def pitch(m, sr, at):
    """The strongest partial in the 300 ms after the onset, and the note it is nearest (yo scale on D)."""
    seg = m[at: at + int(0.3 * sr)]
    if len(seg) < 2048:
        return None
    spec = np.abs(np.fft.rfft(seg * np.hanning(len(seg)), n=1 << 16))
    f = np.fft.rfftfreq(1 << 16, 1 / sr)
    band = (f > 80) & (f < 5000)
    f0 = f[band][np.argmax(spec[band])]
    midi = 69 + 12 * np.log2(f0 / 440)
    best = min((n for n in range(24, 108) if n % 12 in YO), key=lambda n: abs(n - midi))
    return f0, f'{NAMES[best % 12]}{best // 12 - 1}', (midi - best) * 100


def held(m, sr):
    """A held note's fundamental over its middle 60% — the lowest partial within 20 dB of the
    strongest that the strongest is a whole multiple of (a reed's fundamental is rarely its
    loudest partial; a glass's is nearly all there is) — and its wander: the spread, in
    cents, of that partial's frequency through half-second windows."""
    a, b = int(len(m) * 0.2), int(len(m) * 0.8)
    seg = m[a:b]
    n = 1 << 18
    spec = np.abs(np.fft.rfft(seg * np.hanning(len(seg)), n=n))
    f = np.fft.rfftfreq(n, 1 / sr)
    band = (f > 70) & (f < 5000)
    top = f[band][np.argmax(spec[band])]
    strong = spec[band].max() * 0.1
    f0 = top
    for k in range(8, 1, -1):  # the lowest candidate first
        g = top / k
        if g < 70:
            continue
        near = (f > g * 0.985) & (f < g * 1.015)
        if spec[near].max(initial=0) >= strong:
            f0 = f[near][np.argmax(spec[near])]
            break
    cents = []
    w = int(0.5 * sr)
    for s in range(a, b - w, w):
        sp = np.abs(np.fft.rfft(m[s:s + w] * np.hanning(w), n=1 << 16))
        ff = np.fft.rfftfreq(1 << 16, 1 / sr)
        near = (ff > f0 * 0.97) & (ff < f0 * 1.03)
        if near.any():
            cents.append(1200 * np.log2(ff[near][np.argmax(sp[near])] / f0))
    midi = 69 + 12 * np.log2(f0 / 440)
    best = min((k for k in range(24, 108) if k % 12 in YO), key=lambda k: abs(k - midi))
    return f0, f'{NAMES[best % 12]}{best // 12 - 1}', (midi - best) * 100, float(np.std(cents)) if cents else 0.0


index = json.load(open('sound-raw/index.json')) if os.path.exists('sound-raw/index.json') else {}
cues = sys.argv[1:] or sorted(d for d in os.listdir('sound-raw') if os.path.isdir(f'sound-raw/{d}'))
for cue in cues:
    takes = sorted(glob.glob(f'sound-raw/{cue}/{cue}-*.wav'), key=lambda p: int(p.rsplit('-', 1)[1][:-4]))
    if not takes:
        continue
    fig, axes = plt.subplots(len(takes), 2, figsize=(16, 2.6 * len(takes)), gridspec_kw={'width_ratios': [3, 1]}, squeeze=False)
    print(f'\n{cue}')
    for row, p in enumerate(takes):
        x, sr = load(p)
        m = x.mean(axis=1)
        env = envelope(m, sr)
        peak = np.abs(x).max()
        on = int(np.argmax(env > peak * 10 ** (-30 / 20)))
        live = np.nonzero(env > peak * 10 ** (-50 / 20))[0]
        end = live[-1] if len(live) else len(m) - 1
        name = os.path.basename(p)[:-4]
        loop = cue in LOOPS
        rec = {'file': f'{name}.mp3', 'seconds': round(len(m) / sr, 3), 'peak': round(float(peak), 4), 'rms': round(float(np.sqrt((m ** 2).mean())), 5), 'loop': loop,
               'start': 0.0 if loop else round(max(0, on / sr - 0.004), 4), 'end': round(len(m) / sr, 3) if loop else round(min(len(m) / sr, end / sr + 0.08), 4)}
        info = f'{name}: {len(m)/sr:4.1f}s peak {db(peak):5.1f} rms {db(np.sqrt((m**2).mean())):5.1f} dBFS  starts {on/sr*1000:4.0f} ms  ends {end/sr:4.2f}s'
        if x.shape[1] == 2:
            corr = np.corrcoef(x[:, 0], x[:, 1])[0, 1]
            info += f'  L/R corr {corr:4.2f}'
        notes = BOOK.get(cue, {}).get('notes')
        asked = f' (asked {notes[(int(name.rsplit("-", 1)[1]) - 1) % len(notes)]})' if notes else ''
        if cue in PITCHED:
            pt = pitch(m, sr, on)
            if pt:
                info += f'  pitch {pt[0]:6.1f} Hz ≈ {pt[1]} {pt[2]:+4.0f}c{asked}'
                rec['hz'] = round(float(pt[0]), 2)
        if cue in SUSTAINED:
            f0, nm, off, wander = held(m, sr)
            info += f'  pitch {f0:6.1f} Hz ≈ {nm} {off:+4.0f}c{asked}, wanders ±{wander:.0f}c'
            rec['hz'] = round(float(f0), 2)
        if cue in LOOPS:
            w = int(0.05 * sr)
            a, b = np.sqrt((m[:w] ** 2).mean()), np.sqrt((m[-w:] ** 2).mean())
            jump = abs(m[0] - m[-1]) / max(peak, 1e-9)
            info += f'  wrap: level {db(a / max(b, 1e-9)):+4.1f} dB, step {jump*100:3.1f}% of peak'
        print('  ' + info)
        was = index.get(cue, {}).get(name.rsplit('-', 1)[1], {})
        if 'level' in was:
            rec['level'] = was['level']  # set by ear-weighted loudness (scripts/loudness.py), kept across looks
        index.setdefault(cue, {})[name.rsplit('-', 1)[1]] = rec
        ax, aw = axes[row]
        ax.specgram(m + 1e-9, NFFT=1024, Fs=sr, noverlap=768, cmap='magma', vmin=-130, vmax=-30)
        ax.set_ylim(0, 10000)
        ax.set_title(info, fontsize=8, loc='left')
        t = np.arange(len(m)) / sr
        aw.plot(t, x[:, 0], lw=0.3, color='#333')
        if x.shape[1] == 2:
            aw.plot(t, x[:, 1], lw=0.3, color='#c55', alpha=0.6)
        aw.set_ylim(-1, 1)
        aw.axvline(on / sr, color='#2a2', lw=0.6)
    fig.tight_layout()
    fig.savefig(f'sound-raw/{cue}/sheet.png', dpi=70)
    plt.close(fig)
json.dump(index, open('sound-raw/index.json', 'w'), indent=1, sort_keys=True)
