# PhysicsIntern Hobby Controller

Minimal public Vercel controller for the private
`Dmitry-dev-pet/rubik-physics-intern` research workspace.

This repository intentionally contains **no research material and no secrets**.
Its only job is to create/resume a persistent Vercel Sandbox and authorize
requests coming from the exact GitHub Actions workflow in the private research
repository.

## Deploy on Vercel Hobby

Use the public-repository import:

https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FDmitry-dev-pet%2Fphysics-intern-hobby-controller&project-name=physics-intern-hobby-controller

No OpenAI API key and no GitHub PAT are required in Vercel.

The controller uses:

- GitHub Actions OIDC to authenticate incoming control requests;
- Vercel project OIDC for Sandbox access;
- a short-lived GitHub Actions `GITHUB_TOKEN` only while a research stage is
  running;
- persistent Vercel Sandbox snapshots for the Codex ChatGPT device-login state.

## Hobby profile

- persistent named Sandbox;
- 2 vCPU / 4 GiB;
- 40-minute Sandbox session;
- research stages are bounded by the private repository workflow;
- no `autoresearch` on Hobby.

## Security boundary

The controller accepts only GitHub OIDC tokens whose claims match:

```text
repository = Dmitry-dev-pet/rubik-physics-intern
actor      = Dmitry-dev-pet
workflow   = .github/workflows/physics-intern-hobby.yml@refs/heads/main
audience   = vercel-physics-intern-hobby
```

The research repository stays private. ChatGPT authentication is stored only
inside the persistent Sandbox filesystem.

## After deployment

Copy the production URL, for example:

```text
https://physics-intern-hobby-controller.vercel.app
```

and set the private research repository variable:

```text
VERCEL_PHYSICS_CONTROLLER_URL=<production-url>
```

Then run **PhysicsIntern Hobby → login**, complete the Codex device login, and
start with **survey**.
