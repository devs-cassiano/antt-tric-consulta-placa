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

## Produção

```bash
npm run build
npm start
```

## Endpoints

- `GET /api/health`
- `GET /api/consulta/:placa`
- `POST /api/consulta` com body `{ "placa": "ABC1D23" }`

## Fonte

Consulta oficial: [https://scff.antt.gov.br/conPlaca.asp](https://scff.antt.gov.br/conPlaca.asp)
