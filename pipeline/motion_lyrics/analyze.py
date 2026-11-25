"""Facts about the audio and picture that styles and checks rely on.

  * vocal loudness envelope (timing overlay, voicing checks)
  * beats and tempo (beat-pulse effects)
  * faces over time (so lyrics can move out of the way)
"""

from __future__ import annotations

import urllib.request
from pathlib import Path

import numpy as np

from . import audio, log

YUNET_URL = "https://github.com/opencv/opencv_zoo/raw/main/models/face_detection_yunet/face_detection_yunet_2023mar.onnx"
ENVELOPE_HOP = 0.02


def envelope(vocals: Path) -> dict:
    wav, sr = audio.load(vocals, sr=16000, mono=True)
    db = audio.rms_envelope(wav[0], sr, hop_s=ENVELOPE_HOP, win_s=0.05)
    return {"hop": ENVELOPE_HOP, "db": [round(float(v), 1) for v in db]}


def beats(mix: Path) -> tuple[list[float], float | None]:
    import librosa

    y, sr = librosa.load(str(mix), sr=22050, mono=True)
    tempo, frames = librosa.beat.beat_track(y=y, sr=sr, units="frames")
    times = librosa.frames_to_time(frames, sr=sr)
    t = float(np.atleast_1d(tempo)[0]) if np.size(tempo) else None
    return [round(float(x), 3) for x in times], (round(t, 1) if t else None)


def _yunet(cache: Path) -> Path:
    path = cache / "face_detection_yunet_2023mar.onnx"
    if not path.exists():
        cache.mkdir(parents=True, exist_ok=True)
        log.info("Downloading the face detector (230 KB)")
        req = urllib.request.Request(YUNET_URL, headers={"User-Agent": "motion-lyrics"})
        with urllib.request.urlopen(req, timeout=60) as r:
            path.write_bytes(r.read())
    return path


def faces(video: Path, cache: Path, every_s: float = 0.5, min_size: float = 0.06) -> list[dict]:
    """Face boxes as frame fractions [x, y, w, h], sampled every ``every_s`` seconds."""
    import cv2

    model = _yunet(cache)
    cap = cv2.VideoCapture(str(video))
    if not cap.isOpened():
        log.warn(f"Could not open {video} for face detection; lyrics will not avoid faces")
        return []
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    n = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    step = max(1, int(round(fps * every_s)))
    det = None
    out: list[dict] = []
    i = 0
    while True:
        ok = cap.grab()
        if not ok:
            break
        if i % step == 0:
            ok, frame = cap.retrieve()
            if not ok:
                break
            h, w = frame.shape[:2]
            scale = 640.0 / max(w, h)
            small = cv2.resize(frame, (int(w * scale), int(h * scale)))
            sh, sw = small.shape[:2]
            if det is None:
                det = cv2.FaceDetectorYN.create(str(model), "", (sw, sh), score_threshold=0.6, nms_threshold=0.3, top_k=50)
            det.setInputSize((sw, sh))
            _, found = det.detect(small)
            boxes = []
            if found is not None:
                for f in found:
                    x, y, bw, bh = (float(v) for v in f[:4])
                    if bw / sw < min_size and bh / sh < min_size:
                        continue
                    # Grow the box a little: hair, chin and a margin around the face.
                    gx, gy = bw * 0.15, bh * 0.2
                    boxes.append([
                        round(max(0.0, (x - gx) / sw), 4),
                        round(max(0.0, (y - gy) / sh), 4),
                        round(min(1.0, (bw + 2 * gx) / sw), 4),
                        round(min(1.0, (bh + 2 * gy) / sh), 4),
                    ])
            out.append({"t": round(i / fps, 3), "boxes": boxes})
        i += 1
    cap.release()
    log.info(f"Checked {len(out)} frames for faces ({sum(len(o['boxes']) for o in out)} faces found)")
    return out


def run(work: Path, video: Path | None, do_faces: bool, cache: Path, duration: float) -> dict:
    vocals = work / "vocals.wav"
    mix = work / "audio.wav"
    result: dict = {"version": 1, "duration": duration, "beats": [], "tempo": None, "envelope": None, "faces": []}
    log.info("Measuring vocal loudness")
    result["envelope"] = envelope(vocals if vocals.exists() else mix)
    log.info("Finding beats")
    try:
        result["beats"], result["tempo"] = beats(mix)
    except Exception as e:  # beats are optional; never fail the run over them
        log.warn(f"Beat tracking failed ({e}); beat effects will be off")
    if do_faces and video is not None and video.exists():
        log.info("Looking for faces")
        try:
            result["faces"] = faces(video, cache)
        except Exception as e:
            log.warn(f"Face detection failed ({e}); lyrics will not avoid faces")
    return result
