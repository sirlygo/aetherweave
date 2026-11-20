# Aetherweave: Phase 1
Duel and capture prototype. Vite + TypeScript, phone-first.

    npm i
    npm run dev      # play on your phone via the LAN URL
    npm test         # capture math + duel engine
    npm run build    # static site in dist/

Deploy: push to `main`, then in the repo go to Settings, Pages, Source: GitHub Actions.
Data lives in `data/*.json`; rules in `src/engine/`.
