export interface DadosVeiculo {
  placa: string;
  tipo: string;
  modelo: string;
  chassi_motor: string;
  ccu: string;
  marca: string;
  eixos: string;
  ano: string;
}

export interface DadosEmpresa {
  razao_social: string;
  nome_fantasia: string;
  endereco: string;
  bairro: string;
  cidade: string;
  pais_origem: string;
}

export interface Licenca {
  de_para: string;
  trafego: string;
}

export interface AnttResponse {
  sucesso: boolean;
  mensagem?: string;
  dados_veiculo: DadosVeiculo;
  dados_empresa: DadosEmpresa;
  situacao_licencas: Licenca[];
}
