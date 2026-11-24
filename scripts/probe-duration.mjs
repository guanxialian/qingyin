import axios from 'axios';
import * as cheerio from 'cheerio';
import dayjs from 'dayjs';
import he from 'he';
import CryptoJS from 'crypto-js';
import { readFileSync } from 'node:fs';

const code = readFileSync(new URL('./bilibili-plugin.js', import.meta.url), 'utf8');
const mod = { exports: {} };
new Function('module', 'exports', 'require', 'global', 'globalThis', 'process', code)(
  mod,
  mod.exports,
  (name) => ({ axios, cheerio, dayjs, he, 'crypto-js': CryptoJS })[name] ?? {},
  globalThis,
  globalThis,
  process,
);
const api = mod.exports;
const res = await api.search('权御天下', 1, 'music');
console.log('items', res.data.length);
for (const it of res.data.slice(0, 5)) console.log(it.title.slice(0, 20), '| duration=', it.duration, '| date=', it.date);
