const express = require('express');
const bodyParser = require('body-parser');
const { runPython } = require('./runner/python');
const { runJS } = require('./runner/javascript');

const app = express();
app.use(bodyParser.json());

app.post('/run', async (req, res) => {
  const { language, code, testCases, timeLimitMs = 2000 } = req.body;

  try {
    let result;
    if (language === 'python') {
      result = await runPython(code, testCases, timeLimitMs);
    } else if (language === 'javascript') {
      result = await runJS(code, testCases, timeLimitMs);
    } else {
      return res.status(400).json({ error: 'Unsupported language' });
    }

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(5000, () => {
  console.log('Judge running on port 5000');
});
