const { exec } = require('child_process');
const fs = require('fs');
const { v4: uuid } = require('uuid');

exports.runJS = (code, testCases, timeLimitMs) => {
  return new Promise((resolve) => {
    const id = uuid();
    const file = `/tmp/${id}.js`;

    let runner = `
${code}

function __run() {
${testCases.map((t) => `console.log(isPalindrome(${JSON.stringify(t.input)}));`).join('\n')}
}
__run();
`;

    fs.writeFileSync(file, runner);

    exec(`node ${file}`, { timeout: timeLimitMs }, (err, stdout, stderr) => {
      if (err) {
        return resolve({ status: 'runtime_error', error: stderr });
      }

      const outputs = stdout.trim().split('\n');
      let passed = 0;

      outputs.forEach((o, i) => {
        if (String(o).trim() === String(testCases[i].output)) passed++;
      });

      resolve({
        status: passed === testCases.length ? 'accepted' : 'wrong_answer',
        passed,
        total: testCases.length,
        outputs,
      });
    });
  });
};
