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
  // lobby: a name is required; A gets the room from the link, B types the code
  await page.type('#lobbyName', label === 'A' ? 'Ada' : 'Ben')
  if (label === 'B') await page.type('#lobbyCode', room.toLowerCase())
  await page.click('#enter')
  await page.waitForSelector('#main:not([hidden])')
  return page
}
const listText = p => p.$$eval('#list li span:first-child', els => els.map(e => e.textContent))
const bowlCount = p => p.$$eval('#bowl .slip', els => els.length)
const until = async (p, fn, ms = 45000) => {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) { if (await fn()) return true; await new Promise(r => setTimeout(r, 500)) }
  return false
}
const add = async (p, text) => { await p.type('#text', text); await p.keyboard.press('Enter') }

const A = await mk('A')
await add(A, 'Pizza'); await add(A, 'Sushi')
console.log('A slips', await listText(A))

const lobbyBlocked = await (async () => { const ctx = await browser.createBrowserContext(); const p = await ctx.newPage(); await p.goto(url); await p.click('#enter'); const r = await p.$eval('#main', e => e.hidden); await ctx.close(); return r })()
console.log('Entering without a name is blocked:', lobbyBlocked)
const B = await mk('B')
console.log('B entered A\'s room via the lobby:', await B.$eval('#code', e => e.textContent) === room)
const t0 = Date.now()
const synced = await until(B, async () => (await bowlCount(B)) === 2)
console.log('B sees two folded slips in the bowl and nothing in its list:', synced && (await listText(B)).length === 0, `(${((Date.now() - t0) / 1000).toFixed(1)}s)`, await listText(B))
console.log('A header:', await A.$eval('#peers', e => e.textContent), '| B header:', await B.$eval('#peers', e => e.textContent))
console.log('A sees Ben in the room:', await until(A, async () => /Ben/.test(await A.$eval('#people', e => e.textContent)), 5000), '|', await A.$eval('#people', e => e.textContent))
console.log('A got a join notice:', await A.$eval('#toast', e => e.classList.contains('show') && /Ben joined the bowl/.test(e.textContent)), '|', await A.$eval('#toast', e => e.textContent))
console.log('Ben\'s chip is highlighted as new:', await A.$eval('#people .tag.new', e => /Ben/.test(e.textContent)).catch(() => false))

await add(B, 'Tacos')
console.log('A got a folded slip from B in the bowl, list still only its own:', await until(A, async () => (await bowlCount(A)) === 3, 10000), await listText(A))
console.log('B bowl shows no A text:', await B.$$eval('#bowl .slip', els => els.every(e => !/Pizza|Sushi/.test(e.textContent))))
const held = await B.evaluate(() => window.__slips())
console.log('B holds no text at all for A\'s slips (only fingerprints):', held.filter(s => !s.mine).length === 2 && held.filter(s => !s.mine).every(s => !s.hasText), held)
console.log('B page source holds no A text anywhere:', await B.evaluate(() => !/Pizza|Sushi/.test(document.documentElement.outerHTML + JSON.stringify(Object.entries(localStorage)))))

// ---- ready check ----
console.log('A told to wait while Ben is writing:', await until(A, async () => await A.$eval('#tip', e => /Waiting for Ben/.test(e.textContent)), 5000), '|', await A.$eval('#tip', e => e.textContent))
await A.click('#bowl .slip')
await new Promise(r => setTimeout(r, 800))
console.log('Tapping a slip does nothing while locked:', !(await A.$eval('#result', e => e.classList.contains('show'))))
console.log('Shuffle button disabled while Ben writes:', await A.$eval('#draw', e => e.disabled && /Waiting for Ben/.test(e.textContent)), '|', await A.$eval('#draw', e => e.textContent))
console.log('A sees Ben still writing:', await A.$eval('#people', e => /Ben.*still writing/.test(e.textContent)))
await B.click('#ready')
console.log('A may draw once Ben is done:', await until(A, async () => await A.$eval('#tip', e => /tap a slip/.test(e.textContent)), 5000), '|', await A.$eval('#people', e => e.textContent))
console.log('Shuffle button enabled again:', await until(A, async () => await A.$eval('#draw', e => !e.disabled), 5000))

