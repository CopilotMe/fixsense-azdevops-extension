# FixSense — AI Test Failure Analysis

FixSense analyzes your failing CI tests using AI and provides:

- **Root cause analysis** — understand why each test failed
- **App bug vs test bug** classification — know if the issue is in your code or your test
- **Flakiness scoring** — identify intermittent failures (0–100 score)
- **Auto-fix suggestions** — actionable steps to resolve each failure
- **Auto-fix agent** — AI agent that creates fix PRs automatically (BYOK)

## Supported Test Frameworks

Works with any framework that produces **TRX** or **JUnit XML** reports:
- NUnit, xUnit, MSTest (.NET)
- JUnit, TestNG (Java)
- pytest (Python)
- Jest, Vitest (JavaScript/TypeScript)
- Playwright, Cypress (E2E)

## Quick Setup

1. Get your API key from [FixSense Dashboard](https://fix-sense.com/dashboard/settings)
2. Store it as a pipeline secret variable: `FIXSENSE_API_KEY`
3. Add the task to your pipeline after your test step:

```yaml
steps:
  - task: FixSenseAnalyze@0
    condition: failed()
    inputs:
      apiKey: $(FIXSENSE_API_KEY)
      resultsPath: '**/*.trx'
```

4. View results on your [FixSense Dashboard](https://fix-sense.com/dashboard)

## Full Pipeline Example (.NET)

```yaml
trigger:
  - main

pool:
  vmImage: 'ubuntu-latest'

steps:
  - task: DotNetCoreCLI@2
    displayName: Run tests
    inputs:
      command: test
      arguments: '--logger "trx;LogFileName=results.trx" --results-directory $(Build.SourcesDirectory)/test-results'
    continueOnError: true

  - task: FixSenseAnalyze@0
    displayName: Analyze failures with FixSense
    condition: failed()
    inputs:
      apiKey: $(FIXSENSE_API_KEY)
      resultsPath: 'test-results/**/*.trx'

  - task: PublishTestResults@2
    inputs:
      testResultsFormat: VSTest
      testResultsFiles: 'test-results/**/*.trx'
```

## Full Pipeline Example (JUnit XML — Java/Python/JS)

```yaml
steps:
  - script: npx playwright test --reporter=junit
    displayName: Run Playwright tests
    continueOnError: true

  - task: FixSenseAnalyze@0
    displayName: Analyze failures with FixSense
    condition: failed()
    inputs:
      apiKey: $(FIXSENSE_API_KEY)
      resultsPath: '**/*.xml'
```

## Inputs

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `apiKey` | Yes | — | Your FixSense API key |
| `resultsPath` | No | `**/*.trx` | Glob pattern for TRX or JUnit XML files |
| `apiUrl` | No | Production URL | Override for self-hosted deployments |

## Links

- [Documentation](https://fix-sense.com/docs/integrations/azure-devops)
- [Dashboard](https://fix-sense.com/dashboard)
- [GitHub](https://github.com/CopilotMe/fixsense-azdevops-extension)
- [Support](https://fix-sense.com/docs)
