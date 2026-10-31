# Run your own agent on a VM and link it to Macoma

This folder puts any chat model behind the **A2A** protocol (the open agent-to-agent standard Macoma speaks). Examples are a Grok bot via xAI's API, or a model running on your own server. Once it's running, any Macoma user can link it in their workspace and text "ask Grok to…".

```
your phone ──text──▶ Macoma ──A2A + your key──▶ agent-bridge on your VM ──▶ Grok (xAI API) or any OpenAI-style model
          ◀─"Grok says: …"─┘ (after your YES)
```

## 1. Get a VM and a domain (about 15 minutes)

- Any small Linux VM works, such as DigitalOcean, Hetzner, AWS Lightsail or your own box. 1 vCPU and 1 GB is plenty, because the model runs at the provider.
- Install Docker (`curl -fsSL https://get.docker.com | sh`).
- Point a domain at the VM's IP with an A record, for example `agent.yourdomain.com`, and open ports 80 and 443.

## 2. Configure

```bash
git clone <this repo> && cd Macoma-beta-/bridge
cp .env.example .env
openssl rand -hex 32        # paste as BRIDGE_TOKEN
```

Fill in `.env`:

| Setting | What to put |
|---|---|
| `AGENT_DOMAIN`, `PUBLIC_URL` | Your domain, for example `agent.yourdomain.com` and `https://agent.yourdomain.com` |
| `AGENT_NAME` | What you'll call it in texts, for example `Grok` |
| `MODEL_BASE_URL` | `https://api.x.ai/v1` for Grok (xAI's API is OpenAI-compatible), or any OpenAI-style endpoint |
| `MODEL_API_KEY` | Your provider key (for xAI, from console.x.ai) |
| `MODEL` | The model id exactly as your provider lists it |
| `BRIDGE_TOKEN` | The random string from above. Only callers with it get in. |

## 3. Start it

```bash
docker compose up -d
curl https://agent.yourdomain.com/.well-known/agent-card.json      # the agent's card
curl -X POST https://agent.yourdomain.com/a2a -H "authorization: Bearer $BRIDGE_TOKEN" \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"message/send","params":{"message":{"kind":"message","role":"user","messageId":"1","parts":[{"kind":"text","text":"hello"}]}}}'
```

Caddy gets the HTTPS certificate automatically.

## 4. Link it in Macoma

Go to Workspace → **Your agents** and enter:
- **Name:** Grok
- **Address:** `https://agent.yourdomain.com`
- **Key:** your `BRIDGE_TOKEN`

Macoma checks that the address answers and that the key is accepted before saving. The key is stored encrypted and is only ever sent to that address.

Then text Macoma "ask Grok to find three suppliers for ½" copper fittings near me". Macoma shows you the exact message, you reply YES, and Grok's answer comes back as a text.

## Make it do more than chat

All of the agent's thinking happens in one function, `think()` in `agent-bridge.mjs`. Replace it with anything:
- a tool-calling loop;
- a local model;
- a browser-driving agent on the VM that fills forms or places orders, for example with the browser-use library, Playwright, or a computer-use model.

The protocol, the key check and Macoma's YES step stay the same. If the agent spends money, read `docs/AGENTS_AND_PAYMENTS.md` first.

## Security notes

- Keep `BRIDGE_TOKEN` secret. Anyone with it can use your model key through this agent.
- The bridge keeps only the last 10 turns per conversation, in memory, for 2 hours. Nothing is written to disk.
- To use the agent from several Macoma accounts, give each a different token: run one bridge per token, or extend `authorized()`.
