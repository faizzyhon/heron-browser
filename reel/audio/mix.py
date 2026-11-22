# Synthesized score + SFX (numpy), ducked under the voice, mixed to mix.wav (48 kHz).
import json, subprocess, wave
import numpy as np

SR, W = 48000, "audio/work/"
meta = json.load(open(W + "words.json"))
total = meta["total"] + 1.2
N = int(total * SR)
t = np.arange(N) / SR
rng = np.random.default_rng(7)

def env(n, a, r):  # attack/release envelope for n samples
    e = np.ones(n); a, r = int(a * SR), int(r * SR)
    e[:a] = np.linspace(0, 1, max(a, 1)); e[-r:] = np.linspace(1, 0, max(r, 1)) if r else e[-r:]
    return e

def add(buf, x, at):
    i = int(at * SR)
    if i < len(buf): buf[i:i + len(x)] += x[: len(buf) - i]

# --- music: Am - F - C - G pad + soft pluck arpeggio, 96 BPM ---
music = np.zeros(N)
chords = [(57, 60, 64), (53, 57, 60), (48, 52, 55), (55, 59, 62)]  # midi
beat = 60 / 96
hz = lambda m: 440 * 2 ** ((m - 69) / 12)
bar = beat * 4
for b in range(int(total / bar) + 1):
    ch = chords[b % 4]
    n = int(bar * SR)
    tt = np.arange(n) / SR
    pad = sum(np.sin(2 * np.pi * hz(m) * tt) * 0.5 + np.sin(2 * np.pi * hz(m) * 2.005 * tt) * 0.15 for m in ch)
    add(music, pad * 0.08 * env(n, 0.4, 0.4), b * bar)
    for k in range(8):  # eighth-note arpeggio
        m = ch[k % 3] + (12 if k % 4 == 3 else 12)
        dn = int(0.45 * SR); tk = np.arange(dn) / SR
        pl = np.sin(2 * np.pi * hz(m) * tk) * np.exp(-tk * 7) + 0.3 * np.sin(2 * np.pi * hz(m) * 2 * tk) * np.exp(-tk * 11)
        add(music, pl * 0.07, b * bar + k * beat / 2)
    add(music, np.sin(2 * np.pi * hz(ch[0] - 12) * np.arange(int(bar * SR)) / SR) * 0.10 * env(int(bar * SR), 0.05, 0.3), b * bar)

# --- sfx ---
sfx = np.zeros(N)
def whoosh(at, d=0.55):
    n = int(d * SR); x = rng.standard_normal(n)
    k = np.linspace(200, 4000, n); y = np.zeros(n); lp = 0
    for i in range(n):  # one-pole sweep filter
        a = min(1.0, 2 * np.pi * k[i] / SR); lp += a * (x[i] - lp); y[i] = lp
    add(sfx, y * np.sin(np.linspace(0, np.pi, n)) ** 2 * 0.5, at)
def pop(at, f=660):
    n = int(0.18 * SR); tk = np.arange(n) / SR
    add(sfx, np.sin(2 * np.pi * (f + 300 * np.exp(-tk * 30)) * tk) * np.exp(-tk * 22) * 0.45, at)
def ding(at):
    n = int(1.4 * SR); tk = np.arange(n) / SR
    add(sfx, (np.sin(2 * np.pi * 1320 * tk) + 0.5 * np.sin(2 * np.pi * 1980 * tk)) * np.exp(-tk * 3) * 0.25, at)

for L in meta["lines"]:
    whoosh(max(L["start"] - 0.25, 0))
cue = {w["t"].lower().strip(".,"): w["s"] for L in meta["lines"] for w in L["words"]}
for L in meta["lines"]:  # a pop on key words as they are spoken
    for w in L["words"]:
        if w["t"].lower().strip(".,") in {"heron.", "heron", "id", "changed", "firefox", "claude", "cloudflare", "honest", "free", "github"}:
            pop(w["s"] - 0.04, 520 + 90 * (hash(w["t"]) % 4))
ding(meta["lines"][-1]["start"] + 0.05)

def wav(path, x):
    x = np.clip(x, -1, 1)
    with wave.open(path, "wb") as f:
        f.setnchannels(1); f.setsampwidth(2); f.setframerate(SR); f.writeframes((x * 32767).astype("<i2").tobytes())
wav(W + "music.wav", music); wav(W + "sfx.wav", sfx)

# voice + music (ducked by voice via sidechain) + sfx, loudness-normalised
vf = (
    "[1:a]asplit[vo][sc];"
    "[0:a]volume=1.6[m];[m][sc]sidechaincompress=threshold=0.02:ratio=8:attack=20:release=400[md];"
    "[2:a]volume=0.8[s];"
    "[vo]apad=whole_dur=%.2f[v];"
    "[v][md][s]amix=inputs=3:normalize=0:duration=first,loudnorm=I=-14:TP=-1.5:LRA=9[o]" % total
)
subprocess.check_call(["ffmpeg", "-y", "-v", "error", "-i", W + "music.wav", "-i", W + "voice.wav", "-i", W + "sfx.wav",
                       "-filter_complex", vf, "-map", "[o]", "-ar", "48000", "-t", "%.2f" % total, W + "mix.wav"])
print("mix.wav", round(total, 1), "s")
