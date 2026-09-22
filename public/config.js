/**
 * Configuração do frontend (AWS Amplify / produção).
 *
 * O Amplify Hosting serve apenas ficheiros estáticos — o Express não corre lá.
 * Defina aqui a URL base do backend (API Gateway, ECS, EC2, Railway, etc.).
 *
 * Exemplos:
 *   apiBaseUrl: "https://api.exemplo.com"
 *   apiBaseUrl: "https://xxxx.execute-api.us-east-1.amazonaws.com/prod"
 *
 * Em desenvolvimento local com `npm run dev` (Express na porta 3000),
 * deixe vazio para usar o mesmo origem (caminhos relativos /api/...).
 */
window.__ANTT_TRIC_CONFIG__ = {
  apiBaseUrl: "",
};
