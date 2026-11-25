# Third-party software, models and data

motion-lyrics is MIT licensed. It downloads and runs the following, each under its own license.
Check them before commercial use.

| Component | Used for | License |
| --- | --- | --- |
| [Remotion](https://www.remotion.dev) | rendering video from React | [Remotion License](https://www.remotion.dev/license): free for individuals, non-profits and companies of up to 3 people; larger companies need a company license |
| [MMS forced-alignment model](https://github.com/facebookresearch/fairseq/tree/main/examples/mms) (Pratap et al., 2023), via torchaudio | word alignment | **CC BY-NC 4.0 (non-commercial)** |
| [Demucs](https://github.com/facebookresearch/demucs) (Défossez et al.) | vocal separation | MIT |
| [Whisper](https://github.com/openai/whisper) / [faster-whisper](https://github.com/SYSTRAN/faster-whisper) | anchors, second opinion, draft lyrics | MIT |
| [uroman](https://github.com/isi-nlp/uroman) | romanization of every script | MIT-style; requires the acknowledgement below |
| [PyTorch](https://pytorch.org) / torchaudio | running the models | BSD |
| [librosa](https://librosa.org) | beat tracking | ISC |
| [OpenCV](https://opencv.org) and [YuNet](https://github.com/opencv/opencv_zoo/tree/main/models/face_detection_yunet) | face detection | Apache 2.0 / MIT |
| [FFmpeg](https://ffmpeg.org) (bundled by Remotion) | decoding and encoding | LGPL/GPL |
| [Google Fonts](https://fonts.google.com) incl. [Noto](https://notofonts.github.io) | typography for every script | mostly SIL Open Font License |
| [JamendoLyrics](https://github.com/f90/jamendolyrics) (Durand, Stoller and Ewert, 2023) | accuracy benchmark only (downloaded on demand, never redistributed) | CC licenses per song |

**uroman acknowledgement:** This project uses the universal romanizer software 'uroman'
written by Ulf Hermjakob, USC Information Sciences Institute (2015-2020).

If you need a fully commercial-friendly alignment model, replace the MMS bundle in
`pipeline/motion_lyrics/align.py` (`_load_model`) with a CTC model under a permissive license and
re-run `npm run bench` to confirm accuracy.
