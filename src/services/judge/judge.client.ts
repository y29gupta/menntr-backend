// src/services/judge/judge.client.ts
import axios from 'axios';

const JUDGE_URL = process.env.JUDGE_URL || 'http://4.186.24.240:5000';

export async function runOnJudge(payload: {
  language: string;
  code: string;
  testCases: { input: string; output: string }[];
}) {
  const res = await axios.post(`${JUDGE_URL}/run`, payload, {
    timeout: 10000,
  });

  return res.data;
}
