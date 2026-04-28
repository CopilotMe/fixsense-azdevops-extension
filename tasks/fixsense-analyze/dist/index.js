"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const tl = __importStar(require("azure-pipelines-task-lib/task"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
async function run() {
    try {
        const apiKey = tl.getInput("apiKey", true);
        const resultsPath = tl.getInput("resultsPath", false) || "**/*.trx";
        const apiUrl = tl.getInput("apiUrl", false) ||
            "https://fix-sense.com/api/v1/analyze";
        // Find test result files
        const resultFiles = tl.findMatch(tl.getVariable("System.DefaultWorkingDirectory") || ".", resultsPath);
        if (resultFiles.length === 0) {
            tl.warning("No test result files found matching: " + resultsPath);
            tl.setResult(tl.TaskResult.Succeeded, "No test results to analyze");
            return;
        }
        console.log(`Found ${resultFiles.length} test result file(s)`);
        // Parse failures from result files
        const failures = [];
        for (const file of resultFiles) {
            const content = fs.readFileSync(file, "utf-8");
            const ext = path.extname(file).toLowerCase();
            if (ext === ".trx") {
                // Parse TRX (Visual Studio Test Results)
                const resultRegex = /<UnitTestResult\s+((?:[^>](?!\/>))*[^>])>([\s\S]*?)<\/UnitTestResult>/g;
                let match;
                while ((match = resultRegex.exec(content)) !== null) {
                    const attrs = match[1];
                    const body = match[2];
                    const outcomeMatch = attrs.match(/outcome\s*=\s*"([^"]*)"/);
                    if (!outcomeMatch || outcomeMatch[1] !== "Failed")
                        continue;
                    const nameMatch = attrs.match(/testName\s*=\s*"([^"]*)"/);
                    const testName = nameMatch?.[1] || "Unknown test";
                    const messageMatch = body.match(/<Message>([\s\S]*?)<\/Message>/);
                    const stackMatch = body.match(/<StackTrace>([\s\S]*?)<\/StackTrace>/);
                    failures.push({
                        testName,
                        errorMessage: messageMatch?.[1]?.trim() || "Test failed",
                        stackTrace: stackMatch?.[1]?.trim() || null,
                        testFile: path.basename(file),
                    });
                }
            }
            else if (ext === ".xml") {
                // Parse JUnit XML
                const testcaseRegex = /<testcase\s+([^>]*?)>([\s\S]*?)<\/testcase>/g;
                let match;
                while ((match = testcaseRegex.exec(content)) !== null) {
                    const attrs = match[1];
                    const body = match[2];
                    const failureMatch = body.match(/<(?:failure|error)\s*([^>]*?)>([\s\S]*?)<\/(?:failure|error)>/);
                    if (!failureMatch)
                        continue;
                    const nameMatch = attrs.match(/name\s*=\s*"([^"]*)"/);
                    const classMatch = attrs.match(/classname\s*=\s*"([^"]*)"/);
                    const testName = classMatch
                        ? `${classMatch[1]} > ${nameMatch?.[1] || "unknown"}`
                        : nameMatch?.[1] || "Unknown test";
                    const msgMatch = failureMatch[1].match(/message\s*=\s*"([^"]*)"/);
                    const errorMessage = failureMatch[2]?.trim() || msgMatch?.[1] || "Test failed";
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
        console.log(`Sending ${failures.length} failure(s) to FixSense for analysis...`);
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
            tl.warning(`FixSense API error (${response.status}): ${text.slice(0, 200)}`);
            tl.setResult(tl.TaskResult.SucceededWithIssues, "Analysis sent with warnings");
            return;
        }
        const data = await response.json();
        console.log(`FixSense: ${data.analyzed ?? failures.length} failure(s) sent for analysis`);
        if (data.dashboardUrl) {
            console.log(`Dashboard: ${data.dashboardUrl}`);
        }
        tl.setResult(tl.TaskResult.Succeeded, `${failures.length} failure(s) analyzed`);
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        tl.setResult(tl.TaskResult.Failed, message);
    }
}
run();
