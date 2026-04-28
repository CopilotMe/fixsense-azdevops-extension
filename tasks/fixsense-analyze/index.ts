import * as tl from "azure-pipelines-task-lib/task";
import * as path from "path";
import * as fs from "fs";

async function run() {
  try {
    const apiKey = tl.getInput("apiKey", true)!;
    const resultsPath = tl.getInput("resultsPath", false) || "**/*.trx";
    const apiUrl =
      tl.getInput("apiUrl", false) ||
      "https://fix-sense.com/api/v1/analyze";

    // Find test result files
    const resultFiles = tl.findMatch(
      tl.getVariable("System.DefaultWorkingDirectory") || ".",
      resultsPath
    );

    if (resultFiles.length === 0) {
      tl.warning("No test result files found matching: " + resultsPath);
      tl.setResult(tl.TaskResult.Succeeded, "No test results to analyze");
      return;
    }

    console.log(`Found ${resultFiles.length} test result file(s)`);

    // Parse failures from result files
    const failures: Array<{
      testName: string;
      errorMessage: string;
      stackTrace: string | null;
      testFile: string;
    }> = [];

    for (const file of resultFiles) {
      const content = fs.readFileSync(file, "utf-8");
      const ext = path.extname(file).toLowerCase();

      if (ext === ".trx") {
        // Parse TRX (Visual Studio Test Results)
        const resultRegex =
          /<UnitTestResult\s+((?:[^>](?!\/>))*[^>])>([\s\S]*?)<\/UnitTestResult>/g;
        let match;
        while ((match = resultRegex.exec(content)) !== null) {
          const attrs = match[1];
          const body = match[2];
          const outcomeMatch = attrs.match(/outcome\s*=\s*"([^"]*)"/);
          if (!outcomeMatch || outcomeMatch[1] !== "Failed") continue;

          const nameMatch = attrs.match(/testName\s*=\s*"([^"]*)"/);
          const testName = nameMatch?.[1] || "Unknown test";

          const messageMatch = body.match(/<Message>([\s\S]*?)<\/Message>/);
          const stackMatch = body.match(
            /<StackTrace>([\s\S]*?)<\/StackTrace>/
          );

          failures.push({
            testName,
            errorMessage: messageMatch?.[1]?.trim() || "Test failed",
            stackTrace: stackMatch?.[1]?.trim() || null,
            testFile: path.basename(file),
          });
        }
      } else if (ext === ".xml") {
        // Parse JUnit XML
        const testcaseRegex =
          /<testcase\s+([^>]*?)>([\s\S]*?)<\/testcase>/g;
        let match;
        while ((match = testcaseRegex.exec(content)) !== null) {
          const attrs = match[1];
          const body = match[2];
          const failureMatch = body.match(
            /<(?:failure|error)\s*([^>]*?)>([\s\S]*?)<\/(?:failure|error)>/
          );
          if (!failureMatch) continue;

          const nameMatch = attrs.match(/name\s*=\s*"([^"]*)"/);
          const classMatch = attrs.match(/classname\s*=\s*"([^"]*)"/);
          const testName = classMatch
            ? `${classMatch[1]} > ${nameMatch?.[1] || "unknown"}`
            : nameMatch?.[1] || "Unknown test";

          const msgMatch = failureMatch[1].match(
            /message\s*=\s*"([^"]*)"/
          );
          const errorMessage =
            failureMatch[2]?.trim() || msgMatch?.[1] || "Test failed";

          failures.push({
            testName,
            errorMessage,
            stackTrace: failureMatch[2]?.trim() || null,
            testFile: path.basename(file),
          });
        }
      }
    }

    if (failures.length === 0) {
      console.log("All tests passed — nothing to analyze");
      tl.setResult(tl.TaskResult.Succeeded, "All tests passed");
      return;
    }

    console.log(
      `Sending ${failures.length} failure(s) to FixSense for analysis...`
    );

    // Get CI context
    const repo = tl.getVariable("Build.Repository.Name") || "";
    const buildId = tl.getVariable("Build.BuildId") || "";
    const prNumber = tl.getVariable("System.PullRequest.PullRequestId");

    // Send to FixSense API
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        repo,
        runId: buildId,
        prNumber: prNumber ? parseInt(prNumber, 10) : undefined,
        failures: failures.map((f) => ({
          testName: f.testName,
          testFile: f.testFile,
          errorMessage: f.errorMessage,
          stackTrace: f.stackTrace,
        })),
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      tl.warning(
        `FixSense API error (${response.status}): ${text.slice(0, 200)}`
      );
      tl.setResult(
        tl.TaskResult.SucceededWithIssues,
        "Analysis sent with warnings"
      );
      return;
    }

    const data = await response.json();
    console.log(
      `FixSense: ${data.analyzed ?? failures.length} failure(s) sent for analysis`
    );
    if (data.dashboardUrl) {
      console.log(`Dashboard: ${data.dashboardUrl}`);
    }

    tl.setResult(
      tl.TaskResult.Succeeded,
      `${failures.length} failure(s) analyzed`
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    tl.setResult(tl.TaskResult.Failed, message);
  }
}

run();
