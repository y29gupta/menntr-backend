const { exec } = require('child_process');
const fs = require('fs');
const { v4: uuid } = require('uuid');

exports.runPython = (code, testCases, timeLimitMs) => {
  return new Promise((resolve) => {
    const id = uuid();
    const file = `/tmp/${id}.py`;

    fs.writeFileSync(file, code);

    let passed = 0;
    let outputs = [];

    const runTest = (i) => {
      if (i >= testCases.length) {
        return resolve({
          status: passed === testCases.length ? 'accepted' : 'wrong_answer',
          passed,
          total: testCases.length,
          outputs,
        });
      }

      const input = testCases[i].input + '\n';
      const expected = String(testCases[i].output).trim();

      const proc = exec(`python3 ${file}`, { timeout: timeLimitMs }, (err, stdout, stderr) => {
        if (err) {
          return resolve({
            status: 'runtime_error',
            error: stderr || err.message,
          });
        }

        const actual = stdout.trim();
        outputs.push(actual);

        if (actual === expected) passed++;

        runTest(i + 1);
      });

      proc.stdin.write(input);
      proc.stdin.end();
    };

    runTest(0);
  });
};
