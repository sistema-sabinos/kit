// Teste da fonte embutida da legenda (Montserrat) e do filtro unico que mede e queima.
//
// A queima e a medicao precisam sair da MESMA funcao (filtroSubtitles), senao a
// medicao descreve um desenho e o video leva outro. E a fonte precisa vir da
// pasta do kit, nunca do sistema: sem isso a legenda sai em Arial no Windows e
// em outra coisa no Mac, e a medicao em pixel perde o sentido.
//
// Roda com: node --test .claude/skills/video-produto/scripts/lib/zona-segura.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  DIR_FONTES, filtroSubtitles, caminhoParaFiltro, renderizarQuadro, estiloLegenda, NIVEIS_LEGENDA,
} from './zona-segura.mjs';

function comPasta(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zona-fonte-'));
  try {
    return fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('a pasta de fontes existe e traz as duas Montserrat e a licenca', () => {
  const nomes = fs.readdirSync(DIR_FONTES).sort();
  assert.ok(nomes.includes('Montserrat-Bold.ttf'), nomes.join(', '));
  assert.ok(nomes.includes('Montserrat-ExtraBold.ttf'), nomes.join(', '));
  assert.ok(nomes.includes('OFL.txt'), nomes.join(', '));
});

test('filtroSubtitles aponta o fontsdir pra pasta do kit e passa o estilo inteiro', () => {
  comPasta((dir) => {
    const srt = path.join(dir, 'a.srt');
    fs.writeFileSync(srt, '1\n00:00:00,000 --> 00:00:01,000\noi\n', 'utf8');
    const f = filtroSubtitles(srt, 'X=1');
    assert.ok(f.includes(`fontsdir='${caminhoParaFiltro(DIR_FONTES)}'`), f);
    assert.ok(f.includes("force_style='X=1'"), f);
    assert.ok(f.startsWith(`subtitles='${caminhoParaFiltro(srt)}'`), f);
  });
});

test('o estilo da legenda pede Montserrat em negrito, o nome interno do arquivo Bold', () => {
  const e = estiloLegenda(720, 1280, NIVEIS_LEGENDA[0]);
  assert.match(e, /FontName=Montserrat(,|$)/);
  assert.match(e, /Bold=1/);
  assert.doesNotMatch(e, /Arial/);
});

test('renderizarQuadro usa o mesmo filtroSubtitles da queima', () => {
  comPasta((dir) => {
    const srt = path.join(dir, 'a.srt');
    fs.writeFileSync(srt, '1\n00:00:00,000 --> 00:00:01,000\noi\n', 'utf8');
    const png = path.join(dir, 'q.png');
    let args = null;
    renderizarQuadro({
      arquivoSrt: srt, estilo: 'X=1', largura: 720, altura: 1280, tempo: 0.5, saidaPng: png,
      executar: (cmd, a) => {
        args = a;
        fs.writeFileSync(png, 'falso');
        return { status: 0 };
      },
    });
    assert.ok(args, 'o espiao nao foi chamado');
    const vf = args[args.indexOf('-vf') + 1];
    assert.equal(vf, filtroSubtitles(srt, 'X=1'));
  });
});

// Prova de que nenhuma fonte do sistema entrou: o libass diz, em -loglevel
// verbose, qual arquivo escolheu pra cada pedido de fonte. Com o fontsdir certo
// a linha e "fontselect: (Montserrat, 700, 0) -> Montserrat-Bold". Quando a
// familia nao casa, ele troca em silencio pela do sistema (Arial-BoldMT no
// Windows). O canario abaixo pede um nome que nao existe e confere que a
// busca por "Arial" casa, pra o verde do teste principal valer alguma coisa.
function logDoLibass(dir, nomeFonte) {
  const srt = path.join(dir, 'f.srt');
  fs.writeFileSync(srt, '1\n00:00:00,000 --> 00:00:02,000\nTeste de legenda\n', 'utf8');
  const estilo = estiloLegenda(720, 1280, NIVEIS_LEGENDA[0]).replace('FontName=Montserrat', `FontName=${nomeFonte}`);
  const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'verbose',
    '-f', 'lavfi', '-i', 'color=c=black:s=720x1280:r=4:d=2',
    '-vf', filtroSubtitles(srt, estilo),
    '-frames:v', '1', '-pix_fmt', 'rgb24', path.join(dir, 'f.png')],
  { encoding: 'utf8', timeout: 120000 });
  assert.equal(r.status, 0, (r.stderr || '').slice(-300));
  return r.stderr;
}

test('o libass carrega as fontes do fontsdir e escolhe Montserrat-Bold, sem trocar por fonte do sistema', () => {
  comPasta((dir) => {
    const log = logDoLibass(dir, 'Montserrat');
    assert.match(log, /Loading font file '[^']*Montserrat-Bold\.ttf'/, 'o libass nao leu o arquivo do fontsdir');
    const escolhas = log.split('\n').filter((l) => l.includes('fontselect:'));
    assert.ok(escolhas.length > 0, 'nenhuma linha fontselect no log: a prova nao rodou');
    assert.ok(escolhas.every((l) => /->\s*Montserrat-Bold/.test(l)), escolhas.join(' | '));
    assert.doesNotMatch(log, /fontselect:[^\n]*->\s*Arial/);
  });
});

test('canario: pedindo uma fonte que nao existe, o log acusa a troca pela do sistema', () => {
  comPasta((dir) => {
    const log = logDoLibass(dir, 'FonteQueNaoExiste');
    assert.match(log, /fontselect:[^\n]*FonteQueNaoExiste[^\n]*->\s*(?!Montserrat)\S+/, 'o canario nao casou, a busca do teste principal nao serve');
    assert.doesNotMatch(log, /fontselect:[^\n]*->\s*Montserrat-Bold/);
  });
});
