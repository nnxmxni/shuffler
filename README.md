# Paper Shuffler

Write options on paper slips, shuffle, and draw one together. Peer to peer in the browser: no server, no accounts.

- Open the page, share the room code (or the link) with others.
- Everyone drops slips in. Other people's slips stay folded until one is drawn.
- Anyone can shuffle and draw; all peers see the same result.

Peers find each other through public Nostr relays via [Trystero](https://github.com/dmotz/trystero), then talk directly over WebRTC.

## Local test

```bash
python3 -m http.server 8765
node p2p-test.mjs --disable-features=WebRtcHideLocalIpsWithMdns   # needs: npm i puppeteer-core, Google Chrome
```
