#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const jsPath = path.join(__dirname, '..', 'js', 'data', 'friend-2022-continuous-data.js');
if (!fs.existsSync(jsPath)) {
  console.error('friend-2022-continuous-data.js not found at', jsPath);
  process.exit(2);
}
const src = fs.readFileSync(jsPath, 'utf8');
global.FRIEND_2022_CONTINUOUS = JSON.parse(src.replace(/^window\.FRIEND_2022_CONTINUOUS\s*=\s*/, '').replace(/;\s*$/, ''));

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
