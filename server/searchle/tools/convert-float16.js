// Convert a float32 vectors.bin to float16 format
// Usage: node tools/convert-float16.js <model-name>

const fs = require('fs');
const path = require('path');

const MODELS_DIR = path.join(__dirname, '..', 'data', 'models');

// Float32 to Float16 conversion
function float32ToFloat16(val) {
  const f32 = new Float32Array(1);
  const u32 = new Uint32Array(f32.buffer);
  f32[0] = val;

  const bits = u32[0];
  const sign = (bits >> 31) & 1;
  let exp = (bits >> 23) & 0xff;
  let frac = bits & 0x7fffff;

  if (exp === 0xff) {
    // Inf or NaN
    return (sign << 15) | 0x7c00 | (frac ? 0x200 : 0);
  }
  if (exp === 0) {
    // Zero or denormalized (flush to zero)
    return sign << 15;
  }

  exp = exp - 127 + 15;
  if (exp >= 31) {
    // Overflow → Inf
    return (sign << 15) | 0x7c00;
  }
  if (exp <= 0) {
    // Underflow → denormalized or zero
    if (exp < -10) return sign << 15;
    frac = (frac | 0x800000) >> (1 - exp);
    return (sign << 15) | (frac >> 13);
  }

  return (sign << 15) | (exp << 10) | (frac >> 13);
}

const modelName = process.argv[2];
if (!modelName) {
  console.log('Usage: node tools/convert-float16.js <model-name>');
  process.exit(1);
}

const modelDir = path.join(MODELS_DIR, modelName);
const indexPath = path.join(modelDir, 'index.json');
const vecPath = path.join(modelDir, 'vectors.bin');

console.log(`Converting ${modelName} to float16...`);

const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
const { dimensions, count } = index;

const vecBuf = fs.readFileSync(vecPath);
const expectedF32 = count * dimensions * 4;
if (vecBuf.length !== expectedF32) {
  console.error(`vectors.bin size mismatch: expected ${expectedF32}, got ${vecBuf.length}`);
  process.exit(1);
}

const f32 = new Float32Array(vecBuf.buffer, vecBuf.byteOffset, count * dimensions);
const f16 = new Uint16Array(count * dimensions);

console.log(`  Converting ${count.toLocaleString()} words × ${dimensions}d = ${(count * dimensions).toLocaleString()} floats...`);

for (let i = 0; i < f32.length; i++) {
  f16[i] = float32ToFloat16(f32[i]);
}

// Write float16 vectors
const outBuf = Buffer.from(f16.buffer);
fs.writeFileSync(vecPath, outBuf);

// Update index.json with format field
index.format = 'float16';
fs.writeFileSync(indexPath, JSON.stringify(index));

const newSize = fs.statSync(vecPath).size;
console.log(`  Done: ${(expectedF32 / 1024 / 1024).toFixed(1)}MB → ${(newSize / 1024 / 1024).toFixed(1)}MB`);
