"""Reproducible local-only edit of the recorded PayPal sandbox demonstration.

Requires Python 3.11+, Pillow, PyMuPDF, fonttools, imageio-ffmpeg and a word-timed
faster-whisper JSON transcript. Media and transcripts stay outside Git.
"""

import argparse
import hashlib
import json
import subprocess
import textwrap
from pathlib import Path

import fitz
import imageio_ffmpeg
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
FPS = 30
SPEED = 1.12
TAIL = 3.0
# Source seconds, in chronological order. Sentence boundaries and silent waits
# are used for cuts; payment consent and capture retain their actual sequence.
CUTS = [
    (4.62, 17.75), (19.58, 24.34), (28.40, 36.90),
    (45.85, 85.65), (86.30, 101.52),
    (108.95, 120.40),
    (122.70, 125.98), (126.80, 148.00), (148.88, 160.30),
    (161.85, 169.10), (169.50, 179.40), (181.70, 199.65),
    (199.75, 226.60), (226.85, 228.50), (239.40, 240.20),
]
CUTS = [(round(a * FPS) / FPS, round(b * FPS) / FPS) for a, b in CUTS]
DURATION = sum(b - a for a, b in CUTS) / SPEED
GRAPHITE = '#171a14'
IVORY = '#f2f2e9'
CITRON = '#d9f36b'
MUTED = '#b4baaa'


def run(ffmpeg, args, output, log_name):
    with (output / log_name).open('w', encoding='utf-8') as log:
        result = subprocess.run([ffmpeg, '-hide_banner', '-y', *args],
                                cwd=output, stdout=log, stderr=log)
    if result.returncode:
        raise RuntimeError((output / log_name).read_text(encoding='utf-8')[-6000:])


def mapped(source):
    elapsed = 0.0
    for a, b in CUTS:
        if source <= a:
            return elapsed / SPEED
        if source < b:
            return (elapsed + source - a) / SPEED
        elapsed += b - a
    return DURATION


def font(size, display=False):
    face = ImageFont.truetype(str(ROOT / 'public/fonts' /
                                  ('space-grotesk.ttf' if display else 'manrope.ttf')), size)
    face.set_variation_by_axes([600 if display else 500])
    return face


def mark(size):
    # Render the repository's original Boundary SVG, without recreating it.
    with fitz.open(ROOT / 'public/brand/mandate-mark.svg') as svg:
        pdf = fitz.open('pdf', svg.convert_to_pdf())
        pix = pdf[0].get_pixmap(matrix=fitz.Matrix(size / 64, size / 64), alpha=True)
        return Image.frombytes('RGBA', (pix.width, pix.height), pix.samples)


