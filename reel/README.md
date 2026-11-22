# Heron reel (60 s, 1080x1920)
Animated Remotion promo with neural voice (edge-tts), synthesized score/SFX and word-synced captions.
Pipeline (run from this folder):
```
npm install
python audio/tts.py      # script.txt -> audio/work/voice.wav + words.json  (needs internet; pip install edge-tts numpy)
python audio/mix.py      # music + sfx + ducking -> audio/work/mix.wav
cp audio/work/words.json src/words.json && cp audio/work/mix.wav public/mix.wav
npx remotion render src/index.ts HeronReel out/heron-reel.mp4 --codec h264 --crf 18 --audio-codec aac
```
Workflow adapted from the MIT-licensed [claude-animated-shorts](https://github.com/mromidev/claude-animated-shorts) skill (script → word-timed voice → shot plan → synthesized sound → QA); the visuals here are 2D motion graphics, not its 3D cartoon renderer.
