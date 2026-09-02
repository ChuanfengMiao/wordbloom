# Security policy

## Supported version

Security fixes target the latest code on `main`.

## Reporting a vulnerability

Please use GitHub's private vulnerability reporting for this repository. Do not open a public issue containing exploit details, credentials, private progress exports, or other personal data.

Include the affected commit, reproduction conditions, potential impact, and a minimal proof of concept when safe. You should receive an acknowledgment within seven days.

## Security model

WordBloom intentionally has no accounts, analytics, cloud synchronization, application backend, or remote progress storage. This sharply limits its exposed surface but does not remove browser, dependency, supply-chain, import-validation, or deployment risks.

Treat exported progress and notes as private. Never attach a real backup export to a public issue. The project ignores common export filenames, environment files, private keys, build output, and deployment archives, but contributors must still inspect staged changes before committing.
