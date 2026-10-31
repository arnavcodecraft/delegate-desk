"""
Makes the demo lecture videos (web/public/lectures/<id>.mp4 and .webm, .vtt captions and .jpg poster) from
web/src/data/lectures.json: each sentence is voiced with the tutor's Kokoro voice, the slides are drawn by
slides.cjs, and ffmpeg joins them.

Needs: ffmpeg, Node with Playwright, and Python with kokoro-onnx + soundfile, plus the model files
kokoro-v1.0.onnx and voices-v1.0.bin (github.com/thewh1teagle/kokoro-onnx releases) in KOKORO_DIR.
Run:  KOKORO_DIR=/path/to/models python scripts/lectures/make.py
"""
import json, os, subprocess, sys, tempfile
import numpy as np
import soundfile as sf
from kokoro_onnx import Kokoro

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(ROOT, 'web', 'public', 'lectures')
MODELS = os.environ.get('KOKORO_DIR', '.')
RATE = 24000
GAP, SLIDE_END, LEAD_IN = 0.32, 0.9, 0.5

def ts(t):
    h, m, s = int(t // 3600), int(t % 3600 // 60), t % 60
    return f'{h:02}:{m:02}:{s:06.3f}'

def main():
    data = json.load(open(os.path.join(ROOT, 'web', 'src', 'data', 'lectures.json')))
    tts = Kokoro(os.path.join(MODELS, 'kokoro-v1.0.onnx'), os.path.join(MODELS, 'voices-v1.0.bin'))
    os.makedirs(OUT, exist_ok=True)
    work = tempfile.mkdtemp(prefix='lectures-')
    subprocess.run(['node', os.path.join(ROOT, 'scripts', 'lectures', 'slides.cjs'), work], check=True)
    chapters = {}
    for lec in data['lectures']:
        t = lec['tutor']
        audio, cues, slide_lengths, starts, now = [], [], [], [], 0.0
        audio.append(np.zeros(int(RATE * LEAD_IN), dtype=np.float32)); now += LEAD_IN
        for i, slide in enumerate(lec['slides']):
            start = now if i else 0.0
            starts.append(round(start, 2))
            for line in slide['say']:
                samples, rate = tts.create(line, voice=t['voice'], speed=1.0, lang=t['lang'])
                assert rate == RATE
                cues.append((now, now + len(samples) / RATE, line))
                audio.append(samples.astype(np.float32)); now += len(samples) / RATE
                audio.append(np.zeros(int(RATE * GAP), dtype=np.float32)); now += GAP
            audio.append(np.zeros(int(RATE * SLIDE_END), dtype=np.float32)); now += SLIDE_END
            slide_lengths.append(now - start)
        wav = os.path.join(work, f"{lec['id']}.wav")
        sf.write(wav, np.concatenate(audio), RATE)
        # Captions.
        with open(os.path.join(OUT, f"{lec['id']}.vtt"), 'w') as f:
            f.write('WEBVTT\n\n')
            for k, (a, b, line) in enumerate(cues, 1):
                f.write(f'{k}\n{ts(a)} --> {ts(b)}\n{line}\n\n')
        # One still per slide, held for its spoken length.
        listing = os.path.join(work, f"{lec['id']}.txt")
        with open(listing, 'w') as f:
            for i, d in enumerate(slide_lengths):
                f.write(f"file '{os.path.join(work, lec['id'], f'slide-{i:02}.png')}'\nduration {d:.3f}\n")
            f.write(f"file '{os.path.join(work, lec['id'], f'slide-{len(slide_lengths) - 1:02}.png')}'\n")
        mp4 = os.path.join(OUT, f"{lec['id']}.mp4")
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', listing, '-i', wav,
                        '-vf', 'fps=15,format=yuv420p', '-c:v', 'libx264', '-tune', 'stillimage', '-crf', '28', '-preset', 'slow',
                        '-c:a', 'aac', '-b:a', '64k', '-ac', '1', '-shortest', '-movflags', '+faststart', mp4], check=True)
        # A WebM copy too: browsers without H.264 (open-source Chromium builds) play this one instead.
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', mp4, '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '42', '-row-mt', '1', '-deadline', 'good', '-cpu-used', '4',
                        '-c:a', 'libopus', '-b:a', '48k', os.path.join(OUT, f"{lec['id']}.webm")], check=True)
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', os.path.join(work, lec['id'], 'slide-00.png'), '-q:v', '4',
                        os.path.join(OUT, f"{lec['id']}.jpg")], check=True)
        chapters[lec['id']] = {'duration': round(now, 1), 'starts': starts}
        print(f"{lec['id']}: {now:.0f}s, {os.path.getsize(mp4) / 1e6:.1f} MB")
    json.dump(chapters, open(os.path.join(OUT, 'chapters.json'), 'w'), indent=1)

if __name__ == '__main__':
    sys.exit(main())
