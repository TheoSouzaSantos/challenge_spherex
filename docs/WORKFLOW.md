# Fluxo de trabalho: céu interativo SPHEREx (web desktop, React + PixiJS)

Público-alvo: entusiastas de astronomia. Só desktop (largura mínima 1280 px, sem layout mobile).
Documento interno da equipe (PT). Tudo que o usuário/jurado vê continua em inglês.

## 1. Interface e onde cada função mora

```
┌──────────────────────────────── Navbar ────────────────────────────────┐
│ ☰ Layers          [ 🔍 Search: name · RA/Dec · Earth location ]    ⓘ   │
├───────────┬────────────────────────────────────────────────────────────┤
│ Drawer ☰  │                                                            │
│ (camadas) │            CÉU INTEIRO (Aladin Lite + HiPS SPHEREx)        │
│           │            zoom / pan / overlay Gaia · WISE                │
│           │                                                            │
│           ├─────────────── Barra lateral direita ──────────────────────┤
│           │ Ferramentas: ✋ pan · ⬚ recortar · ⌖ rastrear · 💡 curva  │
│           │ Workspace do recorte (PixiJS): camadas, blink, diferença   │
│           │ Timeline: |◀ ▶ ▶|  período [====]  velocidade  ⟳  GIF      │
└───────────┴────────────────────────────────────────────────────────────┘
```

| # | Função | Região da UI | Como fazer | Dono | Nível |
|---|---|---|---|---|---|
| 1 | Observar todo o céu | Área central | Aladin Lite v3 com o HiPS SPHEREx all-sky (`irsa.ipac.caltech.edu/data/hips/SPHEREx/spherex_allsky_cube`, 102 frames). Fundo opcional: 2MASS/AllWISE HiPS | frontend | **MVP** |
| 2 | Zoom | Área central | Nativo do Aladin (HiPS até order 5, ~13"/px). Mais detalhe vem do recorte (6,2"/px) | frontend | **MVP** |
| 3 | Recortar parte do céu | Ferramenta ⬚ | Quadrado de FOV fixo (1,5' / 3' / 6' / 12'), clique no céu → `ra,dec,fov` → backend gera cutouts por visita → abre o workspace Pixi | frontend + data-engineer | **MVP** |
| 4 | Timeline com loop (período, velocidade, pausa) | Abaixo do workspace | Um quadro por **visita** (coadd), com datas reais. Slider de intervalo (início/fim), velocidade 0,5–10 fps, play/pause, espaço/setas no teclado | frontend + image-processor | **MVP** (loop automático é o "little video" do desafio) |
| 5 | Blink | Workspace | Escolher visita A e B e alternar em X ms. Modo extra: diferença B−A (colormap divergente, vem pronta do backend) | frontend + image-processor | **MVP** |
| 6 | Pesquisar por RA/Dec (e nome) | Navbar | Aceita `08h55m10.831s -7d14m42.53s`, graus decimais e nome (SIMBAD/Sesame). Chips com os 5 alvos de teste | frontend + data-engineer | **MVP** |
| 7 | Camadas (bandas + outro período) com transparência e contraste | Drawer ☰ | Cada camada = (detector D1–D6 ou banda, visita). Pixi: um `Sprite` por camada, `blendMode 'add'`, `alpha` = opacidade, filtro de contraste/brilho por camada. Falsa-cor ordenada por λ (D1 azul → D6 vermelho). Máximo de 4 camadas ativas | frontend + image-processor | Nível 2 |
| 8 | Curva de brilho | Ferramenta 💡 | **(a)** Curva de luz: clique numa estrela → fotometria de abertura em cada visita → gráfico brilho × data (RW Aur, R Dra). **(b)** Curva de tons: stretch linear/log/asinh e pontos preto/branco por camada | image-processor + frontend | Nível 2 (a) / MVP simples (b) |
| 9 | Exportar GIF do loop | Timeline | No cliente: extrair os quadros do canvas Pixi (`renderer.extract`) e codificar com `gifenc` (MIT), respeitando período e velocidade escolhidos | frontend | Nível 2 |
| 10 | Rastrear um corpo celeste | Ferramenta ⌖ | **(a)** Objeto conhecido: posição Gaia DR3 propagada (movimento próprio + paralaxe) para a data de cada quadro → marcador e trilha. **(b)** Clique num ponto → centróide em cada visita → trilha medida vs prevista. Objetos do Sistema Solar: efemérides JPL Horizons via backend | science-validator + image-processor | (a) **MVP** · (b) Nível 2 · Horizons Nível 3 |
| 11 | Baixar imagens localmente (evitar latência) | Botão "Save region" no workspace | Três camadas de cache: **prebake** dos 5 alvos em `AstroDevs-FP/public/data/`; cache em disco no backend (chave release+ra+dec+fov+det+uri); no navegador, a Cache Storage API guarda recortes já vistos. Opcional: baixar ZIP com PNG + FITS + `meta.json` | data-engineer + frontend | Prebake **MVP** · resto Nível 2 |
| 12 | Céu visto de um local da Terra (coordenadas ou endereço) | Navbar (aba "Earth location") | Endereço → lat/lon (Nominatim/OSM via backend, com limite de uso) → zênite em RA/Dec para data/hora (astropy `AltAz` ou `astronomy-engine` no cliente) → centralizar o céu e desenhar o horizonte | frontend + data-engineer | Nível 3 |
| + | URL compartilhável | — | `?ra=&dec=&fov=&layers=D4:1,D6:0.6&from=&to=&fps=&mode=blink` com `history.replaceState` | frontend | **MVP** (barato e pedido no desafio) |
| + | Metadados e flags | Painel ⓘ | Data, detector, λ, nº de exposições, % de pixels com flag e botão "show flags" | frontend | Nível 2 |
| + | Espectro on-the-fly | Clique com Shift | Espectro 0,75–5 µm do pixel (WCS-WAVE) | image-processor | Nível 3 (o desafio dá "extra kudos") |

