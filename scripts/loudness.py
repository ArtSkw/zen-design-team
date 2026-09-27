# Loudness as the ear hears it (ITU-R BS.1770 K-weighting, ungated, LUFS), for the renders in
# shots/sound/: plain RMS overrates low, airy sound (a breeze) against a bright one (water).
#   ~/.local/bin/uv run -p 3.12 --no-project --with numpy --with scipy python scripts/loudness.py name[:from-to] …
import sys, wave
import numpy as np
from scipy.signal import lfilter, bilinear_zpk, zpk2tf

def k_weight(x, sr):
    # the two BS.1770 stages, designed for this sample rate (the published 48 kHz coefficients, generalised)
    import math
    f0, G, Q = 1681.974450955533, 3.999843853973347, 0.7071752369554196
    K = math.tan(math.pi * f0 / sr); Vh = 10 ** (G / 20); Vb = Vh ** 0.4996667741545416
    a0 = 1 + K / Q + K * K
    b1 = [(Vh + Vb * K / Q + K * K) / a0, 2 * (K * K - Vh) / a0, (Vh - Vb * K / Q + K * K) / a0]
    a1 = [1, 2 * (K * K - 1) / a0, (1 - K / Q + K * K) / a0]
    f0, Q = 38.13547087602444, 0.5003270373238773
    K = math.tan(math.pi * f0 / sr)
    b2 = [1, -2, 1]
    a2 = [1, 2 * (K * K - 1) / (1 + K / Q + K * K), (1 - K / Q + K * K) / (1 + K / Q + K * K)]
    return lfilter(b2, a2, lfilter(b1, a1, x, axis=0), axis=0)

for arg in sys.argv[1:]:
    name, _, span = arg.partition(':')
    w = wave.open(f'shots/sound/{name}.wav'); sr = w.getframerate()
    x = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).reshape(-1, w.getnchannels()) / 32768
    if span:
        a, b = (float(v) for v in span.split('-'))
        x = x[int(a * sr):int(b * sr)]
    y = k_weight(x, sr)
    lufs = -0.691 + 10 * np.log10(max(1e-12, float((y ** 2).mean(axis=0).sum())))
    rms = 20 * np.log10(max(1e-9, float(np.sqrt((x.mean(axis=1) ** 2).mean()))))
    print(f'{arg:22s} {lufs:6.1f} LUFS   (RMS {rms:6.1f} dBFS)')
