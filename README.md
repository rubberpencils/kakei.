# kakie.

Phone ledger that turns bank SMS into spends, plus a small API so groups share the same balances.

Node **22.18 or newer** (the server uses built-in `node:sqlite`). This machine is on Node 24.

## 1. Install

From the repo root:

```bash
npm install
npm --prefix server install
```

Local config is copied from the examples (`.env` and `server/.env`). Both are gitignored.

## 2. Start the server

```bash
npm run server
```

Listens on `0.0.0.0:4000`. The log line `phone URL:` is the address a phone on the same Wi-Fi should use.

Reload on file changes:

```bash
npm --prefix server run dev
```

## 3. Start the app

```bash
npx expo start
```

Expo Go can open the UI. It cannot read bank SMS or run the on-phone MCP server. Both go through the native module `modules/kakie-sms`, which is only in an installed build.

## 4. Build an APK for your phone

Log in once:

```bash
npx eas-cli@latest login
```

Then:

```bash
npx eas-cli@latest build --platform android --profile preview
```

That profile (`eas.json`) makes an installable APK and bakes in `EXPO_PUBLIC_API_URL`. It is currently `http://10.107.5.250:4000`. Phone and PC must be on the same Wi-Fi.

When the build page says finished, open it on the phone and install the APK.

If the server log shows a different `phone URL`, either update `preview.env.EXPO_PUBLIC_API_URL` in `eas.json` before the next build, or on the account screen tap **Change**, paste that URL, and tap **Test and use**. The in-app change does not need a new build.

## SMS module

Keep `modules/kakie-sms`. Android uses it to read the bank inbox (`readInbox`) and to run the MCP listener (`startMcp`, `stopMcp`, `mcpReply`). iOS does not read the inbox. iOS intake is the Shortcuts flow in onboarding.

## Money, splits and groups

Kakei does not move money. UPI blocks one-tap payments from an app to a person's UPI ID (NPCI rule 7.9), so you pay however you like and tap **Mark as paid** or **Mark as received**.

- **Spend is your share only.** A plain expense counts in full. A split counts only your part. Money you paid for friends and have not got back shows in green after your share (Home bar, Personal, Insights).
- **Quick split.** Any expense can be split with a few people (**Split this** on the expense, or the Review screen). It becomes a small split under Groups > Splits. It never shows in the Home carousel.
- **Group.** A trip, a flat or Friday lunches: many bills over time, one running balance. Made from New group.

## Developer: MCP server on your phone

Profile > Developer > **MCP server** turns the phone into a read-only [MCP](https://modelcontextprotocol.io) server (Streamable HTTP, `POST /mcp`, bearer token). Answers are worked out on the phone from its own data. No cloud copy, no relay.

1. Turn it on. Keep the app open. The screen stays awake while it runs.
2. USB only (default, loopback): plug in the phone and run `adb reverse tcp:8765 tcp:8765`. Wi-Fi: pick **Wi-Fi** and use the address shown.
3. Tap **Copy MCP config** and paste it into Cursor, Claude Desktop or any HTTP MCP client.

Tools: `get_summary`, `list_transactions`, `spending_by_tag`, `list_groups`, `get_balances`. Never exposed: SMS text, account numbers, phone number, password. Requests with a browser `Origin` header are refused.

## Does it need the server?

Only for shared groups and cross-device sync. The server keeps friends' balances identical on each phone and backs up your data. It no longer holds UPI IDs (the columns are dropped on start). Your own spending, the SMS import, quick splits you do alone and the MCP server all work from the phone.
