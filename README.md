# ANTT TRIC Consulta

Consulta de veículos habilitados no TRIC/ANTT com frontend estático (AWS Amplify) e API Serverless (AWS Lambda).

## Requisitos

- Node.js 18+

## Instalação

```bash
npm install
```

## Desenvolvimento local (Express)

Útil para testar UI + API no mesmo origin:

```bash
npm run dev
```

Abra [http://localhost:3000](http://localhost:3000).

## Build da Lambda

Gera um bundle único em `dist-lambda/index.js` e o pacote `lambda.zip` para upload:

```bash
npm run build:lambda
npm run package:lambda
```

- **Handler**: `index.handler`
- **Runtime sugerido**: Node.js 20.x
- **Timeout sugerido**: 30–60 s (o portal ANTT pode demorar)

## Deploy da Lambda (Function URL)

1. No console AWS Lambda → **Create function** (Author from scratch, Node.js 20.x).
2. Em **Code** → **Upload from** → **.zip file**, envie `lambda.zip`.
3. Em **Runtime settings**, confirme o handler: `index.handler`.
4. Em **Configuration → Function URL**:
   - Create function URL
   - Auth type: **NONE** (ou AWS_IAM, conforme a sua política)
   - Configure CORS se necessário (o handler já devolve `Access-Control-Allow-Origin: *`)
5. Copie a Function URL (ex.: `https://xxxx.lambda-url.us-east-1.on.aws`).

Rotas atendidas pela Lambda:

- `GET /api/health`
- `GET /api/consulta/{placa}`
- `POST /api/consulta` com body `{ "placa": "ABC1D23" }`

## AWS Amplify (frontend estático)

O Amplify publica apenas a pasta `public/` (ver `amplify.yml`). A API **não** corre no Amplify — use a Lambda.

### 1. Deploy do frontend

Faça push/redeploy com o `amplify.yml` no repositório (`baseDirectory: public`).

### 2. Rewrites and redirects

No Amplify Console → **Hosting → Rewrites and redirects**, configure **nesta ordem**:

| Source | Target | Type |
|--------|--------|------|
| `/api/<*>` | `https://<LAMBDA_FUNCTION_URL>/api/<*>` | **200 (Rewrite)** |
| `</^[^.]+$\|\.(?!(css\|gif\|ico\|jpg\|js\|png\|txt\|svg\|woff\|woff2\|ttf\|map\|json\|webp\|html)$)([^.]+$)/>` | `/index.html` | **200 (Rewrite)** |

Substitua `<LAMBDA_FUNCTION_URL>` pela Function URL real **sem** barra final.

Exemplo:

- Source: `/api/<*>`
- Target: `https://xxxxxxxx.lambda-url.us-east-1.on.aws/api/<*>`
- Type: `200 (Rewrite)`

Assim, `https://antt.peresminuanolog.com/api/consulta/ABC1D23` é encaminhado à Lambda sem CORS e sem 404 no Amplify.

### 3. `public/config.js`

Mantenha `apiBaseUrl: ""` para chamadas relativas no mesmo domínio:

```js
window.__ANTT_TRIC_CONFIG__ = {
  apiBaseUrl: "",
};
```

Só preencha `apiBaseUrl` se quiser chamar a Lambda diretamente (sem rewrite), por exemplo:

```js
window.__ANTT_TRIC_CONFIG__ = {
  apiBaseUrl: "https://xxxxxxxx.lambda-url.us-east-1.on.aws",
};
```

## Express (opcional / legado)

```bash
npm run build
npm start
```

## Códigos HTTP da API (Lambda)

| Status | Situação |
|--------|----------|
| `200` | Veículo encontrado **ou** não cadastrado (`sucesso: false` + mensagem) |
| `400` | Placa ausente ou inválida |
| `500` | Falha de comunicação / portal ANTT indisponível |

## Fonte

Consulta oficial: [https://scff.antt.gov.br/conPlaca.asp](https://scff.antt.gov.br/conPlaca.asp)
