// Two-peer sync test. Needs: npm i puppeteer-core, the page served at http://localhost:8765, and Google Chrome.
// Run: node p2p-test.mjs --disable-features=WebRtcHideLocalIpsWithMdns   (flag needed for two peers on one machine here)
import puppeteer from 'puppeteer-core'
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const room = 'T' + Math.random().toString(36).slice(2, 7).toUpperCase()
const url = `http://localhost:8765/index.html?t=${Date.now()}#${room}`
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: process.argv.slice(2) })
const mk = async label => {
  const ctx = await browser.createBrowserContext()
  const page = await ctx.newPage()
  page.on('console', m => { if (m.type() !== 'log') console.log(`[${label}:${m.type()}]`, m.text().slice(0, 140)) })
  await page.goto(label === 'B' ? url.split('#')[0] : url)
  return page
}
const listText = p => p.$$eval('#list li span:first-child', els => els.map(e => e.textContent))
const until = async (p, fn, ms = 45000) => {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) { if (await fn()) return true; await new Promise(r => setTimeout(r, 500)) }
  return false
}
const add = async (p, text) => { await p.type('#text', text); await p.keyboard.press('Enter') }

const A = await mk('A')
await add(A, 'Pizza'); await add(A, 'Sushi')
console.log('A slips', await listText(A))

const B = await mk('B')
console.log('B started in its own room:', await B.$eval('#code', e => e.textContent) !== room)
await B.type('#joinCode', room.toLowerCase()); await B.keyboard.press('Enter')
console.log('B joined by typing the code:', await B.$eval('#code', e => e.textContent) === room)
const t0 = Date.now()
const synced = await until(B, async () => (await listText(B)).length === 2)
console.log('B sees A slips folded, not the text:', synced && JSON.stringify(await listText(B)) === '["folded slip","folded slip"]', `(${((Date.now() - t0) / 1000).toFixed(1)}s)`, await listText(B))
console.log('A header:', await A.$eval('#peers', e => e.textContent), '| B header:', await B.$eval('#peers', e => e.textContent))

await add(B, 'Tacos')
console.log('A got a folded slip from B:', await until(A, async () => (await listText(A)).length === 3, 10000), await listText(A))
console.log('B bowl shows no A text:', await B.$$eval('#bowl .slip', els => els.every(e => !/Pizza|Sushi/.test(e.textContent))))

await A.click('#draw')
await new Promise(r => setTimeout(r, 2500))
const wA = await A.$eval('#winnerText', e => e.textContent)
const wB = await B.$eval('#winnerText', e => e.textContent)
const whoB = await B.$eval('#who', e => e.textContent)
console.log('draw A:', JSON.stringify(wA), 'B:', JSON.stringify(wB), 'same:', wA === wB && !!wA, '| B says:', whoB)
console.log('B winner slip unfolded with text:', await B.$eval('#bowl .slip.winner', e => !e.classList.contains('folded') && e.textContent) === wA, '| highlighted:', await B.$eval('#bowl', e => e.classList.contains('revealed') && !!e.querySelector('.slip.winner')))

if (await B.$eval('#result', e => e.classList.contains('show'))) await B.click('#takeOut'); else console.log('skip takeOut: no result on B')
console.log('A down to 2 slips after B removed winner:', await until(A, async () => (await listText(A)).length === 2, 10000), await listText(A))
console.log('A result hidden:', await until(A, async () => !(await A.$eval('#result', e => e.classList.contains('show'))), 5000))

await browser.close()
