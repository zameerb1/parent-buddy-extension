#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const ChromeExtension = require('crx');

const ROOT = __dirname;
const EXT_DIR = path.join(ROOT, 'extension');
const KEY_PATH = path.join(ROOT, 'extension.pem');
const OUT_PATH = path.join(ROOT, 'parent-buddy.crx');

async function main() {
  const privateKey = fs.readFileSync(KEY_PATH);

  const crx = new ChromeExtension({ privateKey });
  await crx.load(EXT_DIR);
  const crxBuffer = await crx.pack();

  fs.writeFileSync(OUT_PATH, crxBuffer);
  console.log(`CRX written to ${OUT_PATH}`);

  // Derive extension ID from the public key
  const crypto = require('crypto');
  const publicKey = crypto.createPublicKey(privateKey).export({ type: 'spki', format: 'der' });
  const hash = crypto.createHash('sha256').update(publicKey).digest('hex');
  const extensionId = hash.substring(0, 32).replace(/[0-9a-f]/g, c => 'abcdefghijklmnop'['0123456789abcdef'.indexOf(c)]);
  console.log(`Extension ID: ${extensionId}`);
}

main().catch(err => { console.error(err); process.exit(1); });
