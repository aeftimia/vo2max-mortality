#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Load VO2 data
const vo2Path = path.join(__dirname, '..', 'js', 'data', 'friend-2022-continuous-data.js');
if (!fs.existsSync(vo2Path)) {
  console.error('friend-2022-continuous-data.js not found at', vo2Path);
  process.exit(2);
}
const vo2Src = fs.readFileSync(vo2Path, 'utf8');
global.FRIEND_2022_CONTINUOUS = JSON.parse(vo2Src.replace(/^window\.FRIEND_2022_CONTINUOUS\s*=\s*/, '').replace(/;\s*$/, ''));

// Load grip data
const gripPath = path.join(__dirname, '..', 'js', 'data', 'grip-strength-data.js');
if (!fs.existsSync(gripPath)) {
  console.error('grip-strength-data.js not found at', gripPath);
  process.exit(2);
}
const gripSrc = fs.readFileSync(gripPath, 'utf8');
global.GRIP_STRENGTH_DATA = JSON.parse(gripSrc.replace(/^window\.GRIP_STRENGTH_DATA\s*=\s*/, '').replace(/;\s*$/, ''));

const model = require(path.join(__dirname, '..', 'js', 'data', 'fitness-model.js'));

function assert(cond,msg){
 if(!cond){ console.error('FAIL:',msg); process.exit(1);} }

console.log('Running VO2 model sanity tests...');
const age=40; const sex='male';
const p=50;
const vo2 = model.getVo2FromPercentile(age,p,sex);
assert(typeof vo2==='number' && vo2>0, 'vo2FromPercentile should be positive number');
const p_back = model.getPercentileFromVo2(age,vo2,sex);
assert(Math.abs(p_back - p) <= 1.0, `percentile inverse should be close to ${p}, got ${p_back}`);
const k = model.getNormalizationConstant(age,sex,'k','vo2max');
assert(Number.isFinite(k) && k>0, 'k should be finite positive');
const hr = model.getNormalizedFitnessHR(age,vo2,sex,'central','vo2max');
assert(Number.isFinite(hr) && hr>0, 'hr should be finite positive');
console.log('  VO2 tests passed.');

console.log('Running grip model sanity tests...');
const grip = model.getMetricFromPercentile(50, 50, 'male', 'grip');
assert(typeof grip==='number' && grip>0, 'grip from percentile should be positive');
const gp_back = model.getPercentileFromMetric(50, grip, 'male', 'grip');
assert(Math.abs(gp_back - 50) <= 1.0, `grip percentile inverse should be close to 50, got ${gp_back}`);
const gk = model.getNormalizationConstant(50, 'male', 'k', 'grip');
assert(Number.isFinite(gk) && gk>0, 'grip k should be finite positive');
const ghr = model.getNormalizedFitnessHR(50, grip, 'male', 'central', 'grip');
assert(Number.isFinite(ghr) && ghr>0, 'grip hr should be finite positive');

// Sex-stratified HR: female should have different k than male
const gk_f = model.getNormalizationConstant(50, 'female', 'k', 'grip');
assert(Math.abs(gk - gk_f) > 0.01, 'grip k should differ between sexes');
console.log('  Grip tests passed.');

console.log('All tests passed.');
process.exit(0);
