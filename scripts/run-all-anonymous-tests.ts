/**
 * Anonymous User Flow Complete Test Suite Runner
 * 
 * This script runs all the anonymous user flow tests in sequence
 * and generates a consolidated report.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';

const execAsync = promisify(exec);

// Test script paths
const testScripts = [
  'test-anonymous-flow.ts',
  'test-anonymous-client.ts',
  'test-anonymous-edge-cases.ts'
];

// Results holder
interface TestResult {
  script: string;
  success: boolean;
  output: string;
  error?: string;
  duration: number;
}

/**
 * Run all test scripts
 */
async function runAllTests() {
  console.log("\n====== RUNNING ALL ANONYMOUS USER FLOW TESTS ======\n");
  
  const results: TestResult[] = [];
  const startTime = Date.now();
  
  // Create results directory if it doesn't exist
  const resultsDir = path.join(process.cwd(), 'test-results');
  try {
    await fs.mkdir(resultsDir, { recursive: true });
  } catch (err) {
    console.error("Failed to create results directory:", err);
  }
  
  // Run each test script
  for (const script of testScripts) {
    console.log(`\n>> Running test script: ${script}`);
    const scriptStartTime = Date.now();
    
    try {
      // Execute the script with tsx
      const { stdout, stderr } = await execAsync(`npx tsx scripts/${script}`);
      
      const duration = Date.now() - scriptStartTime;
      console.log(`>> Completed in ${duration}ms`);
      
      // Check for errors
      const success = !stderr || stderr.trim().length === 0;
      
      // Add to results
      results.push({
        script,
        success,
        output: stdout,
        error: stderr || undefined,
        duration
      });
      
      // Log output
      console.log(stdout);
      if (stderr) {
        console.error(stderr);
      }
      
    } catch (error) {
      const duration = Date.now() - scriptStartTime;
      console.error(`>> Failed in ${duration}ms`);
      console.error(error);
      
      results.push({
        script,
        success: false,
        output: error.stdout || '',
        error: error.stderr || error.message,
        duration
      });
    }
  }
  
  // Generate report
  const totalDuration = Date.now() - startTime;
  const successCount = results.filter(r => r.success).length;
  
  const report = generateReport(results, totalDuration);
  
  // Save report to file
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const reportPath = path.join(resultsDir, `anonymous-test-report-${timestamp}.md`);
  
  await fs.writeFile(reportPath, report, 'utf8');
  console.log(`\nReport saved to ${reportPath}`);
  
  // Output summary
  console.log("\n====== TEST SUMMARY ======");
  console.log(`Total scripts: ${testScripts.length}`);
  console.log(`Successful: ${successCount}`);
  console.log(`Failed: ${testScripts.length - successCount}`);
  console.log(`Total time: ${totalDuration}ms`);
  
  // Return success if all tests passed
  return successCount === testScripts.length;
}

/**
 * Generate a markdown report from test results
 */
function generateReport(results: TestResult[], totalTime: number): string {
  const timestamp = new Date().toISOString();
  const successCount = results.filter(r => r.success).length;
  
  let report = `# Anonymous User Flow Test Report\n\n`;
  report += `- **Date:** ${timestamp}\n`;
  report += `- **Total Scripts:** ${results.length}\n`;
  report += `- **Successful:** ${successCount}\n`;
  report += `- **Failed:** ${results.length - successCount}\n`;
  report += `- **Total Duration:** ${totalTime}ms\n\n`;
  
  report += `## Individual Test Results\n\n`;
  
  results.forEach(result => {
    report += `### ${result.script}\n\n`;
    report += `- **Status:** ${result.success ? '✅ Passed' : '❌ Failed'}\n`;
    report += `- **Duration:** ${result.duration}ms\n\n`;
    
    if (result.error) {
      report += `#### Errors\n\`\`\`\n${result.error}\n\`\`\`\n\n`;
    }
    
    report += `#### Output\n\`\`\`\n${result.output}\n\`\`\`\n\n`;
  });
  
  return report;
}

// Execute all tests and exit with appropriate code
runAllTests()
  .then(success => {
    console.log("\nAll tests completed.");
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error("Fatal error running tests:", error);
    process.exit(1);
  });