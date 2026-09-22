import axios, { AxiosError } from "axios";
import * as cheerio from "cheerio";
import iconv from "iconv-lite";
import type {
  AnttResponse,
  DadosEmpresa,
  DadosVeiculo,
  Licenca,
} from "../types/antt.types";

const ANTT_FORM_URL = "https://scff.antt.gov.br/conPlaca.asp";
const ANTT_RESULT_URL = "https://scff.antt.gov.br/conLocalizaVeiculo.asp";

const EMPTY_VEICULO: DadosVeiculo = {
  placa: "",
  tipo: "",
  modelo: "",
  chassi_motor: "",
  ccu: "",
  marca: "",
  eixos: "",
  ano: "",
};

const EMPTY_EMPRESA: DadosEmpresa = {
  razao_social: "",
  nome_fantasia: "",
  endereco: "",
  bairro: "",
  cidade: "",
  pais_origem: "",
};

function emptyResponse(mensagem: string, placa = ""): AnttResponse {
  return {
    sucesso: false,
    mensagem,
    dados_veiculo: { ...EMPTY_VEICULO, placa },
    dados_empresa: { ...EMPTY_EMPRESA },
    situacao_licencas: [],
  };
}

/** Normaliza texto para comparação de rótulos (sem acentos, minúsculas). */
function normalizeLabel(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[:\s|/\\._-]+/g, " ")
    .trim()
    .toLowerCase();
}

