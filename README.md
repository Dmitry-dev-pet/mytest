# mytest — transitional Vercel deployment aggregator

**Do not use this repository as a source of truth for new development.**

This repository currently exists because the live Vercel project `mytest` is connected to it. It temporarily bundles two independently owned components:

- controller/API runtime — canonical source: `Dmitry-dev-pet/physics-intern-hobby-controller`;
- Rubik browser visualizer — canonical source: `Dmitry-dev-pet/rubik-graph-lab`.

## Why it still exists

As of 2026-09-28 the only connected Vercel project is named `mytest`, and production deployments are sourced from `Dmitry-dev-pet/mytest/main`. Archiving or deleting this repository now would risk breaking the live controller/visualizer deployment.

## Migration target

1. Deploy `physics-intern-hobby-controller` independently and point `rubik-physics-intern` to that controller URL.
2. Deploy `rubik-visualizer` independently.
3. Verify both production paths.
4. Remove duplicated controller/visualizer source from this repository.
5. Archive this repository.

Until those steps are complete, changes here should be treated as deployment synchronization only.
