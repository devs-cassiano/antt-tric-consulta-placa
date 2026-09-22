# ANTT TRIC Consulta

API e interface web em Node.js + TypeScript + Express para consultar veículos habilitados no sistema TRIC da ANTT e devolver os dados em JSON estruturado.

## Requisitos

- Node.js 18+

## Instalação

```bash
npm install
```

## Desenvolvimento

```bash
npm run dev
```

Abra [http://localhost:3000](http://localhost:3000).

## Produção (API Express)

```bash
npm run build
npm start
```

## AWS Amplify (frontend estático)

O Amplify Hosting clássico **não executa** o Express. Apenas a pasta `public/` é publicada (ver `amplify.yml`).

1. Faça o redeploy após o `amplify.yml` estar no repositório.
2. Em **Hosting → Rewrites and redirects**, adicione (tipo **200 Rewrite**):
   - Source: `</^[^.]+$|\.(?!(css|gif|ico|jpg|js|png|txt|svg|woff|woff2|ttf|map|json|webp|html)$)([^.]+$)/>`
   - Target: `/index.html`
3. Em `public/config.js`, defina `apiBaseUrl` com a URL do backend Node (API Gateway, ECS, etc.), por exemplo:
   ```js
   window.__ANTT_TRIC_CONFIG__ = { apiBaseUrl: "https://sua-api.exemplo.com" };
   ```
4. Garanta CORS no backend se o domínio Amplify for diferente do da API.

## Endpoints

- `GET /api/health`
- `GET /api/consulta/:placa`
- `POST /api/consulta` com body `{ "placa": "ABC1D23" }`

## Fonte

Consulta oficial: [https://scff.antt.gov.br/conPlaca.asp](https://scff.antt.gov.br/conPlaca.asp)