**MVP** = precisa estar no ar no sábado às 19:00. **Nível 2** = até o congelamento de domingo, 12:00. **Nível 3** = só se sobrar tempo; senão, entra no pitch como "next step".

## 2. Divisão de responsabilidades: Aladin vs PixiJS

- **Aladin Lite**: céu inteiro, zoom/pan, projeção, tiles HiPS, overlays de catálogo (Gaia, WISE). Reimplementar isso em Pixi custa um dia inteiro.
- **PixiJS**: o *workspace do recorte*, que é onde está o diferencial: pilha de camadas com blend aditivo, opacidade e contraste por camada, troca de quadros sem flicker, blink, marcadores de rastreamento e extração de quadros para o GIF. Usar `scaleMode: 'nearest'` para os pixels de 6,2" aparecerem.
- Os dois se comunicam por `{ra, dec, fov}`: o recorte selecionado no Aladin vira o centro do workspace Pixi.

## 3. Contrato de dados (escrever em `docs/API.md` antes de codar)

`AstroDevs-FP/public/data/<slug>/meta.json` (prebake) = resposta de `GET /api/frames` (ao vivo):

```json
{
  "target": {"name": "WISE 0855-0714", "ra": 133.7951, "dec": -7.2451},
  "fov_deg": 0.05, "release": "spherex_dr1",
  "wcs": {"crval": [133.7951, -7.2451], "cdelt": 0.001722, "crpix": [15.5, 15.5]},
  "layers": [
    {"det": 6, "wl_um": [4.42, 5.00],
     "stretch": {"fn": "asinh", "vmin": -0.2, "vmax": 3.1},
     "visits": [
       {"id": "v1", "date": "2025-05-20", "mjd": 60815.2, "n_exp": 12, "flag_frac": 0.03,
        "png": "D6_v1.png", "fits": "D6_v1.fits"}
     ],
     "diff": [{"a": "v1", "b": "v3", "png": "D6_diff_v1_v3.png"}]}
  ],
  "gaia": [{"source_id": "…", "pmra": -8118, "pmdec": 673, "parallax": 439, "pred": {"v1": [133.79, -7.24]}}],
  "photometry": [{"visit": "v1", "det": 6, "flux": 1.23, "err": 0.05}]
}
```

Endpoints: `/api/resolve?q=`, `/api/search?ra&dec&fov&det`, `/api/frames?…`, `/api/photometry?ra&dec`, `/api/spectrum?ra&dec`, `/api/earth?lat&lon&time` (ou `?address=`).

## 4. Cronograma por checkpoint (hackathon-mode)

