# ANTT TRIC Consulta

[![Node.js](https://img.shields.io/badge/Node.js-20%2B%20%7C%2022-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![AWS Amplify](https://img.shields.io/badge/AWS-Amplify-FF9900?logo=amazonaws&logoColor=white)](https://aws.amazon.com/amplify/)
[![AWS Lambda](https://img.shields.io/badge/AWS-Lambda-FF9900?logo=awslambda&logoColor=white)](https://aws.amazon.com/lambda/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

Consulta pública de veículos habilitados ao **Transporte Rodoviário Internacional de Cargas (TRIC)** junto à **ANTT**, com frontend estático e API serverless.

---

## Visão geral e arquitetura

O sistema não depende de um servidor Express em execução contínua em produção. O fluxo é:

```text
Browser (SPA)
    │  GET /api/consulta/{placa}   (mesmo domínio)
    ▼
AWS Amplify Hosting  ──Rewrite 200──►  AWS Lambda (Function URL)
    │  public/index.html                    │
    │  public/config.js                     │  axios + cheerio
    ▼                                       ▼
UI / PDF no cliente              Portal SCFF ANTT
                                 scff.antt.gov.br
```

| Camada | Tecnologia | Papel |
|--------|------------|--------|
| Frontend | HTML/CSS/JS estático em `public/` | SPA de consulta, cards, JSON e geração de PDF no browser |
| Hosting | **AWS Amplify** (`amplify.yml` → `baseDirectory: public`) | Serve a UI e faz *reverse proxy* de `/api/*` |
| API | **AWS Lambda** + **Function URL** | Handler em `src/lambda.ts` (bundle `lambda.zip`) |
| Extração | `axios` + `cheerio` (+ `iconv-lite` / latin1) | Raspagem em tempo real do portal público SCFF/ANTT |

Fonte oficial de consulta: [https://scff.antt.gov.br/conPlaca.asp](https://scff.antt.gov.br/conPlaca.asp) → processamento em `conLocalizaVeiculo.asp`.

> **Express local:** `npm run dev` / `src/server.ts` permanece apenas como opção de desenvolvimento (UI + API no mesmo origin em `http://localhost:3000`).

---

## Funcionalidades principais

### Consulta de veículos habilitados ao TRIC

- Busca por **placa / matrícula** de veículos **nacionais e estrangeiros**.
- Retorno estruturado em JSON (`AnttResponse`) com dados do veículo (tipo, modelo, marca, ano, eixos, chassi/motor, CCU, etc.).

### Identificação da transportadora

Extração dos dados cadastrais da empresa vinculada ao veículo:

- Razão Social e Nome Fantasia  
- Endereço, Bairro e Cidade  
- País de Origem  
- **CNPJ** (quando a transportadora for brasileira e o dado constar no HTML do portal SCFF)

### Auditoria de licenças

Relação de **situação das licenças** internacionais (originárias / complementares conforme exibido pelo portal):

- Par **De / Para** (origem → destino)  
- Tipo / situação de **tráfego** (ex.: bilateral, trânsito, autorizado, etc.)

### Veículo não cadastrado

- Alerta visual **único** (card central), sem mensagem de erro duplicada sob o campo de busca.
- O texto sob o input fica reservado a **validações locais de formato**.
- **Comprovante em PDF** (cliente, via jsPDF): atestado com placa, data/hora (`DD/MM/AAAA às HH:mm:ss`), parecer formal de não localização e rodapé citando o Portal SCFF / ANTT.  
  Nome sugerido: `comprovante-antt-nao-localizado-{PLACA}.pdf`.

### Relatório PDF (consulta com sucesso)

Download de relatório formatado com veículo, empresa e licenças: `relatorio-tric-{PLACA}.pdf`.

---

## Instalação e execução local

### Pré-requisitos

- **Node.js 20+** ou **22+**
- npm 10+ (incluído nas versões atuais do Node)

### Instalação

```bash
git clone <url-do-repositorio>
cd antt-tric-consulta
npm install
```

### Desenvolvimento (Express + UI)

```bash
npm run dev
```

Abra [http://localhost:3000](http://localhost:3000).

### Scripts disponíveis

| Script | Descrição |
|--------|-----------|
| `npm run dev` | API Express + estáticos em watch (`tsx`) |
| `npm run build` | Compila TypeScript → `dist/` (Express) |
| `npm start` | Executa o Express compilado |
| `npm run build:static` | Valida a presença de `public/index.html` |
| `npm run build:lambda` | Bundle standalone do handler (`esbuild` → `dist-lambda/index.js`) |
| `npm run package:lambda` | Gera `lambda.zip` pronto para upload na AWS |

```bash
npm run build:lambda
npm run package:lambda
```

---

## Deploy e infraestrutura na AWS

### 1. AWS Lambda

1. Crie a função (**Author from scratch**).
2. Configure:

   | Parâmetro | Valor sugerido |
   |-----------|----------------|
   | Runtime | **Node.js 22.x** |
   | Handler | **`index.handler`** |
   | Architecture | **x86_64** |
   | Timeout | **30 segundos** (portal ANTT pode demorar) |

3. Em **Code** → **Upload from** → **.zip file**, envie o `lambda.zip` gerado por `npm run package:lambda`.
4. Em **Configuration → Function URL**:
   - Create function URL  
   - **Auth type: NONE**  
   - CORS: o handler já responde com `Access-Control-Allow-Origin: *` (pode complementar no console se desejar)
5. Copie a Function URL, por exemplo:

   ```text
   https://xxxxxxxx.lambda-url.us-east-1.on.aws
   ```

#### Rotas da API

| Método | Caminho | Descrição |
|--------|---------|-----------|
| `GET` | `/api/health` | Health check |
| `GET` | `/api/consulta/{placa}` | Consulta por placa |
| `POST` | `/api/consulta` | Body JSON `{ "placa": "ABC1D23" }` |

#### Códigos HTTP

| Status | Situação |
|--------|----------|
| `200` | Veículo encontrado **ou** não cadastrado (`sucesso: false` + mensagem) |
| `400` | Placa ausente ou inválida |
| `500` | Falha de comunicação / portal ANTT indisponível |

---

### 2. AWS Amplify Hosting

O Amplify publica apenas a pasta `public/` (ver `amplify.yml`). A API **não** é executada no Amplify — use a Lambda.

1. Conecte o repositório e faça o deploy (artefatos com `baseDirectory: public`).
2. Em **Hosting → Rewrites and redirects**, cadastre as regras **nesta ordem**:

#### Reverse proxy da API

| Campo | Valor |
|-------|--------|
| **Source** | `/api/<*>` |
| **Target** | `https://<LAMBDA_FUNCTION_URL>/api/<*>` |
| **Type** | `200 (Rewrite)` |

Substitua `<LAMBDA_FUNCTION_URL>` pela Function URL **sem** barra final.

Exemplo:

```text
Source:  /api/<*>
Target:  https://xxxxxxxx.lambda-url.us-east-1.on.aws/api/<*>
Type:    200 (Rewrite)
```

Com isso, `https://antt.peresminuanolog.com/api/consulta/ABC1D23` é encaminhado à Lambda no mesmo domínio (sem CORS no browser e sem 404 no Amplify).

#### Fallback SPA (rotas estáticas)

| Campo | Valor |
|-------|--------|
| **Source** | `/<*>` |
| **Target** | `/index.html` |
| **Type** | `404 (Rewrite)` → resposta efetiva **200** com `index.html` |

Alternativa (regex clássica Amplify):

```text
Source:  </^[^.]+$|\.(?!(css|gif|ico|jpg|js|png|txt|svg|woff|woff2|ttf|map|json|webp|html)$)([^.]+$)/>
Target:  /index.html
Type:    200 (Rewrite)
```

### 3. Configuração do frontend (`public/config.js`)

Com o rewrite `/api/<*>` ativo, mantenha a base vazia (chamadas relativas):

```js
window.__ANTT_TRIC_CONFIG__ = {
  apiBaseUrl: "",
};
```

Opcional — chamada direta à Lambda (sem rewrite):

```js
window.__ANTT_TRIC_CONFIG__ = {
  apiBaseUrl: "https://xxxxxxxx.lambda-url.us-east-1.on.aws",
};
```

---

## Estrutura do repositório (resumo)

```text
amplify.yml                 # Build Amplify → public/
public/
  index.html                # SPA (consulta, cards, PDF)
  config.js                 # apiBaseUrl
src/
  lambda.ts                 # Handler AWS Lambda
  server.ts                 # Express (dev / legado)
  services/anttScraper.service.ts
  types/antt.types.ts
lambda.zip                  # Artefato de deploy (gerado localmente)
```

---

## Fonte de dados

Consulta oficial ANTT / SCFF: [https://scff.antt.gov.br/conPlaca.asp](https://scff.antt.gov.br/conPlaca.asp)

Os dados são de **fonte pública**. A disponibilidade e o layout HTML do portal legado (ASP / ISO-8859-1) podem afetar a extração; o parser trata avisos de “não cadastrado” e falhas de comunicação com códigos HTTP adequados.