def assets(output):
    folder = output / 'assets'
    folder.mkdir(exist_ok=True)
    (output / 'fonts').mkdir(exist_ok=True)
    for p in (ROOT / 'public/fonts').glob('*.ttf'):
        # libass must receive the same readable font weight as the title cards.
        display = p.stem == 'space-grotesk'
        static = instantiateVariableFont(TTFont(p), {'wght': 600 if display else 500})
        family = 'Space Grotesk SemiBold' if display else 'Manrope Medium'
        names = {1: family, 2: 'Regular', 4: family,
                 6: family.replace(' ', '-'), 16: family, 17: 'Regular'}
        for record in static['name'].names:
            if record.nameID in names:
                record.string = names[record.nameID].encode(record.getEncoding())
        static.save(output / 'fonts' / p.name)
    # Header and caption band preserve the screen's native 1920 x 888 pixels.
    frame = Image.new('RGBA', (1920, 1080), (0, 0, 0, 0))
    d = ImageDraw.Draw(frame)
    d.rectangle((0, 0, 1920, 59), fill=GRAPHITE)
    d.rectangle((0, 948, 1920, 1080), fill=GRAPHITE)
    d.line((0, 947, 1920, 947), fill='#414638', width=2)
    frame.alpha_composite(mark(36), (24, 12))
    d.text((74, 13), 'mandate.', font=font(25, True), fill=IVORY)
    d.text((192, 19), 'LITE', font=font(13), fill=MUTED)
    d.text((1455, 19), f'SANDBOX  /  EDITED {SPEED:.2f}x', font=font(17), fill=MUTED)
    frame.save(folder / 'frame.png')

    def card(kind):
        image = Image.new('RGBA', (1920, 1080), GRAPHITE)
        draw = ImageDraw.Draw(image)
        image.alpha_composite(mark(104), (112, 105))
        draw.text((244, 117), 'mandate.', font=font(67, True), fill=IVORY)
        draw.text((560, 149), 'LITE', font=font(22), fill=CITRON)
        draw.line((112, 256, 1808, 256), fill='#414638', width=2)
        draw.text((112, 291), 'PAYPAL AI HACKATHON  /  WORKING SANDBOX DEMO',
                  font=font(21), fill=MUTED)
        if kind == 'intro':
            draw.text((108, 370), 'Purchasing controls', font=font(86, True), fill=IVORY)
            draw.text((108, 476), 'for small teams.', font=font(86, True), fill=CITRON)
            draw.text((112, 637), 'Useful AI. A clear boundary before spending.',
                      font=font(35), fill=IVORY)
            labels = ['A bounded budget', 'A limit per order', 'Owner review']
            for x, label in zip([112, 670, 1228], labels):
                draw.rounded_rectangle((x, 739, x + 510, 839), radius=18,
                                       fill='#24281f', outline='#414638', width=2)
                draw.text((x + 30, 768), label, font=font(28), fill=IVORY)
        elif kind == 'flow':
            draw.text((108, 365), 'Permission is explicit.', font=font(80, True), fill=IVORY)
            steps = [('01', 'Agent proposes', 'A catalog-grounded basket'),
                     ('02', 'Server checks', 'Your published mandate'),
                     ('03', 'Owner reviews', 'When the rules require it'),
                     ('04', 'Buyer consents', 'Separately, in PayPal')]
            for i, (n, title, detail) in enumerate(steps):
                x = 112 + i * 434
                draw.rounded_rectangle((x, 537, x + 394, 801), radius=18,
                                       fill='#24281f', outline='#414638', width=2)
                draw.text((x + 27, 561), n, font=font(29, True), fill=CITRON)
                draw.text((x + 27, 630), title, font=font(30, True), fill=IVORY)
                draw.text((x + 27, 697), detail, font=font(19), fill=MUTED)
        else:
            draw.text((108, 367), 'Bounded spending.', font=font(84, True), fill=IVORY)
            draw.text((108, 472), 'Explicit consent.', font=font(84, True), fill=CITRON)
            for i, (price, label) in enumerate([
                ('$18', 'Allowed & completed'), ('$900', 'Blocked by the mandate'),
                ('$180', 'Reviewed & completed')]):
                x = 112 + i * 565
                draw.rounded_rectangle((x, 665, x + 525, 840), radius=18,
                                       fill='#24281f', outline='#414638', width=2)
                draw.text((x + 30, 682), price, font=font(49, True), fill=CITRON)
                draw.text((x + 30, 764), label, font=font(25), fill=IVORY)
        draw.text((112, 893), 'AI proposes. The server enforces. PayPal confirms payment.',
                  font=font(23), fill=MUTED)
        image.save(folder / f'{kind}.png')
    for kind in ['intro', 'flow', 'end']:
        card(kind)


def timestamp(seconds, ass=False):
    ticks = round(max(0, seconds) * (100 if ass else 1000))
    factor = 100 if ass else 1000
    whole, fraction = divmod(ticks, factor)
    hours, whole = divmod(whole, 3600)
    minutes, secs = divmod(whole, 60)
    return (f'{hours}:{minutes:02}:{secs:02}.{fraction:02}' if ass else
            f'{hours:02}:{minutes:02}:{secs:02},{fraction:03}')


