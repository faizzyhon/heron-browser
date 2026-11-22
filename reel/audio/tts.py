# Neural TTS (edge-tts), one clip per script line. Writes voice.wav + words.json (+ line start/end) for syncing animation.
import asyncio, json, subprocess, edge_tts

VOICE, GAP = "en-US-AndrewNeural", 0.28
W = "audio/work/"

def dur(p):
    return float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", p]).decode())

async def line(i, text):
    words, audio = [], bytearray()
    for attempt in range(3):
        try:
            words, audio = [], bytearray()
            async for ch in edge_tts.Communicate(text, VOICE, rate="+4%", boundary="WordBoundary").stream():
                if ch["type"] == "audio": audio += ch["data"]
                elif ch["type"] == "WordBoundary":
                    words.append({"t": ch["text"], "s": ch["offset"] / 1e7, "d": ch["duration"] / 1e7})
            if audio: break
        except Exception as e:
            print("retry", i, type(e).__name__)
            await asyncio.sleep(1.5)
    assert audio, f"no audio for line {i}"
    open(f"{W}l{i}.mp3", "wb").write(audio)
    return words

async def main():
    lines = [l.strip() for l in open("script.txt", encoding="utf8") if l.strip()]
    t, out, inputs, delays = 0.0, [], [], []
    for i, text in enumerate(lines):
        words = await line(i, text)
        d = dur(f"{W}l{i}.mp3")
        out.append({"i": i, "text": text, "start": t, "end": t + d,
                    "words": [{"t": w["t"], "s": t + w["s"], "e": t + w["s"] + w["d"]} for w in words]})
        inputs += ["-i", f"{W}l{i}.mp3"]
        delays.append(f"[{i}]adelay={int(t*1000)}|{int(t*1000)}[a{i}]")
        t += d + GAP
    fc = ";".join(delays) + ";" + "".join(f"[a{i}]" for i in range(len(lines))) + f"amix=inputs={len(lines)}:normalize=0[o]"
    subprocess.check_call(["ffmpeg", "-y", "-v", "error", *inputs, "-filter_complex", fc, "-map", "[o]", "-ar", "48000", "-ac", "1", f"{W}voice.wav"])
    json.dump({"lines": out, "total": t}, open(f"{W}words.json", "w"))
    print(len(lines), "lines,", round(t, 1), "s")

asyncio.run(main())
