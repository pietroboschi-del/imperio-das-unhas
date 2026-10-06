export function whatsappAgentApiEnabled(env:NodeJS.ProcessEnv=process.env){
  return String(env.WHATSAPP_AGENT_API_ENABLED||'false').trim().toLowerCase()==='true';
}
