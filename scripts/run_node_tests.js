#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const jsonPath = path.join(__dirname, '..', 'js', 'data', 'friend-2022-continuous.json');
if (!fs.existsSync(jsonPath)) {
  console.error('friend-2022-continuous.json not found at', jsonPath);
  process.exit(2);
}
const data = JSON.parse(fs.readFileSync(jsonPath,'utf8'));
// Expose to module scope expected by the model (global variable in browser)
global.FRIEND_2022_CONTINUOUS = data;

const model = require(path.join(__dirname, '..', 'js', 'data', 'friend-2022-continuous-model.js'));

function assert(cond,msg){
 if(!cond){ console.error('FAIL:',msg); process.exit(1);} }

console.log('Running basic model sanity tests...');
const age=40; const sex='male';
const p=50;
const vo2 = model.getVo2FromPercentile(age,p,sex);
assert(typeof vo2==='number' && vo2>0, 'vo2FromPercentile should be positive number');
const p_back = model.getPercentileFromVo2(age,vo2,sex);
assert(Math.abs(p_back - p) <= 1.0, `percentile inverse should be close to ${p}, got ${p_back}`);
const k = model.getNormalizationConstant(age,sex);
assert(Number.isFinite(k) && k>0, 'k should be finite positive');
const hr = model.getNormalizedFitnessHR(age,vo2,sex);
assert(Number.isFinite(hr) && hr>0, 'hr should be finite positive');
console.log('All tests passed.');
process.exit(0);
