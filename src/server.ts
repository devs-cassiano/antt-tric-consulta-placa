import path from "node:path";
import express from "express";
import cors from "cors";
import { consultarVeiculoPorPlaca } from "./services/anttScraper.service";

const PORT = Number(process.env.PORT) || 3000;
const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "..", "public")));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "antt-tric-consulta" });
});

app.get("/api/consulta/:placa", async (req, res) => {
  try {
    const resultado = await consultarVeiculoPorPlaca(req.params.placa);
    res.json(resultado);
  } catch (error) {
    const mensagem = error instanceof Error ? error.message : "Erro interno";
    res.status(500).json({
      sucesso: false,
      mensagem,
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
    });
  }
});

app.post("/api/consulta", async (req, res) => {
  try {
    const placa = String(req.body?.placa ?? req.query?.placa ?? "");
    const resultado = await consultarVeiculoPorPlaca(placa);
    res.json(resultado);
  } catch (error) {
    const mensagem = error instanceof Error ? error.message : "Erro interno";
    res.status(500).json({
      sucesso: false,
      mensagem,
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
    });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor ANTT TRIC em http://localhost:${PORT}`);
});
