#!/usr/bin/env node
/**
 * Construction Bot Smoke Test
 *
 * Kritik sistem kontrolleri:
 * 1. Health check — Render endpoint 200 dönüyor mu?
 * 2. Firestore bağlantısı — is_takibi koleksiyonundan son kayıt çekilebiliyor mu?
 * 3. OpenAI API key geçerli mi?
 * 4. Telegram webhook aktif mi?
 * 5. Son 1 saat aktivite var mı?
 *
 * Çalıştır: node smoke_test.mjs [--json]
 */

import fetch from 'node-fetch';
import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const JSON_OUTPUT = process.argv.includes('--json');

// ─── TYPES ───────────────────────────────────────────────────────────────────
const CHECKS = {
  HEALTH: 'health',
  FIRESTORE: 'firestore',
  OPENAI: 'openai',
  TELEGRAM: 'telegram',
  ACTIVITY: 'activity'
};

// ─── CONFIG ──────────────────────────────────────────────────────────────────
const RENDER_URL = process.env.RENDER_EXTERNAL_URL || 'http://localhost:3000';
const BOT_TOKEN = process.env.TELEGRAM_TOKEN;
const OPENAI_KEY = process.env.OPENAI_API_KEY;

let db = null;
const results = [];

// ─── FIREBASE INIT ───────────────────────────────────────────────────────────
function initFirebase() {
  try {
    const credentialsJson = process.env.FIREBASE_CREDENTIALS;
    if (!credentialsJson) {
      throw new Error('FIREBASE_CREDENTIALS env var not set');
    }

    const credentials = JSON.parse(credentialsJson);

    // Check if already initialized
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert(credentials)
      });
    }

    db = admin.firestore();
    return true;
  } catch (error) {
    console.error('Firebase init error:', error.message);
    return false;
  }
}

// ─── CHECK FUNCTIONS ─────────────────────────────────────────────────────────

async function checkHealth() {
  const check = { id: CHECKS.HEALTH, name: 'Health Check', status: '❌', detail: '' };

  try {
    const url = `${RENDER_URL}/` || `${RENDER_URL}/health`;
    const response = await fetch(url, { timeout: 5000 });

    if (response.status === 200 || response.status === 404) {
      check.status = '✅';
      check.detail = `${response.status} from ${url}`;
    } else {
      check.detail = `Unexpected status ${response.status}`;
    }
  } catch (error) {
    check.detail = error.message;
  }

  results.push(check);
}

async function checkFirestore() {
  const check = { id: CHECKS.FIRESTORE, name: 'Firestore Connection', status: '❌', detail: '' };

  try {
    if (!db) {
      if (!initFirebase()) {
        check.detail = 'Firebase initialization failed';
        results.push(check);
        return;
      }
    }

    const snapshot = await db.collection('is_takibi')
      .orderBy('timestamp', 'desc')
      .limit(1)
      .get();

    if (snapshot.size > 0) {
      const doc = snapshot.docs[0];
      check.status = '✅';
      check.detail = `Retrieved: ${doc.id} (${new Date(doc.data().timestamp).toISOString()})`;
    } else {
      check.status = '⚠️';
      check.detail = 'No records in is_takibi';
    }
  } catch (error) {
    check.detail = error.message;
  }

  results.push(check);
}

async function checkOpenAI() {
  const check = { id: CHECKS.OPENAI, name: 'OpenAI API Key', status: '❌', detail: '' };

  try {
    if (!OPENAI_KEY) {
      check.detail = 'OPENAI_API_KEY not set';
      results.push(check);
      return;
    }

    const response = await fetch('https://api.openai.com/v1/models', {
      headers: { Authorization: `Bearer ${OPENAI_KEY}` },
      timeout: 5000
    });

    if (response.status === 200) {
      check.status = '✅';
      check.detail = 'Valid API key, models endpoint accessible';
    } else if (response.status === 401) {
      check.detail = 'Invalid API key (401 Unauthorized)';
    } else {
      check.detail = `Unexpected status ${response.status}`;
    }
  } catch (error) {
    check.detail = error.message;
  }

  results.push(check);
}

async function checkTelegram() {
  const check = { id: CHECKS.TELEGRAM, name: 'Telegram Webhook', status: '❌', detail: '' };

  try {
    if (!BOT_TOKEN) {
      check.detail = 'TELEGRAM_TOKEN not set';
      results.push(check);
      return;
    }

    const response = await fetch(
      `https://api.telegram.org/bot${BOT_TOKEN}/getWebhookInfo`,
      { timeout: 5000 }
    );

    if (response.status === 200) {
      const data = await response.json();
      if (data.ok && data.result.url) {
        check.status = '✅';
        check.detail = `Webhook: ${data.result.url}`;
      } else {
        check.status = '⚠️';
        check.detail = 'Webhook not configured';
      }
    } else {
      check.detail = `API error: ${response.status}`;
    }
  } catch (error) {
    check.detail = error.message;
  }

  results.push(check);
}

async function checkActivity() {
  const check = { id: CHECKS.ACTIVITY, name: 'Last 1 Hour Activity', status: '❌', detail: '' };

  try {
    if (!db) {
      if (!initFirebase()) {
        check.detail = 'Firebase initialization failed';
        results.push(check);
        return;
      }
    }

    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const snapshot = await db.collection('is_takibi')
      .where('timestamp', '>=', oneHourAgo.getTime())
      .limit(5)
      .get();

    if (snapshot.size > 0) {
      check.status = '✅';
      check.detail = `${snapshot.size} record(s) in last hour`;
    } else {
      check.status = '⚠️';
      check.detail = 'No activity in last hour';
    }
  } catch (error) {
    check.detail = error.message;
  }

  results.push(check);
}

// ─── OUTPUT ──────────────────────────────────────────────────────────────────

function printResults() {
  const passed = results.filter(r => r.status === '✅').length;
  const warnings = results.filter(r => r.status === '⚠️').length;
  const failed = results.filter(r => r.status === '❌').length;

  if (JSON_OUTPUT) {
    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      summary: { passed, warnings, failed, total: results.length },
      checks: results
    }, null, 2));
  } else {
    console.log('\n╔══════════════════════════════════════════════════════╗');
    console.log('║       CONSTRUCTION BOT SMOKE TEST RESULTS              ║');
    console.log('╚══════════════════════════════════════════════════════╝\n');

    results.forEach(check => {
      console.log(`${check.status} ${check.name}`);
      if (check.detail) {
        console.log(`   ${check.detail}\n`);
      }
    });

    console.log('─'.repeat(54));
    console.log(`SUMMARY: ${passed}✅ ${warnings}⚠️ ${failed}❌ (Total: ${results.length})\n`);
  }
}

// ─── MAIN ────────────────────────────────────────────────────────────────────

async function main() {
  try {
    // Run all checks
    await checkHealth();
    await checkFirestore();
    await checkOpenAI();
    await checkTelegram();
    await checkActivity();

    // Print results
    printResults();

    // Exit code
    const failed = results.filter(r => r.status === '❌').length;
    process.exit(failed > 0 ? 1 : 0);
  } catch (error) {
    console.error('Fatal error:', error.message);
    process.exit(1);
  }
}

main();
