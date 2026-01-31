const { exec } = require('child_process');
const fs = require('fs');
const { v4: uuid } = require('uuid');

exports.runPython = (code, testCases, timeLimitMs) => {
  return new Promise((resolve) => {
    const id = uuid();
    const file = `/tmp/${id}.py`;

    let runner = `
${code}

def __run():
`;
    testCases.forEach((t, i) => {
      runner += `
    try:
        print(isPalindrome(${JSON.stringify(t.input)}))
    except Exception as e:
        print("ERROR")
`;
    });

    fs.writeFileSync(file, runner);

    exec(`python3 ${file}`, { timeout: timeLimitMs }, (err, stdout, stderr) => {
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
