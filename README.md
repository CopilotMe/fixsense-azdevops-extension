# FixSense — Azure DevOps Extension

Azure DevOps Marketplace extension that adds a pipeline task for AI-powered test failure analysis.

See [overview.md](overview.md) for the full Marketplace listing description and pipeline examples.

## Documentation

- [Integration guide](https://fix-sense.vercel.app/docs/integrations/azure-devops)
- [Dashboard](https://fix-sense.vercel.app/dashboard)

## Development

```bash
cd tasks/fixsense-analyze
npm install
npm run build
```

To package the extension (requires `tfx-cli`):

```bash
npm install -g tfx-cli
tfx extension create --manifest-globs vss-extension.json
```