await A.click('#draw')   // shuffle only
await new Promise(r => setTimeout(r, 2300))
console.log('Shuffle alone shows no result:', !(await A.$eval('#result', e => e.classList.contains('show'))), '|', await A.$eval('#tip', e => e.textContent))
console.log('B saw the shake too (bowl mixed, no result):', !(await B.$eval('#result', e => e.classList.contains('show'))))
await A.click('#bowl .slip.folded')   // reach in and draw
await new Promise(r => setTimeout(r, 2000))
const wA = await A.$eval('#winnerText', e => e.textContent)
const wB = await B.$eval('#winnerText', e => e.textContent)
const whoB = await B.$eval('#who', e => e.textContent)
console.log('draw A:', JSON.stringify(wA), 'B:', JSON.stringify(wB), 'same:', wA === wB && !!wA, '| B says:', whoB)
console.log('B winner slip unfolded with text:', await B.$eval('#bowl .slip.winner', e => !e.classList.contains('folded') && e.textContent) === wA)
const heldAfter = await B.evaluate(() => window.__slips())
console.log('B now holds text only for the drawn slip:', heldAfter.filter(s => !s.mine && s.hasText).length === 1)

// ---- a slip added after the draw clears the result everywhere ----
await add(B, 'Late one')
console.log('A result cleared after Ben added a slip:', await until(A, async () => !(await A.$eval('#result', e => e.classList.contains('show'))), 5000))
console.log('A got the explanation:', await A.$eval('#toast', e => e.textContent), '| A locked again:', await until(A, async () => await A.$eval('#tip', e => /Waiting for Ben/.test(e.textContent)), 5000))

// ---- second round: Ben done, A draws, Ben takes the winner out ----
await B.click('#ready')
await until(A, async () => await A.$eval('#tip', e => /Shake the bowl first/.test(e.textContent)), 5000)
await A.click('#bowl .slip.folded')
await new Promise(r => setTimeout(r, 800))
console.log('Tapping before a shake does nothing:', !(await A.$eval('#result', e => e.classList.contains('show'))), '|', await A.$eval('#toast', e => e.textContent))
await A.click('#draw'); await new Promise(r => setTimeout(r, 2300))
await A.click('#bowl .slip.folded')
await new Promise(r => setTimeout(r, 2000))
const before = await bowlCount(A)
await B.click('#takeOut')
console.log('A lost one slip after B removed the winner:', await until(A, async () => (await bowlCount(A)) === before - 1, 10000), await listText(A))
console.log('A result hidden:', await until(A, async () => !(await A.$eval('#result', e => e.classList.contains('show'))), 5000))

// ---- reveal all: gated like the draw, then every slip opens on both sides ----
if (!(await B.$eval('#ready', e => e.classList.contains('on')))) await B.click('#ready')
console.log('A reveal unlocked:', await until(A, async () => await A.$eval('#revealAll', e => !e.disabled), 5000))
await A.click('#revealAll')
await new Promise(r => setTimeout(r, 3200))
const openB = await B.$$eval('#bowl .slip', els => ({ all: els.every(e => !e.classList.contains('folded')), texts: els.map(e => e.textContent) }))
console.log('B sees every slip open after A revealed all:', openB.all && openB.texts.length === 3 && openB.texts.every(x => x && x !== 'opening…'), openB.texts, '|', await B.$eval('#who', e => e.textContent))
await B.click('#putBack')
console.log('A folded back after B put them away:', await until(A, async () => await A.$$eval('#bowl .slip', els => els.every(e => e.classList.contains('folded'))), 5000))

// ---- leaving: B closes the tab, A's people list drops Ben promptly ----
const t1 = Date.now()
await B.browserContext().close()
const gone = await until(A, async () => !/Ben/.test(await A.$eval('#people', e => e.textContent)), 20000)
console.log('A dropped Ben after B closed the tab:', gone, `(${((Date.now() - t1) / 1000).toFixed(1)}s)`, '|', await A.$eval('#people', e => e.textContent), '|', await A.$eval('#toast', e => e.textContent))
console.log('A no longer waits on Ben:', await until(A, async () => !/Waiting for Ben/.test(await A.$eval('#draw', e => e.textContent)), 5000))

await browser.close()
