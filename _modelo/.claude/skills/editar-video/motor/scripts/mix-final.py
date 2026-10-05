"""
Mix final (pos-render): musica de fundo em loop com ducking pela voz + loudness em 2 passes (-14 LUFS, -1 dBTP).
Uso: node .claude/skills/editar-video/scripts/py.mjs mix-final.py RENDER.mp4 MUSICA.wav SAIDA.mp4 [--musica-db -3] [--corte-final 2.0] [--musica-de 0] [--duck-ratio 2]
Medido com voz a -13,4 LUFS: musica a -6 dB fica 16,7 dB abaixo da voz com ratio 6, 13 dB com ratio 2; a -3 dB e ratio 2, ~10 dB abaixo.
A musica corta nos ultimos --corte-final segundos (fade de 0,6 s). Regras de volume em referencias/som.md da skill editar-video.
"""
import argparse, json, os, re, subprocess, sys
p = argparse.ArgumentParser()
p.add_argument("render"); p.add_argument("musica"); p.add_argument("saida")
p.add_argument("--musica-db", type=float, default=-3.0, help="ganho da musica antes do ducking (dB). Padrao -3: com ratio 2 fica ~10 dB abaixo da voz, o volume padrao do kit")
p.add_argument("--corte-final", type=float, default=2.0)
p.add_argument("--musica-de", type=float, default=0.0, help="segundo da musica em que ela comeca (pula a intro)")
p.add_argument("--duck-ratio", type=float, default=2.0, help="ratio do ducking pela voz. Padrao 2 (musica presente sob a fala, regra do kit); ratio 6 deixa a musica bem mais baixa sob a fala")
a = p.parse_args()
os.makedirs(os.path.dirname(a.saida) or ".", exist_ok=True)
dur = float(subprocess.check_output(["ffprobe","-v","error","-show_entries","format=duration","-of","csv=p=0",a.render]).decode().strip())
fim = dur - a.corte_final
g = 10 ** (a.musica_db / 20)
fc = (f"[1:a]atrim=start={a.musica_de:.3f},asetpts=PTS-STARTPTS,aloop=loop=-1:size=2e9,atrim=0:{dur:.3f},asetpts=PTS-STARTPTS,volume={g:.4f},afade=t=out:st={fim-0.6:.3f}:d=0.6,atrim=0:{fim:.3f},apad=whole_dur={dur:.3f}[m];"
      f"[m][0:a]sidechaincompress=threshold=0.03:ratio={a.duck_ratio:g}:attack=50:release=400:makeup=1[duck];"
      f"[0:a][duck]amix=inputs=2:duration=first:normalize=0[mix]")
def run(extra, out):
    return subprocess.run(["ffmpeg","-y","-v","info","-i",a.render,"-i",a.musica,"-filter_complex",fc+extra,"-map","0:v","-map","[out]"]+out, capture_output=True, text=True)
# passe 1: medir
r = run(";[mix]loudnorm=I=-14:TP=-1:LRA=11:print_format=json[out]", ["-f","null","-"])
m = re.search(r"\{[^{}]*\"input_i\"[^{}]*\}", r.stderr, re.S)
if not m: sys.exit("loudnorm sem medida:\n"+r.stderr[-1500:])
j = json.loads(m.group(0))
ln = (f"loudnorm=I=-14:TP=-1:LRA=11:measured_I={j['input_i']}:measured_TP={j['input_tp']}:measured_LRA={j['input_lra']}"
      f":measured_thresh={j['input_thresh']}:offset={j['target_offset']}:linear=true:print_format=summary")
# limitador no fim (efeito sonoro mais alto passou o pico de -1 dBTP; o loudnorm linear não limita)
r = run(f";[mix]{ln},aresample=192000,alimiter=limit=0.84:attack=1:release=60:level=disabled,aresample=48000[out]", ["-c:v","copy","-c:a","aac","-b:a","256k","-ar","48000","-movflags","+faststart",a.saida])
if r.returncode != 0: sys.exit(r.stderr[-1500:])
med = subprocess.run(["ffmpeg","-i",a.saida,"-af","ebur128=peak=true","-f","null","-"], capture_output=True, text=True).stderr
print("medido antes:", j["input_i"], "LUFS; pico", j["input_tp"])
print("\n".join(l.strip() for l in med.splitlines() if re.match(r"\s+(I|LRA|Peak):", l)))
print("ok:", a.saida)