ASS_HEADER = '''[Script Info]
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080
WrapStyle: 2
ScaledBorderAndShadow: yes
[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Caption,Manrope Medium,38,&H00E9F2F2,&H00E9F2F2,&H00141A17,&H00141A17,0,0,0,0,100,100,0,0,1,0,0,2,100,100,26,1
Style: Phase,Space Grotesk SemiBold,24,&H006BF3D9,&H006BF3D9,&H00141A17,&H00141A17,0,0,0,0,100,100,0,0,1,0,0,7,270,50,14,1
[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
'''


def subtitles(transcript, output):
    original = json.loads(transcript.read_text(encoding='utf-8'))
    words = [dict(w) for s in original['segments'] for w in s['words']]
    for i, word in enumerate(words):
        if word['word'].strip() == 'Grok':
            word['word'] = ' Groq'
        if word['word'].strip().lower() == 'easy' and i + 1 < len(words) and words[i + 1]['word'].strip() == 'grid':
            word['word'] = ' AG'
            words[i + 1]['word'] = ' Grid'
        if word['word'].strip() in ('400.', '400'):
            word['word'] = ' $400.'
    # Whisper separates this compound across tokens. Keep it in one caption.
    for i in range(len(words) - 1, 0, -1):
        if words[i]['word'].strip() == '-commerce.' and words[i-1]['word'].strip() == 'e':
            words[i-1]['word'] += '-commerce.'
            words[i-1]['end'] = words[i]['end']
            del words[i]
    cues = []
    for a, b in CUTS:
        selected = [w for w in words if w['start'] >= a - 0.03 and w['end'] <= b + 0.03]
        if selected:
            first = selected[0]['word'].lstrip()
            selected[0]['word'] = ' ' + first[:1].upper() + first[1:]
        group = []

        def flush():
            if not group:
                return
            text = ''.join(w['word'] for w in group).strip()
            cues.append({'start': max(mapped(a), mapped(group[0]['start']) - .045),
                         'end': min(mapped(b), max(mapped(group[-1]['end']) + .17,
                                                  mapped(group[0]['start']) + .85)),
                         'text': text})
            group.clear()

        for w in selected:
            if group and (len(''.join(x['word'] for x in group)) + len(w['word']) > 112
                          or w['end'] - group[0]['start'] > 5.8
                          or w['start'] - group[-1]['end'] > .85):
                flush()
            group.append(w)
            if w['word'].endswith(('.', '?', '!')):
                flush()
        flush()
    # Avoid briefly flashing an orphaned word at the end of a longer thought.
    balanced = []
    for cue in cues:
        if (balanced and len(cue['text']) < 24
                and not balanced[-1]['text'].endswith(('.', '?', '!'))
                and cue['start'] - balanced[-1]['end'] < .25
                and len(balanced[-1]['text'] + cue['text']) < 128
                and cue['end'] - balanced[-1]['start'] < 7):
            balanced[-1]['text'] += ' ' + cue['text']
            balanced[-1]['end'] = cue['end']
        else:
            balanced.append(cue)
    cues = balanced
    # Light editorial cleanup keeps the spoken meaning and the source timing.
    corrections = {
        'called as Mandate Lite': 'called Mandate Lite',
        'maximum per order maximum': 'per-order maximum',
        'a deterministic rules': 'deterministic rules',
        'where to spend how to': 'where to spend, how to',
        'spend which category to spend on and how': 'spend, which category to spend on, and how',
        'AG Grid community': 'AG Grid Community',
        'Then we say it in the overview': 'Then we see it in the overview',
    }
    for cue in cues:
        for original_text, corrected_text in corrections.items():
            cue['text'] = cue['text'].replace(original_text, corrected_text)
    for i in range(len(cues) - 1):
        cues[i]['end'] = min(cues[i]['end'], cues[i + 1]['start'] - .025)
    # Retain the narration's meaning; changes are terminology and light cleanup.
    srt, ass = [], [ASS_HEADER]
    for i, cue in enumerate(cues, 1):
        lines = textwrap.wrap(cue['text'], width=67, break_long_words=False)
        if len(lines) > 2:
            raise ValueError(f'Caption exceeds two lines: {cue}')
        srt.append(f"{i}\n{timestamp(cue['start'])} --> {timestamp(cue['end'])}\n" + '\n'.join(lines) + '\n')
        caption = r'\N'.join(lines).replace('{', '').replace('}', '')
        ass.append(f"Dialogue: 1,{timestamp(cue['start'], True)},{timestamp(cue['end'], True)},Caption,,0,0,0,,{caption}\n")
    (output / 'Mandate-Lite-Submission.en.srt').write_text('\n'.join(srt), encoding='utf-8')
    (output / 'captions.ass').write_text(''.join(ass), encoding='utf-8')
    phases = [(45.85, '01 / Define the spending mandate'),
              (73.85, '02 / $18 purchase - Groq proposes a basket'),
              (99.35, '02 / PayPal buyer consent'),
              (116.15, '02 / Verify & capture $18'),
              (126.80, '03 / $900 purchase - blocked by the mandate'),
              (148.88, '04 / $180 purchase - owner review required'),
              (169.50, '04 / PayPal buyer consent, then capture'),
              (186.75, '05 / Completed payments, budget & audit')]
    title_events = [ASS_HEADER]
    for i, (start, label) in enumerate(phases):
        end = mapped(phases[i + 1][0]) if i + 1 < len(phases) else DURATION
        title_events.append(f'Dialogue: 0,{timestamp(mapped(start), True)},{timestamp(end, True)},Phase,,0,0,0,,{label}\n')
    (output / 'phases.ass').write_text(''.join(title_events), encoding='utf-8')
    return cues