function cleanText(value: string): string {
  return value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function decodeHtmlBuffer(buffer: Buffer): string {
  const head = buffer.subarray(0, Math.min(buffer.length, 2048)).toString("latin1");
  const charsetMatch = head.match(/charset\s*=\s*["']?\s*([a-zA-Z0-9_-]+)/i);
  const charset = (charsetMatch?.[1] ?? "ISO-8859-1").toLowerCase();

  if (charset.includes("utf-8") || charset.includes("utf8")) {
    return buffer.toString("utf8");
  }

  if (iconv.encodingExists(charset)) {
    return iconv.decode(buffer, charset);
  }

  return iconv.decode(buffer, "latin1");
}

function extractSituacaoFromQuery(url: string): string | undefined {
  try {
    const parsed = new URL(url, "https://scff.antt.gov.br");
    const dsc = parsed.searchParams.get("dsc_erro");
    if (!dsc) return undefined;

    const decoded = dsc.replace(/\+/g, " ");
    const situacao = decoded.match(/Situa[^:]*:\s*<\/?b>\s*([^<]+)/i)?.[1];
    if (situacao) return cleanText(situacao);

    const plain = cleanText(decoded.replace(/<[^>]+>/g, " "));
    return plain || undefined;
  } catch {
    return undefined;
  }
}

function extractMessageFromAviso($: cheerio.CheerioAPI): string | undefined {
  const descricaoRow = $("td")
    .filter((_, el) => /descri/i.test($(el).text()))
    .first();

  if (descricaoRow.length) {
    const sibling = descricaoRow.next("td").text();
    if (sibling) return cleanText(sibling);
  }

  const bodyText = cleanText($("body").text());
  if (/n[aã]o cadastrado/i.test(bodyText)) {
    return "VEÍCULO NÃO CADASTRADO NA ANTT!";
  }

  return undefined;
}

/**
 * Varre tabelas HTML e monta um mapa rótulo → valor.
 * Suporta linhas com pares (label|valor) ou dois pares (4 colunas).
 */
function buildLabelMap($: cheerio.CheerioAPI): Map<string, string> {
  const map = new Map<string, string>();

  $("table").each((_, table) => {
    $(table)
      .find("tr")
      .each((__, row) => {
        const cells = $(row)
          .children("td, th")
          .toArray()
          .map((cell) => cleanText($(cell).text()));

        if (cells.length < 2) return;

        for (let i = 0; i + 1 < cells.length; i += 2) {
          const label = cells[i];
          const value = cells[i + 1] ?? "";
          if (!label) continue;

          const key = normalizeLabel(label.replace(/:$/, ""));
          if (!key || key === normalizeLabel(value)) continue;

          const current = map.get(key);
          if (current === undefined || current === "") {
            map.set(key, value);
          }
        }
      });
  });

  return map;
}

function pick(map: Map<string, string>, aliases: string[]): string {
  for (const alias of aliases) {
    const key = normalizeLabel(alias);
    const direct = map.get(key);
    if (direct) return direct;

    for (const [label, value] of map.entries()) {
      if (label === key || label.startsWith(key) || key.startsWith(label)) {
        if (value) return value;
      }
    }
  }
  return "";
}

function parseDadosVeiculo(map: Map<string, string>, placaInformada: string): DadosVeiculo {
  return {
    placa: pick(map, ["placa", "placa do veiculo"]) || placaInformada,
    tipo: pick(map, ["tipo", "tipo do veiculo", "tipo veiculo"]),
    modelo: pick(map, ["modelo"]),
    chassi_motor: pick(map, [
      "chassi motor",
      "chassi/motor",
      "chassi do motor",
      "chassi",
      "n chassi",
      "nr chassi",
    ]),
    ccu: pick(map, ["ccu", "codigo ccu", "código ccu"]),
    marca: pick(map, ["marca"]),
    eixos: pick(map, ["eixos", "n eixos", "nr eixos", "numero de eixos"]),
    ano: pick(map, ["ano", "ano fabricacao", "ano de fabricacao", "ano fab"]),
  };
}

function parseDadosEmpresa(map: Map<string, string>): DadosEmpresa {
  return {
    razao_social: pick(map, ["razao social", "razão social", "empresa", "transportador"]),
    nome_fantasia: pick(map, ["nome fantasia", "fantasia"]),
    endereco: pick(map, ["endereco", "endereço", "logradouro"]),
    bairro: pick(map, ["bairro"]),
    cidade: pick(map, ["cidade", "municipio", "município"]),
    pais_origem: pick(map, ["pais origem", "país origem", "pais de origem", "país de origem", "pais"]),
  };
}

function isLicenseHeaderCell(text: string): boolean {
  const n = normalizeLabel(text);
  return (
    n === "de" ||
    n === "para" ||
    n.includes("trafego") ||
    n.includes("de para") ||
    n === "origem" ||
    n === "destino"
  );
}

function parseLicencas($: cheerio.CheerioAPI): Licenca[] {
  const licencas: Licenca[] = [];

  $("table").each((_, table) => {
    const tableText = normalizeLabel($(table).text());
    const looksLikeLicenseSection =
      tableText.includes("situacao das licenc") ||
      tableText.includes("licenca") ||
      tableText.includes("trafego");

    if (!looksLikeLicenseSection) return;

    const rows = $(table).find("tr").toArray();
    let headerIndex = -1;
    let deIdx = -1;
    let paraIdx = -1;
    let deParaIdx = -1;
    let trafegoIdx = -1;

    rows.forEach((row, index) => {
      const cells = $(row)
        .children("td, th")
        .toArray()
        .map((cell) => cleanText($(cell).text()));

      const headerHits = cells.filter(isLicenseHeaderCell).length;
      if (headerHits >= 2 || cells.some((c) => /tr[aá]fego/i.test(c))) {
        headerIndex = index;
        cells.forEach((cell, i) => {
          const n = normalizeLabel(cell);
          if (n === "de" || n === "origem") deIdx = i;
          else if (n === "para" || n === "destino") paraIdx = i;
          else if (n.includes("de para") || n === "de/para") deParaIdx = i;
          else if (n.includes("trafego") || n.includes("situacao")) trafegoIdx = i;
        });
      }
    });

    if (headerIndex < 0) return;

    for (let r = headerIndex + 1; r < rows.length; r++) {
      const cells = $(rows[r])
        .children("td, th")
        .toArray()
        .map((cell) => cleanText($(cell).text()));

      if (cells.length === 0) continue;
      if (cells.every((c) => !c)) continue;
      if (cells.some(isLicenseHeaderCell) && cells.length <= 3) continue;

      let dePara = "";
      let trafego = "";

      if (deParaIdx >= 0) {
        dePara = cells[deParaIdx] ?? "";
      } else if (deIdx >= 0 || paraIdx >= 0) {
        const de = deIdx >= 0 ? cells[deIdx] ?? "" : "";
        const para = paraIdx >= 0 ? cells[paraIdx] ?? "" : "";
        dePara = [de, para].filter(Boolean).join(" / ");
      } else if (cells.length >= 2) {
        dePara = cells.length >= 3 ? `${cells[0]} / ${cells[1]}` : cells[0] ?? "";
      }

      if (trafegoIdx >= 0) {
        trafego = cells[trafegoIdx] ?? "";
      } else {
        trafego = cells[cells.length - 1] ?? "";
      }

      if (!dePara && !trafego) continue;
      if (/situacao|licenca|dados/i.test(dePara) && !trafego) continue;

      licencas.push({ de_para: dePara, trafego });
    }
  });

  // Deduplica
  const seen = new Set<string>();
  return licencas.filter((item) => {
    const key = `${item.de_para}|${item.trafego}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function hasVeiculoData(veiculo: DadosVeiculo): boolean {
  return Boolean(
    veiculo.placa ||
      veiculo.tipo ||
      veiculo.modelo ||
      veiculo.chassi_motor ||
      veiculo.marca ||
      veiculo.ccu
  );
}

export function parseAnttHtml(html: string, placaInformada = ""): AnttResponse {
  const $ = cheerio.load(html);
  const finalText = cleanText($("body").text());

  const avisoMessage = extractMessageFromAviso($);
  if (avisoMessage) {
    return emptyResponse(avisoMessage, placaInformada.toUpperCase());
  }

  if (/ve[ií]culo\s+n[aã]o\s+cadastrado/i.test(finalText)) {
    return emptyResponse("VEÍCULO NÃO CADASTRADO NA ANTT!", placaInformada.toUpperCase());
  }

  if (/consulta indispon[ií]vel/i.test(finalText)) {
    return emptyResponse("Consulta indisponível no momento. Tente novamente mais tarde.", placaInformada.toUpperCase());
  }

  const labelMap = buildLabelMap($);
  const dados_veiculo = parseDadosVeiculo(labelMap, placaInformada.toUpperCase());
  const dados_empresa = parseDadosEmpresa(labelMap);
  const situacao_licencas = parseLicencas($);

  if (!hasVeiculoData(dados_veiculo) && situacao_licencas.length === 0) {
    return emptyResponse(
      "Não foi possível extrair os dados do veículo na resposta da ANTT.",
      placaInformada.toUpperCase()
    );
  }

  return {
    sucesso: true,
    dados_veiculo,
    dados_empresa,
    situacao_licencas,
  };
}

function sanitizePlaca(placa: string): string {
  return placa.replace(/[^a-zA-Z0-9.]/g, "").toUpperCase();
}

export async function consultarVeiculoPorPlaca(placaRaw: string): Promise<AnttResponse> {
  const placa = sanitizePlaca(placaRaw);

  if (!placa) {
    return emptyResponse("Informe a placa do veículo para realizar a consulta.");
  }

  if (placa.length < 5 || placa.length > 9) {
    return emptyResponse("Placa inválida. Utilize somente letras e números (5 a 9 caracteres).", placa);
  }

  try {
    const response = await axios.post(
      ANTT_RESULT_URL,
      new URLSearchParams({ txtPlaca: placa, placa }).toString(),
      {
        responseType: "arraybuffer",
        timeout: 30000,
        maxRedirects: 5,
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
          Referer: ANTT_FORM_URL,
          Origin: "https://scff.antt.gov.br",
        },
        // Aceita 2xx e também páginas de aviso servidas como 200 após redirect
        validateStatus: (status) => status >= 200 && status < 400,
      }
    );

    const html = decodeHtmlBuffer(Buffer.from(response.data));
    const responseUrl = String(response.request?.res?.responseUrl ?? response.config.url ?? "");

    const fromQuery = extractSituacaoFromQuery(responseUrl);
    if (fromQuery) {
      return emptyResponse(fromQuery, placa);
    }

    if (/msgaviso\.asp/i.test(responseUrl)) {
      const parsed = parseAnttHtml(html, placa);
      if (!parsed.sucesso) return parsed;
      return emptyResponse(parsed.mensagem ?? "Consulta retornou aviso da ANTT.", placa);
    }

    return parseAnttHtml(html, placa);
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const ax = error as AxiosError<ArrayBuffer>;
      if (ax.response?.data) {
        const html = decodeHtmlBuffer(Buffer.from(ax.response.data));
        const location = ax.response.headers.location;
        if (typeof location === "string") {
          const fromQuery = extractSituacaoFromQuery(location);
          if (fromQuery) return emptyResponse(fromQuery, placa);
        }
        return parseAnttHtml(html, placa);
      }

      if (ax.code === "ECONNABORTED") {
        return emptyResponse("Tempo esgotado ao consultar a ANTT. Tente novamente.", placa);
      }

      return emptyResponse(`Falha na comunicação com a ANTT: ${ax.message}`, placa);
    }

    const message = error instanceof Error ? error.message : "Erro desconhecido";
    return emptyResponse(`Erro ao consultar a ANTT: ${message}`, placa);
  }
}
