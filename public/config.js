/**
 * Configuração do frontend (AWS Amplify + Lambda).
 *
 * Por padrão `apiBaseUrl` fica vazio (`""`) para que as chamadas sejam relativas
 * ao mesmo domínio (ex.: https://antt.peresminuanolog.com/api/consulta/...).
 * No Amplify, configure um Rewrite 200 de `/api/<*>` para a Function URL da Lambda.
 *
 * Alternativa (sem rewrite): informe a URL completa da Lambda/API Gateway:
 *   apiBaseUrl: "https://xxxxxxxx.lambda-url.us-east-1.on.aws"
 *
 * Desenvolvimento local com Express (`npm run dev` na porta 3000):
 *   deixe vazio — o mesmo origin atende /api/...
 */
window.__ANTT_TRIC_CONFIG__ = {
  apiBaseUrl: "",
};
