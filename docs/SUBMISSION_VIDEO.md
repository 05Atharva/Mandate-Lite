# Submission video edit

The November 12 edit uses the real recorded sandbox demonstration, reviewed against `fc09720` on `main`. That update introduced the Boundary identity, locally hosted fonts, persistent mobile navigation, light/dark themes, and the revised planner prompt. The video uses the same original identity assets and keeps agent proposals, server enforcement, owner review, buyer consent, and capture distinct.

The original recording is 4:03.22. The submission export is **2:55.47**. Playback is **1.12×**, with pitch preserved. Cuts remove the greeting, repeated introductory explanation, redundant statements, and selected silent waits. The budget explanation, AI planning, all three purchase cases, payment verification, budget updates, and audit walkthrough remain. This is a presentation edit of the supplied recording, not a new production integration test.

## Official requirements

Reviewed on November 12, 2026 against the [official PayPal AI Hackathon rules](https://paypalaihackathon.devpost.com/rules):

- The video should be under three minutes and show the project functioning on its intended device.
- The video must be publicly visible on YouTube, with its link in the submission form.
- Unlicensed third-party music, trademarks, and other copyrighted material must not be added. No music, stock footage, or third-party editorial graphics were added. Unrelated browser tabs and browser chrome are cropped out.
- A public open-source repository and a functional demo or complete setup instructions are separate submission requirements.

The export retains the actual sandbox PayPal checkout. Uploading the file and completing Devpost are separate publishing steps.

## Retained evidence

| Segment | Evidence retained |
| --- | --- |
| Mandate | $400 pilot budget, $200 per-order cap, owner review above $150 |
| Allowed | Groq proposes coffee; $18 passes policy; buyer consents in PayPal; server verifies and captures |
| Blocked | $900 espresso machine exceeds the cap and is blocked |
| Review | $180 hamper requires owner approval; buyer separately consents; payment is then captured |
| Audit | Completed payments, remaining budget, AG Grid records, and record inspection |

## Export settings

- 1920×1080, 30 fps constant frame rate, SDR BT.709, H.264 `slow` / CRF 16 / yuv420p, fast-start MP4.
- The 1920×888 app viewport is cropped from the 1920×1020 recording and placed at native resolution. A 60 px header and 132 px caption band complete the 1080p frame. Screen content is not enlarged.
- Original Boundary SVG; Manrope Medium captions and Space Grotesk SemiBold chapter labels; warm graphite, ivory, and citron.
- 48 synchronized English caption cues, at most two lines, plus a separate UTF-8 SRT. Names corrected to Groq and AG Grid.
- Original mono voice, pitch-preserving tempo adjustment, gentle noise reduction, two-pass loudness normalization, 48 kHz AAC requested at 192 kbit/s.
- Sandbox funding-source details are locally blurred; order amounts and payment controls stay visible.
- Both captioned and clean exports are rendered directly from the source. Neither is made by re-encoding the other.

## Verification

The captioned MP4 passed complete video/audio decoding with FFmpeg error escalation. It contains 5,263 monotonically timed video frames, a 175.470229-second container duration, and a 36.9 ms difference between audio and video end times. Captions are ordered, non-overlapping, within the video duration, and limited to two lines. Sampled frames from the actual export were inspected at native resolution, including both captures, the blocked state, owner approval, audit, and closing slate.

Measured decoded audio: **−16.55 LUFS integrated**, **−1.38 dB true peak**. Audio is below clipping. Font logs confirm the bundled Manrope Medium and Space Grotesk SemiBold instances are used. A second local transcription of the final exported audio confirmed the budget figures, Groq planning, both payment flows, the blocked case, owner review, and audit explanation remain intelligible after the pacing and audio processing.

The original recording remains unchanged. Video files, local ASR weights, transcripts, intermediate audio, and screenshots are kept outside Git under ignored `.local/submission-video/` and the local delivery folder. The source hash and exact source intervals are recorded in `edit-manifest.json`; media validation is recorded in `quality-check.json` beside the exports.

## Reproduce the edit

Use Python 3.11+ and install `Pillow`, `PyMuPDF`, `fonttools`, and `imageio-ffmpeg` into a local environment. The word-timed input JSON has a `segments` array; each segment has `words`, each containing `start`, `end`, and `word`. The source transcript was generated locally with faster-whisper `small.en` and reviewed for terminology; no recording was sent to an external transcription service.

```powershell
python scripts/edit-submission-video.py `
  --source 'D:/NEP/binary.m4v.mp4' `
  --transcript '.local/submission-video/transcript.json' `
  --output '.local/submission-video/export'
```

Add `--clean` to render without burned-in speech captions. Add `--prepare-only` to generate title cards, the SRT, ASS caption files, filter graphs, and edit manifest without encoding. The edit intervals are specific to the supplied recording. The original source is only read; exports use separate filenames. FFmpeg 9.0.2 was used for the verified render.
