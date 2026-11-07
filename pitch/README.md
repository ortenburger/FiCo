# FiCo — Pitch Motion (40s)

A 1920×1080 / 30 fps motion-graphics opener for the Founders Hackathon Stuttgart pitch.
Every frame is rendered deterministically from `motion.html` — no editor, no manual timeline.

## Deliverables

| File | What |
| --- | --- |
| `out/fico-pitch.mp4` | Final 40 s video, H.264, yuv420p, faststart (YouTube / Drive ready) |
| `out/poster.png` | Still for the pitch deck cover |
| `motion.html` | The whole film as code. Open in a browser: space = play, ←/→ = 1 s |
| `render.mjs` | Headless-Chromium frame capture + ffmpeg encode |

## Storyboard

| Time | Scene | Beat |
| --- | --- | --- |
| 0–6 s | **The fine print** | A wall of German policy legalese, a scan beam finds the cost clause. "40 pages of fine print." → "One number they never print." → −40 % |
| 6–13 s | **The fee drag** | Two compounding curves, the gap fills red, the number counts up to **€113,300** |
| 13–19 s | **The reform** | 2026 · Altersvorsorgedepot: state matching, tax deferral, commission-free |
| 19–29 s | **The product** | Upload → local OCR → fee boss fight → Sunday streak, XP, cash-flow waterfall |
| 29–35 s | **The engine** | Open finance · ledger · net tariffs · regulatory guards · voice copilot |
| 35–40 s | **CTA** | FiCo · "Turn fees into compounding." · fade to black |

## Numbers are computed, not asserted

`motion.html` owns a tiny projection model (`MODEL`):

```
€140/month · 40 years · 6.0 % p.a. (net tariff + Altersvorsorgedepot)
                        vs. 4.0 % effective (4.5 % Zillmerung + 2.0 % TER)
→ gap €113,300
```

The chart, the boss-fight bars and the big number all read from the same function,
so the visuals cannot drift from the claim. It lines up with the README's
"~€112,400 over 40 years" shock metric.

## Voiceover script (English, ~40 s)

| In | Out | Line |
| --- | --- | --- |
| 0.2 | 5.8 | "Forty pages of fine print. One number they never print: the fees." |
| 6.2 | 12.8 | "Same hundred and forty euros a month. The legacy contract ends a hundred and thirteen thousand euros behind." |
| 13.3 | 18.8 | "In 2026 Germany launches the Altersvorsorgedepot: subsidised, tax-advantaged, commission-free." |
| 19.3 | 28.7 | "So we built FiCo. Drop in your policy. Local OCR finds every hidden cost — and turns your fee monster into a weekly boss fight." |
| 29.3 | 34.7 | "Underneath: one append-only ledger, open-finance sync, net tariffs, and regulatory guards compiled into code." |
| 35.4 | 39.4 | "FiCo. Turn fees into compounding." |

The video ships silent. Add the VO and a music bed in your editor, or record it
and mux it with `ffmpeg -i fico-pitch.mp4 -i vo.wav -c:v copy -c:a aac ...`.

## Re-render

```bash
node pitch/render.mjs                    # full 1200 frames -> out/fico-pitch.mp4
node pitch/render.mjs --stills 4.8,11.5  # single frames -> out/stills/
node pitch/render.mjs --from=6 --to=13   # partial render
```

Requirements: Node 20+, ffmpeg on `PATH`, Playwright + its Chromium headless shell
(the script reuses `~/Library/Caches/ms-playwright/chromium_headless_shell-*`).
Override with `PLAYWRIGHT_MODULE=` / `CHROMIUM_EXECUTABLE=` if needed.
