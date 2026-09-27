# Look at the sounds rendered by scripts/sound-render.mjs: levels (peak, RMS, loudest
# 400 ms) and a spectrogram + waveform per file, into shots/sound/*.png.
#   ~/.local/bin/uv run -p 3.12 --no-project --with numpy --with matplotlib python scripts/sound-look.py [names…]
import sys, wave, glob, os
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

names = sys.argv[1:] or [os.path.basename(p)[:-4] for p in sorted(glob.glob('shots/sound/*.wav'))]
db = lambda x: 20 * np.log10(max(x, 1e-9))
for name in names:
    w = wave.open(f'shots/sound/{name}.wav')
    sr = w.getframerate()
    x = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).reshape(-1, w.getnchannels()) / 32768
    mono = x.mean(axis=1)
    win = int(0.4 * sr)
    sq = np.convolve(mono ** 2, np.ones(win) / win, mode='valid') if len(mono) > win else mono ** 2
    print(f'{name:8s} {len(mono)/sr:5.1f}s  peak {db(np.abs(x).max()):6.1f} dBFS  rms {db(np.sqrt((mono**2).mean())):6.1f}  loudest400ms {db(np.sqrt(sq.max())):6.1f}  L/R rms {db(np.sqrt((x[:,0]**2).mean())):6.1f}/{db(np.sqrt((x[:,1]**2).mean())):6.1f}')
    fig, (a, b) = plt.subplots(2, 1, figsize=(14, 6), sharex=True, gridspec_kw={'height_ratios': [3, 1]})
    a.specgram(mono, NFFT=2048, Fs=sr, noverlap=1536, cmap='magma', vmin=-130, vmax=-30)
    a.set_ylim(0, 8000)
    a.set_ylabel('Hz')
    a.set_title(name)
    t = np.arange(len(mono)) / sr
    b.plot(t, x[:, 0], lw=0.3, color='#333')
    b.plot(t, x[:, 1], lw=0.3, color='#c55', alpha=0.6)
    b.set_ylim(-1, 1)
    b.set_xlabel('s')
    fig.tight_layout()
    fig.savefig(f'shots/sound/{name}.png', dpi=80)
    plt.close(fig)
