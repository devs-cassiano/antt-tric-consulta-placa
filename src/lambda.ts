import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyHandlerV2,
  APIGatewayProxyResultV2,
  APIGatewayProxyStructuredResultV2,
} from "aws-lambda";
import { consultarVeiculoPorPlaca } from "./services/anttScraper.service";
import type { AnttResponse } from "./types/antt.types";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type,Authorization,X-Requested-With",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
};

const EMPTY_BODY: AnttResponse = {
  sucesso: false,
  dados_veiculo: {
    placa: "",
    tipo: "",
    modelo: "",
    chassi_motor: "",
    ccu: "",
    marca: "",
    eixos: "",
    ano: "",
  },
  dados_empresa: {
    razao_social: "",
    nome_fantasia: "",
    endereco: "",
    bairro: "",
    cidade: "",
    pais_origem: "",
  },
  situacao_licencas: [],
};

function jsonResponse(statusCode: number, body: unknown): APIGatewayProxyStructuredResultV2 {
  return {
    statusCode,
    headers: CORS_HEADERS,
    body: JSON.stringify(body),
  };
}

function getPath(event: APIGatewayProxyEventV2): string {
  const raw = event.rawPath || event.requestContext?.http?.path || "";
  // Function URL / API Gateway podem prefixar stage; normaliza
  return raw.replace(/\/+$/, "") || "/";
}

function extractPlaca(event: APIGatewayProxyEventV2): string {
  const pathParams = event.pathParameters ?? {};
  if (pathParams.placa) return String(pathParams.placa);

  // /api/consulta/{placa} ou /consulta/{placa}
  const path = getPath(event);
  const match = path.match(/\/(?:api\/)?consulta\/([^/?#]+)/i);
  if (match?.[1]) {
    try {
      return decodeURIComponent(match[1]);
    } catch {
      return match[1];
    }
  }

  const query = event.queryStringParameters ?? {};
  if (query.placa) return String(query.placa);

  if (event.body) {
    try {
      const parsed = JSON.parse(event.isBase64Encoded
        ? Buffer.from(event.body, "base64").toString("utf8")
        : event.body) as { placa?: string };
      if (parsed?.placa) return String(parsed.placa);
    } catch {
      // body form-urlencoded simples: placa=ABC
      const text = event.isBase64Encoded
        ? Buffer.from(event.body, "base64").toString("utf8")
        : event.body;
      const params = new URLSearchParams(text);
      const fromForm = params.get("placa");
      if (fromForm) return fromForm;
    }
  }

  return "";
}

function isClientErrorMessage(mensagem: string | undefined): boolean {
  if (!mensagem) return false;
  return /informe a placa|placa inv[aá]lida/i.test(mensagem);
}

function isPortalFailureMessage(mensagem: string | undefined): boolean {
  if (!mensagem) return false;
  return /tempo esgotado|falha na comunica|erro ao consultar|consulta indispon[ií]vel|n[aã]o foi poss[ií]vel extrair/i.test(
    mensagem
  );
}

function statusForResult(resultado: AnttResponse, placaInformada: string): number {
  if (!placaInformada.trim()) return 400;
  if (isClientErrorMessage(resultado.mensagem)) return 400;
  if (isPortalFailureMessage(resultado.mensagem)) return 500;
  // sucesso ou veículo não cadastrado
  return 200;
}

export const handler: APIGatewayProxyHandlerV2 = async (
  event
): Promise<APIGatewayProxyResultV2> => {
  const method = (event.requestContext?.http?.method || "GET").toUpperCase();

  if (method === "OPTIONS") {
    return {
      statusCode: 204,
      headers: CORS_HEADERS,
      body: "",
    };
  }

  const path = getPath(event);

  if (path === "/api/health" || path === "/health" || path.endsWith("/api/health")) {
    return jsonResponse(200, {
      ok: true,
      service: "antt-tric-consulta",
      runtime: "aws-lambda",
    });
  }

  const isConsultaRoute =
    /\/(?:api\/)?consulta(?:\/|$)/i.test(path) ||
    Boolean(event.queryStringParameters?.placa) ||
    method === "POST";

  if (!isConsultaRoute && method === "GET" && path === "/") {
    return jsonResponse(200, {
      ok: true,
      service: "antt-tric-consulta",
      endpoints: ["GET /api/health", "GET /api/consulta/{placa}", "POST /api/consulta"],
    });
  }

  if (!isConsultaRoute) {
    return jsonResponse(404, {
      ...EMPTY_BODY,
      mensagem: `Rota não encontrada: ${path}. Use /api/consulta/{placa}`,
    });
  }

  const placa = extractPlaca(event);

  if (!placa.trim()) {
    return jsonResponse(400, {
      ...EMPTY_BODY,
      mensagem: "Informe a placa do veículo para realizar a consulta.",
    });
  }

  try {
    const resultado = await consultarVeiculoPorPlaca(placa);
    const statusCode = statusForResult(resultado, placa);
    return jsonResponse(statusCode, resultado);
  } catch (error) {
    const mensagem =
      error instanceof Error ? error.message : "Erro interno ao processar a consulta.";
    return jsonResponse(500, {
      ...EMPTY_BODY,
      mensagem,
      dados_veiculo: {
        ...EMPTY_BODY.dados_veiculo,
        placa: placa.replace(/[^a-zA-Z0-9.]/g, "").toUpperCase(),
      },
    });
  }
};