| Checkpoint | Entregas | Agentes (em paralelo quando as pastas são diferentes) |
|---|---|---|
| **Sáb 11:00** hello no ar | Vite + React + Tailwind + PixiJS com uma página publicada na Vercel. `docs/API.md` com o contrato acima | sky-viewer-frontend · hackathon-lead |
| **Sáb 14:00** funciona com amostra | `scripts/prebake.py` para os 5 alvos, 1–2 detectores cada (Barnard D1–D3; WISE 0855 e Eps Indi B D5/D6; RW Aur e R Dra D1–D3). Frontend: navbar, Aladin com o HiPS SPHEREx, workspace Pixi lendo `meta.json`, **timeline com loop/pausa/velocidade/período** e **blink** | data-engineer + image-processor (`backend/`, `scripts/`) ‖ frontend (`AstroDevs-FP/`) |
| **Sáb 19:00** dados NASA ao vivo | FastAPI no ar (Hugging Face Spaces/Render): resolve, search, frames com cache. Recorte com clique no céu → cutouts ao vivo. Busca RA/Dec/nome, URL params, marcador Gaia. **Se o ao vivo não funcionar até aqui: fica só o prebake e a busca livre é marcada "beta"** (regra da nasa-data) | data-engineer ‖ frontend · astro-science-validator escreve `docs/TARGETS.md` |
| **Sáb noite** | Drawer de camadas (opacidade, contraste, outro período), diferença, curva de tons, flags. Validação: o movimento medido de Barnard e WISE 0855 bate com o Gaia (`docs/VALIDATION.md`) | frontend + image-processor ‖ validator |
| **Dom 12:00** feature freeze | Exportar GIF, curva de luz (RW Aur, R Dra), rastreamento por clique, cache no navegador/"Save region". Nível 3 só se tudo isso estiver no ar | frontend + image-processor |
| **Dom 12:00–16:00** | Só correção de bugs, textos "What am I looking at?", `SOURCES.md` completo | todos · validator revisa a ciência |
| **Dom 16:00–20:00** submissão | `SUBMISSION.md`, vídeo ≤ 30 s, `PITCH.md` + ensaio | pitch-and-submission → local-pitch-coach |

## 5. Ajustes para o público entusiasta (desktop)

- **Busca**: placeholder com exemplo, nome de objeto além de RA/Dec, histórico das últimas buscas e os 5 alvos como chips.
- **Bandas com nome legível**: "D6 · 4.4–5.0 µm · cold objects / brown dwarfs", nunca só "D6". O termo da UI é *wavelength* (comprimento de onda), não "frequency".
- **Falsa-cor explicada**: legenda fixa "infrared, invisible to the eye; blue = shorter, red = longer".
- **Movimento visível**: entre visitas de 6 meses o deslocamento é < 1 px. Por padrão, o blink compara a **primeira com a última** visita, com a cruz do Gaia ligada.
- **Atalhos de teclado** (vantagem do desktop): espaço = play/pause, ←/→ = quadro, B = blink, 1–6 = detector, [ ] = velocidade, C = recortar.
- **Painel "What am I looking at?"** com 5 textos curtos, escritos pelo validator.
- **Estados honestos**: "loading cutouts (~10 s)", "only 2 visits available here", "no data in this band for this visit".
- **Sem logos da NASA/Space Apps**. Créditos no rodapé: SPHEREx/IRSA, Gaia DR3/ESA, Aladin/CDS.

## 6. Riscos principais

| Risco | Mitigação |
|---|---|
| Cutouts do IRSA lentos (segundos a dezenas de segundos cada) | Prebake + cache no backend + limite de FOV (≤ 0,25°) e de exposições (~40) por pedido |
| Poucas visitas por campo (2–4) | Timeline mostra o intervalo real; RW Aur e R Dra mostram curva de luz, não movimento |
| Escopo: 12 funções em ~36 h | Os níveis da tabela da seção 1. Nada de Nível 2 começa antes de o MVP estar publicado |
| Mistura de bandas cria cores sem significado | Aviso na UI. Para detectar movimento, usar 1 banda (preset) |
| Equipe sem experiência com PixiJS | Se travar, `<canvas>` 2D com `globalCompositeOperation = 'lighter'` faz a mesma coisa para ≤ 4 camadas |

## Decisões pendentes

1. Pasta do frontend: `AstroDevs-FP/` (é o que o CLAUDE.md e os agentes usam) ou `frontend/` (pasta vazia que já existe). Escolher uma e apagar a outra.
2. "Curva de brilho": a equipe quer (a) curva de luz, (b) curva de tons, ou as duas? Este plano assume as duas, com (b) no MVP.