def filters(output, captioned=True):
    predicate = '+'.join(f'gte(t,{a:.6f})*lt(t,{b:.6f})' for a, b in CUTS)
    intro_end = mapped(45.85)
    graph = [
        '[0:v]fps=30,split=2[screen][funding]',
        '[funding]crop=500:68:790:360,boxblur=18:3:8:3[redacted]',
        "[screen][redacted]overlay=790:360:enable='between(t,100,115)+between(t,174,182.2)'[private]",
        f"[private]select='{predicate}',setpts=N/(30*{SPEED}*TB),fps=30,"
        f'crop=1920:888:0:132,pad=1920:1080:0:60:color={GRAPHITE}[canvas]',
        '[canvas][1:v]overlay=0:0[framed]',
        "[framed][2:v]overlay=0:0:enable='lt(t,13.0)'[intro]",
        f"[intro][3:v]overlay=0:0:enable='gte(t,13.0)*lt(t,{intro_end:.6f})'[explained]",
        f'[explained]tpad=stop_mode=clone:stop_duration={TAIL}[extended]',
        f"[extended][4:v]overlay=0:0:enable='gte(t,{DURATION:.6f})'[ending]",
        "[ending]subtitles=phases.ass:fontsdir=fonts[phased]",
        ('[phased]subtitles=captions.ass:fontsdir=fonts,format=yuv420p[vout]' if captioned else
         '[phased]format=yuv420p[vout]'),
    ]
    (output / ('render-captioned.ffscript' if captioned else 'render-clean.ffscript')).write_text(';\n'.join(graph), encoding='utf-8')
    audio = [f'[0:a]asplit={len(CUTS)}' + ''.join(f'[a{i}]' for i in range(len(CUTS)))]
    for i, (a, b) in enumerate(CUTS):
        audio.append(f'[a{i}]atrim=start={a}:end={b},asetpts=PTS-STARTPTS,'
                     f'afade=t=in:d=0.008,afade=t=out:st={b-a-.008}:d=0.008[t{i}]')
    audio.append(''.join(f'[t{i}]' for i in range(len(CUTS))) +
                 f'concat=n={len(CUTS)}:v=0:a=1,atempo={SPEED},highpass=f=70,'
                 'lowpass=f=11000,afftdn=nr=6:nf=-35:tn=1[aout]')
    (output / 'audio.ffscript').write_text(';\n'.join(audio), encoding='utf-8')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, required=True)
    parser.add_argument('--transcript', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--prepare-only', action='store_true')
    parser.add_argument('--clean', action='store_true')
    args = parser.parse_args()
    source, transcript, output = args.source.resolve(), args.transcript.resolve(), args.output.resolve()
    output.mkdir(parents=True, exist_ok=True)
    assert all(CUTS[i][1] <= CUTS[i+1][0] for i in range(len(CUTS)-1))
    assert DURATION + TAIL < 180
    assets(output)
    cues = subtitles(transcript, output)
    filters(output, captioned=not args.clean)
    with source.open('rb') as source_file:
        source_digest = hashlib.file_digest(source_file, 'sha256').hexdigest()
    manifest = {'source': source.name, 'source_sha256': source_digest,
                'speed': SPEED, 'fps': FPS, 'source_intervals': CUTS,
                'edited_footage_seconds': DURATION, 'total_seconds': DURATION + TAIL,
                'caption_count': len(cues), 'resolution': [1920, 1080],
                'screen_crop': [1920, 888, 0, 132], 'screen_position': [0, 60],
                'encoding': 'H.264 CRF 16 slow / AAC 192 kbit/s, 48 kHz / BT.709',
                'audio_target': '-16 LUFS integrated, -1.5 dBTP',
                'rules': 'https://paypalaihackathon.devpost.com/rules'}
    (output / 'edit-manifest.json').write_text(json.dumps(manifest, indent=2), encoding='utf-8')
    print(json.dumps(manifest, indent=2), flush=True)
    if args.prepare_only:
        return
    ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
    run(ffmpeg, ['-i', str(source), '-filter_complex', (output / 'audio.ffscript').read_text(),
                 '-map', '[aout]', '-ar', '48000', '-c:a', 'pcm_f32le',
                 'edited-narration.wav'], output, 'audio-edit.log')
    measurement = output / 'audio-measurement.json'
    run(ffmpeg, ['-i', 'edited-narration.wav', '-af',
                 'loudnorm=I=-16:TP=-1.5:LRA=9:print_format=json', '-f', 'null', '-'],
        output, 'loudness-pass1.log')
    log = (output / 'loudness-pass1.log').read_text(encoding='utf-8')
    measured = json.loads(log[log.rfind('{'):log.rfind('}') + 1])
    measurement.write_text(json.dumps(measured, indent=2), encoding='utf-8')
    measured = json.loads(measurement.read_text(encoding='utf-8'))
    norm = ('loudnorm=I=-16:TP=-1.5:LRA=9:linear=true:'
            f"measured_I={measured['input_i']}:measured_TP={measured['input_tp']}:"
            f"measured_LRA={measured['input_lra']}:measured_thresh={measured['input_thresh']}:"
            f"offset={measured['target_offset']},apad=pad_dur={TAIL},aresample=48000")
    variant = 'Clean' if args.clean else 'Captioned'
    command = ['-i', str(source)]
    for name in ['frame', 'intro', 'flow', 'end']:
        command += ['-i', f'assets/{name}.png']
    command += ['-i', 'edited-narration.wav', '-filter_complex_threads', '2',
                '-filter_complex', (output / ('render-clean.ffscript' if args.clean else 'render-captioned.ffscript')).read_text(),
                '-map', '[vout]', '-map', '5:a', '-af', norm,
                '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-threads', '6',
                '-pix_fmt', 'yuv420p', '-r', '30', '-fps_mode', 'cfr',
                '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709',
                '-color_range', 'tv', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000',
                '-movflags', '+faststart', '-t', f'{DURATION + TAIL:.6f}',
                '-metadata', 'title=Mandate Lite - PayPal AI Hackathon Demo',
                '-metadata', f'comment=Working sandbox recording. Edited waits; {SPEED:.2f}x pitch-preserving playback.',
                '-progress', f'progress-{variant.lower()}.txt', '-stats_period', '2',
                f'Mandate-Lite-Submission-1080p-{variant}.mp4']
    run(ffmpeg, command, output, f'render-{variant.lower()}.log')
    print(f'Completed {variant} export.', flush=True)


if __name__ == '__main__':
    main()
